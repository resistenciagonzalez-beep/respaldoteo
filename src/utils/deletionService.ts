import type { GameSequenceItem } from '../types';
import { collection, deleteDoc, doc, getDocs, limit, query, startAfter, where } from 'firebase/firestore';
import type { QueryConstraint } from 'firebase/firestore';
import { db } from '../firebase';

type DeletionState = {
  deletedGameIdsSet: Set<string>;
  clearedSequenceBarIdsSet: Set<string>;
  syncQueueMap: { delete(gameId: string): boolean };
  firestoreGamesMemoryStore: Map<string, GameSequenceItem>;
  cachedSortedGames: GameSequenceItem[];
  savedGamesSubscribers: Set<(games: GameSequenceItem[]) => void>;
};

type DeletionServiceDependencies = {
  state: DeletionState;
  isCurrentSessionAdmin: () => boolean;
  getSavedGamesGallery: () => GameSequenceItem[];
  persistDeletedGameIds: () => void;
  persistClearedSequenceBarIds: () => void;
  getCurrentLocalDateKey: () => string;
  getGameNormalizedDateKey: (game: GameSequenceItem) => string;
  sanitizeOperatorFolderName: (name?: string) => string;
  sortGamesChronologicallyDesc: (games: GameSequenceItem[]) => GameSequenceItem[];
  updateSyncStatus: () => void;
  syncTemporaryLocalCache: (games: GameSequenceItem[]) => void;
  getAllGamesFromIndexedDB: () => Promise<GameSequenceItem[]>;
  removeQueueTaskFromIndexedDB: (gameId: string) => Promise<void>;
  deleteGameFromIndexedDB: (gameId: string) => Promise<void>;
  safeGetItem: (key: string) => string | null;
  safeSetItem: (key: string, value: string) => void;
  safeRemoveItem: (key: string) => void;
  getKeysByPrefix: (prefixes: string[]) => string[];
  sequence75StorageKey: string;
  sequence90StorageKey: string;
};

