import type { GameSequenceItem } from '../types';
import { getGameLines, parseDateStringToDateKey } from './gameNormalization';
import {
  collection,
  count,
  documentId,
  deleteDoc,
  doc,
  getAggregateFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  sum,
  where,
} from 'firebase/firestore';
import type { QueryConstraint, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface SavedGameDay {
  operatorUid: string;
  dailyDate: string;
  operatorFolder: string;
  operatorName: string;
  folderPath: string;
  gamesCount: number;
  totalLines: number;
  lastRound: number;
  updatedAt?: unknown;
}

const GAME_DAYS_COLLECTION = 'saved_game_days';

function getGameDate(game: GameSequenceItem): string {
  const gameWithFallbackDates = game as GameSequenceItem & {
    savedAt?: unknown;
  };
  const dateCandidates: unknown[] = [
    game.dailyDate,
    game.subfolderDay,
    game.folderPath?.split('/').pop(),
    game.createdAt,
    gameWithFallbackDates.savedAt,
    (game as GameSequenceItem & { createdAtISO?: unknown }).createdAtISO,
    (game as GameSequenceItem & { savedAtISO?: unknown }).savedAtISO,
    game.timestamp,
  ];

  for (const candidate of dateCandidates) {
    try {
      let dateValue: unknown = candidate;
      if (candidate instanceof Date) {
        dateValue = candidate.toISOString();
      } else if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        const timestampMs = Math.abs(candidate) < 1_000_000_000_000 ? candidate * 1000 : candidate;
        dateValue = new Date(timestampMs).toISOString();
      } else if (candidate && typeof candidate === 'object') {
        const timestamp = candidate as { toDate?: () => Date; seconds?: number };
        if (typeof timestamp.toDate === 'function') {
          dateValue = timestamp.toDate().toISOString();
        } else if (typeof timestamp.seconds === 'number') {
          dateValue = new Date(timestamp.seconds * 1000).toISOString();
        }
      }

      const parsedDate = parseDateStringToDateKey(
        typeof dateValue === 'string' ? dateValue : null
      );
      if (!parsedDate || !/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) continue;

      const [year, month, day] = parsedDate.split('-').map(Number);
      const validationDate = new Date(year, month - 1, day);
      if (
        validationDate.getFullYear() === year &&
        validationDate.getMonth() === month - 1 &&
        validationDate.getDate() === day
      ) {
        return parsedDate;
      }
    } catch {
      continue;
    }
  }

  const documentDate = game.id?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  if (documentDate) {
    const [year, month, day] = documentDate.split('-').map(Number);
    const validationDate = new Date(year, month - 1, day);
    if (
      validationDate.getFullYear() === year &&
      validationDate.getMonth() === month - 1 &&
      validationDate.getDate() === day
    ) {
      return documentDate;
    }
  }

  return '';
}

function getGameDayDocumentId(operatorUid: string, dailyDate: string): string {
  return `${encodeURIComponent(operatorUid)}__${dailyDate}`;
}

const REBUILD_PAGE_SIZE = 500;

export interface SavedGameDaysRebuildSummary {
  gamesRead: number;
  operatorsFound: number;
  datesFound: number;
  documentsCreated: number;
  documentsUpdated: number;
  documentsDeleted: number;
  sourceErrors: Array<{ documentId: string; error: string }>;
  writeErrors: Array<{ operatorUid: string; dailyDate: string; documentId: string; error: unknown }>;
}

function getGameDayReference(operatorUid: string, dailyDate: string) {
  return doc(db, GAME_DAYS_COLLECTION, getGameDayDocumentId(operatorUid, dailyDate));
}

async function getCurrentGameDaySummary(
  operatorUid: string,
  dailyDate: string
): Promise<{ gamesCount: number; totalLines: number }> {
  const gameQuery = query(
    collection(db, 'saved_games'),
    where('operatorUid', '==', operatorUid),
    where('dailyDate', '==', dailyDate)
  );
  const summary = await getAggregateFromServer(gameQuery, {
    gamesCount: count(),
    totalLines: sum('totalLinesPlayed'),
  });
  return {
    gamesCount: summary.data().gamesCount,
    totalLines: summary.data().totalLines,
  };
}

async function getLastRound(operatorUid: string, dailyDate: string): Promise<number> {
  const latestGameQuery = query(
    collection(db, 'saved_games'),
    where('operatorUid', '==', operatorUid),
    where('dailyDate', '==', dailyDate),
    orderBy('round', 'desc'),
    limit(1)
  );
  const snapshot = await getDocs(latestGameQuery);
  return Number(snapshot.docs[0]?.data().round) || 0;
}

