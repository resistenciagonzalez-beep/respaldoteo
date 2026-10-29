import {
  GameSequenceItem,
  SheetViewType,
  BingoMode,
  BingoSheetData,
  Traditional90SheetData,
  AppUser,
  PlayerSummarySnapshotItem,
  GameSequenceSnapshot,
} from '../types';
import {
  doc,
  setDoc,
  serverTimestamp,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  getDoc,
  FieldValue,
} from 'firebase/firestore';
import { db } from '../firebase';
import { safeSetItem, sanitizeSequenceForStorage } from './safeStorage';

export const STORAGE_KEY_SAVED_GAMES_GALLERY = 'bingo_saved_games_gallery';
export const STORAGE_KEY_SEQUENCE_75 = 'bingo_game_sequence_history';
export const STORAGE_KEY_SEQUENCE_90 = 'bingo_90_game_sequence_history';

/**
 * Authoritative in-memory store synchronized directly with Firestore `saved_games`.
 * Firestore is the sole persistent source of truth; localStorage is only used as a
 * lightweight temporary bootstrap cache prior to the initial Firestore snapshot.
 */
const firestoreGamesMemoryStore = new Map<string, GameSequenceItem>();
let hasSyncedWithFirestore = false;

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
 * Detects the operator's current local time formatted as HH:mm:ss (24h format).
 * E.g. "16:05:47". Guaranteed to have seconds and uniform formatting.
 */
export function getCurrentLocalTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Recursively removes undefined fields from an object to ensure Firestore compatibility.
 */
function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as unknown as T;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
    }
  }
  return result as T;
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
 * Scopes a key to a specific user/operator so their temporary UI state is isolated.
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
  if (!user) return true;
  if (user.role === 'admin') return true;

  const opUid = user.id || user.uid;
  const opEmail = user.email ? user.email.trim().toLowerCase() : '';
  const opName = user.name ? user.name.trim().toLowerCase() : '';

  if (
    game.operatorUid &&
    opUid &&
    (game.operatorUid === opUid || game.operatorUid === user.id || game.operatorUid === user.uid)
  ) {
    return true;
  }

  if (game.operatorEmail && opEmail && game.operatorEmail.trim().toLowerCase() === opEmail) {
    return true;
  }

  if (game.operatorName && opName && game.operatorName.trim().toLowerCase() === opName) {
    return true;
  }

  if (!game.operatorUid && !game.operatorEmail && !game.operatorName) {
    return true;
  }

  return false;
}

/**
 * Parses any date string format into a strict YYYY-MM-DD canonical key.
 * Supports:
 * - YYYY-MM-DD (ISO date key)
 * - ISO timestamps: YYYY-MM-DDTHH:mm:ss...
 * - DD/MM/YYYY or D/M/YYYY
 * - YYYY/MM/DD
 * - DD-MM-YYYY or D-M-YYYY
 * - Spanish date strings: "28 de octubre de 2026", "29 oct 2026", etc.
 */
export function parseDateStringToDateKey(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // 1. Direct YYYY-MM-DD format (standard ISO date key)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. ISO timestamp string: e.g. "2026-10-29T14:32:00.000Z" or "2026-10-29 14:32:00"
  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return trimmed.slice(0, 10);
  }

  // 3. DD/MM/YYYY or YYYY/MM/DD
  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    const p0 = slashParts[0].trim();
    const p1 = slashParts[1].trim();
    const p2 = slashParts[2].trim();
    if (p2.length === 4 && !isNaN(Number(p2))) {
      return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
    } else if (p0.length === 4 && !isNaN(Number(p0))) {
      return `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    }
  }

  // 4. DD-MM-YYYY or YYYY-MM-DD
  const dashParts = trimmed.split('-');
  if (dashParts.length === 3) {
    const p0 = dashParts[0].trim();
    const p1 = dashParts[1].trim();
    const p2 = dashParts[2].trim();
    if (p2.length === 4 && !isNaN(Number(p2))) {
      return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
    } else if (p0.length === 4 && !isNaN(Number(p0))) {
      return `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    }
  }

  // 5. Spanish textual dates: e.g. "29 de octubre de 2026" or "29 oct 2026"
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

  return null;
}

/**
 * Extracts the true authoritative exact date (YYYY-MM-DD) of a game.
 * Evaluates dateFormatted (ticket/display date), shiftDate, dailyDate,
 * and ISO timestamps in strict precision order.
 */
