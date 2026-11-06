import type { GameSequenceItem } from '../types';
import type { storageState } from './storageState';

type OfflineFirstState = typeof storageState;
type QueuedSaveTask = OfflineFirstState['syncQueueMap'] extends Map<string, infer Task> ? Task : never;
type SyncStatusPatch = Partial<OfflineFirstState['currentSyncState']>;

type FirestoreApi = Pick<typeof import('firebase/firestore'), 'doc' | 'setDoc' | 'getDoc'>;

type OfflineFirstEngineDependencies<FirestorePayload> = {
  state: OfflineFirstState;
  storage: {
    migrateAndHydrateStorageFromIndexedDB: () => Promise<void>;
    safeGetItem: (key: string) => string | null;
    getAllGamesFromIndexedDB: () => Promise<GameSequenceItem[]>;
    deleteGameFromIndexedDB: (gameId: string) => Promise<void>;
    getAllQueueTasksFromIndexedDB: () => Promise<QueuedSaveTask[]>;
  };
  normalization: {
    normalizeGameFolderMetadata: (
      game: GameSequenceItem,
      fallbackId?: string
    ) => { normalizedGame: GameSequenceItem };
    sortGamesChronologicallyDesc: (games: GameSequenceItem[]) => GameSequenceItem[];
  };
  syncStatus: {
    updateSyncStatus: (partial: SyncStatusPatch) => void;
  };
  queue: {
    processSaveQueue: () => Promise<void>;
  };
  gameDays: {
    upsertSavedGame: (game: GameSequenceItem) => Promise<void>;
  };
  firestore: {
    db: any;
    doc: FirestoreApi['doc'];
    setDoc: FirestoreApi['setDoc'];
    getDoc: FirestoreApi['getDoc'];
    withTimeout: <T>(promise: Promise<T>, timeoutMs: number, operationName: string) => Promise<T>;
    buildFirestorePayloadFromItem: (game: GameSequenceItem) => FirestorePayload;
  };
  storageKeys: {
    deletedGameIds: string;
    clearedSequenceBarIds: string;
  };
};

