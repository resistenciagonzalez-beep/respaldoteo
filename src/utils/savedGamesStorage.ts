import { GameSequenceItem, SheetViewType, BingoMode, BingoSheetData, Traditional90SheetData, AppUser } from '../types';
import { doc, setDoc, serverTimestamp, deleteDoc, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { safeSetItem, sanitizeItemForStorage, sanitizeSequenceForStorage, cleanupLocalStorageForQuota } from './safeStorage';

export const STORAGE_KEY_SAVED_GAMES_GALLERY = 'bingo_saved_games_gallery';
export const STORAGE_KEY_SEQUENCE_75 = 'bingo_game_sequence_history';
export const STORAGE_KEY_SEQUENCE_90 = 'bingo_90_game_sequence_history';
export const STORAGE_KEY_OPERATOR_FOLDERS_INDEX = 'bingo_operator_folders_index';
export const STORAGE_KEY_OPERATOR_DAY_PREFIX = 'bingo_subfolder_';

/**
 * Detects the operator's current local date formatted as YYYY-MM-DD (e.g. "2026-10-28").
 * Uses local machine calendar time rather than UTC, preventing night-shift date mismatch errors.
 */
export function getCurrentLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Sanitizes an operator name into a normalized, uniform folder name.
 * Example: "Carla García" -> "carla_garcia"
 */
export function sanitizeOperatorFolderName(name?: string): string {
  if (!name || !name.trim()) return 'operadora_principal';
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');
}

/**
 * Generates the scoped localStorage key for an operator's isolated day subfolder.
 * e.g. "bingo_subfolder_carla_garcia_day_2026-10-28"
 */
export function getOperatorDayStorageKey(operatorIdentifier: string, dateKey: string): string {
  const safeOp = sanitizeOperatorFolderName(operatorIdentifier);
  return `${STORAGE_KEY_OPERATOR_DAY_PREFIX}${safeOp}_day_${dateKey}`;
}

/**
 * Scopes a localStorage key to a specific user/operator so their sequence,
 * custom marks and state are 100% individual and never mixed with another user.
 */
export function getOperatorStorageKey(baseKey: string, user?: AppUser | null): string {
  if (!user) return baseKey;
  const id = user.id || user.uid || (user.email ? user.email.replace(/[^a-zA-Z0-9_-]/g, '_') : 'anon');
  return `${baseKey}_${id}`;
}

/**
 * Checks whether a saved game belongs to a specific operator or user session.
 * Used to strictly separate operator sequence, stats, and gallery views.
 */
export function isGameOfOperator(
  game: GameSequenceItem,
  user?: AppUser | null
): boolean {
  if (!user) return true; // Default fallback if no operator profile is signed in
  if (user.role === 'admin') return true; // Administrators see all games from all operators

  const opUid = user.id || user.uid;
  const opEmail = user.email ? user.email.trim().toLowerCase() : '';
  const opName = user.name ? user.name.trim().toLowerCase() : '';

  if (game.operatorUid && opUid && (game.operatorUid === opUid || game.operatorUid === user.id || game.operatorUid === user.uid)) {
    return true;
  }

  if (game.operatorEmail && opEmail && game.operatorEmail.trim().toLowerCase() === opEmail) {
    return true;
  }

  if (game.operatorName && opName && game.operatorName.trim().toLowerCase() === opName) {
    return true;
  }

  // If game has NO operator identification attached, assume it belongs to local machine session
  if (!game.operatorUid && !game.operatorEmail && !game.operatorName) {
    return true;
  }

  return false;
}

/**
 * Accurately extracts a normalized YYYY-MM-DD date key from any GameSequenceItem.
 * Checks subfolderDay, dailyDate, folderPath, savedAtISO, shiftDate, dateFormatted (with Spanish text/slash/dash parsers),
 * Firestore createdAt timestamps, and game id unix timestamps.
 * Prevents games from different dates from ever being mixed into the wrong folder.
 */
export function getGameNormalizedDateKey(game: GameSequenceItem): string {
  if (!game) return getCurrentLocalDateKey();

  // 0. Explicit subfolderDay or dailyDate (format YYYY-MM-DD)
  if (game.subfolderDay && /^\d{4}-\d{2}-\d{2}$/.test(game.subfolderDay.trim())) {
    return game.subfolderDay.trim();
  }
  if (game.dailyDate && /^\d{4}-\d{2}-\d{2}$/.test(game.dailyDate.trim())) {
    return game.dailyDate.trim();
  }

  // 1. folderPath ending in /YYYY-MM-DD
  if (game.folderPath) {
    const parts = game.folderPath.split('/');
    const lastPart = parts[parts.length - 1]?.trim();
    if (lastPart && /^\d{4}-\d{2}-\d{2}$/.test(lastPart)) {
      return lastPart;
    }
  }

  // 2. savedAtISO (format YYYY-MM-DDTHH:mm:ss...)
  if ((game as any).savedAtISO && typeof (game as any).savedAtISO === 'string') {
    const isoDate = (game as any).savedAtISO.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      return isoDate;
    }
  }

  // 3. shiftDate
  if (game.shiftDate) {
    const trimmed = game.shiftDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const slashParts = trimmed.split('/');
    if (slashParts.length === 3) {
      const p0 = slashParts[0].padStart(2, '0');
      const p1 = slashParts[1].padStart(2, '0');
      const p2 = slashParts[2];
      if (p2.length === 4) {
        return `${p2}-${p1}-${p0}`;
      }
    }
  }

  // 4. dateFormatted (DD/MM/YYYY, YYYY-MM-DD, or DD mes YYYY)
  if (game.dateFormatted) {
    const trimmed = game.dateFormatted.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const slashParts = trimmed.split('/');
    if (slashParts.length === 3) {
      const p0 = slashParts[0].padStart(2, '0');
      const p1 = slashParts[1].padStart(2, '0');
      const p2 = slashParts[2];
      if (p2.length === 4) {
        return `${p2}-${p1}-${p0}`;
      }
    }
    const dashParts = trimmed.split('-');
    if (dashParts.length === 3) {
      if (dashParts[0].length === 4) {
        return `${dashParts[0]}-${dashParts[1].padStart(2, '0')}-${dashParts[2].padStart(2, '0')}`;
      } else if (dashParts[2].length === 4) {
        return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
      }
    }
    // Spanish textual date e.g. "28 oct 2026", "28 de octubre de 2026"
    const months: Record<string, string> = {
      ene: '01', enero: '01',
      feb: '02', febrero: '02',
      mar: '03', marzo: '03',
      abr: '04', abril: '04',
      may: '05', mayo: '05',
      jun: '06', junio: '06',
      jul: '07', julio: '07',
      ago: '08', agosto: '08',
      sep: '09', set: '09', septiembre: '09',
      oct: '10', octubre: '10',
      nov: '11', noviembre: '11',
      dic: '12', diciembre: '12',
    };
    const words = trimmed.toLowerCase().replace(/de/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length >= 3) {
      const day = words[0].padStart(2, '0');
      const monthStr = words[1].slice(0, 3);
      const year = words[words.length - 1];
      if (months[monthStr] && /^\d{4}$/.test(year) && /^\d{1,2}$/.test(day)) {
        return `${year}-${months[monthStr]}-${day}`;
      }
    }
  }

  // 5. Firestore createdAt
  if (game.createdAt) {
    try {
      if (typeof (game.createdAt as any).toDate === 'function') {
        return (game.createdAt as any).toDate().toISOString().split('T')[0];
      }
      if (typeof (game.createdAt as any).seconds === 'number') {
        return new Date((game.createdAt as any).seconds * 1000).toISOString().split('T')[0];
      }
      if (typeof game.createdAt === 'string') {
        const d = new Date(game.createdAt);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }
    } catch {}
  }

  // 6. Check game.id timestamp (e.g. game_1730133550000_1)
  if (game.id && typeof game.id === 'string') {
    const match = game.id.match(/^game_(\d{10,13})/);
    if (match) {
      const ts = Number(match[1]);
      if (!isNaN(ts) && ts > 1600000000) {
        const timestampMs = ts < 10000000000 ? ts * 1000 : ts;
        const d = new Date(timestampMs);
        if (!isNaN(d.getTime())) {
          return d.toISOString().split('T')[0];
        }
      }
    }
  }

  return getCurrentLocalDateKey();
}