export function extractGameExactDate(game: Partial<GameSequenceItem>): string {
  if (!game) return getCurrentLocalDateKey();

  // 1. dateFormatted: Explicit human/ticket date recorded on the sheet
  const fromFormatted = parseDateStringToDateKey(game.dateFormatted);
  if (fromFormatted) return fromFormatted;

  // 2. shiftDate: The operator's shift date if specified
  const fromShift = parseDateStringToDateKey(game.shiftDate);
  if (fromShift) return fromShift;

  // 3. dailyDate: Primary daily grouping key
  const fromDaily = parseDateStringToDateKey(game.dailyDate);
  if (fromDaily) return fromDaily;

  // 4. ISO timestamps
  const fromSavedAt = parseDateStringToDateKey((game as any).savedAtISO || (game as any).createdAtISO);
  if (fromSavedAt) return fromSavedAt;

  // 5. subfolderDay if already valid
  const fromSubfolder = parseDateStringToDateKey(game.subfolderDay);
  if (fromSubfolder) return fromSubfolder;

  // 6. folderPath ending segment
  if (game.folderPath) {
    const parts = game.folderPath.split('/');
    const lastPart = parts[parts.length - 1]?.trim();
    const fromPath = parseDateStringToDateKey(lastPart);
    if (fromPath) return fromPath;
  }

  return getCurrentLocalDateKey();
}

/**
 * Extracts the current subfolder date (if any) where the game is currently located.
 */
