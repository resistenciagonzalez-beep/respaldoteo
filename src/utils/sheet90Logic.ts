import type { Traditional90Row, Traditional90SheetData, Traditional90Table } from '../types';

/**
 * Reglas de la Planilla 90 (sin pantalla): filas, aciertos y ganadores.
 *
 * Están separadas de la pantalla para poder probarlas automáticamente
 * (ver sheet90Logic.test.ts). Si se cambia algo aquí, las pruebas avisan
 * si una regla del juego dejó de funcionar.
 */

export const ROWS_PER_TABLE_90 = 30;

/** Las 30 filas de una planilla: fila N = [N, N+30, N+60]. */
export function generateDefaultRows90(): Traditional90Row[] {
  return Array.from({ length: ROWS_PER_TABLE_90 }, (_, i) => {
    const rowNum = i + 1;
    return {
      rowNumber: rowNum,
      numbers: [rowNum, rowNum + 30, rowNum + 60],
      playerId: undefined,
      playerName: undefined,
      color: undefined,
      paid: false,
    };
  });
}

/** Planillas abiertas: la lista nueva (`tables`) o, en datos antiguos, `table1` y `table2`. */
export function getTablesList90(
  sheet: Pick<Traditional90SheetData, 'tables' | 'table1' | 'table2'>
): Traditional90Table[] {
  if (sheet.tables && sheet.tables.length > 0) return sheet.tables;
  return [sheet.table1, sheet.table2].filter(Boolean) as Traditional90Table[];
}

/** Números que cuentan como acertados: los sacados por el bolillero + los marcados a mano. */
export function buildHitsSet90(drawnNumbers: Iterable<number>, circledNumbers: Iterable<number>): Set<number> {
  const combined = new Set<number>(drawnNumbers);
  for (const n of circledNumbers) combined.add(n);
  return combined;
}

/** Cuántos de los 3 números de una fila ya salieron, y si la fila hizo bingo (3 de 3). */
export function getRowHits90(numbers: readonly number[], hits: ReadonlySet<number>): { count: number; isBingo: boolean } {
  const count = numbers.filter((n) => hits.has(n)).length;
  return { count, isBingo: count === 3 };
}

export interface WinningRow90 {
  tableNum: number;
  tableTitle: string;
  rowNumber: number;
  numbers: [number, number, number];
  playerName?: string;
}

/** Todas las filas ganadoras (3 de 3) en todas las planillas abiertas, en orden. */
export function findWinningRows90(tables: readonly Traditional90Table[], hits: ReadonlySet<number>): WinningRow90[] {
  const list: WinningRow90[] = [];
  tables.forEach((tbl, tIdx) => {
    const tableNum = tbl.tableNumber || tIdx + 1;
    tbl.rows.forEach((r) => {
      if (getRowHits90(r.numbers, hits).isBingo) {
        list.push({
          tableNum,
          tableTitle: tbl.title || String(tableNum),
          rowNumber: r.rowNumber,
          numbers: r.numbers as [number, number, number],
          playerName: r.playerName,
        });
      }
    });
  });
  return list;
}

/** Clave única de un bingo, para celebrarlo (y detener el bolillero) una sola vez. */
export function winningRowKey90(win: Pick<WinningRow90, 'tableNum' | 'rowNumber' | 'numbers'>): string {
  return `t${win.tableNum}_r${win.rowNumber}_${win.numbers.join('_')}`;
}
