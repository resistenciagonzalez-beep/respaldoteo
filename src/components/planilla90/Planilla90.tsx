/**
 * PLANILLA 90 NUEVA (formato de la foto): pantalla independiente de la Planilla 75.
 *
 * - SECUENCIA con P.F / A / B (cada una se puede activar o desactivar).
 * - JUEGO: cada fila muestra r, r+30 y r+60; los números cantados salen en rojo.
 * - Columnas por multiplicador con nombre en texto (SOLO, DOBLE, TRIPLE, CUARTA, QUINTA).
 * - Barra de ganadores (NOMBRE / GANO / DEBE / TOTAL) y panel lateral en lugar del bolillero.
 * - Todo cabe en la pantalla de cualquier dispositivo, con números grandes y gruesos.
 *
 * Usa sus propias claves de guardado (planilla90Storage), así no toca nada de la 75.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  Grid,
  Maximize2,
  Minimize2,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Undo,
} from 'lucide-react';
import type { AppUser, Ball, BingoSheetData, BingoSheetPlayer, PlayerSummarySnapshotItem } from '../../types';
import { VIBRANT_PLAYER_COLORS, getContrastTextColor } from '../../utils/playerColors';
import { sanitizePlayerName } from '../../utils/security';
import { executeMismosReconstruction } from '../../utils/mismosEngine';
import {
  PLANILLA90_MAX_COLUMNS,
  clearPlanilla90Cells,
  createPlanilla90Column,
  getFirstCompletedRow,
  getFirstEmptySeqSlot,
  getMultiplierLabel,
  getNextMultiplier,
  getPlanilla90Lines,
  getPlanilla90Players,
  getPlanilla90Summaries,
  getPlanilla90WinningRows,
  getPlayerKey,
  normalizePlanilla90,
  togglePlanilla90Mark,
  type Planilla90Balances,
  type Planilla90PlayerSummary,
} from '../../utils/planilla90Rules';
import {
  getPreviousPlanilla90,
  loadPlanilla90,
  loadPlanilla90Balances,
  savePlanilla90,
  savePlanilla90Balances,
  savePreviousPlanilla90,
} from '../../utils/planilla90Storage';
import { Planilla90Grid, type Planilla90SeqField } from './Planilla90Grid';
import { Planilla90SummaryBar } from './Planilla90SummaryBar';
import { Planilla90Panel, type Planilla90RateField, type Planilla90ToggleField } from './Planilla90Panel';
import { SyncStatusIndicator } from '../SyncStatusIndicator';
import { safeGetItem, safeSetItem } from '../../utils/safeStorage';

export interface Planilla90Props {
  currentUser?: AppUser | null;
  isAdmin: boolean;
  drawnBalls?: Ball[];
  currentMatchRound?: number;
  savedGamesCount?: number;
  isFullscreen?: boolean;
  onBackToGame: () => void;
  onSwitchTo75?: () => void;
  onOpenAdmin?: () => void;
  onSaveCurrentGame?: (sheet: BingoSheetData) => Promise<{ success: boolean; verified: boolean; game: { round: number } }> | void;
  onStartNewGame?: () => void;
  onOpenSavedGamesGallery?: () => void;
  onToggleFullscreen?: () => void;
}

interface ResetDetail {
  keepPlayers?: boolean;
  keepSequence?: boolean;
  keepBalances?: boolean;
}

const MAX_UNDO = 30;
const UI_KEY = 'bingo_planilla90_ui_v1';

/** Lee si el panel o la barra estaban visibles la última vez (null = sin dato). */
function readUiFlag(name: 'panel' | 'bar' | 'toolbar'): boolean | null {
  try {
    const raw = safeGetItem(UI_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return typeof obj[name] === 'boolean' ? (obj[name] as boolean) : null;
  } catch {
    return null;
  }
}

function writeUiFlag(name: 'panel' | 'bar' | 'toolbar', value: boolean): void {
  try {
    const raw = safeGetItem(UI_KEY);
    const obj = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    obj[name] = value;
    safeSetItem(UI_KEY, JSON.stringify(obj));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

/** Resumen de jugadores tal como se guarda junto con la partida. */
function toSnapshotSummaries(list: Planilla90PlayerSummary[]): PlayerSummarySnapshotItem[] {
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    textColor: p.textColor,
    totalGano: p.totalGano,
    debe: p.debe,
    total: p.total,
    paid: p.paid,
    currentWon: p.currentWon,
    isBingoWinner: p.isBingoWinner,
    isAmboWinner: p.isAmboWinner,
  }));
}