/**
 * Updates the operator folder manifest index with new dates (YYYY-MM-DD subfolders).
 */
export function updateOperatorFolderManifest(
  operatorFolder: string,
  operatorName: string,
  dateKey: string,
  operatorUid?: string
): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OPERATOR_FOLDERS_INDEX);
    const manifest: Record<
      string,
      {
        operatorName: string;
        operatorFolder: string;
        operatorUid?: string;
        subfolders: string[];
        lastUpdatedISO: string;
      }
    > = raw ? JSON.parse(raw) : {};

    if (!manifest[operatorFolder]) {
      manifest[operatorFolder] = {
        operatorName: operatorName || 'Operadora Principal',
        operatorFolder,
        operatorUid: operatorUid || 'anon',
        subfolders: [],
        lastUpdatedISO: new Date().toISOString(),
      };
    }

    if (!manifest[operatorFolder].subfolders.includes(dateKey)) {
      manifest[operatorFolder].subfolders.push(dateKey);
      manifest[operatorFolder].subfolders.sort((a, b) => b.localeCompare(a));
    }
    manifest[operatorFolder].lastUpdatedISO = new Date().toISOString();

    safeSetItem(STORAGE_KEY_OPERATOR_FOLDERS_INDEX, JSON.stringify(manifest));
  } catch (err) {
    console.error('Error updating operator folders manifest', err);
  }
}

