import type { AppUser, GameSequenceItem } from '../types';
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';
import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  isGameOfOperator,
  normalizeGameFolderMetadata,
  sanitizeOperatorFolderName,
  sortGamesChronologicallyDesc,
} from './gameNormalization';

const HISTORY_PAGE_SIZE = 40;

type MismosHistoryCacheEntry = {
  user: AppUser | null | undefined;
  loaded: boolean;
  gamesById: Map<string, GameSequenceItem>;
  sortedGames: GameSequenceItem[];
};

const mismosHistoryCache = new Map<string, MismosHistoryCacheEntry>();
const locallySavedGames = new Map<string, GameSequenceItem>();
const locallyDeletedGameIds = new Set<string>();
const pendingHistoryRequests = new Map<string, Promise<GameSequenceItem[]>>();

function getMismosHistoryCacheKey(user?: AppUser | null): string {
  if (!user || user.role === 'admin') return 'all-games';
  const identity = user.id || user.uid || user.email || user.name || 'operator';
  return `operator:${identity}`;
}

function gameBelongsToHistoryEntry(game: GameSequenceItem, entry: MismosHistoryCacheEntry): boolean {
  return !entry.user || entry.user.role === 'admin' || isGameOfOperator(game, entry.user);
}

function sortMismosHistoryEntry(entry: MismosHistoryCacheEntry): void {
  entry.sortedGames = sortGamesChronologicallyDesc(Array.from(entry.gamesById.values()));
}

/** Adds a locally saved game to already-loaded Mismos histories and carries it into the first load. */
export function upsertSavedGameHistoryForMismos(game: GameSequenceItem): void {
  if (!game?.id) return;
  locallyDeletedGameIds.delete(game.id);
  locallySavedGames.set(game.id, game);
  for (const entry of mismosHistoryCache.values()) {
    if (!gameBelongsToHistoryEntry(game, entry)) continue;
    entry.gamesById.set(game.id, game);
    if (entry.loaded) sortMismosHistoryEntry(entry);
  }
}

/** Removes deleted games from every Mismos history and prevents an in-flight read from restoring them. */
export function removeSavedGamesFromMismosHistory(gameIds: string[]): void {
  gameIds.forEach((gameId) => {
    locallyDeletedGameIds.add(gameId);
    locallySavedGames.delete(gameId);
  });
  for (const entry of mismosHistoryCache.values()) {
    let changed = false;
    gameIds.forEach((gameId) => {
      changed = entry.gamesById.delete(gameId) || changed;
    });
    if (changed && entry.loaded) sortMismosHistoryEntry(entry);
  }
}

/** Reads saved game history directly from Firestore, independently of gallery state and caches. */
export async function getSavedGamesHistoryForMismos(user?: AppUser | null): Promise<GameSequenceItem[]> {
  const cacheKey = getMismosHistoryCacheKey(user);
  const cached = mismosHistoryCache.get(cacheKey);
  if (cached?.loaded) return cached.sortedGames;

  const pending = pendingHistoryRequests.get(cacheKey);
  if (pending) return pending;

  const request = loadSavedGamesHistoryForMismos(user, cacheKey);
  pendingHistoryRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (pendingHistoryRequests.get(cacheKey) === request) pendingHistoryRequests.delete(cacheKey);
  }
}

async function loadSavedGamesHistoryForMismos(
  user: AppUser | null | undefined,
  cacheKey: string
): Promise<GameSequenceItem[]> {
  const querySpecs: Array<QueryConstraint[]> = [];
  const isAdmin = user?.role === 'admin';

  if (!user || isAdmin) {
    querySpecs.push([]);
  } else {
    const operatorUid = user.id || user.uid;
    const operatorEmail = user.email?.trim();
    const operatorName = user.name?.trim();
    const operatorFolder = sanitizeOperatorFolderName(operatorName);
    const seenSpecs = new Set<string>();
    const candidates: Array<[string, string] | null> = [
      operatorUid ? ['operatorUid', operatorUid] : null,
      operatorEmail ? ['operatorEmail', operatorEmail] : null,
      operatorName ? ['operatorName', operatorName] : null,
      operatorFolder ? ['operatorFolder', operatorFolder] : null,
    ];
    candidates.forEach((candidate) => {
      if (!candidate) return;
      const [field, value] = candidate;
      const key = `${field}\u0000${value}`;
      if (seenSpecs.has(key)) return;
      seenSpecs.add(key);
      querySpecs.push([where(field, '==', value)]);
    });
  }

  const existingEntry = mismosHistoryCache.get(cacheKey);
  const gamesById = existingEntry?.gamesById || new Map<string, GameSequenceItem>();
  for (const spec of querySpecs) {
    let cursor: QueryDocumentSnapshot | null = null;
    while (true) {
      const constraints: QueryConstraint[] = [...spec, orderBy(documentId()), limit(HISTORY_PAGE_SIZE)];
      if (cursor) constraints.push(startAfter(cursor));
      const page = await getDocs(query(collection(db, 'saved_games'), ...constraints));
      page.docs.forEach((snapshot) => {
        if (locallyDeletedGameIds.has(snapshot.id)) return;
        const rawGame = { ...snapshot.data(), id: snapshot.id } as GameSequenceItem;
        const { normalizedGame } = normalizeGameFolderMetadata(rawGame, snapshot.id);
        if (!user || isGameOfOperator(normalizedGame, user)) {
          gamesById.set(snapshot.id, normalizedGame);
        }
      });
      if (page.empty || page.size < HISTORY_PAGE_SIZE) break;
      cursor = page.docs[page.docs.length - 1];
    }
  }

  locallySavedGames.forEach((game, gameId) => {
    if (!locallyDeletedGameIds.has(gameId) && (!user || isAdmin || isGameOfOperator(game, user))) {
      gamesById.set(gameId, game);
    }
  });

  const entry: MismosHistoryCacheEntry = {
    user,
    loaded: true,
    gamesById,
    sortedGames: [],
  };
  sortMismosHistoryEntry(entry);
  mismosHistoryCache.set(cacheKey, entry);
  return entry.sortedGames;
}
