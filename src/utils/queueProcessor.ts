import type { GameSequenceItem } from '../types';
import type { storageState } from './storageState';

type StorageState = typeof storageState;
type QueuedSaveTask = StorageState['syncQueueMap'] extends Map<string, infer Task> ? Task : never;
type SyncStatusPatch = Partial<StorageState['currentSyncState']>;

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

type QueueProcessorDependencies = {
  state: StorageState;
  syncStatus: {
    updateSyncStatus: (partial: SyncStatusPatch) => void;
  };
  firestore: {
    writeAndVerifyGameInFirestore: (
      game: GameSequenceItem
    ) => Promise<{ verified: boolean; remoteGame?: GameSequenceItem; errorMsg?: string }>;
  };
  storage: {
    removeQueueTaskFromIndexedDB: (gameId: string) => Promise<void>;
    saveGameToIndexedDB: (game: GameSequenceItem) => Promise<void>;
    putQueueTaskInIndexedDB: (task: QueuedSaveTask) => Promise<void>;
  };
  gallery: {
    saveGameToGalleryCache: (game: GameSequenceItem) => void;
  };
  diagnostics: {
    recordDiagnosticSaveLog: (entry: DiagnosticSaveLog) => Promise<void>;
  };
  retryPolicy: {
    backoffDelaysMs: number[];
    queueWatchdogTimeoutMs: number;
  };
  normalization: {
    getCurrentLocalTimeString: () => string;
    getCurrentLocalDateKey: () => string;
    toLightweightSequenceItem: (game: GameSequenceItem) => GameSequenceItem;
  };
};