/**
 * Saves and organizes a game directly inside its dedicated operator/date subfolder (YYYY-MM-DD).
 * Guarantees that data and line counts of each day remain completely isolated and never mixed.
 */
export function recordGameToIsolatedDayFolder(game: GameSequenceItem): void {
  if (typeof window === 'undefined' || !game) return;
  const safeOp = game.operatorFolder || sanitizeOperatorFolderName(game.operatorName);
  const dateKey = game.subfolderDay || game.dailyDate || getCurrentLocalDateKey();
  const dayKey = getOperatorDayStorageKey(safeOp, dateKey);

  try {
    const raw = localStorage.getItem(dayKey);
    let items: GameSequenceItem[] = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) items = [];

    // Strictly ensure only games belonging to this exact dateKey are maintained in this subfolder
    items = items.filter((g) => g && getGameNormalizedDateKey(g) === dateKey);

    const existingIdx = items.findIndex(
      (g) =>
        (g.id && g.id === game.id) ||
        (g.round === game.round && (g.mode === game.mode || g.sheetType === game.sheetType))
    );

    const cleanGame = sanitizeItemForStorage(game);
    if (existingIdx >= 0) {
      items[existingIdx] = { ...items[existingIdx], ...cleanGame };
    } else {
      items.unshift(cleanGame);
    }

    // Sort descending by round
    items.sort((a, b) => (b.round || 0) - (a.round || 0));

    safeSetItem(dayKey, JSON.stringify(items));
    updateOperatorFolderManifest(
      safeOp,
      (game.operatorName || 'Operadora Principal').trim(),
      dateKey,
      game.operatorUid
    );
  } catch (err) {
    console.error('Error recording game to isolated day subfolder', err);
  }
}

/**
 * Strictly retrieves the isolated games for a given operator and date subfolder (YYYY-MM-DD).
 * Ensures zero leakage of games or lines from other dates or operators.
 */
export function getGamesByOperatorAndDay(operatorIdentifier: string, dateKey: string): GameSequenceItem[] {
  if (typeof window === 'undefined') return [];
  const safeOp = sanitizeOperatorFolderName(operatorIdentifier);
  const dayKey = getOperatorDayStorageKey(safeOp, dateKey);

  try {
    const raw = localStorage.getItem(dayKey);
    if (raw) {
      const parsed: GameSequenceItem[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((g) => g && getGameNormalizedDateKey(g) === dateKey);
      }
    }
  } catch {}

  // Fallback to filtering gallery
  const all = getSavedGamesGallery();
  const opTrimmed = operatorIdentifier.trim().toLowerCase();
  return all.filter((g) => {
    if (!g) return false;
    const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
    const gFolder = g.operatorFolder || sanitizeOperatorFolderName(gOp);
    const matchesOp =
      gOp === opTrimmed ||
      gFolder === safeOp ||
      (g.operatorUid && g.operatorUid === operatorIdentifier);
    return matchesOp && getGameNormalizedDateKey(g) === dateKey;
  });
}

/**
 * Returns all registered YYYY-MM-DD subfolders for a given operator.
 */
export function getOperatorSubfolderDates(operatorIdentifier: string): string[] {
  if (typeof window === 'undefined') return [];
  const safeOp = sanitizeOperatorFolderName(operatorIdentifier);
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OPERATOR_FOLDERS_INDEX);
    if (raw) {
      const manifest = JSON.parse(raw);
      if (manifest[safeOp]?.subfolders && Array.isArray(manifest[safeOp].subfolders)) {
        return manifest[safeOp].subfolders;
      }
    }
  } catch {}

  // Deduce from gallery
  const all = getSavedGamesGallery();
  const opTrimmed = operatorIdentifier.trim().toLowerCase();
  const dateSet = new Set<string>();
  all.forEach((g) => {
    if (!g) return;
    const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
    const gFolder = g.operatorFolder || sanitizeOperatorFolderName(gOp);
    if (gOp === opTrimmed || gFolder === safeOp || (g.operatorUid && g.operatorUid === operatorIdentifier)) {
      dateSet.add(getGameNormalizedDateKey(g));
    }
  });

  return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
}

/**
 * Calculates the exact lines played for a given game snapshot.
 * NO arbitrary or multiplied numbers: accurately reflects the columns/tables played in that specific game.
 */