export function extractCurrentSubfolderDate(game: Partial<GameSequenceItem>): string | null {
  if (!game) return null;
  if (game.subfolderDay) {
    const parsed = parseDateStringToDateKey(game.subfolderDay);
    if (parsed) return parsed;
  }
  if (game.folderPath) {
    const parts = game.folderPath.split('/');
    const lastPart = parts[parts.length - 1]?.trim();
    const parsed = parseDateStringToDateKey(lastPart);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Extracts a normalized YYYY-MM-DD date key from a GameSequenceItem.
 * Uses exact date resolution to ensure 100% strict subfolder isolation per date.
 */
export function getGameNormalizedDateKey(game: GameSequenceItem): string {
  return extractGameExactDate(game);
}

/**
 * Deterministic canonical document ID for a game based on operator, dailyDate, mode, and round.
 * Prevents duplicate documents when saving or updating the same round.
 */
export function buildCanonicalGameId(
  operatorFolder: string,
  dailyDate: string,
  mode: BingoMode,
  round: number,
  operatorUid?: string
): string {
  const safeOp = sanitizeOperatorFolderName(operatorFolder).slice(0, 36);
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(dailyDate) ? dailyDate : getCurrentLocalDateKey();
  const safeMode = mode === '90' ? '90' : '75';
  const safeRound = Math.max(1, Math.floor(Number(round) || 1));
  const safeUid =
    operatorUid && operatorUid !== 'anon'
      ? `_${operatorUid.slice(0, 10).replace(/[^a-zA-Z0-9]/g, '')}`
      : '';
  return `game_${safeOp}${safeUid}_${safeDate}_${safeMode}_r${safeRound}`;
}

/**
 * Normalizes a GameSequenceItem so its dailyDate, subfolderDay, operatorFolder, and folderPath
 * are 100% consistent with its exact date (YYYY-MM-DD).
 *
 * Rule: If a game's date differs from the subfolder where it is currently placed,
 * it is detected as misplaced and immediately moved to the subfolder of its exact date.
 */
export function normalizeGameFolderMetadata(
  data: GameSequenceItem,
  fallbackId?: string
): {
  normalizedGame: GameSequenceItem;
  isMisplaced: boolean;
  reason?: string;
} {
  const exactDate = extractGameExactDate(data);
  const currentSubfolder = extractCurrentSubfolderDate(data);

  const operatorName = (data.operatorName || 'Operadora Principal').trim();
  const operatorFolder = sanitizeOperatorFolderName(data.operatorFolder || operatorName);
  const expectedSubfolder = exactDate;
  const expectedFolderPath = `${operatorFolder}/${expectedSubfolder}`;
  const mode: BingoMode = data.mode || (data.sheetType === 'traditional-90' ? '90' : '75');
  const validRound = typeof data.round === 'number' && data.round >= 1 ? data.round : 1;
  const resolvedId =
    data.id ||
    fallbackId ||
    buildCanonicalGameId(operatorFolder, exactDate, mode, validRound, data.operatorUid);

  // Detect subfolder and date mismatches
  const hasSubfolderMismatch = currentSubfolder !== null && currentSubfolder !== exactDate;
  const hasDailyDateMismatch = data.dailyDate !== exactDate;
  const hasSubfolderDayMismatch = data.subfolderDay !== expectedSubfolder;
  const hasFolderPathMismatch = data.folderPath !== expectedFolderPath;
  const hasOperatorMismatch = data.operatorFolder !== operatorFolder;

  const isMisplaced =
    hasSubfolderMismatch ||
    hasDailyDateMismatch ||
    hasSubfolderDayMismatch ||
    hasFolderPathMismatch ||
    hasOperatorMismatch;

  let reason = '';
  if (hasSubfolderMismatch) {
    reason = `Fecha de partida (${exactDate}) diferente a subcarpeta actual (${currentSubfolder})`;
  } else if (hasDailyDateMismatch) {
    reason = `dailyDate (${data.dailyDate}) difiere de fecha exacta (${exactDate})`;
  } else if (hasFolderPathMismatch) {
    reason = `folderPath (${data.folderPath}) no coincide con subcarpeta ${expectedFolderPath}`;
  } else if (hasSubfolderDayMismatch) {
    reason = `subfolderDay (${data.subfolderDay}) difiere de ${expectedSubfolder}`;
  } else if (hasOperatorMismatch) {
    reason = `operatorFolder (${data.operatorFolder}) normalizado a ${operatorFolder}`;
  }

  // Ensure formatted human date is consistent (DD/MM/YYYY)
  let dateFormatted = data.dateFormatted;
  if (!dateFormatted || !parseDateStringToDateKey(dateFormatted)) {
    const parts = exactDate.split('-');
    if (parts.length === 3) {
      dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
  }

  const normalizedGame: GameSequenceItem = {
    ...data,
    id: resolvedId,
    round: validRound,
    mode,
    dailyDate: exactDate,
    subfolderDay: expectedSubfolder,
    operatorFolder,
    folderPath: expectedFolderPath,
    operatorName,
    dateFormatted,
  };

  return { normalizedGame, isMisplaced, reason };
}

/**
 * Sorts games deterministically: most recent dailyDate first, then highest round first.
 */
function sortGamesChronologicallyDesc(games: GameSequenceItem[]): GameSequenceItem[] {
  return [...games].sort((a, b) => {
    const dateA = getGameNormalizedDateKey(a);
    const dateB = getGameNormalizedDateKey(b);
    if (dateB !== dateA) {
      return dateB.localeCompare(dateA);
    }
    return (b.round || 0) - (a.round || 0);
  });
}

/**
 * Updates the temporary localStorage cache (strictly non-authoritative fallback).
 */
function syncTemporaryLocalCache(games: GameSequenceItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const sorted = sortGamesChronologicallyDesc(games);
    const lightweightCache = sanitizeSequenceForStorage(sorted.slice(0, 40));
    safeSetItem(STORAGE_KEY_SAVED_GAMES_GALLERY, JSON.stringify(lightweightCache));
  } catch (err) {
    console.warn('Temporary cache update skipped:', err);
  }
}

/**
 * Calculates the exact lines played for a given game snapshot.
 */
export function getGameLines(game: GameSequenceItem): number {
  if (game.totalLinesPlayed !== undefined && game.totalLinesPlayed !== null && game.totalLinesPlayed > 0) {
    return game.totalLinesPlayed;
  }
  const is90 = game.mode === '90' || game.sheetType === 'traditional-90';
  if (is90) {
    if (game.sheet90Snapshot) {
      const allTables =
        game.sheet90Snapshot.tables && game.sheet90Snapshot.tables.length > 0
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
 * Real-time listener for Firestore `saved_games` collection.
 * Keeps the authoritative in-memory store and all UI views synchronized with Firestore,
 * and automatically heals any game stored in a folder that does not match its dailyDate.
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
        firestoreGamesMemoryStore.clear();

        snapshot.forEach((docSnap) => {
          const rawData = docSnap.data() as GameSequenceItem;
          const docKey = docSnap.id;
          const { normalizedGame, isMisplaced, reason } = normalizeGameFolderMetadata(
            { ...rawData, id: docKey },
            docKey
          );

          if (isMisplaced) {
            console.log(
              `[AUTO-CORRECTION] ${reason || 'Reorganización de subcarpeta'}. Partida ID: ${docKey}, Fecha exacta: ${normalizedGame.dailyDate}, Subcarpeta: ${normalizedGame.subfolderDay}, Ruta: ${normalizedGame.folderPath}`
            );
            setDoc(
              doc(db, 'saved_games', docKey),
              {
                id: docKey,
                dailyDate: normalizedGame.dailyDate,
                subfolderDay: normalizedGame.subfolderDay,
                folderPath: normalizedGame.folderPath,
                operatorFolder: normalizedGame.operatorFolder,
                operatorName: normalizedGame.operatorName,
                dateFormatted: normalizedGame.dateFormatted,
              },
              { merge: true }
            ).catch((err) => {
              console.warn(`[AUTO-CORRECTION] Error syncing auto-healed game ${docKey}:`, err);
            });
          }

          firestoreGamesMemoryStore.set(docKey, normalizedGame);
        });

        hasSyncedWithFirestore = true;
        const sortedGames = sortGamesChronologicallyDesc(
          Array.from(firestoreGamesMemoryStore.values())
        );

        syncTemporaryLocalCache(sortedGames);
        callback(sortedGames);
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
 * Scans all saved games in Firestore.
 * If any game has a date different from the subfolder where it is stored,
 * it is automatically moved to its correct subfolder.
 * Ensures this rule holds permanently.
 */
export async function reorganizeAndHealAllStoredGames(): Promise<{
  totalChecked: number;
  reorganizedCount: number;
  details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }>;
}> {
  const details: Array<{ id: string; round: number; oldSubfolder: string; newSubfolder: string; reason: string }> = [];
  let totalChecked = 0;
  let reorganizedCount = 0;

  try {
    const snap = await getDocs(collection(db, 'saved_games'));
    for (const docSnap of snap.docs) {
      totalChecked++;
      const rawData = docSnap.data() as GameSequenceItem;
      const docKey = docSnap.id;
      const { normalizedGame, isMisplaced, reason } = normalizeGameFolderMetadata(
        { ...rawData, id: docKey },
        docKey
      );

      if (isMisplaced) {
        reorganizedCount++;
        const oldSubfolder = rawData.subfolderDay || rawData.folderPath || 'desconocida';
        const newSubfolder = normalizedGame.subfolderDay || normalizedGame.dailyDate || 'desconocida';

        details.push({
          id: docKey,
          round: normalizedGame.round,
          oldSubfolder,
          newSubfolder,
          reason: reason || 'Reorganización a fecha exacta',
        });

        console.log(
          `[REORGANIZACION_SUBCARPETAS] Partida #${normalizedGame.round} (${docKey}) movida de subcarpeta "${oldSubfolder}" a "${newSubfolder}" por fecha exacta.`
        );

        await setDoc(
          doc(db, 'saved_games', docKey),
          {
            id: docKey,
            dailyDate: normalizedGame.dailyDate,
            subfolderDay: normalizedGame.subfolderDay,
            folderPath: normalizedGame.folderPath,
            operatorFolder: normalizedGame.operatorFolder,
            operatorName: normalizedGame.operatorName,
            dateFormatted: normalizedGame.dateFormatted,
          },
          { merge: true }
        );

        firestoreGamesMemoryStore.set(docKey, normalizedGame);
      } else {
        firestoreGamesMemoryStore.set(docKey, normalizedGame);
      }
    }

    const sortedGames = sortGamesChronologicallyDesc(
      Array.from(firestoreGamesMemoryStore.values())
    );
    syncTemporaryLocalCache(sortedGames);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: sortedGames.length, reorganizedCount },
        })
      );
    }
  } catch (err) {
    console.error('Error during reorganizeAndHealAllStoredGames:', err);
  }

  return { totalChecked, reorganizedCount, details };
}

