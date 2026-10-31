import { OperatorShift, GameSequenceItem } from '../types';
import { doc, setDoc, serverTimestamp, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { safeSetItem, safeGetItem } from './safeStorage';

export const STORAGE_KEY_OPERATOR_SHIFTS = 'bingo_operator_shifts_v1';

const firestoreShiftsMemoryStore = new Map<string, OperatorShift>();
let hasSyncedShiftsWithFirestore = false;
let shiftsUnsubscribe: (() => void) | null = null;

function ensureShiftsSubscription(): void {
  if (typeof window === 'undefined' || shiftsUnsubscribe) return;
  try {
    shiftsUnsubscribe = onSnapshot(
      collection(db, 'operator_shifts'),
      (snapshot) => {
        firestoreShiftsMemoryStore.clear();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as OperatorShift;
          const id = data.id || docSnap.id;
          firestoreShiftsMemoryStore.set(id, { ...data, id });
        });
        hasSyncedShiftsWithFirestore = true;
        saveShiftsToLocalCache(Array.from(firestoreShiftsMemoryStore.values()));
      },
      (err) => {
        console.warn('Firestore operator_shifts subscription notice:', err);
      }
    );
  } catch (err) {
    console.warn('Could not initialize operator_shifts listener:', err);
  }
}

function getCanonicalOpKey(operatorUid?: string, operatorName?: string): string {
  if (operatorUid && operatorUid !== 'anon') return operatorUid;
  if (operatorName && operatorName.trim()) return operatorName.trim().toLowerCase().replace(/\s+/g, '_');
  return 'operadora_principal';
}

/**
 * Get all stored shifts from Firestore-backed memory store (with IndexedDB cache fallback on boot)
 */
export function getAllShifts(): OperatorShift[] {
  ensureShiftsSubscription();
  if (hasSyncedShiftsWithFirestore || firestoreShiftsMemoryStore.size > 0) {
    return Array.from(firestoreShiftsMemoryStore.values());
  }

  if (typeof window === 'undefined') return [];
  try {
    const raw = safeGetItem(STORAGE_KEY_OPERATOR_SHIFTS);
    if (raw) {
      const parsed: OperatorShift[] = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error reading operator shifts cache', e);
  }
  return [];
}

/**
 * Save shifts list to IndexedDB-backed cache (never localStorage)
 */
function saveShiftsToLocalCache(shifts: OperatorShift[]): void {
  if (typeof window === 'undefined') return;
  safeSetItem(STORAGE_KEY_OPERATOR_SHIFTS, JSON.stringify(shifts.slice(0, 50)));
}

/**
 * Get the current active shift for an operator, or creates one if it doesn't exist yet
 */
export function getActiveShift(
  operatorUid: string = 'anon',
  operatorName: string = 'Operadora Principal',
  operatorEmail: string = ''
): OperatorShift {
  const all = getAllShifts();
  const canonical = getCanonicalOpKey(operatorUid, operatorName);

  const existing = all.find(
    (s) =>
      s.status === 'active' &&
      (getCanonicalOpKey(s.operatorUid, s.operatorName) === canonical ||
        s.operatorName.trim().toLowerCase() === operatorName.trim().toLowerCase())
  );

  if (existing) {
    return existing;
  }

  const now = new Date();
  const newShift: OperatorShift = {
    id: `shift_${Date.now()}_${canonical}`,
    operatorUid: operatorUid || 'anon',
    operatorName: (operatorName || 'Operadora Principal').trim(),
    operatorEmail: operatorEmail || '',
    startDate: now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    startTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestampISO: now.toISOString(),
    totalGames: 0,
    totalLines: 0,
    totalCollected: 0,
    totalPrizes: 0,
    netProfit: 0,
    status: 'active',
    gameIds: [],
  };

  firestoreShiftsMemoryStore.set(newShift.id, newShift);
  const updated = [newShift, ...all];
  saveShiftsToLocalCache(updated);

  try {
    setDoc(doc(db, 'operator_shifts', newShift.id), {
      ...newShift,
      createdAt: serverTimestamp(),
    }).catch((err) => console.warn('Could not sync new shift to Firestore:', err));
  } catch (err) {
    console.warn('Error scheduling shift Firestore write:', err);
  }

  return newShift;
}

/**
 * Get current operator active shift lines count
 */
export function getOperatorActiveLines(
  operatorUid: string = 'anon',
  operatorName: string = 'Operadora Principal'
): number {
  const active = getActiveShift(operatorUid, operatorName);
  return active.totalLines || 0;
}

/**
 * Reset active shift lines counter (upon operator's explicit request)
 */
export function resetOperatorActiveLines(
  operatorUid: string = 'anon',
  operatorName: string = 'Operadora Principal'
): void {
  const all = getAllShifts();
  const canonical = getCanonicalOpKey(operatorUid, operatorName);

  const updated = all.map((s) => {
    if (
      s.status === 'active' &&
      (getCanonicalOpKey(s.operatorUid, s.operatorName) === canonical ||
        s.operatorName.trim().toLowerCase() === operatorName.trim().toLowerCase())
    ) {
      const resetShift: OperatorShift = {
        ...s,
        totalLines: 0,
      };
      firestoreShiftsMemoryStore.set(s.id, resetShift);
      try {
        setDoc(doc(db, 'operator_shifts', s.id), resetShift).catch((err) =>
          console.warn('Error syncing reset shift to Firestore:', err)
        );
      } catch (err) {
        console.warn('Error invoking setDoc for reset shift:', err);
      }
      return resetShift;
    }
    return s;
  });

  saveShiftsToLocalCache(updated);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('bingo_operator_shift_updated', {
        detail: { operatorName, totalLines: 0 },
      })
    );
  }
}

