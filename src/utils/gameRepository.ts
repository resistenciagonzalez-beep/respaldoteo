import type { BingoMode, GameSequenceItem, GameSequenceSnapshot } from '../types';
import type { storageState } from './storageState';

type StorageState = typeof storageState;

type QueuedSaveTask = {
  gameId: string;
  game: GameSequenceItem;
  enqueuedAt: number;
  retryCount: number;
  nextRetryAt: number;
  lastError: string | null;
  status: 'pending' | 'syncing' | 'synced' | 'error';
};

type DiagnosticSaveLog = {
  id: string;
  gameId: string;
  round: number;
  dailyDate: string;
  startTime: string;
  endTime: string | null;
  durationMs: number;
  retryCount: number;
  result: 'SAVED_LOCAL' | 'SYNCED_FIRESTORE' | 'RETRY_SCHEDULED' | 'ERROR';
  errorMessage: string | null;
};

type SyncStatusPatch = {
  status?: 'synced' | 'saving' | 'pending' | 'error';
  activeSaveId?: string | null;
};

type GameRepositoryDependencies = {
  normalization: {
    buildCanonicalGameId: (
      operatorFolder: string,
      dailyDate: string,
      mode: BingoMode,
      round: number,
      operatorUid?: string
    ) => string;
    getCurrentLocalTimeString: () => string;
    getGameNormalizedDateKey: (game: GameSequenceItem) => string;
    getGameLines: (game: GameSequenceItem) => number;
    parseDateStringToDateKey: (value: string) => string | null;
    sanitizeOperatorFolderName: (name?: string) => string;
    toLightweightSequenceItem: (game: GameSequenceItem) => GameSequenceItem;
  };
  storage: {
    state: StorageState;
    deleteGameFromIndexedDB: (gameId: string) => Promise<void>;
    persistClearedSequenceBarIds: () => void;
    persistDeletedGameIds: () => void;
    putQueueTaskInIndexedDB: (task: QueuedSaveTask) => Promise<void>;
    saveGameToIndexedDB: (game: GameSequenceItem) => Promise<void>;
  };
  gallery: {
    getSavedGamesGallery: () => GameSequenceItem[];
    saveGameToGalleryCache: (game: GameSequenceItem) => void;
  };
  queue: {
    initConnectionMonitor: () => void;
    processSaveQueue: () => Promise<void>;
    updateSyncStatus: (partial: SyncStatusPatch) => void;
  };
  diagnostics: {
    recordDiagnosticSaveLog: (entry: DiagnosticSaveLog) => Promise<void>;
  };
  firestore: {
    deleteDuplicateGameDocument: (gameId: string) => Promise<unknown>;
  };
};

type SaveGameResult = {
  success: boolean;
  verified: boolean;
  savedLocally: boolean;
  game: GameSequenceItem;
};