/**
 * Returns all saved games from the authoritative Firestore-backed memory store.
 * Falls back to the temporary localStorage cache only before the initial Firestore snapshot arrives.
 */
export function getSavedGamesGallery(): GameSequenceItem[] {
  if (hasSyncedWithFirestore || firestoreGamesMemoryStore.size > 0) {
    return sortGamesChronologicallyDesc(Array.from(firestoreGamesMemoryStore.values()));
  }

  if (typeof window === 'undefined') return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY_SAVED_GAMES_GALLERY);
    if (raw) {
      const parsed: GameSequenceItem[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const valid = parsed
          .filter((item) => item && typeof item.round === 'number' && item.round >= 1)
          .map((item) => normalizeGameFolderMetadata(item, item.id).normalizedGame);
        return sortGamesChronologicallyDesc(valid);
      }
    }
  } catch (e) {
    console.error('Error reading temporary saved games cache', e);
  }

  return [];
}

/**
 * Resolves the existing Firestore document ID if a game with the same ID or same
 * (operatorFolder, dailyDate, mode, round) already exists, preventing duplicate records.
 */
function resolveExistingOrCanonicalDocId(
  item: GameSequenceItem,
  operatorFolder: string,
  dailyDate: string,
  mode: BingoMode,
  validRound: number
): { docId: string; duplicateIdsToClean: string[] } {
  const existingGames = getSavedGamesGallery();
  const matchingGames = existingGames.filter((g) => {
    if (!g) return false;
    const gDate = getGameNormalizedDateKey(g);
    const gOp = sanitizeOperatorFolderName(g.operatorFolder || g.operatorName);
    const gMode: BingoMode = g.mode || (g.sheetType === 'traditional-90' ? '90' : '75');
    return (
      gDate === dailyDate &&
      gOp === operatorFolder &&
      gMode === mode &&
      g.round === validRound
    );
  });

  const canonicalId = buildCanonicalGameId(operatorFolder, dailyDate, mode, validRound);

  // If caller passed a non-ephemeral ID that already exists in Firestore, preserve it
  const hasExplicitExistingId =
    Boolean(item.id) && firestoreGamesMemoryStore.has(item.id!);

  let chosenId: string;
  if (hasExplicitExistingId) {
    chosenId = item.id!;
  } else if (matchingGames.length > 0 && matchingGames[0].id) {
    chosenId = matchingGames[0].id;
  } else if (item.id && !/^game_\d{10,}_\d+$/.test(item.id)) {
    chosenId = item.id;
  } else {
    chosenId = canonicalId;
  }

  const duplicateIdsToClean = matchingGames
    .map((g) => g.id)
    .filter((id): id is string => Boolean(id && id !== chosenId));

  return { docId: chosenId, duplicateIdsToClean };
}

