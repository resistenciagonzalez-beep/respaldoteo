import {
  GameSequenceItem,
  SheetViewType,
  BingoMode,
  BingoSheetData,
  Traditional90SheetData,
  AppUser,
  PlayerSummarySnapshotItem,
  GameSequenceSnapshot,
  ActivityLogItem,
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
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  documentId,
  Timestamp,
  writeBatch,
  getCountFromServer,
  FieldValue,
  QueryDocumentSnapshot,
  QuerySnapshot,
  Query,
  DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { trustedNow, trustedNowMs } from './trustedClock';
import {
  APP_TIME_ZONE,
  getAppZoneParts,
  dateToAppDateKey,
  getPreviousDateKey,
  formatTime12h,
  sanitizeOperatorFolderName,
  getGameShiftNumber,
  parseGameFolderKey,
  isSameOperatorGame,
  parseDateStringToDateKey,
  getGameLines,
  decideShiftFolderForNewGame,
  computeNextRoundInShift,
} from './saveRules';

// Reglas puras del guardado (mismos nombres de siempre para el resto de la plataforma)
export {
  APP_TIME_ZONE,
  dateToAppDateKey,
  getPreviousDateKey,
  formatTime12h,
  sanitizeOperatorFolderName,
  getGameShiftNumber,
  parseGameFolderKey,
  parseDateStringToDateKey,
  getGameLines,
};
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
  getAllGamesFromIndexedDBStrict,
  deleteGameFromIndexedDB,
  putQueueTaskInIndexedDB,
  removeQueueTaskFromIndexedDB,
  getAllQueueTasksFromIndexedDB,
  recordDiagnosticSaveLog,
  getDiagnosticSaveLogs,
} from './offlinePersistenceEngine';

export { getDiagnosticSaveLogs };
export type { SyncStatusState, SyncStatusType, QueueTaskDiagnosticItem };

export const STORAGE_KEY_SAVED_GAMES_GALLERY = 'bingo_saved_games_gallery';
export const STORAGE_KEY_SEQUENCE_75 = 'bingo_game_sequence_history';
export const STORAGE_KEY_SEQUENCE_90 = 'bingo_90_game_sequence_history';

/**
 * Authoritative Offline-First + Firestore synchronized in-memory store.
 * IndexedDB is the primary local persistence engine (never loses a game even offline).
 * Firestore is the real-time cloud synchronization & backup layer.
 */
const firestoreGamesMemoryStore = new Map<string, GameSequenceItem>();
let hasSyncedWithFirestore = false;
let hasBootstrappedIndexedDB = false;

// ============================================================================
// SYNC STATUS, CONNECTION MONITOR & SAVE QUEUE STATE
// ============================================================================

const syncQueueMap = new Map<string, QueuedSaveTask>();
let isProcessingQueue = false;
let queueLockAcquiredAt = 0;
let reprocessRequested = false;
let retryTimerHandle: ReturnType<typeof setTimeout> | null = null;
const QUEUE_WATCHDOG_TIMEOUT_MS = 20000;

let currentSyncState: SyncStatusState = {
  status: 'synced',
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
  queueItems: [],
};

const syncStatusSubscribers = new Set<(state: SyncStatusState) => void>();

function notifySyncStatusSubscribers(): void {
  const snapshot: SyncStatusState = {
    ...currentSyncState,
    queueItems: [...currentSyncState.queueItems],
  };
  syncStatusSubscribers.forEach((cb) => {
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
  const tasks = Array.from(syncQueueMap.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  let pendingCount = 0;
  let syncingCount = 0;
  let errorCount = 0;

  const queueItems: QueueTaskDiagnosticItem[] = tasks.map((t) => {
    const effectiveStatus =
      t.status === 'syncing' && (!isProcessingQueue || currentSyncState.activeSaveId !== t.gameId)
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
  firestoreGamesMemoryStore.forEach((g, id) => {
    if (g && !deletedGameIdsSet.has(id) && !syncQueueMap.has(id)) {
      syncedCount++;
    }
  });

  let derivedStatus: SyncStatusType = 'synced';
  if (isProcessingQueue && currentSyncState.activeSaveId && syncingCount > 0) {
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
    currentSyncState.activeSaveId = partial.activeSaveId ?? null;
  }
  if ('lastError' in partial) {
    currentSyncState.lastError = partial.lastError ?? null;
  }
  if ('lastErrorAt' in partial) {
    currentSyncState.lastErrorAt = partial.lastErrorAt ?? null;
  }
  if ('isOnline' in partial && typeof partial.isOnline === 'boolean') {
    currentSyncState.isOnline = partial.isOnline;
  }
  if ('isFirestoreReachable' in partial && typeof partial.isFirestoreReachable === 'boolean') {
    currentSyncState.isFirestoreReachable = partial.isFirestoreReachable;
  }
  if ('lastSyncedAt' in partial) {
    currentSyncState.lastSyncedAt = partial.lastSyncedAt ?? null;
  }

  const diag = computeQueueDiagnostics();

  currentSyncState = {
    ...currentSyncState,
    pendingCount: diag.pendingCount,
    syncingCount: diag.syncingCount,
    syncedCount: diag.syncedCount,
    errorCount: diag.errorCount,
    queueItems: diag.queueItems,
    status: partial.status || diag.derivedStatus,
  };

  // Safety guarantee: never stay in 'saving' if queue is not actively processing a task
  if (currentSyncState.status === 'saving' && (!isProcessingQueue || !currentSyncState.activeSaveId)) {
    currentSyncState.status = diag.errorCount > 0 ? 'error' : diag.pendingCount > 0 ? 'pending' : 'synced';
  }

  notifySyncStatusSubscribers();
}

export function getSyncStatusState(): SyncStatusState {
  const diag = computeQueueDiagnostics();
  return {
    ...currentSyncState,
    pendingCount: diag.pendingCount,
    syncingCount: diag.syncingCount,
    syncedCount: diag.syncedCount,
    errorCount: diag.errorCount,
    queueItems: diag.queueItems,
  };
}

export function subscribeToSyncStatus(callback: (state: SyncStatusState) => void): () => void {
  syncStatusSubscribers.add(callback);
  try {
    callback(getSyncStatusState());
  } catch (e) {
    console.warn('Initial sync status callback error:', e);
  }
  return () => {
    syncStatusSubscribers.delete(callback);
  };
}

/**
 * Manual trigger from Diagnostics Panel: resets retry timers on all queued/failed tasks,
 * releases any stale lock, and immediately processes all pending games.
 */
export async function retryAllFailedAndPendingGamesNow(): Promise<void> {
  if (retryTimerHandle) {
    clearTimeout(retryTimerHandle);
    retryTimerHandle = null;
  }
  if (isProcessingQueue && Date.now() - queueLockAcquiredAt > 8000) {
    isProcessingQueue = false;
    queueLockAcquiredAt = 0;
  }
  const now = Date.now();
  for (const [gameId, task] of Array.from(syncQueueMap.entries())) {
    const updated: QueuedSaveTask = {
      ...task,
      status: task.status === 'syncing' && isProcessingQueue ? 'syncing' : 'pending',
      nextRetryAt: now,
    };
    syncQueueMap.set(gameId, updated);
    void putQueueTaskInIndexedDB(updated);
  }
  updateSyncStatus({});
  await processSaveQueue();
}

// Connection Monitor Setup (detects online, offline, reconnection & Watchdog)
let connectionMonitorInitialized = false;

function initConnectionMonitor(): void {
  if (connectionMonitorInitialized || typeof window === 'undefined') return;
  connectionMonitorInitialized = true;

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
    if (isProcessingQueue && queueLockAcquiredAt > 0 && now - queueLockAcquiredAt > QUEUE_WATCHDOG_TIMEOUT_MS) {
      console.warn('[SYNC_WATCHDOG] Liberando bloqueo de cola por exceso de tiempo (>20s).');
      isProcessingQueue = false;
      queueLockAcquiredAt = 0;
      for (const [id, t] of Array.from(syncQueueMap.entries())) {
        if (t.status === 'syncing') {
          syncQueueMap.set(id, {
            ...t,
            status: 'error',
            lastError: t.lastError || 'Tiempo de espera agotado (Watchdog)',
            nextRetryAt: now + 2000,
          });
        }
      }
      updateSyncStatus({ activeSaveId: null });
    }

    if (!isProcessingQueue && syncQueueMap.size > 0) {
      const hasReadyTask = Array.from(syncQueueMap.values()).some((t) => t.nextRetryAt <= now);
      if (hasReadyTask && (typeof navigator === 'undefined' || navigator.onLine)) {
        void processSaveQueue();
      }
    }
  }, 5000);

  // Bootstrap persisted IndexedDB games and pending Save Queue on startup
  bootstrapPromise = bootstrapOfflineFirstEngine();
}

const STORAGE_KEY_DELETED_GAME_IDS = 'bingo_admin_deleted_game_ids_v2';
const STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS = 'bingo_cleared_sequence_bar_ids_v1';
const ADMIN_EMAILS_LIST = [
  'admin@bolillerobingo.com',
  'resistenciagonzalez@gmail.com',
  'genesis.vargas0619@gmail.com',
  'bingoteteoo@gmail.com',
];

const deletedGameIdsSet: Set<string> = (() => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = safeGetItem(STORAGE_KEY_DELETED_GAME_IDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set<string>(parsed.filter((id): id is string => typeof id === 'string'));
      }
    }
  } catch {
    // ignore
  }
  return new Set<string>();
})();

const clearedSequenceBarIdsSet: Set<string> = (() => {
  if (typeof window === 'undefined') return new Set<string>();
  try {
    const raw = safeGetItem(STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set<string>(parsed.filter((id): id is string => typeof id === 'string'));
      }
    }
  } catch {
    // ignore
  }
  return new Set<string>();
})();

function persistDeletedGameIds(): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(deletedGameIdsSet).slice(-500);
    safeSetItem(STORAGE_KEY_DELETED_GAME_IDS, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

function persistClearedSequenceBarIds(): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = Array.from(clearedSequenceBarIdsSet).slice(-500);
    safeSetItem(STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS, JSON.stringify(arr));
  } catch {
    // ignore
  }
}

// ============================================================================
// SESIÓN ACTUAL (la define useAuth con Firebase Authentication + perfil de Firestore)
// ============================================================================

export interface StorageSessionContext {
  uid: string;
  isAdmin: boolean;
  email?: string;
  name?: string;
}