export function createOfflineFirstEngine<FirestorePayload>(
  dependencies: OfflineFirstEngineDependencies<FirestorePayload>
) {
  const { state } = dependencies;

  async function bootstrapOfflineFirstEngine(): Promise<void> {
    if (state.hasBootstrappedIndexedDB || typeof window === 'undefined') return;
    state.hasBootstrappedIndexedDB = true;

    try {
      // 0. Ensure automatic migration from localStorage to IndexedDB and KV hydration finishes first
      await dependencies.storage.migrateAndHydrateStorageFromIndexedDB();

      // Hydrate deleted/cleared sets from IndexedDB KV store if present
      try {
        const delRaw = dependencies.storage.safeGetItem(dependencies.storageKeys.deletedGameIds);
        if (delRaw) {
          const parsed = JSON.parse(delRaw);
          if (Array.isArray(parsed)) {
            parsed.forEach((id) => {
              if (typeof id === 'string') state.deletedGameIdsSet.add(id);
            });
          }
        }
        const clrRaw = dependencies.storage.safeGetItem(dependencies.storageKeys.clearedSequenceBarIds);
        if (clrRaw) {
          const parsed = JSON.parse(clrRaw);
          if (Array.isArray(parsed)) {
            parsed.forEach((id) => {
              if (typeof id === 'string') state.clearedSequenceBarIdsSet.add(id);
            });
          }
        }
      } catch {
        // ignore
      }

      // 1. Load all locally saved games from IndexedDB into memory store immediately
      const localGames = await dependencies.storage.getAllGamesFromIndexedDB();
      for (const g of localGames) {
        if (g && g.id) {
          if (state.deletedGameIdsSet.has(g.id)) {
            void dependencies.storage.deleteGameFromIndexedDB(g.id);
            continue;
          }
          const { normalizedGame } = dependencies.normalization.normalizeGameFolderMetadata(g, g.id);
          if (state.deletedGameIdsSet.has(normalizedGame.id!)) {
            void dependencies.storage.deleteGameFromIndexedDB(normalizedGame.id!);
            continue;
          }
          if (!state.firestoreGamesMemoryStore.has(normalizedGame.id!)) {
            state.firestoreGamesMemoryStore.set(normalizedGame.id!, normalizedGame);
          }
        }
      }

      if (localGames.length > 0) {
        state.cachedSortedGames = dependencies.normalization.sortGamesChronologicallyDesc(
          Array.from(state.firestoreGamesMemoryStore.values())
        );
        state.savedGamesSubscribers.forEach((sub) => {
          try {
            sub(state.cachedSortedGames);
          } catch {
            // ignore
          }
        });
      }

      // 2. Load any pending tasks from IndexedDB Save Queue and resume processing
      const pendingTasks = await dependencies.storage.getAllQueueTasksFromIndexedDB();
      for (const task of pendingTasks) {
        if (task && task.gameId && task.game) {
          state.syncQueueMap.set(task.gameId, {
            ...task,
            status: 'pending',
            nextRetryAt: Date.now(),
          });
          const { normalizedGame } = dependencies.normalization.normalizeGameFolderMetadata(task.game, task.gameId);
          state.firestoreGamesMemoryStore.set(task.gameId, normalizedGame);
        }
      }

      dependencies.syncStatus.updateSyncStatus({});
      if (state.syncQueueMap.size > 0) {
        void dependencies.queue.processSaveQueue();
      }
    } catch (err) {
      console.warn('[OFFLINE_ENGINE] Bootstrap warning:', err);
    }
  }

  async function writeAndVerifyGameInFirestore(
    game: GameSequenceItem
  ): Promise<{ verified: boolean; remoteGame?: GameSequenceItem; errorMsg?: string }> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { verified: false, errorMsg: 'Sin conexión a Internet' };
    }

    const docId = game.id!;
    const docRef = dependencies.firestore.doc(dependencies.firestore.db, 'saved_games', docId);

    let sanitizedPayload: FirestorePayload;
    try {
      sanitizedPayload = dependencies.firestore.buildFirestorePayloadFromItem(game);
    } catch (serializeErr: any) {
      return {
        verified: false,
        errorMsg: `Error preparando datos de partida: ${serializeErr?.message || 'Payload inválido'}`,
      };
    }

    try {
      await dependencies.firestore.withTimeout(
        dependencies.firestore.setDoc(docRef, sanitizedPayload, { merge: true }),
        8000,
        `Firestore setDoc (${docId})`
      );

      const snap = await dependencies.firestore.withTimeout(
        dependencies.firestore.getDoc(docRef),
        6000,
        `Firestore getDoc (${docId})`
      );

      if (!snap.exists()) {
        return { verified: false, errorMsg: 'El documento no existe en Firestore tras la escritura' };
      }

      const remoteData = snap.data() as GameSequenceItem;
      const isIdValid = remoteData.id === docId || snap.id === docId;
      const isDateValid = remoteData.dailyDate === game.dailyDate;
      const isSubfolderValid = remoteData.subfolderDay === game.subfolderDay;
      const isRoundValid = remoteData.round === game.round;
      const isOperatorValid = remoteData.operatorName === game.operatorName;

      if (isIdValid && isDateValid && isSubfolderValid && isRoundValid && isOperatorValid) {
        const mergedVerified: GameSequenceItem = {
          ...game,
          ...remoteData,
          id: docId,
          dailyDate: game.dailyDate,
          subfolderDay: game.subfolderDay,
          operatorFolder: game.operatorFolder,
          folderPath: game.folderPath,
          timestamp: game.timestamp,
        };
        await dependencies.gameDays.upsertSavedGame(mergedVerified);
        return { verified: true, remoteGame: mergedVerified };
      }

      return {
        verified: false,
        errorMsg: `Verificación fallida: los datos leídos de Firestore no coinciden para ${docId}`,
      };
    } catch (err: any) {
      return {
        verified: false,
        errorMsg: err?.message || 'Error de comunicación con Firestore',
      };
    }
  }

  return { bootstrapOfflineFirstEngine, writeAndVerifyGameInFirestore };
}