/**
 * Centralized Unified Game Persistence Service.
 * Firestore is the ONLY persistent source of truth. LocalStorage is used only as temporary cache.
 *
 * Rules:
 * 1. Single source of truth for date: dailyDate (YYYY-MM-DD).
 * 2. Stored strictly in subfolder corresponding to dailyDate (${operatorFolder}/${dailyDate}).
 * 3. Strict document ID preservation: Each game keeps the same ID; existing games are updated in-place.
 * 4. Post-save verification: Immediately read back from Firestore and verify all data was saved.
 *    Only confirm success when verification is positive. If it fails, retry automatically up to 3 times.
 * 5. Immediate UI refresh using confirmed Firestore data.
 * 6. Detailed logging: ID, dailyDate, path, result, verified, and auto-corrections.
 */
export async function saveGameUnified(
  item: GameSequenceItem
): Promise<{ success: boolean; verified: boolean; game: GameSequenceItem }> {
  if (!item) {
    throw new Error('No se puede guardar una partida vacía');
  }

  // 1. Single source of truth for date: dailyDate (YYYY-MM-DD)
  const dailyDate = getGameNormalizedDateKey(item);
  const operatorName = (item.operatorName || 'Operadora Principal').trim();
  const operatorFolder = sanitizeOperatorFolderName(item.operatorFolder || operatorName);
  const subfolderDay = dailyDate;
  const folderPath = `${operatorFolder}/${subfolderDay}`;

  const mode: BingoMode = item.mode || (item.sheetType === 'traditional-90' ? '90' : '75');
  const validRound = typeof item.round === 'number' && item.round >= 1 ? item.round : 1;

  // 2. Preserve existing document ID strictly to prevent duplicates
  const { docId, duplicateIdsToClean } = resolveExistingOrCanonicalDocId(
    item,
    operatorFolder,
    dailyDate,
    mode,
    validRound
  );

  const exactLines = getGameLines(item);
  let formattedDate = item.dateFormatted;
  if (!formattedDate || !parseDateStringToDateKey(formattedDate)) {
    const parts = dailyDate.split('-');
    formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : new Date().toLocaleDateString('es-ES');
  }
  const drawnBalls = item.drawnBallsPlayed || [];
  const exactTimestamp =
    item.timestamp && /^\d{1,2}:\d{2}(:\d{2})?$/.test(item.timestamp.trim())
      ? (item.timestamp.trim().split(':').length === 2 ? `${item.timestamp.trim()}:00` : item.timestamp.trim())
      : getCurrentLocalTimeString();

  const normalizedItem: GameSequenceItem = {
    ...item,
    id: docId,
    round: validRound,
    mode,
    dailyDate,
    subfolderDay,
    operatorFolder,
    folderPath,
    operatorName,
    operatorUid: item.operatorUid || 'anon',
    operatorEmail: item.operatorEmail || '',
    dateFormatted: formattedDate,
    timestamp: exactTimestamp,
    totalLinesPlayed: exactLines,
  };

  interface FirestoreGamePayload {
    id: string;
    round: number;
    ballNumber: number;
    ternaBall?: number | null;
    ternaLeader?: number | null;
    amboBall?: number | null;
    amboLeader?: number | null;
    letter: string;
    mode: BingoMode;
    timestamp: string;
    dateFormatted: string;
    dailyDate: string;
    subfolderDay: string;
    operatorFolder: string;
    folderPath: string;
    operatorUid: string;
    operatorName: string;
    operatorEmail: string;
    durationSeconds: number;
    durationFormatted: string;
    totalCollected: number;
    totalPrizesPaid: number;
    netProfit: number;
    currency: string;
    drawnBallsPlayed: number[];
    totalBallsDrawnCount: number;
    rowLeader: number | null;
    winningPlayerName: string;
    tableNumber: number | null;
    sheetType: SheetViewType;
    totalLinesPlayed: number;
    shiftId?: string;
    shiftName?: string;
    shiftDate?: string;
    shiftStartTime?: string;
    shiftEndTime?: string;
    updatedAt: FieldValue;
    playerSummarySnapshot?: PlayerSummarySnapshotItem[];
    sequenceSnapshot?: GameSequenceSnapshot;
    sheet75Snapshot?: BingoSheetData;
    sheet90Snapshot?: Traditional90SheetData;
  }

  const firestorePayload: FirestoreGamePayload = {
    id: docId,
    round: validRound,
    ballNumber: normalizedItem.ballNumber || 0,
    ternaBall: normalizedItem.ternaBall ?? null,
    ternaLeader: normalizedItem.ternaLeader ?? null,
    amboBall: normalizedItem.amboBall ?? null,
    amboLeader: normalizedItem.amboLeader ?? null,
    letter: normalizedItem.letter || '',
    mode,
    timestamp: exactTimestamp,
    dateFormatted: formattedDate,
    dailyDate,
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
    sheetType: normalizedItem.sheetType || (mode === '90' ? 'traditional-90' : 'multipliers-15'),
    totalLinesPlayed: exactLines,
    shiftId: normalizedItem.shiftId || '',
    shiftName: normalizedItem.shiftName || '',
    shiftDate: normalizedItem.shiftDate || dailyDate,
    shiftStartTime: normalizedItem.shiftStartTime || '',
    shiftEndTime: normalizedItem.shiftEndTime || '',
    updatedAt: serverTimestamp(),
  };

  if (normalizedItem.playerSummarySnapshot && Array.isArray(normalizedItem.playerSummarySnapshot)) {
    firestorePayload.playerSummarySnapshot = JSON.parse(JSON.stringify(normalizedItem.playerSummarySnapshot));
  }
  if (normalizedItem.sequenceSnapshot) {
    firestorePayload.sequenceSnapshot = JSON.parse(JSON.stringify(normalizedItem.sequenceSnapshot));
  }
  if (normalizedItem.sheet75Snapshot) {
    const s75Copy: BingoSheetData = JSON.parse(JSON.stringify(normalizedItem.sheet75Snapshot));
    if (normalizedItem.playerSummarySnapshot && (!s75Copy.playerSummaryList || s75Copy.playerSummaryList.length === 0)) {
      s75Copy.playerSummaryList = normalizedItem.playerSummarySnapshot;
    }
    firestorePayload.sheet75Snapshot = s75Copy;
  }
  if (normalizedItem.sheet90Snapshot) {
    firestorePayload.sheet90Snapshot = JSON.parse(JSON.stringify(normalizedItem.sheet90Snapshot));
  }

  // 3. Atomic Firestore write with immediate getDoc verification and up to 3 automatic retries
  const docRef = doc(db, 'saved_games', docId);
  const maxRetries = 3;
  let verified = false;
  let verifiedItem: GameSequenceItem = normalizedItem;
  const sanitizedPayload = sanitizeForFirestore(firestorePayload);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await setDoc(docRef, sanitizedPayload, { merge: true });

      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const remoteData = snap.data() as GameSequenceItem;
        if (
          remoteData &&
          (remoteData.id === docId || snap.id === docId) &&
          remoteData.dailyDate === dailyDate &&
          remoteData.round === validRound
        ) {
          verified = true;
          verifiedItem = {
            ...normalizedItem,
            ...remoteData,
            id: docId,
            dailyDate,
            subfolderDay,
            operatorFolder,
            folderPath,
            timestamp: exactTimestamp,
          };
          console.log(
            `[SAVE_GAME] ID: ${docId}, dailyDate: ${dailyDate}, path: ${folderPath}, time: ${exactTimestamp}, result: SUCCESS, verified: TRUE`
          );
          break;
        }
      }
      console.warn(`[SAVE_GAME] Readback check failed on attempt ${attempt} for ID: ${docId}`);
    } catch (err) {
      console.warn(`[SAVE_GAME] Write attempt ${attempt} failed for ID: ${docId}`, err);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  if (!verified) {
    console.error(
      `[SAVE_GAME] ID: ${docId}, dailyDate: ${dailyDate}, path: ${folderPath}, time: ${exactTimestamp}, result: FAILED, verified: FALSE`
    );
    throw new Error(`Error: No se pudo verificar la persistencia de la partida ${docId} en Firestore tras 3 intentos.`);
  }

  // Clean up any legacy duplicate IDs for the same round/date/operator
  if (duplicateIdsToClean.length > 0) {
    for (const dupId of duplicateIdsToClean) {
      firestoreGamesMemoryStore.delete(dupId);
      deleteDoc(doc(db, 'saved_games', dupId)).catch(() => {});
    }
  }

  // 4. Update authoritative memory store, temporary cache, and notify UI with confirmed Firestore data
  saveGameToGalleryCache(verifiedItem);

  return { success: true, verified: true, game: verifiedItem };
}

