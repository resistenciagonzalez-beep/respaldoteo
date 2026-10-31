import {
  buildCanonicalGameId,
  extractCurrentSubfolderDate,
  extractGameExactDate,
  getCurrentLocalDateKey,
  getCurrentLocalTimeString,
  getGameLines,
  getGameNormalizedDateKey,
  getOperatorStorageKey,
  hasExplicitGameDateKey,
  isGameOfOperator,
  normalizeGameFolderMetadata,
  parseDateStringToDateKey,
  sanitizeOperatorFolderName,
  sortGamesChronologicallyDesc,
} from './gameNormalization';
export {
  buildCanonicalGameId,
  extractCurrentSubfolderDate,
  extractGameExactDate,
  getCurrentLocalDateKey,
  getCurrentLocalTimeString,
  getGameLines,
  getGameNormalizedDateKey,
  getOperatorStorageKey,
  hasExplicitGameDateKey,
  isGameOfOperator,
  normalizeGameFolderMetadata,
  parseDateStringToDateKey,
  sanitizeOperatorFolderName,
} from './gameNormalization';

import {
  GameSequenceItem,
  SheetViewType,
  BingoMode,
  BingoSheetData,
  Traditional90SheetData,
  AppUser,
  PlayerSummarySnapshotItem,
  GameSequenceSnapshot,
} from '../types';
import {
  doc,
  setDoc,
  serverTimestamp,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  getDoc,
  FieldValue,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  getKeysByPrefix,
  sanitizeSequenceForStorage,
  toLightweightSequenceItem,
  migrateAndHydrateStorageFromIndexedDB,
} from './safeStorage';
import {
  SyncStatusState,
  SyncStatusType,
  QueuedSaveTask,
  QueueTaskDiagnosticItem,
  BACKOFF_DELAYS_MS,
  withTimeout,
  saveGameToIndexedDB,
  getAllGamesFromIndexedDB,
  deleteGameFromIndexedDB,
  putQueueTaskInIndexedDB,
  removeQueueTaskFromIndexedDB,
  getAllQueueTasksFromIndexedDB,
  recordDiagnosticSaveLog,
  getDiagnosticSaveLogs,
} from './offlinePersistenceEngine';
import {
  STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS,
  STORAGE_KEY_DELETED_GAME_IDS,
  storageState,
} from './storageState';
import {
  subscribeToActivityLogsCentralized,
  subscribeToUsersCentralized,
  updateUserFieldsCentralized as updateUserFieldsCentralizedService,
} from './usersService';

export { getDiagnosticSaveLogs };
export { subscribeToActivityLogsCentralized, subscribeToUsersCentralized };
export type { SyncStatusState, SyncStatusType, QueueTaskDiagnosticItem };

export const STORAGE_KEY_SAVED_GAMES_GALLERY = 'bingo_saved_games_gallery';
export const STORAGE_KEY_SEQUENCE_75 = 'bingo_game_sequence_history';
export const STORAGE_KEY_SEQUENCE_90 = 'bingo_90_game_sequence_history';

/**
 * Authoritative Offline-First + Firestore synchronized in-memory store.
 * IndexedDB is the primary local persistence engine (never loses a game even offline).
 * Firestore is the real-time cloud synchronization & backup layer.
 */

// ============================================================================
// SYNC STATUS, CONNECTION MONITOR & SAVE QUEUE STATE
// ============================================================================

const QUEUE_WATCHDOG_TIMEOUT_MS = 20000;


