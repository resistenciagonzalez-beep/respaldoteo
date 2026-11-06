import type { GameSequenceItem } from '../types';
import { safeGetItem } from './safeStorage';
import type { QueuedSaveTask, QueueTaskDiagnosticItem, SyncStatusState } from './offlinePersistenceEngine';

export const STORAGE_KEY_DELETED_GAME_IDS = 'bingo_deleted_game_ids_v1';
export const STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS = 'bingo_cleared_sequence_bar_ids_v1';

function loadStoredIdSet(storageKey: string): Set<string> {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = safeGetItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set<string>(parsed.filter((id): id is string => typeof id === 'string'));
      }
    }
  } catch {
    // Ignore malformed or unavailable persisted values, as before.
  }
  return new Set<string>();
}

/** The single owner of mutable state shared by saved game storage modules. */
export const storageState = {
  firestoreGamesMemoryStore: new Map<string, GameSequenceItem>(),
  hasSyncedWithFirestore: false,
  hasBootstrappedIndexedDB: false,

  syncQueueMap: new Map<string, QueuedSaveTask>(),
  queueSyncWaiters: new Map<string, Set<(verified: boolean) => void>>(),
  isProcessingQueue: false,
  queueLockAcquiredAt: 0,
  reprocessRequested: false,
  retryTimerHandle: null as ReturnType<typeof setTimeout> | null,
  currentSyncState: {
    status: 'synced' as SyncStatusState['status'],
    pendingCount: 0,
    syncingCount: 0,
    syncedCount: 0,
    errorCount: 0,
    activeSaveId: null,
    lastError: null,
    lastErrorAt: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isFirestoreReachable: true,
    lastSyncedAt: null,
    queueItems: [] as QueueTaskDiagnosticItem[],
  } as SyncStatusState,
  syncStatusSubscribers: new Set<(state: SyncStatusState) => void>(),

  connectionMonitorInitialized: false,
  deletedGameIdsSet: loadStoredIdSet(STORAGE_KEY_DELETED_GAME_IDS),
  clearedSequenceBarIdsSet: loadStoredIdSet(STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS),

  inFlightAutoHealIds: new Set<string>(),
  savedGamesSubscribers: new Set<(games: GameSequenceItem[]) => void>(),
  activeFirestoreUnsubscribe: null as (() => void) | null,
  cachedSortedGames: [] as GameSequenceItem[],
  isReorganizationRunning: false,
};