/**
 * Centralized game update method (updates an existing game in Firestore and verifies persistence).
 */
export async function updateGameUnified(
  item: GameSequenceItem
): Promise<{ success: boolean; verified: boolean; game: GameSequenceItem }> {
  return saveGameUnified(item);
}

/**
 * Updates the authoritative memory store + temporary cache and notifies UI components immediately.
 */
export function saveGameToGalleryCache(normalizedItem: GameSequenceItem): void {
  if (!normalizedItem) return;
  const { normalizedGame } = normalizeGameFolderMetadata(normalizedItem, normalizedItem.id);
  firestoreGamesMemoryStore.set(normalizedGame.id!, normalizedGame);

  const allGames = sortGamesChronologicallyDesc(
    Array.from(firestoreGamesMemoryStore.values())
  );
  syncTemporaryLocalCache(allGames);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('bingo_saved_games_updated', {
        detail: { total: allGames.length, savedItem: normalizedGame },
      })
    );
  }
}

/**
 * Backward compatibility alias for saveGameUnified.
 */
export async function saveGameToFirestoreAndGallery(item: GameSequenceItem): Promise<void> {
  await saveGameUnified(item);
}

/**
 * Permanently deletes a game from Firestore (authoritative source) and updates memory/cache.
 */
export async function deleteGamePermanently(idOrItem: string | GameSequenceItem): Promise<boolean> {
  if (!idOrItem) return false;

  const targetId = typeof idOrItem === 'string' ? idOrItem : idOrItem.id;
  const targetRound = typeof idOrItem === 'object' ? idOrItem.round : undefined;
  const targetTimestamp = typeof idOrItem === 'object' ? idOrItem.timestamp : undefined;
  const targetDate = typeof idOrItem === 'object' ? getGameNormalizedDateKey(idOrItem) : undefined;
  const targetOp =
    typeof idOrItem === 'object'
      ? sanitizeOperatorFolderName(idOrItem.operatorFolder || idOrItem.operatorName)
      : undefined;

  try {
    const current = getSavedGamesGallery();
    const matchingItems = current.filter((g) => {
      if (!g) return false;
      if (targetId && g.id === targetId) return true;
      if (
        targetRound !== undefined &&
        targetDate &&
        targetOp &&
        g.round === targetRound &&
        getGameNormalizedDateKey(g) === targetDate &&
        sanitizeOperatorFolderName(g.operatorFolder || g.operatorName) === targetOp
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

    for (const docId of idsToDelete) {
      await deleteDoc(doc(db, 'saved_games', docId));
      firestoreGamesMemoryStore.delete(docId);
    }

    const remaining = sortGamesChronologicallyDesc(
      Array.from(firestoreGamesMemoryStore.values())
    );
    syncTemporaryLocalCache(remaining);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: remaining.length, deletedId: targetId },
        })
      );
    }

    return true;
  } catch (e) {
    console.error('Error deleting game from Firestore:', e);
    return false;
  }
}