let sessionCtx: StorageSessionContext | null = null;
let bootstrapPromise: Promise<void> = Promise.resolve();
// true si al abrir la sesión no se pudo leer la copia local del dispositivo
let localCacheUnreadable = false;
const CACHE_OWNER_KEY = 'bingo_games_cache_owner_v3';
const SYNC_META_KEY_PREFIX = 'bingo_games_sync_meta_v3_';

function getCacheOwnerKey(ctx: StorageSessionContext | null): string {
  if (!ctx) return '';
  return (ctx.isAdmin ? 'admin_' : 'op_') + ctx.uid;
}

export function getStorageSessionContext(): StorageSessionContext | null {
  return sessionCtx;
}

/**
 * Solo sirve para mostrar u ocultar botones. La protección real la hacen las reglas de Firestore.
 */
export function isCurrentSessionAdmin(): boolean {
  return Boolean(sessionCtx && sessionCtx.isAdmin);
}

function isGameVisibleForSession(game: Partial<GameSequenceItem> | null | undefined): boolean {
  if (!game || !sessionCtx) return false;
  if (sessionCtx.isAdmin) return true;
  const owner = (game as GameSequenceItem).ownerUid;
  if (owner) return owner === sessionCtx.uid;
  return isGameOfOperator(game as GameSequenceItem, {
    id: sessionCtx.uid,
    uid: sessionCtx.uid,
    name: sessionCtx.name || '',
    email: sessionCtx.email || '',
    role: 'operator',
    status: 'active',
  } as AppUser);
}

function isTaskForCurrentSession(task: QueuedSaveTask): boolean {
  if (!sessionCtx || !task || !task.game) return false;
  if (sessionCtx.isAdmin) return true;
  return !task.game.ownerUid || task.game.ownerUid === sessionCtx.uid;
}

/**
 * Lo llama useAuth cada vez que cambia el usuario (o su rango).
 * Las operadoras solo cargan sus partidas; los administradores cargan todas.
 */
export function setStorageSessionContext(ctx: StorageSessionContext | null): void {
  const prevKey = getCacheOwnerKey(sessionCtx);
  const nextKey = getCacheOwnerKey(ctx);
  sessionCtx = ctx ? { ...ctx } : null;
  if (prevKey === nextKey) return;

  // Cambió el usuario: se detiene la sincronización anterior y se aíslan los datos
  stopRemoteSync();
  firestoreGamesMemoryStore.clear();
  hasSyncedWithFirestore = false;
  try {
    safeRemoveItem(STORAGE_KEY_SAVED_GAMES_GALLERY);
  } catch {
    // ignore
  }
  notifySavedGamesSubscribers(true);

  if (!ctx) return;
  void (async () => {
    await prepareLocalCacheForSession(nextKey);
    if (getCacheOwnerKey(sessionCtx) !== nextKey) return;
    if (savedGamesSubscribers.size > 0) {
      startRemoteSync();
    }
    if (syncQueueMap.size > 0) {
      void processSaveQueue();
    }
  })();
}

async function prepareLocalCacheForSession(ownerKey: string): Promise<void> {
  try {
    await bootstrapPromise;
  } catch {
    // ignore
  }
  if (getCacheOwnerKey(sessionCtx) !== ownerKey) return;

  let previousOwner = '';
  try {
    previousOwner = safeGetItem(CACHE_OWNER_KEY) || '';
  } catch {
    previousOwner = '';
  }

  localCacheUnreadable = false;
  try {
    const localGames = await getAllGamesFromIndexedDBStrict(15000);
    if (previousOwner && previousOwner !== ownerKey) {
      // Otra cuenta CONOCIDA usó este dispositivo: se borra solo la copia LOCAL
      for (const g of localGames) {
        if (g && g.id && !syncQueueMap.has(g.id)) {
          await deleteGameFromIndexedDB(g.id);
        }
      }
      safeRemoveItem(SYNC_META_KEY_PREFIX + ownerKey);
      safeSetItem(CACHE_OWNER_KEY, ownerKey);
    } else {
      // Misma cuenta (o no se sabe cuál fue la anterior): se aprovecha la copia local.
      // Nunca se borra por "no saber": eso obligaba a descargar todo otra vez.
      if (!previousOwner) safeSetItem(CACHE_OWNER_KEY, ownerKey);
      for (const g of localGames) {
        if (!g || !g.id || deletedGameIdsSet.has(g.id)) continue;
        if (!isGameVisibleForSession(g)) continue;
        const { normalizedGame } = normalizeGameFolderMetadata(g, g.id);
        if (!firestoreGamesMemoryStore.has(normalizedGame.id!)) {
          firestoreGamesMemoryStore.set(normalizedGame.id!, normalizedGame);
        }
      }
    }
  } catch (err) {
    // No se pudo leer la copia local: se completará descargando desde la nube (una sola vez por sesión)
    localCacheUnreadable = true;
    console.warn('[OFFLINE_ENGINE] Copia local no disponible:', err);
  }

  if (getCacheOwnerKey(sessionCtx) !== ownerKey) return;
  syncQueueMap.forEach((task, id) => {
    if (task && task.game && isGameVisibleForSession(task.game)) {
      firestoreGamesMemoryStore.set(id, normalizeGameFolderMetadata(task.game, id).normalizedGame);
    }
  });
  notifySavedGamesSubscribers(false);
}

