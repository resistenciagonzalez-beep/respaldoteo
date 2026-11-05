import type { AppUser, BingoMode, GameSequenceItem } from '../types';
import {
  collection,
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

const PAGE_SIZE = 8;
const OPERATOR_SCAN_PAGE_SIZE = 8;
const RECENT_ADMIN_PAGE_SIZE = 20;

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

export type GalleryGamesCursor = Record<string, QueryDocumentSnapshot | null>;

export interface GalleryGamesPage {
  games: GameSequenceItem[];
  cursor: GalleryGamesCursor | null;
  hasMore: boolean;
}

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

  async function getGalleryOperators(currentUser: AppUser | null | undefined, isAdmin: boolean): Promise<GalleryOperator[]> {
    if (!isAdmin && currentUser) {
      const uid = currentUser.id || currentUser.uid || '';
      return [{
        key: uid ? `uid:${uid}` : `folder:${currentUser.name.trim().toLowerCase()}`,
        operatorUid: uid,
        operatorName: currentUser.name || 'Operadora Principal',
        operatorFolder: dependencies.sanitizeOperatorFolderName(currentUser.name || 'Operadora Principal'),
      }];
    }

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
      return operators.sort((a, b) => a.operatorName.localeCompare(b.operatorName, 'es'));
    } catch (error) {
      console.warn('Could not load gallery operators from Firestore:', error);
      return [];
    }
  }

  function makeOperatorQueries(operator: GalleryOperator): Array<{ key: string; constraints: QueryConstraint[] }> {
    const queries: Array<{ key: string; constraints: QueryConstraint[] }> = [];
    if (operator.operatorUid && operator.operatorUid !== 'anon') {
      queries.push({ key: 'uid', constraints: [where('operatorUid', '==', operator.operatorUid)] });
    }
    if (operator.operatorFolder) {
      queries.push({ key: 'folder', constraints: [where('operatorFolder', '==', operator.operatorFolder)] });
    }
    return queries;
  }

  async function getGalleryDates(operator: GalleryOperator): Promise<GalleryDate[]> {
    const seenGameIds = new Set<string>();
    const groups = new Map<string, GalleryDate>();
    const addGameToDateSummary = (id: string, game: GameSequenceItem) => {
      if (seenGameIds.has(id)) return;
      seenGameIds.add(id);
      const dateKey = dependencies.getGameNormalizedDateKey(game) || normalizeDateKey(game);
      if (!dateKey) return;
      let summary = groups.get(dateKey);
      if (!summary) {
        const label = dateLabel(dateKey);
        summary = { dateKey, ...label, gameCount: 0, totalLines: 0, totalCollected: 0, totalPrizes: 0, netProfit: 0 };
        groups.set(dateKey, summary);
      }
      summary.gameCount += 1;
      summary.totalLines += dependencies.getGameLines(game);
      summary.totalCollected = Math.round((summary.totalCollected + (Number(game.totalCollected) || 0)) * 100) / 100;
      summary.totalPrizes = Math.round((summary.totalPrizes + (Number(game.totalPrizesPaid) || 0)) * 100) / 100;
      summary.netProfit = Math.round((summary.totalCollected - summary.totalPrizes) * 100) / 100;
    };
    const querySpecs = makeOperatorQueries(operator);
    for (const spec of querySpecs) {
      let cursor: QueryDocumentSnapshot | null = null;
      while (true) {
        const constraints = [...spec.constraints, limit(OPERATOR_SCAN_PAGE_SIZE)];
        if (cursor) constraints.push(startAfter(cursor));
        const page = await getDocs(query(collection(db, 'saved_games'), ...constraints));
        if (page.empty) break;
        page.docs.forEach((snapshot) => {
          const game = normalizeRemoteGame(snapshot.id, snapshot.data());
          if (!game) return;
          if (operator.operatorUid && operator.operatorUid !== 'anon' && game.operatorUid && game.operatorUid !== 'anon' && game.operatorUid !== operator.operatorUid) return;
          addGameToDateSummary(snapshot.id, game);
        });
        cursor = page.docs[page.docs.length - 1];
        if (page.size < OPERATOR_SCAN_PAGE_SIZE) break;
      }
    }

    for (const game of storageState.firestoreGamesMemoryStore.values()) {
      const hasReliableGameUid = Boolean(game.operatorUid && game.operatorUid !== 'anon');
      const uidMatches = !operator.operatorUid || operator.operatorUid === 'anon' || !hasReliableGameUid || game.operatorUid === operator.operatorUid;
      const folderMatches = !operator.operatorFolder || (game.operatorFolder || game.operatorName) === operator.operatorFolder;
      if (uidMatches && (hasReliableGameUid ? true : folderMatches) && game.id && !storageState.deletedGameIdsSet.has(game.id)) addGameToDateSummary(game.id, game);
    }
    const dates = Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return dates;
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

  async function getGalleryGamesPage(
    operator: GalleryOperator,
    dateKey: string,
    cursor: GalleryGamesCursor | null = null
  ): Promise<GalleryGamesPage> {
    const querySpecs = makeDateQueries(operator, dateKey);
    const nextCursor: GalleryGamesCursor = {};
    const gameById = new Map<string, GameSequenceItem>();
    let hasMore = false;

    for (const spec of querySpecs) {
      let q = query(collection(db, 'saved_games'), ...spec.constraints);
      if (cursor?.[spec.key]) q = query(q, startAfter(cursor[spec.key]!));
      q = query(q, limit(PAGE_SIZE));
      const page = await getDocs(q);
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
    publishLocalGalleryUpdate(normalizedGame);
    void dependencies.saveGameToIndexedDB(normalizedGame);
  }

  return {
    getSavedGamesGallery,
    getGalleryOperators,
    getGalleryDates,
    getGalleryGamesPage,
    subscribeToTodaySavedGames,
    subscribeToRecentSavedGames,
    saveGameToGalleryCache,
  };
}
