import type { GameSequenceItem } from '../types';
import type { storageState } from './storageState';

type GameMaintenanceState = typeof storageState;
type FirestoreApi = Pick<typeof import('firebase/firestore'), 'doc' | 'setDoc' | 'deleteDoc' | 'collection' | 'getDocs'>;

type GameMaintenanceDependencies = {
  state: GameMaintenanceState;
  firestore: {
    db: any;
    doc: FirestoreApi['doc'];
    setDoc: FirestoreApi['setDoc'];
    deleteDoc: FirestoreApi['deleteDoc'];
    collection: FirestoreApi['collection'];
    getDocs: FirestoreApi['getDocs'];
  };
  storage: {
    deleteGameFromIndexedDB: (gameId: string) => Promise<void>;
    saveGameToIndexedDB: (game: GameSequenceItem) => Promise<void>;
  };
  normalization: {
    normalizeGameFolderMetadata: (
      game: GameSequenceItem,
      fallbackId?: string
    ) => { normalizedGame: GameSequenceItem; isMisplaced: boolean; reason?: string };
    sortGamesChronologicallyDesc: (games: GameSequenceItem[]) => GameSequenceItem[];
  };
  cache: {
    syncTemporaryLocalCache: (games: GameSequenceItem[]) => void;
  };
};

export function createGameMaintenanceService(dependencies: GameMaintenanceDependencies) {
  const { state } = dependencies;
  const { db, doc, setDoc, deleteDoc, collection, getDocs } = dependencies.firestore;
  const { deleteGameFromIndexedDB, saveGameToIndexedDB } = dependencies.storage;
  const { normalizeGameFolderMetadata, sortGamesChronologicallyDesc } = dependencies.normalization;
  const { syncTemporaryLocalCache } = dependencies.cache;

  async function reorganizeAndHealAllStoredGames(): Promise<{
    totalChecked: number;
    reorganizedCount: number;
    details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }>;
  }> {
    const details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }> = [];
    if (state.isReorganizationRunning) {
      return {
        totalChecked: state.firestoreGamesMemoryStore.size,
        reorganizedCount: 0,
        details,
      };
    }

    state.isReorganizationRunning = true;
    let totalChecked = 0;
    let reorganizedCount = 0;

    try {
      const snap = await getDocs(collection(db, 'saved_games'));
      for (const docSnap of snap.docs) {
        const rawData = docSnap.data() as GameSequenceItem;
        const docKey = docSnap.id;
        if (state.deletedGameIdsSet.has(docKey) || (rawData.id && state.deletedGameIdsSet.has(rawData.id))) {
          state.firestoreGamesMemoryStore.delete(docKey);
          void deleteGameFromIndexedDB(docKey);
          deleteDoc(doc(db, 'saved_games', docKey)).catch(() => {});
          continue;
        }
        totalChecked++;
        const { normalizedGame, isMisplaced, reason } = normalizeGameFolderMetadata(
          { ...rawData, id: docKey },
          docKey
        );

        if (isMisplaced) {
          reorganizedCount++;
          const oldSubfolder = rawData.subfolderDay || rawData.folderPath || 'desconocida';
          const newSubfolder = normalizedGame.subfolderDay || normalizedGame.dailyDate || 'desconocida';

          details.push({
            id: docKey,
            round: normalizedGame.round,
            oldSubfolder,
            newSubfolder,
            reason: reason || 'Reorganización a fecha exacta',
          });

          console.log(
            `[REORGANIZACION_SUBCARPETAS] Partida #${normalizedGame.round} (${docKey}) movida de subcarpeta "${oldSubfolder}" a "${newSubfolder}" por fecha exacta.`
          );

          state.inFlightAutoHealIds.add(docKey);
          await setDoc(
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
          ).finally(() => {
            setTimeout(() => state.inFlightAutoHealIds.delete(docKey), 3000);
          });

          state.firestoreGamesMemoryStore.set(docKey, normalizedGame);
          await saveGameToIndexedDB(normalizedGame);
        } else {
          state.firestoreGamesMemoryStore.set(docKey, normalizedGame);
        }
      }

      const sortedGames = sortGamesChronologicallyDesc(
        Array.from(state.firestoreGamesMemoryStore.values())
      );
      state.cachedSortedGames = sortedGames;
      syncTemporaryLocalCache(sortedGames);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('bingo_saved_games_updated', {
            detail: { total: sortedGames.length, reorganizedCount },
          })
        );
      }
    } catch (err) {
      console.error('Error during reorganizeAndHealAllStoredGames:', err);
    } finally {
      state.isReorganizationRunning = false;
    }

    return { totalChecked, reorganizedCount, details };
  }

  return { reorganizeAndHealAllStoredGames };
}