export function createDeletionService(dependencies: DeletionServiceDependencies) {
  const { state } = dependencies;

  async function getSavedGamesInPages(querySpecs: QueryConstraint[][] = [[]]): Promise<Array<{ id: string; game: GameSequenceItem }>> {
    const records = new Map<string, GameSequenceItem>();
    for (const spec of querySpecs) {
      let cursor: any = null;
      while (true) {
        const pageQuery = query(
          collection(db, 'saved_games'),
          ...spec,
          ...(cursor ? [startAfter(cursor)] : []),
          limit(8)
        );
        const page = await getDocs(pageQuery);
        page.docs.forEach((snapshot) => records.set(snapshot.id, snapshot.data() as GameSequenceItem));
        if (page.size < 8) break;
        cursor = page.docs[page.docs.length - 1];
      }
    }
    return Array.from(records, ([id, game]) => ({ id, game }));
  }

  function purgeDeletedGamesFromLocalSequenceBars(
    idsToDelete: Set<string>,
    deletedItems: GameSequenceItem[]
  ): void {
    if (typeof window === 'undefined') return;
    try {
      const keysToClean = dependencies.getKeysByPrefix([
        dependencies.sequence75StorageKey,
        dependencies.sequence90StorageKey,
      ]);

      for (const key of keysToClean) {
        const raw = dependencies.safeGetItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) continue;

        const filtered = parsed.filter((seqItem: GameSequenceItem) => {
          if (!seqItem) return false;
          if (seqItem.id && idsToDelete.has(seqItem.id)) return false;
          const matchDeleted = deletedItems.some(
            (del) =>
              del.round === seqItem.round &&
              dependencies.getGameNormalizedDateKey(del) === dependencies.getGameNormalizedDateKey(seqItem) &&
              (del.timestamp === seqItem.timestamp || del.ballNumber === seqItem.ballNumber)
          );
          return !matchDeleted;
        });

        if (filtered.length !== parsed.length) {
          dependencies.safeSetItem(key, JSON.stringify(filtered));
        }
      }
    } catch {
      // ignore
    }
  }

  async function executeBatchGameDeletion(
    idsToDelete: Set<string>,
    matchingItems: GameSequenceItem[] = []
  ): Promise<number> {
    if (!dependencies.isCurrentSessionAdmin()) {
      console.warn('[RBAC] Acción denegada: solo los administradores pueden borrar partidas o carpetas.');
      return 0;
    }

    if (idsToDelete.size === 0) return 0;

    // 1. Register tombstones immediately so onSnapshot / auto-heal can NEVER resurrect these games
    for (const docId of idsToDelete) {
      state.deletedGameIdsSet.add(docId);
      state.syncQueueMap.delete(docId);
      state.firestoreGamesMemoryStore.delete(docId);
    }
    dependencies.persistDeletedGameIds();

    // 2. Purge from local sequence bars and notify all UI subscribers in 0ms
    purgeDeletedGamesFromLocalSequenceBars(idsToDelete, matchingItems);

    dependencies.updateSyncStatus();
    const remaining = dependencies.sortGamesChronologicallyDesc(
      Array.from(state.firestoreGamesMemoryStore.values())
    );
    state.cachedSortedGames = remaining;
    dependencies.syncTemporaryLocalCache(remaining);

    state.savedGamesSubscribers.forEach((sub) => {
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
        await dependencies.removeQueueTaskFromIndexedDB(docId);
        await dependencies.deleteGameFromIndexedDB(docId);
        try {
          await deleteDoc(doc(db, 'saved_games', docId));
        } catch (err) {
          console.warn(`Firestore delete warning for ${docId} (tombstoned locally):`, err);
        }
      })
    );

    return idsToDelete.size;
  }

  async function deleteGamePermanently(
    idOrItem: string | GameSequenceItem
  ): Promise<boolean> {
    if (!idOrItem || !dependencies.isCurrentSessionAdmin()) return false;

    const targetId = typeof idOrItem === 'string' ? idOrItem : idOrItem.id;
    const targetRound = typeof idOrItem === 'object' ? idOrItem.round : undefined;
    const targetTimestamp = typeof idOrItem === 'object' ? idOrItem.timestamp : undefined;
    const targetDate = typeof idOrItem === 'object'
      ? dependencies.getGameNormalizedDateKey(idOrItem)
      : undefined;
    const targetOp =
      typeof idOrItem === 'object'
        ? dependencies.sanitizeOperatorFolderName(idOrItem.operatorFolder || idOrItem.operatorName)
        : undefined;

    try {
      const current = dependencies.getSavedGamesGallery();
      const localIdbGames = await dependencies.getAllGamesFromIndexedDB();
      const combined = [...current, ...localIdbGames];

      const matchingItems = combined.filter((g) => {
        if (!g) return false;
        if (targetId && g.id === targetId) return true;
        if (
          targetRound !== undefined &&
          targetDate &&
          targetOp &&
          g.round === targetRound &&
          dependencies.getGameNormalizedDateKey(g) === targetDate &&
          dependencies.sanitizeOperatorFolderName(g.operatorFolder || g.operatorName) === targetOp
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

  async function clearRightSequenceBarToday(
    gamesToClear: GameSequenceItem[] = [],
    modeFilter?: '75' | '90'
  ): Promise<void> {
    const todayKey = dependencies.getCurrentLocalDateKey();
    const idsToClear = new Set<string>();
    const itemsToClear: GameSequenceItem[] = [];

    for (const g of gamesToClear) {
      if (g && g.id) {
        idsToClear.add(g.id);
        itemsToClear.push(g);
      }
    }

    for (const [docId, g] of state.firestoreGamesMemoryStore.entries()) {
      if (!g) continue;
      const is90 = g.mode === '90' || g.sheetType === 'traditional-90';
      const matchesMode =
        !modeFilter || (modeFilter === '90' ? is90 : !is90);
      if (matchesMode && dependencies.getGameNormalizedDateKey(g) === todayKey) {
        idsToClear.add(docId);
        if (g.id) idsToClear.add(g.id);
        itemsToClear.push(g);
      }
    }

    for (const id of idsToClear) {
      state.clearedSequenceBarIdsSet.add(id);
    }
    dependencies.persistClearedSequenceBarIds();
    purgeDeletedGamesFromLocalSequenceBars(idsToClear, itemsToClear);

    if (typeof window !== 'undefined') {
      try {
        const keysToRemove = dependencies.getKeysByPrefix([
          dependencies.sequence75StorageKey,
          dependencies.sequence90StorageKey,
          'bingo_sheet_custom_sequence',
        ]);
        for (const k of keysToRemove) {
          dependencies.safeRemoveItem(k);
        }
      } catch {
        // ignore
      }
    }

    if (dependencies.isCurrentSessionAdmin() && idsToClear.size > 0) {
      await executeBatchGameDeletion(idsToClear, itemsToClear);
    } else {
      const allGames = dependencies.sortGamesChronologicallyDesc(
        Array.from(state.firestoreGamesMemoryStore.values())
      );
      state.cachedSortedGames = allGames;
      state.savedGamesSubscribers.forEach((sub) => {
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
  }

  async function deleteGamesOfDay(
    operatorName: string,
    dateKey: string
  ): Promise<number> {
    if (!dependencies.isCurrentSessionAdmin()) return 0;

    try {
      const safeOp = dependencies.sanitizeOperatorFolderName(operatorName);
      const opTrimmed = operatorName.trim().toLowerCase();
      const idsToDelete = new Set<string>();
      const matchingItems: GameSequenceItem[] = [];

      const checkAndCollect = (docId: string | undefined, g: GameSequenceItem) => {
        if (!g) return;
        const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
        const gFolder = dependencies.sanitizeOperatorFolderName(g.operatorFolder || gOp);
        const gDate = dependencies.getGameNormalizedDateKey(g);
        const matchesOp =
          !operatorName ||
          operatorName === 'all' ||
          gOp === opTrimmed ||
          gFolder === safeOp;
        const matchesDate =
          gDate === dateKey || g.dailyDate === dateKey || g.subfolderDay === dateKey;

        if (matchesOp && matchesDate) {
          const resolvedId = docId || g.id;
          if (resolvedId) idsToDelete.add(resolvedId);
          matchingItems.push(g);
        }
      };

      for (const [docId, g] of state.firestoreGamesMemoryStore.entries()) {
        checkAndCollect(docId, g);
      }

      const localIdbGames = await dependencies.getAllGamesFromIndexedDB();
      for (const g of localIdbGames) {
        checkAndCollect(g.id, g);
      }

      try {
        const remoteGames = await getSavedGamesInPages([
          [where('dailyDate', '==', dateKey)],
          [where('subfolderDay', '==', dateKey)],
          ...(operatorName && operatorName !== 'all'
            ? [[where('folderPath', '==', `${safeOp}/${dateKey}`)] as QueryConstraint[]]
            : []),
        ]);
        remoteGames.forEach(({ id, game }) => checkAndCollect(id, game));
      } catch {
        // Offline fallback: already collected from memory and IndexedDB
      }

      return await executeBatchGameDeletion(idsToDelete, matchingItems);
    } catch (e) {
      console.error('Error deleting games of day:', e);
      return 0;
    }
  }

  async function deleteGamesOfOperatorFolder(operatorName: string): Promise<number> {
    if (!dependencies.isCurrentSessionAdmin()) return 0;

    try {
      const safeOp = dependencies.sanitizeOperatorFolderName(operatorName);
      const opTrimmed = operatorName.trim().toLowerCase();
      const idsToDelete = new Set<string>();
      const matchingItems: GameSequenceItem[] = [];

      const checkAndCollect = (docId: string | undefined, g: GameSequenceItem) => {
        if (!g) return;
        const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
        const gFolder = dependencies.sanitizeOperatorFolderName(g.operatorFolder || gOp);
        if (gOp === opTrimmed || gFolder === safeOp) {
          const resolvedId = docId || g.id;
          if (resolvedId) idsToDelete.add(resolvedId);
          matchingItems.push(g);
        }
      };

      for (const [docId, g] of state.firestoreGamesMemoryStore.entries()) {
        checkAndCollect(docId, g);
      }

      const localIdbGames = await dependencies.getAllGamesFromIndexedDB();
      for (const g of localIdbGames) {
        checkAndCollect(g.id, g);
      }

      try {
        const remoteGames = await getSavedGamesInPages([
          [where('operatorFolder', '==', safeOp)],
          [where('operatorName', '==', operatorName)],
        ]);
        remoteGames.forEach(({ id, game }) => checkAndCollect(id, game));
      } catch {
        // ignore if offline
      }

      return await executeBatchGameDeletion(idsToDelete, matchingItems);
    } catch (e) {
      console.error('Error deleting operator folder games:', e);
      return 0;
    }
  }

  async function clearAllSavedGamesGallery(
    filterMode?: 'all' | '75' | '90'
  ): Promise<void> {
    if (!dependencies.isCurrentSessionAdmin()) return;

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

      for (const [docId, g] of state.firestoreGamesMemoryStore.entries()) {
        checkAndCollect(docId, g);
      }

      const localIdbGames = await dependencies.getAllGamesFromIndexedDB();
      for (const g of localIdbGames) {
        checkAndCollect(g.id, g);
      }

      try {
        const remoteGames = await getSavedGamesInPages();
        remoteGames.forEach(({ id, game }) => checkAndCollect(id, game));
      } catch {
        // ignore if offline
      }

      await executeBatchGameDeletion(idsToDelete, matchingItems);
    } catch (e) {
      console.error('Error clearing saved games:', e);
    }
  }

  return {
    deleteGamePermanently,
    clearRightSequenceBarToday,
    deleteGamesOfDay,
    deleteGamesOfOperatorFolder,
    clearAllSavedGamesGallery,
  };
}