export function createQueueProcessor(dependencies: QueueProcessorDependencies) {
  const { state } = dependencies;

  function resolveGameSyncWaiters(gameId: string, verified: boolean): void {
    const waiters = state.queueSyncWaiters.get(gameId);
    if (!waiters) return;
    state.queueSyncWaiters.delete(gameId);
    waiters.forEach((resolve) => resolve(verified));
  }

  async function processSaveQueueAndWaitForGame(gameId: string): Promise<boolean> {
    const task = state.syncQueueMap.get(gameId);
    if (!task) return true;
    if (task.status !== 'syncing' && task.nextRetryAt > Date.now()) return false;

    let resolveCompletion: (verified: boolean) => void = () => {};
    const completion = new Promise<boolean>((resolve) => {
      resolveCompletion = resolve;
    });
    const waiters = state.queueSyncWaiters.get(gameId) || new Set<(verified: boolean) => void>();
    waiters.add(resolveCompletion);
    state.queueSyncWaiters.set(gameId, waiters);

    processSaveQueue().then(() => {
      const remainingTask = state.syncQueueMap.get(gameId);
      if (!state.isProcessingQueue && remainingTask && remainingTask.status !== 'syncing') {
        resolveGameSyncWaiters(gameId, false);
      }
    }, () => resolveGameSyncWaiters(gameId, false));

    return completion;
  }

  async function retryAllFailedAndPendingGamesNow(): Promise<void> {
    if (state.retryTimerHandle) {
      clearTimeout(state.retryTimerHandle);
      state.retryTimerHandle = null;
    }
    if (state.isProcessingQueue && Date.now() - state.queueLockAcquiredAt > 8000) {
      state.isProcessingQueue = false;
      state.queueLockAcquiredAt = 0;
    }
    const now = Date.now();
    for (const [gameId, task] of Array.from(state.syncQueueMap.entries())) {
      const updated: QueuedSaveTask = {
        ...task,
        status: task.status === 'syncing' && state.isProcessingQueue ? 'syncing' : 'pending',
        nextRetryAt: now,
      };
      state.syncQueueMap.set(gameId, updated);
      void dependencies.storage.putQueueTaskInIndexedDB(updated);
    }
    dependencies.syncStatus.updateSyncStatus({});
    await processSaveQueue();
  }

  /**
   * Processes the Save Queue sequentially (1 active write at a time) WITHOUT Head-of-Line blocking.
   * - If a game fails to sync, it is marked as 'error' (Error Pendiente), its reason is recorded,
   *   an Exponential Backoff retry is scheduled for that game, and the queue IMMEDIATELY continues
   *   processing the remaining ready games in the queue.
   * - All network and IndexedDB operations have strict timeouts.
   * - Locks and activeSaveId are unconditionally released in the finally block.
   */
  async function processSaveQueue(): Promise<void> {
    if (state.isProcessingQueue) {
      // Watchdog check: if lock has been held longer than QUEUE_WATCHDOG_TIMEOUT_MS, force-release it
      if (state.queueLockAcquiredAt > 0 && Date.now() - state.queueLockAcquiredAt > dependencies.retryPolicy.queueWatchdogTimeoutMs) {
        console.warn('[SAVE_QUEUE] Liberando bloqueo estancado antes de procesar la cola.');
        state.isProcessingQueue = false;
        state.queueLockAcquiredAt = 0;
      } else {
        state.reprocessRequested = true;
        return;
      }
    }

    if (state.syncQueueMap.size === 0) {
      dependencies.syncStatus.updateSyncStatus({ status: 'synced', activeSaveId: null });
      return;
    }

    state.isProcessingQueue = true;
    state.queueLockAcquiredAt = Date.now();
    state.reprocessRequested = false;

    try {
      // Prevent infinite loops within a single queue pass by tracking attempted gameIds in this pass
      const attemptedInCurrentPass = new Set<string>();

      while (state.syncQueueMap.size > 0) {
        // Refresh lock heartbeat at the start of each item
        state.queueLockAcquiredAt = Date.now();
        const now = Date.now();

        // Select all tasks whose retry timer is due (nextRetryAt <= now) and haven't failed in this exact pass
        const readyTasks = Array.from(state.syncQueueMap.values())
          .filter((t) => t.nextRetryAt <= now && !attemptedInCurrentPass.has(t.gameId))
          .sort((a, b) => {
            // Prioritize newly created games (retryCount === 0) so an old failing game NEVER delays a new game
            if (a.retryCount !== b.retryCount) {
              return a.retryCount - b.retryCount;
            }
            return a.enqueuedAt - b.enqueuedAt;
          });

        const nextTask = readyTasks[0];
        if (!nextTask) {
          // No more tasks are ready right now; exit loop and let finally schedule the next retry timer
          break;
        }

        attemptedInCurrentPass.add(nextTask.gameId);

        // Sanitize task's sequenceSnapshot in-place in case it was enqueued before payload shrinking
        if (nextTask.game?.sequenceSnapshot?.gameSequence) {
          nextTask.game = {
            ...nextTask.game,
            sequenceSnapshot: {
              ...nextTask.game.sequenceSnapshot,
              gameSequence: nextTask.game.sequenceSnapshot.gameSequence
                .slice(0, 30)
                .map(dependencies.normalization.toLightweightSequenceItem),
            },
          };
        }

        const startMs = Date.now();
        const startTimeStr = dependencies.normalization.getCurrentLocalTimeString();

        nextTask.status = 'syncing';
        state.syncQueueMap.set(nextTask.gameId, nextTask);
        dependencies.syncStatus.updateSyncStatus({
          status: 'saving',
          activeSaveId: nextTask.gameId,
        });

        let verified = false;
        let remoteGame: GameSequenceItem | undefined = undefined;
        let errorMsg: string | undefined = undefined;

        try {
          const res = await dependencies.firestore.writeAndVerifyGameInFirestore(nextTask.game);
          verified = res.verified;
          remoteGame = res.remoteGame;
          errorMsg = res.errorMsg;
        } catch (unexpectedErr: any) {
          verified = false;
          errorMsg = unexpectedErr?.message || 'Error inesperado al sincronizar con Firestore';
        }

        const durationMs = Date.now() - startMs;
        const endTimeStr = dependencies.normalization.getCurrentLocalTimeString();

        if (verified && remoteGame) {
          // Successfully verified in Firestore! Remove from queue and update IndexedDB & memory
          resolveGameSyncWaiters(nextTask.gameId, true);
          state.syncQueueMap.delete(nextTask.gameId);
          await dependencies.storage.removeQueueTaskFromIndexedDB(nextTask.gameId);
          await dependencies.storage.saveGameToIndexedDB(remoteGame);
          dependencies.gallery.saveGameToGalleryCache(remoteGame);

          await dependencies.diagnostics.recordDiagnosticSaveLog({
            id: `log_${Date.now()}_${nextTask.gameId}`,
            gameId: nextTask.gameId,
            round: remoteGame.round,
            dailyDate: remoteGame.dailyDate || dependencies.normalization.getCurrentLocalDateKey(),
            startTime: startTimeStr,
            endTime: endTimeStr,
            durationMs,
            retryCount: nextTask.retryCount,
            result: 'SYNCED_FIRESTORE',
            errorMessage: null,
          });

          dependencies.syncStatus.updateSyncStatus({
            activeSaveId: null,
            isFirestoreReachable: true,
            lastSyncedAt: endTimeStr,
          });
        } else {
          // Failed or offline: Mark as 'error' (Error Pendiente), schedule retry for this item,
          // and CONTINUE processing the rest of the queue so NO game ever blocks subsequent games!
          const retryIndex = Math.min(nextTask.retryCount, dependencies.retryPolicy.backoffDelaysMs.length - 1);
          const delayMs = dependencies.retryPolicy.backoffDelaysMs[retryIndex];
          const reason = errorMsg || 'Error de sincronización con Firestore';
          const updatedTask: QueuedSaveTask = {
            ...nextTask,
            retryCount: nextTask.retryCount + 1,
            nextRetryAt: Date.now() + delayMs,
            lastError: reason,
            status: 'error',
          };

          state.syncQueueMap.set(nextTask.gameId, updatedTask);
          await dependencies.storage.putQueueTaskInIndexedDB(updatedTask);
          resolveGameSyncWaiters(nextTask.gameId, false);

          await dependencies.diagnostics.recordDiagnosticSaveLog({
            id: `log_${Date.now()}_${nextTask.gameId}_retry_${updatedTask.retryCount}`,
            gameId: nextTask.gameId,
            round: nextTask.game.round,
            dailyDate: nextTask.game.dailyDate || dependencies.normalization.getCurrentLocalDateKey(),
            startTime: startTimeStr,
            endTime: endTimeStr,
            durationMs,
            retryCount: updatedTask.retryCount,
            result: 'RETRY_SCHEDULED',
            errorMessage: `${reason} (Reintento en ${delayMs / 1000}s)`,
          });

          dependencies.syncStatus.updateSyncStatus({
            activeSaveId: null,
            isFirestoreReachable: false,
            lastError: `Partida #${nextTask.game.round}: ${reason}`,
            lastErrorAt: endTimeStr,
          });
          // Continue to next ready task in queue! Never break here.
        }
      }
    } catch (outerErr: any) {
      console.error('[SAVE_QUEUE] Error en bucle de sincronización:', outerErr);
      dependencies.syncStatus.updateSyncStatus({
        activeSaveId: null,
        lastError: outerErr?.message || 'Error interno en cola de sincronización',
        lastErrorAt: dependencies.normalization.getCurrentLocalTimeString(),
      });
    } finally {
      // Unconditionally release queue lock and reset activeSaveId
      state.isProcessingQueue = false;
      state.queueLockAcquiredAt = 0;

      // Ensure no task remains stuck in 'syncing' state after loop finishes
      for (const [id, task] of Array.from(state.syncQueueMap.entries())) {
        if (task.status === 'syncing') {
          state.syncQueueMap.set(id, {
            ...task,
            status: task.lastError ? 'error' : 'pending',
          });
          resolveGameSyncWaiters(id, false);
        }
      }

      // Guarantees indicator transitions to 'synced', 'pending', or 'error' — NEVER stuck in 'saving'
      dependencies.syncStatus.updateSyncStatus({ activeSaveId: null });

      // Schedule next automatic retry for the earliest remaining task in the queue
      if (state.syncQueueMap.size > 0) {
        const now = Date.now();
        const earliestRetryAt = Math.min(
          ...Array.from(state.syncQueueMap.values()).map((t) => t.nextRetryAt || now + 1000)
        );
        const waitMs = Math.max(500, earliestRetryAt - now);

        if (state.retryTimerHandle) clearTimeout(state.retryTimerHandle);
        state.retryTimerHandle = setTimeout(() => {
          state.retryTimerHandle = null;
          void processSaveQueue();
        }, waitMs);
      }

      // If a new game was enqueued while the queue was finishing up, process it immediately
      if (state.reprocessRequested) {
        state.reprocessRequested = false;
        const hasImmediate = Array.from(state.syncQueueMap.values()).some((t) => t.nextRetryAt <= Date.now());
        if (hasImmediate) {
          setTimeout(() => {
            void processSaveQueue();
          }, 50);
        }
      }
    }
  }

  return { processSaveQueue, processSaveQueueAndWaitForGame, retryAllFailedAndPendingGamesNow };
}
