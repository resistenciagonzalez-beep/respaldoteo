import { GameSequenceItem } from '../types';
import {
  estimateByteSize,
  MAX_LOCAL_STORAGE_ITEM_BYTES,
  MAX_LOCAL_STORAGE_TOTAL_BYTES,
  MAX_INDEXEDDB_ITEM_BYTES,
  saveGameToIndexedDB,
  saveKeyValueToIndexedDB,
  getAllKeyValuesFromIndexedDB,
  deleteKeyValueFromIndexedDB,
} from './offlinePersistenceEngine';

export { estimateByteSize };

/**
 * Only small user preferences, theme, and lightweight session metadata are allowed in localStorage.
 * All games, galleries, sheets, archives, shifts, sequences, and histories are stored in IndexedDB.
 */
const SMALL_CONFIG_ALLOWED_KEYS = new Set<string>([
  'bingo_platform_color',
  'bingo_auto_highlight_drawn',
  'bingo_game_objectives',
  'bingo_top_adjust_bar_visible',
  'bingo_sheet_cell_font_scale',
  'bingo_90_sheet_density',
  'bingo_90_toolbar_hidden',
  'bingo_current_user_session',
  'bingo_migration_to_idb_v2_completed',
]);

/**
 * Prefixes of keys that hold games, galleries, sheets, archives, shifts, sequences, or caches
 * and MUST NEVER be written to localStorage (always routed to IndexedDB + memory mirror).
 */
const INDEXEDDB_ONLY_KEY_PREFIXES = [
  'bingo_saved_games_gallery',
  'bingo_previous_sheet_75_archive',
  'bingo_previous_sheet_90_archive',
  'bingo_operator_shifts_v1',
  'bingo_custom_sheet_data_v5',
  'bingo_traditional_90_sheet_v1',
  'bingo_game_sequence_history',
  'bingo_90_game_sequence_history',
  'bingo_sheet_custom_sequence',
  'bingo_folder_day_',
  'bingo_player_cumulative_winnings',
  'bingo_player_cumulative_debt',
  'bingo_player_payout_offsets',
  'bingo_player_balance_history',
  'bingo_master_admin_users',
  'bingo_deleted_game_ids_v1',
  'bingo_cleared_sequence_bar_ids_v1',
];

/**
 * Authoritative synchronous in-memory mirror for all key-value storage.
 * Guarantees 0ms synchronous reads for React components while IndexedDB persists data asynchronously.
 */
const memoryKvStore = new Map<string, string>();
const memoryModifiedDuringSession = new Set<string>();
let hasRunSyncMigration = false;
let asyncMigrationPromise: Promise<void> | null = null;

/**
 * Determines whether a key or payload must be routed exclusively to IndexedDB instead of localStorage.
 */
export function shouldRouteToIndexedDB(key: string, byteSize?: number): boolean {
  if (!key) return false;
  if (INDEXEDDB_ONLY_KEY_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix))) {
    return true;
  }
  if (!SMALL_CONFIG_ALLOWED_KEYS.has(key)) {
    return true;
  }
  if (typeof byteSize === 'number' && byteSize > MAX_LOCAL_STORAGE_ITEM_BYTES) {
    return true;
  }
  return false;
}

/**
 * Calculates total bytes currently stored in localStorage.
 */
export function getTotalLocalStorageBytes(): number {
  if (typeof window === 'undefined') return 0;
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        const val = localStorage.getItem(k) || '';
        total += estimateByteSize(k) + estimateByteSize(val);
      }
    }
  } catch {
    // ignore
  }
  return total;
}

/**
 * Strips large heavy assets and nested recursive snapshots from a GameSequenceItem
 * so it can be stored cleanly without O(2^N) payload bloat.
 */
