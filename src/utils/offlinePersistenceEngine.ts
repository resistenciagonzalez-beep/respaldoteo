import { GameSequenceItem } from '../types';

export type SyncStatusType = 'synced' | 'saving' | 'pending' | 'error';

export interface SyncStatusState {
  status: SyncStatusType;
  pendingCount: number;
  activeSaveId: string | null;
  lastError: string | null;
  isOnline: boolean;
  isFirestoreReachable: boolean;
  lastSyncedAt: string | null;
}

export interface DiagnosticSaveLog {
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
}

export interface QueuedSaveTask {
  gameId: string;
  game: GameSequenceItem;
  enqueuedAt: number;
  retryCount: number;
  nextRetryAt: number;
  lastError: string | null;
  status: 'pending' | 'syncing' | 'synced' | 'error';
}

const DB_NAME = 'BolilleroOfflineFirstDB_v1';
const DB_VERSION = 1;
const STORE_GAMES = 'games_store';
const STORE_QUEUE = 'save_queue_store';
const STORE_LOGS = 'diagnostic_logs_store';

// Exponential Backoff schedule in milliseconds: 1s, 2s, 4s, 8s, 15s, 30s, 60s
export const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000, 60000];

let dbPromise: Promise<IDBDatabase> | null = null;
const diagnosticLogsMemory: DiagnosticSaveLog[] = [];
const MAX_DIAGNOSTIC_LOGS = 200;

/**
 * Opens or returns the singleton IndexedDB connection.
 */
export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_GAMES)) {
          const gamesStore = db.createObjectStore(STORE_GAMES, { keyPath: 'id' });
          gamesStore.createIndex('dailyDate', 'dailyDate', { unique: false });
          gamesStore.createIndex('operatorFolder', 'operatorFolder', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: 'gameId' });
        }
        if (!db.objectStoreNames.contains(STORE_LOGS)) {
          db.createObjectStore(STORE_LOGS, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Immediately saves a game to IndexedDB (Offline-First Primary Local Persistence).
 */
export async function saveGameToIndexedDB(game: GameSequenceItem): Promise<void> {
  if (!game || !game.id) {
    throw new Error('Cannot save game to IndexedDB without a valid ID');
  }
  try {
    const db = await openOfflineDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_GAMES], 'readwrite');
      const store = tx.objectStore(STORE_GAMES);
      const clone = JSON.parse(JSON.stringify(game));
      store.put(clone);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB save game failed'));
    });
  } catch (err) {
    console.warn('[IndexedDB] Fallback warning while saving game:', err);
  }
}

/**
 * Loads all locally persisted games from IndexedDB.
 */
export async function getAllGamesFromIndexedDB(): Promise<GameSequenceItem[]> {
  try {
    const db = await openOfflineDatabase();
    return await new Promise<GameSequenceItem[]>((resolve, reject) => {
      const tx = db.transaction([STORE_GAMES], 'readonly');
      const store = tx.objectStore(STORE_GAMES);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Could not load games from IndexedDB:', err);
    return [];
  }
}

/**
 * Deletes a game from IndexedDB and removes any pending queue task for it.
 */
export async function deleteGameFromIndexedDB(gameId: string): Promise<void> {
  if (!gameId) return;
  try {
    const db = await openOfflineDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_GAMES, STORE_QUEUE], 'readwrite');
      tx.objectStore(STORE_GAMES).delete(gameId);
      tx.objectStore(STORE_QUEUE).delete(gameId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Error deleting game from IndexedDB:', err);
  }
}

/**
 * Adds or updates a task in the persistent IndexedDB Save Queue.
 */
export async function putQueueTaskInIndexedDB(task: QueuedSaveTask): Promise<void> {
  try {
    const db = await openOfflineDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_QUEUE], 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      store.put(JSON.parse(JSON.stringify(task)));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Error writing queue task:', err);
  }
}

/**
 * Removes a completed task from the persistent IndexedDB Save Queue.
 */
export async function removeQueueTaskFromIndexedDB(gameId: string): Promise<void> {
  try {
    const db = await openOfflineDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_QUEUE], 'readwrite');
      const store = tx.objectStore(STORE_QUEUE);
      store.delete(gameId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('[IndexedDB] Error removing queue task:', err);
  }
}

/**
 * Reads all pending tasks from the persistent IndexedDB Save Queue, ordered by enqueuedAt.
 */
export async function getAllQueueTasksFromIndexedDB(): Promise<QueuedSaveTask[]> {
  try {
    const db = await openOfflineDatabase();
    const list = await new Promise<QueuedSaveTask[]>((resolve, reject) => {
      const tx = db.transaction([STORE_QUEUE], 'readonly');
      const store = tx.objectStore(STORE_QUEUE);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
    return list.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  } catch (err) {
    console.warn('[IndexedDB] Error reading queue tasks:', err);
    return [];
  }
}

/**
 * Records an internal diagnostic save log in memory and IndexedDB.
 */
export async function recordDiagnosticSaveLog(entry: DiagnosticSaveLog): Promise<void> {
  diagnosticLogsMemory.unshift(entry);
  if (diagnosticLogsMemory.length > MAX_DIAGNOSTIC_LOGS) {
    diagnosticLogsMemory.length = MAX_DIAGNOSTIC_LOGS;
  }

  console.info(
    `[DIAGNOSTIC_LOG] [${entry.startTime}] Game: ${entry.gameId} (Ronda #${entry.round}, Fecha: ${entry.dailyDate}) | Resultado: ${entry.result} | Duración: ${entry.durationMs}ms | Reintentos: ${entry.retryCount}${entry.errorMessage ? ` | Error: ${entry.errorMessage}` : ''}`
  );

  try {
    const db = await openOfflineDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_LOGS], 'readwrite');
      tx.objectStore(STORE_LOGS).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Non-blocking diagnostic persistence
  }
}

/**
 * Returns the internal diagnostic logs for auditing.
 */
export function getDiagnosticSaveLogs(): DiagnosticSaveLog[] {
  return [...diagnosticLogsMemory];
}
