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

const galleryService = createGalleryService({
  initConnectionMonitor,
  updateSyncStatus,
  deleteGameFromIndexedDB,
  saveGameToIndexedDB,
  normalizeGameFolderMetadata,
  sortGamesChronologicallyDesc,
  syncTemporaryLocalCache,
  safeGetItem,
  savedGamesGalleryStorageKey: STORAGE_KEY_SAVED_GAMES_GALLERY,
  hasExplicitGameDateKey,
});

export function subscribeToSavedGamesFirestore(
  callback: (games: GameSequenceItem[]) => void
): () => void {
  return galleryService.subscribeToSavedGamesFirestore(callback);
}

export function getSavedGamesGallery(): GameSequenceItem[] {
  return galleryService.getSavedGamesGallery();
}

export function saveGameToGalleryCache(normalizedItem: GameSequenceItem): void {
  galleryService.saveGameToGalleryCache(normalizedItem);
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
    saveGameToGalleryCache,
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
  queue: {
    initConnectionMonitor,
    processSaveQueue,
    updateSyncStatus,
  },
  diagnostics: {
    recordDiagnosticSaveLog,
  },
  firestore: {
    deleteDuplicateGameDocument: (gameId) => deleteDoc(doc(db, 'saved_games', gameId)),
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
  return deletionService.deleteGamePermanently(idOrItem);
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
  return deletionService.deleteGamesOfDay(operatorName, dateKey);
}

/** Permanently deletes all games belonging to an operator's folder (Admin only). */
export async function deleteGamesOfOperatorFolder(operatorName: string): Promise<number> {
  return deletionService.deleteGamesOfOperatorFolder(operatorName);
}

/** Clears saved games in IndexedDB, Save Queue, and Firestore (all or filtered by mode) (Admin only). */
export async function clearAllSavedGamesGallery(
  filterMode?: 'all' | '75' | '90'
): Promise<void> {
  return deletionService.clearAllSavedGamesGallery(filterMode);
}


export async function updateUserFieldsCentralized(
  userId: string,
  fields: Partial<Pick<AppUser, 'role' | 'status' | 'assignedMode' | 'name' | 'notes'>>
): Promise<void> {
  await updateUserFieldsCentralizedService(userId, fields, sanitizeForFirestore);
}