export function sanitizeItemForStorage(item: GameSequenceItem): GameSequenceItem {
  if (!item) return item;
  const clone: GameSequenceItem = { ...item };
  if (clone.cageSnapshotImage) {
    delete clone.cageSnapshotImage;
  }
  if (clone.sequenceSnapshot?.gameSequence) {
    clone.sequenceSnapshot = {
      ...clone.sequenceSnapshot,
      gameSequence: clone.sequenceSnapshot.gameSequence.slice(0, 30).map((sub) => ({
        id: sub.id,
        round: sub.round,
        ballNumber: sub.ballNumber,
        letter: sub.letter,
        ternaBall: sub.ternaBall,
        ternaLeader: sub.ternaLeader,
        amboBall: sub.amboBall,
        amboLeader: sub.amboLeader,
        rowLeader: sub.rowLeader,
        winningPlayerName: sub.winningPlayerName,
        tableNumber: sub.tableNumber,
        mode: sub.mode,
        timestamp: sub.timestamp,
        dateFormatted: sub.dateFormatted,
        dailyDate: sub.dailyDate,
        subfolderDay: sub.subfolderDay,
        operatorFolder: sub.operatorFolder,
        folderPath: sub.folderPath,
        operatorUid: sub.operatorUid,
        operatorName: sub.operatorName,
        durationSeconds: sub.durationSeconds,
        durationFormatted: sub.durationFormatted,
        totalCollected: sub.totalCollected,
        totalPrizesPaid: sub.totalPrizesPaid,
        netProfit: sub.netProfit,
        totalLinesPlayed: sub.totalLinesPlayed,
        drawnBallsPlayed: [],
      })),
    };
  }
  return clone;
}

/**
 * Creates a lightweight summary of GameSequenceItem for embedding inside sequenceSnapshot.gameSequence
 * so rounds never recursively embed previous rounds' full sheet snapshots.
 */
export function toLightweightSequenceItem(item: GameSequenceItem): GameSequenceItem {
  if (!item) return item;
  return {
    id: item.id,
    round: item.round,
    ballNumber: item.ballNumber,
    letter: item.letter,
    ternaBall: item.ternaBall,
    ternaLeader: item.ternaLeader,
    amboBall: item.amboBall,
    amboLeader: item.amboLeader,
    rowLeader: item.rowLeader,
    winningPlayerName: item.winningPlayerName,
    tableNumber: item.tableNumber,
    mode: item.mode,
    sheetType: item.sheetType,
    timestamp: item.timestamp,
    dateFormatted: item.dateFormatted,
    dailyDate: item.dailyDate,
    subfolderDay: item.subfolderDay,
    operatorFolder: item.operatorFolder,
    folderPath: item.folderPath,
    operatorUid: item.operatorUid,
    operatorName: item.operatorName,
    operatorEmail: item.operatorEmail,
    durationSeconds: item.durationSeconds,
    durationFormatted: item.durationFormatted,
    totalCollected: item.totalCollected,
    totalPrizesPaid: item.totalPrizesPaid,
    netProfit: item.netProfit,
    currency: item.currency || '$',
    totalLinesPlayed: item.totalLinesPlayed,
    drawnBallsPlayed: Array.isArray(item.drawnBallsPlayed) ? item.drawnBallsPlayed.slice(0, 90) : [],
    totalBallsDrawnCount: item.totalBallsDrawnCount,
  };
}

/**
 * Sanitizes a list of GameSequenceItem objects for lightweight storage
 */
export function sanitizeSequenceForStorage(items: GameSequenceItem[]): GameSequenceItem[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).map(sanitizeItemForStorage);
}

/**
 * Synchronous phase of automatic migration from localStorage to memoryKvStore + IndexedDB queue.
 * Runs immediately when this module loads so any synchronous component reads (e.g. initial useState)
 * have 100% of existing localStorage data in memoryKvStore while localStorage is cleaned of large keys.
 */
function captureAndMigrateLocalStorageSync(): Array<{ key: string; value: string }> {
  if (typeof window === 'undefined' || hasRunSyncMigration) return [];
  hasRunSyncMigration = true;

  const toPersistInIndexedDB: Array<{ key: string; value: string }> = [];

  try {
    const allKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) allKeys.push(k);
    }

    for (const key of allKeys) {
      let rawVal: string | null = null;
      try {
        rawVal = localStorage.getItem(key);
      } catch {
        continue;
      }
      if (rawVal === null) continue;

      // Remove obsolete dead keys
      if (key === 'bingo_game_sequence' || key === 'bingo_history') {
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
        continue;
      }

      const byteSize = estimateByteSize(rawVal);
      memoryKvStore.set(key, rawVal);

      if (shouldRouteToIndexedDB(key, byteSize)) {
        toPersistInIndexedDB.push({ key, value: rawVal });
        // Immediately free localStorage of this heavy key (data is safely in memoryKvStore and queued for IDB)
        try {
          localStorage.removeItem(key);
        } catch (rmErr) {
          console.warn(`[STORAGE_MIGRATION] No se pudo limpiar clave pesada "${key}" de localStorage:`, rmErr);
        }
      }
    }
  } catch (err) {
    console.warn('[STORAGE_MIGRATION] Aviso durante captura síncrona de localStorage:', err);
  }

  return toPersistInIndexedDB;
}

