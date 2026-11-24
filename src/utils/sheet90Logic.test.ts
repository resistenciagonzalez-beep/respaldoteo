import { describe, expect, test } from 'bun:test';
import {
  buildHitsSet90,
  findWinningRows90,
  generateDefaultRows90,
  getRowHits90,
  getTablesList90,
  winningRowKey90,
} from './sheet90Logic';
import type { Traditional90Table } from '../types';

function makeTable(tableNumber: number, title = String(tableNumber)): Traditional90Table {
  return { tableNumber, title, pricePerRow: 1, rows: generateDefaultRows90() };
}

describe('Planilla 90: filas', () => {
  test('tiene 30 filas y la fila N es [N, N+30, N+60]', () => {
    const rows = generateDefaultRows90();
    expect(rows).toHaveLength(30);
    rows.forEach((r, i) => {
      const n = i + 1;
      expect(r.rowNumber).toBe(n);
      expect(r.numbers).toEqual([n, n + 30, n + 60]);
      expect(r.paid).toBe(false);
      expect(r.playerName).toBeUndefined();
    });
  });

  test('entre las 30 filas aparecen los 90 números una sola vez', () => {
    const all = generateDefaultRows90().flatMap((r) => r.numbers);
    expect(new Set(all).size).toBe(90);
    expect(Math.min(...all)).toBe(1);
    expect(Math.max(...all)).toBe(90);
  });
});

describe('Planilla 90: planillas abiertas', () => {
  test('usa la lista nueva de planillas si existe', () => {
    const t1 = makeTable(1);
    const t3 = makeTable(3);
    expect(getTablesList90({ tables: [t1, t3], table1: makeTable(9), table2: makeTable(8) })).toEqual([t1, t3]);
  });

  test('con datos antiguos usa table1 y table2', () => {
    const t1 = makeTable(1);
    const t2 = makeTable(2);
    expect(getTablesList90({ tables: [], table1: t1, table2: t2 })).toEqual([t1, t2]);
  });
});

describe('Planilla 90: aciertos', () => {
  test('cuenta bolillero + marcados a mano, sin duplicar', () => {
    const hits = buildHitsSet90([5, 35], [65, 5]);
    expect([...hits].sort((a, b) => a - b)).toEqual([5, 35, 65]);
  });

  test('una fila con 2 de 3 no es bingo; con 3 de 3 sí', () => {
    expect(getRowHits90([1, 31, 61], new Set([1, 31]))).toEqual({ count: 2, isBingo: false });
    expect(getRowHits90([1, 31, 61], new Set([1, 31, 61]))).toEqual({ count: 3, isBingo: true });
    expect(getRowHits90([1, 31, 61], new Set())).toEqual({ count: 0, isBingo: false });
  });
});

describe('Planilla 90: ganadores', () => {
  test('sin bingo no hay ganadores', () => {
    expect(findWinningRows90([makeTable(1)], new Set([1, 2, 3, 31, 32]))).toEqual([]);
  });

  test('encuentra la fila ganadora con su jugador', () => {
    const t = makeTable(1);
    t.rows[6] = { ...t.rows[6], playerName: 'Ana' }; // fila 7 = [7, 37, 67]
    const wins = findWinningRows90([t], new Set([7, 37, 67, 10]));
    expect(wins).toEqual([{ tableNum: 1, tableTitle: '1', rowNumber: 7, numbers: [7, 37, 67], playerName: 'Ana' }]);
  });

  test('la misma fila gana en todas las planillas abiertas', () => {
    const wins = findWinningRows90([makeTable(1), makeTable(2, 'Tarde')], new Set([12, 42, 72]));
    expect(wins.map((w) => [w.tableNum, w.tableTitle, w.rowNumber])).toEqual([
      [1, '1', 12],
      [2, 'Tarde', 12],
    ]);
  });

  test('si la planilla no tiene número, usa su posición', () => {
    const t = { ...makeTable(1), tableNumber: 0, title: '' };
    const wins = findWinningRows90([makeTable(1), t], new Set([1, 31, 61]));
    expect(wins.map((w) => [w.tableNum, w.tableTitle])).toEqual([
      [1, '1'],
      [2, '2'],
    ]);
  });

  test('la clave del bingo es estable para celebrarlo una sola vez', () => {
    expect(winningRowKey90({ tableNum: 2, rowNumber: 7, numbers: [7, 37, 67] })).toBe('t2_r7_7_37_67');
  });
});
