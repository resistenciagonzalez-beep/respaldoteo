import {
  BingoSheetData,
  Traditional90SheetData,
  GameSequenceItem,
  SheetViewType,
  BingoMode,
  AppUser,
  PlayerSummarySnapshotItem,
  GameSequenceSnapshot,
} from '../types';
import { getBingo75Letter } from './ballColors';
import { safeSetItem } from './safeStorage';
import {
  getOperatorStorageKey,
  isGameOfOperator,
  getCurrentLocalDateKey,
  getCurrentLocalTimeString,
  getSavedGamesGallery,
  sanitizeOperatorFolderName,
  buildCanonicalGameId,
} from './savedGamesStorage';

export const STORAGE_KEY_SHEET_75 = 'bingo_custom_sheet_data_v5';
export const STORAGE_KEY_SHEET_90 = 'bingo_traditional_90_sheet_v1';
export const STORAGE_KEY_PREVIOUS_SHEET_75 = 'bingo_previous_sheet_75_archive';
export const STORAGE_KEY_PREVIOUS_SHEET_90 = 'bingo_previous_sheet_90_archive';

let memoryPreviousSheet75: BingoSheetData | null = null;
let memoryPreviousSheet90: Traditional90SheetData | null = null;

/**
 * Persist previous game 75-multiplier sheet for the "Mismos" auto-restore feature
 */
export function savePreviousGameSheet75(sheet: BingoSheetData, user?: AppUser | null): void {
  if (!sheet) return;
  memoryPreviousSheet75 = JSON.parse(JSON.stringify(sheet));
  if (typeof window === 'undefined') return;
  try {
    safeSetItem(STORAGE_KEY_PREVIOUS_SHEET_75, JSON.stringify(sheet));
    if (user) {
      const opKey = getOperatorStorageKey(STORAGE_KEY_PREVIOUS_SHEET_75, user);
      safeSetItem(opKey, JSON.stringify(sheet));
    }
  } catch (e) {
    console.error('Error caching previous sheet75', e);
  }
}

/**
 * Persist previous game 90-traditional sheet for the "Mismos" auto-restore feature
 */
export function savePreviousGameSheet90(sheet: Traditional90SheetData, user?: AppUser | null): void {
  if (!sheet) return;
  memoryPreviousSheet90 = JSON.parse(JSON.stringify(sheet));
  if (typeof window === 'undefined') return;
  try {
    safeSetItem(STORAGE_KEY_PREVIOUS_SHEET_90, JSON.stringify(sheet));
    if (user) {
      const opKey = getOperatorStorageKey(STORAGE_KEY_PREVIOUS_SHEET_90, user);
      safeSetItem(opKey, JSON.stringify(sheet));
    }
  } catch (e) {
    console.error('Error caching previous sheet90', e);
  }
}

/**
 * Checks whether a 75-ball multiplier sheet has any active assigned player cells
 */
export function hasAssignedCells75(sheet?: BingoSheetData | null): boolean {
  if (!sheet || !Array.isArray(sheet.columns)) return false;
  return sheet.columns.some((col) =>
    Array.isArray(col.cells) && col.cells.some((c) => Boolean(c.playerId || (c.playerName && c.playerName.trim())))
  );
}

/**
 * Checks whether a 90-ball traditional sheet has any active assigned player rows
 */
export function hasAssignedRows90(sheet?: Traditional90SheetData | null): boolean {
  if (!sheet) return false;
  const allTables = sheet.tables && sheet.tables.length > 0 ? sheet.tables : [sheet.table1, sheet.table2].filter(Boolean);
  return allTables.some((tbl) =>
    tbl && Array.isArray(tbl.rows) && tbl.rows.some((r) => Boolean(r.playerId || (r.playerName && r.playerName.trim())))
  );
}

/**
 * Get previous game 75-multiplier sheet from Firestore-backed gallery or in-session snapshot
 */