/**
 * Asynchronous phase of automatic migration:
 * 1. Persists all captured large keys (and any embedded saved games) into IndexedDB.
 * 2. Hydrates memoryKvStore with all existing records from IndexedDB kv_cache_store.
 * 3. Dispatches 'bingo_indexeddb_kv_hydrated' so active views can refresh if needed.
 */
export async function migrateAndHydrateStorageFromIndexedDB(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (asyncMigrationPromise) return asyncMigrationPromise;

  const capturedItems = captureAndMigrateLocalStorageSync();

  asyncMigrationPromise = (async () => {
    try {
      // 1. Load existing KV records from IndexedDB first so we don't lose previously migrated data
      const existingIdbRecords = await getAllKeyValuesFromIndexedDB();
      let hydratedAny = false;

      for (const rec of existingIdbRecords) {
        if (rec && rec.key && typeof rec.value === 'string') {
          // Only populate if not already modified during this session or captured fresher from localStorage
          if (!memoryModifiedDuringSession.has(rec.key) && !memoryKvStore.has(rec.key)) {
            memoryKvStore.set(rec.key, rec.value);
            hydratedAny = true;
          }
        }
      }

      // 2. Persist all newly captured items from localStorage into IndexedDB
      for (const { key, value } of capturedItems) {
        // If the key is a saved games gallery or day folder cache, also migrate individual games to games_store
        if (key === 'bingo_saved_games_gallery' || key.startsWith('bingo_folder_day_')) {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              for (const g of parsed) {
                if (g && typeof g === 'object' && g.id && typeof g.round === 'number') {
                  await saveGameToIndexedDB(g as GameSequenceItem);
                }
              }
            }
          } catch {
            // ignore JSON parse issues on legacy cache
          }
        }
        await saveKeyValueToIndexedDB(key, value);
      }

      if (capturedItems.length > 0) {
        console.info(
          `[STORAGE_MIGRATION] Migradas automáticamente ${capturedItems.length} claves pesadas de localStorage a IndexedDB sin pérdida de datos.`
        );
      }

      if (hydratedAny && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bingo_indexeddb_kv_hydrated'));
        window.dispatchEvent(new Event('storage'));
      }
    } catch (err) {
      console.warn('[STORAGE_MIGRATION] Aviso durante migración asíncrona a IndexedDB:', err);
    }
  })();

  return asyncMigrationPromise;
}

// Trigger synchronous capture + async IndexedDB hydration immediately upon module load
if (typeof window !== 'undefined') {
  void migrateAndHydrateStorageFromIndexedDB();
}

/**
 * Cleans up any non-config or oversized items from localStorage and migrates them to IndexedDB.
 */
