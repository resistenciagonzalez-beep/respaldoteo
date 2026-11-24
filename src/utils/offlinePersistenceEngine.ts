import { GameSequenceItem } from '../types';

export type SyncStatusType = 'synced' | 'saving' | 'pending' | 'error';

export interface QueueTaskDiagnosticItem {
  gameId: string;
  round: number;
  dailyDate: string;
  operatorName: string;
  status: 'pending' | 'syncing' | 'synced' | 'error';
  retryCount: number;
  lastError: string | null;
  nextRetryAt: number;
  enqueuedAt: number;
}

export interface SyncStatusState {
  status: SyncStatusType;
  pendingCount: number;
  syncingCount: number;
  syncedCount: number;
  errorCount: number;
  activeSaveId: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  isOnline: boolean;
  isFirestoreReachable: boolean;
  lastSyncedAt: string | null;
  queueItems: QueueTaskDiagnosticItem[];
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
const DB_VERSION = 2;
const STORE_GAMES = 'games_store';
const STORE_QUEUE = 'save_queue_store';
const STORE_LOGS = 'diagnostic_logs_store';
const STORE_KV_CACHE = 'kv_cache_store';

// Safe size thresholds (bytes)
export const MAX_LOCAL_STORAGE_ITEM_BYTES = 4 * 1024; // 4 KB max per small config item in localStorage
export const MAX_LOCAL_STORAGE_TOTAL_BYTES = 256 * 1024; // 256 KB max total across localStorage
export const MAX_INDEXEDDB_ITEM_BYTES = 8 * 1024 * 1024; // 8 MB max per record in IndexedDB

// Exponential Backoff schedule in milliseconds: 1s, 2s, 4s, 8s, 15s, 30s, 60s
export const BACKOFF_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000, 60000];

let dbPromise: Promise<IDBDatabase> | null = null;
const diagnosticLogsMemory: DiagnosticSaveLog[] = [];
const MAX_DIAGNOSTIC_LOGS = 200;

/**
 * Fast, accurate UTF-8 byte size estimation for strings or serializable objects.
 * Used before writing to localStorage or IndexedDB to prevent QuotaExceededError.
 */
export function estimateByteSize(data: unknown): number {
  if (data === null || data === undefined) return 0;
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    if (!str) return 0;
    if (typeof Blob !== 'undefined') {
      return new Blob([str]).size;
    }
    return str.length * 2;
  } catch {
    return 0;
  }
}

/**
 * Strips oversized base64 images from a game clone if the serialized game exceeds safe IndexedDB limits.
 */
function ensureSafeGamePayloadSize(game: GameSequenceItem): GameSequenceItem {
  const clone: GameSequenceItem = JSON.parse(JSON.stringify(game));
  const initialSize = estimateByteSize(clone);
  if (initialSize > 1024 * 1024) {
    if (clone.cageSnapshotImage) {
      delete clone.cageSnapshotImage;
    }
    if (
      clone.sheet75Snapshot?.background?.url &&
      clone.sheet75Snapshot.background.url.startsWith('data:image') &&
      clone.sheet75Snapshot.background.url.length > 100000
    ) {
      clone.sheet75Snapshot.background.url = '';
    }
    if (clone.sequenceSnapshot?.gameSequence && clone.sequenceSnapshot.gameSequence.length > 30) {
      clone.sequenceSnapshot.gameSequence = clone.sequenceSnapshot.gameSequence.slice(0, 30);
    }
  }
  return clone;
}

/**
 * Wraps any Promise with a strict timeout and always clears the timer in finally.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`Timeout (${timeoutMs}ms) en operación: ${operationName}`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
  });
}

/**
 * Opens or returns the singleton IndexedDB connection with a strict timeout.
 */