export function getGameLines(game: GameSequenceItem): number {
  if (game.totalLinesPlayed !== undefined && game.totalLinesPlayed !== null && game.totalLinesPlayed > 0) {
    return game.totalLinesPlayed;
  }
  const is90 = game.mode === '90' || game.sheetType === 'traditional-90';
  if (is90) {
    if (game.sheet90Snapshot) {
      const allTables = game.sheet90Snapshot.tables && game.sheet90Snapshot.tables.length > 0
        ? game.sheet90Snapshot.tables
        : [game.sheet90Snapshot.table1, game.sheet90Snapshot.table2].filter(Boolean);
      return allTables.length * 30;
    }
    return 30;
  }
  if (game.sheet75Snapshot?.columns && game.sheet75Snapshot.columns.length > 0) {
    return game.sheet75Snapshot.columns.reduce(
      (sum, col) => sum + (Number(col.multiplier) || 1),
      0
    );
  }
  return 11;
}

/**
 * Real-time listener for Firestore saved_games collection
 * Keeps all saved games from all operators synchronized across all devices
 */
export function subscribeToSavedGamesFirestore(
  callback: (games: GameSequenceItem[]) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  try {
    const q = collection(db, 'saved_games');
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const remoteMap = new Map<string, GameSequenceItem>();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as GameSequenceItem;
          const key = data.id || docSnap.id;
          const normalizedDate = getGameNormalizedDateKey(data);
          const operatorName = (data.operatorName || 'Operadora Principal').trim();
          const operatorFolder = data.operatorFolder || sanitizeOperatorFolderName(operatorName);
          const subfolderDay = data.subfolderDay || normalizedDate;
          const folderPath = data.folderPath || `${operatorFolder}/${subfolderDay}`;

          const normalizedGame: GameSequenceItem = {
            ...data,
            id: key,
            dailyDate: normalizedDate,
            subfolderDay,
            operatorFolder,
            folderPath,
            operatorName,
          };

          remoteMap.set(key, normalizedGame);
          recordGameToIsolatedDayFolder(normalizedGame);
        });

        // Merge with existing local storage items to prevent losing newly drafted items
        const localList = getSavedGamesGallery();
        localList.forEach((localItem) => {
          if (!localItem) return;
          const key = localItem.id || `game_${localItem.round}_${localItem.mode || localItem.sheetType}`;
          if (!remoteMap.has(key)) {
            remoteMap.set(key, localItem);
          }
        });

        const merged = Array.from(remoteMap.values());
        merged.sort((a, b) => {
          if (b.round !== a.round) {
            return (b.round || 0) - (a.round || 0);
          }
          return 0;
        });

        // Cache locally using safeSetItem (stripping heavy base64 images from older games)
        const galleryToStore = merged.map((g, idx) => {
          if (idx > 1 && g.cageSnapshotImage) {
            const copy = { ...g };
            delete copy.cageSnapshotImage;
            return copy;
          }
          return g;
        });
        safeSetItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(galleryToStore));

        callback(merged);
      },
      (error) => {
        console.warn('Firestore saved_games subscription error:', error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Could not initialize saved_games subscription:', err);
    return () => {};
  }
}

/**
 * Get all saved games from gallery storage, merged and unified with sequence histories
 */
export function getSavedGamesGallery(): GameSequenceItem[] {
  if (typeof window === 'undefined') return [];

  const map = new Map<string, GameSequenceItem>();

  // 1. Load from dedicated saved games gallery
  const hasSavedGalleryKey = localStorage.getItem(STORAGE_KEY_SAVED_GAMES_GALLERY) !== null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_GAMES_GALLERY);
    if (raw) {
      const parsed: GameSequenceItem[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          if (!item) return;
          if (!item.round || item.round < 1) return;

          const key = item.id || `game_${item.round}_${item.mode || item.sheetType}`;
          map.set(key, item);
        });
      }
    }
  } catch (e) {
    console.error('Error reading saved games gallery', e);
  }

  const allItems = Array.from(map.values());

  // Sort descending by round & time so the most recent is top in gallery
  allItems.sort((a, b) => {
    if (b.round !== a.round) {
      return (b.round || 0) - (a.round || 0);
    }
    return 0;
  });

  return allItems;
}

/**
 * Purge any ghost/fake games with ball 0 or empty balls from all local storage keys
 */