export function getPreviousGameSheet75(user?: AppUser | null): BingoSheetData | null {
  try {
    let candidateFallback: BingoSheetData | null = null;

    // 1. Check authoritative Firestore-backed saved games gallery first
    const gallery = getSavedGamesGallery();
    if (user) {
      for (const g of gallery) {
        if (isGameOfOperator(g, user) && g.sheet75Snapshot && hasAssignedCells75(g.sheet75Snapshot)) {
          return g.sheet75Snapshot;
        }
      }
    }
    for (const g of gallery) {
      if (g.sheet75Snapshot && hasAssignedCells75(g.sheet75Snapshot)) {
        return g.sheet75Snapshot;
      }
    }

    // 2. Check in-memory previous sheet snapshot
    if (memoryPreviousSheet75 && Array.isArray(memoryPreviousSheet75.columns)) {
      if (hasAssignedCells75(memoryPreviousSheet75)) return memoryPreviousSheet75;
      candidateFallback = memoryPreviousSheet75;
    }

    // 3. Temporary cache fallback
    if (typeof window !== 'undefined') {
      if (user) {
        const opKey = getOperatorStorageKey(STORAGE_KEY_PREVIOUS_SHEET_75, user);
        const opRaw = localStorage.getItem(opKey);
        if (opRaw) {
          const parsed: BingoSheetData = JSON.parse(opRaw);
          if (parsed && Array.isArray(parsed.columns)) {
            if (hasAssignedCells75(parsed)) return parsed;
            if (!candidateFallback) candidateFallback = parsed;
          }
        }
      }

      const raw = localStorage.getItem(STORAGE_KEY_PREVIOUS_SHEET_75);
      if (raw) {
        const parsed: BingoSheetData = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.columns)) {
          if (hasAssignedCells75(parsed)) return parsed;
          if (!candidateFallback) candidateFallback = parsed;
        }
      }
    }

    if (candidateFallback) return candidateFallback;
  } catch (e) {
    console.error('Error reading previous sheet75', e);
  }
  return null;
}

/**
 * Get previous game 90-traditional sheet from Firestore-backed gallery or in-session snapshot
 */
export function getPreviousGameSheet90(user?: AppUser | null): Traditional90SheetData | null {
  try {
    let candidateFallback: Traditional90SheetData | null = null;

    // 1. Check authoritative Firestore-backed saved games gallery first
    const gallery = getSavedGamesGallery();
    if (user) {
      for (const g of gallery) {
        if (isGameOfOperator(g, user) && g.sheet90Snapshot && hasAssignedRows90(g.sheet90Snapshot)) {
          return g.sheet90Snapshot;
        }
      }
    }
    for (const g of gallery) {
      if (g.sheet90Snapshot && hasAssignedRows90(g.sheet90Snapshot)) {
        return g.sheet90Snapshot;
      }
    }

    // 2. Check in-memory previous sheet snapshot
    if (memoryPreviousSheet90 && (memoryPreviousSheet90.table1 || memoryPreviousSheet90.tables)) {
      if (hasAssignedRows90(memoryPreviousSheet90)) return memoryPreviousSheet90;
      candidateFallback = memoryPreviousSheet90;
    }

    // 3. Temporary cache fallback
    if (typeof window !== 'undefined') {
      if (user) {
        const opKey = getOperatorStorageKey(STORAGE_KEY_PREVIOUS_SHEET_90, user);
        const opRaw = localStorage.getItem(opKey);
        if (opRaw) {
          const parsed = JSON.parse(opRaw);
          if (parsed && (parsed.table1 || parsed.tables)) {
            if (hasAssignedRows90(parsed)) return parsed;
            if (!candidateFallback) candidateFallback = parsed;
          }
        }
      }

      const raw = localStorage.getItem(STORAGE_KEY_PREVIOUS_SHEET_90);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.table1 || parsed.tables)) {
          if (hasAssignedRows90(parsed)) return parsed;
          if (!candidateFallback) candidateFallback = parsed;
        }
      }
    }

    if (candidateFallback) return candidateFallback;
  } catch (e) {
    console.error('Error reading previous sheet90', e);
  }
  return null;
}