function notifySyncStatusSubscribers(): void {
  const snapshot: SyncStatusState = {
    ...storageState.currentSyncState,
    queueItems: [...storageState.currentSyncState.queueItems],
  };
  storageState.syncStatusSubscribers.forEach((cb) => {
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
  const tasks = Array.from(storageState.syncQueueMap.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  let pendingCount = 0;
  let syncingCount = 0;
  let errorCount = 0;

  const queueItems: QueueTaskDiagnosticItem[] = tasks.map((t) => {
    const effectiveStatus =
      t.status === 'syncing' && (!storageState.isProcessingQueue || storageState.currentSyncState.activeSaveId !== t.gameId)
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
  storageState.firestoreGamesMemoryStore.forEach((g, id) => {
    if (g && !storageState.deletedGameIdsSet.has(id) && !storageState.syncQueueMap.has(id)) {
      syncedCount++;
    }
  });

  let derivedStatus: SyncStatusType = 'synced';
  if (storageState.isProcessingQueue && storageState.currentSyncState.activeSaveId && syncingCount > 0) {
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
    storageState.currentSyncState.activeSaveId = partial.activeSaveId ?? null;
  }
  if ('lastError' in partial) {
    storageState.currentSyncState.lastError = partial.lastError ?? null;
  }
  if ('lastErrorAt' in partial) {
    storageState.currentSyncState.lastErrorAt = partial.lastErrorAt ?? null;
  }
  if ('isOnline' in partial && typeof partial.isOnline === 'boolean') {
    storageState.currentSyncState.isOnline = partial.isOnline;
  }
  if ('isFirestoreReachable' in partial && typeof partial.isFirestoreReachable === 'boolean') {
    storageState.currentSyncState.isFirestoreReachable = partial.isFirestoreReachable;
  }
  if ('lastSyncedAt' in partial) {
    storageState.currentSyncState.lastSyncedAt = partial.lastSyncedAt ?? null;
  }

  const diag = computeQueueDiagnostics();

  storageState.currentSyncState = {
    ...storageState.currentSyncState,
    pendingCount: diag.pendingCount,
    syncingCount: diag.syncingCount,
    syncedCount: diag.syncedCount,
    errorCount: diag.errorCount,
    queueItems: diag.queueItems,
    status: partial.status || diag.derivedStatus,
  };

  // Safety guarantee: never stay in 'saving' if queue is not actively processing a task
  if (storageState.currentSyncState.status === 'saving' && (!storageState.isProcessingQueue || !storageState.currentSyncState.activeSaveId)) {
    storageState.currentSyncState.status = diag.errorCount > 0 ? 'error' : diag.pendingCount > 0 ? 'pending' : 'synced';
  }

  notifySyncStatusSubscribers();
}

export function getSyncStatusState(): SyncStatusState {
  const diag = computeQueueDiagnostics();
  return {
    ...storageState.currentSyncState,
    pendingCount: diag.pendingCount,
    syncingCount: diag.syncingCount,
    syncedCount: diag.syncedCount,
    errorCount: diag.errorCount,
    queueItems: diag.queueItems,
  };
}

export function subscribeToSyncStatus(callback: (state: SyncStatusState) => void): () => void {
  storageState.syncStatusSubscribers.add(callback);
  try {
    callback(getSyncStatusState());
  } catch (e) {
    console.warn('Initial sync status callback error:', e);
  }
  return () => {
    storageState.syncStatusSubscribers.delete(callback);
  };
}

/**
 * Manual trigger from Diagnostics Panel: resets retry timers on all queued/failed tasks,
 * releases any stale lock, and immediately processes all pending games.
 */
export async function retryAllFailedAndPendingGamesNow(): Promise<void> {
  if (storageState.retryTimerHandle) {
    clearTimeout(storageState.retryTimerHandle);
    storageState.retryTimerHandle = null;
  }
  if (storageState.isProcessingQueue && Date.now() - storageState.queueLockAcquiredAt > 8000) {
    storageState.isProcessingQueue = false;
    storageState.queueLockAcquiredAt = 0;
  }
  const now = Date.now();
  for (const [gameId, task] of Array.from(storageState.syncQueueMap.entries())) {
    const updated: QueuedSaveTask = {
      ...task,
      status: task.status === 'syncing' && storageState.isProcessingQueue ? 'syncing' : 'pending',
      nextRetryAt: now,
    };
    storageState.syncQueueMap.set(gameId, updated);
    void putQueueTaskInIndexedDB(updated);
  }
  updateSyncStatus({});
  await processSaveQueue();
}

// Connection Monitor Setup (detects online, offline, reconnection & Watchdog)

function initConnectionMonitor(): void {
  if (storageState.connectionMonitorInitialized || typeof window === 'undefined') return;
  storageState.connectionMonitorInitialized = true;

  window.addEventListener('online', () => {
    console.info('[CONNECTION_MONITOR] Conexión a Internet restaurada. Sincronizando cola pendiente...');
    updateSyncStatus({ isOnline: true });
    void retryAllFailedAndPendingGamesNow();
  });

  window.addEventListener('offline', () => {
    console.warn('[CONNECTION_MONITOR] Sin conexión a Internet. Modo Offline-First activo (IndexedDB).');
    updateSyncStatus({
      isOnline: false,
    });
  });

  // Periodic Watchdog every 5 seconds: releases any stuck lock and triggers due retries
  setInterval(() => {
    const now = Date.now();
    if (storageState.isProcessingQueue && storageState.queueLockAcquiredAt > 0 && now - storageState.queueLockAcquiredAt > QUEUE_WATCHDOG_TIMEOUT_MS) {
      console.warn('[SYNC_WATCHDOG] Liberando bloqueo de cola por exceso de tiempo (>20s).');
      storageState.isProcessingQueue = false;
      storageState.queueLockAcquiredAt = 0;
      for (const [id, t] of Array.from(storageState.syncQueueMap.entries())) {
        if (t.status === 'syncing') {
          storageState.syncQueueMap.set(id, {
            ...t,
            status: 'error',
            lastError: t.lastError || 'Tiempo de espera agotado (Watchdog)',
            nextRetryAt: now + 2000,
          });
        }
      }
      updateSyncStatus({ activeSaveId: null });
    }

    if (!storageState.isProcessingQueue && storageState.syncQueueMap.size > 0) {
      const hasReadyTask = Array.from(storageState.syncQueueMap.values()).some((t) => t.nextRetryAt <= now);
      if (hasReadyTask && (typeof navigator === 'undefined' || navigator.onLine)) {
        void processSaveQueue();
      }
    }
  }, 5000);

  // Bootstrap persisted IndexedDB games and pending Save Queue on startup
  void bootstrapOfflineFirstEngine();
}

const ADMIN_EMAILS_LIST = [
  'admin@bolillerobingo.com',
  'resistenciagonzalez@gmail.com',
  'genesis.vargas0619@gmail.com',
];


function persistDeletedGameIds(): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(storageState.deletedGameIdsSet).slice(-500);
    safeSetItem(STORAGE_KEY_DELETED_GAME_IDS, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

function persistClearedSequenceBarIds(): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(storageState.clearedSequenceBarIdsSet).slice(-500);
    safeSetItem(STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

export function isCurrentSessionAdmin(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = safeGetItem('bingo_current_user_session');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        if (parsed.role === 'admin') return true;
        if (
          typeof parsed.email === 'string' &&
          ADMIN_EMAILS_LIST.includes(parsed.email.trim().toLowerCase())
        ) {
          return true;
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}

async function bootstrapOfflineFirstEngine(): Promise<void> {
  if (storageState.hasBootstrappedIndexedDB || typeof window === 'undefined') return;
  storageState.hasBootstrappedIndexedDB = true;

  try {
    // 0. Ensure automatic migration from localStorage to IndexedDB and KV hydration finishes first
    await migrateAndHydrateStorageFromIndexedDB();

    // Hydrate deleted/cleared sets from IndexedDB KV store if present
    try {
      const delRaw = safeGetItem(STORAGE_KEY_DELETED_GAME_IDS);
      if (delRaw) {
        const parsed = JSON.parse(delRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => {
            if (typeof id === 'string') storageState.deletedGameIdsSet.add(id);
          });
        }
      }
      const clrRaw = safeGetItem(STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS);
      if (clrRaw) {
        const parsed = JSON.parse(clrRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => {
            if (typeof id === 'string') storageState.clearedSequenceBarIdsSet.add(id);
          });
        }
      }
    } catch {
      // ignore
    }

    // 1. Load all locally saved games from IndexedDB into memory store immediately
    const localGames = await getAllGamesFromIndexedDB();
    for (const g of localGames) {
      if (g && g.id) {
        if (storageState.deletedGameIdsSet.has(g.id)) {
          void deleteGameFromIndexedDB(g.id);
          continue;
        }
        const { normalizedGame } = normalizeGameFolderMetadata(g, g.id);
        if (storageState.deletedGameIdsSet.has(normalizedGame.id!)) {
          void deleteGameFromIndexedDB(normalizedGame.id!);
          continue;
        }
        if (!storageState.firestoreGamesMemoryStore.has(normalizedGame.id!)) {
          storageState.firestoreGamesMemoryStore.set(normalizedGame.id!, normalizedGame);
        }
      }
    }

    if (localGames.length > 0) {
      storageState.cachedSortedGames = sortGamesChronologicallyDesc(
        Array.from(storageState.firestoreGamesMemoryStore.values())
      );
      storageState.savedGamesSubscribers.forEach((sub) => {
        try {
          sub(storageState.cachedSortedGames);
        } catch {
          // ignore
        }
      });
    }

    // 2. Load any pending tasks from IndexedDB Save Queue and resume processing
    const pendingTasks = await getAllQueueTasksFromIndexedDB();
    for (const task of pendingTasks) {
      if (task && task.gameId && task.game) {
        storageState.syncQueueMap.set(task.gameId, {
          ...task,
          status: 'pending',
          nextRetryAt: Date.now(),
        });
        const { normalizedGame } = normalizeGameFolderMetadata(task.game, task.gameId);
        storageState.firestoreGamesMemoryStore.set(task.gameId, normalizedGame);
      }
    }

    updateSyncStatus({});
    if (storageState.syncQueueMap.size > 0) {
      void processSaveQueue();
    }
  } catch (err) {
    console.warn('[OFFLINE_ENGINE] Bootstrap warning:', err);
  }
}

if (typeof window !== 'undefined') {
  initConnectionMonitor();
}

// ============================================================================
// DATE & FOLDER NORMALIZATION HELPERS
// ============================================================================

/**
 * Recursively removes undefined fields from plain objects/arrays to ensure Firestore compatibility,
 * while preserving special Firebase FieldValue instances (such as serverTimestamp()) and Dates.
 */
function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as unknown as T;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  // Preserve Firebase FieldValue / Sentinel instances (e.g., serverTimestamp())
  if ((obj as any)._methodName || (obj.constructor && obj.constructor !== Object)) {
    return obj;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
    }
  }
  return result as T;
}

/**
 * Strictly validates that a game is a real saved game stored in today's subfolder (not an invented or dateless item,
 * and not deleted or cleared from the right sequence bar).
 */
export function isRealSavedGameInTodaySubfolder(
  game: Partial<GameSequenceItem> | null | undefined,
  todayKey = getCurrentLocalDateKey()
): boolean {
  if (!game || !game.id || typeof game.id !== 'string') return false;
  if (typeof game.round !== 'number' || game.round < 1) return false;
  if (storageState.deletedGameIdsSet.has(game.id) || storageState.clearedSequenceBarIdsSet.has(game.id)) return false;

  const explicitDate = hasExplicitGameDateKey(game);
  if (!explicitDate || explicitDate !== todayKey) return false;

  const inTodaySubfolder =
    game.subfolderDay === todayKey ||
    (typeof game.folderPath === 'string' && game.folderPath.endsWith(`/${todayKey}`));
  if (!inTodaySubfolder) return false;

  // Must be a genuinely saved game record in the subfolder (with a saved sheet snapshot or subfolder record), never a fake sequence-only item
  const hasSavedSnapshot = Boolean(
    game.sheet75Snapshot ||
      game.sheet90Snapshot ||
      (game.playerSummarySnapshot && Array.isArray(game.playerSummarySnapshot)) ||
      (game.sequenceSnapshot && typeof game.sequenceSnapshot === 'object')
  );
  if (!hasSavedSnapshot) return false;

  return true;
}

/**
 * Updates the temporary localStorage cache (strictly non-authoritative fallback).
 */
function syncTemporaryLocalCache(games: GameSequenceItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sorted = sortGamesChronologicallyDesc(games);
    const lightweightCache = sanitizeSequenceForStorage(sorted.slice(0, 40));
    safeSetItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(lightweightCache));
  } catch (err) {
    console.warn('Temporary cache update skipped:', err);
  }
}

// ============================================================================
// REAL-TIME FIRESTORE SUBSCRIPTION (MULTIPLEXED SINGLETON)
// ============================================================================


function ensureSharedSavedGamesListener(): void {
  if (storageState.activeFirestoreUnsubscribe || typeof window === 'undefined') return;
  initConnectionMonitor();

  try {
    const q = collection(db, 'saved_games');
    storageState.activeFirestoreUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        updateSyncStatus({ isFirestoreReachable: true });

        // Merge Firestore documents with any pending local offline saves so unsynced games are NEVER overwritten or lost
        const remoteIds = new Set<string>();

        snapshot.forEach((docSnap) => {
          const rawData = docSnap.data() as GameSequenceItem;
          const docKey = docSnap.id;

          // If this document was permanently deleted by an Admin, never resurrect it and ensure remote cleanup
          if (storageState.deletedGameIdsSet.has(docKey) || (rawData.id && storageState.deletedGameIdsSet.has(rawData.id))) {
            storageState.firestoreGamesMemoryStore.delete(docKey);
            void deleteGameFromIndexedDB(docKey);
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

          const { normalizedGame, isMisplaced, reason } = normalizeGameFolderMetadata(
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
          void saveGameToIndexedDB(normalizedGame);
        });

        // Remove documents that were deleted remotely (unless they are currently in the local save queue)
        for (const existingKey of Array.from(storageState.firestoreGamesMemoryStore.keys())) {
          if (!remoteIds.has(existingKey) && !storageState.syncQueueMap.has(existingKey)) {
            storageState.firestoreGamesMemoryStore.delete(existingKey);
          }
        }

        storageState.hasSyncedWithFirestore = true;
        storageState.cachedSortedGames = sortGamesChronologicallyDesc(
          Array.from(storageState.firestoreGamesMemoryStore.values())
        );

        syncTemporaryLocalCache(storageState.cachedSortedGames);
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
        updateSyncStatus({ isFirestoreReachable: false });
      }
    );
  } catch (err) {
    console.warn('Could not initialize shared saved_games subscription:', err);
  }
}

export function subscribeToSavedGamesFirestore(
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
        sortGamesChronologicallyDesc(Array.from(storageState.firestoreGamesMemoryStore.values()))
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


/**
 * Scans all saved games in Firestore.
 * If any game has a date different from the subfolder where it is stored,
 * it is automatically moved to its correct subfolder.
 */
export async function reorganizeAndHealAllStoredGames(): Promise<{
  totalChecked: number;
  reorganizedCount: number;
  details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }>;
}> {
  const details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }> = [];
  if (storageState.isReorganizationRunning) {
    return {
      totalChecked: storageState.firestoreGamesMemoryStore.size,
      reorganizedCount: 0,
      details,
    };
  }

  storageState.isReorganizationRunning = true;
  let totalChecked = 0;
  let reorganizedCount = 0;

  try {
    const snap = await getDocs(collection(db, 'saved_games'));
    for (const docSnap of snap.docs) {
      const rawData = docSnap.data() as GameSequenceItem;
      const docKey = docSnap.id;
      if (storageState.deletedGameIdsSet.has(docKey) || (rawData.id && storageState.deletedGameIdsSet.has(rawData.id))) {
        storageState.firestoreGamesMemoryStore.delete(docKey);
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

        storageState.inFlightAutoHealIds.add(docKey);
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
          setTimeout(() => storageState.inFlightAutoHealIds.delete(docKey), 3000);
        });

        storageState.firestoreGamesMemoryStore.set(docKey, normalizedGame);
        await saveGameToIndexedDB(normalizedGame);
      } else {
        storageState.firestoreGamesMemoryStore.set(docKey, normalizedGame);
      }
    }

    const sortedGames = sortGamesChronologicallyDesc(
      Array.from(storageState.firestoreGamesMemoryStore.values())
    );
    storageState.cachedSortedGames = sortedGames;
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
    storageState.isReorganizationRunning = false;
  }

  return { totalChecked, reorganizedCount, details };
}