function fmtMoney(v: number | undefined): string {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export const Planilla90: React.FC<Planilla90Props> = ({
  currentUser,
  isAdmin,
  drawnBalls,
  currentMatchRound,
  savedGamesCount,
  isFullscreen,
  onBackToGame,
  onSwitchTo75,
  onOpenAdmin,
  onSaveCurrentGame,
  onStartNewGame,
  onOpenSavedGamesGallery,
  onToggleFullscreen,
}) => {
  const [sheet, setSheet] = useState<BingoSheetData>(() => loadPlanilla90());
  const [balances, setBalances] = useState<Planilla90Balances>(() => loadPlanilla90Balances());
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  // Panel y barra de ganadores se pueden ocultar; se recuerda la elección en este dispositivo
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    const saved = readUiFlag('panel');
    if (saved !== null) return saved;
    return typeof window === 'undefined' || window.innerWidth >= 900;
  });
  const [barOpen, setBarOpen] = useState<boolean>(() => readUiFlag('bar') ?? true);
  const [toolbarOpen, setToolbarOpen] = useState<boolean>(() => readUiFlag('toolbar') ?? true);
  useEffect(() => writeUiFlag('toolbar', toolbarOpen), [toolbarOpen]);
  useEffect(() => writeUiFlag('panel', panelOpen), [panelOpen]);
  useEffect(() => writeUiFlag('bar', barOpen), [barOpen]);
  const [toast, setToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const undoStack = useRef<BingoSheetData[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;

  // Guardado automático local de la planilla y de los saldos

  useEffect(() => {
    savePlanilla90Balances(balances);
  }, [balances]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 3200);
  }, []);

  /** Aplica un cambio a la planilla guardando el estado anterior para "Deshacer". */
  const update = useCallback((fn: (prev: BingoSheetData) => BingoSheetData) => {
    const prev = sheetRef.current;
    const next = fn(prev);
    if (next === prev) return;
    undoStack.current = [...undoStack.current.slice(-(MAX_UNDO - 1)), prev];
    setUndoCount(undoStack.current.length);
    setSheet(next);
  }, []);

  const handleUndo = () => {
    const last = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (last) setSheet(last);
  };

  // Datos derivados
  const drawnNumbers = useMemo(() => new Set((drawnBalls || []).map((b) => b.number)), [drawnBalls]);
  const players = useMemo(() => getPlanilla90Players(sheet), [sheet]);
  const autoBingoRow = useMemo(() => getFirstCompletedRow(drawnBalls || []), [drawnBalls]);
  const winningRows = useMemo(() => {
    const entry = sheet.activeSeqSlot ? sheet.customSeqEntries?.[sheet.activeSeqSlot] : undefined;
    const rows = getPlanilla90WinningRows(sheet, entry || null);
    // Si no se anotó el bingo, se usa la primera fila que el bolillero completó (sus 3 números cantados)
    if (rows.bingoRow === null && sheet.bingoEnabled !== false && autoBingoRow !== null) {
      rows.bingoRow = autoBingoRow;
    }
    return rows;
  }, [sheet, autoBingoRow]);
  const summaries = useMemo(() => getPlanilla90Summaries(sheet, winningRows, balances), [sheet, winningRows, balances]);
  const summariesRef = useRef(summaries);
  summariesRef.current = summaries;
  const lines = getPlanilla90Lines(sheet);

  // Guardado automático local: la planilla junto con el resumen de jugadores (lo usa "Nueva partida")
  useEffect(() => {
    savePlanilla90({
      ...sheet,
      playerSummaryList: toSnapshotSummaries(summaries),
    });
  }, [sheet, summaries]);

  // Nueva partida: guarda la planilla para "Mismos", pasa los saldos y deja las casillas vacías
  useEffect(() => {
    const onReset = (evt: Event) => {
      const detail = (evt as CustomEvent<ResetDetail>).detail || {};
      const keepPlayers = detail.keepPlayers ?? true;
      const keepSequence = detail.keepSequence ?? true;
      const keepBalances = detail.keepBalances ?? true;
      const current = sheetRef.current;
      savePreviousPlanilla90(current);

      if (!keepBalances) {
        setBalances({ won: {}, debt: {}, offsets: {} });
      } else {
        const won: Record<string, number> = {};
        const debt: Record<string, number> = {};
        setBalances((prev) => {
          Object.assign(won, prev.won);
          Object.assign(debt, prev.debt);
          summariesRef.current.forEach((p) => {
            const key = getPlayerKey(p.id, p.name);
            won[key] = p.totalGano;
            debt[key] = p.debe;
          });
          return { won, debt, offsets: {} };
        });
      }

      const cleared = clearPlanilla90Cells(current, keepPlayers);
      undoStack.current = [];
      setUndoCount(0);
      setSheet({
        ...cleared,
        customSeqEntries: keepSequence ? cleared.customSeqEntries : {},
        activeSeqSlot: undefined,
      });
    };
    window.addEventListener('bingo_reset_sheet_for_new_game', onReset);
    return () => window.removeEventListener('bingo_reset_sheet_for_new_game', onReset);
  }, []);

  // ---------- Casillas ----------
  const activePlayer = players.find((p) => p.id === activePlayerId) || null;

  const handleCellClick = (cIdx: number, rIdx: number) => {
    const cell = sheet.columns[cIdx]?.cells[rIdx];
    if (!cell) return;
    const occupied = Boolean(cell.playerId || cell.playerName);
    const occupiedKey = occupied ? getPlayerKey(cell.playerId, cell.playerName) : null;
    const activeKey = activePlayer ? getPlayerKey(activePlayer.id, activePlayer.name) : null;

    if (occupied && activeKey && occupiedKey !== activeKey) {
      notify(`Casilla de ${cell.playerName}. Para quitarla, deselecciona el jugador y tócala.`);
      return;
    }
    if (!occupied && !activePlayer) {
      notify('Primero elige un jugador en el panel (Jugadores).');
      setPanelOpen(true);
      return;
    }
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((col, ci) =>
        ci !== cIdx
          ? col
          : {
              ...col,
              cells: col.cells.map((c, ri) =>
                ri !== rIdx
                  ? c
                  : occupied
                  ? { rowNumber: c.rowNumber }
                  : {
                      rowNumber: c.rowNumber,
                      playerId: activePlayer!.id,
                      playerName: activePlayer!.name,
                      color: activePlayer!.color,
                      textColor: activePlayer!.textColor || getContrastTextColor(activePlayer!.color),
                      isPaid: false,
                    }
              ),
            }
      ),
    }));
  };

  const handleFillColumn = (cIdx: number) => {
    if (!activePlayer) return;
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((col, ci) =>
        ci !== cIdx
          ? col
          : {
              ...col,
              cells: col.cells.map((c) =>
                c.playerId || c.playerName
                  ? c
                  : {
                      rowNumber: c.rowNumber,
                      playerId: activePlayer.id,
                      playerName: activePlayer.name,
                      color: activePlayer.color,
                      textColor: activePlayer.textColor || getContrastTextColor(activePlayer.color),
                      isPaid: false,
                    }
              ),
            }
      ),
    }));
  };

  // ---------- Columnas ----------
  const setColumnMultiplier = (cIdx: number, m: number) =>
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((col, ci) => (ci === cIdx ? { ...col, multiplier: m, title: getMultiplierLabel(m) } : col)),
    }));

  const handleHeaderClick = (cIdx: number) => setColumnMultiplier(cIdx, getNextMultiplier(sheet.columns[cIdx]?.multiplier));

  const handleAddColumn = (m: number) => {
    if (sheet.columns.length >= PLANILLA90_MAX_COLUMNS) return;
    update((prev) => ({ ...prev, columns: [...prev.columns, createPlanilla90Column(prev.columns.length, m)] }));
  };

  const handleRemoveColumn = (cIdx: number) => {
    const col = sheet.columns[cIdx];
    if (!col || sheet.columns.length <= 1) return;
    const used = col.cells.some((c) => c.playerId || c.playerName);
    if (used && !window.confirm('Esta columna tiene casillas asignadas. ¿Quitarla de todas formas?')) return;
    update((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, ci) => ci !== cIdx).map((c, i) => ({ ...c, colNumber: i + 1 })),
    }));
  };

  const handleToggleDivider = (cIdx: number) =>
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((col, ci) => (ci === cIdx ? { ...col, hasRedDividerRight: !col.hasRedDividerRight } : col)),
    }));

  // ---------- Secuencia y tarifas ----------
  const handleSeqChange = (slot: number, field: Planilla90SeqField, raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, '').slice(0, 2);
    const n = cleaned ? parseInt(cleaned, 10) : NaN;
    const value = Number.isFinite(n) && n >= 1 && n <= 90 ? n : undefined;
    if (cleaned && value === undefined) {
      notify('La bola debe ser del 1 al 90.');
      return;
    }
    setSheet((prev) => {
      const entries = { ...(prev.customSeqEntries || {}) };
      const nextEntry = { ...(entries[slot] || {}), [field]: value };
      if (nextEntry.pf === undefined && nextEntry.ambo === undefined && nextEntry.bingo === undefined && nextEntry.terna === undefined) {
        delete entries[slot];
      } else {
        entries[slot] = nextEntry;
      }
      return { ...prev, customSeqEntries: entries, activeSeqSlot: slot };
    });
  };

  const handleSetRate = (field: Planilla90RateField, value: number) =>
    setSheet((prev) => ({ ...prev, [field]: value, ...(field === 'baseCost' ? { columnPrice: value } : {}) }));

  const handleToggleSeq = (field: Planilla90ToggleField) =>
    setSheet((prev) => ({
      ...prev,
      [field]: field === 'bingoEnabled' ? prev.bingoEnabled === false : !prev[field],
    }));

  // ---------- Jugadores ----------
  const handleAddPlayer = (rawName: string, chosenColor?: string) => {
    const name = sanitizePlayerName(rawName).toUpperCase();
    if (!name) return;
    const key = getPlayerKey(undefined, name);
    const existing = players.find((p) => getPlayerKey(p.id, p.name) === key);
    if (existing) {
      setActivePlayerId(existing.id);
      notify(`${name} ya está en la lista: quedó seleccionado.`);
      return;
    }
    const used = new Set(players.map((p) => p.color.toLowerCase()));
    const spec = VIBRANT_PLAYER_COLORS.find((c) => !used.has(c.hex.toLowerCase())) || VIBRANT_PLAYER_COLORS[players.length % VIBRANT_PLAYER_COLORS.length];
    // Si se eligió un color en la paleta del panel, se usa ese; si no, el siguiente libre
    const color = chosenColor || spec.hex;
    const player: BingoSheetPlayer = {
      id: `p90_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      color,
      textColor: chosenColor ? getContrastTextColor(chosenColor) : spec.text,
    };
    update((prev) => ({ ...prev, players: [...prev.players, player] }));
    setActivePlayerId(player.id);
  };

  const handleDeletePlayer = (id: string) => {
    const p = players.find((x) => x.id === id);
    if (!p) return;
    const key = getPlayerKey(p.id, p.name);
    const cells = sheet.columns.reduce((n, c) => n + c.cells.filter((cell) => getPlayerKey(cell.playerId, cell.playerName) === key && (cell.playerId || cell.playerName)).length, 0);
    if (cells > 0 && !window.confirm(`${p.name} tiene ${cells} casilla(s). ¿Quitarlo y vaciar sus casillas?`)) return;
    update((prev) => ({
      ...prev,
      players: prev.players.filter((x) => getPlayerKey(x.id, x.name) !== key),
      columns: prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((c) => ((c.playerId || c.playerName) && getPlayerKey(c.playerId, c.playerName) === key ? { rowNumber: c.rowNumber } : c)),
      })),
    }));
    if (activePlayerId === id) setActivePlayerId(null);
  };

  const handleSetPlayerColor = (id: string, color: string) => {
    const p = players.find((x) => x.id === id);
    if (!p) return;
    const key = getPlayerKey(p.id, p.name);
    const textColor = getContrastTextColor(color);
    update((prev) => {
      const inList = prev.players.some((x) => getPlayerKey(x.id, x.name) === key);
      return {
        ...prev,
        players: inList
          ? prev.players.map((x) => (getPlayerKey(x.id, x.name) === key ? { ...x, color, textColor } : x))
          : [...prev.players, { ...p, color, textColor }],
        columns: prev.columns.map((col) => ({
          ...col,
          cells: col.cells.map((c) => ((c.playerId || c.playerName) && getPlayerKey(c.playerId, c.playerName) === key ? { ...c, color, textColor } : c)),
        })),
      };
    });
  };

  const runMismos = (target?: BingoSheetPlayer) => {
    const previous = getPreviousPlanilla90(currentUser, currentMatchRound);
    if (!previous) {
      notify('No se encontró la partida 90 anterior para copiar los mismos.');
      return;
    }
    const result = executeMismosReconstruction({
      currentSheet: sheet,
      previousSheet: previous,
      targetPlayerIdOrName: target ? target.name || target.id : undefined,
      baseCost: sheet.baseCost,
      basePrize: sheet.basePrize,
    });
    if (result.success && (result.totalAssigned > 0 || result.newPlayersAdded > 0)) {
      update((prev) => normalizePlanilla90({ ...prev, columns: result.updatedColumns, players: result.updatedPlayers }));
    }
    notify(result.message);
  };

  const handleMarkPaid = (id: string) => {
    const p = players.find((x) => x.id === id);
    if (!p) return;
    const key = getPlayerKey(p.id, p.name);
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((c) => ((c.playerId || c.playerName) && getPlayerKey(c.playerId, c.playerName) === key ? { ...c, isPaid: true } : c)),
      })),
    }));
    setBalances((prev) => ({ ...prev, debt: { ...prev.debt, [key]: 0 } }));
    notify(`${p.name}: pago registrado.`);
  };

  const handleClearWon = (id: string) => {
    const s = summaries.find((x) => x.id === id);
    if (!s) return;
    const key = getPlayerKey(s.id, s.name);
    setBalances((prev) => ({
      ...prev,
      won: { ...prev.won, [key]: 0 },
      offsets: { ...prev.offsets, [key]: (prev.offsets[key] || 0) + s.currentWon },
    }));
    notify(`${s.name}: premio entregado.`);
  };

  /** Botón $0 del TOTAL: pagó lo que debía y se le entregó lo ganado (saldo en cero). */
  const handleResetTotal = (id: string) => {
    const s = summaries.find((x) => x.id === id);
    if (!s) return;
    const key = getPlayerKey(s.id, s.name);
    update((prev) => ({
      ...prev,
      columns: prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((c) => ((c.playerId || c.playerName) && getPlayerKey(c.playerId, c.playerName) === key ? { ...c, isPaid: true } : c)),
      })),
    }));
    setBalances((prev) => ({
      won: { ...prev.won, [key]: 0 },
      debt: { ...prev.debt, [key]: 0 },
      offsets: { ...prev.offsets, [key]: (prev.offsets[key] || 0) + s.currentWon },
    }));
    notify(`${s.name}: saldo en $0.`);
  };

  // ---------- Guardar ----------
  const handleSave = async () => {
    if (!onSaveCurrentGame || isSaving) return;
    setIsSaving(true);
    try {
      const snapshot: BingoSheetData = { ...normalizePlanilla90(sheet), playerSummaryList: toSnapshotSummaries(summaries) };
      const res = await onSaveCurrentGame(snapshot);
      notify(res && res.verified ? `¡Partida #${res.game.round} guardada!` : 'Partida guardada.');
    } catch (err) {
      console.error('Error guardando la partida 90:', err);
      notify(err instanceof Error && err.message ? err.message : 'Error al guardar la partida.');
    } finally {
      setIsSaving(false);
    }
  };

  const tb = 'inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black border transition-all active:scale-95 cursor-pointer whitespace-nowrap';
  const amboOn = Boolean(sheet.amboEnabled);
  const pfOn = Boolean(sheet.pfEnabled);
  const nextSlot = getFirstEmptySeqSlot(sheet.customSeqEntries);

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[#fffaf5] overflow-hidden" style={{ height: '100dvh' }}>
      {/* Barra de botones compacta (se puede ocultar) */}
      {!toolbarOpen && (
        <button
          type="button"
          onClick={() => setToolbarOpen(true)}
          className="no-print fixed top-1 right-1 z-40 px-2 py-0.5 rounded-md border-2 border-black bg-orange-500 text-white text-[10px] font-black shadow-lg opacity-60 hover:opacity-100 cursor-pointer"
          title="Mostrar los botones de arriba"
        >
          ▼ BOTONES
        </button>
      )}
      {toolbarOpen && (
      <div className="no-print flex-shrink-0 flex items-center gap-1 px-1 py-1 bg-[#fffaf5] border-b border-orange-200 overflow-x-auto">
        <button type="button" onClick={onBackToGame} className={`${tb} bg-orange-100 text-orange-950 border-orange-300`} title="Volver al bolillero">
          <ArrowLeft className="w-3.5 h-3.5" /> Bolillero
        </button>
        <SyncStatusIndicator compact />
        {isAdmin && onSwitchTo75 && (
          <button type="button" onClick={onSwitchTo75} className={`${tb} bg-white text-orange-950 border-orange-300`} title="Cambiar a la Planilla 75">
            <Grid className="w-3.5 h-3.5" /> Planilla 75
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={() => runMismos()} className={`${tb} bg-blue-600 text-white border-blue-700`} title="Mismas casillas de la partida anterior para todos">
          <Copy className="w-3.5 h-3.5" /> Mismos
        </button>
        <button type="button" onClick={handleUndo} disabled={undoCount === 0} className={`${tb} bg-white text-slate-800 border-slate-300 disabled:opacity-40`} title="Deshacer">
          <Undo className="w-3.5 h-3.5" /> Deshacer
        </button>
        {onSaveCurrentGame && (
          <button type="button" onClick={handleSave} disabled={isSaving} className={`${tb} bg-emerald-600 text-white border-emerald-700 disabled:opacity-60`} title="Guardar la partida">
            <Save className="w-3.5 h-3.5" /> {isSaving ? 'Guardando…' : 'Guardar'}
          </button>
        )}
        {onOpenSavedGamesGallery && (
          <button type="button" onClick={onOpenSavedGamesGallery} className={`${tb} bg-amber-400 text-amber-950 border-amber-500`} title="Partidas guardadas">
            <FolderOpen className="w-3.5 h-3.5" /> Partidas{savedGamesCount ? ` (${savedGamesCount})` : ''}
          </button>
        )}
        {onStartNewGame && (
          <button type="button" onClick={onStartNewGame} className={`${tb} bg-orange-500 text-white border-orange-600`} title="Nueva partida">
            <Plus className="w-3.5 h-3.5" /> Nueva
          </button>
        )}
        {isAdmin && onOpenAdmin && (
          <button type="button" onClick={onOpenAdmin} className={`${tb} bg-slate-800 text-white border-slate-900`} title="Panel de administración">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin
          </button>
        )}
        {onToggleFullscreen && (
          <button type="button" onClick={onToggleFullscreen} className={`${tb} bg-white text-slate-800 border-slate-300`} title="Pantalla completa">
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => setBarOpen((v) => !v)}
          className={`${tb} ${barOpen ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-orange-950 border-orange-300'}`}
          title="Mostrar u ocultar la barra de ganadores"
        >
          {barOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} Ganadores
        </button>
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          className={`${tb} ${panelOpen ? 'bg-orange-500 text-white border-orange-600' : 'bg-white text-orange-950 border-orange-300'}`}
          title="Mostrar u ocultar el panel"
        >
          <Settings className="w-3.5 h-3.5" /> Panel
        </button>
        <button
          type="button"
          onClick={() => setToolbarOpen(false)}
          className={`${tb} bg-black text-yellow-300 border-black`}
          title="Ocultar esta fila de botones"
        >
          <EyeOff className="w-3.5 h-3.5" /> Ocultar
        </button>
      </div>
      )}

      {/* Planilla + panel */}
      <div className="flex-1 min-h-0 flex gap-1 p-1 relative">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Encabezado: premios a la izquierda y el título centrado en el resto */}
          <div className="flex-shrink-0 flex items-stretch border-[3px] border-b-0 border-black bg-white" style={{ fontSize: 'clamp(14px, 3.2vh, 38px)' }}>
            <div className="flex items-center gap-[0.5em] px-2 bg-[#facc15] font-black text-black whitespace-nowrap" style={{ fontSize: '0.8em' }}>
              <span>GANA:</span>
              {pfOn && <span>P.F {fmtMoney(sheet.basePfPrize)}</span>}
              {amboOn && <span>AMBO {fmtMoney(sheet.baseAmboPrize)}</span>}
              {sheet.bingoEnabled !== false && <span>BINGO {fmtMoney(sheet.basePrize)}</span>}
              <span className="px-1.5 rounded bg-[#581c87] text-white">{lines} LÍN</span>
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-center px-2 font-black uppercase text-black truncate">
              {sheet.title}
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <Planilla90Grid
              sheet={sheet}
              drawnNumbers={drawnNumbers}
              winningRows={winningRows}
              fill
              activeSeqSlot={sheet.activeSeqSlot ?? nextSlot}
              onCellClick={handleCellClick}
              onHeaderClick={handleHeaderClick}
              onSeqChange={handleSeqChange}
              onNumberClick={(n) => update((prev) => togglePlanilla90Mark(prev, n))}
            />
          </div>

          {barOpen ? (
            <div style={{ height: 'clamp(92px, 15vh, 190px)' }} className="flex-shrink-0 flex">
              <Planilla90SummaryBar
                summaries={summaries}
                selectedPlayerId={activePlayerId}
                onPlayerClick={(id) => setActivePlayerId((cur) => (cur === id ? null : id))}
                onClearWon={handleClearWon}
                onMarkPaid={handleMarkPaid}
                onResetTotal={handleResetTotal}
                onHide={() => setBarOpen(false)}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBarOpen(true)}
              className="no-print flex-shrink-0 w-full py-0.5 border-[3px] border-t-0 border-black bg-black text-yellow-300 text-[11px] font-black tracking-wide cursor-pointer hover:bg-zinc-800"
              title="Mostrar la barra de ganadores"
            >
              ▲ GANADORES
            </button>
          )}
        </div>

        {!panelOpen && (
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="no-print flex-shrink-0 w-5 rounded-l-lg border-2 border-black bg-orange-500 text-white font-black text-[11px] cursor-pointer hover:bg-orange-600 flex items-center justify-center"
            style={{ writingMode: 'vertical-rl' }}
            title="Mostrar el panel"
          >
            ◀ PANEL
          </button>
        )}
        {panelOpen && (
          <div className="w-[215px] max-w-[80vw] flex-shrink-0 min-h-0 max-[899px]:absolute max-[899px]:right-1 max-[899px]:top-1 max-[899px]:bottom-1 max-[899px]:z-20 max-[899px]:shadow-2xl">
            <Planilla90Panel
              sheet={sheet}
              players={players}
              summaries={summaries}
              activePlayerId={activePlayerId}
              onSelectPlayer={setActivePlayerId}
              onAddPlayer={handleAddPlayer}
              onDeletePlayer={handleDeletePlayer}
              onSetPlayerColor={handleSetPlayerColor}
              onMismos={(p) => runMismos(p)}
              onMismosAll={() => runMismos()}
              onFillColumn={handleFillColumn}
              onAddColumn={handleAddColumn}
              onRemoveColumn={handleRemoveColumn}
              onSetColumnMultiplier={setColumnMultiplier}
              onToggleDivider={handleToggleDivider}
              onSetRate={handleSetRate}
              onToggleSeq={handleToggleSeq}
              onSetTitle={(title) => setSheet((prev) => ({ ...prev, title }))}
              onMarkPaid={handleMarkPaid}
              onClearWon={handleClearWon}
            />
          </div>
        )}

        {activePlayer && (
          <div
            className="no-print absolute left-1/2 -translate-x-1/2 top-1 z-20 px-3 py-1 rounded-full border-2 border-black font-black text-sm shadow-lg pointer-events-none"
            style={{ backgroundColor: activePlayer.color, color: activePlayer.textColor || getContrastTextColor(activePlayer.color) }}
          >
            Asignando: {activePlayer.name}
          </div>
        )}
      </div>

      {toast && (
        <div className="no-print fixed top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
};