/**
 * Permanently deletes all games of a specific operator on a specific dailyDate (YYYY-MM-DD)
 * directly from Firestore without affecting any other day's or other operator's games.
 */
export async function deleteGamesOfDay(
  operatorName: string,
  dateKey: string
): Promise<number> {
  try {
    const safeOp = sanitizeOperatorFolderName(operatorName);
    const opTrimmed = operatorName.trim().toLowerCase();
    const idsToDelete = new Set<string>();

    // 1. Collect matching IDs from memory store
    for (const [docId, g] of firestoreGamesMemoryStore.entries()) {
      const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gOp);
      const gDate = getGameNormalizedDateKey(g);
      if ((gOp === opTrimmed || gFolder === safeOp) && gDate === dateKey) {
        idsToDelete.add(docId);
      }
    }

    // 2. Also check Firestore directly to guarantee zero orphaned documents
    const snap = await getDocs(collection(db, 'saved_games'));
    snap.forEach((docSnap) => {
      const g = docSnap.data() as GameSequenceItem;
      const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gOp);
      const gDate = getGameNormalizedDateKey(g);
      if ((gOp === opTrimmed || gFolder === safeOp) && gDate === dateKey) {
        idsToDelete.add(docSnap.id);
      }
    });

    for (const docId of idsToDelete) {
      await deleteDoc(doc(db, 'saved_games', docId));
      firestoreGamesMemoryStore.delete(docId);
    }

    const remaining = sortGamesChronologicallyDesc(
      Array.from(firestoreGamesMemoryStore.values())
    );
    syncTemporaryLocalCache(remaining);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: remaining.length, deletedCount: idsToDelete.size },
        })
      );
    }

    return idsToDelete.size;
  } catch (e) {
    console.error('Error deleting games of day from Firestore:', e);
    return 0;
  }
}

