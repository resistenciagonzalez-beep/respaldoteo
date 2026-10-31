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
          dependencies.updateSyncStatus({ isFirestoreReachable: true });

          // Merge Firestore documents with any pending local offline saves so unsynced games are NEVER overwritten or lost
          const remoteIds = new Set<string>();

          snapshot.forEach((docSnap) => {
            const rawData = docSnap.data() as GameSequenceItem;
            const docKey = docSnap.id;

            // If this document was permanently deleted by an Admin, never resurrect it and ensure remote cleanup
            if (storageState.deletedGameIdsSet.has(docKey) || (rawData.id && storageState.deletedGameIdsSet.has(rawData.id))) {
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
      return dependencies.sortGamesChronologicallyDesc(
        Array.from(storageState.firestoreGamesMemoryStore.values()).filter(
          (g) => g && g.id && !storageState.deletedGameIdsSet.has(g.id) && dependencies.hasExplicitGameDateKey(g) !== null
        )
      );
    }

    if (typeof window === 'undefined') return [];

    try {
      const raw = dependencies.safeGetItem(dependencies.savedGamesGalleryStorageKey);
      if (raw) {
        const parsed: GameSequenceItem[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed
            .filter(
              (item) =>
                item &&
                typeof item.round === 'number' &&
                item.round >= 1 &&
                (!item.id || !storageState.deletedGameIdsSet.has(item.id)) &&
                dependencies.hasExplicitGameDateKey(item) !== null
            )
            .map((item) => dependencies.normalizeGameFolderMetadata(item, item.id).normalizedGame);
          return dependencies.sortGamesChronologicallyDesc(valid);
        }
      }
    } catch (e) {
      console.error('Error reading temporary saved games cache', e);
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