export function purgeGhostGamesFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    const rawGallery = localStorage.getItem(STORAGE_KEY_SAVED_GAMES_GALLERY);
    if (rawGallery) {
      const parsed = JSON.parse(rawGallery);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (item) => item && typeof item.round === 'number' && item.round >= 1
        );
        localStorage.setItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(cleaned));
      }
    }
    const raw75 = localStorage.getItem(STORAGE_KEY_SEQUENCE_75);
    if (raw75) {
      const parsed = JSON.parse(raw75);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (item) => item && typeof item.round === 'number' && item.round >= 1
        );
        localStorage.setItem(STORAGE_KEY_SEQUENCE_75, JSON.stringify(cleaned));
      }
    }
    const raw90 = localStorage.getItem(STORAGE_KEY_SEQUENCE_90);
    if (raw90) {
      const parsed = JSON.parse(raw90);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(
          (item) => item && typeof item.round === 'number' && item.round >= 1
        );
        localStorage.setItem(STORAGE_KEY_SEQUENCE_90, JSON.stringify(cleaned));
      }
    }
    const rawCustom = localStorage.getItem('bingo_sheet_custom_sequence');
    if (rawCustom) {
      const parsed = JSON.parse(rawCustom);
      if (parsed && typeof parsed === 'object') {
        const cleanedObj: Record<string, any> = {};
        Object.entries(parsed).forEach(([k, v]: [string, any]) => {
          if (v && (Number(v.bingo) > 0 || Number(v.terna) > 0 || Number(v.ambo) > 0)) {
            cleanedObj[k] = v;
          }
        });
        localStorage.setItem('bingo_sheet_custom_sequence', JSON.stringify(cleanedObj));
      }
    }
  } catch (e) {
    console.error('Error purging ghost games from storage', e);
  }
}

/**
 * Save a new or updated game snapshot to Firestore and the gallery, synchronizing both areas
 * Automatically detects current local date and organizes games into YYYY-MM-DD subfolders.
 */
export async function saveGameToFirestoreAndGallery(item: GameSequenceItem): Promise<void> {
  if (!item) {
    console.warn('Rejected saving empty game');
    return;
  }

  // 1. Automatic local date detection (format YYYY-MM-DD)
  const currentDateKey = getCurrentLocalDateKey();
  const normalizedDate = getGameNormalizedDateKey(item) || currentDateKey;

  // 2. Automatic operator folder & daily subfolder organization
  const operatorName = (item.operatorName || 'Operadora Principal').trim();
  const operatorFolder = item.operatorFolder || sanitizeOperatorFolderName(operatorName);
  const subfolderDay = item.subfolderDay || normalizedDate;
  const folderPath = `${operatorFolder}/${subfolderDay}`;

  const validRound = typeof item.round === 'number' && item.round >= 1 ? item.round : 1;
  const exactLines = getGameLines(item);
  const formattedDate = item.dateFormatted || new Date().toLocaleDateString('es-ES');

  const normalizedItem: GameSequenceItem = {
    ...item,
    round: validRound,
    dailyDate: normalizedDate,
    subfolderDay,
    operatorFolder,
    folderPath,
    operatorName,
    operatorUid: item.operatorUid || 'anon',
    dateFormatted: formattedDate,
    totalLinesPlayed: exactLines,
  };

  // Persist to local gallery and isolated day subfolder
  saveGameToGallery(normalizedItem);

  // Firestore remote persistence
  try {
    const docId = normalizedItem.id || `game_${Date.now()}_${normalizedItem.round}`;
    const drawnBalls = normalizedItem.drawnBallsPlayed || [];

    const firestorePayload: any = {
      id: docId,
      round: normalizedItem.round,
      ballNumber: normalizedItem.ballNumber || 0,
      letter: normalizedItem.letter || '',
      mode: normalizedItem.mode || '75',
      timestamp: normalizedItem.timestamp || new Date().toLocaleTimeString(),
      dateFormatted: formattedDate,
      dailyDate: normalizedDate,
      subfolderDay,
      operatorFolder,
      folderPath,
      operatorUid: normalizedItem.operatorUid || 'anon',
      operatorName,
      operatorEmail: normalizedItem.operatorEmail || '',
      durationSeconds: normalizedItem.durationSeconds || 0,
      durationFormatted: normalizedItem.durationFormatted || '0s',
      totalCollected: normalizedItem.totalCollected || 0,
      totalPrizesPaid: normalizedItem.totalPrizesPaid || 0,
      netProfit: normalizedItem.netProfit || 0,
      currency: normalizedItem.currency || '$',
      drawnBallsPlayed: drawnBalls,
      totalBallsDrawnCount: drawnBalls.length || normalizedItem.totalBallsDrawnCount || 0,
      rowLeader: normalizedItem.rowLeader ?? null,
      winningPlayerName: normalizedItem.winningPlayerName || '',
      tableNumber: normalizedItem.tableNumber ?? null,
      sheetType: normalizedItem.sheetType || (normalizedItem.mode === '90' ? 'traditional-90' : 'multipliers-15'),
      totalLinesPlayed: exactLines,
      cageSnapshotImage: normalizedItem.cageSnapshotImage || null,
      createdAt: serverTimestamp(),
      savedAtISO: new Date().toISOString(),
    };

    if (normalizedItem.playerSummarySnapshot && Array.isArray(normalizedItem.playerSummarySnapshot)) {
      firestorePayload.playerSummarySnapshot = JSON.parse(JSON.stringify(normalizedItem.playerSummarySnapshot));
    }
    if (normalizedItem.sequenceSnapshot) {
      firestorePayload.sequenceSnapshot = JSON.parse(JSON.stringify(normalizedItem.sequenceSnapshot));
    }

    // If sheet snapshots exist, include serialized summary
    if (normalizedItem.sheet75Snapshot) {
      const s75Copy = JSON.parse(JSON.stringify(normalizedItem.sheet75Snapshot));
      if (normalizedItem.playerSummarySnapshot && (!s75Copy.playerSummaryList || s75Copy.playerSummaryList.length === 0)) {
        s75Copy.playerSummaryList = normalizedItem.playerSummarySnapshot;
      }
      firestorePayload.sheet75Snapshot = s75Copy;
    }
    if (normalizedItem.sheet90Snapshot) {
      firestorePayload.sheet90Snapshot = JSON.parse(JSON.stringify(normalizedItem.sheet90Snapshot));
    }

    await setDoc(doc(db, 'saved_games', docId), firestorePayload);
  } catch (err) {
    console.warn('Could not save game to Firestore:', err);
  }
}

