import type { GameSequenceItem } from '../types';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { storageState } from './storageState';

type GalleryServiceDependencies = {
  initConnectionMonitor: () => void;
  updateSyncStatus: (partial: { isFirestoreReachable?: boolean }) => void;
  deleteGameFromIndexedDB: (gameId: string) => Promise<void>;
  saveGameToIndexedDB: (game: GameSequenceItem) => Promise<void>;
  normalizeGameFolderMetadata: (
    data: GameSequenceItem,
    fallbackId?: string
  ) => { normalizedGame: GameSequenceItem; isMisplaced: boolean; reason?: string };
  sortGamesChronologicallyDesc: (games: GameSequenceItem[]) => GameSequenceItem[];
  syncTemporaryLocalCache: (games: GameSequenceItem[]) => void;
  safeGetItem: (key: string) => string | null;
  savedGamesGalleryStorageKey: string;
  hasExplicitGameDateKey: (
    game: Partial<GameSequenceItem> | null | undefined
  ) => string | null;
};

export function createGalleryService(dependencies: GalleryServiceDependencies) {
  function ensureSharedSavedGamesListener(): void {
    if (storageState.activeFirestoreUnsubscribe || typeof window === 'undefined') return;
    dependencies.initConnectionMonitor();

    try {
      const q = collection(db, 'saved_games');
      storageState.activeFirestoreUnsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const receivedDocumentCount = snapshot.size;
          let discardedByDeletedGameIdsCount = 0;
          console.info('[GALLERY_DIAG] Firestore snapshot documents received:', receivedDocumentCount);
          dependencies.updateSyncStatus({ isFirestoreReachable: true });

          // Merge Firestore documents with any pending local offline saves so unsynced games are NEVER overwritten or lost
          const remoteIds = new Set<string>();

          snapshot.forEach((docSnap) => {
            const rawData = docSnap.data() as GameSequenceItem;
            const docKey = docSnap.id;

            // If this document was permanently deleted by an Admin, never resurrect it and ensure remote cleanup
            if (storageState.deletedGameIdsSet.has(docKey) || (rawData.id && storageState.deletedGameIdsSet.has(rawData.id))) {
              discardedByDeletedGameIdsCount += 1;
              storageState.firestoreGamesMemoryStore.delete(docKey);
              void dependencies.deleteGameFromIndexedDB(docKey);
              deleteDoc(doc(db, 'saved_games', docKey)).catch(() => {});
              return;
            }

            remoteIds.add(docKey);

            // If this document is currently queued locally with newer changes, keep the local queued version in memory
            const pendingTask = storageState.syncQueueMap.get(docKey);
            if (pendingTask && pendingTask.status !== 'synced') {
              storageState.firestoreGamesMemoryStore.set(docKey, pendingTask.game);
              return;
            }

            const { normalizedGame, isMisplaced, reason } = dependencies.normalizeGameFolderMetadata(
              { ...rawData, id: docKey },
              docKey
            );

            if (isMisplaced && !storageState.inFlightAutoHealIds.has(docKey)) {
              storageState.inFlightAutoHealIds.add(docKey);
              console.log(
                `[AUTO-CORRECTION] ${reason || 'Reorganización de subcarpeta'}. Partida ID: ${docKey}, Fecha exacta: ${normalizedGame.dailyDate}, Subcarpeta: ${normalizedGame.subfolderDay}, Ruta: ${normalizedGame.folderPath}`
              );
              setDoc(
                doc(db, 'saved_games', docKey),
                {
                  id: docKey,
                  dailyDate: normalizedGame.dailyDate,
                  subfolderDay: normalizedGame.subfolderDay,
                  folderPath: normalizedGame.folderPath,
                  operatorFolder: normalizedGame.operatorFolder,
                  operatorName: normalizedGame.operatorName,
                  dateFormatted: normalizedGame.dateFormatted,
                },
                { merge: true }
              )
                .catch((err) => {
                  console.warn(`[AUTO-CORRECTION] Error syncing auto-healed game ${docKey}:`, err);
                })
                .finally(() => {
                  setTimeout(() => storageState.inFlightAutoHealIds.delete(docKey), 3000);
                });
            }

            storageState.firestoreGamesMemoryStore.set(docKey, normalizedGame);
            void dependencies.saveGameToIndexedDB(normalizedGame);
          });

          // Remove documents that were deleted remotely (unless they are currently in the local save queue)
          for (const existingKey of Array.from(storageState.firestoreGamesMemoryStore.keys())) {
            if (!remoteIds.has(existingKey) && !storageState.syncQueueMap.has(existingKey)) {
              storageState.firestoreGamesMemoryStore.delete(existingKey);
            }
          }

          storageState.hasSyncedWithFirestore = true;
          storageState.cachedSortedGames = dependencies.sortGamesChronologicallyDesc(
            Array.from(storageState.firestoreGamesMemoryStore.values())
          );
          console.info('[GALLERY_DIAG] Documents discarded by deletedGameIdsSet:', discardedByDeletedGameIdsCount);
          console.info('[GALLERY_DIAG] firestoreGamesMemoryStore final count:', storageState.firestoreGamesMemoryStore.size);
          console.info('[GALLERY_DIAG] cachedSortedGames.length:', storageState.cachedSortedGames.length);

          dependencies.syncTemporaryLocalCache(storageState.cachedSortedGames);
          storageState.savedGamesSubscribers.forEach((sub) => {
            try {
              sub(storageState.cachedSortedGames);
            } catch (cbErr) {
              console.warn('Error in saved_games subscriber callback:', cbErr);
            }
          });
        },
        (error) => {
          console.warn('Firestore saved_games subscription error:', error);
          dependencies.updateSyncStatus({ isFirestoreReachable: false });
        }
      );
    } catch (err) {
      console.warn('Could not initialize shared saved_games subscription:', err);
    }
  }

  function subscribeToSavedGamesFirestore(
    callback: (games: GameSequenceItem[]) => void
  ): () => void {
    if (typeof window === 'undefined') {
      return () => {};
    }

    storageState.savedGamesSubscribers.add(callback);
    ensureSharedSavedGamesListener();

    if (storageState.hasSyncedWithFirestore || storageState.firestoreGamesMemoryStore.size > 0) {
      try {
        callback(
          dependencies.sortGamesChronologicallyDesc(Array.from(storageState.firestoreGamesMemoryStore.values()))
        );
      } catch (e) {
        console.warn('Initial subscriber callback error:', e);
      }
    }

    return () => {
      storageState.savedGamesSubscribers.delete(callback);
      if (storageState.savedGamesSubscribers.size === 0 && storageState.activeFirestoreUnsubscribe) {
        storageState.activeFirestoreUnsubscribe();
        storageState.activeFirestoreUnsubscribe = null;
      }
    };
  }

  function getSavedGamesGallery(): GameSequenceItem[] {
    if (storageState.hasSyncedWithFirestore || storageState.firestoreGamesMemoryStore.size > 0) {
      const memoryGames = Array.from(storageState.firestoreGamesMemoryStore.values());
      console.info('[GALLERY_DIAG] getSavedGamesGallery memory count before filtering:', memoryGames.length);
      const validMemoryGames = memoryGames.filter((g) => {
        if (!g || !g.id) {
          console.warn('[GALLERY_DIAG] Game discarded: missing id', {
            round: g?.round,
            dailyDate: g?.dailyDate,
            subfolderDay: g?.subfolderDay,
            folderPath: g?.folderPath,
          });
          return false;
        }
        if (storageState.deletedGameIdsSet.has(g.id)) {
          console.warn('[GALLERY_DIAG] Game discarded: tombstone', { id: g.id });
          return false;
        }
        if (dependencies.hasExplicitGameDateKey(g) === null) {
          console.warn('[GALLERY_DIAG] Game discarded: missing explicit date', {
            id: g.id,
            dailyDate: g.dailyDate,
            subfolderDay: g.subfolderDay,
            folderPath: g.folderPath,
          });
          return false;
        }
        if (typeof g.round !== 'number' || g.round < 1) {
          console.info('[GALLERY_DIAG] Invalid round; not discarded by the memory gallery filter:', { id: g.id, round: g.round });
        }
        return true;
      });
      console.info('[GALLERY_DIAG] getSavedGamesGallery memory count after filtering:', validMemoryGames.length);
      return dependencies.sortGamesChronologicallyDesc(validMemoryGames);
    }

    if (typeof window === 'undefined') {
      console.info('[GALLERY_DIAG] getSavedGamesGallery unavailable outside browser; before/after filtering: 0');
      return [];
    }

    try {
      const raw = dependencies.safeGetItem(dependencies.savedGamesGalleryStorageKey);
      if (raw) {
        const parsed: GameSequenceItem[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          console.info('[GALLERY_DIAG] getSavedGamesGallery local cache count before filtering:', parsed.length);
          const valid = parsed
            .filter(
              (item) => {
                if (!item || typeof item.round !== 'number' || item.round < 1) {
                  console.warn('[GALLERY_DIAG] Local cache game discarded: invalid round', { id: item?.id, round: item?.round });
                  return false;
                }
                if (item.id && storageState.deletedGameIdsSet.has(item.id)) {
                  console.warn('[GALLERY_DIAG] Local cache game discarded: tombstone', { id: item.id });
                  return false;
                }
                if (dependencies.hasExplicitGameDateKey(item) === null) {
                  console.warn('[GALLERY_DIAG] Local cache game discarded: missing explicit date', {
                    id: item.id,
                    dailyDate: item.dailyDate,
                    subfolderDay: item.subfolderDay,
                    folderPath: item.folderPath,
                  });
                  return false;
                }
                if (!item.id) {
                  console.info('[GALLERY_DIAG] Local cache game has no id; allowed by the current cache filter:', {
                    round: item.round,
                    dailyDate: item.dailyDate,
                    subfolderDay: item.subfolderDay,
                    folderPath: item.folderPath,
                  });
                }
                return true;
              }
            )
            .map((item) => dependencies.normalizeGameFolderMetadata(item, item.id).normalizedGame);
          console.info('[GALLERY_DIAG] getSavedGamesGallery local cache count after filtering:', valid.length);
          return dependencies.sortGamesChronologicallyDesc(valid);
        }
      }
      console.info('[GALLERY_DIAG] getSavedGamesGallery local cache count before filtering: 0');
      console.info('[GALLERY_DIAG] getSavedGamesGallery local cache count after filtering: 0');
    } catch (e) {
      console.error('Error reading temporary saved games cache', e);
      console.info('[GALLERY_DIAG] getSavedGamesGallery local cache after filtering: 0 (cache read/parse failed)');
    }

    return [];
  }

  function saveGameToGalleryCache(normalizedItem: GameSequenceItem): void {
    if (!normalizedItem) return;
    const { normalizedGame } = dependencies.normalizeGameFolderMetadata(normalizedItem, normalizedItem.id);
    storageState.firestoreGamesMemoryStore.set(normalizedGame.id!, normalizedGame);

    const allGames = dependencies.sortGamesChronologicallyDesc(
      Array.from(storageState.firestoreGamesMemoryStore.values())
    );
    storageState.cachedSortedGames = allGames;
    dependencies.syncTemporaryLocalCache(allGames);

    storageState.savedGamesSubscribers.forEach((sub) => {
      try {
        sub(allGames);
      } catch {
        // ignore
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: allGames.length, savedItem: normalizedGame },
        })
      );
    }
  }

  return {
    subscribeToSavedGamesFirestore,
    getSavedGamesGallery,
    saveGameToGalleryCache,
  };
}
