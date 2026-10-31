import { AppUser, BingoMode, GameSequenceItem } from '../types';

/**
 * Detects the operator's current local date formatted as YYYY-MM-DD.
 * Uses local machine calendar time rather than UTC.
 */
export function getCurrentLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Detects the operator's current local time formatted as HH:mm:ss. */
export function getCurrentLocalTimeString(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/** Sanitizes an operator name into a normalized, uniform folder name. */
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

/** Scopes a key to a specific user/operator so their temporary UI state is isolated. */
export function getOperatorStorageKey(baseKey: string, user?: AppUser | null): string {
  if (!user) return baseKey;
  const id = user.id || user.uid || (user.email ? user.email.replace(/[^a-zA-Z0-9_-]/g, '_') : 'anon');
  return `${baseKey}_${id}`;
}

/** Checks whether a saved game belongs to a specific operator or user session. */
export function isGameOfOperator(game: GameSequenceItem, user?: AppUser | null): boolean {
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
  if (game.operatorEmail && opEmail && game.operatorEmail.trim().toLowerCase() === opEmail) return true;
  if (game.operatorName && opName && game.operatorName.trim().toLowerCase() === opName) return true;
  if (!game.operatorUid && !game.operatorEmail && !game.operatorName) return true;
  return false;
}

/** Parses supported date strings into a canonical YYYY-MM-DD key. */
export function parseDateStringToDateKey(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

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

/** Extracts the true authoritative exact date of a game. */
export function extractGameExactDate(game: Partial<GameSequenceItem>): string {
  if (!game) return getCurrentLocalDateKey();

  const fromDaily = parseDateStringToDateKey(game.dailyDate);
  if (fromDaily) return fromDaily;
  const fromFormatted = parseDateStringToDateKey(game.dateFormatted);
  if (fromFormatted) return fromFormatted;
  const fromShift = parseDateStringToDateKey(game.shiftDate);
  if (fromShift) return fromShift;
  const fromSavedAt = parseDateStringToDateKey((game as any).savedAtISO || (game as any).createdAtISO);
  if (fromSavedAt) return fromSavedAt;
  const fromSubfolder = parseDateStringToDateKey(game.subfolderDay);
  if (fromSubfolder) return fromSubfolder;

  if (game.folderPath) {
    const parts = game.folderPath.split('/');
    const lastPart = parts[parts.length - 1]?.trim();
    const fromPath = parseDateStringToDateKey(lastPart);
    if (fromPath) return fromPath;
  }
  return getCurrentLocalDateKey();
}

/** Extracts the current subfolder date (if any) where the game is currently located. */
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

/** Extracts a normalized YYYY-MM-DD date key from a game. */
export function getGameNormalizedDateKey(game: GameSequenceItem): string {
  return extractGameExactDate(game);
}

/** Returns an explicit game date without falling back to today's date. */
export function hasExplicitGameDateKey(
  game: Partial<GameSequenceItem> | null | undefined
): string | null {
  if (!game) return null;
  const fromDaily = parseDateStringToDateKey(game.dailyDate);
  if (fromDaily) return fromDaily;
  const fromSubfolder = parseDateStringToDateKey(game.subfolderDay);
  if (fromSubfolder) return fromSubfolder;

  if (game.folderPath && typeof game.folderPath === 'string') {
    const parts = game.folderPath.split('/');
    const lastSegment = parts[parts.length - 1];
    const fromFolderPath = parseDateStringToDateKey(lastSegment);
    if (fromFolderPath) return fromFolderPath;
  }
  const fromFormatted = parseDateStringToDateKey(game.dateFormatted);
  if (fromFormatted) return fromFormatted;
  const fromShiftDate = parseDateStringToDateKey(game.shiftDate);
  if (fromShiftDate) return fromShiftDate;

  if (game.id && typeof game.id === 'string') {
    const idDateMatch = game.id.match(/(\d{4}-\d{2}-\d{2})/);
    if (idDateMatch && idDateMatch[1]) return idDateMatch[1];
  }
  return null;
}

/** Deterministic canonical document ID for a game. */
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

/** Normalizes date and operator folder metadata while preserving the existing game fields. */
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

  let dateFormatted = data.dateFormatted;
  if (!dateFormatted || !parseDateStringToDateKey(dateFormatted)) {
    const parts = exactDate.split('-');
    if (parts.length === 3) dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
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

/** Sorts games by descending date and then descending round. */
export function sortGamesChronologicallyDesc(games: GameSequenceItem[]): GameSequenceItem[] {
  return [...games].sort((a, b) => {
    const dateA = getGameNormalizedDateKey(a);
    const dateB = getGameNormalizedDateKey(b);
    if (dateB !== dateA) return dateB.localeCompare(dateA);
    return (b.round || 0) - (a.round || 0);
  });
}

/** Calculates the exact lines played for a given game snapshot. */
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