/**
 * Find all rows in the previous game that belonged to a given player in 90 Traditional.
 * Searches authoritative Firestore-backed saved games gallery and in-session snapshot.
 */
export function getPreviousPlayerRows90(
  playerId: string,
  playerName?: string,
  user?: AppUser | null
): { table: number; rowIndex: number; rowNumber: number; paid?: boolean }[] {
  const targetName = playerName?.toLowerCase().trim();
  const found: { table: number; rowIndex: number; rowNumber: number; paid?: boolean }[] = [];

  const extractRows = (sheet?: Traditional90SheetData | null): boolean => {
    if (!sheet) return false;
    const allTables =
      sheet.tables && sheet.tables.length > 0
        ? sheet.tables
        : [sheet.table1, sheet.table2].filter(Boolean);
    let anyFound = false;
    allTables.forEach((table, tIdx) => {
      if (table && Array.isArray(table.rows)) {
        const tblNum = table.tableNumber || tIdx + 1;
        table.rows.forEach((row, rIdx) => {
          const matchesId = row.playerId && row.playerId === playerId;
          const matchesName =
            targetName && row.playerName && row.playerName.toLowerCase().trim() === targetName;
          if (matchesId || matchesName) {
            anyFound = true;
            found.push({
              table: tblNum,
              rowIndex: rIdx,
              rowNumber: row.rowNumber || rIdx + 1,
              paid: row.paid,
            });
          }
        });
      }
    });
    return anyFound;
  };

  // 1. Try primary sheet
  const prevSheet = getPreviousGameSheet90(user);
  if (extractRows(prevSheet)) {
    return found;
  }

  // 2. Deep search in authoritative Firestore-backed saved games gallery
  const gallery = getSavedGamesGallery();
  if (user) {
    for (const g of gallery) {
      if (!isGameOfOperator(g, user)) continue;
      if (g.sheet90Snapshot && extractRows(g.sheet90Snapshot)) {
        return found;
      }
    }
  }
  for (const g of gallery) {
    if (g.sheet90Snapshot && extractRows(g.sheet90Snapshot)) {
      return found;
    }
  }

  return found;
}

/**
 * Format duration in seconds to "Xm Ys" or "X min"
 */
export function formatGameDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m 30s';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

/**
 * Create a pristine default 75-ball multipliers sheet
 */
export function createDefaultSheet75(): BingoSheetData {
  const defaultCols = [
    { id: 'col-1', colNumber: 1, title: 'X1', multiplier: 1, columnPrice: 0.10, columnPrize: 1.35, cells: [] },
    { id: 'col-2', colNumber: 2, title: 'X1', multiplier: 1, columnPrice: 0.10, columnPrize: 1.35, cells: [] },
    { id: 'col-3', colNumber: 3, title: 'X1', multiplier: 1, columnPrice: 0.10, columnPrize: 1.35, cells: [] },
    { id: 'col-4', colNumber: 4, title: 'X2', multiplier: 2, columnPrice: 0.20, columnPrize: 2.70, cells: [] },
    { id: 'col-5', colNumber: 5, title: 'X2', multiplier: 2, columnPrice: 0.20, columnPrize: 2.70, cells: [] },
    { id: 'col-6', colNumber: 6, title: 'X3', multiplier: 3, columnPrice: 0.30, columnPrize: 4.05, cells: [] },
    { id: 'col-7', colNumber: 7, title: 'X3', multiplier: 3, columnPrice: 0.30, columnPrize: 4.05, cells: [] },
    { id: 'col-8', colNumber: 8, title: 'X4', multiplier: 4, columnPrice: 0.40, columnPrize: 5.40, cells: [] },
    { id: 'col-9', colNumber: 9, title: 'X4', multiplier: 4, columnPrice: 0.40, columnPrize: 5.40, cells: [] },
    { id: 'col-10', colNumber: 10, title: 'X5', multiplier: 5, columnPrice: 0.50, columnPrize: 6.75, cells: [] },
  ];
  return {
    title: 'PLANILLA OFICIAL',
    subtitle: 'Ronda de Juego por Columnas y Multiplicadores',
    hostName: 'Operadora de Turno',
    hostPhone: '',
    columnPrice: 0.10,
    baseCost: 0.10,
    basePrize: 1.35,
    rowMultipliers: {},
    currency: '$',
    totalRows: 15,
    columns: defaultCols.map((c) => ({
      ...c,
      cells: Array.from({ length: 15 }, (_, i) => ({ rowNumber: i + 1 })),
    })),
    players: [],
  };
}