async function bootstrapOfflineFirstEngine(): Promise<void> {
  if (hasBootstrappedIndexedDB || typeof window === 'undefined') return;
  hasBootstrappedIndexedDB = true;

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
            if (typeof id === 'string') deletedGameIdsSet.add(id);
          });
        }
      }
      const clrRaw = safeGetItem(STORAGE_KEY_CLEARED_SEQUENCE_BAR_IDS);
      if (clrRaw) {
        const parsed = JSON.parse(clrRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => {
            if (typeof id === 'string') clearedSequenceBarIdsSet.add(id);
          });
        }
      }
    } catch {
      // ignore
    }

    // 1. Las partidas locales se cargan cuando se conoce el usuario (prepareLocalCacheForSession)

    // 2. Load any pending tasks from IndexedDB Save Queue and resume processing
    const pendingTasks = await getAllQueueTasksFromIndexedDB();
    for (const task of pendingTasks) {
      if (task && task.gameId && task.game) {
        syncQueueMap.set(task.gameId, {
          ...task,
          status: 'pending',
          nextRetryAt: Date.now(),
        });
        const { normalizedGame } = normalizeGameFolderMetadata(task.game, task.gameId);
        if (isGameVisibleForSession(normalizedGame)) {
          firestoreGamesMemoryStore.set(task.gameId, normalizedGame);
        }
      }
    }

    updateSyncStatus({});
    if (syncQueueMap.size > 0) {
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
 * Detects the current date in Panama time formatted as YYYY-MM-DD (e.g. "2026-10-28").
 */
export function getCurrentLocalDateKey(): string {
  // Hora real (corregida si el reloj del dispositivo está mal) en zona horaria de Panamá
  return dateToAppDateKey(trustedNow());
}



/**
 * Detects the current time in Panama formatted as HH:mm:ss (24h format).
 * E.g. "16:05:47". Guaranteed to have seconds and uniform formatting.
 */
export function getCurrentLocalTimeString(): string {
  const p = getAppZoneParts(trustedNow());
  return `${p.hour}:${p.minute}:${p.second}`;
}

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
 * Scopes a key to a specific user/operator so their temporary UI state is isolated.
 */
export function getOperatorStorageKey(baseKey: string, user?: AppUser | null): string {
  if (!user) return baseKey;
  const id = user.id || user.uid || (user.email ? user.email.replace(/[^a-zA-Z0-9_-]/g, '_') : 'anon');
  return `${baseKey}_${id}`;
}

/**
 * Checks whether a saved game strictly belongs to a specific operator or user session.
 * Used to strictly separate operator sequence bars, round counters, and individual views.
 */
// ============================================================================
// CARPETAS POR TURNO
// Cada partida pertenece a la fecha en que INICIÓ su turno y a un número de turno
// de ese día (Turno 1, Turno 2...). Así un turno de noche que pasa de medianoche
// sigue en la carpeta del día en que empezó, y "Cerrar turno" abre una carpeta nueva.
// ============================================================================



/** Clave de carpeta: "YYYY-MM-DD" para el Turno 1 y "YYYY-MM-DD#t2", "#t3"... para los siguientes. */
export function getGameFolderKey(game: GameSequenceItem): string {
  const dateKey = getGameNormalizedDateKey(game);
  const n = getGameShiftNumber(game);
  return n > 1 ? `${dateKey}#t${n}` : dateKey;
}




/**
 * Para una partida NUEVA, decide en qué carpeta va (fecha + número de turno):
 * - Si su turno ya tiene partidas recientes, va a la misma carpeta (aunque ya sea otro día).
 * - Si es la primera partida del turno, va a la fecha de hoy (hora de Panamá) con el
 *   siguiente número de turno libre de ese día.
 */
function resolveShiftFolderForNewGame(
  item: GameSequenceItem,
  fallbackDateKey: string
): { dailyDate: string; shiftNumber: number } {
  if (!item.shiftId) {
    return { dailyDate: fallbackDateKey, shiftNumber: getGameShiftNumber(item) };
  }
  const today = getCurrentLocalDateKey();
  const itemFolder = sanitizeOperatorFolderName(item.operatorFolder || item.operatorName || 'Operadora Principal');
  // Datos originales (sin renumerar) de las partidas en el dispositivo, incluidas las pendientes de subir
  const mine = Array.from(firestoreGamesMemoryStore.values()).filter(
    (g) => g && g.id && !deletedGameIdsSet.has(g.id) && isSameOperatorGame(g, item, itemFolder)
  );
  // La regla está en saveRules.ts (con pruebas automáticas)
  return decideShiftFolderForNewGame({
    item,
    mine,
    today,
    nowMs: trustedNowMs(),
    getDateKey: getGameNormalizedDateKey,
  });
}

/**
 * Número de partida que le toca a la próxima partida del turno actual.
 * Devuelve null si no hay turno (se usa el conteo anterior por día).
 */
export function getNextRoundInShift(
  shiftId: string | undefined,
  operatorUid: string | undefined,
  operatorName: string | undefined,
  is90: boolean
): number | null {
  if (!shiftId) return null;
  const probe = { shiftId, operatorUid, operatorName } as GameSequenceItem;
  const folder = resolveShiftFolderForNewGame(probe, getCurrentLocalDateKey());
  const itemFolder = sanitizeOperatorFolderName(operatorName || 'Operadora Principal');
  const games = Array.from(firestoreGamesMemoryStore.values()).filter(
    (g) => g && g.id && !deletedGameIdsSet.has(g.id) && isSameOperatorGame(g, probe, itemFolder)
  );
  // La regla está en saveRules.ts (con pruebas automáticas)
  return computeNextRoundInShift({ games, folder, is90, getDateKey: getGameNormalizedDateKey });
}

export function isGameOfOperator(
  game: GameSequenceItem,
  user?: AppUser | null
): boolean {
  if (!user) return true;

  const opUid = user.id || user.uid;
  const opEmail = user.email ? user.email.trim().toLowerCase() : '';
  const opName = user.name ? user.name.trim().toLowerCase() : '';
  const opFolder = sanitizeOperatorFolderName(user.name);

  if (
    game.operatorUid &&
    opUid &&
    opUid !== 'anon' &&
    game.operatorUid !== 'anon' &&
    (game.operatorUid === opUid || game.operatorUid === user.id || game.operatorUid === user.uid)
  ) {
    return true;
  }

  if (game.operatorEmail && opEmail && game.operatorEmail.trim().toLowerCase() === opEmail) {
    return true;
  }

  if (game.operatorName && opName && game.operatorName.trim().toLowerCase() === opName) {
    return true;
  }

  if (game.operatorFolder && opName && sanitizeOperatorFolderName(game.operatorFolder) === opFolder) {
    return true;
  }

  if (!opUid && !opEmail && !opName) {
    return !game.operatorUid || game.operatorUid === 'anon';
  }

  return false;
}


/**
 * Extracts the true authoritative exact date (YYYY-MM-DD) of a game.
 * Evaluates dailyDate first (official single source of truth), then dateFormatted, shiftDate, etc.
 */
export function extractGameExactDate(game: Partial<GameSequenceItem>): string {
  if (!game) return getCurrentLocalDateKey();

  const fromDaily = parseDateStringToDateKey(game.dailyDate);
  if (fromDaily) return fromDaily;

  const fromFormatted = parseDateStringToDateKey(game.dateFormatted);
  if (fromFormatted) return fromFormatted;

  const fromShift = parseDateStringToDateKey(game.shiftDate);
  if (fromShift) return fromShift;

  const fromSavedAt = parseDateStringToDateKey((game as any).savedAtISO || (game as any).createdAtISO);
  if (fromSavedAt) return fromSavedAt;

  const fromSubfolder = parseDateStringToDateKey(game.subfolderDay);
  if (fromSubfolder) return fromSubfolder;

  if (game.folderPath) {
    const parts = game.folderPath.split('/');
    const lastPart = parts[parts.length - 1]?.trim();
    const fromPath = parseDateStringToDateKey(lastPart);
    if (fromPath) return fromPath;
  }

  if (game.id && typeof game.id === 'string') {
    const idDateMatch = game.id.match(/(\d{4}-\d{2}-\d{2})/);
    if (idDateMatch && idDateMatch[1]) {
      return idDateMatch[1];
    }
  }

  const rawUpdated = (game as any).updatedAt || (game as any).createdAt;
  if (rawUpdated) {
    try {
      const d =
        typeof rawUpdated.toDate === 'function'
          ? rawUpdated.toDate()
          : typeof rawUpdated.seconds === 'number'
            ? new Date(rawUpdated.seconds * 1000)
            : null;
      if (d && !isNaN(d.getTime())) {
        return dateToAppDateKey(d);
      }
    } catch {
      // ignore
    }
  }

  return getCurrentLocalDateKey();
}

/**
 * Extracts the current subfolder date (if any) where the game is currently located.
 */
export function extractCurrentSubfolderDate(game: Partial<GameSequenceItem>): string | null {
  if (!game) return null;
  if (game.subfolderDay) {
    const parsed = parseDateStringToDateKey(game.subfolderDay);
    if (parsed) return parsed;
  }
  if (game.folderPath) {
    const parts = game.folderPath.split('/');
    const lastPart = parts[parts.length - 1]?.trim();
    const parsed = parseDateStringToDateKey(lastPart);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Extracts a normalized YYYY-MM-DD date key from a GameSequenceItem.
 */
export function getGameNormalizedDateKey(game: GameSequenceItem): string {
  return extractGameExactDate(game);
}

/**
 * Extracts an explicit YYYY-MM-DD date from a game WITHOUT falling back to today's date.
 * Returns null if the game object lacks any explicit date metadata.
 */
export function hasExplicitGameDateKey(
  game: Partial<GameSequenceItem> | null | undefined
): string | null {
  if (!game) return null;

  const fromDaily = parseDateStringToDateKey(game.dailyDate);
  if (fromDaily) return fromDaily;

  const fromSubfolder = parseDateStringToDateKey(game.subfolderDay);
  if (fromSubfolder) return fromSubfolder;

  if (game.folderPath && typeof game.folderPath === 'string') {
    const parts = game.folderPath.split('/');
    const lastSegment = parts[parts.length - 1];
    const fromFolderPath = parseDateStringToDateKey(lastSegment);
    if (fromFolderPath) return fromFolderPath;
  }

  const fromFormatted = parseDateStringToDateKey(game.dateFormatted);
  if (fromFormatted) return fromFormatted;

  const fromShiftDate = parseDateStringToDateKey(game.shiftDate);
  if (fromShiftDate) return fromShiftDate;

  if (game.id && typeof game.id === 'string') {
    const idDateMatch = game.id.match(/(\d{4}-\d{2}-\d{2})/);
    if (idDateMatch && idDateMatch[1]) {
      return idDateMatch[1];
    }
  }

  return null;
}

/**
 * Verifies that a stored record is a valid saved game record (has a sheet snapshot, summary, or game data)
 * so all saved operator games and folders are always visible.
 */
export function isGenuineCompletedGameRecord(
  game: Partial<GameSequenceItem> | null | undefined
): boolean {
  if (!game) return false;
  if (game.savedViaNewGameFlow === false) return false;
  return true;
}

/**
 * Strictly validates that a game is a real saved game stored in today's subfolder (not an invented or dateless item,
 * not a fake intermediate "Mismos" movement save, and not deleted or cleared from the right sequence bar).
 */
export function isRealSavedGameInTodaySubfolder(
  game: Partial<GameSequenceItem> | null | undefined,
  todayKey = getCurrentLocalDateKey()
): boolean {
  if (!game || !game.id || typeof game.id !== 'string') return false;
  if (typeof game.round !== 'number' || game.round < 1) return false;
  if (deletedGameIdsSet.has(game.id) || clearedSequenceBarIdsSet.has(game.id)) return false;

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

  if (!isGenuineCompletedGameRecord(game)) return false;

  return true;
}

/**
 * Deterministic canonical document ID for a game based on operator, dailyDate, mode, round, and operatorUid.
 */
export function buildCanonicalGameId(
  operatorFolder: string,
  dailyDate: string,
  mode: BingoMode,
  round: number,
  operatorUid?: string
): string {
  const safeOp = sanitizeOperatorFolderName(operatorFolder).slice(0, 36);
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dailyDate) ? dailyDate : getCurrentLocalDateKey();
  const safeMode = mode === '90' ? '90' : '75';
  const safeRound = Math.max(1, Math.floor(Number(round) || 1));
  const safeUid =
    operatorUid && operatorUid !== 'anon'
      ? `_${operatorUid.slice(0, 10).replace(/[^a-zA-Z0-9]/g, '')}`
      : '';
  return `game_${safeOp}${safeUid}_${safeDate}_${safeMode}_r${safeRound}`;
}

/**
 * Normalizes a GameSequenceItem so its dailyDate, subfolderDay, operatorFolder, and folderPath
 * are 100% consistent with its exact date (YYYY-MM-DD).
 */
export function normalizeGameFolderMetadata(
  data: GameSequenceItem,
  fallbackId?: string
): {
  normalizedGame: GameSequenceItem;
  isMisplaced: boolean;
  reason?: string;
} {
  const exactDate = extractGameExactDate(data);
  const currentSubfolder = extractCurrentSubfolderDate(data);

  const operatorName = (data.operatorName || 'Operadora Principal').trim();
  const operatorFolder = sanitizeOperatorFolderName(data.operatorFolder || operatorName);
  const expectedSubfolder = exactDate;
  const expectedFolderPath = `${operatorFolder}/${expectedSubfolder}`;
  const mode: BingoMode = data.mode || (data.sheetType === 'traditional-90' ? '90' : '75');
  const validRound = typeof data.round === 'number' && data.round >= 1 ? data.round : 1;
  const resolvedId =
    data.id ||
    fallbackId ||
    buildCanonicalGameId(operatorFolder, exactDate, mode, validRound, data.operatorUid);

  const hasSubfolderMismatch = currentSubfolder !== null && currentSubfolder !== exactDate;
  const hasDailyDateMismatch = data.dailyDate !== exactDate;
  const hasSubfolderDayMismatch = data.subfolderDay !== expectedSubfolder;
  const hasFolderPathMismatch = data.folderPath !== expectedFolderPath;
  const hasOperatorMismatch = data.operatorFolder !== operatorFolder;

  const isMisplaced =
    hasSubfolderMismatch ||
    hasDailyDateMismatch ||
    hasSubfolderDayMismatch ||
    hasFolderPathMismatch ||
    hasOperatorMismatch;

  let reason = '';
  if (hasSubfolderMismatch) {
    reason = `Fecha de partida (${exactDate}) diferente a subcarpeta actual (${currentSubfolder})`;
  } else if (hasDailyDateMismatch) {
    reason = `dailyDate (${data.dailyDate}) difiere de fecha exacta (${exactDate})`;
  } else if (hasFolderPathMismatch) {
    reason = `folderPath (${data.folderPath}) no coincide con subcarpeta ${expectedFolderPath}`;
  } else if (hasSubfolderDayMismatch) {
    reason = `subfolderDay (${data.subfolderDay}) difiere de ${expectedSubfolder}`;
  } else if (hasOperatorMismatch) {
    reason = `operatorFolder (${data.operatorFolder}) normalizado a ${operatorFolder}`;
  }

  let dateFormatted = data.dateFormatted;
  if (!dateFormatted || !parseDateStringToDateKey(dateFormatted)) {
    const parts = exactDate.split('-');
    if (parts.length === 3) {
      dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  const normalizedGame: GameSequenceItem = {
    ...data,
    id: resolvedId,
    round: validRound,
    mode,
    dailyDate: exactDate,
    subfolderDay: expectedSubfolder,
    operatorFolder,
    folderPath: expectedFolderPath,
    operatorName,
    dateFormatted,
  };

  return { normalizedGame, isMisplaced, reason };
}

/**
 * Filters out fake intermediate "Mismos" saves, assigns exact sequential round numbers (1, 2, 3, 4...)
 * chronologically within each (operatorFolder, dailyDate, mode) subfolder, and sorts most recent first.
 */
function sortGamesChronologicallyDesc(games: GameSequenceItem[]): GameSequenceItem[] {
  const genuineGames = games.filter((g) => g && isGenuineCompletedGameRecord(g));

  // Group by operatorFolder + carpeta de turno (fecha + turno) + mode so each folder is numbered 1, 2, 3, 4...
  const groups = new Map<string, GameSequenceItem[]>();
  for (const g of genuineGames) {
    const dateKey = getGameFolderKey(g);
    const opFolder = sanitizeOperatorFolderName(g.operatorFolder || g.operatorName);
    const modeKey = g.mode === '90' || g.sheetType === 'traditional-90' ? '90' : '75';
    const groupKey = `${opFolder}__${dateKey}__${modeKey}`;
    const bucket = groups.get(groupKey);
    if (bucket) {
      bucket.push(g);
    } else {
      groups.set(groupKey, [g]);
    }
  }

  const renumbered: GameSequenceItem[] = [];
  for (const bucket of groups.values()) {
    // Orden del turno: por número de partida guardado (no por hora, porque un turno puede
    // pasar de medianoche: 11:50 p. m. va antes que 12:10 a. m.). Si el número se repite, por hora.
    bucket.sort((a, b) => {
      if ((a.round || 0) !== (b.round || 0)) {
        return (a.round || 0) - (b.round || 0);
      }
      const timeA = (a.timestamp || '').trim();
      const timeB = (b.timestamp || '').trim();
      return timeA.localeCompare(timeB);
    });

    bucket.forEach((g, idx) => {
      renumbered.push({
        ...g,
        round: idx + 1,
      });
    });
  }

  return renumbered.sort((a, b) => {
    const dateA = getGameNormalizedDateKey(a);
    const dateB = getGameNormalizedDateKey(b);
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    const shiftA = getGameShiftNumber(a);
    const shiftB = getGameShiftNumber(b);
    if (shiftB !== shiftA) {
      return shiftB - shiftA;
    }
    if ((b.round || 0) !== (a.round || 0)) {
      return (b.round || 0) - (a.round || 0);
    }
    return (b.timestamp || '').localeCompare(a.timestamp || '');
  });
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

const inFlightAutoHealIds = new Set<string>();
const savedGamesSubscribers = new Set<(games: GameSequenceItem[]) => void>();
let activeFirestoreUnsubscribe: (() => void) | null = null;
let cachedSortedGames: GameSequenceItem[] = [];
let activeHistoricalHydrationPromise: Promise<void> | null = null;

// ============================================================================
// SINCRONIZACIÓN EFICIENTE CON FIRESTORE
// - Administradores: reciben TODAS las partidas de todas las operadoras.
// - Operadoras: reciben SOLO sus partidas (campo ownerUid).
// - La primera vez en cada dispositivo se descarga el historial por páginas y se guarda en el
//   dispositivo (IndexedDB). Después solo se descargan las partidas nuevas o modificadas,
//   y en vivo solo se escuchan las partidas de HOY. Así se ahorran lecturas y datos.
// ============================================================================

const SYNC_PAGE_SIZE = 150;
const SYNC_OVERLAP_MS = 2 * 60 * 1000;
const OPERATOR_FULL_RESYNC_MS = 7 * 24 * 60 * 60 * 1000;
// Administradores: revisión rápida periódica mientras la página está abierta
const ADMIN_PERIODIC_SYNC_MS = 10 * 60 * 1000;
// Administradores: como máximo una descarga completa de reparación cada 12 horas
const ADMIN_INTEGRITY_RECHECK_MS = 12 * 60 * 60 * 1000;

interface GamesSyncMeta {
  lastFullSyncAt: number;
  lastServerUpdateMs: number;
  lastDeletionMs: number;
  lastDeltaDay: string;
  lastHintMs: number;
  lastIntegrityFullAt: number;
}

const EMPTY_SYNC_META: GamesSyncMeta = {
  lastFullSyncAt: 0,
  lastServerUpdateMs: 0,
  lastDeletionMs: 0,
  lastDeltaDay: '',
  lastHintMs: 0,
  lastIntegrityFullAt: 0,
};

function readSyncMeta(): GamesSyncMeta {
  if (!sessionCtx) return { ...EMPTY_SYNC_META };
  try {
    const raw = safeGetItem(SYNC_META_KEY_PREFIX + getCacheOwnerKey(sessionCtx));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return { ...EMPTY_SYNC_META, ...parsed };
    }
  } catch {
    // ignore
  }
  return { ...EMPTY_SYNC_META };
}

function writeSyncMeta(patch: Partial<GamesSyncMeta>): void {
  if (!sessionCtx) return;
  try {
    const next = { ...readSyncMeta(), ...patch };
    safeSetItem(SYNC_META_KEY_PREFIX + getCacheOwnerKey(sessionCtx), JSON.stringify(next));
  } catch {
    // ignore
  }
}

function timestampToMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === 'function') {
    try {
      return v.toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
}

let activeTodayUnsubscribe: (() => void) | null = null;
let activeTodayKey = '';
let dayWatchTimer: ReturnType<typeof setInterval> | null = null;
let pendingStopTimer: ReturnType<typeof setTimeout> | null = null;
let activeSyncRun: Promise<void> | null = null;
let syncGeneration = 0;
let lastAdminPeriodicSyncAt = 0;

function notifySavedGamesSubscribers(emitWindowEvent: boolean): void {
  cachedSortedGames = sortGamesChronologicallyDesc(Array.from(firestoreGamesMemoryStore.values()));
  syncTemporaryLocalCache(cachedSortedGames);
  savedGamesSubscribers.forEach((sub) => {
    try {
      sub(cachedSortedGames);
    } catch (cbErr) {
      console.warn('Error in saved_games subscriber callback:', cbErr);
    }
  });
  if (emitWindowEvent && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('bingo_saved_games_updated', { detail: { total: cachedSortedGames.length } })
    );
  }
}

function stopRemoteSync(): void {
  syncGeneration++;
  if (pendingStopTimer) {
    clearTimeout(pendingStopTimer);
    pendingStopTimer = null;
  }
  if (activeTodayUnsubscribe) {
    try {
      activeTodayUnsubscribe();
    } catch {
      // ignore
    }
    activeTodayUnsubscribe = null;
  }
  activeTodayKey = '';
  if (dayWatchTimer) {
    clearInterval(dayWatchTimer);
    dayWatchTimer = null;
  }
  activeSyncRun = null;
}

function ingestRemoteGameDoc(docKey: string, rawData: GameSequenceItem): number {
  const updatedMs = timestampToMs((rawData as unknown as { updatedAt?: unknown }).updatedAt);
  if (deletedGameIdsSet.has(docKey) || (rawData.id && deletedGameIdsSet.has(rawData.id))) {
    firestoreGamesMemoryStore.delete(docKey);
    void deleteGameFromIndexedDB(docKey);
    return updatedMs;
  }

  const pendingTask = syncQueueMap.get(docKey);
  if (pendingTask && pendingTask.status !== 'synced') {
    firestoreGamesMemoryStore.set(docKey, pendingTask.game);
    return updatedMs;
  }

  // Solo se ordena en memoria (ya no se escriben correcciones en Firestore desde cada dispositivo)
  const { normalizedGame } = normalizeGameFolderMetadata({ ...rawData, id: docKey }, docKey);
  const previous = firestoreGamesMemoryStore.get(docKey);
  const previousMs = previous ? timestampToMs((previous as unknown as { updatedAt?: unknown }).updatedAt) : -1;
  firestoreGamesMemoryStore.set(docKey, normalizedGame);
  // Solo se guarda en el dispositivo si la partida es nueva o cambió (y de una en una, para no saturarlo)
  if (!previous || updatedMs === 0 || previousMs !== updatedMs) {
    queueIndexedDBWrite(normalizedGame);
  }
  return updatedMs;
}

let idbWriteChain: Promise<void> = Promise.resolve();
function queueIndexedDBWrite(game: GameSequenceItem): void {
  idbWriteChain = idbWriteChain
    .then(() => saveGameToIndexedDB(game))
    .then(() => undefined)
    .catch(() => undefined);
}

function removeGameLocally(docKey: string): void {
  if (syncQueueMap.has(docKey)) return;
  firestoreGamesMemoryStore.delete(docKey);
  void deleteGameFromIndexedDB(docKey);
}

// Agrupa las actualizaciones seguidas (por ejemplo, varias operadoras guardando a la vez)
// en una sola actualización de pantalla cada 250 ms, para no saturar el navegador.
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
function broadcastMemoryStoreToSubscribers(): void {
  hasSyncedWithFirestore = true;
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    notifySavedGamesSubscribers(false);
  }, 250);
}

async function fetchVisibleGamesPage(afterId: string | null): Promise<QuerySnapshot<DocumentData>> {
  const ctx = sessionCtx!;
  const colRef = collection(db, 'saved_games');
  const constraints: any[] = [];
  if (!ctx.isAdmin) constraints.push(where('ownerUid', '==', ctx.uid));
  constraints.push(orderBy(documentId()));
  if (afterId) constraints.push(startAfter(afterId));
  constraints.push(limit(SYNC_PAGE_SIZE));
  return getDocs(query(colRef, ...constraints));
}

/**
 * Descarga completa (solo la primera vez en cada dispositivo, o cuando un administrador lo pide).
 */
async function runFullSync(generation: number, hintMs: number): Promise<void> {
  if (!sessionCtx) return;
  const meta = readSyncMeta();
  const seen = new Set<string>();
  let maxUpdated = 0;
  let pages = 0;
  let afterId: string | null = null;

  const ingestDocs = (docs: QueryDocumentSnapshot<DocumentData>[]) => {
    docs.forEach((d) => {
      seen.add(d.id);
      const ms = ingestRemoteGameDoc(d.id, d.data() as GameSequenceItem);
      if (ms > maxUpdated) maxUpdated = ms;
    });
  };

  try {
    while (pages < 500) {
      const snap = await fetchVisibleGamesPage(afterId);
      if (generation !== syncGeneration) return;
      updateSyncStatus({ isFirestoreReachable: true });
      ingestDocs(snap.docs);
      pages++;
      broadcastMemoryStoreToSubscribers();
      if (snap.docs.length < SYNC_PAGE_SIZE) break;
      afterId = snap.docs[snap.docs.length - 1].id;
    }
  } catch (pageErr) {
    if (pages > 0 || generation !== syncGeneration || !sessionCtx || sessionCtx.isAdmin) throw pageErr;
    // Respaldo para operadoras: una sola consulta sin paginar
    const snap = await getDocs(query(collection(db, 'saved_games'), where('ownerUid', '==', sessionCtx.uid)));
    if (generation !== syncGeneration) return;
    ingestDocs(snap.docs);
  }

  if (generation !== syncGeneration) return;

  // Las partidas que ya no existen en la nube (borradas por un administrador) se quitan del dispositivo
  for (const id of Array.from(firestoreGamesMemoryStore.keys())) {
    if (!seen.has(id)) removeGameLocally(id);
  }

  // La descarga solo se da por terminada cuando TODAS las partidas quedaron guardadas en el dispositivo.
  // (Si la página se cierra antes, la próxima vez se vuelve a descargar todo y no quedan partidas faltantes.)
  try {
    await idbWriteChain;
  } catch {
    // ignore
  }
  if (generation !== syncGeneration) return;

  writeSyncMeta({
    lastFullSyncAt: Date.now(),
    lastServerUpdateMs: Math.max(maxUpdated, meta.lastServerUpdateMs),
    lastDeletionMs: Math.max(meta.lastDeletionMs, maxUpdated),
    lastDeltaDay: getCurrentLocalDateKey(),
    lastHintMs: Math.max(hintMs, meta.lastHintMs || 0),
  });
  broadcastMemoryStoreToSubscribers();
}

/**
 * Administradores: comprueba (con un simple conteo, muy barato) si en el dispositivo
 * faltan partidas que sí existen en la nube.
 */
async function adminCacheLooksIncomplete(generation: number): Promise<boolean> {
  try {
    const snap = await getCountFromServer(collection(db, 'saved_games'));
    if (generation !== syncGeneration) return false;
    const serverCount = snap.data().count;
    let localSynced = 0;
    firestoreGamesMemoryStore.forEach((_g, id) => {
      const task = syncQueueMap.get(id);
      if (!task || task.status === 'synced') localSynced++;
    });
    if (serverCount > localSynced) {
      console.info('[SYNC] Faltan partidas en este dispositivo (' + localSynced + ' de ' + serverCount + '). Se completan.');
      return true;
    }
    return false;
  } catch (err) {
    console.info('[SYNC] Conteo de partidas no disponible por ahora:', err);
    return false;
  }
}

async function applyRemoteDeletions(sinceMs: number, generation: number): Promise<number> {
  try {
    return await applyRemoteDeletionsUnsafe(sinceMs, generation);
  } catch (err) {
    // Si el registro de borrados aún no está disponible (por ejemplo, reglas sin publicar), se sigue sin él
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : String(err);
    console.info('[SYNC] Registro de borrados no disponible por ahora:', code);
    return sinceMs;
  }
}

async function applyRemoteDeletionsUnsafe(sinceMs: number, generation: number): Promise<number> {
  const since = Math.max(0, sinceMs - SYNC_OVERLAP_MS);
  const snap = await getDocs(
    query(collection(db, 'deleted_games'), where('deletedAt', '>', Timestamp.fromMillis(since)))
  );
  if (generation !== syncGeneration) return sinceMs;
  let maxMs = sinceMs;
  snap.docs.forEach((d) => {
    const data = d.data();
    const id = (data && typeof data.gameId === 'string' && data.gameId) || d.id;
    const ms = timestampToMs(data && data.deletedAt);
    if (ms > maxMs) maxMs = ms;
    if (syncQueueMap.has(id)) return;
    deletedGameIdsSet.add(id);
    removeGameLocally(id);
  });
  if (!snap.empty) persistDeletedGameIds();
  return maxMs;
}

/**
 * Administradores: solo se descargan las partidas creadas o modificadas desde la última vez.
 */
async function runAdminDeltaSync(generation: number): Promise<void> {
  const meta = readSyncMeta();
  const since = Math.max(0, meta.lastServerUpdateMs - SYNC_OVERLAP_MS);
  const snap = await getDocs(
    query(collection(db, 'saved_games'), where('updatedAt', '>', Timestamp.fromMillis(since)))
  );
  if (generation !== syncGeneration) return;
  updateSyncStatus({ isFirestoreReachable: true });
  let maxUpdated = meta.lastServerUpdateMs;
  snap.docs.forEach((d) => {
    const ms = ingestRemoteGameDoc(d.id, d.data() as GameSequenceItem);
    if (ms > maxUpdated) maxUpdated = ms;
  });
  const deletionMs = await applyRemoteDeletions(meta.lastDeletionMs, generation);
  if (generation !== syncGeneration) return;
  writeSyncMeta({
    lastServerUpdateMs: maxUpdated,
    lastDeletionMs: deletionMs,
    lastDeltaDay: getCurrentLocalDateKey(),
  });
}

function dayKeysBetween(fromDay: string, toDay: string, maxDays: number): string[] {
  const keys: string[] = [];
  const end = new Date(toDay + 'T12:00:00');
  let start = fromDay ? new Date(fromDay + 'T12:00:00') : new Date(end.getTime());
  if (isNaN(start.getTime())) start = new Date(end.getTime());
  start.setDate(start.getDate() - 1); // también el día anterior (turnos de noche)
  const cursor = new Date(end.getTime());
  while (cursor.getTime() >= start.getTime() && keys.length < maxDays) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const dd = String(cursor.getDate()).padStart(2, '0');
    keys.push(y + '-' + m + '-' + dd);
    cursor.setDate(cursor.getDate() - 1);
  }
  return keys;
}

