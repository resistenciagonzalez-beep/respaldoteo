import { describe, expect, test } from 'bun:test';
import type { GameSequenceItem } from '../types';
import {
  computeNextRoundInShift,
  dateToAppDateKey,
  decideShiftFolderForNewGame,
  formatTime12h,
  getAppZoneParts,
  getGameLines,
  getGameShiftNumber,
  getPreviousDateKey,
  isSameOperatorGame,
  parseDateStringToDateKey,
  parseGameFolderKey,
  sanitizeOperatorFolderName,
} from './saveRules';

const HOUR = 60 * 60 * 1000;

function game(partial: Partial<GameSequenceItem>): GameSequenceItem {
  return { id: partial.id || 'g', round: 1, operatorName: 'Ana', mode: '75', ...partial } as GameSequenceItem;
}

/** Fecha de carpeta como la usa la plataforma (dailyDate). */
const dateKeyOf = (g: GameSequenceItem) => String(g.dailyDate);

/** Simula la hora en que la nube confirmó el guardado. */
const savedAt = (ms: number) => ({ updatedAt: { seconds: ms / 1000 } }) as unknown as Partial<GameSequenceItem>;

describe('Guardado: hora de Panamá', () => {
  test('una partida a las 11 PM de Panamá queda en ese mismo día (no en el siguiente)', () => {
    // 2026-11-20 23:30 en Panamá = 2026-11-21 04:30 UTC
    expect(dateToAppDateKey(new Date('2026-11-21T04:30:00Z'))).toBe('2026-11-20');
  });

  test('las horas se calculan en Panamá sin importar el dispositivo', () => {
    const p = getAppZoneParts(new Date('2026-11-21T04:30:15Z'));
    expect([p.hour, p.minute, p.second]).toEqual(['23', '30', '15']);
  });

  test('día anterior, incluso al cambiar de mes y año', () => {
    expect(getPreviousDateKey('2026-12-01')).toBe('2026-11-30');
    expect(getPreviousDateKey('2027-01-01')).toBe('2026-12-31');
  });
});

describe('Guardado: hora AM/PM', () => {
  test('convierte la hora militar a AM/PM', () => {
    expect(formatTime12h('19:16:26')).toBe('7:16 PM');
    expect(formatTime12h('00:05')).toBe('12:05 AM');
    expect(formatTime12h('12:00:00')).toBe('12:00 PM');
    expect(formatTime12h('09:30')).toBe('9:30 AM');
  });

  test('entiende textos antiguos con "p. m." y deja lo desconocido igual', () => {
    expect(formatTime12h('07:16:26 p. m.')).toBe('7:16 PM');
    expect(formatTime12h('12:10 a. m.')).toBe('12:10 AM');
    expect(formatTime12h('')).toBe('');
    expect(formatTime12h('sin hora')).toBe('sin hora');
  });
});

describe('Guardado: fechas y carpetas', () => {
  test('lee fechas en distintos formatos', () => {
    expect(parseDateStringToDateKey('2026-11-19')).toBe('2026-11-19');
    expect(parseDateStringToDateKey('19/11/2026')).toBe('2026-11-19');
    expect(parseDateStringToDateKey('2026-11-19T10:00:00')).toBe('2026-11-19');
    expect(parseDateStringToDateKey('19 de noviembre de 2026')).toBe('2026-11-19');
    expect(parseDateStringToDateKey('hola')).toBe(null);
  });

  test('clave de carpeta por turno', () => {
    expect(parseGameFolderKey('2026-11-19')).toEqual({ dateKey: '2026-11-19', shiftNumber: 1 });
    expect(parseGameFolderKey('2026-11-19#t3')).toEqual({ dateKey: '2026-11-19', shiftNumber: 3 });
  });

  test('partidas antiguas sin número de turno son Turno 1', () => {
    expect(getGameShiftNumber(game({}))).toBe(1);
    expect(getGameShiftNumber(game({ shiftNumber: 2 }))).toBe(2);
    expect(getGameShiftNumber(null)).toBe(1);
  });

  test('nombre de carpeta de operadora sin tildes ni espacios', () => {
    expect(sanitizeOperatorFolderName('Carla García')).toBe('carla_garcia');
    expect(sanitizeOperatorFolderName('')).toBe('operadora_principal');
  });

  test('reconoce a la misma operadora por su cuenta, aunque cambie el nombre', () => {
    const a = game({ operatorUid: 'u1', operatorName: 'Ana' });
    const b = game({ operatorUid: 'u1', operatorName: 'Ana María' });
    const c = game({ operatorUid: 'u2', operatorName: 'Ana' });
    expect(isSameOperatorGame(b, a, 'ana')).toBe(true);
    expect(isSameOperatorGame(c, a, 'ana')).toBe(false);
  });
});

