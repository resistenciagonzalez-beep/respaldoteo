import { describe, expect, test } from 'bun:test';
import type { BingoSheetData } from '../types';
import {
  calculatePlanilla90Financials,
  clearPlanilla90Cells,
  deriveSequenceFromMarks,
  togglePlanilla90Mark,
  createDefaultPlanilla90,
  getFirstCompletedRow,
  getFirstEmptySeqSlot,
  getMultiplierLabel,
  getNextMultiplier,
  getPlanilla90Lines,
  getPlanilla90Summaries,
  getPlanilla90TypedBalls,
  getPlanilla90WinningRows,
  getRowFromBall,
  getRowNumbers,
  isPlanilla90Snapshot,
  normalizePlanilla90,
} from './planilla90Rules';

function sheetWith(assign: { col: number; row: number; name: string; paid?: boolean }[]): BingoSheetData {
  const s = createDefaultPlanilla90(); // columnas: DOBLE, SOLO, SOLO, SOLO, SOLO, SOLO
  assign.forEach(({ col, row, name, paid }) => {
    s.columns[col].cells[row - 1] = { rowNumber: row, playerId: name, playerName: name, color: '#fff', isPaid: paid };
  });
  return s;
}

const noBalances = { won: {}, debt: {}, offsets: {} };

describe('planilla 90: filas y nombres', () => {
  test('cada bola cae en su fila de 1 a 30', () => {
    expect(getRowFromBall(1)).toBe(1);
    expect(getRowFromBall(31)).toBe(1);
    expect(getRowFromBall(61)).toBe(1);
    expect(getRowFromBall(30)).toBe(30);
    expect(getRowFromBall(90)).toBe(30);
    expect(getRowFromBall('45')).toBe(15);
    expect(getRowFromBall(0)).toBeNull();
    expect(getRowFromBall(91)).toBeNull();
    expect(getRowFromBall('')).toBeNull();
  });

  test('la fila muestra sus tres números', () => {
    expect(getRowNumbers(1)).toEqual([1, 31, 61]);
    expect(getRowNumbers(30)).toEqual([30, 60, 90]);
  });

  test('fila de bingo según el orden de las bolas', () => {
    expect(getFirstCompletedRow([{ number: 1 }, { number: 2 }, { number: 31 }, { number: 32 }, { number: 62 }, { number: 61 }])).toBe(2);
    expect(getFirstCompletedRow([{ number: 1 }, { number: 31 }])).toBeNull();
  });

  test('multiplicadores en texto y su ciclo', () => {
    expect([1, 2, 3, 4, 5].map(getMultiplierLabel)).toEqual(['SOLO', 'DOBLE', 'TRIPLE', 'CUARTA', 'QUINTA']);
    expect(getNextMultiplier(1)).toBe(2);
    expect(getNextMultiplier(5)).toBe(1);
  });
});

describe('planilla 90: datos guardados', () => {
  test('la planilla nueva se reconoce y la vieja no', () => {
    expect(isPlanilla90Snapshot(createDefaultPlanilla90())).toBe(true);
    expect(isPlanilla90Snapshot({ columns: [] })).toBe(false);
    expect(isPlanilla90Snapshot(null)).toBe(false);
  });

  test('reparar siempre deja 30 filas y multiplicadores válidos', () => {
    const fixed = normalizePlanilla90({ columns: [{ multiplier: 9, cells: [{ rowNumber: 1, playerName: 'ANA' }] }] });
    expect(fixed.layout).toBe('planilla90');
    expect(fixed.columns[0].cells).toHaveLength(30);
    expect(fixed.columns[0].multiplier).toBe(5);
    expect(fixed.columns[0].cells[0].playerName).toBe('ANA');
    expect(normalizePlanilla90(undefined).columns).toHaveLength(6);
  });

  test('líneas = suma de multiplicadores', () => {
    expect(getPlanilla90Lines(createDefaultPlanilla90())).toBe(7);
  });

  test('primera casilla vacía de la secuencia', () => {
    expect(getFirstEmptySeqSlot({})).toBe(1);
    expect(getFirstEmptySeqSlot({ 1: { bingo: 5 }, 2: { ambo: 7 } })).toBe(3);
  });
});