async function refreshGameDay(operatorUid: string, dailyDate: string, game?: GameSequenceItem): Promise<void> {
  const dayReference = getGameDayReference(operatorUid, dailyDate);
  const [summary, lastRound, previousSnapshot] = await Promise.all([
    getCurrentGameDaySummary(operatorUid, dailyDate),
    getLastRound(operatorUid, dailyDate),
    getDoc(dayReference).catch(() => undefined),
  ]);
  const { gamesCount, totalLines: aggregatedTotalLines } = summary;

  if (gamesCount <= 0) {
    await deleteDoc(dayReference).catch(() => {});
    return;
  }

  const previous = previousSnapshot?.exists() ? previousSnapshot.data() : {};
  const previousGameCount = Number(previous.gamesCount) || 0;
  const previousTotalLines = Number(previous.totalLines) || 0;
  const totalLines = Math.max(
    aggregatedTotalLines,
    previousTotalLines + (game && gamesCount > previousGameCount ? getGameLines(game) : 0)
  );
  const operatorFolder = game?.operatorFolder || previous.operatorFolder || '';
  const operatorName = game?.operatorName || previous.operatorName || operatorFolder;
  const folderPath = game?.folderPath || previous.folderPath || `${operatorFolder}/${dailyDate}`;
  const docId = getGameDayDocumentId(operatorUid, dailyDate);
  console.log('[UPSERT_WRITE]', {
    operatorUid,
    dailyDate,
    operatorFolder,
    folderPath,
    gamesCount,
    totalLines,
    lastRound,
  });
  await setDoc(dayReference, {
    operatorUid,
    dailyDate,
    operatorFolder,
    operatorName,
    folderPath,
    gamesCount,
    totalLines,
    lastRound,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  console.log('[UPSERT_OK]', docId);
}

export const savedGameDaysService = {
  async rebuildSavedGameDays(): Promise<SavedGameDaysRebuildSummary> {
    const groupedDays = new Map<string, SavedGameDay>();
    const sourceErrors: SavedGameDaysRebuildSummary['sourceErrors'] = [];
    let gamesRead = 0;
    let cursor: QueryDocumentSnapshot | null = null;

    while (true) {
      const constraints: QueryConstraint[] = [orderBy(documentId()), limit(REBUILD_PAGE_SIZE)];
      if (cursor) constraints.push(startAfter(cursor));
      const page = await getDocs(query(collection(db, 'saved_games'), ...constraints));
      if (page.empty) break;
      gamesRead += page.size;

      for (const snapshot of page.docs) {
        const data = snapshot.data() as Record<string, unknown>;
        const operatorUid = typeof data.operatorUid === 'string' ? data.operatorUid.trim() : '';
        const dailyDate = typeof data.dailyDate === 'string' ? data.dailyDate.trim() : '';
        if (!operatorUid || !dailyDate) {
          const error = 'Document is missing operatorUid or dailyDate required for saved_game_days.';
          console.error(`[SAVED_GAME_DAYS_REBUILD] ${snapshot.id}`, error);
          sourceErrors.push({ documentId: snapshot.id, error });
          continue;
        }

        const operatorFolder = typeof data.operatorFolder === 'string' ? data.operatorFolder : '';
        const operatorName = typeof data.operatorName === 'string' ? data.operatorName : operatorFolder;
        const key = `${operatorUid}\u0000${dailyDate}`;
        const day = groupedDays.get(key) || {
          operatorUid,
          dailyDate,
          operatorFolder,
          operatorName,
          folderPath: typeof data.folderPath === 'string' && data.folderPath
            ? data.folderPath
            : `${operatorFolder}/${dailyDate}`,
          gamesCount: 0,
          totalLines: 0,
          lastRound: 0,
        };
        day.gamesCount += 1;
        day.totalLines += getGameLines(data as unknown as GameSequenceItem);
        day.lastRound = Math.max(day.lastRound, Number(data.round) || 0);
        groupedDays.set(key, day);
      }

      cursor = page.docs[page.docs.length - 1];
      if (page.size < REBUILD_PAGE_SIZE) break;
    }

    const existingSnapshot = await getDocs(collection(db, GAME_DAYS_COLLECTION));
    const existingDocs = existingSnapshot.docs;
    const existingById = new Map(existingDocs.map((snapshot) => [snapshot.id, snapshot]));
    const desiredById = new Map<string, SavedGameDay>();
    groupedDays.forEach((day) => desiredById.set(getGameDayDocumentId(day.operatorUid, day.dailyDate), day));
    const summary: SavedGameDaysRebuildSummary = {
      gamesRead,
      operatorsFound: new Set(Array.from(groupedDays.values(), (day) => day.operatorUid)).size,
      datesFound: groupedDays.size,
      documentsCreated: 0,
      documentsUpdated: 0,
      documentsDeleted: 0,
      sourceErrors,
      writeErrors: [],
    };

    for (const [documentId, day] of desiredById) {
      try {
        await setDoc(doc(db, GAME_DAYS_COLLECTION, documentId), {
          ...day,
          updatedAt: serverTimestamp(),
        });
        if (existingById.has(documentId)) summary.documentsUpdated += 1;
        else summary.documentsCreated += 1;
      } catch (error) {
        console.error('[SAVED_GAME_DAYS_REBUILD] write failed', {
          operatorUid: day.operatorUid,
          dailyDate: day.dailyDate,
          documentId,
          error,
        });
        summary.writeErrors.push({ operatorUid: day.operatorUid, dailyDate: day.dailyDate, documentId, error });
      }
    }

    // Keep stale entries if any desired write failed; this avoids removing valid index data on a partial rebuild.
    if (summary.writeErrors.length === 0 && summary.sourceErrors.length === 0) {
      for (const existing of existingDocs) {
        if (desiredById.has(existing.id)) continue;
        try {
          await deleteDoc(existing.ref);
          summary.documentsDeleted += 1;
        } catch (error) {
          const existingDay = existing.data() as Partial<SavedGameDay>;
          console.error('[SAVED_GAME_DAYS_REBUILD] delete failed', {
            operatorUid: existingDay.operatorUid || '',
            dailyDate: existingDay.dailyDate || '',
            documentId: existing.id,
            error,
          });
          summary.writeErrors.push({
            operatorUid: existingDay.operatorUid || '',
            dailyDate: existingDay.dailyDate || '',
            documentId: existing.id,
            error,
          });
        }
      }
    }

    return summary;
  },

  async getDays(operatorUid: string): Promise<SavedGameDay[]> {
    const daysQuery = query(
      collection(db, GAME_DAYS_COLLECTION),
      where('operatorUid', '==', operatorUid),
      orderBy('dailyDate', 'desc')
    );
    const snapshot = await getDocs(daysQuery);
    return snapshot.docs
      .filter((daySnapshot) => !daySnapshot.id.startsWith('__migration__'))
      .map((daySnapshot) => daySnapshot.data() as SavedGameDay);
  },

  async upsertSavedGame(game: GameSequenceItem): Promise<void> {
    const gameId = game.id;
    const operatorUid = game.operatorUid || 'anon';
    const extractedDate = getGameDate(game);
    const dailyDate = extractedDate;
    const resolvedDate = dailyDate;
    console.log('[UPSERT]', {
      gameId,
      operatorUid,
      dailyDate,
      subfolderDay: game.subfolderDay,
      folderPath: game.folderPath,
      extractedDate,
      operatorFolder: game.operatorFolder,
      operatorName: game.operatorName,
      round: game.round,
    });
    if (!operatorUid || !resolvedDate) {
      if (!resolvedDate) {
        const error = new Error(`Cannot index saved game ${gameId || '(no id)'}: no valid date found.`);
        console.error('[UPSERT_ABORT_NO_DATE]', {
          gameId,
          dailyDate,
          subfolderDay: game.subfolderDay,
          folderPath: game.folderPath,
          error,
        });
        throw error;
      }
      return;
    }
    try {
      await refreshGameDay(operatorUid, resolvedDate, game);
    } catch (error) {
      console.error('[UPSERT_ERROR]', error);
      throw error;
    }
  },

  async reconcileDeletedGames(games: GameSequenceItem[]): Promise<void> {
    const days = new Map<string, { operatorUid: string; dailyDate: string; game: GameSequenceItem }>();
    games.forEach((game) => {
      const operatorUid = game.operatorUid || 'anon';
      const dailyDate = getGameDate(game);
      if (!dailyDate) return;
      days.set(`${operatorUid}:${dailyDate}`, { operatorUid, dailyDate, game });
    });
    await Promise.all(Array.from(days.values(), ({ operatorUid, dailyDate, game }) =>
      refreshGameDay(operatorUid, dailyDate, game)
    ));
  },

  async reconcileDay(operatorUid: string, dailyDate: string, game?: GameSequenceItem): Promise<void> {
    return refreshGameDay(operatorUid, dailyDate, game);
  },

  getGameDayDocumentId,
};