/**
 * Operadoras: se revisan solo los días recientes de SUS partidas.
 */
async function runOperatorDeltaSync(generation: number): Promise<void> {
  const ctx = sessionCtx!;
  const meta = readSyncMeta();
  const today = getCurrentLocalDateKey();
  const days = dayKeysBetween(meta.lastDeltaDay, today, 8);
  const colRef = collection(db, 'saved_games');
  for (const day of days) {
    const snap = await getDocs(query(colRef, where('ownerUid', '==', ctx.uid), where('dailyDate', '==', day)));
    if (generation !== syncGeneration) return;
    updateSyncStatus({ isFirestoreReachable: true });
    const serverIds = new Set<string>();
    snap.docs.forEach((d) => {
      serverIds.add(d.id);
      ingestRemoteGameDoc(d.id, d.data() as GameSequenceItem);
    });
    firestoreGamesMemoryStore.forEach((g, id) => {
      if (!serverIds.has(id) && g && g.ownerUid === ctx.uid && getGameNormalizedDateKey(g) === day) {
        removeGameLocally(id);
      }
    });
  }
  const deletionMs = await applyRemoteDeletions(meta.lastDeletionMs, generation);
  if (generation !== syncGeneration) return;
  writeSyncMeta({ lastDeletionMs: deletionMs, lastDeltaDay: today });
}