/**
 * Returns all saved games from the authoritative Offline-First + Firestore memory store.
 */
export function getSavedGamesGallery(): GameSequenceItem[] {
  if (storageState.hasSyncedWithFirestore || storageState.firestoreGamesMemoryStore.size > 0) {
    return sortGamesChronologicallyDesc(
      Array.from(storageState.firestoreGamesMemoryStore.values()).filter(
        (g) => g && g.id && !storageState.deletedGameIdsSet.has(g.id) && hasExplicitGameDateKey(g) !== null
      )
    );
  }

  if (typeof window === 'undefined') return [];

  try {
    const raw = safeGetItem(STORAGE_KEY_SAVED_GAMES_GALLERY);
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
              hasExplicitGameDateKey(item) !== null
          )
          .map((item) => normalizeGameFolderMetadata(item, item.id).normalizedGame);
        return sortGamesChronologicallyDesc(valid);
      }
    }
  } catch (e) {
    console.error('Error reading temporary saved games cache', e);
  }

  return [];
}

/**
 * Resolves the existing document ID if a game with the same ID or same
 * (operatorFolder, dailyDate, mode, round, operatorUid) already exists, preventing duplicate records.
 */
function resolveExistingOrCanonicalDocId(
  item: GameSequenceItem,
  operatorFolder: string,
  dailyDate: string,
  mode: BingoMode,
  validRound: number
): { docId: string; duplicateIdsToClean: string[] } {
  const existingGames = getSavedGamesGallery();
  const itemUid = item.operatorUid && item.operatorUid !== 'anon' ? item.operatorUid : null;

  const matchingGames = existingGames.filter((g) => {
    if (!g) return false;
    const gDate = getGameNormalizedDateKey(g);
    const gOp = sanitizeOperatorFolderName(g.operatorFolder || g.operatorName);
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

  const canonicalId = buildCanonicalGameId(
    operatorFolder,
    dailyDate,
    mode,
    validRound,
    item.operatorUid
  );

  const hasExplicitExistingId =
    Boolean(item.id) && storageState.firestoreGamesMemoryStore.has(item.id!);

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

// ============================================================================
// SEQUENTIAL SAVE QUEUE & FIRESTORE VERIFICATION ENGINE
// ============================================================================

interface FirestoreGamePayload {
  id: string;
  round: number;
  ballNumber: number;
  ternaBall?: number | null;
  ternaLeader?: number | null;
  amboBall?: number | null;
  amboLeader?: number | null;
  letter: string;
  mode: BingoMode;
  timestamp: string;
  dateFormatted: string;
  dailyDate: string;
  subfolderDay: string;
  operatorFolder: string;
  folderPath: string;
  operatorUid: string;
  operatorName: string;
  operatorEmail: string;
  durationSeconds: number;
  durationFormatted: string;
  totalCollected: number;
  totalPrizesPaid: number;
  netProfit: number;
  currency: string;
  drawnBallsPlayed: number[];
  totalBallsDrawnCount: number;
  rowLeader: number | null;
  winningPlayerName: string;
  tableNumber: number | null;
  sheetType: SheetViewType;
  totalLinesPlayed: number;
  shiftId?: string;
  shiftName?: string;
  shiftDate?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  updatedAt: FieldValue;
  playerSummarySnapshot?: PlayerSummarySnapshotItem[];
  sequenceSnapshot?: GameSequenceSnapshot;
  sheet75Snapshot?: BingoSheetData;
  sheet90Snapshot?: Traditional90SheetData;
}

function buildFirestorePayloadFromItem(normalizedItem: GameSequenceItem): FirestoreGamePayload {
  const mode: BingoMode =
    normalizedItem.mode || (normalizedItem.sheetType === 'traditional-90' ? '90' : '75');
  const drawnBalls = Array.isArray(normalizedItem.drawnBallsPlayed)
    ? normalizedItem.drawnBallsPlayed.slice(0, 90)
    : [];
  const exactLines = getGameLines(normalizedItem);

  const firestorePayload: FirestoreGamePayload = {
    id: normalizedItem.id!,
    round: normalizedItem.round,
    ballNumber: normalizedItem.ballNumber || 0,
    ternaBall: normalizedItem.ternaBall ?? null,
    ternaLeader: normalizedItem.ternaLeader ?? null,
    amboBall: normalizedItem.amboBall ?? null,
    amboLeader: normalizedItem.amboLeader ?? null,
    letter: normalizedItem.letter || '',
    mode,
    timestamp: normalizedItem.timestamp || getCurrentLocalTimeString(),
    dateFormatted: normalizedItem.dateFormatted || new Date().toLocaleDateString('es-ES'),
    dailyDate: normalizedItem.dailyDate!,
    subfolderDay: normalizedItem.subfolderDay || normalizedItem.dailyDate!,
    operatorFolder: normalizedItem.operatorFolder || sanitizeOperatorFolderName(normalizedItem.operatorName),
    folderPath:
      normalizedItem.folderPath ||
      `${normalizedItem.operatorFolder || sanitizeOperatorFolderName(normalizedItem.operatorName)}/${normalizedItem.dailyDate}`,
    operatorUid: normalizedItem.operatorUid || 'anon',
    operatorName: normalizedItem.operatorName || 'Operadora Principal',
    operatorEmail: normalizedItem.operatorEmail || '',
    durationSeconds: normalizedItem.durationSeconds || 0,
    durationFormatted: normalizedItem.durationFormatted || '0s',
    totalCollected: normalizedItem.totalCollected || 0,
    totalPrizesPaid: normalizedItem.totalPrizesPaid || 0,
    netProfit: normalizedItem.netProfit || 0,
    currency: normalizedItem.currency || '$',
    drawnBallsPlayed: drawnBalls,
    totalBallsDrawnCount: drawnBalls.length || normalizedItem.totalBallsDrawnCount || 0,
    rowLeader: normalizedItem.rowLeader ?? null,
    winningPlayerName: normalizedItem.winningPlayerName || '',
    tableNumber: normalizedItem.tableNumber ?? null,
    sheetType: normalizedItem.sheetType || (mode === '90' ? 'traditional-90' : 'multipliers-15'),
    totalLinesPlayed: exactLines,
    shiftId: normalizedItem.shiftId || '',
    shiftName: normalizedItem.shiftName || '',
    shiftDate: normalizedItem.shiftDate || normalizedItem.dailyDate,
    shiftStartTime: normalizedItem.shiftStartTime || '',
    shiftEndTime: normalizedItem.shiftEndTime || '',
    updatedAt: serverTimestamp(),
  };

  if (normalizedItem.playerSummarySnapshot && Array.isArray(normalizedItem.playerSummarySnapshot)) {
    firestorePayload.playerSummarySnapshot = JSON.parse(JSON.stringify(normalizedItem.playerSummarySnapshot));
  }
  if (normalizedItem.sequenceSnapshot) {
    const seqCopy: GameSequenceSnapshot = {
      ...normalizedItem.sequenceSnapshot,
      customSeqEntries: normalizedItem.sequenceSnapshot.customSeqEntries
        ? JSON.parse(JSON.stringify(normalizedItem.sequenceSnapshot.customSeqEntries))
        : undefined,
      // Always strip nested snapshots from sequenceSnapshot.gameSequence to prevent >1MB Firestore payloads
      gameSequence: Array.isArray(normalizedItem.sequenceSnapshot.gameSequence)
        ? normalizedItem.sequenceSnapshot.gameSequence.slice(0, 30).map(toLightweightSequenceItem)
        : undefined,
    };
    firestorePayload.sequenceSnapshot = seqCopy;
  }
  if (normalizedItem.sheet75Snapshot) {
    const s75Copy: BingoSheetData = JSON.parse(JSON.stringify(normalizedItem.sheet75Snapshot));
    if (normalizedItem.playerSummarySnapshot && (!s75Copy.playerSummaryList || s75Copy.playerSummaryList.length === 0)) {
      s75Copy.playerSummaryList = normalizedItem.playerSummarySnapshot;
    }
    // Prevent giant base64 background images from exceeding Firestore's 1 MiB document size limit
    if (
      s75Copy.background?.url &&
      s75Copy.background.url.startsWith('data:image') &&
      s75Copy.background.url.length > 35000
    ) {
      s75Copy.background = {
        ...s75Copy.background,
        url: '',
      };
    }
    firestorePayload.sheet75Snapshot = s75Copy;
  }
  if (normalizedItem.sheet90Snapshot) {
    firestorePayload.sheet90Snapshot = JSON.parse(JSON.stringify(normalizedItem.sheet90Snapshot));
  }

  const sanitized = sanitizeForFirestore(firestorePayload);
  sanitized.updatedAt = serverTimestamp();
  return sanitized;
}

/**
 * Writes a single game to Firestore with a strict 8s timeout and immediately reads it back via getDoc
 * (with a strict 6s timeout) to verify that all critical fields match 100%.
 */
async function writeAndVerifyGameInFirestore(
  game: GameSequenceItem
): Promise<{ verified: boolean; remoteGame?: GameSequenceItem; errorMsg?: string }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { verified: false, errorMsg: 'Sin conexión a Internet' };
  }

  const docId = game.id!;
  const docRef = doc(db, 'saved_games', docId);

  let sanitizedPayload: FirestoreGamePayload;
  try {
    sanitizedPayload = buildFirestorePayloadFromItem(game);
  } catch (serializeErr: any) {
    return {
      verified: false,
      errorMsg: `Error preparando datos de partida: ${serializeErr?.message || 'Payload inválido'}`,
    };
  }

  try {
    await withTimeout(
      setDoc(docRef, sanitizedPayload, { merge: true }),
      8000,
      `Firestore setDoc (${docId})`
    );

    const snap = await withTimeout(
      getDoc(docRef),
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

/**
 * Processes the Save Queue sequentially (1 active write at a time) WITHOUT Head-of-Line blocking.
 * - If a game fails to sync, it is marked as 'error' (Error Pendiente), its reason is recorded,
 *   an Exponential Backoff retry is scheduled for that game, and the queue IMMEDIATELY continues
 *   processing the remaining ready games in the queue.
 * - All network and IndexedDB operations have strict timeouts.
 * - Locks and activeSaveId are unconditionally released in the finally block.
 */
export async function processSaveQueue(): Promise<void> {
  if (storageState.isProcessingQueue) {
    // Watchdog check: if lock has been held longer than QUEUE_WATCHDOG_TIMEOUT_MS, force-release it
    if (storageState.queueLockAcquiredAt > 0 && Date.now() - storageState.queueLockAcquiredAt > QUEUE_WATCHDOG_TIMEOUT_MS) {
      console.warn('[SAVE_QUEUE] Liberando bloqueo estancado antes de procesar la cola.');
      storageState.isProcessingQueue = false;
      storageState.queueLockAcquiredAt = 0;
    } else {
      storageState.reprocessRequested = true;
      return;
    }
  }

  if (storageState.syncQueueMap.size === 0) {
    updateSyncStatus({ status: 'synced', activeSaveId: null });
    return;
  }

  storageState.isProcessingQueue = true;
  storageState.queueLockAcquiredAt = Date.now();
  storageState.reprocessRequested = false;

  try {
    // Prevent infinite loops within a single queue pass by tracking attempted gameIds in this pass
    const attemptedInCurrentPass = new Set<string>();

    while (storageState.syncQueueMap.size > 0) {
      // Refresh lock heartbeat at the start of each item
      storageState.queueLockAcquiredAt = Date.now();
      const now = Date.now();

      // Select all tasks whose retry timer is due (nextRetryAt <= now) and haven't failed in this exact pass
      const readyTasks = Array.from(storageState.syncQueueMap.values())
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
              .map(toLightweightSequenceItem),
          },
        };
      }

      const startMs = Date.now();
      const startTimeStr = getCurrentLocalTimeString();

      nextTask.status = 'syncing';
      storageState.syncQueueMap.set(nextTask.gameId, nextTask);
      updateSyncStatus({
        status: 'saving',
        activeSaveId: nextTask.gameId,
      });

      let verified = false;
      let remoteGame: GameSequenceItem | undefined = undefined;
      let errorMsg: string | undefined = undefined;

      try {
        const res = await writeAndVerifyGameInFirestore(nextTask.game);
        verified = res.verified;
        remoteGame = res.remoteGame;
        errorMsg = res.errorMsg;
      } catch (unexpectedErr: any) {
        verified = false;
        errorMsg = unexpectedErr?.message || 'Error inesperado al sincronizar con Firestore';
      }

      const durationMs = Date.now() - startMs;
      const endTimeStr = getCurrentLocalTimeString();

      if (verified && remoteGame) {
        // Successfully verified in Firestore! Remove from queue and update IndexedDB & memory
        storageState.syncQueueMap.delete(nextTask.gameId);
        await removeQueueTaskFromIndexedDB(nextTask.gameId);
        await saveGameToIndexedDB(remoteGame);
        saveGameToGalleryCache(remoteGame);

        await recordDiagnosticSaveLog({
          id: `log_${Date.now()}_${nextTask.gameId}`,
          gameId: nextTask.gameId,
          round: remoteGame.round,
          dailyDate: remoteGame.dailyDate || getCurrentLocalDateKey(),
          startTime: startTimeStr,
          endTime: endTimeStr,
          durationMs,
          retryCount: nextTask.retryCount,
          result: 'SYNCED_FIRESTORE',
          errorMessage: null,
        });

        updateSyncStatus({
          activeSaveId: null,
          isFirestoreReachable: true,
          lastSyncedAt: endTimeStr,
        });
      } else {
        // Failed or offline: Mark as 'error' (Error Pendiente), schedule retry for this item,
        // and CONTINUE processing the rest of the queue so NO game ever blocks subsequent games!
        const retryIndex = Math.min(nextTask.retryCount, BACKOFF_DELAYS_MS.length - 1);
        const delayMs = BACKOFF_DELAYS_MS[retryIndex];
        const reason = errorMsg || 'Error de sincronización con Firestore';
        const updatedTask: QueuedSaveTask = {
          ...nextTask,
          retryCount: nextTask.retryCount + 1,
          nextRetryAt: Date.now() + delayMs,
          lastError: reason,
          status: 'error',
        };

        storageState.syncQueueMap.set(nextTask.gameId, updatedTask);
        await putQueueTaskInIndexedDB(updatedTask);

        await recordDiagnosticSaveLog({
          id: `log_${Date.now()}_${nextTask.gameId}_retry_${updatedTask.retryCount}`,
          gameId: nextTask.gameId,
          round: nextTask.game.round,
          dailyDate: nextTask.game.dailyDate || getCurrentLocalDateKey(),
          startTime: startTimeStr,
          endTime: endTimeStr,
          durationMs,
          retryCount: updatedTask.retryCount,
          result: 'RETRY_SCHEDULED',
          errorMessage: `${reason} (Reintento en ${delayMs / 1000}s)`,
        });

        updateSyncStatus({
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
    updateSyncStatus({
      activeSaveId: null,
      lastError: outerErr?.message || 'Error interno en cola de sincronización',
      lastErrorAt: getCurrentLocalTimeString(),
    });
  } finally {
    // Unconditionally release queue lock and reset activeSaveId
    storageState.isProcessingQueue = false;
    storageState.queueLockAcquiredAt = 0;

    // Ensure no task remains stuck in 'syncing' state after loop finishes
    for (const [id, task] of Array.from(storageState.syncQueueMap.entries())) {
      if (task.status === 'syncing') {
        storageState.syncQueueMap.set(id, {
          ...task,
          status: task.lastError ? 'error' : 'pending',
        });
      }
    }

    // Guarantees indicator transitions to 'synced', 'pending', or 'error' — NEVER stuck in 'saving'
    updateSyncStatus({ activeSaveId: null });

    // Schedule next automatic retry for the earliest remaining task in the queue
    if (storageState.syncQueueMap.size > 0) {
      const now = Date.now();
      const earliestRetryAt = Math.min(
        ...Array.from(storageState.syncQueueMap.values()).map((t) => t.nextRetryAt || now + 1000)
      );
      const waitMs = Math.max(500, earliestRetryAt - now);

      if (storageState.retryTimerHandle) clearTimeout(storageState.retryTimerHandle);
      storageState.retryTimerHandle = setTimeout(() => {
        storageState.retryTimerHandle = null;
        void processSaveQueue();
      }, waitMs);
    }

    // If a new game was enqueued while the queue was finishing up, process it immediately
    if (storageState.reprocessRequested) {
      storageState.reprocessRequested = false;
      const hasImmediate = Array.from(storageState.syncQueueMap.values()).some((t) => t.nextRetryAt <= Date.now());
      if (hasImmediate) {
        setTimeout(() => {
          void processSaveQueue();
        }, 50);
      }
    }
  }
}

/**
 * Centralized Unified Offline-First Game Persistence Service.
 *
 * Flow:
 * 1. Normalizes exact date & subfolder (${operatorFolder}/${dailyDate}).
 * 2. Saves immediately to IndexedDB (primary local persistence — 0% risk of data loss).
 * 3. Updates authoritative in-memory store and confirms local save immediately.
 * 4. Enqueues the game in the persistent Sequential Save Queue.
 * 5. Processes the Save Queue sequentially (write to Firestore -> read back -> verify -> mark synced,
 *    or retry automatically with Exponential Backoff if offline/unreachable).
 */
export async function saveGameUnified(
  item: GameSequenceItem
): Promise<{
  success: boolean;
  verified: boolean;
  savedLocally: boolean;
  game: GameSequenceItem;
}> {
  if (!item) {
    throw new Error('No se puede guardar una partida vacía');
  }

  initConnectionMonitor();
  const startMs = Date.now();
  const startTimeStr = getCurrentLocalTimeString();

  // 1. Single source of truth for date: dailyDate (YYYY-MM-DD)
  const dailyDate = getGameNormalizedDateKey(item);
  const operatorName = (item.operatorName || 'Operadora Principal').trim();
  const operatorFolder = sanitizeOperatorFolderName(item.operatorFolder || operatorName);
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

  const exactLines = getGameLines(item);
  let formattedDate = item.dateFormatted;
  if (!formattedDate || !parseDateStringToDateKey(formattedDate)) {
    const parts = dailyDate.split('-');
    formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : new Date().toLocaleDateString('es-ES');
  }
  const exactTimestamp =
    item.timestamp && /^\d{1,2}:\d{2}(:\d{2})?$/.test(item.timestamp.trim())
      ? (item.timestamp.trim().split(':').length === 2 ? `${item.timestamp.trim()}:00` : item.timestamp.trim())
      : getCurrentLocalTimeString();

  const cleanSequenceSnapshot: GameSequenceSnapshot | undefined = item.sequenceSnapshot
    ? {
        ...item.sequenceSnapshot,
        gameSequence: Array.isArray(item.sequenceSnapshot.gameSequence)
          ? item.sequenceSnapshot.gameSequence.slice(0, 30).map(toLightweightSequenceItem)
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
  if (storageState.deletedGameIdsSet.has(docId)) {
    storageState.deletedGameIdsSet.delete(docId);
    persistDeletedGameIds();
  }
  if (storageState.clearedSequenceBarIdsSet.has(docId)) {
    storageState.clearedSequenceBarIdsSet.delete(docId);
    persistClearedSequenceBarIds();
  }
  await saveGameToIndexedDB(normalizedItem);
  saveGameToGalleryCache(normalizedItem);

  void recordDiagnosticSaveLog({
    id: `log_local_${Date.now()}_${docId}`,
    gameId: docId,
    round: validRound,
    dailyDate,
    startTime: startTimeStr,
    endTime: getCurrentLocalTimeString(),
    durationMs: Date.now() - startMs,
    retryCount: 0,
    result: 'SAVED_LOCAL',
    errorMessage: null,
  });

  // 4. STEP 2 OF OFFLINE-FIRST: Add to Persistent Sequential Save Queue
  const existingTask = storageState.syncQueueMap.get(docId);
  const queueTask: QueuedSaveTask = {
    gameId: docId,
    game: normalizedItem,
    enqueuedAt: existingTask ? existingTask.enqueuedAt : Date.now(),
    retryCount: 0,
    nextRetryAt: Date.now(),
    lastError: null,
    status: 'pending',
  };

  storageState.syncQueueMap.set(docId, queueTask);
  await putQueueTaskInIndexedDB(queueTask);
  updateSyncStatus({});

  // Clean up any legacy duplicate IDs
  if (duplicateIdsToClean.length > 0) {
    for (const dupId of duplicateIdsToClean) {
      storageState.firestoreGamesMemoryStore.delete(dupId);
      void deleteGameFromIndexedDB(dupId);
      deleteDoc(doc(db, 'saved_games', dupId)).catch(() => {});
    }
  }

  // 5. STEP 3 OF OFFLINE-FIRST: Trigger the Sequential Save Queue
  // Wait up to 1.2s for fast cloud verification; if network is slow or offline,
  // return immediately so "Nueva Partida" never lags while processSaveQueue continues in background.
  const queuePromise = processSaveQueue();
  let raceTimer: ReturnType<typeof setTimeout> | null = null;
  const fastTimeout = new Promise<void>((resolve) => {
    raceTimer = setTimeout(resolve, 1200);
  });
  await Promise.race([queuePromise, fastTimeout]).finally(() => {
    if (raceTimer !== null) clearTimeout(raceTimer);
  });

  const isAlreadySynced = !storageState.syncQueueMap.has(docId);
  const latestGame = storageState.firestoreGamesMemoryStore.get(docId) || normalizedItem;

  return {
    success: true,
    verified: isAlreadySynced,
    savedLocally: true,
    game: latestGame,
  };
}

/**
 * Centralized game update method.
 */
export async function updateGameUnified(
  item: GameSequenceItem
): Promise<{
  success: boolean;
  verified: boolean;
  savedLocally: boolean;
  game: GameSequenceItem;
}> {
  return saveGameUnified(item);
}

/**
 * Updates the authoritative memory store + temporary cache and notifies UI components immediately.
 */
export function saveGameToGalleryCache(normalizedItem: GameSequenceItem): void {
  if (!normalizedItem) return;
  const { normalizedGame } = normalizeGameFolderMetadata(normalizedItem, normalizedItem.id);
  storageState.firestoreGamesMemoryStore.set(normalizedGame.id!, normalizedGame);

  const allGames = sortGamesChronologicallyDesc(
    Array.from(storageState.firestoreGamesMemoryStore.values())
  );
  storageState.cachedSortedGames = allGames;
  syncTemporaryLocalCache(allGames);

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

/**
 * Backward compatibility alias for saveGameUnified.
 */
export async function saveGameToFirestoreAndGallery(item: GameSequenceItem): Promise<void> {
  await saveGameUnified(item);
}

/**
 * Cleans deleted games from sequence bars in IndexedDB/memory so deleted games immediately disappear from right sequence bar.
 */
function purgeDeletedGamesFromLocalSequenceBars(
  idsToDelete: Set<string>,
  deletedItems: GameSequenceItem[]
): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToClean = getKeysByPrefix([STORAGE_KEY_SEQUENCE_75, STORAGE_KEY_SEQUENCE_90]);

    for (const key of keysToClean) {
      const raw = safeGetItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;

      const filtered = parsed.filter((seqItem: GameSequenceItem) => {
        if (!seqItem) return false;
        if (seqItem.id && idsToDelete.has(seqItem.id)) return false;
        const matchDeleted = deletedItems.some(
          (del) =>
            del.round === seqItem.round &&
            getGameNormalizedDateKey(del) === getGameNormalizedDateKey(seqItem) &&
            (del.timestamp === seqItem.timestamp || del.ballNumber === seqItem.ballNumber)
        );
        return !matchDeleted;
      });

      if (filtered.length !== parsed.length) {
        safeSetItem(key, JSON.stringify(filtered));
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Core atomic batch deletion across Memory, IndexedDB, Save Queue, Local Sequence Cache, and Firestore.
 * Strictly reserved for Administrators.
 */
async function executeBatchGameDeletion(
  idsToDelete: Set<string>,
  matchingItems: GameSequenceItem[] = []
): Promise<number> {
  if (!isCurrentSessionAdmin()) {
    console.warn('[RBAC] Acción denegada: solo los administradores pueden borrar partidas o carpetas.');
    return 0;
  }

  if (idsToDelete.size === 0) return 0;

  // 1. Register tombstones immediately so onSnapshot / auto-heal can NEVER resurrect these games
  for (const docId of idsToDelete) {
    storageState.deletedGameIdsSet.add(docId);
    storageState.syncQueueMap.delete(docId);
    storageState.firestoreGamesMemoryStore.delete(docId);
  }
  persistDeletedGameIds();

  // 2. Purge from local sequence bars and notify all UI subscribers in 0ms
  purgeDeletedGamesFromLocalSequenceBars(idsToDelete, matchingItems);

  updateSyncStatus({});
  const remaining = sortGamesChronologicallyDesc(
    Array.from(storageState.firestoreGamesMemoryStore.values())
  );
  storageState.cachedSortedGames = remaining;
  syncTemporaryLocalCache(remaining);

  storageState.savedGamesSubscribers.forEach((sub) => {
    try {
      sub(remaining);
    } catch {
      // ignore
    }
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('bingo_saved_games_updated', {
        detail: {
          total: remaining.length,
          deletedCount: idsToDelete.size,
          deletedIds: Array.from(idsToDelete),
        },
      })
    );
  }

  // 3. Remove from IndexedDB stores (games_store & save_queue_store) and Firestore in parallel
  await Promise.allSettled(
    Array.from(idsToDelete).map(async (docId) => {
      await removeQueueTaskFromIndexedDB(docId);
      await deleteGameFromIndexedDB(docId);
      try {
        await deleteDoc(doc(db, 'saved_games', docId));
      } catch (err) {
        console.warn(`Firestore delete warning for ${docId} (tombstoned locally):`, err);
      }
    })
  );

  return idsToDelete.size;
}

/**
 * Permanently deletes a game from IndexedDB, Save Queue, and Firestore (Admin only).
 */
export async function deleteGamePermanently(idOrItem: string | GameSequenceItem): Promise<boolean> {
  if (!idOrItem || !isCurrentSessionAdmin()) return false;

  const targetId = typeof idOrItem === 'string' ? idOrItem : idOrItem.id;
  const targetRound = typeof idOrItem === 'object' ? idOrItem.round : undefined;
  const targetTimestamp = typeof idOrItem === 'object' ? idOrItem.timestamp : undefined;
  const targetDate = typeof idOrItem === 'object' ? getGameNormalizedDateKey(idOrItem) : undefined;
  const targetOp =
    typeof idOrItem === 'object'
      ? sanitizeOperatorFolderName(idOrItem.operatorFolder || idOrItem.operatorName)
      : undefined;

  try {
    const current = getSavedGamesGallery();
    const localIdbGames = await getAllGamesFromIndexedDB();
    const combined = [...current, ...localIdbGames];

    const matchingItems = combined.filter((g) => {
      if (!g) return false;
      if (targetId && g.id === targetId) return true;
      if (
        targetRound !== undefined &&
        targetDate &&
        targetOp &&
        g.round === targetRound &&
        getGameNormalizedDateKey(g) === targetDate &&
        sanitizeOperatorFolderName(g.operatorFolder || g.operatorName) === targetOp
      ) {
        return true;
      }
      if (
        targetRound !== undefined &&
        targetTimestamp !== undefined &&
        g.round === targetRound &&
        g.timestamp === targetTimestamp
      ) {
        return true;
      }
      return false;
    });

    const idsToDelete = new Set<string>();
    if (targetId) idsToDelete.add(targetId);
    matchingItems.forEach((g) => {
      if (g.id) idsToDelete.add(g.id);
    });

    if (typeof idOrItem === 'object') {
      matchingItems.push(idOrItem);
    }

    await executeBatchGameDeletion(idsToDelete, matchingItems);
    return true;
  } catch (e) {
    console.error('Error deleting game:', e);
    return false;
  }
}

/**
 * Empties the right-hand sequence bar for today's games (works for both Operators and Admins).
 * Marks all current today games as cleared from the right sequence bar, purges local sequence keys,
 * and if the user is an Admin, also deletes them from today's subfolder.
 */
export async function clearRightSequenceBarToday(
  gamesToClear: GameSequenceItem[] = [],
  modeFilter?: '75' | '90'
): Promise<void> {
  const todayKey = getCurrentLocalDateKey();
  const idsToClear = new Set<string>();
  const itemsToClear: GameSequenceItem[] = [];

  for (const g of gamesToClear) {
    if (g && g.id) {
      idsToClear.add(g.id);
      itemsToClear.push(g);
    }
  }

  for (const [docId, g] of storageState.firestoreGamesMemoryStore.entries()) {
    if (!g) continue;
    const is90 = g.mode === '90' || g.sheetType === 'traditional-90';
    const matchesMode =
      !modeFilter || (modeFilter === '90' ? is90 : !is90);
    if (matchesMode && getGameNormalizedDateKey(g) === todayKey) {
      idsToClear.add(docId);
      if (g.id) idsToClear.add(g.id);
      itemsToClear.push(g);
    }
  }

  for (const id of idsToClear) {
    storageState.clearedSequenceBarIdsSet.add(id);
  }
  persistClearedSequenceBarIds();
  purgeDeletedGamesFromLocalSequenceBars(idsToClear, itemsToClear);

  if (typeof window !== 'undefined') {
    try {
      const keysToRemove = getKeysByPrefix([
        STORAGE_KEY_SEQUENCE_75,
        STORAGE_KEY_SEQUENCE_90,
        'bingo_sheet_custom_sequence',
      ]);
      for (const k of keysToRemove) {
        safeRemoveItem(k);
      }
    } catch {
      // ignore
    }
  }

  if (isCurrentSessionAdmin() && idsToClear.size > 0) {
    await executeBatchGameDeletion(idsToClear, itemsToClear);
  } else {
    const allGames = sortGamesChronologicallyDesc(
      Array.from(storageState.firestoreGamesMemoryStore.values())
    );
    storageState.cachedSortedGames = allGames;
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
          detail: {
            total: allGames.length,
            deletedIds: Array.from(idsToClear),
          },
        })
      );
    }
  }
}

/**
 * Permanently deletes all games of a specific operator on a specific dailyDate (YYYY-MM-DD) (Admin only).
 */
export async function deleteGamesOfDay(
  operatorName: string,
  dateKey: string
): Promise<number> {
  if (!isCurrentSessionAdmin()) return 0;

  try {
    const safeOp = sanitizeOperatorFolderName(operatorName);
    const opTrimmed = operatorName.trim().toLowerCase();
    const idsToDelete = new Set<string>();
    const matchingItems: GameSequenceItem[] = [];

    const checkAndCollect = (docId: string | undefined, g: GameSequenceItem) => {
      if (!g) return;
      const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gOp);
      const gDate = getGameNormalizedDateKey(g);
      const matchesOp =
        !operatorName ||
        operatorName === 'all' ||
        gOp === opTrimmed ||
        gFolder === safeOp;
      const matchesDate =
        gDate === dateKey || g.dailyDate === dateKey || g.subfolderDay === dateKey;

      if (matchesOp && matchesDate) {
        const resolvedId = docId || g.id;
        if (resolvedId) idsToDelete.add(resolvedId);
        matchingItems.push(g);
      }
    };

    for (const [docId, g] of storageState.firestoreGamesMemoryStore.entries()) {
      checkAndCollect(docId, g);
    }

    const localIdbGames = await getAllGamesFromIndexedDB();
    for (const g of localIdbGames) {
      checkAndCollect(g.id, g);
    }

    try {
      const snap = await getDocs(collection(db, 'saved_games'));
      snap.forEach((docSnap) => {
        checkAndCollect(docSnap.id, docSnap.data() as GameSequenceItem);
      });
    } catch {
      // Offline fallback: already collected from memory and IndexedDB
    }

    return await executeBatchGameDeletion(idsToDelete, matchingItems);
  } catch (e) {
    console.error('Error deleting games of day:', e);
    return 0;
  }
}

/**
 * Permanently deletes all games belonging to an operator's folder (Admin only).
 */
export async function deleteGamesOfOperatorFolder(operatorName: string): Promise<number> {
  if (!isCurrentSessionAdmin()) return 0;

  try {
    const safeOp = sanitizeOperatorFolderName(operatorName);
    const opTrimmed = operatorName.trim().toLowerCase();
    const idsToDelete = new Set<string>();
    const matchingItems: GameSequenceItem[] = [];

    const checkAndCollect = (docId: string | undefined, g: GameSequenceItem) => {
      if (!g) return;
      const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gOp);
      if (gOp === opTrimmed || gFolder === safeOp) {
        const resolvedId = docId || g.id;
        if (resolvedId) idsToDelete.add(resolvedId);
        matchingItems.push(g);
      }
    };

    for (const [docId, g] of storageState.firestoreGamesMemoryStore.entries()) {
      checkAndCollect(docId, g);
    }

    const localIdbGames = await getAllGamesFromIndexedDB();
    for (const g of localIdbGames) {
      checkAndCollect(g.id, g);
    }

    try {
      const snap = await getDocs(collection(db, 'saved_games'));
      snap.forEach((docSnap) => {
        checkAndCollect(docSnap.id, docSnap.data() as GameSequenceItem);
      });
    } catch {
      // ignore if offline
    }

    return await executeBatchGameDeletion(idsToDelete, matchingItems);
  } catch (e) {
    console.error('Error deleting operator folder games:', e);
    return 0;
  }
}

/**
 * Clears saved games in IndexedDB, Save Queue, and Firestore (all or filtered by mode) (Admin only).
 */
export async function clearAllSavedGamesGallery(
  filterMode?: 'all' | '75' | '90'
): Promise<void> {
  if (!isCurrentSessionAdmin()) return;

  try {
    const idsToDelete = new Set<string>();
    const matchingItems: GameSequenceItem[] = [];

    const checkAndCollect = (docId: string | undefined, g: GameSequenceItem) => {
      if (!g) return;
      const is90 = g.mode === '90' || g.sheetType === 'traditional-90';
      const matches =
        !filterMode ||
        filterMode === 'all' ||
        (filterMode === '75' && !is90) ||
        (filterMode === '90' && is90);
      if (matches) {
        const resolvedId = docId || g.id;
        if (resolvedId) idsToDelete.add(resolvedId);
        matchingItems.push(g);
      }
    };

    for (const [docId, g] of storageState.firestoreGamesMemoryStore.entries()) {
      checkAndCollect(docId, g);
    }

    const localIdbGames = await getAllGamesFromIndexedDB();
    for (const g of localIdbGames) {
      checkAndCollect(g.id, g);
    }

    try {
      const snap = await getDocs(collection(db, 'saved_games'));
      snap.forEach((docSnap) => {
        checkAndCollect(docSnap.id, docSnap.data() as GameSequenceItem);
      });
    } catch {
      // ignore if offline
    }

    await executeBatchGameDeletion(idsToDelete, matchingItems);
  } catch (e) {
    console.error('Error clearing saved games:', e);
  }
}

export async function updateUserFieldsCentralized(
  userId: string,
  fields: Partial<Pick<AppUser, 'role' | 'status' | 'assignedMode' | 'name' | 'notes'>>
): Promise<void> {
  await updateUserFieldsCentralizedService(userId, fields, sanitizeForFirestore);
}