export function createGameRepository(dependencies: GameRepositoryDependencies) {
  const { normalization, storage, gallery, queue, diagnostics, firestore } = dependencies;
  const { state } = storage;

  function resolveExistingOrCanonicalDocId(
    item: GameSequenceItem,
    operatorFolder: string,
    dailyDate: string,
    mode: BingoMode,
    validRound: number
  ): { docId: string; duplicateIdsToClean: string[] } {
    const existingGames = gallery.getSavedGamesGallery();
    const itemUid = item.operatorUid && item.operatorUid !== 'anon' ? item.operatorUid : null;

    const matchingGames = existingGames.filter((g) => {
      if (!g) return false;
      const gDate = normalization.getGameNormalizedDateKey(g);
      const gOp = normalization.sanitizeOperatorFolderName(g.operatorFolder || g.operatorName);
      const gMode: BingoMode = g.mode || (g.sheetType === 'traditional-90' ? '90' : '75');
      const gUid = g.operatorUid && g.operatorUid !== 'anon' ? g.operatorUid : null;

      if (itemUid && gUid && itemUid !== gUid) {
        return false;
      }

      return (
        gDate === dailyDate &&
        gOp === operatorFolder &&
        gMode === mode &&
        g.round === validRound
      );
    });

    const canonicalId = normalization.buildCanonicalGameId(
      operatorFolder,
      dailyDate,
      mode,
      validRound,
      item.operatorUid
    );

    const hasExplicitExistingId =
      Boolean(item.id) && state.firestoreGamesMemoryStore.has(item.id!);

    let chosenId: string;
    if (hasExplicitExistingId) {
      chosenId = item.id!;
    } else if (matchingGames.length > 0 && matchingGames[0].id) {
      chosenId = matchingGames[0].id;
    } else if (item.id && !/^game_\d{10,}_\d+$/.test(item.id)) {
      chosenId = item.id;
    } else {
      chosenId = canonicalId;
    }

    const duplicateIdsToClean = matchingGames
      .map((g) => g.id)
      .filter((id): id is string => Boolean(id && id !== chosenId));

    return { docId: chosenId, duplicateIdsToClean };
  }

  async function saveGameUnified(item: GameSequenceItem): Promise<SaveGameResult> {
    if (!item) {
      throw new Error('No se puede guardar una partida vacía');
    }

    queue.initConnectionMonitor();
    const startMs = Date.now();
    const startTimeStr = normalization.getCurrentLocalTimeString();

    // 1. Single source of truth for date: dailyDate (YYYY-MM-DD)
    const dailyDate = normalization.getGameNormalizedDateKey(item);
    const operatorName = (item.operatorName || 'Operadora Principal').trim();
    const operatorFolder = normalization.sanitizeOperatorFolderName(item.operatorFolder || operatorName);
    const subfolderDay = dailyDate;
    const folderPath = `${operatorFolder}/${subfolderDay}`;

    const mode: BingoMode = item.mode || (item.sheetType === 'traditional-90' ? '90' : '75');
    const validRound = typeof item.round === 'number' && item.round >= 1 ? item.round : 1;

    // 2. Preserve existing document ID strictly to prevent duplicates
    const { docId, duplicateIdsToClean } = resolveExistingOrCanonicalDocId(
      item,
      operatorFolder,
      dailyDate,
      mode,
      validRound
    );

    const exactLines = normalization.getGameLines(item);
    let formattedDate = item.dateFormatted;
    if (!formattedDate || !normalization.parseDateStringToDateKey(formattedDate)) {
      const parts = dailyDate.split('-');
      formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : new Date().toLocaleDateString('es-ES');
    }
    const exactTimestamp =
      item.timestamp && /^\d{1,2}:\d{2}(:\d{2})?$/.test(item.timestamp.trim())
        ? (item.timestamp.trim().split(':').length === 2 ? `${item.timestamp.trim()}:00` : item.timestamp.trim())
        : normalization.getCurrentLocalTimeString();

    const cleanSequenceSnapshot: GameSequenceSnapshot | undefined = item.sequenceSnapshot
      ? {
          ...item.sequenceSnapshot,
          gameSequence: Array.isArray(item.sequenceSnapshot.gameSequence)
            ? item.sequenceSnapshot.gameSequence.slice(0, 30).map(normalization.toLightweightSequenceItem)
            : undefined,
        }
      : undefined;

    const normalizedItem: GameSequenceItem = {
      ...item,
      id: docId,
      round: validRound,
      mode,
      dailyDate,
      subfolderDay,
      operatorFolder,
      folderPath,
      operatorName,
      operatorUid: item.operatorUid || 'anon',
      operatorEmail: item.operatorEmail || '',
      dateFormatted: formattedDate,
      timestamp: exactTimestamp,
      totalLinesPlayed: exactLines,
      sequenceSnapshot: cleanSequenceSnapshot,
    };

    // 3. STEP 1 OF OFFLINE-FIRST: Save immediately to IndexedDB & Memory Store
    if (state.deletedGameIdsSet.has(docId)) {
      state.deletedGameIdsSet.delete(docId);
      storage.persistDeletedGameIds();
    }
    if (state.clearedSequenceBarIdsSet.has(docId)) {
      state.clearedSequenceBarIdsSet.delete(docId);
      storage.persistClearedSequenceBarIds();
    }
    await storage.saveGameToIndexedDB(normalizedItem);
    gallery.saveGameToGalleryCache(normalizedItem);

    void diagnostics.recordDiagnosticSaveLog({
      id: `log_local_${Date.now()}_${docId}`,
      gameId: docId,
      round: validRound,
      dailyDate,
      startTime: startTimeStr,
      endTime: normalization.getCurrentLocalTimeString(),
      durationMs: Date.now() - startMs,
      retryCount: 0,
      result: 'SAVED_LOCAL',
      errorMessage: null,
    });

    // 4. STEP 2 OF OFFLINE-FIRST: Add to Persistent Sequential Save Queue
    const existingTask = state.syncQueueMap.get(docId);
    const queueTask: QueuedSaveTask = {
      gameId: docId,
      game: normalizedItem,
      enqueuedAt: existingTask ? existingTask.enqueuedAt : Date.now(),
      retryCount: 0,
      nextRetryAt: Date.now(),
      lastError: null,
      status: 'pending',
    };

    state.syncQueueMap.set(docId, queueTask);
    await storage.putQueueTaskInIndexedDB(queueTask);
    queue.updateSyncStatus({});

    // Clean up any legacy duplicate IDs
    if (duplicateIdsToClean.length > 0) {
      for (const dupId of duplicateIdsToClean) {
        state.firestoreGamesMemoryStore.delete(dupId);
        void storage.deleteGameFromIndexedDB(dupId);
        firestore.deleteDuplicateGameDocument(dupId).catch(() => {});
      }
    }

    // 5. STEP 3 OF OFFLINE-FIRST: Trigger the Sequential Save Queue
    // Wait up to 1.2s for fast cloud verification; if network is slow or offline,
    // return immediately so "Nueva Partida" never lags while processSaveQueue continues in background.
    const queuePromise = queue.processSaveQueue();
    let raceTimer: ReturnType<typeof setTimeout> | null = null;
    const fastTimeout = new Promise<void>((resolve) => {
      raceTimer = setTimeout(resolve, 1200);
    });
    await Promise.race([queuePromise, fastTimeout]).finally(() => {
      if (raceTimer !== null) clearTimeout(raceTimer);
    });

    const isAlreadySynced = !state.syncQueueMap.has(docId);
    const latestGame = state.firestoreGamesMemoryStore.get(docId) || normalizedItem;

    return {
      success: true,
      verified: isAlreadySynced,
      savedLocally: true,
      game: latestGame,
    };
  }

  async function updateGameUnified(item: GameSequenceItem): Promise<SaveGameResult> {
    return saveGameUnified(item);
  }

  return { saveGameUnified, updateGameUnified };
}