async function runSyncCycle(): Promise<void> {
  if (!sessionCtx || typeof window === 'undefined') return;
  if (activeSyncRun) return activeSyncRun;
  const generation = syncGeneration;

  const run = (async () => {
    try {
      const meta = readSyncMeta();
      if (localCacheUnreadable) {
        // La copia local no se pudo leer: se descarga todo una vez y se vuelve al modo normal
        await runFullSync(generation, 0);
        if (generation === syncGeneration) localCacheUnreadable = false;
        if (sessionCtx && sessionCtx.isAdmin) lastAdminPeriodicSyncAt = Date.now();
      } else if (sessionCtx!.isAdmin) {
        if (!meta.lastFullSyncAt) {
          await runFullSync(generation, 0);
        } else {
          await runAdminDeltaSync(generation);
          // Garantía: si al administrador le falta alguna partida en este dispositivo, se completa
          if (
            generation === syncGeneration &&
            Date.now() - (meta.lastIntegrityFullAt || 0) > ADMIN_INTEGRITY_RECHECK_MS &&
            (await adminCacheLooksIncomplete(generation))
          ) {
            writeSyncMeta({ lastIntegrityFullAt: Date.now() });
            if (generation === syncGeneration) await runFullSync(generation, 0);
          }
        }
        lastAdminPeriodicSyncAt = Date.now();
      } else {
        let hintMs = 0;
        try {
          const hint = await getDoc(doc(db, 'sync_hints', sessionCtx!.uid));
          if (hint.exists()) hintMs = timestampToMs(hint.data().fullResyncAt);
        } catch {
          hintMs = 0;
        }
        if (generation !== syncGeneration) return;
        const needsFull =
          !meta.lastFullSyncAt ||
          Date.now() - meta.lastFullSyncAt > OPERATOR_FULL_RESYNC_MS ||
          hintMs > (meta.lastHintMs || 0);
        if (needsFull) {
          await runFullSync(generation, hintMs);
        } else {
          try {
            await runOperatorDeltaSync(generation);
          } catch (deltaErr) {
            console.warn('[SYNC] Revisión rápida no disponible, se usa descarga completa:', deltaErr);
            if (generation === syncGeneration) await runFullSync(generation, hintMs);
          }
        }
      }
      if (generation === syncGeneration) broadcastMemoryStoreToSubscribers();
    } catch (err) {
      console.warn('[SYNC] Sincronización de partidas pendiente:', err);
      if (generation === syncGeneration) updateSyncStatus({ isFirestoreReachable: false });
    } finally {
      if (generation === syncGeneration) activeSyncRun = null;
    }
  })();

  activeSyncRun = run;
  return run;
}

function startTodayListener(): void {
  if (!sessionCtx) return;
  const today = getCurrentLocalDateKey();
  if (activeTodayUnsubscribe && activeTodayKey === today) return;
  if (activeTodayUnsubscribe) {
    try {
      activeTodayUnsubscribe();
    } catch {
      // ignore
    }
    activeTodayUnsubscribe = null;
  }
  activeTodayKey = today;
  const generation = syncGeneration;
  const colRef = collection(db, 'saved_games');
  const todayQuery = sessionCtx.isAdmin
    ? query(colRef, where('dailyDate', '==', today))
    : query(colRef, where('ownerUid', '==', sessionCtx.uid), where('dailyDate', '==', today));
  try {
    activeTodayUnsubscribe = onSnapshot(
      todayQuery,
      (snapshot) => {
        if (generation !== syncGeneration) return;
        updateSyncStatus({ isFirestoreReachable: true });
        let hasRemoved = false;
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'removed') {
            hasRemoved = true;
            return;
          }
          ingestRemoteGameDoc(change.doc.id, change.doc.data() as GameSequenceItem);
        });
        broadcastMemoryStoreToSubscribers();
        if (hasRemoved) void runSyncCycle();
      },
      (error) => {
        console.warn('[SYNC] Escucha en vivo de hoy pendiente:', error);
        updateSyncStatus({ isFirestoreReachable: false });
      }
    );
  } catch (err) {
    console.warn('[SYNC] No se pudo iniciar la escucha en vivo:', err);
  }
}

