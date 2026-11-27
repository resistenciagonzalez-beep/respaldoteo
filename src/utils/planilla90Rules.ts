/**
 * Reglas de la Planilla 90 nueva (formato por columnas de 30 filas).
 *
 * Cada fila "r" de la planilla representa el trío de números r, r+30 y r+60.
 * La operadora anota en la SECUENCIA la bola de P.F (primera ficha), A (ambo)
 * y B (bingo); cada bola se convierte en su fila con ((bola - 1) % 30) + 1.
 *
 * Este archivo no depende de React ni de Firebase: solo cálculos, para poder
 * probarlo y reutilizarlo en la planilla, en la galería y en el panel admin.
 */
import type {
  BingoSheetCell,
  BingoSheetColumn,
  BingoSheetData,
  BingoSheetPlayer,
  CustomSequenceEntry,
  PlayerSummarySnapshotItem,
} from '../types';

export const PLANILLA90_LAYOUT = 'planilla90' as const;
export const PLANILLA90_ROWS = 30;
export const PLANILLA90_SEQ_SLOTS = 30;
export const PLANILLA90_MAX_MULTIPLIER = 5;
export const PLANILLA90_MAX_COLUMNS = 16;

export const STORAGE_KEY_PLANILLA90 = 'bingo_planilla90_sheet_v1';
export const STORAGE_KEY_PLANILLA90_PREVIOUS = 'bingo_planilla90_previous_v1';
export const STORAGE_KEY_PLANILLA90_WON = 'bingo_planilla90_cumulative_won_v1';
export const STORAGE_KEY_PLANILLA90_DEBT = 'bingo_planilla90_cumulative_debt_v1';
export const STORAGE_KEY_PLANILLA90_OFFSETS = 'bingo_planilla90_payout_offsets_v1';

export const DEFAULT_PLANILLA90_MULTIPLIERS = [2, 1, 1, 1, 1, 1];

const MULTIPLIER_NAMES: Record<number, string> = {
  1: 'SOLO',
  2: 'DOBLE',
  3: 'TRIPLE',
  4: 'CUARTA',
  5: 'QUINTA',
};

/** Nombre en texto del multiplicador de una columna (SOLO, DOBLE, TRIPLE, CUARTA, QUINTA). */
export function getMultiplierLabel(multiplier: number | undefined): string {
  const m = Number(multiplier) || 1;
  return MULTIPLIER_NAMES[m] || `X${m}`;
}

/** Siguiente multiplicador al tocar el encabezado: SOLO → DOBLE → … → QUINTA → SOLO. */
export function getNextMultiplier(multiplier: number | undefined): number {
  const m = Number(multiplier) || 1;
  return m >= PLANILLA90_MAX_MULTIPLIER ? 1 : m + 1;
}

/** Fila (1..30) que corresponde a una bola del 1 al 90. Devuelve null si no es válida. */
export function getRowFromBall(value: number | string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value).trim(), 10);
  if (!Number.isFinite(n) || n < 1 || n > 90) return null;
  return ((Math.floor(n) - 1) % PLANILLA90_ROWS) + 1;
}

/** Los tres números de la fila: r, r+30 y r+60. */
export function getRowNumbers(row: number): [number, number, number] {
  return [row, row + PLANILLA90_ROWS, row + PLANILLA90_ROWS * 2];
}

/**
 * Primera fila que el bolillero completó (sus 3 números cantados), siguiendo el orden en que salieron.
 * Devuelve null si ninguna fila está completa.
 */
export function getFirstCompletedRow(drawn: { number: number; order?: number }[]): number | null {
  const ordered = drawn
    .map((b, i) => ({ n: b.number, o: typeof b.order === 'number' ? b.order : i }))
    .sort((a, b) => a.o - b.o);
  const counts = new Map<number, number>();
  for (const { n } of ordered) {
    const row = getRowFromBall(n);
    if (row === null) continue;
    const c = (counts.get(row) || 0) + 1;
    counts.set(row, c);
    if (c === 3) return row;
  }
  return null;
}