/**
 * Create a pristine default 90-ball traditional sheet
 */
export function createDefaultSheet90(): Traditional90SheetData {
  const makeTable = (num: number) => ({
    tableNumber: num,
    title: `Planilla ${num}`,
    pricePerRow: 1.0,
    prize: 25.0,
    rows: Array.from({ length: 30 }, (_, i) => ({
      rowNumber: i + 1,
      numbers: [i + 1, i + 31, i + 61] as [number, number, number],
      paid: false,
    })),
  });
  const t1 = makeTable(1);
  const t2 = makeTable(2);
  return {
    hostName: 'Operadora de Turno',
    hostPhone: '',
    dateStr: new Date().toLocaleDateString('es-ES'),
    pricePerRow: 1.0,
    tables: [t1, t2],
    table1: t1,
    table2: t2,
    players: [],
  };
}

/**
 * Read current 75-ball multiplier sheet snapshot from temporary localStorage cache
 */
export function getStoredSheet75Snapshot(): BingoSheetData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHEET_75);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.columns) && parsed.columns.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading sheet75 snapshot', e);
  }
  return null;
}

/**
 * Read current 90-ball traditional sheet snapshot from temporary localStorage cache
 */
export function getStoredSheet90Snapshot(): Traditional90SheetData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHEET_90);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.table1 || parsed.tables)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading sheet90 snapshot', e);
  }
  return null;
}

/**
 * Calculate financials for 75-ball multipliers sheet
 */