/**
 * Save a new or updated game snapshot to the gallery and synchronize both areas
 * Automatically detects current local date and isolates lines into YYYY-MM-DD subfolders.
 */
export function saveGameToGallery(item: GameSequenceItem): void {
  if (typeof window === 'undefined' || !item) return;
  const validRound = typeof item.round === 'number' && item.round >= 1 ? item.round : 1;

  try {
    const current = getSavedGamesGallery();
    const mode = item.mode || (item.sheetType === 'traditional-90' ? '90' : '75');
    const exactLines = getGameLines(item);

    // 1. Detect current date in YYYY-MM-DD
    const currentDateKey = getCurrentLocalDateKey();
    const normalizedDate = getGameNormalizedDateKey(item) || currentDateKey;

    // 2. Organize operator folder and subfolder YYYY-MM-DD
    const operatorName = (item.operatorName || 'Operadora Principal').trim();
    const operatorFolder = item.operatorFolder || sanitizeOperatorFolderName(operatorName);
    const subfolderDay = item.subfolderDay || normalizedDate;
    const folderPath = item.folderPath || `${operatorFolder}/${subfolderDay}`;

    const normalizedItem: GameSequenceItem = {
      ...item,
      id: item.id || `game_${Date.now()}_${item.round}_${mode}`,
      dailyDate: normalizedDate,
      subfolderDay,
      operatorFolder,
      folderPath,
      operatorName,
      operatorEmail: item.operatorEmail || '',
      operatorUid: item.operatorUid || 'anon',
      dateFormatted: item.dateFormatted || new Date().toLocaleDateString('es-ES'),
      mode,
      totalLinesPlayed: exactLines,
    };

    // 3. Save directly to the isolated day subfolder (lightweight, zero quota bloat)
    const cleanItem = sanitizeItemForStorage(normalizedItem);
    recordGameToIsolatedDayFolder(cleanItem);

    // 4. Update the main gallery
    const existingIdx = current.findIndex(
      (g) =>
        (g.id && g.id === normalizedItem.id) ||
        (g.round === normalizedItem.round && (g.mode === mode || g.sheetType === normalizedItem.sheetType))
    );

    let updated: GameSequenceItem[];
    if (existingIdx >= 0) {
      updated = [...current];
      updated[existingIdx] = { ...current[existingIdx], ...normalizedItem };
    } else {
      updated = [normalizedItem, ...current];
    }

    // Save main gallery safely (keeps image only on top 2 most recent items locally)
    const galleryToStore = updated.map((g, idx) => {
      if (idx > 1 && g.cageSnapshotImage) {
        const copy = { ...g };
        delete copy.cageSnapshotImage;
        return copy;
      }
      return g;
    });
    safeSetItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(galleryToStore));

    // Dispatch global event so all UI components update counters and tables immediately
    window.dispatchEvent(
      new CustomEvent('bingo_saved_games_updated', {
        detail: { total: updated.length, savedItem: normalizedItem },
      })
    );
  } catch (e) {
    console.error('Error saving game to gallery', e);
  }
}

