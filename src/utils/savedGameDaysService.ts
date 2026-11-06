import type { GameSequenceItem } from '../types';
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface SavedGameDay {
  operatorUid: string;
  dailyDate: string;
  operatorFolder: string;
  operatorName: string;
  folderPath: string;
  gamesCount: number;
  lastRound: number;
  updatedAt?: unknown;
}

const GAME_DAYS_COLLECTION = 'saved_game_days';

function getGameDate(game: GameSequenceItem): string {
  return game.dailyDate || game.subfolderDay || game.folderPath?.split('/').pop() || '';
}

function getGameDayDocumentId(operatorUid: string, dailyDate: string): string {
  return `${encodeURIComponent(operatorUid)}__${dailyDate}`;
}

function getMigrationDocumentId(operatorUid: string): string {
  return `__migration__${encodeURIComponent(operatorUid)}`;
}

function getGameDayReference(operatorUid: string, dailyDate: string) {
  return doc(db, GAME_DAYS_COLLECTION, getGameDayDocumentId(operatorUid, dailyDate));
}

async function getCurrentGameDayCount(operatorUid: string, dailyDate: string): Promise<number> {
  const gameQuery = query(
    collection(db, 'saved_games'),
    where('operatorUid', '==', operatorUid),
    where('dailyDate', '==', dailyDate)
  );
  const countSnapshot = await getCountFromServer(gameQuery);
  return countSnapshot.data().count;
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
  const [gamesCount, lastRound] = await Promise.all([
    getCurrentGameDayCount(operatorUid, dailyDate),
    getLastRound(operatorUid, dailyDate),
  ]);
  const dayReference = getGameDayReference(operatorUid, dailyDate);

  if (gamesCount <= 0) {
    await deleteDoc(dayReference).catch(() => {});
    return;
  }

  const previousSnapshot = await getDoc(dayReference).catch(() => undefined);
  const previous = previousSnapshot?.exists() ? previousSnapshot.data() : {};
  const operatorFolder = game?.operatorFolder || previous.operatorFolder || '';
  const operatorName = game?.operatorName || previous.operatorName || operatorFolder;
  await setDoc(dayReference, {
    operatorUid,
    dailyDate,
    operatorFolder,
    operatorName,
    folderPath: game?.folderPath || previous.folderPath || `${operatorFolder}/${dailyDate}`,
    gamesCount,
    lastRound,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export const savedGameDaysService = {
  async getDays(operatorUid: string): Promise<SavedGameDay[]> {
    const daysQuery = query(
      collection(db, GAME_DAYS_COLLECTION),
      where('operatorUid', '==', operatorUid),
      orderBy('dailyDate', 'desc')
    );
    const snapshot = await getDocs(daysQuery);
    return snapshot.docs.map((daySnapshot) => daySnapshot.data() as SavedGameDay);
  },

  async isOperatorMigrated(operatorUid: string): Promise<boolean> {
    const markerSnapshot = await getDoc(doc(db, GAME_DAYS_COLLECTION, getMigrationDocumentId(operatorUid)));
    return markerSnapshot.exists() && markerSnapshot.data().migrationCompleted === true;
  },

  async createMissingDays(days: SavedGameDay[]): Promise<void> {
    for (const day of days) {
      const dayReference = getGameDayReference(day.operatorUid, day.dailyDate);
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(dayReference);
        if (existing.exists()) return;
        transaction.set(dayReference, {
          ...day,
          updatedAt: serverTimestamp(),
        });
      });
    }
  },

  async completeMigrationDays(days: SavedGameDay[]): Promise<void> {
    for (const day of days) {
      const dayReference = getGameDayReference(day.operatorUid, day.dailyDate);
      await runTransaction(db, async (transaction) => {
        const existing = await transaction.get(dayReference);
        const existingData = existing.exists() ? existing.data() : {};
        transaction.set(dayReference, {
          ...day,
          gamesCount: Math.max(day.gamesCount, Number(existingData.gamesCount) || 0),
          lastRound: Math.max(day.lastRound, Number(existingData.lastRound) || 0),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
    }
  },

  async markOperatorMigrated(operatorUid: string): Promise<void> {
    await setDoc(doc(db, GAME_DAYS_COLLECTION, getMigrationDocumentId(operatorUid)), {
      operatorUid,
      migrationCompleted: true,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },

  async upsertSavedGame(game: GameSequenceItem): Promise<void> {
    const operatorUid = game.operatorUid || 'anon';
    const dailyDate = getGameDate(game);
    if (!operatorUid || !dailyDate) return;
    await refreshGameDay(operatorUid, dailyDate, game);
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
