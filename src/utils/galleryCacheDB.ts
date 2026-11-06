import type { GameSequenceItem } from '../types';
import type { GalleryDate } from './galleryService';

export interface GalleryDatesCacheRecord {
  operatorUid: string;
  operatorFolder?: string;
  operatorName?: string;
  dates: GalleryDate[];
  lastLoaded: number;
  fullyScanned: boolean;
}

export interface GalleryGamesCacheRecord {
  key: string;
  operatorUid: string;
  operatorFolder?: string;
  operatorName?: string;
  dateKey: string;
  games: GameSequenceItem[];
  hasMore: boolean;
  fullyLoaded: boolean;
  lastLoaded: number;
}

const DATABASE_NAME = 'bingo_gallery_cache';
const DATABASE_VERSION = 1;
const DATES_STORE = 'dates';
const GAMES_STORE = 'games';

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available'));
  }
  if (databasePromise) return databasePromise;

  const openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DATES_STORE)) {
        database.createObjectStore(DATES_STORE, { keyPath: 'operatorUid' });
      }
      if (!database.objectStoreNames.contains(GAMES_STORE)) {
        const gamesStore = database.createObjectStore(GAMES_STORE, { keyPath: 'key' });
        gamesStore.createIndex('operatorUid', 'operatorUid', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open gallery cache database'));
    request.onblocked = () => reject(new Error('Opening gallery cache database was blocked'));
  });
  databasePromise = openingPromise.catch((error) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

function readRecord<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openDatabase().then((database) => new Promise<T | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error || new Error(`Could not read ${storeName} cache`));
    transaction.onabort = () => reject(transaction.error || new Error(`Could not read ${storeName} cache`));
  }));
}

function readAllRecords<T>(storeName: string): Promise<T[]> {
  return openDatabase().then((database) => new Promise<T[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error || new Error(`Could not read ${storeName} cache`));
    transaction.onabort = () => reject(transaction.error || new Error(`Could not read ${storeName} cache`));
  }));
}

function findGameRecordById(gameId: string): Promise<GalleryGamesCacheRecord | undefined> {
  return openDatabase().then((database) => new Promise<GalleryGamesCacheRecord | undefined>((resolve, reject) => {
    const transaction = database.transaction(GAMES_STORE, 'readonly');
    const request = transaction.objectStore(GAMES_STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(undefined);
        return;
      }
      const record = cursor.value as GalleryGamesCacheRecord;
      if (record.games.some((game) => game.id === gameId)) {
        resolve(record);
        return;
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error('Could not search gallery games cache'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not search gallery games cache'));
  }));
}

function writeRecord(storeName: string, record: GalleryDatesCacheRecord | GalleryGamesCacheRecord): Promise<void> {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error(`Could not write ${storeName} cache`));
    transaction.onabort = () => reject(transaction.error || new Error(`Could not write ${storeName} cache`));
  }));
}

function deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error(`Could not delete ${storeName} cache`));
    transaction.onabort = () => reject(transaction.error || new Error(`Could not delete ${storeName} cache`));
  }));
}

function clearStore(storeName: string): Promise<void> {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error(`Could not clear ${storeName} cache`));
    transaction.onabort = () => reject(transaction.error || new Error(`Could not clear ${storeName} cache`));
  }));
}

function deleteGamesForOperator(operatorUid: string): Promise<void> {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(GAMES_STORE, 'readwrite');
    const store = transaction.objectStore(GAMES_STORE);
    const index = store.index('operatorUid');
    const request = index.openKeyCursor(IDBKeyRange.only(operatorUid));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not delete operator games cache'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not delete operator games cache'));
  }));
}

function deleteGamesForOperatorDate(operatorUid: string, dateKey: string): Promise<void> {
  return openDatabase().then((database) => new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(GAMES_STORE, 'readwrite');
    const store = transaction.objectStore(GAMES_STORE);
    const request = store.index('operatorUid').openCursor(IDBKeyRange.only(operatorUid));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const record = cursor.value as GalleryGamesCacheRecord;
      if (record.dateKey === dateKey) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not delete operator date games cache'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not delete operator date games cache'));
  }));
}

export const galleryCacheDB = {
  getDates: (operatorUid: string) => readRecord<GalleryDatesCacheRecord>(DATES_STORE, operatorUid),
  getAllDates: () => readAllRecords<GalleryDatesCacheRecord>(DATES_STORE),
  putDates: (record: GalleryDatesCacheRecord) => writeRecord(DATES_STORE, record),
  deleteDates: (operatorUid: string) => deleteRecord(DATES_STORE, operatorUid),
  getGames: (key: string) => readRecord<GalleryGamesCacheRecord>(GAMES_STORE, key),
  findGameById: findGameRecordById,
  putGames: (record: GalleryGamesCacheRecord) => writeRecord(GAMES_STORE, record),
  deleteGames: (key: string) => deleteRecord(GAMES_STORE, key),
  deleteGamesForOperator,
  deleteGamesForOperatorDate,
  clearGames: () => clearStore(GAMES_STORE),
  clear: async () => {
    await Promise.all([clearStore(DATES_STORE), clearStore(GAMES_STORE)]);
  },
};
