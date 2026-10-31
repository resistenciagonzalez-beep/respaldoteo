import type { storageState } from './storageState';

type SyncStatusState = typeof storageState.currentSyncState;
type SyncStatusType = SyncStatusState['status'];
type QueueTaskDiagnosticItem = SyncStatusState['queueItems'][number];

type SyncStatusDependencies = {
  state: typeof storageState;
};

export function createSyncStatus(dependencies: SyncStatusDependencies) {
  const { state } = dependencies;

  function notifySyncStatusSubscribers(): void {
    const snapshot: SyncStatusState = {
      ...state.currentSyncState,
      queueItems: [...state.currentSyncState.queueItems],
    };
    state.syncStatusSubscribers.forEach((cb) => {
      try {
        cb(snapshot);
      } catch (err) {
        console.warn('Error in syncStatusSubscriber:', err);
      }
    });
  }

  function computeQueueDiagnostics(): {
    pendingCount: number;
    syncingCount: number;
    syncedCount: number;
    errorCount: number;
    queueItems: QueueTaskDiagnosticItem[];
    derivedStatus: SyncStatusType;
  } {
    const tasks = Array.from(state.syncQueueMap.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    let pendingCount = 0;
    let syncingCount = 0;
    let errorCount = 0;

    const queueItems: QueueTaskDiagnosticItem[] = tasks.map((t) => {
      const effectiveStatus =
        t.status === 'syncing' && (!state.isProcessingQueue || state.currentSyncState.activeSaveId !== t.gameId)
          ? t.lastError
            ? 'error'
            : 'pending'
          : t.status;

      if (effectiveStatus === 'syncing') syncingCount++;
      else if (effectiveStatus === 'error') errorCount++;
      else if (effectiveStatus === 'pending') pendingCount++;

      return {
        gameId: t.gameId,
        round: t.game?.round || 1,
        dailyDate: t.game?.dailyDate || '',
        operatorName: t.game?.operatorName || 'Operadora',
        status: effectiveStatus,
        retryCount: t.retryCount,
        lastError: t.lastError,
        nextRetryAt: t.nextRetryAt,
        enqueuedAt: t.enqueuedAt,
      };
    });

    let syncedCount = 0;
    state.firestoreGamesMemoryStore.forEach((g, id) => {
      if (g && !state.deletedGameIdsSet.has(id) && !state.syncQueueMap.has(id)) {
        syncedCount++;
      }
    });

    let derivedStatus: SyncStatusType = 'synced';
    if (state.isProcessingQueue && state.currentSyncState.activeSaveId && syncingCount > 0) {
      derivedStatus = 'saving';
    } else if (errorCount > 0) {
      derivedStatus = 'error';
    } else if (pendingCount > 0 || tasks.length > 0) {
      derivedStatus = 'pending';
    } else {
      derivedStatus = 'synced';
    }

    return {
      pendingCount,
      syncingCount,
      syncedCount,
      errorCount,
      queueItems,
      derivedStatus,
    };
  }

  function updateSyncStatus(partial: Partial<SyncStatusState>): void {
    if ('activeSaveId' in partial) {
      state.currentSyncState.activeSaveId = partial.activeSaveId ?? null;
    }
    if ('lastError' in partial) {
      state.currentSyncState.lastError = partial.lastError ?? null;
    }
    if ('lastErrorAt' in partial) {
      state.currentSyncState.lastErrorAt = partial.lastErrorAt ?? null;
    }
    if ('isOnline' in partial && typeof partial.isOnline === 'boolean') {
      state.currentSyncState.isOnline = partial.isOnline;
    }
    if ('isFirestoreReachable' in partial && typeof partial.isFirestoreReachable === 'boolean') {
      state.currentSyncState.isFirestoreReachable = partial.isFirestoreReachable;
    }
    if ('lastSyncedAt' in partial) {
      state.currentSyncState.lastSyncedAt = partial.lastSyncedAt ?? null;
    }

    const diag = computeQueueDiagnostics();

    state.currentSyncState = {
      ...state.currentSyncState,
      pendingCount: diag.pendingCount,
      syncingCount: diag.syncingCount,
      syncedCount: diag.syncedCount,
      errorCount: diag.errorCount,
      queueItems: diag.queueItems,
      status: partial.status || diag.derivedStatus,
    };

    // Safety guarantee: never stay in 'saving' if queue is not actively processing a task
    if (state.currentSyncState.status === 'saving' && (!state.isProcessingQueue || !state.currentSyncState.activeSaveId)) {
      state.currentSyncState.status = diag.errorCount > 0 ? 'error' : diag.pendingCount > 0 ? 'pending' : 'synced';
    }

    notifySyncStatusSubscribers();
  }

  function getSyncStatusState(): SyncStatusState {
    const diag = computeQueueDiagnostics();
    return {
      ...state.currentSyncState,
      pendingCount: diag.pendingCount,
      syncingCount: diag.syncingCount,
      syncedCount: diag.syncedCount,
      errorCount: diag.errorCount,
      queueItems: diag.queueItems,
    };
  }

  function subscribeToSyncStatus(callback: (state: SyncStatusState) => void): () => void {
    state.syncStatusSubscribers.add(callback);
    try {
      callback(getSyncStatusState());
    } catch (e) {
      console.warn('Initial sync status callback error:', e);
    }
    return () => {
      state.syncStatusSubscribers.delete(callback);
    };
  }

  return { updateSyncStatus, getSyncStatusState, subscribeToSyncStatus };
}