export function calculateSheet75Financials(
  sheet: BingoSheetData | null,
  winningRow?: number,
  ternaRow?: number,
  amboRow?: number
): { totalCollected: number; totalPrizesPaid: number; netProfit: number } {
  if (!sheet) {
    return { totalCollected: 0, totalPrizesPaid: 0, netProfit: 0 };
  }

  let totalCollected = 0;
  const baseCost = sheet.baseCost ?? 0.10;
  const basePrize = sheet.basePrize ?? 1.35;
  const baseTernaPrize = sheet.baseTernaPrize ?? 0.50;
  const baseAmboPrize = sheet.baseAmboPrize ?? 0.25;

  sheet.columns.forEach((col) => {
    const mult = col.multiplier || 1;
    const cellCost = col.columnPrice !== undefined ? col.columnPrice : mult * baseCost;

    col.cells.forEach((cell) => {
      if (cell.playerId || cell.playerName) {
        totalCollected += cellCost;
      }
    });
  });

  let totalPrizesPaid = 0;

  if (sheet.bingoEnabled !== false && winningRow && winningRow >= 1 && winningRow <= (sheet.totalRows || 15)) {
    sheet.columns.forEach((col) => {
      const mult = col.multiplier || 1;
      const cell = col.cells.find((c) => c.rowNumber === winningRow);
      if (cell && (cell.playerId || cell.playerName)) {
        const prize = col.columnPrize !== undefined ? col.columnPrize : mult * basePrize;
        totalPrizesPaid += prize;
      }
    });
  }

  if (sheet.ternaEnabled && ternaRow && ternaRow >= 1 && ternaRow <= (sheet.totalRows || 15)) {
    sheet.columns.forEach((col) => {
      const mult = col.multiplier || 1;
      const cell = col.cells.find((c) => c.rowNumber === ternaRow);
      if (cell && (cell.playerId || cell.playerName)) {
        const prize = col.columnTernaPrize !== undefined ? col.columnTernaPrize : mult * baseTernaPrize;
        totalPrizesPaid += prize;
      }
    });
  }

  if (sheet.amboEnabled && amboRow && amboRow >= 1 && amboRow <= (sheet.totalRows || 15)) {
    sheet.columns.forEach((col) => {
      const mult = col.multiplier || 1;
      const cell = col.cells.find((c) => c.rowNumber === amboRow);
      if (cell && (cell.playerId || cell.playerName)) {
        const prize = col.columnAmboPrize !== undefined ? col.columnAmboPrize : mult * baseAmboPrize;
        totalPrizesPaid += prize;
      }
    });
  }

  const netProfit = totalCollected - totalPrizesPaid;
  return {
    totalCollected: Math.round(totalCollected * 100) / 100,
    totalPrizesPaid: Math.round(totalPrizesPaid * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
  };
}

/**
 * Calculate financials for 90-ball traditional sheet
 */
export function calculateSheet90Financials(
  sheet: Traditional90SheetData | null,
  tableWon?: number
): { totalCollected: number; totalPrizesPaid: number; netProfit: number } {
  if (!sheet) {
    return { totalCollected: 0, totalPrizesPaid: 0, netProfit: 0 };
  }

  const allTables =
    sheet.tables && sheet.tables.length > 0
      ? sheet.tables
      : [sheet.table1, sheet.table2].filter(Boolean);

  let totalCollected = 0;
  let totalPrizesPaid = 0;

  allTables.forEach((tbl, idx) => {
    const tblNum = tbl.tableNumber || idx + 1;
    const price = tbl.pricePerRow || sheet.pricePerRow || 1.0;
    const filled = tbl.rows.filter((r) => r.playerId || r.playerName).length;
    totalCollected += filled * price;

    if (tableWon !== undefined) {
      if (tblNum === tableWon) {
        totalPrizesPaid += tbl.prize || 25.0;
      }
    } else {
      totalPrizesPaid += tbl.prize || 25.0;
    }
  });

  if (totalPrizesPaid === 0) {
    totalPrizesPaid = 25.0;
  }

  const netProfit = totalCollected - totalPrizesPaid;
  return {
    totalCollected: Math.round(totalCollected * 100) / 100,
    totalPrizesPaid: Math.round(totalPrizesPaid * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
  };
}

/**
 * Factory to build a complete GameSequenceItem with deterministic ID, dailyDate subfolder, snapshot & financials
 */
export function buildCompleteGameSequenceItem(params: {
  round: number;
  ballNumber: number;
  ternaBall?: number;
  ternaLeader?: number;
  amboBall?: number;
  amboLeader?: number;
  letter?: string;
  rowLeader?: number;
  winningPlayerName?: string;
  tableNumber?: number;
  mode: BingoMode;
  sheetType: SheetViewType;
  durationSeconds: number;
  drawnBallsPlayed: number[];
  sheet75Override?: BingoSheetData | null;
  sheet90Override?: Traditional90SheetData | null;
  customCollected?: number;
  customPrizes?: number;
  operatorUid?: string;
  operatorName?: string;
  operatorEmail?: string;
  totalLinesPlayed?: number;
  shiftId?: string;
  shiftName?: string;
  shiftDate?: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
  playerSummarySnapshot?: PlayerSummarySnapshotItem[];
  sequenceSnapshot?: GameSequenceSnapshot;
  dailyDate?: string;
  timestamp?: string;
}): GameSequenceItem {
  const {
    round,
    ballNumber,
    ternaBall,
    ternaLeader,
    amboBall,
    amboLeader,
    letter,
    rowLeader,
    winningPlayerName,
    tableNumber,
    mode,
    sheetType,
    durationSeconds,
    drawnBallsPlayed,
    sheet75Override,
    sheet90Override,
    operatorUid,
    operatorName,
    operatorEmail,
    shiftId,
    shiftName,
    shiftStartTime,
    shiftEndTime,
    playerSummarySnapshot,
    sequenceSnapshot,
    dailyDate: paramDailyDate,
    timestamp: paramTimestamp,
  } = params;

  const resolvedLetter =
    letter || (mode === '75' && typeof ballNumber === 'number' && ballNumber > 0 ? getBingo75Letter(ballNumber) : undefined);

  const now = new Date();
  const timestamp = paramTimestamp || getCurrentLocalTimeString();
  const dateFormatted = now.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const dailyDate = paramDailyDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDailyDate.trim())
    ? paramDailyDate.trim()
    : getCurrentLocalDateKey();
  const cleanOperatorName = (operatorName || 'Operadora Principal').trim();
  const operatorFolder = sanitizeOperatorFolderName(cleanOperatorName);
  const subfolderDay = dailyDate;
  const folderPath = `${operatorFolder}/${subfolderDay}`;

  const durationFormatted = formatGameDuration(durationSeconds);

  let sheet75Snapshot: BingoSheetData | undefined = undefined;
  let sheet90Snapshot: Traditional90SheetData | undefined = undefined;
  let totalCollected = 0;
  let totalPrizesPaid = 0;
  let netProfit = 0;

  if (sheetType === 'multipliers-15' || mode === '75') {
    sheet75Snapshot = sheet75Override || getStoredSheet75Snapshot() || createDefaultSheet75();
    const fin = calculateSheet75Financials(sheet75Snapshot || null, rowLeader, ternaLeader, amboLeader);
    totalCollected = params.customCollected ?? fin.totalCollected;
    totalPrizesPaid = params.customPrizes ?? fin.totalPrizesPaid;
    netProfit = totalCollected - totalPrizesPaid;

    if (playerSummarySnapshot && sheet75Snapshot) {
      sheet75Snapshot.playerSummaryList = playerSummarySnapshot;
    }
    if (sequenceSnapshot?.customSeqEntries && sheet75Snapshot) {
      sheet75Snapshot.customSeqEntries = sequenceSnapshot.customSeqEntries;
    }
  }
  if (sheetType === 'traditional-90' || mode === '90') {
    sheet90Snapshot = sheet90Override || getStoredSheet90Snapshot() || createDefaultSheet90();
    const fin = calculateSheet90Financials(sheet90Snapshot || null, tableNumber);
    totalCollected = params.customCollected ?? fin.totalCollected;
    totalPrizesPaid = params.customPrizes ?? fin.totalPrizesPaid;
    netProfit = totalCollected - totalPrizesPaid;
  }

  let calculatedLines = 0;
  if (params.totalLinesPlayed !== undefined && params.totalLinesPlayed >= 0) {
    calculatedLines = params.totalLinesPlayed;
  } else if (sheet75Snapshot?.columns && sheet75Snapshot.columns.length > 0) {
    calculatedLines = sheet75Snapshot.columns.reduce(
      (sum, col) => sum + (Number(col.multiplier) || 1),
      0
    );
  } else if (sheet90Snapshot) {
    const allTables =
      sheet90Snapshot.tables && sheet90Snapshot.tables.length > 0
        ? sheet90Snapshot.tables
        : [sheet90Snapshot.table1, sheet90Snapshot.table2].filter(Boolean);
    calculatedLines = allTables.length * 30;
  }

  let resolvedSeqSnapshot = sequenceSnapshot;
  if (!resolvedSeqSnapshot && sheet75Snapshot?.customSeqEntries) {
    resolvedSeqSnapshot = {
      customSeqEntries: sheet75Snapshot.customSeqEntries,
      amboRow: amboLeader,
      ternaRow: ternaLeader,
      bingoRow: rowLeader,
      amboBall,
      ternaBall,
      bingoBall: ballNumber,
    };
  }

  const canonicalId = buildCanonicalGameId(operatorFolder, dailyDate, mode, round);

  return {
    id: canonicalId,
    round,
    ballNumber,
    ternaBall,
    ternaLeader,
    amboBall,
    amboLeader,
    letter: resolvedLetter,
    mode,
    timestamp,
    dateFormatted,
    dailyDate,
    subfolderDay,
    operatorFolder,
    folderPath,
    operatorUid: operatorUid || 'anon',
    operatorName: cleanOperatorName,
    operatorEmail: operatorEmail || '',
    durationSeconds,
    durationFormatted,
    totalCollected,
    totalPrizesPaid,
    netProfit,
    currency: '$',
    totalLinesPlayed: calculatedLines,
    drawnBallsPlayed: [...drawnBallsPlayed],
    totalBallsDrawnCount: drawnBallsPlayed.length,
    rowLeader,
    winningPlayerName,
    tableNumber,
    sheetType,
    sheet75Snapshot: sheet75Snapshot ? JSON.parse(JSON.stringify(sheet75Snapshot)) : undefined,
    sheet90Snapshot: sheet90Snapshot ? JSON.parse(JSON.stringify(sheet90Snapshot)) : undefined,
    markedNumbers: [...drawnBallsPlayed],
    shiftId,
    shiftName,
    shiftDate: dailyDate,
    shiftStartTime,
    shiftEndTime,
    playerSummarySnapshot,
    sequenceSnapshot: resolvedSeqSnapshot,
  };
}

/**
 * Dispatch an application event so any open sheet clears its marked numbers
 */
export function dispatchResetSheetMarksEvent(
  keepPlayers: boolean = true,
  keepSequence: boolean = true,
  keepBalances: boolean = true,
  winningRow?: number,
  ternaRow?: number,
  amboRow?: number
) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('bingo_reset_sheet_for_new_game', {
        detail: { keepPlayers, keepSequence, keepBalances, winningRow, ternaRow, amboRow },
      })
    );
  }
}