describe('planilla 90: premios', () => {
  test('solo cuentan las opciones activas', () => {
    const s = createDefaultPlanilla90();
    const entry = { pf: 3, ambo: 33, bingo: 63 };
    expect(getPlanilla90WinningRows(s, entry)).toEqual({ pfRow: null, amboRow: 3, bingoRow: 3 });
    s.pfEnabled = true;
    s.amboEnabled = false;
    expect(getPlanilla90WinningRows(s, entry)).toEqual({ pfRow: 3, amboRow: null, bingoRow: 3 });
  });

  test('bolas anotadas de la partida en curso', () => {
    const s = createDefaultPlanilla90();
    s.customSeqEntries = { 2: { pf: 4, ambo: 40, bingo: 70 } };
    expect(getPlanilla90TypedBalls(s)).toEqual({});
    s.activeSeqSlot = 2;
    expect(getPlanilla90TypedBalls(s)).toEqual({ ambo: 40, amboRow: 10, bingo: 70, bingoRow: 10 });
  });

  test('gano, debe y total por jugador', () => {
    const s = sheetWith([
      { col: 0, row: 5, name: 'ANA' }, // DOBLE: cuesta 2, bingo 50
      { col: 1, row: 5, name: 'LUIS', paid: true }, // SOLO pagado: bingo 25
      { col: 2, row: 7, name: 'ANA' }, // SOLO: cuesta 1, ambo 5
    ]);
    const rows = { pfRow: null, amboRow: 7, bingoRow: 5 };
    const list = getPlanilla90Summaries(s, rows, noBalances);
    const ana = list.find((p) => p.name === 'ANA')!;
    const luis = list.find((p) => p.name === 'LUIS')!;
    expect(ana.totalGano).toBe(55);
    expect(ana.debe).toBe(3);
    expect(ana.total).toBe(52);
    expect(ana.isBingoWinner && ana.isAmboWinner).toBe(true);
    expect(luis.totalGano).toBe(25);
    expect(luis.debe).toBe(0);
    expect(luis.paid).toBe(true);
  });

  test('suma lo acumulado y descuenta lo entregado', () => {
    const s = sheetWith([{ col: 1, row: 2, name: 'ANA' }]);
    const list = getPlanilla90Summaries(
      s,
      { pfRow: null, amboRow: null, bingoRow: 2 },
      { won: { ana: 10 }, debt: { ana: 4 }, offsets: { ana: 25 } }
    );
    expect(list[0].totalGano).toBe(10);
    expect(list[0].debe).toBe(5);
  });

  test('recaudado y premios para guardar la partida', () => {
    const s = sheetWith([
      { col: 0, row: 5, name: 'ANA' },
      { col: 1, row: 9, name: 'LUIS' },
    ]);
    s.customSeqEntries = { 4: { bingo: 35 } };
    s.activeSeqSlot = 4;
    expect(calculatePlanilla90Financials(s)).toEqual({ totalCollected: 3, totalPrizesPaid: 50 });
    s.activeSeqSlot = undefined;
    expect(calculatePlanilla90Financials(s, 9)).toEqual({ totalCollected: 3, totalPrizesPaid: 25 });
  });

  test('nueva partida vacía casillas y conserva jugadores', () => {
    const s = sheetWith([{ col: 0, row: 1, name: 'ANA' }]);
    s.players = [{ id: 'ANA', name: 'ANA', color: '#fff', paid: true }];
    const next = clearPlanilla90Cells(s, true);
    expect(next.columns[0].cells[0].playerName).toBeUndefined();
    expect(next.players[0].paid).toBe(false);
    expect(clearPlanilla90Cells(s, false).players).toHaveLength(0);
  });
});

describe('planilla 90: números subrayados', () => {
  const all = { pf: true, ambo: true, bingo: true };

  test('P.F, ambo y bingo salen del orden de las marcas', () => {
    // 35 (fila 5) primero; luego fila 7 completa sus 2 y 3 números
    expect(deriveSequenceFromMarks([35, 7, 37, 67], all)).toEqual({ pf: 5, ambo: 7, bingo: 7 });
    expect(deriveSequenceFromMarks([35], all)).toEqual({ pf: 5 });
    expect(deriveSequenceFromMarks([35, 65], { pf: false, ambo: true, bingo: true })).toEqual({ ambo: 5 });
    expect(deriveSequenceFromMarks([], all)).toEqual({});
  });

  test('marcar anota la secuencia de la partida en curso y desmarcar la quita', () => {
    let s = createDefaultPlanilla90(); // P.F apagado por defecto
    s.pfEnabled = true;
    s.customSeqEntries = { 1: { bingo: 9 } };
    s = togglePlanilla90Mark(s, 32);
    expect(s.activeSeqSlot).toBe(2);
    expect(s.customSeqEntries?.[2]).toEqual({ pf: 2 });
    s = togglePlanilla90Mark(s, 62);
    s = togglePlanilla90Mark(s, 2);
    expect(s.customSeqEntries?.[2]).toEqual({ pf: 2, ambo: 2, bingo: 2 });
    s = togglePlanilla90Mark(s, 2);
    expect(s.customSeqEntries?.[2]).toEqual({ pf: 2, ambo: 2 });
    s = togglePlanilla90Mark(togglePlanilla90Mark(s, 32), 62);
    expect(s.markedNumbers).toEqual([]);
    expect(s.customSeqEntries?.[2]).toBeUndefined();
    expect(s.activeSeqSlot).toBeUndefined();
    expect(s.customSeqEntries?.[1]).toEqual({ bingo: 9 });
  });

  test('nueva partida borra las marcas', () => {
    const s = togglePlanilla90Mark(createDefaultPlanilla90(), 10);
    expect(clearPlanilla90Cells(s, true).markedNumbers).toEqual([]);
  });
});