/**
 * Remove a specific game by ID from the gallery and synchronize both areas
 */
export function removeGameFromGallery(idOrKey: string): void {
  deleteGamePermanently(idOrKey).catch(() => {});
}

/**
 * Permanently deletes a game from local storage, sequence history, and Firestore
 */
export async function deleteGamePermanently(idOrItem: string | GameSequenceItem): Promise<boolean> {
  if (typeof window === 'undefined' || !idOrItem) return false;

  const targetId = typeof idOrItem === 'string' ? idOrItem : idOrItem.id;
  const targetRound = typeof idOrItem === 'object' ? idOrItem.round : undefined;
  const targetTimestamp = typeof idOrItem === 'object' ? idOrItem.timestamp : undefined;

  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_GAMES_GALLERY);
    const current: GameSequenceItem[] = raw ? JSON.parse(raw) : [];

    const foundItem = current.find((g) => {
      if (!g) return false;
      if (targetId && (g.id === targetId || `${g.round}_${g.timestamp}` === targetId)) return true;
      if (typeof idOrItem === 'string' && (String(g.round) === idOrItem || `game_${g.round}_${g.mode || g.sheetType}` === idOrItem)) return true;
      if (targetRound !== undefined && targetTimestamp !== undefined && g.round === targetRound && g.timestamp === targetTimestamp) return true;
      return false;
    });

    const docId = foundItem?.id || targetId;

    const filtered = current.filter((g) => {
      if (!g) return false;
      if (docId && g.id === docId) return false;
      if (targetId && g.id === targetId) return false;
      if (targetRound !== undefined && targetTimestamp !== undefined && g.round === targetRound && g.timestamp === targetTimestamp) return false;
      if (typeof idOrItem === 'string') {
        if (`${g.round}_${g.timestamp}` === idOrItem) return false;
        if (`game_${g.round}_${g.mode || g.sheetType}` === idOrItem) return false;
        if (String(g.round) === idOrItem) return false;
      }
      return true;
    });

    safeSetItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(filtered));

    // Clean up isolated day subfolder storage
    const safeOp = foundItem?.operatorFolder || sanitizeOperatorFolderName(foundItem?.operatorName);
    const dateKey = foundItem ? getGameNormalizedDateKey(foundItem) : null;
    if (safeOp && dateKey) {
      const dayKey = getOperatorDayStorageKey(safeOp, dateKey);
      try {
        const rawDay = localStorage.getItem(dayKey);
        if (rawDay) {
          const parsedDay: GameSequenceItem[] = JSON.parse(rawDay);
          const filteredDay = parsedDay.filter((g) => g && g.id !== docId && g.id !== targetId);
          safeSetItem(dayKey, JSON.stringify(filteredDay));
        }
      } catch {}
    }

    // Sync sequence storage keys
    const seq90 = filtered
      .filter((g) => g.mode === '90' || g.sheetType === 'traditional-90')
      .sort((a, b) => (a.round || 0) - (b.round || 0));
    safeSetItem(STORAGE_KEY_SEQUENCE_90, JSON.stringify(sanitizeSequenceForStorage(seq90)));

    const seq75 = filtered
      .filter((g) => g.mode === '75' || g.sheetType === 'multipliers-15')
      .sort((a, b) => (a.round || 0) - (b.round || 0));
    safeSetItem(STORAGE_KEY_SEQUENCE_75, JSON.stringify(sanitizeSequenceForStorage(seq75)));

    // Delete Firestore document asynchronously
    try {
      if (docId) {
        await deleteDoc(doc(db, 'saved_games', docId)).catch(() => {});
      }
      if (targetId && targetId !== docId) {
        await deleteDoc(doc(db, 'saved_games', targetId)).catch(() => {});
      }
    } catch (fsErr) {
      console.warn('Firestore game delete error:', fsErr);
    }

    window.dispatchEvent(
      new CustomEvent('bingo_saved_games_updated', {
        detail: { total: filtered.length, deletedId: docId || targetId },
      })
    );

    return true;
  } catch (e) {
    console.error('Error removing game from gallery', e);
    return false;
  }
}

/**
 * Permanently deletes all games of a specific operator on a specific dateKey (YYYY-MM-DD)
 * without affecting any other day's or other operator's games.
 */