/**
 * Get the most recent previous game result item from Firestore-backed gallery or in-session snapshot
 */
export function getPreviousGameResultItem(): GameSequenceItem | null {
  try {
    // 1. Primary source: Firestore-backed saved games gallery (ordered most recent first)
    const gallery = getSavedGamesGallery();
    if (gallery.length > 0 && gallery[0]) {
      return gallery[0];
    }

    // 2. Fallback: in-session previous sheet 75 snapshot
    const sheet75 = getPreviousGameSheet75();
    if (sheet75) {
      const fin75 = calculateSheet75Financials(sheet75);
      return {
        ballNumber: 75,
        round: 1,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        dateFormatted: new Date().toLocaleDateString(),
        dailyDate: getCurrentLocalDateKey(),
        sheetType: 'multipliers-15',
        sheet75Snapshot: sheet75,
        totalCollected: fin75.totalCollected,
        totalPrizesPaid: fin75.totalPrizesPaid,
        netProfit: fin75.netProfit,
        totalLinesPlayed: sheet75.columns.reduce(
          (sum, col) => sum + (Number(col.multiplier) || 1),
          0
        ),
        drawnBallsPlayed: [],
        currency: '$',
      };
    }

    // 3. Fallback: in-session previous sheet 90 snapshot
    const sheet90 = getPreviousGameSheet90();
    if (sheet90) {
      const fin90 = calculateSheet90Financials(sheet90);
      return {
        ballNumber: 90,
        round: 1,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        dateFormatted: new Date().toLocaleDateString(),
        dailyDate: getCurrentLocalDateKey(),
        sheetType: 'traditional-90',
        sheet90Snapshot: sheet90,
        totalCollected: fin90.totalCollected,
        totalPrizesPaid: fin90.totalPrizesPaid,
        netProfit: fin90.netProfit,
        totalLinesPlayed: (sheet90.tables || [sheet90.table1, sheet90.table2]).length,
        drawnBallsPlayed: [],
        currency: '$',
      };
    }
  } catch (err) {
    console.error('Error getting previous game result item:', err);
  }
  return null;
}