function startRemoteSync(): void {
  if (!sessionCtx || typeof window === 'undefined') return;
  initConnectionMonitor();
  startTodayListener();
  void runSyncCycle();
  if (!dayWatchTimer) {
    dayWatchTimer = setInterval(() => {
      if (!sessionCtx || !activeTodayUnsubscribe) return;
      if (activeTodayKey !== getCurrentLocalDateKey()) {
        startTodayListener();
        void runSyncCycle();
      } else if (
        sessionCtx.isAdmin &&
        Date.now() - lastAdminPeriodicSyncAt > ADMIN_PERIODIC_SYNC_MS &&
        (typeof document === 'undefined' || document.visibilityState === 'visible')
      ) {
        // Administradores: cada 10 minutos se traen solo las partidas nuevas o modificadas
        // (por ejemplo, partidas de días anteriores editadas después de medianoche)
        lastAdminPeriodicSyncAt = Date.now();
        void runSyncCycle();
      }
    }, 60000);
  }
}

function ensureSharedSavedGamesListener(): void {
  if (!sessionCtx || typeof window === 'undefined') return;
  if (!activeTodayUnsubscribe) startRemoteSync();
}

/**
 * Descarga de apoyo SOLO para borrados de administradores.
 * - Con fecha: solo las partidas de ese día.
 * - Sin fecha: si el administrador ya tiene todo el historial en el dispositivo, no descarga nada.
 */
async function fetchAllSavedGamesDocsPaginated(
  _pageSize = 60,
  onPageLoaded?: (docs: QueryDocumentSnapshot<DocumentData>[]) => void,
  dateKey?: string
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  if (!sessionCtx || !sessionCtx.isAdmin) return [];
  const colRef = collection(db, 'saved_games');
  if (dateKey) {
    const snap = await getDocs(query(colRef, where('dailyDate', '==', dateKey)));
    if (onPageLoaded && !snap.empty) onPageLoaded(snap.docs);
    return snap.docs;
  }
  if (readSyncMeta().lastFullSyncAt > 0) return [];
  const all: QueryDocumentSnapshot<DocumentData>[] = [];
  let afterId: string | null = null;
  for (let page = 0; page < 500; page++) {
    const constraints: any[] = [orderBy(documentId())];
    if (afterId) constraints.push(startAfter(afterId));
    constraints.push(limit(SYNC_PAGE_SIZE));
    const snap = await getDocs(query(colRef, ...constraints));
    all.push(...snap.docs);
    if (onPageLoaded && !snap.empty) onPageLoaded(snap.docs);
    if (snap.docs.length < SYNC_PAGE_SIZE) break;
    afterId = snap.docs[snap.docs.length - 1].id;
  }
  return all;
}

export async function hydrateAllHistoricalGamesInPages(): Promise<void> {
  if (typeof window === 'undefined' || !sessionCtx) return;
  ensureSharedSavedGamesListener();
  await runSyncCycle();
}

export function subscribeToSavedGamesFirestore(
  callback: (games: GameSequenceItem[]) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  savedGamesSubscribers.add(callback);
  if (pendingStopTimer) {
    clearTimeout(pendingStopTimer);
    pendingStopTimer = null;
  }
  ensureSharedSavedGamesListener();

  if (sessionCtx && (hasSyncedWithFirestore || firestoreGamesMemoryStore.size > 0)) {
    try {
      callback(sortGamesChronologicallyDesc(Array.from(firestoreGamesMemoryStore.values())));
    } catch (e) {
      console.warn('Initial subscriber callback error:', e);
    }
  }

  return () => {
    savedGamesSubscribers.delete(callback);
    if (savedGamesSubscribers.size === 0) {
      if (pendingStopTimer) clearTimeout(pendingStopTimer);
      // Pequeña espera para no cortar y reabrir la conexión cuando la pantalla solo se actualiza
      pendingStopTimer = setTimeout(() => {
        pendingStopTimer = null;
        if (savedGamesSubscribers.size === 0) stopRemoteSync();
      }, 5000);
    }
  };
}

let isReorganizationRunning = false;

/**
 * Scans all saved games using safe paginated batches (never exceeding Firestore's 128 MiB limit).
 * If any game has a date different from the subfolder where it is stored,
 * it is automatically moved to its correct subfolder.
 */
const reorganizeAttempted = new Set<string>();
let ownershipDirectoryCache: {
  at: number;
  byEmail: Map<string, string>;
  byLegacy: Map<string, string>;
  byUid: Set<string>;
} | null = null;

async function loadOwnershipDirectory() {
  if (ownershipDirectoryCache && Date.now() - ownershipDirectoryCache.at < 10 * 60 * 1000) {
    return ownershipDirectoryCache;
  }
  const snap = await getDocs(collection(db, 'users'));
  const byEmail = new Map<string, string>();
  const byLegacy = new Map<string, string>();
  const byUid = new Set<string>();
  snap.forEach((d) => {
    const data = d.data();
    if (d.id.startsWith('user_') || d.id.startsWith('admin_')) return; // cuentas antiguas sin Firebase Auth
    if (data.status === 'deleted') return;
    byUid.add(d.id);
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
    if (email && !byEmail.has(email)) byEmail.set(email, d.id);
    if (Array.isArray(data.legacyIds)) {
      data.legacyIds.forEach((lid: unknown) => {
        if (typeof lid === 'string') byLegacy.set(lid, d.id);
      });
    }
  });
  ownershipDirectoryCache = { at: Date.now(), byEmail, byLegacy, byUid };
  return ownershipDirectoryCache;
}

function resolveOwnerUidForLegacyGame(
  g: GameSequenceItem,
  dir: { byEmail: Map<string, string>; byLegacy: Map<string, string>; byUid: Set<string> }
): string | null {
  const opUid = g.operatorUid && g.operatorUid !== 'anon' ? g.operatorUid : '';
  if (opUid && dir.byUid.has(opUid)) return opUid;
  if (opUid && dir.byLegacy.has(opUid)) return dir.byLegacy.get(opUid) || null;
  const email = (g.operatorEmail || '').trim().toLowerCase();
  if (email && dir.byEmail.has(email)) return dir.byEmail.get(email) || null;
  return null;
}

/**
 * SOLO ADMINISTRADORES. Revisa todas las partidas:
 * - Corrige la subcarpeta si la fecha no coincide.
 * - Asigna la dueña (ownerUid) a las partidas antiguas para que cada operadora vea las suyas.
 * Cada partida se corrige una sola vez (no genera escrituras repetidas).
 */
export async function reorganizeAndHealAllStoredGames(): Promise<{
  totalChecked: number;
  reorganizedCount: number;
  details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }>;
}> {
  const details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }> = [];
  if (isReorganizationRunning || !sessionCtx || !sessionCtx.isAdmin) {
    return { totalChecked: firestoreGamesMemoryStore.size, reorganizedCount: 0, details };
  }

  isReorganizationRunning = true;
  let totalChecked = 0;
  let reorganizedCount = 0;

  try {
    await runSyncCycle();

    let dir: Awaited<ReturnType<typeof loadOwnershipDirectory>> | null = null;
    try {
      dir = await loadOwnershipDirectory();
    } catch (dirErr) {
      console.warn('[REORGANIZAR] No se pudo leer la lista de usuarios:', dirErr);
    }

    const updates: Array<{ id: string; patch: Record<string, unknown>; merged: GameSequenceItem; owner: string | null; misplaced: boolean; reason?: string; oldSubfolder: string }> = [];

    for (const [docKey, rawData] of Array.from(firestoreGamesMemoryStore.entries())) {
      if (!rawData || syncQueueMap.has(docKey)) continue;
      totalChecked++;
      if (reorganizeAttempted.has(docKey)) continue;
      reorganizeAttempted.add(docKey);

      const { normalizedGame, isMisplaced, reason } = normalizeGameFolderMetadata({ ...rawData, id: docKey }, docKey);
      const patch: Record<string, unknown> = {};
      if (isMisplaced) {
        patch.dailyDate = normalizedGame.dailyDate;
        patch.subfolderDay = normalizedGame.subfolderDay;
        patch.folderPath = normalizedGame.folderPath;
        patch.operatorFolder = normalizedGame.operatorFolder;
        patch.operatorName = normalizedGame.operatorName;
        patch.dateFormatted = normalizedGame.dateFormatted;
      }
      let owner: string | null = null;
      if (!normalizedGame.ownerUid && dir) {
        owner = resolveOwnerUidForLegacyGame(normalizedGame, dir);
        if (owner) patch.ownerUid = owner;
      }
      if (Object.keys(patch).length === 0) continue;
      patch.updatedAt = serverTimestamp();
      updates.push({
        id: docKey,
        patch,
        merged: owner ? { ...normalizedGame, ownerUid: owner } : normalizedGame,
        owner,
        misplaced: isMisplaced,
        reason,
        oldSubfolder: rawData.subfolderDay || rawData.folderPath || 'desconocida',
      });
    }

    const ownersToNotify = new Set<string>();
    for (let i = 0; i < updates.length; i += 400) {
      const chunk = updates.slice(i, i + 400);
      try {
        const batch = writeBatch(db);
        chunk.forEach((u) => batch.set(doc(db, 'saved_games', u.id), u.patch, { merge: true }));
        await batch.commit();
        chunk.forEach((u) => {
          firestoreGamesMemoryStore.set(u.id, u.merged);
          void saveGameToIndexedDB(u.merged);
          if (u.owner) ownersToNotify.add(u.owner);
          if (u.misplaced) {
            reorganizedCount++;
            details.push({
              id: u.id,
              round: u.merged.round,
              oldSubfolder: u.oldSubfolder,
              newSubfolder: u.merged.subfolderDay || u.merged.dailyDate || 'desconocida',
              reason: u.reason || 'Reorganización a fecha exacta',
            });
          }
        });
      } catch (batchErr) {
        console.warn('[REORGANIZAR] Lote no aplicado:', batchErr);
        chunk.forEach((u) => reorganizeAttempted.delete(u.id));
      }
    }

    // Avisar a cada operadora que vuelva a descargar su historial (ahora con sus partidas antiguas)
    for (const ownerUid of Array.from(ownersToNotify)) {
      setDoc(doc(db, 'sync_hints', ownerUid), { fullResyncAt: serverTimestamp() }, { merge: true }).catch(() => {});
    }

    notifySavedGamesSubscribers(true);
  } catch (err) {
    console.warn('Notice during reorganizeAndHealAllStoredGames:', err);
  } finally {
    isReorganizationRunning = false;
  }

  return { totalChecked, reorganizedCount, details };
}