export async function deleteGamesOfDay(
  operatorName: string,
  dateKey: string
): Promise<number> {
  if (typeof window === 'undefined') return 0;
  try {
    const safeOp = sanitizeOperatorFolderName(operatorName);
    const dayKey = getOperatorDayStorageKey(safeOp, dateKey);

    // 1. Delete isolated day subfolder from localStorage
    try {
      localStorage.removeItem(dayKey);
      const rawManifest = localStorage.getItem(STORAGE_KEY_OPERATOR_FOLDERS_INDEX);
      if (rawManifest) {
        const manifest = JSON.parse(rawManifest);
        if (manifest[safeOp]?.subfolders && Array.isArray(manifest[safeOp].subfolders)) {
          manifest[safeOp].subfolders = manifest[safeOp].subfolders.filter((s: string) => s !== dateKey);
          safeSetItem(STORAGE_KEY_OPERATOR_FOLDERS_INDEX, JSON.stringify(manifest));
        }
      }
    } catch {}

    const raw = localStorage.getItem(STORAGE_KEY_SAVED_GAMES_GALLERY);
    const current: GameSequenceItem[] = raw ? JSON.parse(raw) : [];

    const opTrimmed = operatorName.trim().toLowerCase();
    const toDelete: GameSequenceItem[] = [];
    const remaining: GameSequenceItem[] = [];

    current.forEach((g) => {
      if (!g) return;
      const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = g.operatorFolder || sanitizeOperatorFolderName(gOp);
      const gDate = getGameNormalizedDateKey(g);
      if ((gOp === opTrimmed || gFolder === safeOp) && gDate === dateKey) {
        toDelete.push(g);
      } else {
        remaining.push(g);
      }
    });

    for (const g of toDelete) {
      const docId = g.id;
      if (docId) {
        await deleteDoc(doc(db, 'saved_games', docId)).catch(() => {});
      }
    }

    safeSetItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(remaining));

    // Sync sequence storage keys
    const seq90 = remaining
      .filter((g) => g.mode === '90' || g.sheetType === 'traditional-90')
      .sort((a, b) => (a.round || 0) - (b.round || 0));
    safeSetItem(STORAGE_KEY_SEQUENCE_90, JSON.stringify(sanitizeSequenceForStorage(seq90)));

    const seq75 = remaining
      .filter((g) => g.mode === '75' || g.sheetType === 'multipliers-15')
      .sort((a, b) => (a.round || 0) - (b.round || 0));
    safeSetItem(STORAGE_KEY_SEQUENCE_75, JSON.stringify(sanitizeSequenceForStorage(seq75)));

    window.dispatchEvent(
      new CustomEvent('bingo_saved_games_updated', {
        detail: { total: remaining.length, deletedCount: toDelete.length },
      })
    );

    return toDelete.length;
  } catch (e) {
    console.error('Error deleting games of day', e);
    return 0;
  }
}

/**
 * Clear all saved games in gallery and synchronize both areas
 */
export function clearAllSavedGamesGallery(filterMode?: 'all' | '75' | '90'): void {
  if (typeof window === 'undefined') return;

  try {
    if (!filterMode || filterMode === 'all') {
      localStorage.setItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_SEQUENCE_75, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_SEQUENCE_90, JSON.stringify([]));

      // Clean up subfolders and index
      try {
        Object.keys(localStorage).forEach((k) => {
          if (k.startsWith(STORAGE_KEY_OPERATOR_DAY_PREFIX) || k === STORAGE_KEY_OPERATOR_FOLDERS_INDEX) {
            localStorage.removeItem(k);
          }
        });
      } catch {}

      // Asynchronously wipe all saved_games from Firestore
      try {
        getDocs(collection(db, 'saved_games'))
          .then((snap) => {
            snap.forEach((d) => {
              deleteDoc(d.ref).catch(() => {});
            });
          })
          .catch(() => {});
      } catch {}

      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: 0 },
        })
      );
    } else if (filterMode === '75') {
      const current = getSavedGamesGallery();
      const filtered = current.filter((g) => {
        if (g.mode === '75' || g.sheetType === 'multipliers-15') {
          if (g.id) deleteDoc(doc(db, 'saved_games', g.id)).catch(() => {});
          return false;
        }
        return true;
      });
      localStorage.setItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(filtered));
      localStorage.setItem(STORAGE_KEY_SEQUENCE_75, JSON.stringify([]));
      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: filtered.length },
        })
      );
    } else if (filterMode === '90') {
      const current = getSavedGamesGallery();
      const filtered = current.filter((g) => {
        if (g.mode === '90' || g.sheetType === 'traditional-90') {
          if (g.id) deleteDoc(doc(db, 'saved_games', g.id)).catch(() => {});
          return false;
        }
        return true;
      });
      localStorage.setItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(filtered));
      localStorage.setItem(STORAGE_KEY_SEQUENCE_90, JSON.stringify([]));
      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: filtered.length },
        })
      );
    }
  } catch (e) {
    console.error('Error clearing saved games gallery', e);
  }
}