export function cleanupLocalStorageForQuota(): void {
  if (typeof window === 'undefined') return;
  try {
    const migrated = captureAndMigrateLocalStorageSync();
    for (const item of migrated) {
      void saveKeyValueToIndexedDB(item.key, item.value);
    }

    // Also scan remaining localStorage keys and evict anything not in SMALL_CONFIG_ALLOWED_KEYS or > 4KB
    const keysToCheck: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keysToCheck.push(k);
    }

    for (const k of keysToCheck) {
      const raw = localStorage.getItem(k);
      if (raw === null) continue;
      const bytes = estimateByteSize(raw);
      if (shouldRouteToIndexedDB(k, bytes)) {
        memoryKvStore.set(k, raw);
        void saveKeyValueToIndexedDB(k, raw);
        try {
          localStorage.removeItem(k);
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn('[STORAGE_CLEANUP] Aviso durante limpieza preventiva de localStorage:', err);
  }
}

interface StorageErrorLike {
  name?: string;
  code?: number;
  message?: string;
}

/**
 * Safe, size-checked storage writer:
 * - Always updates the synchronous in-memory mirror first (0ms latency, never fails).
 * - Checks payload byte size before writing to any storage.
 * - Routes all large keys (games, galleries, previous sheets, current sheets, shifts, sequences, histories)
 *   exclusively to IndexedDB — NEVER writing them to localStorage!
 * - Writes only small preferences/settings (< 4 KB) to localStorage with quota protection.
 * - Never throws and never blocks game saving even if browser storage fails.
 */
export function safeSetItem(key: string, value: string): boolean {
  if (!key || typeof value !== 'string') return false;

  const byteSize = estimateByteSize(value);

  // Check upper bound before storing in memory/IndexedDB
  let safeValue = value;
  if (byteSize > MAX_INDEXEDDB_ITEM_BYTES) {
    console.warn(
      `[SAFE_STORAGE] El valor para "${key}" (${byteSize} bytes) supera el límite máximo (${MAX_INDEXEDDB_ITEM_BYTES} bytes). Se intentará compactar.`
    );
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        safeValue = JSON.stringify(sanitizeSequenceForStorage(parsed.slice(0, 30)));
      } else if (parsed && typeof parsed === 'object') {
        safeValue = JSON.stringify(sanitizeItemForStorage(parsed as GameSequenceItem));
      }
    } catch {
      // Keep as is in memory
    }
  }

  // 1. Always update in-memory mirror immediately so app state is 100% consistent
  memoryKvStore.set(key, safeValue);
  memoryModifiedDuringSession.add(key);

  if (typeof window === 'undefined') return true;

  // 2. If this key belongs in IndexedDB (or exceeds 4 KB), store in IndexedDB and ensure it's NOT in localStorage
  if (shouldRouteToIndexedDB(key, byteSize)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    void saveKeyValueToIndexedDB(key, safeValue);
    return true;
  }

  // 3. Small configuration key (< 4 KB): check total localStorage size before writing
  try {
    const currentTotal = getTotalLocalStorageBytes();
    if (currentTotal + byteSize > MAX_LOCAL_STORAGE_TOTAL_BYTES) {
      cleanupLocalStorageForQuota();
    }

    localStorage.setItem(key, safeValue);
    return true;
  } catch (err: unknown) {
    const e = err as StorageErrorLike | null;
    const isQuotaError =
      Boolean(e) &&
      (e?.name === 'QuotaExceededError' ||
        e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        e?.code === 22 ||
        e?.code === 1014 ||
        String(e?.message || '').toLowerCase().includes('quota'));

    if (isQuotaError) {
      console.warn(
        `[SAFE_STORAGE] QuotaExceededError detectado en clave de configuración "${key}". Migrando datos pesados a IndexedDB y respaldando clave...`
      );
      cleanupLocalStorageForQuota();
      try {
        localStorage.setItem(key, safeValue);
        return true;
      } catch {
        // Fallback to IndexedDB + memory mirror so the app continues without interruption
        void saveKeyValueToIndexedDB(key, safeValue);
        return true;
      }
    }

    console.warn(`[SAFE_STORAGE] Error local en "${key}", respaldado en IndexedDB y memoria:`, err);
    void saveKeyValueToIndexedDB(key, safeValue);
    return true;
  }
}

/**
 * Safe synchronous reader that reads from the authoritative in-memory mirror (backed by IndexedDB)
 * and falls back to localStorage (auto-migrating any large keys found).
 */
export function safeGetItem(key: string): string | null {
  if (!key) return null;

  if (memoryKvStore.has(key)) {
    return memoryKvStore.get(key) ?? null;
  }

  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      memoryKvStore.set(key, raw);
      const byteSize = estimateByteSize(raw);
      if (shouldRouteToIndexedDB(key, byteSize)) {
        void saveKeyValueToIndexedDB(key, raw);
        try {
          localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
      return raw;
    }
  } catch (err) {
    console.warn(`[SAFE_STORAGE] Error leyendo "${key}" de localStorage:`, err);
  }

  return null;
}

/**
 * Safe remover that deletes a key from memory, localStorage, and IndexedDB.
 */
export function safeRemoveItem(key: string): void {
  if (!key) return;
  memoryKvStore.delete(key);
  memoryModifiedDuringSession.add(key);

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    void deleteKeyValueFromIndexedDB(key);
  }
}

/**
 * Lists all keys currently stored in memoryKvStore or localStorage that start with any of the given prefixes.
 */
export function getKeysByPrefix(prefixes: string[]): string[] {
  const matched = new Set<string>();
  for (const k of memoryKvStore.keys()) {
    if (prefixes.some((p) => k.startsWith(p))) {
      matched.add(k);
    }
  }
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && prefixes.some((p) => k.startsWith(p))) {
          matched.add(k);
        }
      }
    } catch {
      // ignore
    }
  }
  return Array.from(matched);
}

