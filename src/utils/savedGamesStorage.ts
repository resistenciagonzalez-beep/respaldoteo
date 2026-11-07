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
import { createGalleryService } from './galleryService';
import { createDeletionService } from './deletionService';
import { createGameRepository } from './gameRepository';
import { createSyncStatus } from './syncStatus';
import { createQueueProcessor } from './queueProcessor';
import { createOfflineFirstEngine } from './offlineFirstEngine';
import { savedGameDaysService } from './savedGameDaysService';
import { createGameMaintenanceService } from './gameMaintenanceService';
import { removeSavedGamesFromMismosHistory, upsertSavedGameHistoryForMismos } from './gameHistoryRepository';

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

const syncStatusService = createSyncStatus({ state: storageState });

function updateSyncStatus(partial: Partial<SyncStatusState>): void {
  syncStatusService.updateSyncStatus(partial);
}

export function getSyncStatusState(): SyncStatusState {
  return syncStatusService.getSyncStatusState();
}

export function subscribeToSyncStatus(callback: (state: SyncStatusState) => void): () => void {
  return syncStatusService.subscribeToSyncStatus(callback);
}

/**
 * Manual trigger from Diagnostics Panel: resets retry timers on all queued/failed tasks,
 * releases any stale lock, and immediately processes all pending games.
 */