/** Indica si una planilla guardada es del formato nuevo de 90. */
export function isPlanilla90Snapshot(sheet: unknown): boolean {
  if (!sheet || typeof sheet !== 'object') return false;
  const s = sheet as Partial<BingoSheetData>;
  return s.layout === PLANILLA90_LAYOUT && Array.isArray(s.columns);
}

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyCells(): BingoSheetCell[] {
  return Array.from({ length: PLANILLA90_ROWS }, (_, i) => ({ rowNumber: i + 1 }));
}

/** Crea una columna vacía con su multiplicador. */
export function createPlanilla90Column(index: number, multiplier: number): BingoSheetColumn {
  const m = Math.min(PLANILLA90_MAX_MULTIPLIER, Math.max(1, Math.round(multiplier) || 1));
  return {
    id: `p90-col-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    colNumber: index + 1,
    title: getMultiplierLabel(m),
    multiplier: m,
    hasRedDividerRight: false,
    cells: emptyCells(),
  };
}

/** Planilla nueva vacía con los valores de la foto: $1 por línea, bingo $25, ambo $5. */
export function createDefaultPlanilla90(): BingoSheetData {
  return {
    layout: PLANILLA90_LAYOUT,
    title: 'BIENVENIDOS A LA FAMILIA TEOO',
    subtitle: 'Planilla 90',
    hostName: '',
    hostPhone: '',
    columnPrice: 1,
    baseCost: 1,
    basePrize: 25,
    bingoEnabled: true,
    amboEnabled: true,
    baseAmboPrize: 5,
    pfEnabled: false,
    basePfPrize: 2,
    ternaEnabled: false,
    baseTernaPrize: 0,
    rowMultipliers: {},
    currency: '$',
    totalRows: PLANILLA90_ROWS,
    columns: DEFAULT_PLANILLA90_MULTIPLIERS.map((m, i) => createPlanilla90Column(i, m)),
    players: [],
    customSeqEntries: {},
  };
}

/**
 * Repara una planilla leída del almacenamiento: siempre 30 filas por columna,
 * multiplicadores válidos y los campos del formato nuevo.
 */
export function normalizePlanilla90(raw: unknown): BingoSheetData {
  const base = createDefaultPlanilla90();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<BingoSheetData>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;

  const columns: BingoSheetColumn[] = (Array.isArray(r.columns) && r.columns.length > 0 ? r.columns : base.columns)
    .slice(0, PLANILLA90_MAX_COLUMNS)
    .map((c, idx) => {
      const m = Math.min(PLANILLA90_MAX_MULTIPLIER, Math.max(1, Math.round(Number(c?.multiplier) || 1)));
      const cells = emptyCells().map((empty, rIdx) => {
        const old = Array.isArray(c?.cells) ? c.cells[rIdx] : undefined;
        return old ? { ...old, rowNumber: rIdx + 1 } : empty;
      });
      return {
        id: c?.id || `p90-col-${idx + 1}`,
        colNumber: idx + 1,
        title: getMultiplierLabel(m),
        multiplier: m,
        hasRedDividerRight: Boolean(c?.hasRedDividerRight),
        cells,
      };
    });

  return {
    ...base,
    title: typeof r.title === 'string' && r.title.trim() ? r.title : base.title,
    baseCost: num(r.baseCost, base.baseCost),
    columnPrice: num(r.baseCost, base.baseCost),
    basePrize: num(r.basePrize, base.basePrize),
    baseAmboPrize: num(r.baseAmboPrize, base.baseAmboPrize ?? 5),
    basePfPrize: num(r.basePfPrize, base.basePfPrize ?? 2),
    bingoEnabled: r.bingoEnabled !== false,
    amboEnabled: r.amboEnabled !== undefined ? Boolean(r.amboEnabled) : true,
    pfEnabled: Boolean(r.pfEnabled),
    columns,
    players: Array.isArray(r.players) ? r.players : [],
    customSeqEntries: r.customSeqEntries && typeof r.customSeqEntries === 'object' ? r.customSeqEntries : {},
    activeSeqSlot: typeof r.activeSeqSlot === 'number' && r.activeSeqSlot > 0 ? r.activeSeqSlot : undefined,
    markedNumbers: Array.isArray(r.markedNumbers)
      ? r.markedNumbers.filter((n, i, arr) => Number.isInteger(n) && n >= 1 && n <= 90 && arr.indexOf(n) === i)
      : [],
    playerSummaryList: r.playerSummaryList,
  };
}

/** Líneas jugadas = suma de los multiplicadores de las columnas. */
export function getPlanilla90Lines(sheet: BingoSheetData | null | undefined): number {
  if (!sheet || !Array.isArray(sheet.columns)) return 0;
  return sheet.columns.reduce((sum, c) => sum + (Number(c.multiplier) || 1), 0);
}

export interface Planilla90WinningRows {
  pfRow: number | null;
  amboRow: number | null;
  bingoRow: number | null;
}

/** Filas ganadoras de la partida en curso según lo anotado en la secuencia (solo lo que esté activo). */
export function getPlanilla90WinningRows(
  sheet: BingoSheetData | null | undefined,
  entry?: CustomSequenceEntry | null
): Planilla90WinningRows {
  if (!sheet || !entry) return { pfRow: null, amboRow: null, bingoRow: null };
  return {
    pfRow: sheet.pfEnabled ? getRowFromBall(entry.pf) : null,
    amboRow: sheet.amboEnabled ? getRowFromBall(entry.ambo) : null,
    bingoRow: sheet.bingoEnabled !== false ? getRowFromBall(entry.bingo) : null,
  };
}

/** Entrada de la secuencia de la partida en curso. */
export function getActiveSeqEntry(sheet: BingoSheetData | null | undefined): CustomSequenceEntry | null {
  if (!sheet || !sheet.activeSeqSlot || !sheet.customSeqEntries) return null;
  return sheet.customSeqEntries[sheet.activeSeqSlot] || null;
}

/** Bolas anotadas en la secuencia de la partida en curso (solo las opciones activas), con su fila. */
export function getPlanilla90TypedBalls(sheet: BingoSheetData | null | undefined): {
  pf?: number;
  pfRow?: number;
  ambo?: number;
  amboRow?: number;
  bingo?: number;
  bingoRow?: number;
} {
  const entry = getActiveSeqEntry(sheet);
  if (!sheet || !entry) return {};
  const rows = getPlanilla90WinningRows(sheet, entry);
  const out: ReturnType<typeof getPlanilla90TypedBalls> = {};
  if (rows.pfRow !== null) {
    out.pf = Number(entry.pf);
    out.pfRow = rows.pfRow;
  }
  if (rows.amboRow !== null) {
    out.ambo = Number(entry.ambo);
    out.amboRow = rows.amboRow;
  }
  if (rows.bingoRow !== null) {
    out.bingo = Number(entry.bingo);
    out.bingoRow = rows.bingoRow;
  }
  return out;
}

/** Primera casilla de la secuencia sin nada anotado (para la próxima partida). */
export function getFirstEmptySeqSlot(entries: BingoSheetData['customSeqEntries']): number {
  for (let slot = 1; slot <= PLANILLA90_SEQ_SLOTS; slot++) {
    const e = entries?.[slot];
    if (!e || (e.pf === undefined && e.ambo === undefined && e.bingo === undefined)) return slot;
  }
  return PLANILLA90_SEQ_SLOTS;
}

export function getPlayerKey(id?: string, name?: string): string {
  if (name && name.trim()) return name.trim().toLowerCase();
  if (id && id.trim()) return id.trim().toLowerCase();
  return 'anon';
}

export function getColumnCost(sheet: BingoSheetData, col: BingoSheetColumn): number {
  return money((Number(col.multiplier) || 1) * (sheet.baseCost ?? 1));
}

export interface Planilla90PrizeLine {
  playerKey: string;
  type: 'pf' | 'ambo' | 'bingo';
  row: number;
  columnIndex: number;
  amount: number;
}

/** Premios de la partida en curso, casilla por casilla. */
export function getPlanilla90Prizes(sheet: BingoSheetData, rows: Planilla90WinningRows): Planilla90PrizeLine[] {
  const lines: Planilla90PrizeLine[] = [];
  const add = (type: Planilla90PrizeLine['type'], row: number | null, base: number) => {
    if (row === null || base <= 0) return;
    sheet.columns.forEach((col, columnIndex) => {
      const cell = col.cells[row - 1];
      if (!cell || (!cell.playerId && !cell.playerName)) return;
      lines.push({
        playerKey: getPlayerKey(cell.playerId, cell.playerName),
        type,
        row,
        columnIndex,
        amount: money((Number(col.multiplier) || 1) * base),
      });
    });
  };
  add('pf', rows.pfRow, sheet.basePfPrize ?? 0);
  add('ambo', rows.amboRow, sheet.baseAmboPrize ?? 0);
  add('bingo', rows.bingoRow, sheet.basePrize ?? 0);
  return lines;
}

/** Recaudado (casillas ocupadas) y premios de la partida, para guardar la partida. */
export function calculatePlanilla90Financials(
  sheet: BingoSheetData | null | undefined,
  fallbackBingoRow?: number
): { totalCollected: number; totalPrizesPaid: number } {
  if (!sheet || !Array.isArray(sheet.columns)) return { totalCollected: 0, totalPrizesPaid: 0 };
  let totalCollected = 0;
  sheet.columns.forEach((col) => {
    const cost = getColumnCost(sheet, col);
    col.cells.forEach((cell) => {
      if (cell.playerId || cell.playerName) totalCollected += cost;
    });
  });
  const rows = getPlanilla90WinningRows(sheet, getActiveSeqEntry(sheet));
  if (rows.bingoRow === null && sheet.bingoEnabled !== false && fallbackBingoRow) {
    rows.bingoRow = fallbackBingoRow >= 1 && fallbackBingoRow <= PLANILLA90_ROWS ? fallbackBingoRow : null;
  }
  const totalPrizesPaid = getPlanilla90Prizes(sheet, rows).reduce((s, p) => s + p.amount, 0);
  return { totalCollected: money(totalCollected), totalPrizesPaid: money(totalPrizesPaid) };
}

/** Jugadores registrados más cualquiera que esté en una casilla y no en la lista. */
export function getPlanilla90Players(sheet: BingoSheetData): BingoSheetPlayer[] {
  const byKey = new Map<string, BingoSheetPlayer>();
  sheet.players.forEach((p) => byKey.set(getPlayerKey(p.id, p.name), p));
  sheet.columns.forEach((col) =>
    col.cells.forEach((cell) => {
      if (!cell.playerId && !cell.playerName) return;
      const key = getPlayerKey(cell.playerId, cell.playerName);
      if (!byKey.has(key)) {
        byKey.set(key, {
          id: cell.playerId || `p90_${key.replace(/\s+/g, '_')}`,
          name: cell.playerName || 'Jugador',
          color: cell.color || '#fed7aa',
          textColor: cell.textColor || '#000000',
        });
      }
    })
  );
  return Array.from(byKey.values());
}

export interface Planilla90Balances {
  won: Record<string, number>;
  debt: Record<string, number>;
  offsets: Record<string, number>;
}

export interface Planilla90PlayerSummary extends PlayerSummarySnapshotItem {
  textColor: string;
  currentWon: number;
  cellsCount: number;
  isPfWinner: boolean;
  isAmboWinner: boolean;
  isBingoWinner: boolean;
}

/**
 * Resumen de cada jugador (barra de ganadores):
 * GANO = lo acumulado de partidas anteriores + premios de esta partida (menos lo ya entregado).
 * DEBE = deuda acumulada + casillas sin pagar de esta partida.
 * TOTAL = GANO - DEBE.
 */
export function getPlanilla90Summaries(
  sheet: BingoSheetData,
  rows: Planilla90WinningRows,
  balances: Planilla90Balances
): Planilla90PlayerSummary[] {
  const prizes = getPlanilla90Prizes(sheet, rows);
  return getPlanilla90Players(sheet).map((player) => {
    const key = getPlayerKey(player.id, player.name);
    const mine = prizes.filter((p) => p.playerKey === key);
    const rawWon = mine.reduce((s, p) => s + p.amount, 0);
    const currentWon = money(Math.max(0, rawWon - (balances.offsets[key] || 0)));
    const totalGano = money(Math.max(0, (balances.won[key] || 0) + currentWon));

    let unpaid = 0;
    let cellsCount = 0;
    let unpaidCount = 0;
    sheet.columns.forEach((col) => {
      const cost = getColumnCost(sheet, col);
      col.cells.forEach((cell) => {
        if (getPlayerKey(cell.playerId, cell.playerName) !== key || (!cell.playerId && !cell.playerName)) return;
        cellsCount++;
        if (!cell.isPaid) {
          unpaid += cost;
          unpaidCount++;
        }
      });
    });
    const debe = money((balances.debt[key] || 0) + unpaid);
    return {
      id: player.id,
      name: player.name,
      color: player.color,
      textColor: player.textColor || '#000000',
      totalGano,
      debe,
      total: money(totalGano - debe),
      paid: cellsCount > 0 ? unpaidCount === 0 : Boolean(player.paid),
      currentWon,
      cellsCount,
      isPfWinner: mine.some((p) => p.type === 'pf'),
      isAmboWinner: mine.some((p) => p.type === 'ambo'),
      isBingoWinner: mine.some((p) => p.type === 'bingo'),
    };
  });
}

/** Planilla para la próxima partida: mismas columnas y jugadores, casillas vacías. */
export function clearPlanilla90Cells(sheet: BingoSheetData, keepPlayers: boolean): BingoSheetData {
  return {
    ...sheet,
    players: keepPlayers ? sheet.players.map((p) => ({ ...p, paid: false })) : [],
    columns: sheet.columns.map((col) => ({ ...col, cells: emptyCells() })),
    playerSummaryList: undefined,
    markedNumbers: [],
  };
}

/**
 * Secuencia que sale de los números subrayados en JUEGO (en el orden en que se marcaron):
 *  - P.F: la fila del primer número subrayado.
 *  - A: la primera fila que llega a 2 números subrayados.
 *  - B: la primera fila que llega a 3 números subrayados.
 * En cada casilla se anota el primer número de esa fila (1 a 30). Solo lo que esté activo.
 */
export function deriveSequenceFromMarks(
  marks: number[],
  enabled: { pf: boolean; ambo: boolean; bingo: boolean }
): { pf?: number; ambo?: number; bingo?: number } {
  const counts = new Map<number, number>();
  let pf: number | undefined;
  let ambo: number | undefined;
  let bingo: number | undefined;
  for (const n of marks) {
    const row = getRowFromBall(n);
    if (row === null) continue;
    if (pf === undefined) pf = row;
    const c = (counts.get(row) || 0) + 1;
    counts.set(row, c);
    if (c === 2 && ambo === undefined) ambo = row;
    if (c === 3 && bingo === undefined) bingo = row;
  }
  const out: { pf?: number; ambo?: number; bingo?: number } = {};
  if (enabled.pf && pf !== undefined) out.pf = pf;
  if (enabled.ambo && ambo !== undefined) out.ambo = ambo;
  if (enabled.bingo && bingo !== undefined) out.bingo = bingo;
  return out;
}

/**
 * Marca o desmarca un número de JUEGO y anota sola la secuencia (P.F / A / B) de la partida en curso.
 * La partida en curso es la casilla activa de la secuencia o, si no hay, la primera vacía.
 */
export function togglePlanilla90Mark(sheet: BingoSheetData, num: number): BingoSheetData {
  if (!Number.isInteger(num) || num < 1 || num > 90) return sheet;
  const prevMarks = Array.isArray(sheet.markedNumbers) ? sheet.markedNumbers : [];
  const marks = prevMarks.includes(num) ? prevMarks.filter((n) => n !== num) : [...prevMarks, num];
  const slot = sheet.activeSeqSlot ?? getFirstEmptySeqSlot(sheet.customSeqEntries);
  const derived = deriveSequenceFromMarks(marks, {
    pf: Boolean(sheet.pfEnabled),
    ambo: Boolean(sheet.amboEnabled),
    bingo: sheet.bingoEnabled !== false,
  });
  const entries = { ...(sheet.customSeqEntries || {}) };
  const entry = { ...(entries[slot] || {}) };
  (['pf', 'ambo', 'bingo'] as const).forEach((field) => {
    if (derived[field] !== undefined) entry[field] = derived[field];
    else delete entry[field];
  });
  const isEmpty = entry.pf === undefined && entry.ambo === undefined && entry.bingo === undefined && entry.terna === undefined;
  if (isEmpty) delete entries[slot];
  else entries[slot] = entry;
  return {
    ...sheet,
    markedNumbers: marks,
    customSeqEntries: entries,
    activeSeqSlot: isEmpty && marks.length === 0 ? undefined : slot,
  };
}