/**
 * Permanently deletes all games belonging to an operator's folder directly from Firestore.
 */
export async function deleteGamesOfOperatorFolder(operatorName: string): Promise<number> {
  try {
    const safeOp = sanitizeOperatorFolderName(operatorName);
    const opTrimmed = operatorName.trim().toLowerCase();
    const idsToDelete = new Set<string>();

    for (const [docId, g] of firestoreGamesMemoryStore.entries()) {
      const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gOp);
      if (gOp === opTrimmed || gFolder === safeOp) {
        idsToDelete.add(docId);
      }
    }

    const snap = await getDocs(collection(db, 'saved_games'));
    snap.forEach((docSnap) => {
      const g = docSnap.data() as GameSequenceItem;
      const gOp = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gOp);
      if (gOp === opTrimmed || gFolder === safeOp) {
        idsToDelete.add(docSnap.id);
      }
    });

    for (const docId of idsToDelete) {
      await deleteDoc(doc(db, 'saved_games', docId));
      firestoreGamesMemoryStore.delete(docId);
    }

    const remaining = sortGamesChronologicallyDesc(
      Array.from(firestoreGamesMemoryStore.values())
    );
    syncTemporaryLocalCache(remaining);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: remaining.length, deletedCount: idsToDelete.size },
        })
      );
    }

    return idsToDelete.size;
  } catch (e) {
    console.error('Error deleting operator folder games from Firestore:', e);
    return 0;
  }
}

/**
 * Clears saved games in Firestore (all or filtered by mode) and synchronizes memory/cache.
 */
export async function clearAllSavedGamesGallery(
  filterMode?: 'all' | '75' | '90'
): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'saved_games'));
    const idsToDelete: string[] = [];

    snap.forEach((docSnap) => {
      const g = docSnap.data() as GameSequenceItem;
      const is90 = g.mode === '90' || g.sheetType === 'traditional-90';
      if (!filterMode || filterMode === 'all') {
        idsToDelete.push(docSnap.id);
      } else if (filterMode === '75' && !is90) {
        idsToDelete.push(docSnap.id);
      } else if (filterMode === '90' && is90) {
        idsToDelete.push(docSnap.id);
      }
    });

    for (const docId of idsToDelete) {
      await deleteDoc(doc(db, 'saved_games', docId));
      firestoreGamesMemoryStore.delete(docId);
    }

    const remaining = sortGamesChronologicallyDesc(
      Array.from(firestoreGamesMemoryStore.values())
    );
    syncTemporaryLocalCache(remaining);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('bingo_saved_games_updated', {
          detail: { total: remaining.length },
        })
      );
    }
  } catch (e) {
    console.error('Error clearing saved games from Firestore:', e);
  }
}