export async function retryAllFailedAndPendingGamesNow(): Promise<void> {
  return queueProcessor.retryAllFailedAndPendingGamesNow();
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

const gameMaintenanceService = createGameMaintenanceService({
  state: storageState,
  firestore: {
    db,
    doc,
    setDoc,
    deleteDoc,
  },
  storage: {
    deleteGameFromIndexedDB,
    saveGameToIndexedDB,
  },
  normalization: {
    normalizeGameFolderMetadata,
    sortGamesChronologicallyDesc,
  },
  cache: {
    syncTemporaryLocalCache,
  },
  history: {
    removeGamesFromMismosHistory: removeSavedGamesFromMismosHistory,
  },
});

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

const deletionService = createDeletionService({
  state: storageState,
  isCurrentSessionAdmin,
  getSavedGamesGallery,
  persistDeletedGameIds,
  persistClearedSequenceBarIds,
  getCurrentLocalDateKey,
  getGameNormalizedDateKey,
  sanitizeOperatorFolderName,
  sortGamesChronologicallyDesc,
  updateSyncStatus: () => updateSyncStatus({}),
  syncTemporaryLocalCache,
  getAllGamesFromIndexedDB,
  removeQueueTaskFromIndexedDB,
  deleteGameFromIndexedDB,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  getKeysByPrefix,
  sequence75StorageKey: STORAGE_KEY_SEQUENCE_75,
  sequence90StorageKey: STORAGE_KEY_SEQUENCE_90,
  reconcileDeletedGames: savedGameDaysService.reconcileDeletedGames,
  removeGamesFromMismosHistory: removeSavedGamesFromMismosHistory,
});

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

const offlineFirstEngine = createOfflineFirstEngine({
  state: storageState,
  storage: {
    migrateAndHydrateStorageFromIndexedDB,
    safeGetItem,
    getAllGamesFromIndexedDB,
    deleteGameFromIndexedDB,
    getAllQueueTasksFromIndexedDB,
  },
  normalization: {
    normalizeGameFolderMetadata,
    sortGamesChronologicallyDesc,
  },
  syncStatus: {
    updateSyncStatus,
  },
  queue: {
    processSaveQueue,
  },
  gameDays: {
    upsertSavedGame: savedGameDaysService.upsertSavedGame,
  },
  firestore: {
    db,
    doc,
    setDoc,
    getDoc,
    withTimeout,
    buildFirestorePayloadFromItem,
  },
  storageKeys: {
    deletedGameIds: STORAGE_KEY_DELETED_GAME_IDS,
    clearedSequenceBarIds: STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS,
  },
});

async function bootstrapOfflineFirstEngine(): Promise<void> {
  return offlineFirstEngine.bootstrapOfflineFirstEngine();
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

const galleryService = createGalleryService({
  initConnectionMonitor,
  updateSyncStatus,
  saveGameToIndexedDB,
  normalizeGameFolderMetadata,
  sortGamesChronologicallyDesc,
  syncTemporaryLocalCache,
  safeGetItem,
  savedGamesGalleryStorageKey: STORAGE_KEY_SAVED_GAMES_GALLERY,
  hasExplicitGameDateKey,
  sanitizeOperatorFolderName,
  getGameNormalizedDateKey,
  getGameLines,
  gameDays: savedGameDaysService,
});

export function subscribeToRecentSavedGames(
  callback: (games: GameSequenceItem[]) => void
): () => void {
  return galleryService.subscribeToRecentSavedGames(callback);
}

/** Compatibility wrapper; this is intentionally bounded and never observes the full collection. */
export function subscribeToSavedGamesFirestore(
  callback: (games: GameSequenceItem[]) => void
): () => void {
  return galleryService.subscribeToRecentSavedGames(callback);
}

export function getSavedGamesGallery(): GameSequenceItem[] {
  return galleryService.getSavedGamesGallery();
}

export function getGalleryOperators(currentUser: AppUser | null | undefined, isAdmin: boolean, forceRefresh = false) {
  return galleryService.getGalleryOperators(currentUser, isAdmin, forceRefresh);
}

export function rebuildSavedGameDays() {
  return savedGameDaysService.rebuildSavedGameDays();
}

export function getGalleryDates(
  operator: import('./galleryService').GalleryOperator,
  onDatesUpdate?: (dates: import('./galleryService').GalleryDate[]) => void
) {
  return galleryService.getGalleryDates(operator, onDatesUpdate);
}

export function invalidateGalleryDatesCache(operatorUid?: string): void {
  galleryService.invalidateGalleryDatesCache(operatorUid);
}

export function getGalleryGamesPage(
  operator: import('./galleryService').GalleryOperator,
  dateKey: string,
  cursor?: import('./galleryService').GalleryGamesCursor | null,
  onGamesUpdate?: (update: import('./galleryService').GalleryGamesUpdate) => void,
  prefetchOnly?: boolean
) {
  return galleryService.getGalleryGamesPage(operator, dateKey, cursor, onGamesUpdate, prefetchOnly);
}

export function subscribeToTodaySavedGames(
  operator: import('./galleryService').GalleryOperator,
  dateKey: string,
  mode: BingoMode,
  callback: (games: GameSequenceItem[]) => void
): () => void {
  return galleryService.subscribeToTodaySavedGames(operator, dateKey, mode, callback);
}

export function saveGameToGalleryCache(normalizedItem: GameSequenceItem): void {
  galleryService.saveGameToGalleryCache(normalizedItem).catch(() => {});
}



/** Reorganizes already loaded saved games without scanning the Firestore collection. */
export async function reorganizeAndHealAllStoredGames(): Promise<{
  totalChecked: number;
  reorganizedCount: number;
  details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }>;
}> {
  return gameMaintenanceService.reorganizeAndHealAllStoredGames();
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

const writeAndVerifyGameInFirestore = offlineFirstEngine.writeAndVerifyGameInFirestore;

const queueProcessor = createQueueProcessor({
  state: storageState,
  syncStatus: syncStatusService,
  firestore: {
    writeAndVerifyGameInFirestore,
  },
  storage: {
    removeQueueTaskFromIndexedDB,
    saveGameToIndexedDB,
    putQueueTaskInIndexedDB,
  },
  gallery: {
    saveGameToGalleryCache: galleryService.saveGameToGalleryCache,
  },
  history: {
    upsertSavedGameForMismos: upsertSavedGameHistoryForMismos,
  },
  diagnostics: {
    recordDiagnosticSaveLog,
  },
  retryPolicy: {
    backoffDelaysMs: BACKOFF_DELAYS_MS,
    queueWatchdogTimeoutMs: QUEUE_WATCHDOG_TIMEOUT_MS,
  },
  normalization: {
    getCurrentLocalTimeString,
    getCurrentLocalDateKey,
    toLightweightSequenceItem,
  },
});

export async function processSaveQueue(): Promise<void> {
  return queueProcessor.processSaveQueue();
}
const gameRepository = createGameRepository({
  normalization: {
    buildCanonicalGameId,
    getCurrentLocalTimeString,
    getGameNormalizedDateKey,
    getGameLines,
    parseDateStringToDateKey,
    sanitizeOperatorFolderName,
    toLightweightSequenceItem,
  },
  storage: {
    state: storageState,
    deleteGameFromIndexedDB,
    persistClearedSequenceBarIds,
    persistDeletedGameIds,
    putQueueTaskInIndexedDB,
    saveGameToIndexedDB,
  },
  gallery: {
    getSavedGamesGallery,
    saveGameToGalleryCache,
  },
  history: {
    upsertSavedGameForMismos: upsertSavedGameHistoryForMismos,
  },
  queue: {
    initConnectionMonitor,
    processSaveQueueAndWaitForGame: queueProcessor.processSaveQueueAndWaitForGame,
    updateSyncStatus,
  },
  diagnostics: {
    recordDiagnosticSaveLog,
  },
  firestore: {
    deleteDuplicateGameDocument: async (gameId) => {
      await deleteDoc(doc(db, 'saved_games', gameId));
      removeSavedGamesFromMismosHistory([gameId]);
    },
  },
});

export async function saveGameUnified(
  item: GameSequenceItem
): Promise<{
  success: boolean;
  verified: boolean;
  savedLocally: boolean;
  game: GameSequenceItem;
}> {
  return gameRepository.saveGameUnified(item);
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
  return gameRepository.updateGameUnified(item);
}

/**
 * Backward compatibility alias for saveGameUnified.
 */
export async function saveGameToFirestoreAndGallery(item: GameSequenceItem): Promise<void> {
  await saveGameUnified(item);
}


/** Permanently deletes a game from IndexedDB, Save Queue, and Firestore (Admin only). */
export async function deleteGamePermanently(idOrItem: string | GameSequenceItem): Promise<boolean> {
  const gameBeforeDelete = typeof idOrItem === 'string'
    ? storageState.firestoreGamesMemoryStore.get(idOrItem)
    : idOrItem;
  const deleted = await deletionService.deleteGamePermanently(idOrItem);
  if (deleted) {
    if (gameBeforeDelete) galleryService.invalidateGalleryGamesCacheForGame(gameBeforeDelete);
    else if (typeof idOrItem === 'string') await galleryService.invalidateGalleryGamesCacheByGameId(idOrItem);
  }
  return deleted;
}

/** Empties the right-hand sequence bar for today's games (works for both Operators and Admins). */
export async function clearRightSequenceBarToday(
  gamesToClear: GameSequenceItem[] = [],
  modeFilter?: '75' | '90'
): Promise<void> {
  return deletionService.clearRightSequenceBarToday(gamesToClear, modeFilter);
}

/** Permanently deletes all games of a specific operator on a specific dailyDate (YYYY-MM-DD) (Admin only). */
export async function deleteGamesOfDay(operatorName: string, dateKey: string): Promise<number> {
  const deletedCount = await deletionService.deleteGamesOfDay(operatorName, dateKey);
  if (deletedCount > 0) await galleryService.invalidateGalleryGamesCacheForFolder(operatorName, dateKey);
  return deletedCount;
}

/** Permanently deletes all games belonging to an operator's folder (Admin only). */
export async function deleteGamesOfOperatorFolder(operatorName: string): Promise<number> {
  const deletedCount = await deletionService.deleteGamesOfOperatorFolder(operatorName);
  if (deletedCount > 0) await galleryService.invalidateGalleryGamesCacheForFolder(operatorName);
  return deletedCount;
}

/** Clears saved games in IndexedDB, Save Queue, and Firestore (all or filtered by mode) (Admin only). */
export async function clearAllSavedGamesGallery(
  filterMode?: 'all' | '75' | '90'
): Promise<void> {
  await deletionService.clearAllSavedGamesGallery(filterMode);
  await galleryService.clearGalleryCaches();
}


export async function updateUserFieldsCentralized(
  userId: string,
  fields: Partial<Pick<AppUser, 'role' | 'status' | 'assignedMode' | 'name' | 'notes'>>
): Promise<void> {
  await updateUserFieldsCentralizedService(userId, fields, sanitizeForFirestore);
}
