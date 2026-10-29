import { Traditional90SheetData } from '../types';

export const TRADITIONAL_90_STORAGE_KEY = 'bingo_traditional_90_sheet_v1';

/**
 * Returns the 3 numbers of a row in the Traditional 90 Sheet (1..30):
 * Row r -> [r, r + 30, r + 60]
 */
export function getTraditional90RowNumbers(rowNumber: number): [number, number, number] {
  return [rowNumber, rowNumber + 30, rowNumber + 60];
}

/**
 * Checks which rows in the Traditional 90 Sheet (1..30) have all 3 numbers drawn.
 */
export function findCompletedTraditional90Rows(drawnSet: Set<number>): number[] {
  const completed: number[] = [];
  for (let r = 1; r <= 30; r++) {
    if (drawnSet.has(r) && drawnSet.has(r + 30) && drawnSet.has(r + 60)) {
      completed.push(r);
    }
  }
  return completed;
}

/**
 * Reads assigned player names for rowNumber from saved traditional sheet data.
 */
export function getTraditional90RowWinners(rowNumber: number): {
  playerNames: string;
  table1Player?: string;
  table2Player?: string;
} {
  try {
    if (typeof window === 'undefined') return { playerNames: '' };
    const saved = localStorage.getItem(TRADITIONAL_90_STORAGE_KEY);
    if (saved) {
      const parsed: Traditional90SheetData = JSON.parse(saved);
      const t1 = parsed.table1?.rows?.find((r) => r.rowNumber === rowNumber)?.playerName?.trim();
      const t2 = parsed.table2?.rows?.find((r) => r.rowNumber === rowNumber)?.playerName?.trim();
      const winners: string[] = [];
      if (t1) winners.push(`Tabla 1: ${t1}`);
      if (t2) winners.push(`Tabla 2: ${t2}`);
      return {
        playerNames: winners.join(' • '),
        table1Player: t1,
        table2Player: t2,
      };
    }
  } catch (e) {
    console.warn('Error reading traditional 90 winners', e);
  }
  return { playerNames: '' };
}