describe('Guardado: carpetas por turno', () => {
  const now = Date.UTC(2026, 10, 20, 6, 0, 0); // 20 nov 1:00 AM en Panamá

  test('turno de noche que pasa de medianoche sigue en la carpeta del día en que empezó', () => {
    const mine = [game({ shiftId: 's1', dailyDate: '2026-11-19', shiftNumber: 2, ...savedAt(now - HOUR) })];
    const folder = decideShiftFolderForNewGame({
      item: game({ shiftId: 's1' }),
      mine,
      today: '2026-11-20',
      nowMs: now,
      getDateKey: dateKeyOf,
    });
    expect(folder).toEqual({ dailyDate: '2026-11-19', shiftNumber: 2 });
  });

  test('después de "Cerrar turno", el turno nuevo del mismo día es Turno 2', () => {
    const mine = [game({ shiftId: 's1', dailyDate: '2026-11-20', shiftNumber: 1, ...savedAt(now - HOUR) })];
    const folder = decideShiftFolderForNewGame({
      item: game({ shiftId: 's2' }),
      mine,
      today: '2026-11-20',
      nowMs: now,
      getDateKey: dateKeyOf,
    });
    expect(folder).toEqual({ dailyDate: '2026-11-20', shiftNumber: 2 });
  });

  test('si pasaron más de 6 horas sin guardar, empieza carpeta nueva', () => {
    const mine = [game({ shiftId: 's1', dailyDate: '2026-11-19', shiftNumber: 1, ...savedAt(now - 7 * HOUR) })];
    const folder = decideShiftFolderForNewGame({
      item: game({ shiftId: 's1' }),
      mine,
      today: '2026-11-20',
      nowMs: now,
      getDateKey: dateKeyOf,
    });
    expect(folder).toEqual({ dailyDate: '2026-11-20', shiftNumber: 1 });
  });

  test('una partida aún sin subir a la nube cuenta como reciente', () => {
    const mine = [game({ shiftId: 's1', dailyDate: '2026-11-19', shiftNumber: 1 })];
    const folder = decideShiftFolderForNewGame({
      item: game({ shiftId: 's1' }),
      mine,
      today: '2026-11-20',
      nowMs: now,
      getDateKey: dateKeyOf,
    });
    expect(folder).toEqual({ dailyDate: '2026-11-19', shiftNumber: 1 });
  });

  test('primera partida del día sin partidas previas es Turno 1 de hoy', () => {
    const folder = decideShiftFolderForNewGame({
      item: game({ shiftId: 's9' }),
      mine: [],
      today: '2026-11-20',
      nowMs: now,
      getDateKey: dateKeyOf,
    });
    expect(folder).toEqual({ dailyDate: '2026-11-20', shiftNumber: 1 });
  });
});

describe('Guardado: número de partida', () => {
  const folder = { dailyDate: '2026-11-20', shiftNumber: 2 };

  test('sigue el número más alto de la carpeta del turno', () => {
    const games = [
      game({ dailyDate: '2026-11-20', shiftNumber: 2, round: 1 }),
      game({ dailyDate: '2026-11-20', shiftNumber: 2, round: 4 }),
      game({ dailyDate: '2026-11-20', shiftNumber: 1, round: 30 }), // otro turno
      game({ dailyDate: '2026-11-19', shiftNumber: 2, round: 50 }), // otro día
    ];
    expect(computeNextRoundInShift({ games, folder, is90: false, getDateKey: dateKeyOf })).toBe(5);
  });

  test('75 y 90 bolas cuentan por separado', () => {
    const games = [
      game({ dailyDate: '2026-11-20', shiftNumber: 2, round: 7, mode: '75' }),
      game({ dailyDate: '2026-11-20', shiftNumber: 2, round: 3, mode: '90' }),
    ];
    expect(computeNextRoundInShift({ games, folder, is90: true, getDateKey: dateKeyOf })).toBe(4);
    expect(computeNextRoundInShift({ games, folder, is90: false, getDateKey: dateKeyOf })).toBe(8);
  });

  test('carpeta vacía empieza en la partida 1', () => {
    expect(computeNextRoundInShift({ games: [], folder, is90: false, getDateKey: dateKeyOf })).toBe(1);
  });
});

describe('Guardado: líneas jugadas', () => {
  test('usa el total guardado si existe', () => {
    expect(getGameLines(game({ totalLinesPlayed: 42 }))).toBe(42);
  });

  test('75 bolas: suma los multiplicadores de las columnas (hasta X10)', () => {
    const sheet = { columns: [{ multiplier: 1 }, { multiplier: 10 }, { multiplier: 3 }] };
    expect(getGameLines(game({ sheet75Snapshot: sheet as never }))).toBe(14);
  });

  test('90 bolas: 30 líneas por planilla abierta', () => {
    const sheet90 = { tables: [{}, {}, {}] };
    expect(getGameLines(game({ mode: '90', sheet90Snapshot: sheet90 as never }))).toBe(90);
  });

  test('90 bolas formato nuevo: suma los multiplicadores de sus columnas', () => {
    const p90 = { layout: 'planilla90', columns: [{ multiplier: 2 }, { multiplier: 1 }, { multiplier: 5 }] };
    expect(getGameLines(game({ mode: '90', sheet75Snapshot: p90 as never }))).toBe(8);
  });
});