/**
 * Record a played match to the active shift and optionally close the shift ("Terminar Turno")
 */
export async function recordGameToActiveShift(
  game: GameSequenceItem,
  endTurno: boolean = false
): Promise<{ shift: OperatorShift; isClosed: boolean }> {
  const operatorUid = game.operatorUid || 'anon';
  const operatorName = (game.operatorName || 'Operadora Principal').trim();
  const operatorEmail = game.operatorEmail || '';
  const matchLines = game.totalLinesPlayed || 0;

  const all = getAllShifts();
  const canonical = getCanonicalOpKey(operatorUid, operatorName);

  let currentActive = all.find(
    (s) =>
      s.status === 'active' &&
      (getCanonicalOpKey(s.operatorUid, s.operatorName) === canonical ||
        s.operatorName.trim().toLowerCase() === operatorName.toLowerCase())
  );

  const now = new Date();
  if (!currentActive) {
    currentActive = {
      id: `shift_${Date.now()}_${canonical}`,
      operatorUid,
      operatorName,
      operatorEmail,
      startDate: game.dateFormatted || now.toLocaleDateString('es-ES'),
      startTime: game.timestamp || now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestampISO: now.toISOString(),
      totalGames: 0,
      totalLines: 0,
      totalCollected: 0,
      totalPrizes: 0,
      netProfit: 0,
      status: 'active',
      gameIds: [],
    };
  }

  const gameId = game.id || `game_${Date.now()}`;
  const updatedGameIds = currentActive.gameIds.includes(gameId)
    ? currentActive.gameIds
    : [...currentActive.gameIds, gameId];

  const updatedShift: OperatorShift = {
    ...currentActive,
    totalGames: currentActive.totalGames + 1,
    totalLines: currentActive.totalLines + matchLines,
    totalCollected: Math.round(((currentActive.totalCollected || 0) + (game.totalCollected || 0)) * 100) / 100,
    totalPrizes: Math.round(((currentActive.totalPrizes || 0) + (game.totalPrizesPaid || 0)) * 100) / 100,
    netProfit: Math.round(
      (((currentActive.totalCollected || 0) + (game.totalCollected || 0)) -
        ((currentActive.totalPrizes || 0) + (game.totalPrizesPaid || 0))) *
        100
    ) / 100,
    gameIds: updatedGameIds,
  };

  let isClosed = false;
  let nextNewShift: OperatorShift | null = null;

  if (endTurno) {
    isClosed = true;
    updatedShift.status = 'completed';
    updatedShift.endDate = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    updatedShift.endTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    updatedShift.closedAtISO = now.toISOString();

    nextNewShift = {
      id: `shift_${Date.now() + 1}_${canonical}`,
      operatorUid,
      operatorName,
      operatorEmail,
      startDate: now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      startTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestampISO: now.toISOString(),
      totalGames: 0,
      totalLines: 0,
      totalCollected: 0,
      totalPrizes: 0,
      netProfit: 0,
      status: 'active',
      gameIds: [],
    };
  }

  firestoreShiftsMemoryStore.set(updatedShift.id, updatedShift);
  if (nextNewShift) {
    firestoreShiftsMemoryStore.set(nextNewShift.id, nextNewShift);
  }

  const filtered = all.filter((s) => s.id !== updatedShift.id);
  const nextList = nextNewShift ? [nextNewShift, updatedShift, ...filtered] : [updatedShift, ...filtered];
  saveShiftsToLocalCache(nextList);

  // Fire-and-forget Firestore shift sync with timeout so it never blocks "Nueva Partida"
  void (async () => {
    try {
      const writeShift = setDoc(doc(db, 'operator_shifts', updatedShift.id), {
        ...updatedShift,
        updatedAt: serverTimestamp(),
      });
      await Promise.race([
        writeShift,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Shift sync timeout')), 5000)),
      ]);
      if (nextNewShift) {
        const writeNextShift = setDoc(doc(db, 'operator_shifts', nextNewShift.id), {
          ...nextNewShift,
          createdAt: serverTimestamp(),
        });
        await Promise.race([
          writeNextShift,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Next shift sync timeout')), 5000)),
        ]);
      }
    } catch (fsErr) {
      console.warn('Could not sync shift to Firestore:', fsErr);
    }
  })();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('bingo_operator_shift_updated', {
        detail: {
          operatorName,
          shift: updatedShift,
          totalLines: nextNewShift ? 0 : updatedShift.totalLines,
          isClosed,
        },
      })
    );
  }

  return { shift: updatedShift, isClosed };
}
