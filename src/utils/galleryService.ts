import type { AppUser, BingoMode, GameSequenceItem } from '../types';
import {
  collection,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { storageState } from './storageState';
import { galleryCacheDB } from './galleryCacheDB';
import type { GalleryDatesCacheRecord, GalleryGamesCacheRecord } from './galleryCacheDB';
import type { SavedGameDay } from './savedGameDaysService';

const PAGE_SIZE = 8;
const OPERATOR_SCAN_PAGE_SIZE = 8;
const RECENT_ADMIN_PAGE_SIZE = 20;
const MAX_MEMORY_CACHED_DATES_PER_OPERATOR = 20;
const MAX_MEMORY_CACHED_OPERATORS = 10;
const MAX_MEMORY_CACHED_GAME_DATES_PER_OPERATOR = 20;

interface GalleryOperatorsCacheEntry {
  operators: GalleryOperator[];
  dateCounts: Record<string, number>;
  lastUpdated: number;
}

export interface GalleryOperator {
  key: string;
  operatorUid: string;
  operatorName: string;
  operatorFolder: string;
}

export interface GalleryDate {
  dateKey: string;
  displayDate: string;
  fullDate: string;
  gameCount: number;
  totalLines: number;
  totalCollected: number;
  totalPrizes: number;
  netProfit: number;
}

interface GalleryDatesCache {
  operatorUid: string;
  operatorFolder: string;
  operatorName: string;
  dates: GalleryDate[];
  totalDateCount: number;
  lastLoaded: number;
  fullyScanned: boolean;
  truncated: boolean;
}

interface GalleryGamesCacheEntry extends GalleryGamesCacheRecord {
  operatorFolder: string;
  operatorName: string;
  cursor: GalleryGamesCursor | null;
}

export type GalleryGamesCursor = Record<string, QueryDocumentSnapshot | null>;

export interface GalleryGamesPage {
  games: GameSequenceItem[];
  cursor: GalleryGamesCursor | null;
  hasMore: boolean;
}

export type GalleryGamesUpdate = GalleryGamesPage & { append: boolean };

type GalleryServiceDependencies = {
  initConnectionMonitor: () => void;
  updateSyncStatus: (partial: { isFirestoreReachable?: boolean }) => void;
  saveGameToIndexedDB: (game: GameSequenceItem) => Promise<void>;
  normalizeGameFolderMetadata: (
    data: GameSequenceItem,
    fallbackId?: string
  ) => { normalizedGame: GameSequenceItem; isMisplaced: boolean; reason?: string };
  sortGamesChronologicallyDesc: (games: GameSequenceItem[]) => GameSequenceItem[];
  syncTemporaryLocalCache: (games: GameSequenceItem[]) => void;
  safeGetItem: (key: string) => string | null;
  savedGamesGalleryStorageKey: string;
  hasExplicitGameDateKey: (
    game: Partial<GameSequenceItem> | null | undefined
  ) => string | null;
  sanitizeOperatorFolderName: (name?: string) => string;
  getGameNormalizedDateKey: (game: GameSequenceItem) => string;
  getGameLines: (game: GameSequenceItem) => number;
  gameDays: {
    getDays: (operatorUid: string) => Promise<SavedGameDay[]>;
  };
};

function normalizeDateKey(game: Partial<GameSequenceItem>): string | null {
  const candidates = [game.dailyDate, game.subfolderDay, game.folderPath?.split('/').pop()];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const value = candidate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const match = value.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (match) return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  return null;
}

function dateLabel(dateKey: string): { displayDate: string; fullDate: string } {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (!year || !month || !day || Number.isNaN(date.getTime())) {
    return { displayDate: dateKey, fullDate: dateKey };
  }
  const weekday = date.toLocaleDateString('es-ES', { weekday: 'long' });
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return {
    displayDate: date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
    fullDate: `${capitalizedWeekday}, ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`,
  };
}

export function createGalleryService(dependencies: GalleryServiceDependencies) {
  const galleryOperatorsCache = new Map<string, GalleryOperatorsCacheEntry>();
  const pendingOperatorRequests = new Map<string, Promise<GalleryOperator[]>>();
  const galleryDatesCache = new Map<string, GalleryDatesCache>();
  const galleryGamesCache = new Map<string, GalleryGamesCacheEntry>();
  const operatorLru = new Map<string, number>();
  const prefetchedFirstDate = new Map<string, Set<string>>();
  const pendingGamePageRequests = new Map<string, {
    cacheKey: string;
    operatorIdentity: string;
    prefetchOnly: boolean;
    revalidateOnCompletion: boolean;
    cancelled: boolean;
    callbacks: Set<(update: GalleryGamesUpdate) => void>;
    promise: Promise<GalleryGamesPage>;
  }>();
  const prefetchQueue: Array<{ operator: GalleryOperator; dateKey: string; cacheKey: string; operatorIdentity: string }> = [];
  let prefetchRunning = false;
  let prefetchIdleScheduled = false;
  let gamePageQueryLane: Promise<void> = Promise.resolve();
  let activeGalleryOperatorIdentity: string | null = null;
  let activeSelectedGameCacheKey: string | null = null;
  const activeDateScans = new Map<string, {
    callbacks: Set<(dates: GalleryDate[]) => void>;
    cancelled: boolean;
    promise: Promise<GalleryDate[]>;
  }>();
  const activeGameScans = new Map<string, {
    callbacks: Set<(update: GalleryGamesUpdate) => void>;
    cancelled: boolean;
    promise: Promise<void>;
  }>();
  function getGalleryDatesCacheKey(operator: GalleryOperator): string {
    return operator.operatorUid && operator.operatorUid !== 'anon'
      ? `uid:${operator.operatorUid}`
      : `folder:${operator.operatorFolder}`;
  }

  function getOperatorIdentity(operator: GalleryOperator): string {
    return operator.operatorUid && operator.operatorUid !== 'anon'
      ? operator.operatorUid
      : `folder:${operator.operatorFolder}`;
  }

  function getGalleryGamesCacheKey(operator: GalleryOperator, dateKey: string): string {
    return `${getOperatorIdentity(operator)}:${dateKey}`;
  }

  function getOperatorsCacheKey(currentUser: AppUser | null | undefined, isAdmin: boolean): string {
    return isAdmin ? 'admin' : `operator:${currentUser?.id || currentUser?.uid || 'anonymous'}`;
  }

  function cancelObsoleteGameWork(operatorIdentity: string, activeCacheKey?: string): void {
    pendingGamePageRequests.forEach((request) => {
      const isSameOperator = request.operatorIdentity === operatorIdentity;
      const isSameDate = activeCacheKey !== undefined && request.cacheKey === activeCacheKey;
      if (request.cancelled || (isSameOperator && (activeCacheKey === undefined || isSameDate))) return;
      request.cancelled = true;
      console.log('[PERF] cancelled_request', request.cacheKey);
    });

    activeGameScans.forEach((scan, key) => {
      const isSameOperator = key.startsWith(`${operatorIdentity}:`);
      const isSameDate = activeCacheKey !== undefined && key === activeCacheKey;
      if (scan.cancelled || (isSameOperator && (activeCacheKey === undefined || isSameDate))) return;
      scan.cancelled = true;
      activeGameScans.delete(key);
      console.log('[PERF] cancelled_request', key);
    });

    if (activeCacheKey === undefined) {
      for (let index = prefetchQueue.length - 1; index >= 0; index -= 1) {
        if (prefetchQueue[index].operatorIdentity !== operatorIdentity) prefetchQueue.splice(index, 1);
      }
    } else {
      for (let index = prefetchQueue.length - 1; index >= 0; index -= 1) {
        if (prefetchQueue[index].cacheKey !== activeCacheKey) prefetchQueue.splice(index, 1);
      }
    }
  }

  function runSerializedGamePageQuery(
    operator: GalleryOperator,
    dateKey: string,
    cursor: GalleryGamesCursor | null,
    shouldContinue: () => boolean
  ): Promise<GalleryGamesPage> {
    const pagePromise = gamePageQueryLane.then(() => {
      if (!shouldContinue()) return { games: [], cursor: null, hasMore: false };
      return fetchGalleryGamesPageFromFirestore(operator, dateKey, cursor, shouldContinue);
    });
    gamePageQueryLane = pagePromise.then(() => undefined, () => undefined);
    return pagePromise;
  }

  function cloneOperators(operators: GalleryOperator[]): GalleryOperator[] {
    return operators.map((operator) => ({ ...operator }));
  }

  function storeOperators(cacheKey: string, operators: GalleryOperator[]): void {
    const previous = galleryOperatorsCache.get(cacheKey);
    const dateCounts = { ...(previous?.dateCounts || {}) };
    operators.forEach((operator) => {
      const cachedDates = galleryDatesCache.get(getGalleryDatesCacheKey(operator));
      if (cachedDates) dateCounts[operator.operatorUid] = cachedDates.totalDateCount;
      else if (!(operator.operatorUid in dateCounts)) dateCounts[operator.operatorUid] = 0;
    });
    galleryOperatorsCache.set(cacheKey, {
      operators: cloneOperators(operators),
      dateCounts,
      lastUpdated: Date.now(),
    });
  }

  function updateCachedOperatorDateCount(operator: GalleryOperator, count: number): void {
    galleryOperatorsCache.forEach((entry) => {
      if (!entry.operators.some((item) => item.operatorUid === operator.operatorUid)) return;
      entry.dateCounts[operator.operatorUid] = count;
      entry.lastUpdated = Date.now();
    });
  }

  function touchOperator(identity: string): void {
    operatorLru.delete(identity);
    operatorLru.set(identity, Date.now());
    while (operatorLru.size > MAX_MEMORY_CACHED_OPERATORS) {
      const oldestIdentity = operatorLru.keys().next().value as string | undefined;
      if (!oldestIdentity) break;
      operatorLru.delete(oldestIdentity);
      const datesKey = oldestIdentity.startsWith('folder:') ? oldestIdentity : `uid:${oldestIdentity}`;
      galleryDatesCache.delete(datesKey);
      prefetchedFirstDate.delete(datesKey);
      for (const [key, entry] of galleryGamesCache) {
        if (entry.operatorUid === oldestIdentity) {
          galleryGamesCache.delete(key);
        }
      }
      pendingGamePageRequests.forEach((request) => {
        if (request.operatorIdentity !== oldestIdentity || request.cancelled) return;
        request.cancelled = true;
        console.log('[PERF] cancelled_request', request.cacheKey);
      });
      for (let index = prefetchQueue.length - 1; index >= 0; index -= 1) {
        if (prefetchQueue[index].operatorIdentity === oldestIdentity) prefetchQueue.splice(index, 1);
      }
      const dateScan = activeDateScans.get(datesKey);
      if (dateScan && !dateScan.cancelled) {
        dateScan.cancelled = true;
        activeDateScans.delete(datesKey);
        console.log('[PERF] cancelled_request', datesKey);
      }
      for (const [key, scan] of activeGameScans) {
        if (key.startsWith(`${oldestIdentity}:`) && !scan.cancelled) {
          scan.cancelled = true;
          activeGameScans.delete(key);
          console.log('[PERF] cancelled_request', key);
        }
      }
    }
  }

  function cacheDates(operator: GalleryOperator, dates: GalleryDate[], lastLoaded: number, fullyScanned: boolean): GalleryDatesCache {
    const identity = getOperatorIdentity(operator);
    const entry: GalleryDatesCache = {
      operatorUid: operator.operatorUid,
      operatorFolder: operator.operatorFolder,
      operatorName: operator.operatorName,
      dates: cloneGalleryDates(dates.slice(0, MAX_MEMORY_CACHED_DATES_PER_OPERATOR)),
      totalDateCount: dates.length,
      lastLoaded,
      fullyScanned,
      truncated: dates.length > MAX_MEMORY_CACHED_DATES_PER_OPERATOR,
    };
    touchOperator(identity);
    galleryDatesCache.delete(getGalleryDatesCacheKey(operator));
    galleryDatesCache.set(getGalleryDatesCacheKey(operator), entry);
    updateCachedOperatorDateCount(operator, dates.length);
    return entry;
  }

  function cacheGames(key: string, entry: GalleryGamesCacheEntry): void {
    const identity = entry.operatorUid;
    touchOperator(identity);
    galleryGamesCache.delete(key);
    galleryGamesCache.set(key, entry);
    let operatorEntries = Array.from(galleryGamesCache.entries()).filter(([, value]) =>
      (value.operatorUid && value.operatorUid !== 'anon' ? value.operatorUid : `folder:${value.operatorFolder}`) === identity
    );
    while (operatorEntries.length > MAX_MEMORY_CACHED_GAME_DATES_PER_OPERATOR) {
      const [oldestKey] = operatorEntries.shift()!;
      galleryGamesCache.delete(oldestKey);
    }
  }

  function persistDates(operator: GalleryOperator, dates: GalleryDate[], lastLoaded: number, fullyScanned: boolean): void {
    void galleryCacheDB.putDates({
      operatorUid: getGalleryDatesCacheKey(operator),
      operatorFolder: operator.operatorFolder,
      operatorName: operator.operatorName,
      dates: cloneGalleryDates(dates),
      lastLoaded,
      fullyScanned,
    }).catch(() => {});
  }

  function persistGames(entry: GalleryGamesCacheEntry): void {
    const { cursor: _cursor, ...record } = entry;
    void galleryCacheDB.putGames(record).catch(() => {});
  }

  function cloneGalleryDates(dates: GalleryDate[]): GalleryDate[] {
    return dates.map((date) => ({ ...date }));
  }

  function removePrefetchedDate(operator: GalleryOperator, dateKey: string): void {
    const seen = prefetchedFirstDate.get(getGalleryDatesCacheKey(operator));
    seen?.delete(dateKey);
  }

  function startPrefetchJob(job: { operator: GalleryOperator; dateKey: string; cacheKey: string; operatorIdentity: string }): void {
    if (prefetchRunning) {
      prefetchQueue.unshift(job);
      return;
    }
    if (
      (activeGalleryOperatorIdentity && activeGalleryOperatorIdentity !== job.operatorIdentity) ||
      (activeSelectedGameCacheKey && activeSelectedGameCacheKey !== job.cacheKey)
    ) {
      removePrefetchedDate(job.operator, job.dateKey);
      runNextIdlePrefetch();
      return;
    }
    if (galleryGamesCache.has(job.cacheKey)) {
      runNextIdlePrefetch();
      return;
    }

    prefetchRunning = true;
    console.log('[PERF] prefetch_start', job.cacheKey);
    void getGalleryGamesPage(job.operator, job.dateKey, null, undefined, true)
      .catch(() => {
        removePrefetchedDate(job.operator, job.dateKey);
      })
      .finally(() => {
        prefetchRunning = false;
        console.log('[PERF] prefetch_finish', job.cacheKey);
        runNextIdlePrefetch();
      });
  }

  function runNextIdlePrefetch(): void {
    if (prefetchRunning || prefetchIdleScheduled || prefetchQueue.length === 0) return;
    prefetchIdleScheduled = true;
    const run = () => {
      prefetchIdleScheduled = false;
      const job = prefetchQueue.shift();
      if (!job) return;
      startPrefetchJob(job);
    };

    if (typeof window !== 'undefined') {
      const idleWindow = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      };
      if (idleWindow.requestIdleCallback) {
        idleWindow.requestIdleCallback(run);
        return;
      }
      window.setTimeout(run, 0);
      return;
    }
    setTimeout(run, 0);
  }

  function prefetchFirstDateGames(operator: GalleryOperator, dates: GalleryDate[]): void {
    if (dates.length === 0) return;
    const cacheKey = getGalleryDatesCacheKey(operator);
    const identity = getOperatorIdentity(operator);
    const recentDates = dates.slice(0, 2);
    const prefetched = prefetchedFirstDate.get(cacheKey) || new Set<string>();
    prefetchedFirstDate.set(cacheKey, prefetched);
    const enqueue = (date: GalleryDate) => {
      if (prefetched.has(date.dateKey)) return;
      prefetched.add(date.dateKey);
      while (prefetched.size > MAX_MEMORY_CACHED_DATES_PER_OPERATOR) {
        const oldestDate = prefetched.values().next().value as string | undefined;
        if (!oldestDate) break;
        prefetched.delete(oldestDate);
      }
      const gamesCacheKey = getGalleryGamesCacheKey(operator, date.dateKey);
      if (galleryGamesCache.has(gamesCacheKey)) return;
      if (prefetchQueue.some((job) => job.cacheKey === gamesCacheKey)) return;
      prefetchQueue.push({ operator, dateKey: date.dateKey, cacheKey: gamesCacheKey, operatorIdentity: identity });
    };

    recentDates.forEach(enqueue);
    const firstDateKey = getGalleryGamesCacheKey(operator, recentDates[0].dateKey);
    const firstJobIndex = prefetchQueue.findIndex((job) => job.cacheKey === firstDateKey);
    if (firstJobIndex >= 0 && !prefetchRunning) {
      const [firstJob] = prefetchQueue.splice(firstJobIndex, 1);
      startPrefetchJob(firstJob);
    }
    if (!prefetchRunning) runNextIdlePrefetch();
  }

  function notifyDateCallbacks(callbacks: Set<(dates: GalleryDate[]) => void>, dates: GalleryDate[]): void {
    for (const callback of callbacks) {
      try {
        callback(cloneGalleryDates(dates));
      } catch {
        // Keep the Firestore scan independent from UI subscribers.
      }
    }
  }

  function markGalleryDatesCacheStale(cacheKey: string): void {
    const cached = galleryDatesCache.get(cacheKey);
    if (cached) {
      cached.lastLoaded = 0;
      cached.fullyScanned = false;
    }
    const active = activeDateScans.get(cacheKey);
    if (active) {
      active.cancelled = true;
      activeDateScans.delete(cacheKey);
      console.log('[PERF] cancelled_request', cacheKey);
    }
    void galleryCacheDB.getDates(cacheKey).then((record) => {
      if (record) return galleryCacheDB.putDates({ ...record, lastLoaded: 0, fullyScanned: false });
    }).catch(() => {});
  }

  function invalidateGalleryDatesCache(operatorUid?: string): void {
    if (operatorUid) {
      markGalleryDatesCacheStale(`uid:${operatorUid}`);
      return;
    }

    for (const cacheKey of galleryDatesCache.keys()) markGalleryDatesCacheStale(cacheKey);
    void galleryCacheDB.getAllDates().then((records) => Promise.all(records.map((record) =>
      galleryCacheDB.putDates({ ...record, lastLoaded: 0, fullyScanned: false })
    ))).catch(() => {});
  }

  function invalidateGalleryGamesCache(operatorUid?: string, dateKey?: string): void {
    const matches = (entry: GalleryGamesCacheEntry) =>
      (!operatorUid || entry.operatorUid === operatorUid) && (!dateKey || entry.dateKey === dateKey);
    const prefetchCacheKey = operatorUid
      ? (operatorUid.startsWith('folder:') ? operatorUid : `uid:${operatorUid}`)
      : undefined;
    if (prefetchCacheKey) {
      const prefetchedDates = prefetchedFirstDate.get(prefetchCacheKey);
      if (dateKey) prefetchedDates?.delete(dateKey);
      else prefetchedFirstDate.delete(prefetchCacheKey);
    } else {
      prefetchedFirstDate.clear();
    }
    pendingGamePageRequests.forEach((request) => {
      const operatorMatches = !operatorUid || request.operatorIdentity === operatorUid;
      const dateMatches = !dateKey || request.cacheKey.endsWith(`:${dateKey}`);
      if (!operatorMatches || !dateMatches || request.cancelled) return;
      request.cancelled = true;
      console.log('[PERF] cancelled_request', request.cacheKey);
    });
    for (const [key, entry] of galleryGamesCache) {
      if (!matches(entry)) continue;
      galleryGamesCache.delete(key);
      const active = activeGameScans.get(key);
      if (active) {
        active.cancelled = true;
        activeGameScans.delete(key);
        console.log('[PERF] cancelled_request', key);
      }
      void galleryCacheDB.deleteGames(key).catch(() => {});
    }
    if (!operatorUid) {
      for (const [key, scan] of activeGameScans) {
        if (scan.cancelled) continue;
        scan.cancelled = true;
        console.log('[PERF] cancelled_request', key);
      }
      activeGameScans.clear();
      void galleryCacheDB.clearGames().catch(() => {});
    } else if (dateKey) {
      const key = `${operatorUid}:${dateKey}`;
      const active = activeGameScans.get(key);
      if (active) {
        active.cancelled = true;
        activeGameScans.delete(key);
        console.log('[PERF] cancelled_request', key);
      }
      void galleryCacheDB.deleteGames(key).catch(() => {});
    } else {
      for (const [key, scan] of activeGameScans) {
        if (key.startsWith(`${operatorUid}:`)) {
          scan.cancelled = true;
          activeGameScans.delete(key);
          console.log('[PERF] cancelled_request', key);
        }
      }
      void galleryCacheDB.deleteGamesForOperator(operatorUid).catch(() => {});
    }
  }

  function invalidateGalleryGamesCacheForGame(game: GameSequenceItem | undefined): void {
    if (!game) return;
    const dateKey = dependencies.getGameNormalizedDateKey(game) || normalizeDateKey(game);
    if (game.operatorUid && game.operatorUid !== 'anon' && dateKey) {
      invalidateGalleryGamesCache(game.operatorUid, dateKey);
      invalidateGalleryDatesCache(game.operatorUid);
      return;
    }
    const folder = game.operatorFolder || game.operatorName;
    const identity = `folder:${folder}`;
    if (dateKey) invalidateGalleryGamesCache(identity, dateKey);
    for (const [key, entry] of galleryGamesCache) {
      if ((!folder || entry.operatorFolder === folder || entry.operatorName === folder) && (!dateKey || entry.dateKey === dateKey)) {
        galleryGamesCache.delete(key);
        void galleryCacheDB.deleteGames(key).catch(() => {});
      }
    }
  }

  async function invalidateGalleryGamesCacheByGameId(gameId: string): Promise<void> {
    const cachedEntry = Array.from(galleryGamesCache.values()).find((entry) => entry.games.some((game) => game.id === gameId));
    const record = cachedEntry || await galleryCacheDB.findGameById(gameId).catch(() => undefined);
    if (!record) return;
    invalidateGalleryGamesCache(record.operatorUid, record.dateKey);
    const datesCacheKey = record.operatorUid.startsWith('folder:')
      ? record.operatorUid
      : `uid:${record.operatorUid}`;
    markGalleryDatesCacheStale(datesCacheKey);
  }

  async function deleteGalleryDateCache(operatorUid: string, dateKey: string): Promise<void> {
    const cacheKey = `uid:${operatorUid}`;
    const cached = galleryDatesCache.get(cacheKey);
    if (cached) {
      cacheDates({ key: cacheKey, operatorUid, operatorName: '', operatorFolder: cached.operatorFolder },
        cached.dates.filter((date) => date.dateKey !== dateKey), 0, false);
    }
    const record = await galleryCacheDB.getDates(cacheKey).catch(() => undefined);
    if (record) {
      await galleryCacheDB.putDates({ ...record, dates: record.dates.filter((date) => date.dateKey !== dateKey), lastLoaded: 0, fullyScanned: false }).catch(() => {});
    }
    invalidateGalleryGamesCache(operatorUid, dateKey);
  }

  async function invalidateGalleryGamesCacheForFolder(operatorFolder: string, dateKey?: string): Promise<void> {
    const records = await galleryCacheDB.getAllDates().catch(() => []);
    const matchingRecords = records.filter((record) => record.operatorFolder === operatorFolder || record.operatorName === operatorFolder);
    const operatorIds = new Set(matchingRecords.map((record) => record.operatorUid.replace(/^uid:/, '')));
    for (const [cacheKey, entry] of galleryDatesCache) {
      if (entry.operatorFolder === operatorFolder || entry.operatorName === operatorFolder) {
        operatorIds.add(cacheKey.startsWith('uid:') ? cacheKey.slice(4) : cacheKey);
      }
    }
    for (const entry of galleryGamesCache.values()) {
      if (entry.operatorFolder === operatorFolder || entry.operatorName === operatorFolder) operatorIds.add(entry.operatorUid);
    }
    for (const operatorUid of operatorIds) {
      if (dateKey) {
        invalidateGalleryGamesCache(operatorUid, dateKey);
        await galleryCacheDB.deleteGamesForOperatorDate(operatorUid, dateKey).catch(() => {});
        const recordKey = operatorUid.startsWith('folder:') ? operatorUid : `uid:${operatorUid}`;
        const record = matchingRecords.find((item) => item.operatorUid === recordKey);
        if (record) {
          const updatedDates = record.dates.filter((date) => date.dateKey !== dateKey);
          const memoryOperator = { key: recordKey, operatorUid, operatorName: record.operatorName || operatorFolder, operatorFolder: record.operatorFolder || operatorFolder };
          cacheDates(memoryOperator, updatedDates, 0, false);
          await galleryCacheDB.putDates({ ...record, dates: updatedDates, lastLoaded: 0, fullyScanned: false }).catch(() => {});
        } else {
          const memoryEntry = galleryDatesCache.get(recordKey);
          if (memoryEntry) cacheDates({ key: recordKey, operatorUid, operatorName: memoryEntry.operatorName, operatorFolder: memoryEntry.operatorFolder },
            memoryEntry.dates.filter((date) => date.dateKey !== dateKey), 0, false);
        }
      } else {
        invalidateGalleryGamesCache(operatorUid);
        const recordKey = operatorUid.startsWith('folder:') ? operatorUid : `uid:${operatorUid}`;
        galleryDatesCache.delete(recordKey);
        const active = activeDateScans.get(recordKey);
        if (active && !active.cancelled) {
          active.cancelled = true;
          activeDateScans.delete(recordKey);
          console.log('[PERF] cancelled_request', recordKey);
        }
        await galleryCacheDB.deleteDates(recordKey).catch(() => {});
      }
    }
  }

  async function clearGalleryCaches(): Promise<void> {
    for (const [key, scan] of activeDateScans) {
      if (scan.cancelled) continue;
      scan.cancelled = true;
      console.log('[PERF] cancelled_request', key);
    }
    for (const [key, scan] of activeGameScans) {
      if (scan.cancelled) continue;
      scan.cancelled = true;
      console.log('[PERF] cancelled_request', key);
    }
    pendingGamePageRequests.forEach((request) => {
      if (request.cancelled) return;
      request.cancelled = true;
      console.log('[PERF] cancelled_request', request.cacheKey);
    });
    activeDateScans.clear();
    activeGameScans.clear();
    prefetchQueue.length = 0;
    galleryDatesCache.clear();
    galleryGamesCache.clear();
    operatorLru.clear();
    prefetchedFirstDate.clear();
    activeGalleryOperatorIdentity = null;
    activeSelectedGameCacheKey = null;
    await galleryCacheDB.clear().catch(() => {});
  }

  function normalizeRemoteGame(id: string, data: Record<string, unknown>): GameSequenceItem | null {
    if (storageState.deletedGameIdsSet.has(id)) return null;
    const raw = { ...data, id } as GameSequenceItem;
    if (dependencies.hasExplicitGameDateKey(raw) === null) return null;
    const { normalizedGame } = dependencies.normalizeGameFolderMetadata(raw, id);
    return normalizedGame;
  }

  function publishLocalGalleryUpdate(savedItem?: GameSequenceItem): void {
    const allGames = dependencies.sortGamesChronologicallyDesc(
      Array.from(storageState.firestoreGamesMemoryStore.values())
    );
    storageState.cachedSortedGames = allGames;
    dependencies.syncTemporaryLocalCache(allGames);
    storageState.savedGamesSubscribers.forEach((subscriber) => {
      try {
        subscriber(allGames);
      } catch {
        // Keep cache writes independent from individual listeners.
      }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bingo_saved_games_updated', {
        detail: { total: allGames.length, savedItem },
      }));
    }
  }

  function getSavedGamesGallery(): GameSequenceItem[] {
    const memoryGames = Array.from(storageState.firestoreGamesMemoryStore.values());
    if (memoryGames.length > 0) {
      return dependencies.sortGamesChronologicallyDesc(memoryGames.filter((game) =>
        Boolean(game?.id) && !storageState.deletedGameIdsSet.has(game.id!) &&
        dependencies.hasExplicitGameDateKey(game) !== null
      ));
    }

    if (typeof window === 'undefined') return [];
    try {
      const raw = dependencies.safeGetItem(dependencies.savedGamesGalleryStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as GameSequenceItem[];
      if (!Array.isArray(parsed)) return [];
      const valid = parsed
        .filter((game) => game && !storageState.deletedGameIdsSet.has(game.id || '') && dependencies.hasExplicitGameDateKey(game) !== null)
        .map((game) => dependencies.normalizeGameFolderMetadata(game, game.id).normalizedGame);
      return dependencies.sortGamesChronologicallyDesc(valid);
    } catch (error) {
      console.error('Error reading temporary saved games cache', error);
      return [];
    }
  }

  async function getGalleryOperators(
    currentUser: AppUser | null | undefined,
    isAdmin: boolean,
    forceRefresh = false
  ): Promise<GalleryOperator[]> {
    const cacheKey = getOperatorsCacheKey(currentUser, isAdmin);
    const cached = galleryOperatorsCache.get(cacheKey);
    if (cached && !forceRefresh) return cloneOperators(cached.operators);
    const pending = pendingOperatorRequests.get(cacheKey);
    if (pending) return pending.then(cloneOperators);

    if (!isAdmin && currentUser) {
      const uid = currentUser.id || currentUser.uid || '';
      const operators = [{
        key: uid ? `uid:${uid}` : `folder:${currentUser.name.trim().toLowerCase()}`,
        operatorUid: uid,
        operatorName: currentUser.name || 'Operadora Principal',
        operatorFolder: dependencies.sanitizeOperatorFolderName(currentUser.name || 'Operadora Principal'),
      }];
      storeOperators(cacheKey, operators);
      return operators;
    }

    const request = (async () => {
      try {
        const usersQuery = query(collection(db, 'users'), where('role', '==', 'operator'));
        const usersSnapshot = await getDocs(usersQuery);
        const operators = usersSnapshot.docs.map((userDoc) => {
          const data = userDoc.data() as Partial<AppUser>;
          const uid = data.uid || userDoc.id;
          const name = data.name || 'Operadora Principal';
          return {
            key: `uid:${uid}`,
            operatorUid: uid,
            operatorName: name,
            operatorFolder: (data as AppUser & { operatorFolder?: string }).operatorFolder || dependencies.sanitizeOperatorFolderName(name),
          };
        });

        // Include local historical records whose operator profile no longer exists.
        const known = new Set(operators.map((operator) => operator.operatorUid));
        for (const game of storageState.firestoreGamesMemoryStore.values()) {
          const uid = game.operatorUid;
          if (!uid || uid === 'anon' || known.has(uid)) continue;
          known.add(uid);
          const name = game.operatorName || game.operatorFolder || 'Operadora Principal';
          operators.push({ key: `uid:${uid}`, operatorUid: uid, operatorName: name, operatorFolder: game.operatorFolder || dependencies.sanitizeOperatorFolderName(name) });
        }
        const sortedOperators = operators.sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'es'));
        storeOperators(cacheKey, sortedOperators);
        return cloneOperators(sortedOperators);
      } catch (error) {
        console.warn('Could not load gallery operators from Firestore:', error);
        if (cached) return cloneOperators(cached.operators);
        storeOperators(cacheKey, []);
        return [];
      } finally {
        pendingOperatorRequests.delete(cacheKey);
      }
    })();
    pendingOperatorRequests.set(cacheKey, request);
    return request;
  }

  async function getGalleryDates(
    operator: GalleryOperator,
    onDatesUpdate?: (dates: GalleryDate[]) => void
  ): Promise<GalleryDate[]> {
    const cacheKey = getGalleryDatesCacheKey(operator);
    const operatorUid = operator.operatorUid || 'anon';
    const operatorIdentity = getOperatorIdentity(operator);
    if (activeGalleryOperatorIdentity !== operatorIdentity) {
      cancelObsoleteGameWork(operatorIdentity);
      activeDateScans.forEach((scan, activeKey) => {
        if (activeKey === cacheKey || scan.cancelled) return;
        scan.cancelled = true;
        activeDateScans.delete(activeKey);
        console.log('[PERF] cancelled_request', activeKey);
      });
      activeGalleryOperatorIdentity = operatorIdentity;
    }
    activeSelectedGameCacheKey = null;
    let cachedDates = galleryDatesCache.get(cacheKey);
    const onDatesUpdateCallbacks = new Set<(dates: GalleryDate[]) => void>();
    if (onDatesUpdate) onDatesUpdateCallbacks.add(onDatesUpdate);

    if (cachedDates) {
      if (onDatesUpdate) notifyDateCallbacks(onDatesUpdateCallbacks, cachedDates.dates);
    }
    if (cachedDates?.dates.length) prefetchFirstDateGames(operator, cachedDates.dates);
    if (cachedDates) touchOperator(getOperatorIdentity(operator));
    const diskRecord = !cachedDates || cachedDates.truncated
      ? await galleryCacheDB.getDates(cacheKey).catch(() => undefined)
      : undefined;
    const knownDates = diskRecord?.dates?.length
      ? cloneGalleryDates(diskRecord.dates)
      : cloneGalleryDates(cachedDates?.dates || []);
    if (diskRecord) {
      cachedDates = cacheDates(operator, diskRecord.dates, diskRecord.lastLoaded, diskRecord.fullyScanned);
      if (onDatesUpdate) notifyDateCallbacks(onDatesUpdateCallbacks, diskRecord.dates);
      prefetchFirstDateGames(operator, diskRecord.dates);
    }

    if (cachedDates) touchOperator(getOperatorIdentity(operator));
    let existingScan = activeDateScans.get(cacheKey);
    if (existingScan?.cancelled) {
      activeDateScans.delete(cacheKey);
      existingScan = undefined;
    }
    if (existingScan) {
      if (onDatesUpdate) existingScan.callbacks.add(onDatesUpdate);
      return cachedDates
        ? cloneGalleryDates(cachedDates.dates)
        : existingScan.promise;
    }

    const dateRowsToSummaries = (days: SavedGameDay[], retainedDates: GalleryDate[]) => {
      const retainedByDate = new Map(retainedDates.map((date) => [date.dateKey, date]));
      return days.map((day) => {
        const dateKey = day.dailyDate;
        const retained = retainedByDate.get(dateKey);
        const label = dateLabel(dateKey);
        return {
          dateKey,
          ...label,
          gameCount: Number(day.gamesCount) || 0,
          totalLines: retained?.totalLines || 0,
          totalCollected: retained?.totalCollected || 0,
          totalPrizes: retained?.totalPrizes || 0,
          netProfit: retained?.netProfit || 0,
        } satisfies GalleryDate;
      });
    };

    const areDatesEqual = (left: GalleryDate[], right: GalleryDate[]): boolean =>
      left.length === right.length && left.every((date, index) => {
        const other = right[index];
        return date.dateKey === other.dateKey && date.gameCount === other.gameCount &&
          date.totalLines === other.totalLines && date.totalCollected === other.totalCollected &&
          date.totalPrizes === other.totalPrizes && date.netProfit === other.netProfit;
      });

    const mergeAndPublishDates = (
      incomingDates: GalleryDate[],
      activeScan: { callbacks: Set<(dates: GalleryDate[]) => void>; cancelled: boolean },
      fullyScanned = false,
      replaceExisting = false
    ): GalleryDate[] => {
      const merged = new Map((replaceExisting ? [] : knownDates).map((date) => [date.dateKey, date]));
      incomingDates.forEach((date) => merged.set(date.dateKey, date));
      const dates = Array.from(merged.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      if (!activeScan.cancelled) {
        const previousDates = cachedDates?.dates || knownDates;
        if (!areDatesEqual(previousDates, dates)) notifyDateCallbacks(activeScan.callbacks, dates);
        cachedDates = cacheDates(operator, dates, Date.now(), fullyScanned);
        persistDates(operator, dates, cachedDates.lastLoaded, fullyScanned);
        prefetchFirstDateGames(operator, dates);
      }
      return dates;
    };

    const activeScan = {
      callbacks: onDatesUpdateCallbacks,
      cancelled: false,
      promise: Promise.resolve([] as GalleryDate[]),
    };

    const scanPromise = Promise.resolve().then(async () => {
      try {
        const days = await dependencies.gameDays.getDays(operatorUid);
        if (activeScan.cancelled) return cloneGalleryDates(galleryDatesCache.get(cacheKey)?.dates || []);
        const indexedDates = dateRowsToSummaries(days, knownDates);
        const dates = mergeAndPublishDates(indexedDates, activeScan, true, true);
        return cloneGalleryDates(dates);
      } catch (error) {
        console.warn('Could not load saved_game_days for gallery dates:', error);
        return cloneGalleryDates(cachedDates?.dates || knownDates);
      } finally {
        if (activeDateScans.get(cacheKey) === activeScan) activeDateScans.delete(cacheKey);
      }
    });

    activeScan.promise = scanPromise;
    activeDateScans.set(cacheKey, activeScan);
    if (cachedDates) {
      return cloneGalleryDates(cachedDates.dates);
    }
    return scanPromise;
  }

  function makeDateQueries(operator: GalleryOperator, dateKey: string): Array<{ key: string; constraints: QueryConstraint[] }> {
    const queries: Array<{ key: string; constraints: QueryConstraint[] }> = [];
    if (operator.operatorUid && operator.operatorUid !== 'anon') {
      queries.push({ key: 'uid-daily', constraints: [where('operatorUid', '==', operator.operatorUid), where('dailyDate', '==', dateKey)] });
      queries.push({ key: 'uid-subfolder', constraints: [where('operatorUid', '==', operator.operatorUid), where('subfolderDay', '==', dateKey)] });
    }
    if (operator.operatorFolder) {
      queries.push({ key: 'folder-daily', constraints: [where('operatorFolder', '==', operator.operatorFolder), where('dailyDate', '==', dateKey)] });
      queries.push({ key: 'folder-subfolder', constraints: [where('operatorFolder', '==', operator.operatorFolder), where('subfolderDay', '==', dateKey)] });
      queries.push({ key: 'folder-path', constraints: [where('folderPath', '==', `${operator.operatorFolder}/${dateKey}`)] });
    }
    return queries;
  }

  async function fetchGalleryGamesPageFromFirestore(
    operator: GalleryOperator,
    dateKey: string,
    cursor: GalleryGamesCursor | null = null,
    shouldContinue: () => boolean = () => true
  ): Promise<GalleryGamesPage> {
    const querySpecs = makeDateQueries(operator, dateKey);
    const nextCursor: GalleryGamesCursor = {};
    const gameById = new Map<string, GameSequenceItem>();
    let hasMore = false;

    for (const spec of querySpecs) {
      if (!shouldContinue()) return { games: [], cursor: null, hasMore: false };
      let q = query(collection(db, 'saved_games'), ...spec.constraints);
      if (cursor?.[spec.key]) q = query(q, startAfter(cursor[spec.key]!));
      q = query(q, limit(PAGE_SIZE));
      const page = await getDocs(q);
      if (!shouldContinue()) return { games: [], cursor: null, hasMore: false };
      nextCursor[spec.key] = page.docs[page.docs.length - 1] || null;
      if (page.size === PAGE_SIZE) hasMore = true;
      page.docs.forEach((snapshot) => {
        const game = normalizeRemoteGame(snapshot.id, snapshot.data());
        if (!game) return;
        const operatorMatches = !(operator.operatorUid && operator.operatorUid !== 'anon' && game.operatorUid && game.operatorUid !== 'anon' && game.operatorUid !== operator.operatorUid);
        const gameDate = dependencies.getGameNormalizedDateKey(game) || normalizeDateKey(game);
        if (gameDate !== dateKey) return;
        if (!operatorMatches) return;
        gameById.set(snapshot.id, game);
      });
    }

    if (!shouldContinue()) return { games: [], cursor: null, hasMore: false };

    for (const game of storageState.firestoreGamesMemoryStore.values()) {
      if ((dependencies.getGameNormalizedDateKey(game) || normalizeDateKey(game)) !== dateKey) continue;
      if (operator.operatorUid && game.operatorUid && game.operatorUid !== 'anon' && game.operatorUid !== operator.operatorUid) continue;
      if ((!game.operatorUid || game.operatorUid === 'anon') && operator.operatorFolder && game.operatorFolder && game.operatorFolder !== operator.operatorFolder) continue;
      if (game.id && !storageState.deletedGameIdsSet.has(game.id)) gameById.set(game.id, game);
    }

    const games = dependencies.sortGamesChronologicallyDesc(Array.from(gameById.values()));
    games.forEach((game) => {
      if (!game.id) return;
      storageState.firestoreGamesMemoryStore.set(game.id, game);
      void dependencies.saveGameToIndexedDB(game);
    });
    storageState.cachedSortedGames = dependencies.sortGamesChronologicallyDesc(
      Array.from(storageState.firestoreGamesMemoryStore.values())
    );
    dependencies.syncTemporaryLocalCache(storageState.cachedSortedGames);
    return { games, cursor: hasMore ? nextCursor : null, hasMore };
  }

  function mergeGamesById(...lists: GameSequenceItem[][]): GameSequenceItem[] {
    const games = new Map<string, GameSequenceItem>();
    lists.forEach((list) => list.forEach((game) => {
      const key = game.id || `${game.round}-${game.timestamp}`;
      const previous = games.get(key);
      if (!previous || isIncomingGameNewer(previous, game)) games.set(key, game);
    }));
    return dependencies.sortGamesChronologicallyDesc(Array.from(games.values()));
  }

  function getUpdatedAtValue(game: GameSequenceItem): number | null {
    const value = (game as GameSequenceItem & { updatedAt?: unknown }).updatedAt as
      | { toMillis?: () => number; seconds?: number }
      | string
      | number
      | null
      | undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (value && typeof value === 'object') {
      if (typeof value.toMillis === 'function') {
        const parsed = value.toMillis();
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (typeof value.seconds === 'number') return value.seconds * 1000;
    }
    return null;
  }

  function getTimestampOrderValue(game: GameSequenceItem): number | null {
    const match = game.timestamp?.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;
    let hours = Number(match[1]);
    if (match[4]?.toUpperCase() === 'AM' && hours === 12) hours = 0;
    if (match[4]?.toUpperCase() === 'PM' && hours !== 12) hours += 12;
    return hours * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
  }

  function isIncomingGameNewer(previous: GameSequenceItem, incoming: GameSequenceItem): boolean {
    const previousUpdatedAt = getUpdatedAtValue(previous);
    const incomingUpdatedAt = getUpdatedAtValue(incoming);
    if (incomingUpdatedAt !== null || previousUpdatedAt !== null) {
      return incomingUpdatedAt !== null && (previousUpdatedAt === null || incomingUpdatedAt > previousUpdatedAt);
    }
    const previousTimestamp = getTimestampOrderValue(previous);
    const incomingTimestamp = getTimestampOrderValue(incoming);
    return incomingTimestamp !== null && (previousTimestamp === null || incomingTimestamp > previousTimestamp);
  }

  function notifyGameCallbacks(callbacks: Set<(update: GalleryGamesUpdate) => void>, update: GalleryGamesUpdate): void {
    callbacks.forEach((callback) => {
      try {
        callback({ ...update, games: [...update.games] });
      } catch {
        // Keep background cache refresh independent from UI subscribers.
      }
    });
  }

  async function refreshGalleryGamesInBackground(
    operator: GalleryOperator,
    dateKey: string,
    key: string,
    callbacks: Set<(update: GalleryGamesUpdate) => void>,
    initialPage?: GalleryGamesPage
  ): Promise<void> {
    const existingScan = activeGameScans.get(key);
    if (existingScan && !existingScan.cancelled) {
      callbacks.forEach((callback) => existingScan.callbacks.add(callback));
      console.log('[PERF] shared_request', key);
      return existingScan.promise;
    }
    if (existingScan?.cancelled) activeGameScans.delete(key);
    const scan = { callbacks, cancelled: false, promise: Promise.resolve() };
    const run = Promise.resolve().then(async () => {
      let cursor = initialPage?.cursor ?? null;
      let hasMore = initialPage?.hasMore ?? true;
      const refreshedGames = new Map<string, GameSequenceItem>();
      if (initialPage) {
        initialPage.games.forEach((game) => refreshedGames.set(game.id || `${game.round}-${game.timestamp}`, game));
      }
      const oldCache = galleryGamesCache.get(key);
      const oldGames = oldCache?.games || [];

      while (!scan.cancelled && hasMore) {
        const page = await runSerializedGamePageQuery(operator, dateKey, cursor, () => !scan.cancelled);
        if (scan.cancelled) return;
        page.games.forEach((game) => refreshedGames.set(game.id || `${game.round}-${game.timestamp}`, game));
        cursor = page.cursor;
        hasMore = page.hasMore;
        const refreshed = dependencies.sortGamesChronologicallyDesc(Array.from(refreshedGames.values()));
        const games = mergeGamesById(oldGames, refreshed);
        const update: GalleryGamesUpdate = { games, cursor, hasMore, append: false };
        notifyGameCallbacks(scan.callbacks, update);
        const entry: GalleryGamesCacheEntry = {
          key,
          operatorUid: getOperatorIdentity(operator),
          operatorName: operator.operatorName,
          operatorFolder: operator.operatorFolder,
          dateKey,
          games,
          cursor,
          hasMore,
          fullyLoaded: !hasMore,
          lastLoaded: Date.now(),
        };
        cacheGames(key, entry);
        persistGames(entry);
      }

      if (!scan.cancelled && !hasMore) {
        const games = mergeGamesById(oldGames, Array.from(refreshedGames.values()));
        const finalCursor = cursor;
        notifyGameCallbacks(scan.callbacks, { games, cursor: finalCursor, hasMore: false, append: false });
        const entry: GalleryGamesCacheEntry = {
          key,
          operatorUid: getOperatorIdentity(operator),
          operatorName: operator.operatorName,
          operatorFolder: operator.operatorFolder,
          dateKey,
          games,
          cursor: finalCursor,
          hasMore: false,
          fullyLoaded: true,
          lastLoaded: Date.now(),
        };
        cacheGames(key, entry);
        persistGames(entry);
      }
    }).finally(() => {
      if (activeGameScans.get(key) === scan) activeGameScans.delete(key);
    });
    scan.promise = run;
    activeGameScans.set(key, scan);
    return run;
  }

  async function loadGalleryGamesPage(
    operator: GalleryOperator,
    dateKey: string,
    cursor: GalleryGamesCursor | null,
    request: {
      cacheKey: string;
      operatorIdentity: string;
      prefetchOnly: boolean;
      revalidateOnCompletion: boolean;
      cancelled: boolean;
      callbacks: Set<(update: GalleryGamesUpdate) => void>;
      promise: Promise<GalleryGamesPage>;
    }
  ): Promise<GalleryGamesPage> {
    const key = request.cacheKey;
    const callbacks = request.callbacks;
    if (request.cancelled) return { games: [], cursor: null, hasMore: false };

    if (cursor) {
      const page = await runSerializedGamePageQuery(operator, dateKey, cursor, () => !request.cancelled);
      if (request.cancelled) return { games: [], cursor: null, hasMore: false };
      const previous = galleryGamesCache.get(key);
      const games = mergeGamesById(previous?.games || [], page.games);
      const entry: GalleryGamesCacheEntry = {
        key,
        operatorUid: getOperatorIdentity(operator),
        operatorName: operator.operatorName,
        operatorFolder: operator.operatorFolder,
        dateKey,
        games,
        cursor: page.cursor,
        hasMore: page.hasMore,
        fullyLoaded: !page.hasMore,
        lastLoaded: Date.now(),
      };
      cacheGames(key, entry);
      persistGames(entry);
      return page;
    }

    let cached = galleryGamesCache.get(key);
    if (cached) {
      cacheGames(key, cached);
      console.log('[PERF] cache_hit', key);
      if (request.revalidateOnCompletion) {
        void refreshGalleryGamesInBackground(operator, dateKey, key, callbacks).catch(() => {});
      }
      return {
        games: [...cached.games],
        cursor: cached.hasMore ? cached.cursor || {} : null,
        hasMore: cached.hasMore,
      };
    }

    const diskRecord = await galleryCacheDB.getGames(key).catch(() => undefined);
    if (request.cancelled) return { games: [], cursor: null, hasMore: false };
    if (diskRecord) {
      cached = {
        ...diskRecord,
        key,
        operatorName: operator.operatorName,
        operatorFolder: operator.operatorFolder,
        cursor: null,
      };
      cacheGames(key, cached);
      console.log('[PERF] cache_hit', key);
      if (request.revalidateOnCompletion) {
        void refreshGalleryGamesInBackground(operator, dateKey, key, callbacks).catch(() => {});
      }
      return {
        games: [...cached.games],
        cursor: cached.hasMore ? {} : null,
        hasMore: cached.hasMore,
      };
    }

    console.log('[PERF] cache_miss', key);
    const page = await runSerializedGamePageQuery(operator, dateKey, null, () => !request.cancelled);
    if (request.cancelled) return { games: [], cursor: null, hasMore: false };
    if (callbacks.size > 0) notifyGameCallbacks(callbacks, { ...page, append: false });
    const entry: GalleryGamesCacheEntry = {
      key,
      operatorUid: getOperatorIdentity(operator),
      operatorName: operator.operatorName,
      operatorFolder: operator.operatorFolder,
      dateKey,
      games: [...page.games],
      cursor: page.cursor,
      hasMore: page.hasMore,
      fullyLoaded: !page.hasMore,
      lastLoaded: Date.now(),
    };
    cacheGames(key, entry);
    persistGames(entry);
    if (request.prefetchOnly && request.revalidateOnCompletion && page.hasMore && callbacks.size > 0) {
      void refreshGalleryGamesInBackground(operator, dateKey, key, callbacks, page).catch(() => {});
    } else if (!request.prefetchOnly && page.hasMore && callbacks.size > 0) {
      void refreshGalleryGamesInBackground(operator, dateKey, key, callbacks, page).catch(() => {});
    }
    return page;
  }

  function getPageRequestKey(cacheKey: string, cursor: GalleryGamesCursor | null): string {
    if (!cursor) return `${cacheKey}:first`;
    const cursorKey = Object.entries(cursor)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([queryKey, snapshot]) => `${queryKey}=${snapshot?.id || ''}`)
      .join('|');
    return `${cacheKey}:cursor:${cursorKey}`;
  }

  function getGalleryGamesPage(
    operator: GalleryOperator,
    dateKey: string,
    cursor: GalleryGamesCursor | null = null,
    onGamesUpdate?: (update: GalleryGamesUpdate) => void,
    prefetchOnly = false
  ): Promise<GalleryGamesPage> {
    const cacheKey = getGalleryGamesCacheKey(operator, dateKey);
    const operatorIdentity = getOperatorIdentity(operator);

    if (!prefetchOnly) {
      if (activeGalleryOperatorIdentity !== operatorIdentity) {
        cancelObsoleteGameWork(operatorIdentity);
        activeGalleryOperatorIdentity = operatorIdentity;
      }
      if (activeSelectedGameCacheKey !== cacheKey) {
        cancelObsoleteGameWork(operatorIdentity, cacheKey);
        activeSelectedGameCacheKey = cacheKey;
      }
    }

    const requestKey = getPageRequestKey(cacheKey, cursor);
    const existingRequest = pendingGamePageRequests.get(requestKey);
    if (existingRequest && !existingRequest.cancelled) {
      if (onGamesUpdate) existingRequest.callbacks.add(onGamesUpdate);
      if (!prefetchOnly) existingRequest.revalidateOnCompletion = true;
      console.log('[PERF] shared_request', cacheKey);
      return existingRequest.promise;
    }

    const request = {
      cacheKey,
      operatorIdentity,
      prefetchOnly,
      revalidateOnCompletion: !prefetchOnly,
      cancelled: false,
      callbacks: new Set<(update: GalleryGamesUpdate) => void>(),
      promise: Promise.resolve({ games: [], cursor: null, hasMore: false } as GalleryGamesPage),
    };
    if (onGamesUpdate) request.callbacks.add(onGamesUpdate);
    const promise = Promise.resolve()
      .then(() => loadGalleryGamesPage(operator, dateKey, cursor, request))
      .finally(() => {
        if (pendingGamePageRequests.get(requestKey) === request) pendingGamePageRequests.delete(requestKey);
      });
    request.promise = promise;
    pendingGamePageRequests.set(requestKey, request);
    return promise;
  }

  function subscribeToTodaySavedGames(
    operator: GalleryOperator,
    dateKey: string,
    mode: BingoMode,
    callback: (games: GameSequenceItem[]) => void
  ): () => void {
    if (typeof window === 'undefined') return () => {};
    dependencies.initConnectionMonitor();
    const active: Array<() => void> = [];
    const results = new Map<string, Map<string, GameSequenceItem>>();
    const spec: Array<{ key: string; constraints: QueryConstraint[] }> = [];
    const modeConstraints = [where('mode', '==', mode)];
    const sheetType = mode === '90' ? 'traditional-90' : 'multipliers-15';
    const sheetConstraints = [where('sheetType', '==', sheetType)];
    if (operator.operatorUid && operator.operatorUid !== 'anon') {
      spec.push({ key: 'uid-mode', constraints: [where('operatorUid', '==', operator.operatorUid), where('dailyDate', '==', dateKey), ...modeConstraints] });
      spec.push({ key: 'uid-sheet', constraints: [where('operatorUid', '==', operator.operatorUid), where('dailyDate', '==', dateKey), ...sheetConstraints] });
      spec.push({ key: 'uid-subfolder-mode', constraints: [where('operatorUid', '==', operator.operatorUid), where('subfolderDay', '==', dateKey), ...modeConstraints] });
      spec.push({ key: 'uid-subfolder-sheet', constraints: [where('operatorUid', '==', operator.operatorUid), where('subfolderDay', '==', dateKey), ...sheetConstraints] });
    }
    if (operator.operatorFolder) {
      spec.push({ key: 'folder-mode', constraints: [where('operatorFolder', '==', operator.operatorFolder), where('dailyDate', '==', dateKey), ...modeConstraints] });
      spec.push({ key: 'folder-sheet', constraints: [where('operatorFolder', '==', operator.operatorFolder), where('dailyDate', '==', dateKey), ...sheetConstraints] });
      spec.push({ key: 'folder-subfolder-mode', constraints: [where('operatorFolder', '==', operator.operatorFolder), where('subfolderDay', '==', dateKey), ...modeConstraints] });
      spec.push({ key: 'folder-subfolder-sheet', constraints: [where('operatorFolder', '==', operator.operatorFolder), where('subfolderDay', '==', dateKey), ...sheetConstraints] });
      spec.push({ key: 'path-mode', constraints: [where('folderPath', '==', `${operator.operatorFolder}/${dateKey}`), ...modeConstraints] });
      spec.push({ key: 'path-sheet', constraints: [where('folderPath', '==', `${operator.operatorFolder}/${dateKey}`), ...sheetConstraints] });
    }

    const publish = () => {
      const combined = new Map<string, GameSequenceItem>();
      results.forEach((items) => items.forEach((game, id) => combined.set(id, game)));
      for (const [id, game] of storageState.firestoreGamesMemoryStore.entries()) {
        if ((dependencies.getGameNormalizedDateKey(game) || normalizeDateKey(game)) !== dateKey || storageState.deletedGameIdsSet.has(id)) continue;
        if (game.operatorUid && game.operatorUid !== 'anon' && game.operatorUid !== operator.operatorUid) continue;
        if ((!game.operatorUid || game.operatorUid === 'anon') && operator.operatorFolder && game.operatorFolder && game.operatorFolder !== operator.operatorFolder) continue;
        const gameMode = game.mode || (game.sheetType === 'traditional-90' ? '90' : '75');
        if (gameMode === mode) combined.set(id, game);
      }
      callback(dependencies.sortGamesChronologicallyDesc(Array.from(combined.values())));
    };

    spec.forEach(({ key, constraints }) => {
      const q = query(collection(db, 'saved_games'), ...constraints, orderBy('round', 'desc'), limit(100));
      active.push(onSnapshot(q, (snapshot) => {
        dependencies.updateSyncStatus({ isFirestoreReachable: true });
        const games = new Map<string, GameSequenceItem>();
        snapshot.docs.forEach((docSnapshot) => {
          const game = normalizeRemoteGame(docSnapshot.id, docSnapshot.data());
          if (!game) return;
          if ((dependencies.getGameNormalizedDateKey(game) || normalizeDateKey(game)) !== dateKey) return;
          const gameMode = game.mode || (game.sheetType === 'traditional-90' ? '90' : '75');
          if (gameMode !== mode) return;
          if (operator.operatorUid && game.operatorUid && game.operatorUid !== 'anon' && game.operatorUid !== operator.operatorUid) return;
          games.set(docSnapshot.id, game);
          storageState.firestoreGamesMemoryStore.set(docSnapshot.id, game);
          void dependencies.saveGameToIndexedDB(game);
        });
        results.set(key, games);
        storageState.cachedSortedGames = dependencies.sortGamesChronologicallyDesc(
          Array.from(storageState.firestoreGamesMemoryStore.values())
        );
        dependencies.syncTemporaryLocalCache(storageState.cachedSortedGames);
        publish();
      }, (error) => {
        console.warn('Scoped saved_games listener error:', error);
        dependencies.updateSyncStatus({ isFirestoreReachable: false });
      }));
    });

    const local = getSavedGamesGallery().filter((game) =>
      (dependencies.getGameNormalizedDateKey(game) || normalizeDateKey(game)) === dateKey &&
      (!operator.operatorUid || !game.operatorUid || game.operatorUid === 'anon' || game.operatorUid === operator.operatorUid) &&
      ((game.operatorUid && game.operatorUid !== 'anon') || !operator.operatorFolder || !game.operatorFolder || game.operatorFolder === operator.operatorFolder) &&
      ((game.mode || (game.sheetType === 'traditional-90' ? '90' : '75')) === mode)
    );
    callback(dependencies.sortGamesChronologicallyDesc(local));
    return () => active.forEach((unsubscribe) => unsubscribe());
  }

  function subscribeToRecentSavedGames(callback: (games: GameSequenceItem[]) => void): () => void {
    if (typeof window === 'undefined') return () => {};
    dependencies.initConnectionMonitor();
    const q = query(collection(db, 'saved_games'), orderBy('dailyDate', 'desc'), limit(RECENT_ADMIN_PAGE_SIZE));
    return onSnapshot(q, (snapshot) => {
      dependencies.updateSyncStatus({ isFirestoreReachable: true });
      const games = snapshot.docs
        .map((snapshotDoc) => normalizeRemoteGame(snapshotDoc.id, snapshotDoc.data()))
        .filter((game): game is GameSequenceItem => Boolean(game));
      callback(dependencies.sortGamesChronologicallyDesc(games));
    }, (error) => {
      console.warn('Recent saved_games listener error:', error);
      dependencies.updateSyncStatus({ isFirestoreReachable: false });
    });
  }

  function saveGameToGalleryCache(normalizedItem: GameSequenceItem): void {
    if (!normalizedItem) return;
    const { normalizedGame } = dependencies.normalizeGameFolderMetadata(normalizedItem, normalizedItem.id);
    if (!normalizedGame.id) return;
    storageState.firestoreGamesMemoryStore.set(normalizedGame.id, normalizedGame);
    invalidateGalleryGamesCacheForGame(normalizedGame);
    const dateCacheKey = normalizedGame.operatorUid && normalizedGame.operatorUid !== 'anon'
      ? `uid:${normalizedGame.operatorUid}`
      : `folder:${normalizedGame.operatorFolder || normalizedGame.operatorName}`;
    markGalleryDatesCacheStale(dateCacheKey);
    publishLocalGalleryUpdate(normalizedGame);
    void dependencies.saveGameToIndexedDB(normalizedGame);
  }

  return {
    getSavedGamesGallery,
    getGalleryOperators,
    getGalleryDates,
    getGalleryGamesPage,
    invalidateGalleryDatesCache,
    invalidateGalleryGamesCache,
    invalidateGalleryGamesCacheForGame,
    invalidateGalleryGamesCacheByGameId,
    invalidateGalleryGamesCacheForFolder,
    deleteGalleryDateCache,
    clearGalleryCaches,
    subscribeToTodaySavedGames,
    subscribeToRecentSavedGames,
    saveGameToGalleryCache,
  };
}