/**
 * Returns all saved games from the authoritative Offline-First + Firestore memory store.
 */
export function getSavedGamesGallery(): GameSequenceItem[] {
  if (!sessionCtx) return [];
  if (hasSyncedWithFirestore || firestoreGamesMemoryStore.size > 0) {
    return sortGamesChronologicallyDesc(
      Array.from(firestoreGamesMemoryStore.values()).filter(
        (g) =>
          g &&
          g.id &&
          !deletedGameIdsSet.has(g.id) &&
          isGenuineCompletedGameRecord(g)
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
              (!item.id || !deletedGameIdsSet.has(item.id)) &&
              hasExplicitGameDateKey(item) !== null &&
              isGenuineCompletedGameRecord(item)
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

function canSessionWriteGame(g: GameSequenceItem | undefined): boolean {
  if (!g || !sessionCtx) return false;
  if (sessionCtx.isAdmin) return true;
  return Boolean(g.ownerUid && g.ownerUid === sessionCtx.uid);
}

function resolveExistingOrCanonicalDocId(
  item: GameSequenceItem,
  operatorFolder: string,
  dailyDate: string,
  mode: BingoMode,
  validRound: number
): { docId: string; duplicateIdsToClean: string[] } {
  // 1. Edición de una partida ya guardada (mismo ID)
  if (item.id && syncQueueMap.has(item.id)) {
    return { docId: item.id, duplicateIdsToClean: [] };
  }
  if (item.id && firestoreGamesMemoryStore.has(item.id) && canSessionWriteGame(firestoreGamesMemoryStore.get(item.id))) {
    return { docId: item.id, duplicateIdsToClean: [] };
  }

  // 2. Volver a guardar la MISMA ronda del mismo día (misma operadora y modalidad)
  const itemUid = item.operatorUid && item.operatorUid !== 'anon' ? item.operatorUid : null;
  const match = getSavedGamesGallery().find((g) => {
    if (!g || !g.id) return false;
    if (!syncQueueMap.has(g.id) && !canSessionWriteGame(firestoreGamesMemoryStore.get(g.id))) return false;
    const gUid = g.operatorUid && g.operatorUid !== 'anon' ? g.operatorUid : null;
    if (itemUid && gUid && itemUid !== gUid) return false;
    const gMode: BingoMode = g.mode || (g.sheetType === 'traditional-90' ? '90' : '75');
    // Debe ser también el mismo turno: el "Turno 2" nunca sobrescribe partidas del "Turno 1"
    if (getGameShiftNumber(g) !== getGameShiftNumber(item)) return false;
    if (item.shiftId && g.shiftId && item.shiftId !== g.shiftId) return false;
    // Se compara con el número de partida GUARDADO (la galería muestra uno renumerado)
    const rawRound = (firestoreGamesMemoryStore.get(g.id) || g).round;
    return (
      getGameNormalizedDateKey(g) === dailyDate &&
      sanitizeOperatorFolderName(g.operatorFolder || g.operatorName) === operatorFolder &&
      gMode === mode &&
      rawRound === validRound
    );
  });
  if (match && match.id) {
    return { docId: match.id, duplicateIdsToClean: [] };
  }

  // 3. Partida nueva: ID único. Nunca sobrescribe otra partida aunque coincida el número de ronda.
  const canonicalId = buildCanonicalGameId(operatorFolder, dailyDate, mode, validRound, item.operatorUid);
  const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { docId: canonicalId + '_' + uniqueSuffix, duplicateIdsToClean: [] };
}

function resolveOwnerUidForSave(item: GameSequenceItem, docId: string): string {
  const existing = firestoreGamesMemoryStore.get(docId);
  if (existing) return existing.ownerUid || item.ownerUid || '';
  if (item.ownerUid) return item.ownerUid;
  return sessionCtx ? sessionCtx.uid : '';
}

// ============================================================================
// SEQUENTIAL SAVE QUEUE & FIRESTORE VERIFICATION ENGINE
// ============================================================================

interface FirestoreGamePayload {
  id: string;
  ownerUid: string;
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
  shiftNumber?: number;
  shiftName?: string;
  shiftDate?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  updatedAt: FieldValue;
  playerSummarySnapshot?: PlayerSummarySnapshotItem[];
  sequenceSnapshot?: GameSequenceSnapshot;
  sheet75Snapshot?: BingoSheetData;
  sheet90Snapshot?: Traditional90SheetData;
  savedViaNewGameFlow?: boolean;
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
    ownerUid: normalizedItem.ownerUid || (sessionCtx && !sessionCtx.isAdmin ? sessionCtx.uid : ''),
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
    shiftNumber: getGameShiftNumber(normalizedItem),
    shiftName: normalizedItem.shiftName || '',
    shiftDate: normalizedItem.shiftDate || normalizedItem.dailyDate,
    shiftStartTime: normalizedItem.shiftStartTime || '',
    shiftEndTime: normalizedItem.shiftEndTime || '',
    savedViaNewGameFlow: Boolean(normalizedItem.savedViaNewGameFlow),
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

  if (!game.ownerUid && sessionCtx && !sessionCtx.isAdmin) {
    game = { ...game, ownerUid: sessionCtx.uid };
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
  if (!sessionCtx) return;
  if (isProcessingQueue) {
    // Watchdog check: if lock has been held longer than QUEUE_WATCHDOG_TIMEOUT_MS, force-release it
    if (queueLockAcquiredAt > 0 && Date.now() - queueLockAcquiredAt > QUEUE_WATCHDOG_TIMEOUT_MS) {
      console.warn('[SAVE_QUEUE] Liberando bloqueo estancado antes de procesar la cola.');
      isProcessingQueue = false;
      queueLockAcquiredAt = 0;
    } else {
      reprocessRequested = true;
      return;
    }
  }

  if (syncQueueMap.size === 0) {
    updateSyncStatus({ status: 'synced', activeSaveId: null });
    return;
  }

  isProcessingQueue = true;
  queueLockAcquiredAt = Date.now();
  reprocessRequested = false;

  try {
    // Prevent infinite loops within a single queue pass by tracking attempted gameIds in this pass
    const attemptedInCurrentPass = new Set<string>();

    while (syncQueueMap.size > 0) {
      // Refresh lock heartbeat at the start of each item
      queueLockAcquiredAt = Date.now();
      const now = Date.now();

      // Select all tasks whose retry timer is due (nextRetryAt <= now) and haven't failed in this exact pass
      const readyTasks = Array.from(syncQueueMap.values())
        .filter((t) => t.nextRetryAt <= now && !attemptedInCurrentPass.has(t.gameId) && isTaskForCurrentSession(t))
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
      syncQueueMap.set(nextTask.gameId, nextTask);
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
        syncQueueMap.delete(nextTask.gameId);
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

        syncQueueMap.set(nextTask.gameId, updatedTask);
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
    isProcessingQueue = false;
    queueLockAcquiredAt = 0;

    // Ensure no task remains stuck in 'syncing' state after loop finishes
    for (const [id, task] of Array.from(syncQueueMap.entries())) {
      if (task.status === 'syncing') {
        syncQueueMap.set(id, {
          ...task,
          status: task.lastError ? 'error' : 'pending',
        });
      }
    }

    // Guarantees indicator transitions to 'synced', 'pending', or 'error' — NEVER stuck in 'saving'
    updateSyncStatus({ activeSaveId: null });

    // Schedule next automatic retry for the earliest remaining task in the queue
    if (syncQueueMap.size > 0) {
      const now = Date.now();
      const earliestRetryAt = Math.min(
        ...Array.from(syncQueueMap.values()).map((t) => t.nextRetryAt || now + 1000)
      );
      const waitMs = Math.max(500, earliestRetryAt - now);

      if (retryTimerHandle) clearTimeout(retryTimerHandle);
      retryTimerHandle = setTimeout(() => {
        retryTimerHandle = null;
        void processSaveQueue();
      }, waitMs);
    }

    // If a new game was enqueued while the queue was finishing up, process it immediately
    if (reprocessRequested) {
      reprocessRequested = false;
      const hasImmediate = Array.from(syncQueueMap.values()).some((t) => t.nextRetryAt <= Date.now());
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
  //    Partida nueva: carpeta = fecha de inicio de su turno + número de turno.
  //    Edición de una partida ya guardada: conserva su carpeta.
  const isEditOfExisting = Boolean(item.id && (syncQueueMap.has(item.id) || firestoreGamesMemoryStore.has(item.id)));
  const itemDateKey = getGameNormalizedDateKey(item);
  const shiftFolder = isEditOfExisting
    ? { dailyDate: itemDateKey, shiftNumber: getGameShiftNumber(item) }
    : resolveShiftFolderForNewGame(item, itemDateKey);
  const dailyDate = shiftFolder.dailyDate;
  item = {
    ...item,
    dailyDate,
    shiftNumber: shiftFolder.shiftNumber,
    // shiftDate guarda la misma fecha de la carpeta del turno
    shiftDate: isEditOfExisting ? item.shiftDate : dailyDate,
  };
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
  if (dailyDate !== itemDateKey) {
    // La fecha visible siempre coincide con la carpeta del turno
    const [fy, fm, fd] = dailyDate.split('-').map(Number);
    formattedDate = new Date(fy, fm - 1, fd).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
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
    shiftNumber: shiftFolder.shiftNumber,
    subfolderDay,
    operatorFolder,
    folderPath,
    operatorName,
    operatorUid: item.operatorUid || 'anon',
    ownerUid: resolveOwnerUidForSave(item, docId),
    operatorEmail: item.operatorEmail || '',
    dateFormatted: formattedDate,
    timestamp: exactTimestamp,
    totalLinesPlayed: exactLines,
    sequenceSnapshot: cleanSequenceSnapshot,
  };

  // 3. STEP 1 OF OFFLINE-FIRST: Save immediately to IndexedDB & Memory Store
  if (deletedGameIdsSet.has(docId)) {
    deletedGameIdsSet.delete(docId);
    persistDeletedGameIds();
  }
  if (clearedSequenceBarIdsSet.has(docId)) {
    clearedSequenceBarIdsSet.delete(docId);
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
  const existingTask = syncQueueMap.get(docId);
  const queueTask: QueuedSaveTask = {
    gameId: docId,
    game: normalizedItem,
    enqueuedAt: existingTask ? existingTask.enqueuedAt : Date.now(),
    retryCount: 0,
    nextRetryAt: Date.now(),
    lastError: null,
    status: 'pending',
  };

  syncQueueMap.set(docId, queueTask);
  await putQueueTaskInIndexedDB(queueTask);
  updateSyncStatus({});

  // Clean up any legacy duplicate IDs
  if (duplicateIdsToClean.length > 0) {
    for (const dupId of duplicateIdsToClean) {
      firestoreGamesMemoryStore.delete(dupId);
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

  const isAlreadySynced = !syncQueueMap.has(docId);
  const latestGame = firestoreGamesMemoryStore.get(docId) || normalizedItem;

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
  firestoreGamesMemoryStore.set(normalizedGame.id!, normalizedGame);

  const allGames = sortGamesChronologicallyDesc(
    Array.from(firestoreGamesMemoryStore.values())
  );
  cachedSortedGames = allGames;
  syncTemporaryLocalCache(allGames);

  savedGamesSubscribers.forEach((sub) => {
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

  // Se guarda la dueña de cada partida antes de quitarla de memoria (para el registro de borrados)
  const deletedOwners = new Map<string, string>();
  idsToDelete.forEach((id) => {
    const g = firestoreGamesMemoryStore.get(id);
    deletedOwners.set(id, (g && g.ownerUid) || '');
  });

  // 1. Register tombstones immediately so onSnapshot / auto-heal can NEVER resurrect these games
  for (const docId of idsToDelete) {
    deletedGameIdsSet.add(docId);
    syncQueueMap.delete(docId);
    firestoreGamesMemoryStore.delete(docId);
  }
  persistDeletedGameIds();

  // 2. Purge from local sequence bars and notify all UI subscribers in 0ms
  purgeDeletedGamesFromLocalSequenceBars(idsToDelete, matchingItems);

  updateSyncStatus({});
  const remaining = sortGamesChronologicallyDesc(
    Array.from(firestoreGamesMemoryStore.values())
  );
  cachedSortedGames = remaining;
  syncTemporaryLocalCache(remaining);

  savedGamesSubscribers.forEach((sub) => {
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
        // Registro del borrado: los demás dispositivos lo aplican sin volver a descargar todo
        await setDoc(doc(db, 'deleted_games', docId), {
          gameId: docId,
          ownerUid: deletedOwners.get(docId) || '',
          deletedAt: serverTimestamp(),
          deletedBy: sessionCtx ? sessionCtx.uid : '',
        });
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

    const hasExactIdMatch = Boolean(targetId) && combined.some((g) => Boolean(g && g.id === targetId));
    const matchingItems = combined.filter((g) => {
      if (!g) return false;
      if (targetId && g.id === targetId) return true;
      // Si la partida existe con su ID, se borra SOLO esa (nunca otras con el mismo número de ronda)
      if (hasExactIdMatch) return false;
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
  modeFilter?: '75' | '90',
  currentUser?: AppUser | null
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

  for (const [docId, g] of firestoreGamesMemoryStore.entries()) {
    if (!g) continue;
    if (currentUser && !isGameOfOperator(g, currentUser)) continue;
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
    clearedSequenceBarIdsSet.add(id);
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

  const allGames = sortGamesChronologicallyDesc(
    Array.from(firestoreGamesMemoryStore.values())
  );
  cachedSortedGames = allGames;
  savedGamesSubscribers.forEach((sub) => {
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
    // La carpeta es de un turno: "YYYY-MM-DD" (Turno 1) o "YYYY-MM-DD#t2"... Solo se borra ESE turno.
    const folderInfo = parseGameFolderKey(dateKey);
    dateKey = folderInfo.dateKey;

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
        (gDate === dateKey || g.dailyDate === dateKey || g.subfolderDay === dateKey) &&
        getGameShiftNumber(g) === folderInfo.shiftNumber;

      if (matchesOp && matchesDate) {
        const resolvedId = docId || g.id;
        if (resolvedId) idsToDelete.add(resolvedId);
        matchingItems.push(g);
      }
    };

    for (const [docId, g] of firestoreGamesMemoryStore.entries()) {
      checkAndCollect(docId, g);
    }

    const localIdbGames = await getAllGamesFromIndexedDB();
    for (const g of localIdbGames) {
      checkAndCollect(g.id, g);
    }

    try {
      const docs = await fetchAllSavedGamesDocsPaginated(60, undefined, dateKey);
      docs.forEach((docSnap) => {
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

    for (const [docId, g] of firestoreGamesMemoryStore.entries()) {
      checkAndCollect(docId, g);
    }

    const localIdbGames = await getAllGamesFromIndexedDB();
    for (const g of localIdbGames) {
      checkAndCollect(g.id, g);
    }

    try {
      const docs = await fetchAllSavedGamesDocsPaginated(60);
      docs.forEach((docSnap) => {
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

    for (const [docId, g] of firestoreGamesMemoryStore.entries()) {
      checkAndCollect(docId, g);
    }

    const localIdbGames = await getAllGamesFromIndexedDB();
    for (const g of localIdbGames) {
      checkAndCollect(g.id, g);
    }

    try {
      const docs = await fetchAllSavedGamesDocsPaginated(60);
      docs.forEach((docSnap) => {
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

// ============================================================================
// CENTRALIZED USERS & ACTIVITY LOGS SERVICES (NO DIRECT FIRESTORE IN COMPONENTS)
// ============================================================================

export function subscribeToUsersCentralized(
  onData: (users: AppUser[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!sessionCtx || !sessionCtx.isAdmin) {
    // Las operadoras no pueden ver la lista de usuarios: solo reciben su propio perfil
    const self: AppUser[] = sessionCtx
      ? [
          {
            id: sessionCtx.uid,
            uid: sessionCtx.uid,
            name: sessionCtx.name || 'Operador',
            email: sessionCtx.email || '',
            role: 'operator',
            status: 'active',
            assignedMode: '75',
          } as AppUser,
        ]
      : [];
    try {
      onData(self);
    } catch {
      // ignore
    }
    return () => {};
  }
  try {
    return onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const all: Array<{ id: string; data: Record<string, any> }> = [];
        snapshot.forEach((docSnap) => {
          all.push({ id: docSnap.id, data: docSnap.data() });
        });
        const isLegacyId = (id: string) => id.startsWith('user_') || id.startsWith('admin_');
        const modernEmails = new Set<string>();
        all.forEach((u) => {
          const email = typeof u.data.email === 'string' ? u.data.email.trim().toLowerCase() : '';
          if (!isLegacyId(u.id) && email && u.data.status !== 'deleted') modernEmails.add(email);
        });

        const users: AppUser[] = [];
        all.forEach(({ id, data }) => {
          if (data.status === 'deleted') return;
          const emailLower = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
          // Cuenta antigua que ya fue migrada a Firebase Authentication: no se duplica en la lista
          if (isLegacyId(id) && emailLower && modernEmails.has(emailLower)) return;
          const resolvedRole: 'admin' | 'operator' = data.role === 'admin' ? 'admin' : 'operator';
          users.push({
            id,
            uid: id,
            name: data.name || 'Operador',
            email: data.email || '',
            role: resolvedRole,
            status: data.status === 'suspended' ? 'suspended' : data.status === 'pending' ? 'pending' : 'active',
            joinedDate: data.joinedDate || '',
            createdAt: data.createdAt,
            lastActive: data.lastActive || 'Reciente',
            gamesPlayed: data.gamesPlayed || 0,
            notes: data.notes || '',
            avatarColor: data.avatarColor || (resolvedRole === 'admin' ? '#f59e0b' : '#10b981'),
            assignedMode: resolvedRole === 'admin' ? 'all' : (data.assignedMode || '75'),
          });
        });
        onData(users);
      },
      (err) => {
        onError?.(err);
      }
    );
  } catch (err) {
    onError?.(err);
    return () => {};
  }
}

export function subscribeToActivityLogsCentralized(
  onData: (logs: ActivityLogItem[], addedChanges: ActivityLogItem[]) => void,
  onError?: (err: unknown) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  if (!sessionCtx || !sessionCtx.isAdmin) {
    try {
      onData([], []);
    } catch {
      // ignore
    }
    return () => {};
  }
  try {
    const activityRef = collection(db, 'activity_logs');
    const q = query(activityRef, orderBy('createdAt', 'desc'), limit(120));
    return onSnapshot(
      q,
      (snapshot) => {
        const addedChanges: ActivityLogItem[] = [];
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            addedChanges.push({
              id: change.doc.id,
              operatorUid: data.operatorUid || '',
              operatorName: data.operatorName || 'Operador',
              operatorEmail: data.operatorEmail || '',
              action: data.action || '',
              actionType: data.actionType || 'draw_ball',
              details: data.details || '',
              timestamp: data.timestamp || new Date().toISOString(),
              mode: data.mode || '75',
            });
          }
        });

        const logs: ActivityLogItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          logs.push({
            id: docSnap.id,
            operatorUid: data.operatorUid || '',
            operatorName: data.operatorName || 'Operador',
            operatorEmail: data.operatorEmail || '',
            action: data.action || '',
            actionType: data.actionType || 'draw_ball',
            details: data.details || '',
            timestamp: data.timestamp || new Date().toISOString(),
            mode: data.mode || '75',
          });
        });

        onData(logs, addedChanges);
      },
      (err) => {
        onError?.(err);
      }
    );
  } catch (err) {
    onError?.(err);
    return () => {};
  }
}

export async function updateUserFieldsCentralized(
  userId: string,
  fields: Partial<Pick<AppUser, 'role' | 'status' | 'assignedMode' | 'name' | 'notes'>>
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, sanitizeForFirestore(fields));
}

/**
 * SOLO ADMINISTRADORES. Elimina un usuario: ya no podrá entrar a la plataforma.
 * Sus partidas guardadas se conservan para el historial.
 */
export async function deleteUserCentralized(userId: string): Promise<void> {
  if (!sessionCtx || !sessionCtx.isAdmin) {
    throw new Error('Solo los administradores pueden eliminar usuarios.');
  }
  if (userId === sessionCtx.uid) {
    throw new Error('No puedes eliminar tu propia cuenta.');
  }
  await updateDoc(doc(db, 'users', userId), {
    status: 'deleted',
    role: 'operator',
    deletedAt: serverTimestamp(),
    deletedBy: sessionCtx.uid,
  });
}