export function openOfflineDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (dbPromise) return dbPromise;

  const rawOpenPromise = new Promise<IDBDatabase>((resolve, reject) => {
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
        if (!db.objectStoreNames.contains(STORE_KV_CACHE)) {
          db.createObjectStore(STORE_KV_CACHE, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        db.onclose = () => {
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        reject(request.error || new Error('Failed to open IndexedDB'));
      };

      request.onblocked = () => {
        dbPromise = null;
        reject(new Error('IndexedDB connection blocked'));
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  dbPromise = withTimeout(rawOpenPromise, 2500, 'openOfflineDatabase').catch((err) => {
    dbPromise = null;
    throw err;
  });

  return dbPromise;
}

/**
 * Immediately saves a game to IndexedDB (Offline-First Primary Local Persistence).
 * Checks payload size before writing and never throws to avoid interrupting game save flow.
 */
export async function saveGameToIndexedDB(game: GameSequenceItem): Promise<void> {
  if (!game || !game.id) {
    return;
  }
  try {
    const safeClone = ensureSafeGamePayloadSize(game);
    const payloadBytes = estimateByteSize(safeClone);
    if (payloadBytes > MAX_INDEXEDDB_ITEM_BYTES) {
      console.warn(
        `[IndexedDB] Partida ${game.id} supera el tamaño máximo recomendado (${payloadBytes} bytes). Se omiten adjuntos pesados.`
      );
    }

    await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_GAMES], 'readwrite');
          const store = tx.objectStore(STORE_GAMES);
          store.put(safeClone);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error('IndexedDB save game failed'));
          tx.onabort = () => reject(tx.error || new Error('IndexedDB save game aborted'));
        });
      })(),
      2500,
      `saveGameToIndexedDB(${game.id})`
    );
  } catch (err) {
    console.warn('[IndexedDB] Fallback warning while saving game (continuing in memory & Firestore queue):', err);
  }
}

/**
 * Loads all locally persisted games from IndexedDB.
 */
/**
 * Igual que getAllGamesFromIndexedDB, pero si falla o tarda demasiado LANZA el error
 * (en vez de devolver una lista vacía), para que quien la usa sepa que la copia local
 * no se pudo leer y no la confunda con "no hay partidas".
 */
export async function getAllGamesFromIndexedDBStrict(timeoutMs: number = 15000): Promise<GameSequenceItem[]> {
  return withTimeout(
    (async () => {
      const db = await openOfflineDatabase();
      return await new Promise<GameSequenceItem[]>((resolve, reject) => {
        const tx = db.transaction([STORE_GAMES], 'readonly');
        const store = tx.objectStore(STORE_GAMES);
        const req = store.getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => reject(req.error);
      });
    })(),
    timeoutMs,
    'getAllGamesFromIndexedDBStrict'
  );
}

export async function getAllGamesFromIndexedDB(): Promise<GameSequenceItem[]> {
  try {
    return await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        return await new Promise<GameSequenceItem[]>((resolve, reject) => {
          const tx = db.transaction([STORE_GAMES], 'readonly');
          const store = tx.objectStore(STORE_GAMES);
          const req = store.getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
          req.onerror = () => reject(req.error);
        });
      })(),
      3000,
      'getAllGamesFromIndexedDB'
    );
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
    await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_GAMES, STORE_QUEUE], 'readwrite');
          tx.objectStore(STORE_GAMES).delete(gameId);
          tx.objectStore(STORE_QUEUE).delete(gameId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      })(),
      2500,
      `deleteGameFromIndexedDB(${gameId})`
    );
  } catch (err) {
    console.warn('[IndexedDB] Error deleting game from IndexedDB:', err);
  }
}

/**
 * Adds or updates a task in the persistent IndexedDB Save Queue.
 */
export async function putQueueTaskInIndexedDB(task: QueuedSaveTask): Promise<void> {
  try {
    await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_QUEUE], 'readwrite');
          const store = tx.objectStore(STORE_QUEUE);
          store.put(JSON.parse(JSON.stringify(task)));
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      })(),
      2500,
      `putQueueTaskInIndexedDB(${task.gameId})`
    );
  } catch (err) {
    console.warn('[IndexedDB] Error writing queue task:', err);
  }
}

/**
 * Removes a completed task from the persistent IndexedDB Save Queue.
 */
export async function removeQueueTaskFromIndexedDB(gameId: string): Promise<void> {
  try {
    await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_QUEUE], 'readwrite');
          const store = tx.objectStore(STORE_QUEUE);
          store.delete(gameId);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      })(),
      2500,
      `removeQueueTaskFromIndexedDB(${gameId})`
    );
  } catch (err) {
    console.warn('[IndexedDB] Error removing queue task:', err);
  }
}

/**
 * Reads all pending tasks from the persistent IndexedDB Save Queue, ordered by enqueuedAt.
 */
export async function getAllQueueTasksFromIndexedDB(): Promise<QueuedSaveTask[]> {
  try {
    const list = await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        return await new Promise<QueuedSaveTask[]>((resolve, reject) => {
          const tx = db.transaction([STORE_QUEUE], 'readonly');
          const store = tx.objectStore(STORE_QUEUE);
          const req = store.getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
          req.onerror = () => reject(req.error);
        });
      })(),
      3000,
      'getAllQueueTasksFromIndexedDB'
    );
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
    await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        await new Promise<void>((resolve) => {
          const tx = db.transaction([STORE_LOGS], 'readwrite');
          tx.objectStore(STORE_LOGS).put(entry);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        });
      })(),
      1500,
      'recordDiagnosticSaveLog'
    );
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

