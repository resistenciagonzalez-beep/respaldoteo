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

/** Reads saved game history directly from Firestore, independently of gallery state and caches. */
export async function getSavedGamesHistoryForMismos(user?: AppUser | null): Promise<GameSequenceItem[]> {
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

  const gamesById = new Map<string, GameSequenceItem>();
  for (const spec of querySpecs) {
    let cursor: QueryDocumentSnapshot | null = null;
    while (true) {
      const constraints: QueryConstraint[] = [...spec, orderBy(documentId()), limit(HISTORY_PAGE_SIZE)];
      if (cursor) constraints.push(startAfter(cursor));
      const page = await getDocs(query(collection(db, 'saved_games'), ...constraints));
      page.docs.forEach((snapshot) => {
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

  return sortGamesChronologicallyDesc(Array.from(gamesById.values()));
}