export interface PersistedKeyValueRecord {
  key: string;
  value: string;
  byteSize: number;
  updatedAt: number;
}

/**
 * Saves a key-value entry into IndexedDB kv_cache_store after checking byte size.
 * Never throws; logs any error so game saving and UI state are never interrupted.
 */
export async function saveKeyValueToIndexedDB(key: string, value: string): Promise<boolean> {
  if (!key || typeof value !== 'string') return false;
  try {
    let safeValue = value;
    let byteSize = estimateByteSize(safeValue);

    // If a payload is unexpectedly huge (> 2 MB, e.g. embedded giant base64 image), sanitize it first
    if (byteSize > 2 * 1024 * 1024 && safeValue.includes('data:image')) {
      try {
        const parsed = JSON.parse(safeValue);
        if (parsed && typeof parsed === 'object') {
          if (parsed.background?.url && String(parsed.background.url).startsWith('data:image')) {
            parsed.background.url = '';
          }
          if (parsed.cageSnapshotImage) {
            delete parsed.cageSnapshotImage;
          }
          safeValue = JSON.stringify(parsed);
          byteSize = estimateByteSize(safeValue);
        }
      } catch {
        // Keep original string if not JSON
      }
    }

    if (byteSize > MAX_INDEXEDDB_ITEM_BYTES) {
      console.warn(
        `[IndexedDB KV] La clave "${key}" excede el límite seguro (${byteSize} bytes > ${MAX_INDEXEDDB_ITEM_BYTES} bytes). Se omite escritura en disco.`
      );
      return false;
    }

    await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_KV_CACHE], 'readwrite');
          const store = tx.objectStore(STORE_KV_CACHE);
          const record: PersistedKeyValueRecord = {
            key,
            value: safeValue,
            byteSize,
            updatedAt: Date.now(),
          };
          store.put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error || new Error(`IndexedDB KV put failed for ${key}`));
          tx.onabort = () => reject(tx.error || new Error(`IndexedDB KV abort for ${key}`));
        });
      })(),
      2500,
      `saveKeyValueToIndexedDB(${key})`
    );
    return true;
  } catch (err) {
    console.warn(`[IndexedDB KV] Error guardando clave "${key}" en IndexedDB (respaldado en memoria):`, err);
    return false;
  }
}

/**
 * Reads a single key-value entry from IndexedDB kv_cache_store.
 */
export async function getKeyValueFromIndexedDB(key: string): Promise<string | null> {
  if (!key) return null;
  try {
    return await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        return await new Promise<string | null>((resolve, reject) => {
          const tx = db.transaction([STORE_KV_CACHE], 'readonly');
          const store = tx.objectStore(STORE_KV_CACHE);
          const req = store.get(key);
          req.onsuccess = () => {
            const res = req.result as PersistedKeyValueRecord | undefined;
            resolve(res && typeof res.value === 'string' ? res.value : null);
          };
          req.onerror = () => reject(req.error);
        });
      })(),
      2500,
      `getKeyValueFromIndexedDB(${key})`
    );
  } catch (err) {
    console.warn(`[IndexedDB KV] No se pudo leer la clave "${key}" desde IndexedDB:`, err);
    return null;
  }
}

/**
 * Loads all key-value records from IndexedDB kv_cache_store for startup hydration.
 */
export async function getAllKeyValuesFromIndexedDB(): Promise<PersistedKeyValueRecord[]> {
  try {
    return await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        return await new Promise<PersistedKeyValueRecord[]>((resolve, reject) => {
          const tx = db.transaction([STORE_KV_CACHE], 'readonly');
          const store = tx.objectStore(STORE_KV_CACHE);
          const req = store.getAll();
          req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
          req.onerror = () => reject(req.error);
        });
      })(),
      // Solo se usa una vez al abrir la página: se da más margen en equipos lentos
      10000,
      'getAllKeyValuesFromIndexedDB'
    );
  } catch (err) {
    console.warn('[IndexedDB KV] No se pudieron cargar los registros KV desde IndexedDB:', err);
    return [];
  }
}

/**
 * Deletes a key-value entry from IndexedDB kv_cache_store.
 */
export async function deleteKeyValueFromIndexedDB(key: string): Promise<void> {
  if (!key) return;
  try {
    await withTimeout(
      (async () => {
        const db = await openOfflineDatabase();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_KV_CACHE], 'readwrite');
          const store = tx.objectStore(STORE_KV_CACHE);
          store.delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
      })(),
      2500,
      `deleteKeyValueFromIndexedDB(${key})`
    );
  } catch (err) {
    console.warn(`[IndexedDB KV] Error eliminando clave "${key}" de IndexedDB:`, err);
  }
}

