import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BingoSheetData,
  BingoSheetPlayer,
  BingoSheetColumn,
  BingoSheetCell,
  AppUser,
  GameSequenceItem,
  BingoMode,
  Ball,
  SheetViewType,
  GameSettings,
  PlatformColor,
  GameObjectives,
} from '../types';
import { PlatformColorBar } from './PlatformColorBar';
import {
  Printer,
  Trash2,
  Camera,
  Check,
  Users,
  Grid,
  ArrowLeft,
  FileSpreadsheet,
  Settings2,
  TrendingUp,
  Calculator,
  Edit3,
  Sparkles,
  Smartphone,
  Maximize2,
  Minimize2,
  Palette,
  Layers,
  ShieldCheck,
  UserPlus,
  Lock,
  LogIn,
  Plus,
  Minus,
  X,
  Coins,
  Trophy,
  Award,
  Table2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Play,
  DollarSign,
  Type,
  EyeOff,
} from 'lucide-react';
import { SheetBackgroundSettings } from './SheetBackgroundSettings';
import { SHEET_BACKGROUND_PRESETS } from '../utils/sheetBackgroundPresets';
import { GameSequenceBar } from './GameSequenceBar';
import { BingoWinningRowBanner } from './BingoWinningRowBanner';
import { BingoTraditional90Sheet } from './BingoTraditional90Sheet';
import { GameSheetSnapshotModal } from './GameSheetSnapshotModal';
import { VIBRANT_PLAYER_COLORS, FLUORESCENT_TEXT_COLORS, getContrastTextColor } from '../utils/playerColors';
import {
  getPreviousPlayerCells75,
  getPreviousPlayerRowValues75,
  savePreviousGameSheet75,
  getPreviousGameResultItem,
} from '../utils/gameSnapshotStorage';
import {
  getOperatorActiveLines,
} from '../utils/shiftsStorage';
import { safeSetItem } from '../utils/safeStorage';
import { getOperatorStorageKey } from '../utils/savedGamesStorage';
import { sanitizePlayerName } from '../utils/security';

interface BingoSheetBuilderProps {
  onBackToGame: () => void;
  currentUser?: AppUser | null;
  onOpenLogin?: () => void;
  onOpenAdmin?: () => void;
  completedRowLeaders?: number[];
  winningBall?: number | null;
  gameSequence?: GameSequenceItem[];
  onAddSequenceItem?: (ballNumber: number, rowLeader?: number, ternaBall?: number) => void;
  onClearSequence?: () => void;
  mode?: BingoMode;
  drawnBalls?: Ball[];
  onStopBolillero?: () => void;
  onBingoCompleted?: (info: {
    rowNumber: number;
    numbers: [number, number, number];
    tableNumber: number;
    playerName?: string;
  }) => void;
  initialSheetType?: SheetViewType;
  onSheetTypeChange?: (sheetType: SheetViewType) => void;
  autoHighlightDrawn?: boolean;
  onToggleAutoHighlightDrawn?: (val: boolean) => void;
  onOpenGameSnapshot?: (item: GameSequenceItem) => void;
  onStartNewGame?: () => void;
  onSaveCurrentGame?: () => void;
  currentBall?: Ball | null;
  onDrawBall?: () => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onResetGame?: () => void;
  settings?: GameSettings;
  onUpdateSettings?: (newSettings: GameSettings) => void;
  gameSequence90?: GameSequenceItem[];
  onClearSequence90?: () => void;
  onSelectMode?: (mode: BingoMode) => void;
  totalBalls?: number;
  onOpenSavedGamesGallery?: () => void;
  savedGamesCount?: number;
  platformColor?: PlatformColor;
  onSelectPlatformColor?: (color: PlatformColor) => void;
  currentMatchRound?: number;
  currentMatchAmboBall?: number | null;
  currentMatchAmboRow?: number | null;
  currentMatchTernaBall?: number | null;
  currentMatchBingoBall?: number | null;
  currentMatchTernaRow?: number | null;
  currentMatchBingoRow?: number | null;
  gameObjectives?: GameObjectives;
  onToggleObjective?: (key: 'bingo' | 'terna' | 'ambo') => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

// Colores vivos, brillantes y saturados para los jugadores (no pasteles)
const PRESET_COLORS = VIBRANT_PLAYER_COLORS;

/**
 * Calculates adaptive font size and letter tracking for player names in cells
 * so the name spans the full available cell space and scales down smoothly.
 */
interface CellNameStyleResult {
  className: string;
  style: React.CSSProperties;
}

/**
 * Intelligent adaptive font sizing and wrapping for player names.
 * Ensures player names NEVER get cut off or truncated with ellipsis (...),
 * regardless of text length, column count, expanded/reduced mode, or user font slider.
 */
const getAdaptiveCellNameStyle = (
  name?: string,
  colCount: number = 6,
  isExpanded: boolean = false,
  scalePercent: number = 100,
  customTextColor?: string
): CellNameStyleResult => {
  const isLightText = Boolean(
    customTextColor &&
    customTextColor.toLowerCase() !== '#000000' &&
    customTextColor.toLowerCase() !== '#1e293b'
  );

  if (!name) {
    return {
      className: 'text-xs font-black uppercase block w-full text-center leading-tight',
      style: {
        color: customTextColor || '#000000',
        textShadow: isLightText
          ? '0 1px 2px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.95)'
          : undefined,
      },
    };
  }

  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const totalLen = trimmed.length;
  const maxWordLen = words.reduce((max, w) => Math.max(max, w.length), 0);
  const scale = scalePercent / 100;

  // Approximate available text width per cell based on real table dimensions
  const totalSheetWidth = isExpanded ? 1160 : 920;
  const seqColWidthEstimated = 110;
  const availableColsWidth = Math.max(480, totalSheetWidth - seqColWidthEstimated);
  const approxColWidth = availableColsWidth / Math.max(colCount, 1);

  // Available horizontal text width inside cell (accounting for number badge ~20px + thin separation margin)
  const availableTextWidth = Math.max(30, approxColWidth - 23);

  // If name has multiple words and is longer than 6 characters, wrap across 2 lines
  const hasMultipleWords = words.length > 1;
  const shouldWrap = hasMultipleWords && totalLen > 6;

  // Character width factor for bold uppercase font (Outfit/Inter/Sans font-black)
  const charFactor = 0.62;

  // Maximum font size in px that can physically fit horizontally without ANY truncation
  const limitingLen = shouldWrap ? Math.max(maxWordLen, 3) : Math.max(totalLen, 3);
  const maxFittingPx = availableTextWidth / (limitingLen * charFactor);

  // Preferred font size based on column count
  let preferredPx: number;
  if (shouldWrap) {
    if (colCount >= 10) preferredPx = 9;
    else if (colCount >= 7) preferredPx = 10;
    else if (colCount >= 5) preferredPx = 11.5;
    else preferredPx = 13.5;
  } else {
    if (colCount >= 10) {
      if (totalLen > 9) preferredPx = 8.5;
      else if (totalLen > 7) preferredPx = 9.5;
      else if (totalLen > 5) preferredPx = 11;
      else preferredPx = 12.5;
    } else if (colCount >= 7) {
      if (totalLen > 9) preferredPx = 9.5;
      else if (totalLen > 7) preferredPx = 10.5;
      else if (totalLen > 5) preferredPx = 12;
      else preferredPx = 13.5;
    } else {
      if (totalLen > 9) preferredPx = 11;
      else if (totalLen > 7) preferredPx = 13;
      else if (totalLen > 5) preferredPx = 15;
      else preferredPx = 18;
    }
  }

  // Apply user scale factor
  const scaledPx = preferredPx * scale;

  // STRICT GUARANTEE: Never allow scaledPx to exceed maxFittingPx!
  // This guarantees that text will NEVER overflow the cell boundaries or truncate!
  const finalPx = Math.max(7, Math.min(scaledPx, maxFittingPx));

  return {
    className: 'font-black uppercase block w-full text-center leading-none select-none tracking-tight',
    style: {
      color: customTextColor || '#000000',
      textShadow: isLightText
        ? '0 1px 2px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.95)'
        : undefined,
      fontSize: `${finalPx.toFixed(1)}px`,
      lineHeight: shouldWrap ? '0.94' : '1.05',
      letterSpacing: totalLen > 8 ? '-0.035em' : totalLen > 6 ? '-0.02em' : '-0.01em',
      whiteSpace: shouldWrap ? 'normal' : 'nowrap',
      wordBreak: shouldWrap ? 'break-word' : 'normal',
      overflowWrap: shouldWrap ? 'break-word' : 'normal',
    },
  };
};

const getCellNameStyle = (
  name?: string,
  colCount: number = 6,
  isExpanded: boolean = false,
  customTextColor?: string
): string => {
  return getAdaptiveCellNameStyle(name, colCount, isExpanded, 100, customTextColor).className;
};

/**
 * Generates a vibrant, high-intensity neon version of the player's/cell's assigned color.
 * Preserves the exact hue/family of the cell but ensures 100% saturation and optimal neon luminescence.
 */
const getVibrantNeonColor = (colorStr?: string): string => {
  if (!colorStr || colorStr === 'transparent') {
    return '#00f0ff'; // Vibrant neon cyan fallback
  }

  const clean = colorStr.trim();
  if (clean.startsWith('hsl')) {
    return clean;
  }

  // Parse HEX
  const hex = clean.replace(/^#/, '');
  let r = 0, g = 0, b = 0;

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return clean;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return clean;
  }

  // Convert RGB to HSL
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  const hueDeg = Math.round(h * 360);
  const isYellowOrAmber = hueDeg >= 40 && hueDeg <= 68;
  const neonLightness = isYellowOrAmber ? 48 : 50;

  return `hsl(${hueDeg}, 100%, ${neonLightness}%)`;
};

const getCanonicalPlayerKey = (id?: string, name?: string): string => {
  if (name && name.trim()) return name.trim().toLowerCase();
  if (id && id.trim()) return id.trim().toLowerCase();
  return 'anon';
};

const STORAGE_KEY = 'bingo_custom_sheet_data_v5';

export const BingoSheetBuilder: React.FC<BingoSheetBuilderProps> = ({
  onBackToGame,
  currentUser,
  onOpenLogin,
  onOpenAdmin,
  completedRowLeaders = [],
  winningBall = null,
  gameSequence = [],
  onAddSequenceItem,
  onClearSequence,
  mode = '75',
  drawnBalls = [],
  onStopBolillero,
  onBingoCompleted,
  initialSheetType,
  onSheetTypeChange,
  autoHighlightDrawn,
  onToggleAutoHighlightDrawn,
  onOpenGameSnapshot,
  onStartNewGame,
  onSaveCurrentGame,
  currentBall,
  onDrawBall,
  isPlaying,
  onTogglePlay,
  onResetGame,
  settings,
  onUpdateSettings,
  gameSequence90,
  onClearSequence90,
  onSelectMode,
  totalBalls = 90,
  onOpenSavedGamesGallery,
  savedGamesCount,
  platformColor,
  onSelectPlatformColor,
  currentMatchRound = 1,
  currentMatchAmboBall = null,
  currentMatchAmboRow = null,
  currentMatchTernaBall = null,
  currentMatchBingoBall = null,
  currentMatchTernaRow = null,
  currentMatchBingoRow = null,
  gameObjectives,
  onToggleObjective,
  isFullscreen = false,
  onToggleFullscreen,
}) => {
  // Sheet type selector: 15-row Multipliers OR Traditional 90 Triples (from photo)
  const isAdmin = currentUser?.role === 'admin';
  const assignedMode = currentUser?.assignedMode || (isAdmin ? 'all' : (mode === '90' ? '90' : '75'));

  const [selectedSheetType, setSelectedSheetType] = useState<SheetViewType>(() => {
    if (!isAdmin && assignedMode) {
      return assignedMode === '90' ? 'traditional-90' : 'multipliers-15';
    }
    return initialSheetType || 'multipliers-15';
  });

  // Collapsible top navigation header for maximum vertical viewport space
  const [areTopNavsHidden, setAreTopNavsHidden] = useState<boolean>(false);

  // Amplified Fullscreen Sheet View for 15-row format (compact collapsible sidebar, horizontal sequence, and maximized sheet)
  const [is15SheetExpanded, setIs15SheetExpanded] = useState<boolean>(false);
  // When 15-row sheet is expanded, left panel can be collapsed and opened on demand
  const [is15PanelCollapsed, setIs15PanelCollapsed] = useState<boolean>(false);
  // Toggle for top font size adjustment bar and results button above the sheet (can be completely hidden and reopened)
  const [isTopAdjustmentBarVisible, setIsTopAdjustmentBarVisible] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bingo_top_adjust_bar_visible');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const handleToggleTopAdjustmentBar = (visible: boolean) => {
    setIsTopAdjustmentBarVisible(visible);
    try {
      localStorage.setItem('bingo_top_adjust_bar_visible', JSON.stringify(visible));
    } catch {
      // Ignore localStorage errors
    }
  };

  // Undo history stack for up to 4 moves / actions
  const [sheetUndoStack, setSheetUndoStack] = useState<BingoSheetColumn[][]>([]);

  // Direct modal for viewing previous game results
  const [directPreviousGameItem, setDirectPreviousGameItem] = useState<GameSequenceItem | null>(null);

  // Manual text font size scale slider for sheet cells (70% to 150%, default 100%)
  const [cellFontSizeScale, setCellFontSizeScale] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bingo_sheet_cell_font_scale');
        return saved ? Number(saved) : 100;
      } catch {
        return 100;
      }
    }
    return 100;
  });

  const handleCellFontSizeChange = (val: number) => {
    const clamped = Math.max(70, Math.min(150, Math.round(val)));
    setCellFontSizeScale(clamped);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('bingo_sheet_cell_font_scale', String(clamped));
      } catch {
        // ignore
      }
    }
  };

  // Custom Sequence manual overrides per row (Terna & Bingo) - Isolated per operator
  const [customSeqEntries, setCustomSeqEntries] = useState<Record<number, { ambo?: number | string; terna?: number | string; bingo?: number | string }>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const key = getOperatorStorageKey('bingo_sheet_custom_sequence', currentUser);
        const saved = localStorage.getItem(key) || localStorage.getItem('bingo_sheet_custom_sequence');
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  // Reload custom sequence whenever operator signs in or changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const key = getOperatorStorageKey('bingo_sheet_custom_sequence', currentUser);
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        setCustomSeqEntries(JSON.parse(saved));
        return;
      }
      if (!currentUser) {
        const legacy = localStorage.getItem('bingo_sheet_custom_sequence');
        if (legacy) {
          setCustomSeqEntries(JSON.parse(legacy));
          return;
        }
      }
    } catch {}
    setCustomSeqEntries({});
  }, [currentUser]);

  // Find the first empty row in the sequence table (1..15)
  // "la secuencia debe anotarse desde la primera fila vacia, no la segunda"
  const activeSequenceRow = useMemo(() => {
    const total = 15;
    for (let r = 1; r <= total; r++) {
      const custom = customSeqEntries[r];
      const hasCustom = custom && (custom.ambo !== undefined || custom.terna !== undefined || custom.bingo !== undefined);
      // Check if this row has an archived game sequence item
      const seqItem =
        (gameSequence && gameSequence[r - 1]) ||
        gameSequence?.find((g) => g.round === r);
      const hasSeq = Boolean(
        seqItem &&
        (seqItem.amboLeader !== undefined ||
         seqItem.ternaLeader !== undefined ||
         seqItem.rowLeader !== undefined ||
         seqItem.ballNumber !== undefined)
      );
      if (!hasCustom && !hasSeq) {
        return r;
      }
    }
    return 1;
  }, [customSeqEntries, gameSequence]);

  // Modal to edit sequence (Ambo, Terna & Bingo) for a row
  const [editingSeqRowModal, setEditingSeqRowModal] = useState<number | null>(null);
  const [seqModalAmbo, setSeqModalAmbo] = useState<string>('');
  const [seqModalTerna, setSeqModalTerna] = useState<string>('');
  const [seqModalBingo, setSeqModalBingo] = useState<string>('');

  const handleOpenEditSeqRow = (rowNum: number) => {
    setEditingSeqRowModal(rowNum);
    const existing = customSeqEntries[rowNum];
    const seqItem = gameSequence && gameSequence[rowNum - 1];
    setSeqModalAmbo(
      existing?.ambo !== undefined
        ? String(existing.ambo)
        : seqItem?.amboLeader !== undefined
        ? String(seqItem.amboLeader)
        : seqItem?.amboBall
        ? String(((seqItem.amboBall - 1) % 15) + 1)
        : ''
    );
    setSeqModalTerna(
      existing?.terna !== undefined
        ? String(existing.terna)
        : seqItem?.ternaLeader !== undefined
        ? String(seqItem.ternaLeader)
        : seqItem?.ternaBall
        ? String(((seqItem.ternaBall - 1) % 15) + 1)
        : ''
    );
    setSeqModalBingo(
      existing?.bingo !== undefined
        ? String(existing.bingo)
        : seqItem?.rowLeader !== undefined
        ? String(seqItem.rowLeader)
        : seqItem?.ballNumber
        ? String(((seqItem.ballNumber - 1) % 15) + 1)
        : ''
    );
  };

  const handleSaveSeqRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSeqRowModal === null) return;
    const aVal = seqModalAmbo.trim() ? parseInt(seqModalAmbo.trim(), 10) : undefined;
    const tVal = seqModalTerna.trim() ? parseInt(seqModalTerna.trim(), 10) : undefined;
    const bVal = seqModalBingo.trim() ? parseInt(seqModalBingo.trim(), 10) : undefined;

    setCustomSeqEntries((prev) => {
      const next = { ...prev };
      if (aVal === undefined && tVal === undefined && bVal === undefined) {
        delete next[editingSeqRowModal];
      } else {
        next[editingSeqRowModal] = {
          ambo: isNaN(aVal!) ? undefined : aVal,
          terna: isNaN(tVal!) ? undefined : tVal,
          bingo: isNaN(bVal!) ? undefined : bVal,
        };
      }
      try {
        const opKey = getOperatorStorageKey('bingo_sheet_custom_sequence', currentUser);
        localStorage.setItem(opKey, JSON.stringify(next));
        localStorage.setItem('bingo_sheet_custom_sequence', JSON.stringify(next));
      } catch (err) {
        console.error(err);
      }
      return next;
    });

    notify(
      `Secuencia Fila #${editingSeqRowModal}:${aVal !== undefined ? ` Ambo=${aVal},` : ''} Terna=${tVal ?? '-'}, Bingo=${bVal ?? '-'}`
    );
    setEditingSeqRowModal(null);
  };

  // Reset individual player balance (Ganó = 0, Debe = 0, Total = 0)
  // Handles situations where the player has already been paid their winnings or settled their debt
  const handleResetIndividualPlayerBalance = (playerId: string, playerName: string) => {
    const cKey = getCanonicalPlayerKey(playerId, playerName);
    const pNameKey = playerName.toLowerCase().trim();

    // 1. Reset cumulative winnings for this player
    setPlayerCumulativeWinnings((prev) => {
      const updated = {
        ...prev,
        [cKey]: 0,
        [playerId]: 0,
        [pNameKey]: 0,
        [playerName]: 0,
      };
      try {
        localStorage.setItem('bingo_player_cumulative_winnings_v2', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 2. Reset cumulative debt for this player
    setPlayerCumulativeDebt((prev) => {
      const updated = {
        ...prev,
        [cKey]: 0,
        [playerId]: 0,
        [pNameKey]: 0,
        [playerName]: 0,
      };
      try {
        localStorage.setItem('bingo_player_cumulative_debt_v2', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 3. Mark current match winnings as paid out (offsetting any active round winnings)
    setPlayerPayoutOffsets((prev) => {
      const updated = {
        ...prev,
        [cKey]: 999999,
        [playerId]: 999999,
        [pNameKey]: 999999,
        [playerName]: 999999,
      };
      try {
        localStorage.setItem('bingo_player_payout_offsets_v1', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    // 4. Mark player's cells in the current sheet as paid (so curDebt becomes 0)
    setSheet((prev) => {
      const updatedPlayers = prev.players.map((p) =>
        p.id === playerId || p.name.toLowerCase().trim() === pNameKey
          ? { ...p, paid: true }
          : p
      );
      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) =>
          cell.playerId === playerId ||
          (cell.playerName && cell.playerName.toLowerCase().trim() === pNameKey)
            ? { ...cell, isPaid: true }
            : cell
        ),
      }));
      return {
        ...prev,
        players: updatedPlayers,
        columns: updatedColumns,
      };
    });

    notify(`¡Saldo de ${playerName.toUpperCase()} reiniciado a $0.00! Marcado como liquidado y pagado.`);
    setEditingPlayerBalance(null);
  };

  const handleSavePlayerBalance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlayerBalance) return;

    const ganoVal = parseFloat(manualGanoStr.replace(',', '.'));
    const debeVal = parseFloat(manualDebeStr.replace(',', '.'));

    const finalGano = isNaN(ganoVal) ? 0 : Math.max(0, ganoVal);
    const finalDebe = isNaN(debeVal) ? 0 : Math.max(0, debeVal);

    const cKey = getCanonicalPlayerKey(editingPlayerBalance.id, editingPlayerBalance.name);
    const pNameKey = editingPlayerBalance.name.toLowerCase().trim();

    if (finalGano === 0) {
      setPlayerPayoutOffsets((prev) => ({
        ...prev,
        [cKey]: 999999,
        [editingPlayerBalance.id]: 999999,
        [pNameKey]: 999999,
      }));
    } else {
      setPlayerPayoutOffsets((prev) => {
        const updated = { ...prev };
        delete updated[cKey];
        delete updated[editingPlayerBalance.id];
        delete updated[pNameKey];
        return updated;
      });
    }

    // Consolidate current cells so partial or full payments don't double count board cells
    setSheet((prev) => {
      const updatedPlayers = prev.players.map((p) =>
        p.id === editingPlayerBalance.id || p.name.toLowerCase().trim() === pNameKey
          ? { ...p, paid: finalDebe === 0 }
          : p
      );
      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) =>
          cell.playerId === editingPlayerBalance.id ||
          (cell.playerName && cell.playerName.toLowerCase().trim() === pNameKey)
            ? { ...cell, isPaid: true }
            : cell
        ),
      }));
      return { ...prev, players: updatedPlayers, columns: updatedColumns };
    });

    setPlayerCumulativeWinnings((prev) => {
      const next = {
        ...prev,
        [cKey]: finalGano,
        [editingPlayerBalance.id]: finalGano,
        [pNameKey]: finalGano,
        [editingPlayerBalance.name]: finalGano,
      };
      try {
        localStorage.setItem('bingo_player_cumulative_winnings_v2', JSON.stringify(next));
      } catch (err) {
        console.error(err);
      }
      return next;
    });

    setPlayerCumulativeDebt((prev) => {
      const next = {
        ...prev,
        [cKey]: finalDebe,
        [editingPlayerBalance.id]: finalDebe,
        [pNameKey]: finalDebe,
        [editingPlayerBalance.name]: finalDebe,
      };
      try {
        localStorage.setItem('bingo_player_cumulative_debt_v2', JSON.stringify(next));
      } catch (err) {
        console.error(err);
      }
      return next;
    });

    // Record transaction history
    try {
      const historyRaw = localStorage.getItem('bingo_player_balance_history') || '[]';
      const historyArr = JSON.parse(historyRaw);
      historyArr.unshift({
        id: `tx_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toISOString().split('T')[0],
        playerId: editingPlayerBalance.id,
        playerName: editingPlayerBalance.name,
        gano: finalGano,
        debe: finalDebe,
        saldo: finalGano - finalDebe,
        operator: currentUser?.name || 'Operador',
      });
      // Keep last 100 transactions
      localStorage.setItem('bingo_player_balance_history', JSON.stringify(historyArr.slice(0, 100)));
    } catch (e) {
      console.warn('Balance history save warning:', e);
    }

    notify(`Saldo de "${editingPlayerBalance.name}" actualizado: Ganó $${finalGano.toFixed(2)}, Debe $${finalDebe.toFixed(2)}, Total: $${(finalGano - finalDebe).toFixed(2)}`);
    setEditingPlayerBalance(null);
  };

  // Allow pressing Escape to exit expanded fullscreen sheet view in 15-row format
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && is15SheetExpanded) {
        setIs15SheetExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [is15SheetExpanded]);

  // Keep selectedSheetType in sync if initialSheetType prop changes from outside (e.g. direct header buttons)
  useEffect(() => {
    if (!isAdmin && assignedMode) {
      const lockedSheet: SheetViewType = assignedMode === '90' ? 'traditional-90' : 'multipliers-15';
      if (selectedSheetType !== lockedSheet) {
        setSelectedSheetType(lockedSheet);
        onSheetTypeChange?.(lockedSheet);
      }
      return;
    }
    if (initialSheetType && initialSheetType !== selectedSheetType) {
      setSelectedSheetType(initialSheetType);
    }
  }, [initialSheetType, isAdmin, assignedMode, selectedSheetType, onSheetTypeChange]);

  const handleSelectSheetType = (type: SheetViewType) => {
    if (!isAdmin) {
      return; // Disallow switching for operators
    }
    setSelectedSheetType(type);
    if (onSheetTypeChange) {
      onSheetTypeChange(type);
    }
    if (type === 'traditional-90' && onSelectMode) {
      onSelectMode('90');
    } else if (type === 'multipliers-15' && onSelectMode) {
      onSelectMode('75');
    }
  };
  // Columns config: X1, X1, X2, X2, X3, X4 (matching the multipliers on the column headers)
  const initialData: BingoSheetData = useMemo(() => {
    const colConfigs = [
      { multiplier: 1, hasDivider: true },
      { multiplier: 1, hasDivider: false },
      { multiplier: 2, hasDivider: false },
      { multiplier: 2, hasDivider: false },
      { multiplier: 3, hasDivider: false },
      { multiplier: 4, hasDivider: false },
    ];

    const columns: BingoSheetColumn[] = colConfigs.map((cfg, idx) => {
      const colNum = idx + 1;
      const title = `X${cfg.multiplier}`;
      const cells: BingoSheetCell[] = [];

      for (let r = 1; r <= 15; r++) {
        cells.push({
          rowNumber: r,
          playerId: undefined,
          playerName: undefined,
          color: undefined,
        });
      }

      return {
        id: `col-${colNum}`,
        colNumber: colNum,
        title,
        multiplier: cfg.multiplier,
        hasRedDividerRight: cfg.hasDivider,
        columnPrice: cfg.multiplier * 0.10,
        columnPrize: cfg.multiplier * 1.35,
        columnTernaPrize: cfg.multiplier * 0.50,
        columnAmboPrize: cfg.multiplier * 0.25,
        cells,
      };
    });

    // Try restoring from localStorage if existing, otherwise return clean blank sheet
    if (typeof window !== 'undefined') {
      try {
        const savedRaw = localStorage.getItem(STORAGE_KEY);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          const baseCost = parsed.baseCost ?? 0.10;
          const basePrize = parsed.basePrize ?? 1.35;
          const ternaEnabled = Boolean(parsed.ternaEnabled);
          const baseTernaPrize = parsed.baseTernaPrize ?? 0.50;
          const amboEnabled = Boolean(parsed.amboEnabled);
          const baseAmboPrize = parsed.baseAmboPrize ?? 0.25;
          const bingoEnabled = parsed.bingoEnabled !== false;

          const migratedColumns = (parsed.columns || columns).map((c: any, idx: number) => {
            const mult =
              typeof c.multiplier === 'number'
                ? c.multiplier
                : c.title?.startsWith('X')
                ? parseInt(c.title.replace('X', ''), 10) || 1
                : idx < 2 ? 1 : idx < 4 ? 2 : 3;

            return {
              id: c.id || `col-${idx + 1}`,
              colNumber: c.colNumber || idx + 1,
              title: `X${mult}`,
              multiplier: mult,
              hasRedDividerRight: Boolean(c.hasRedDividerRight),
              columnPrice: c.columnPrice ?? mult * baseCost,
              columnPrize: c.columnPrize ?? mult * basePrize,
              columnTernaPrize: c.columnTernaPrize ?? mult * baseTernaPrize,
              columnAmboPrize: c.columnAmboPrize ?? mult * baseAmboPrize,
              cells: c.cells || [],
            };
          });

          return {
            title: (parsed.title && parsed.title !== 'PLANILLA OFICIAL') ? parsed.title : 'BIENVENIDOS A LA FAMILIA TEOO',
            subtitle: parsed.subtitle || 'Ronda de Juego por Columnas y Multiplicadores',
            hostName: parsed.hostName || '',
            hostPhone: parsed.hostPhone || '',
            columnPrice: baseCost,
            baseCost,
            basePrize,
            bingoEnabled,
            ternaEnabled,
            baseTernaPrize,
            amboEnabled,
            baseAmboPrize,
            currency: '',
            totalRows: parsed.totalRows || 15,
            rowMultipliers: {},
            columns: migratedColumns,
            players: parsed.players || [],
            background: parsed.background || {
              enabled: false,
              presetId: 'bingo-watermark',
              url: SHEET_BACKGROUND_PRESETS[0].svgDataUri,
              opacity: 0.18,
              brightness: 0.92,
              fit: 'tile',
            },
          };
        }
      } catch (e) {
        console.error('Failed to load saved sheet', e);
      }
    }

    return {
      title: 'BIENVENIDOS A LA FAMILIA TEOO',
      subtitle: 'Ronda de Juego por Columnas y Multiplicadores',
      hostName: '',
      hostPhone: '',
      columnPrice: 0.10,
      baseCost: 0.10,
      basePrize: 1.35,
      bingoEnabled: true,
      ternaEnabled: false,
      baseTernaPrize: 0.50,
      amboEnabled: false,
      baseAmboPrize: 0.25,
      rowMultipliers: {},
      currency: '',
      totalRows: 15,
      columns,
      players: [],
      background: {
        enabled: false,
        presetId: 'bingo-watermark',
        url: SHEET_BACKGROUND_PRESETS[0].svgDataUri,
        opacity: 0.18,
        brightness: 0.92,
        fit: 'tile',
      },
    };
  }, []);

  const [sheet, setSheet] = useState<BingoSheetData>(initialData);
  const sheetRef = useRef<BingoSheetData>(sheet);
  sheetRef.current = sheet;

  // Persistent cumulative winnings across partidas for players
  const [playerCumulativeWinnings, setPlayerCumulativeWinnings] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bingo_player_cumulative_winnings_v2');
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  // Persistent cumulative debts across partidas for players
  const [playerCumulativeDebt, setPlayerCumulativeDebt] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bingo_player_cumulative_debt_v2');
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  // Persistent payout offsets (when an operator settles / pays out a player's winnings in the active game)
  const [playerPayoutOffsets, setPlayerPayoutOffsets] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('bingo_player_payout_offsets_v1');
        return saved ? JSON.parse(saved) : {};
      } catch {
        return {};
      }
    }
    return {};
  });

  // Modal to edit/adjust a player's balance
  const [editingPlayerBalance, setEditingPlayerBalance] = useState<{
    id: string;
    name: string;
    currentGano: number;
    currentDebe: number;
  } | null>(null);
  const [manualGanoStr, setManualGanoStr] = useState<string>('');
  const [manualDebeStr, setManualDebeStr] = useState<string>('');

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [newPlayerColor, setNewPlayerColor] = useState<string>(PRESET_COLORS[0].hex);
  const [newPlayerTextColor, setNewPlayerTextColor] = useState<string>(FLUORESCENT_TEXT_COLORS[0].hex);
  const [showNotification, setShowNotification] = useState<string | null>(null);

  // Confirmation modal for clearing the carton
  const [showClearConfirmModal, setShowClearConfirmModal] = useState<boolean>(false);

  // Manual free-text inputs for Base Rates (allows unrestricted typing: decimals, commas, clearing)
  const [manualCostStr, setManualCostStr] = useState<string>(() => (sheet.baseCost ?? 0.10).toString());
  const [manualPrizeStr, setManualPrizeStr] = useState<string>(() => (sheet.basePrize ?? 1.35).toString());
  const [ternaEnabled, setTernaEnabled] = useState<boolean>(() => Boolean(sheet.ternaEnabled));
  const [manualTernaStr, setManualTernaStr] = useState<string>(() => (sheet.baseTernaPrize ?? 0.50).toString());
  const [amboEnabled, setAmboEnabled] = useState<boolean>(() => Boolean(sheet.amboEnabled));
  const [manualAmboStr, setManualAmboStr] = useState<string>(() => (sheet.baseAmboPrize ?? 0.25).toString());

  // Synchronize input strings if base rates are updated externally (e.g. preset or load)
  useEffect(() => {
    const parsed = parseFloat(manualCostStr.replace(',', '.'));
    if (isNaN(parsed) || Math.abs(parsed - (sheet.baseCost ?? 0.10)) > 0.0001) {
      setManualCostStr((sheet.baseCost ?? 0.10).toString());
    }
  }, [sheet.baseCost]);

  useEffect(() => {
    const parsed = parseFloat(manualPrizeStr.replace(',', '.'));
    if (isNaN(parsed) || Math.abs(parsed - (sheet.basePrize ?? 1.35)) > 0.0001) {
      setManualPrizeStr((sheet.basePrize ?? 1.35).toString());
    }
  }, [sheet.basePrize]);

  useEffect(() => {
    setTernaEnabled(Boolean(sheet.ternaEnabled));
  }, [sheet.ternaEnabled]);

  useEffect(() => {
    const parsed = parseFloat(manualTernaStr.replace(',', '.'));
    if (isNaN(parsed) || Math.abs(parsed - (sheet.baseTernaPrize ?? 0.50)) > 0.0001) {
      setManualTernaStr((sheet.baseTernaPrize ?? 0.50).toString());
    }
  }, [sheet.baseTernaPrize]);

  useEffect(() => {
    setAmboEnabled(Boolean(sheet.amboEnabled));
  }, [sheet.amboEnabled]);

  useEffect(() => {
    const parsed = parseFloat(manualAmboStr.replace(',', '.'));
    if (isNaN(parsed) || Math.abs(parsed - (sheet.baseAmboPrize ?? 0.25)) > 0.0001) {
      setManualAmboStr((sheet.baseAmboPrize ?? 0.25).toString());
    }
  }, [sheet.baseAmboPrize]);

  // Column being individually edited in modal
  const [editingColumnIndex, setEditingColumnIndex] = useState<number | null>(null);

  // Active tab in sidebar for clean navigation (default to players so user can start adding right away)
  const [sidebarTab, setSidebarTab] = useState<'players' | 'background' | 'columns' | 'rates'>('players');

  // Active shift line counter for the current operator
  const [activeShiftLines, setActiveShiftLines] = useState<number>(() =>
    getOperatorActiveLines(currentUser?.id, currentUser?.name)
  );

  useEffect(() => {
    setActiveShiftLines(getOperatorActiveLines(currentUser?.id, currentUser?.name));
    const handleShiftUpdated = () => {
      setActiveShiftLines(getOperatorActiveLines(currentUser?.id, currentUser?.name));
    };
    window.addEventListener('bingo_operator_shift_updated', handleShiftUpdated);
    window.addEventListener('bingo_saved_games_updated', handleShiftUpdated);
    window.addEventListener('storage', handleShiftUpdated);
    return () => {
      window.removeEventListener('bingo_operator_shift_updated', handleShiftUpdated);
      window.removeEventListener('bingo_saved_games_updated', handleShiftUpdated);
      window.removeEventListener('storage', handleShiftUpdated);
    };
  }, [currentUser?.id, currentUser?.name]);

  // Auto-save to localStorage is handled below with playerSummaryList and customSeqEntries

  const notify = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 3000);
  };

  // Push snapshot of current columns into undo history (capped at 4 moves)
  const pushUndoSnapshot = (currentCols?: BingoSheetColumn[]) => {
    setSheet((currentSheet) => {
      const source = currentCols || currentSheet.columns;
      if (!source) return currentSheet;
      const snapshot = source.map((col) => ({
        ...col,
        cells: col.cells.map((c) => ({ ...c })),
      }));
      setSheetUndoStack((prev) => [snapshot, ...prev].slice(0, 4));
      return currentSheet;
    });
  };

  // Undo up to 4 actions
  const handleUndo = () => {
    if (sheetUndoStack.length === 0) {
      notify('No hay movimientos en el historial para deshacer (máximo 4)');
      return;
    }
    const [previousCols, ...remainingStack] = sheetUndoStack;
    setSheetUndoStack(remainingStack);
    setSheet((prev) => ({
      ...prev,
      columns: previousCols,
    }));
    notify(`Acción deshecha. Movimientos restantes: ${remainingStack.length}/4`);
  };

  // Keyboard shortcut listener for Ctrl+Z / Cmd+Z to undo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sheetUndoStack]);

  // Show previous game direct results
  const handleShowPreviousGameResults = () => {
    const prevItem = getPreviousGameResultItem();
    if (prevItem) {
      if (onOpenGameSnapshot) {
        onOpenGameSnapshot(prevItem);
      } else {
        setDirectPreviousGameItem(prevItem);
      }
    } else {
      notify('Aún no hay una partida anterior registrada para mostrar');
    }
  };

  // Objectives active state
  const isAmboActive = Boolean(gameObjectives ? gameObjectives.ambo : sheet.amboEnabled);
  const isTernaActive = Boolean(gameObjectives ? gameObjectives.terna : sheet.ternaEnabled);
  const isBingoActive = gameObjectives ? gameObjectives.bingo : (sheet.bingoEnabled !== false);
  const seqColWidth = isAmboActive ? 80 : 62;

  // Find currently active player for brush painting
  const activePlayer = useMemo(() => {
    return sheet.players.find((p) => p.id === selectedPlayerId) || null;
  }, [sheet.players, selectedPlayerId]);

  // Set of players whose payment has been marked as confirmed (paid: true)
  const paidPlayerIds = useMemo(() => {
    return new Set(sheet.players.filter((p) => p.paid).map((p) => p.id));
  }, [sheet.players]);

  const paidPlayerNames = useMemo(() => {
    return new Set(
      sheet.players
        .filter((p) => p.paid)
        .map((p) => p.name.toLowerCase().trim())
    );
  }, [sheet.players]);

  // Active winning rows selected for prize calculation (100% manual por la operadora)
  const [activeWinningRow, setActiveWinningRow] = useState<number | null>(null);
  const [activeTernaRow, setActiveTernaRow] = useState<number | null>(null);
  const [activeAmboRow, setActiveAmboRow] = useState<number | null>(null);

  // Clean slate listener when starting a new game: save snapshot for "Mismos" feature before wiping
  useEffect(() => {
    const handleResetEvent = (e: any) => {
      // Save snapshot of current sheet into previous game storage before wiping
      if (sheetRef.current) {
        savePreviousGameSheet75(sheetRef.current);
      }

      const keepPlayers = e?.detail?.keepPlayers ?? true;
      const keepSequence = e?.detail?.keepSequence ?? true;
      const keepBalances = e?.detail?.keepBalances ?? true;
      const eventWinningRow = e?.detail?.winningRow;
      const eventTernaRow = e?.detail?.ternaRow;
      const eventAmboRow = e?.detail?.amboRow;

      // Handle sequence reset if operator chose to clear
      if (!keepSequence) {
        setCustomSeqEntries({});
        try {
          localStorage.removeItem('bingo_sheet_custom_sequence');
        } catch {}
      }

      // Handle player balances: if keepBalances is false, reset all to 0
      if (!keepBalances) {
        setPlayerCumulativeWinnings({});
        setPlayerCumulativeDebt({});
        setPlayerPayoutOffsets({});
        try {
          localStorage.removeItem('bingo_player_cumulative_winnings_v2');
          localStorage.removeItem('bingo_player_cumulative_debt_v2');
          localStorage.removeItem('bingo_player_payout_offsets_v1');
        } catch {}
      } else {
        // 1. Consolidate current match winnings (Bingo, Terna, Ambo) into cumulative winnings
        const isBingoActive = gameObjectives ? gameObjectives.bingo : (sheetRef.current?.bingoEnabled !== false);
        const isTernaActive = gameObjectives ? gameObjectives.terna : Boolean(sheetRef.current?.ternaEnabled);
        const isAmboActive = gameObjectives ? gameObjectives.ambo : Boolean(sheetRef.current?.amboEnabled);

        const targetBingoRow = isBingoActive
          ? (eventWinningRow !== undefined && eventWinningRow !== null
              ? eventWinningRow
              : activeWinningRow !== null
              ? activeWinningRow
              : completedRowLeaders && completedRowLeaders.length > 0
              ? completedRowLeaders[completedRowLeaders.length - 1]
              : null)
          : null;

        const targetTernaRow = isTernaActive
          ? (eventTernaRow !== undefined && eventTernaRow !== null
              ? eventTernaRow
              : activeTernaRow !== null
              ? activeTernaRow
              : currentMatchTernaRow !== null && currentMatchTernaRow !== undefined
              ? currentMatchTernaRow
              : null)
          : null;

        const targetAmboRow = isAmboActive
          ? (eventAmboRow !== undefined && eventAmboRow !== null
              ? eventAmboRow
              : activeAmboRow !== null
              ? activeAmboRow
              : currentMatchAmboRow !== null && currentMatchAmboRow !== undefined
              ? currentMatchAmboRow
              : null)
          : null;

        if ((targetBingoRow !== null || targetTernaRow !== null || targetAmboRow !== null) && sheetRef.current) {
          setPlayerCumulativeWinnings((prev) => {
            const updated = { ...prev };

            const creditPrize = (cell: any, prizeAmount: number) => {
              if (!cell || (!cell.playerId && !cell.playerName) || prizeAmount <= 0) return;
              if (cell.playerId) {
                updated[cell.playerId] = (updated[cell.playerId] || 0) + prizeAmount;
              }
              if (cell.playerName) {
                const nameKey = cell.playerName.toLowerCase().trim();
                updated[nameKey] = (updated[nameKey] || 0) + prizeAmount;
                updated[cell.playerName] = (updated[cell.playerName] || 0) + prizeAmount;
              }
            };

            sheetRef.current!.columns.forEach((col) => {
              const mult = col.multiplier || 1;

              // Bingo prize
              if (targetBingoRow !== null) {
                const cell = col.cells[targetBingoRow - 1];
                const colPrize = col.columnPrize !== undefined ? col.columnPrize : mult * (sheetRef.current!.basePrize ?? 1.35);
                creditPrize(cell, colPrize);
              }

              // Terna prize
              if (targetTernaRow !== null) {
                const cell = col.cells[targetTernaRow - 1];
                const colTernaPrize = col.columnTernaPrize !== undefined ? col.columnTernaPrize : mult * (sheetRef.current!.baseTernaPrize ?? 0.50);
                creditPrize(cell, colTernaPrize);
              }

              // Ambo prize
              if (targetAmboRow !== null) {
                const cell = col.cells[targetAmboRow - 1];
                const colAmboPrize = col.columnAmboPrize !== undefined ? col.columnAmboPrize : mult * (sheetRef.current!.baseAmboPrize ?? 0.25);
                creditPrize(cell, colAmboPrize);
              }
            });
            try {
              localStorage.setItem('bingo_player_cumulative_winnings_v2', JSON.stringify(updated));
            } catch {}
            return updated;
          });
        }

        // 2. Consolidate current match unpaid costs into cumulative debts
        if (sheetRef.current) {
          const currentCosts: Record<string, number> = {};
          sheetRef.current.columns.forEach((col) => {
            const cost = col.columnCost !== undefined ? col.columnCost : (col.multiplier || 1) * (sheetRef.current!.baseCost ?? 0.10);
            col.cells.forEach((cell) => {
              if (cell.playerId || cell.playerName) {
                const isPaid = Boolean(
                  (cell.playerId && paidPlayerIds.has(cell.playerId)) ||
                  (cell.playerName && paidPlayerNames.has(cell.playerName.toLowerCase().trim()))
                );
                if (!isPaid) {
                  const pKey = cell.playerId || cell.playerName!;
                  currentCosts[pKey] = (currentCosts[pKey] || 0) + cost;
                  if (cell.playerName) {
                    const nameKey = cell.playerName.toLowerCase().trim();
                    currentCosts[nameKey] = (currentCosts[nameKey] || 0) + cost;
                  }
                }
              }
            });
          });

          setPlayerCumulativeDebt((prev) => {
            const updated = { ...prev };
            Object.entries(currentCosts).forEach(([pKey, unpaidCost]) => {
              if (unpaidCost > 0) {
                updated[pKey] = (updated[pKey] || 0) + unpaidCost;
              }
            });
            try {
              localStorage.setItem('bingo_player_cumulative_debt_v2', JSON.stringify(updated));
            } catch {}
            return updated;
          });
        }
      }

      setPlayerPayoutOffsets({});
      try {
        localStorage.removeItem('bingo_player_payout_offsets_v1');
      } catch {}

      setActiveWinningRow(null);
      setActiveTernaRow(null);
      setActiveAmboRow(null);

      if (!keepPlayers) {
        setSheet((prev) => ({
          ...prev,
          players: [],
          columns: prev.columns.map((col) => ({
            ...col,
            cells: col.cells.map((cell) => ({
              ...cell,
              playerId: undefined,
              playerName: undefined,
              color: undefined,
              isPaid: false,
            })),
          })),
        }));
      } else {
        // Clear cells on the board for the new game, but PRESERVE all registered players in sheet.players!
        setSheet((prev) => ({
          ...prev,
          players: prev.players.map((p) => ({ ...p, paid: false })),
          columns: prev.columns.map((col) => ({
            ...col,
            cells: col.cells.map((cell) => ({
              ...cell,
              playerId: undefined,
              playerName: undefined,
              color: undefined,
              isPaid: false,
            })),
          })),
        }));
      }
    };

    window.addEventListener('bingo_reset_sheet_for_new_game', handleResetEvent);
    return () => {
      window.removeEventListener('bingo_reset_sheet_for_new_game', handleResetEvent);
    };
  }, [activeWinningRow, activeTernaRow, activeAmboRow, completedRowLeaders, paidPlayerIds, paidPlayerNames]);

  // Helper to calculate cell cost based on column multiplier
  const getCellCost = (col: BingoSheetColumn): number => {
    if (col.columnPrice !== undefined) return col.columnPrice;
    const mult = col.multiplier || 1;
    return mult * (sheet.baseCost ?? 0.10);
  };

  // Helper to calculate cell potential prize based on column multiplier
  const getCellPrize = (col: BingoSheetColumn): number => {
    if (col.columnPrize !== undefined) return col.columnPrize;
    const mult = col.multiplier || 1;
    return mult * (sheet.basePrize ?? 1.35);
  };

  // Helper to calculate cell potential terna prize based on column multiplier
  const getCellTernaPrize = (col: BingoSheetColumn): number => {
    if (col.columnTernaPrize !== undefined) return col.columnTernaPrize;
    const mult = col.multiplier || 1;
    return mult * (sheet.baseTernaPrize ?? 0.50);
  };


  // Statistics calculation based on column multipliers
  const stats = useMemo(() => {
    let totalCells = 0;
    let filledCells = 0;
    let totalRecaudado = 0; // Sum of costs of occupied cells
    let totalRecaudacionPosible = 0; // Sum of costs of all cells in sheet

    const playerCounts: Record<string, number> = {};
    const playerCosts: Record<string, number> = {};
    const playerMultipliers: Record<string, Record<number, number>> = {};

    sheet.columns.forEach((col) => {
      const cellCost = getCellCost(col);
      const mult = col.multiplier || 1;

      col.cells.forEach((cell) => {
        totalCells++;
        totalRecaudacionPosible += cellCost;

        if (cell.playerName || cell.playerId) {
          filledCells++;
          totalRecaudado += cellCost;

          const pKey = cell.playerId || cell.playerName || 'anon';
          playerCounts[pKey] = (playerCounts[pKey] || 0) + 1;
          playerCosts[pKey] = (playerCosts[pKey] || 0) + cellCost;

          if (!playerMultipliers[pKey]) playerMultipliers[pKey] = {};
          playerMultipliers[pKey][mult] = (playerMultipliers[pKey][mult] || 0) + 1;
        }
      });
    });

    // Check full columns count
    const fullColumnsCount = sheet.columns.filter((c) =>
      c.cells.every((cell) => cell.playerName || cell.playerId)
    ).length;

    // Total prizes for all columns if all pay out
    const totalPotentialPrizes = sheet.columns.reduce((acc, c) => acc + getCellPrize(c), 0);

    return {
      totalColumns: sheet.columns.length,
      totalCells,
      filledCells,
      emptyCells: totalCells - filledCells,
      fullColumnsCount,
      totalRecaudado,
      totalRecaudacionPosible,
      totalPotentialPrizes,
      playerCounts,
      playerCosts,
      playerMultipliers,
    };
  }, [sheet]);

  // Conteo exacto de Líneas de la planilla: suma del valor (multiplicador) de cada columna abierta
  // Por ejemplo: 4 columnas que valen X2 todas = 8 líneas
  const totalLineas = useMemo(() => {
    if (!sheet.columns || sheet.columns.length === 0) return 0;
    return sheet.columns.reduce((sum, col) => sum + (Number(col.multiplier) || 1), 0);
  }, [sheet.columns]);

  // Unique list of all active players (registered in sheet.players + assigned to any cells)
  const allActivePlayers = useMemo(() => {
    const map = new Map<string, BingoSheetPlayer>();
    // 1. Players explicitly in sheet.players
    sheet.players.forEach((p) => {
      map.set(p.id, p);
    });
    // 2. Any cell with player info not in sheet.players
    sheet.columns.forEach((col) => {
      col.cells.forEach((cell) => {
        if (cell.playerId && !map.has(cell.playerId)) {
          map.set(cell.playerId, {
            id: cell.playerId,
            name: cell.playerName || 'Jugador',
            color: cell.color || '#fed7aa',
            textColor: cell.textColor || '#000000',
            paid: false,
          });
        } else if (cell.playerName && !Array.from(map.values()).some((p) => p.name.toLowerCase() === cell.playerName!.toLowerCase())) {
          const newId = `p_${cell.playerName.toLowerCase().replace(/\s+/g, '_')}`;
          map.set(newId, {
            id: newId,
            name: cell.playerName,
            color: cell.color || '#fed7aa',
            textColor: cell.textColor || '#000000',
            paid: false,
          });
        }
      });
    });
    return Array.from(map.values());
  }, [sheet.players, sheet.columns]);

  // Full Financial Summary per Player: NOMBRE, GANO, DEBE, TOTAL (Independiente de las columnas de la planilla)
  const playerSummaryList = useMemo(() => {
    const isBingoActive = gameObjectives ? gameObjectives.bingo : (sheet.bingoEnabled !== false);
    const isTernaActive = gameObjectives ? gameObjectives.terna : Boolean(sheet.ternaEnabled);
    const isAmboActive = gameObjectives ? gameObjectives.ambo : Boolean(sheet.amboEnabled);

    const targetWinningRow =
      isBingoActive
        ? (activeWinningRow !== null
            ? activeWinningRow
            : completedRowLeaders && completedRowLeaders.length > 0
            ? completedRowLeaders[completedRowLeaders.length - 1]
            : null)
        : null;

    const targetTernaRow = isTernaActive
      ? (activeTernaRow !== null
          ? activeTernaRow
          : currentMatchTernaRow !== null && currentMatchTernaRow !== undefined
          ? currentMatchTernaRow
          : null)
      : null;

    const targetAmboRow = isAmboActive
      ? (activeAmboRow !== null
          ? activeAmboRow
          : currentMatchAmboRow !== null && currentMatchAmboRow !== undefined
          ? currentMatchAmboRow
          : null)
      : null;

    const getCanonicalKey = (id?: string, name?: string): string => {
      if (name && name.trim()) return name.trim().toLowerCase();
      if (id && id.trim()) return id.trim().toLowerCase();
      return 'anon';
    };

    // Calculate current round prizes won in target winning row, terna row, and ambo row per player
    const currentRoundWinnings: Record<string, number> = {};
    const currentRoundBingoWon: Record<string, number> = {};
    const currentRoundTernaWon: Record<string, number> = {};
    const currentRoundAmboWon: Record<string, number> = {};
    const bingoWinnerKeys = new Set<string>();
    const ternaWinnerKeys = new Set<string>();
    const amboWinnerKeys = new Set<string>();

    const recordPrize = (cell: any, prizeAmount: number, type: 'bingo' | 'terna' | 'ambo') => {
      if (!cell || (!cell.playerId && !cell.playerName) || prizeAmount <= 0) return;
      const cKey = getCanonicalKey(cell.playerId, cell.playerName);
      currentRoundWinnings[cKey] = (currentRoundWinnings[cKey] || 0) + prizeAmount;

      if (type === 'bingo') {
        currentRoundBingoWon[cKey] = (currentRoundBingoWon[cKey] || 0) + prizeAmount;
        bingoWinnerKeys.add(cKey);
        if (cell.playerId) bingoWinnerKeys.add(cell.playerId);
        if (cell.playerName) bingoWinnerKeys.add(cell.playerName.toLowerCase().trim());
      } else if (type === 'terna') {
        currentRoundTernaWon[cKey] = (currentRoundTernaWon[cKey] || 0) + prizeAmount;
        ternaWinnerKeys.add(cKey);
        if (cell.playerId) ternaWinnerKeys.add(cell.playerId);
        if (cell.playerName) ternaWinnerKeys.add(cell.playerName.toLowerCase().trim());
      } else if (type === 'ambo') {
        currentRoundAmboWon[cKey] = (currentRoundAmboWon[cKey] || 0) + prizeAmount;
        amboWinnerKeys.add(cKey);
        if (cell.playerId) amboWinnerKeys.add(cell.playerId);
        if (cell.playerName) amboWinnerKeys.add(cell.playerName.toLowerCase().trim());
      }
    };

    sheet.columns.forEach((col) => {
      const mult = col.multiplier || 1;

      // 1. Bingo Prize
      if (targetWinningRow !== null) {
        const colPrize =
          col.columnPrize !== undefined ? col.columnPrize : mult * (sheet.basePrize ?? 1.35);
        const cell = col.cells[targetWinningRow - 1];
        recordPrize(cell, colPrize, 'bingo');
      }

      // 2. Terna Prize (Automatically calculated and added to GANO)
      if (targetTernaRow !== null) {
        const colTernaPrize =
          col.columnTernaPrize !== undefined ? col.columnTernaPrize : mult * (sheet.baseTernaPrize ?? 0.50);
        const cell = col.cells[targetTernaRow - 1];
        recordPrize(cell, colTernaPrize, 'terna');
      }

      // 3. Ambo Prize (Automatically calculated and added to GANO)
      if (targetAmboRow !== null) {
        const colAmboPrize =
          col.columnAmboPrize !== undefined ? col.columnAmboPrize : mult * (sheet.baseAmboPrize ?? 0.25);
        const cell = col.cells[targetAmboRow - 1];
        recordPrize(cell, colAmboPrize, 'ambo');
      }
    });

    return allActivePlayers.map((player) => {
      const cKey = getCanonicalKey(player.id, player.name);
      const pKey = player.id;
      const pNameKey = player.name.toLowerCase().trim();

      const prevWon =
        (playerCumulativeWinnings[cKey] !== undefined ? playerCumulativeWinnings[cKey] : 0) ||
        (pKey && playerCumulativeWinnings[pKey] !== undefined ? playerCumulativeWinnings[pKey] : 0) ||
        (playerCumulativeWinnings[pNameKey] !== undefined ? playerCumulativeWinnings[pNameKey] : 0) ||
        (playerCumulativeWinnings[player.name] !== undefined ? playerCumulativeWinnings[player.name] : 0) ||
        0;

      const payoutOffset =
        (playerPayoutOffsets[cKey] !== undefined ? playerPayoutOffsets[cKey] : 0) ||
        (pKey && playerPayoutOffsets[pKey] !== undefined ? playerPayoutOffsets[pKey] : 0) ||
        (playerPayoutOffsets[pNameKey] !== undefined ? playerPayoutOffsets[pNameKey] : 0) ||
        (playerPayoutOffsets[player.name] !== undefined ? playerPayoutOffsets[player.name] : 0) ||
        0;

      const rawCurWon = currentRoundWinnings[cKey] || 0;
      const curWon = Math.max(0, rawCurWon - payoutOffset);
      const totalGano = Math.max(0, prevWon + curWon);

      const prevDebt =
        (playerCumulativeDebt[cKey] !== undefined ? playerCumulativeDebt[cKey] : 0) ||
        (pKey && playerCumulativeDebt[pKey] !== undefined ? playerCumulativeDebt[pKey] : 0) ||
        (playerCumulativeDebt[pNameKey] !== undefined ? playerCumulativeDebt[pNameKey] : 0) ||
        (playerCumulativeDebt[player.name] !== undefined ? playerCumulativeDebt[player.name] : 0) ||
        0;

      let unpaidCost = 0;
      let totalAssignedCells = 0;
      let unpaidCellsCount = 0;

      sheet.columns.forEach((col) => {
        const mult = col.multiplier || 1;
        const cellCost = col.columnPrice !== undefined ? col.columnPrice : mult * (sheet.baseCost ?? 0.10);
        col.cells.forEach((cell) => {
          const isMine =
            (cell.playerId && (cell.playerId === player.id || cell.playerId === pKey)) ||
            (cell.playerName && cell.playerName.toLowerCase().trim() === pNameKey);
          if (isMine) {
            totalAssignedCells++;
            if (!cell.isPaid) {
              unpaidCellsCount++;
              unpaidCost += cellCost;
            }
          }
        });
      });

      const curDebt = Math.round(unpaidCost * 100) / 100;
      const totalDebe = Math.round((prevDebt + curDebt) * 100) / 100;

      const total = Math.round((totalGano - totalDebe) * 100) / 100;

      const isBingoWinner = bingoWinnerKeys.has(cKey) || (pKey ? bingoWinnerKeys.has(pKey) : false) || bingoWinnerKeys.has(pNameKey);
      const isTernaWinner = ternaWinnerKeys.has(cKey) || (pKey ? ternaWinnerKeys.has(pKey) : false) || ternaWinnerKeys.has(pNameKey);
      const isAmboWinner = amboWinnerKeys.has(cKey) || (pKey ? amboWinnerKeys.has(pKey) : false) || amboWinnerKeys.has(pNameKey);

      return {
        id: player.id,
        name: player.name,
        color: player.color,
        textColor: player.textColor || '#000000',
        paid: totalAssignedCells > 0 ? unpaidCellsCount === 0 : Boolean(player.paid),
        previousWon: prevWon,
        currentWon: curWon,
        currentBingoWon: currentRoundBingoWon[cKey] || 0,
        currentTernaWon: currentRoundTernaWon[cKey] || 0,
        currentAmboWon: currentRoundAmboWon[cKey] || 0,
        totalGano,
        previousDebt: prevDebt,
        currentDebt: curDebt,
        debe: totalDebe,
        total,
        isBingoWinner,
        isTernaWinner,
        isAmboWinner,
      };
    });
  }, [
    allActivePlayers,
    activeWinningRow,
    activeTernaRow,
    activeAmboRow,
    completedRowLeaders,
    currentMatchTernaRow,
    currentMatchAmboRow,
    gameObjectives,
    sheet.columns,
    sheet.basePrize,
    sheet.baseTernaPrize,
    sheet.baseAmboPrize,
    sheet.bingoEnabled,
    sheet.ternaEnabled,
    sheet.amboEnabled,
    stats.playerCosts,
    playerCumulativeWinnings,
    playerCumulativeDebt,
    playerPayoutOffsets,
  ]);

  // Backward compatibility alias for any existing reference
  const bottomPlayersSummary = playerSummaryList;

  // Persist full sheet snapshot including player summaries and custom sequence
  useEffect(() => {
    try {
      const summaryPayload = playerSummaryList.map((p) => ({
        id: p.id,
        name: p.name,
        totalGano: p.totalGano,
        debe: p.debe,
        total: p.total,
        color: p.color,
        paid: p.paid,
      }));
      const fullSnapshot: BingoSheetData = {
        ...sheet,
        playerSummaryList: summaryPayload,
        customSeqEntries,
      };
      safeSetItem(STORAGE_KEY, JSON.stringify(fullSnapshot));
    } catch (e) {
      console.error(e);
    }
  }, [sheet, playerSummaryList, customSeqEntries]);

  // Handle cell click (assign player or clear)
  const handleCellClick = (colIndex: number, rowIndex: number) => {
    pushUndoSnapshot();
    setSheet((prev) => {
      const newColumns = [...prev.columns];
      const targetCol = { ...newColumns[colIndex] };
      const newCells = [...targetCol.cells];
      const currentCell = newCells[rowIndex];

      let updatedPlayers = prev.players;

      if (activePlayer) {
        // If already assigned to this player, toggle off (clear)
        if (currentCell.playerId === activePlayer.id) {
          newCells[rowIndex] = {
            ...currentCell,
            playerId: undefined,
            playerName: undefined,
            color: undefined,
            isPaid: false,
          };
        } else {
          // Assign active player (newly added cells start as unpaid: isPaid: false)
          newCells[rowIndex] = {
            ...currentCell,
            playerId: activePlayer.id,
            playerName: activePlayer.name,
            color: activePlayer.color,
            textColor: activePlayer.textColor || '#000000',
            isPaid: false,
          };

          // Player now has a new unpaid cell, so they remain/become with pending debt until marked paid again
          updatedPlayers = prev.players.map((p) =>
            p.id === activePlayer.id || p.name.toLowerCase().trim() === activePlayer.name.toLowerCase().trim()
              ? { ...p, paid: false }
              : p
          );
        }
      } else {
        // No player selected
        if (currentCell.playerName || currentCell.playerId) {
          newCells[rowIndex] = {
            ...currentCell,
            playerId: undefined,
            playerName: undefined,
            color: undefined,
            isPaid: false,
          };
        } else {
          notify('Agrega o selecciona un jugador en la pestaña "Jugadores" para asignar esta casilla');
        }
      }

      targetCol.cells = newCells;
      newColumns[colIndex] = targetCol;
      return { ...prev, columns: newColumns, players: updatedPlayers };
    });
  };

  // Toggle individual cell payment status (e.g. clicking the circled number)
  const handleToggleCellPaid = (colIndex: number, rowIndex: number) => {
    pushUndoSnapshot();
    setSheet((prev) => {
      const newColumns = [...prev.columns];
      const targetCol = { ...newColumns[colIndex] };
      const newCells = [...targetCol.cells];
      const targetCell = newCells[rowIndex];
      if (!targetCell || (!targetCell.playerId && !targetCell.playerName)) return prev;

      const newPaid = !Boolean(targetCell.isPaid);
      newCells[rowIndex] = {
        ...targetCell,
        isPaid: newPaid,
      };
      targetCol.cells = newCells;
      newColumns[colIndex] = targetCol;

      const pId = targetCell.playerId;
      const pNameLower = targetCell.playerName ? targetCell.playerName.toLowerCase().trim() : '';

      let hasUnpaid = false;
      newColumns.forEach((col) => {
        col.cells.forEach((c) => {
          const isMine =
            (pId && c.playerId === pId) ||
            (pNameLower && c.playerName && c.playerName.toLowerCase().trim() === pNameLower);
          if (isMine && !c.isPaid) {
            hasUnpaid = true;
          }
        });
      });

      const updatedPlayers = prev.players.map((p) => {
        const isMatch =
          (pId && p.id === pId) ||
          (pNameLower && p.name.toLowerCase().trim() === pNameLower);
        return isMatch ? { ...p, paid: !hasUnpaid } : p;
      });

      return { ...prev, columns: newColumns, players: updatedPlayers };
    });
  };

  // Set multiplier for an individual column
  const handleSetColumnMultiplier = (colIndex: number, multiplier: number) => {
    const clamped = Math.max(1, multiplier);
    setSheet((prev) => {
      const newColumns = [...prev.columns];
      newColumns[colIndex] = {
        ...newColumns[colIndex],
        multiplier: clamped,
        title: `X${clamped}`,
        columnPrice: clamped * prev.baseCost,
        columnPrize: clamped * prev.basePrize,
        columnTernaPrize: clamped * (prev.baseTernaPrize ?? 0.50),
        columnAmboPrize: clamped * (prev.baseAmboPrize ?? 0.25),
      };
      return { ...prev, columns: newColumns };
    });
    notify(`Columna ${colIndex + 1} configurada a X${clamped} (Valor: ${(clamped * sheet.baseCost).toFixed(2)})`);
  };

  // Cycle column multiplier (X1 -> X2 -> X3 -> X4 -> X5 -> X1)
  const handleCycleColumnMultiplier = (colIndex: number) => {
    const currentCol = sheet.columns[colIndex];
    const currentMult = currentCol.multiplier || 1;
    const nextMult = currentMult >= 5 ? 1 : currentMult + 1;
    handleSetColumnMultiplier(colIndex, nextMult);
  };

  // Quick preset: Set all columns to a single multiplier
  const handleSetAllColumnsMultiplier = (multiplier: number) => {
    setSheet((prev) => ({
      ...prev,
      columns: prev.columns.map((col) => ({
        ...col,
        multiplier,
        title: `X${multiplier}`,
        columnPrice: multiplier * prev.baseCost,
        columnPrize: multiplier * prev.basePrize,
        columnTernaPrize: multiplier * (prev.baseTernaPrize ?? 0.50),
        columnAmboPrize: multiplier * (prev.baseAmboPrize ?? 0.25),
      })),
    }));
    notify(`Todas las columnas configuradas a X${multiplier}`);
  };

  // Quick preset: Set staircase multipliers (X1, X2, X3, X4, X5...)
  const handleSetStaircaseMultipliers = () => {
    setSheet((prev) => {
      const updated = prev.columns.map((col, idx) => {
        const mult = idx + 1;
        return {
          ...col,
          multiplier: mult,
          title: `X${mult}`,
          columnPrice: mult * prev.baseCost,
          columnPrize: mult * prev.basePrize,
          columnTernaPrize: mult * (prev.baseTernaPrize ?? 0.50),
          columnAmboPrize: mult * (prev.baseAmboPrize ?? 0.25),
        };
      });
      return { ...prev, columns: updated };
    });
    notify('Columnas configuradas escalonadas (X1, X2, X3, X4...)');
  };

  // Quick preset: Set pairs (X1, X1, X2, X2, X3, X3)
  const handleSetPairsMultipliers = () => {
    setSheet((prev) => {
      const updated = prev.columns.map((col, idx) => {
        const mult = Math.floor(idx / 2) + 1;
        return {
          ...col,
          multiplier: mult,
          title: `X${mult}`,
          columnPrice: mult * prev.baseCost,
          columnPrize: mult * prev.basePrize,
          columnTernaPrize: mult * (prev.baseTernaPrize ?? 0.50),
          columnAmboPrize: mult * (prev.baseAmboPrize ?? 0.25),
        };
      });
      return { ...prev, columns: updated };
    });
    notify('Columnas configuradas en pares (X1, X1, X2, X2...)');
  };

  // Update base rates and propagate to columns
  const handleUpdateBaseRates = (
    newCost: number,
    newPrize: number,
    newTernaPrize?: number,
    isTerna?: boolean,
    newAmboPrize?: number,
    isAmbo?: boolean,
    isBingo?: boolean
  ) => {
    const validCost = Math.max(0.01, newCost);
    const validPrize = Math.max(0, newPrize);
    const validTerna = Math.max(0, newTernaPrize !== undefined ? newTernaPrize : (sheet.baseTernaPrize ?? 0.50));
    const activeTerna = isTerna !== undefined ? isTerna : (sheet.ternaEnabled ?? false);
    const validAmbo = Math.max(0, newAmboPrize !== undefined ? newAmboPrize : (sheet.baseAmboPrize ?? 0.25));
    const activeAmbo = isAmbo !== undefined ? isAmbo : (sheet.amboEnabled ?? false);
    const activeBingo = isBingo !== undefined ? isBingo : (sheet.bingoEnabled ?? true);

    setSheet((prev) => ({
      ...prev,
      baseCost: validCost,
      basePrize: validPrize,
      baseTernaPrize: validTerna,
      ternaEnabled: activeTerna,
      baseAmboPrize: validAmbo,
      amboEnabled: activeAmbo,
      bingoEnabled: activeBingo,
      columnPrice: validCost,
      columns: prev.columns.map((col) => {
        const mult = col.multiplier || 1;
        return {
          ...col,
          columnPrice: mult * validCost,
          columnPrize: mult * validPrize,
          columnTernaPrize: mult * validTerna,
          columnAmboPrize: mult * validAmbo,
        };
      }),
    }));
  };

  // Handlers for free-form manual editing of Entrada Base, Punto Base, Terna Base, and Ambo Base
  const handleCostInputChange = (val: string) => {
    setManualCostStr(val);
    const cleaned = val.replace(',', '.').trim();
    if (cleaned === '' || cleaned === '.') return;
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > 0) {
      handleUpdateBaseRates(num, sheet.basePrize, sheet.baseTernaPrize, ternaEnabled, sheet.baseAmboPrize, amboEnabled);
    }
  };

  const handlePrizeInputChange = (val: string) => {
    setManualPrizeStr(val);
    const cleaned = val.replace(',', '.').trim();
    if (cleaned === '' || cleaned === '.') return;
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num >= 0) {
      handleUpdateBaseRates(sheet.baseCost, num, sheet.baseTernaPrize, ternaEnabled, sheet.baseAmboPrize, amboEnabled);
    }
  };

  const handleTernaInputChange = (val: string) => {
    setManualTernaStr(val);
    const cleaned = val.replace(',', '.').trim();
    if (cleaned === '' || cleaned === '.') return;
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num >= 0) {
      handleUpdateBaseRates(sheet.baseCost, sheet.basePrize, num, ternaEnabled, sheet.baseAmboPrize, amboEnabled);
    }
  };

  const handleAmboInputChange = (val: string) => {
    setManualAmboStr(val);
    const cleaned = val.replace(',', '.').trim();
    if (cleaned === '' || cleaned === '.') return;
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num >= 0) {
      handleUpdateBaseRates(sheet.baseCost, sheet.basePrize, sheet.baseTernaPrize, ternaEnabled, num, amboEnabled);
    }
  };

  const handleCostInputBlur = () => {
    const cleaned = manualCostStr.replace(',', '.').trim();
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) {
      setManualCostStr((sheet.baseCost ?? 0.10).toString());
    } else {
      setManualCostStr(num.toString());
      handleUpdateBaseRates(num, sheet.basePrize, sheet.baseTernaPrize, ternaEnabled, sheet.baseAmboPrize, amboEnabled);
    }
  };

  const handlePrizeInputBlur = () => {
    const cleaned = manualPrizeStr.replace(',', '.').trim();
    const num = parseFloat(cleaned);
    if (isNaN(num) || num < 0) {
      setManualPrizeStr((sheet.basePrize ?? 1.35).toString());
    } else {
      setManualPrizeStr(num.toString());
      handleUpdateBaseRates(sheet.baseCost, num, sheet.baseTernaPrize, ternaEnabled, sheet.baseAmboPrize, amboEnabled);
    }
  };

  const handleTernaInputBlur = () => {
    const cleaned = manualTernaStr.replace(',', '.').trim();
    const num = parseFloat(cleaned);
    if (isNaN(num) || num < 0) {
      setManualTernaStr((sheet.baseTernaPrize ?? 0.50).toString());
    } else {
      setManualTernaStr(num.toString());
      handleUpdateBaseRates(sheet.baseCost, sheet.basePrize, num, ternaEnabled, sheet.baseAmboPrize, amboEnabled);
    }
  };

  const handleAmboInputBlur = () => {
    const cleaned = manualAmboStr.replace(',', '.').trim();
    const num = parseFloat(cleaned);
    if (isNaN(num) || num < 0) {
      setManualAmboStr((sheet.baseAmboPrize ?? 0.25).toString());
    } else {
      setManualAmboStr(num.toString());
      handleUpdateBaseRates(sheet.baseCost, sheet.basePrize, sheet.baseTernaPrize, ternaEnabled, num, amboEnabled);
    }
  };

  const handleToggleTernaEnabled = (enabled: boolean) => {
    setTernaEnabled(enabled);
    if (onToggleObjective && gameObjectives && gameObjectives.terna !== enabled) {
      onToggleObjective('terna');
    }
    const ternaVal = parseFloat(manualTernaStr.replace(',', '.')) || sheet.baseTernaPrize || 0.50;
    handleUpdateBaseRates(sheet.baseCost, sheet.basePrize, ternaVal, enabled, sheet.baseAmboPrize, amboEnabled);
    notify(enabled ? 'Pago de Terna HABILITADO para esta partida' : 'Pago de Terna DESACTIVADO');
  };

  const handleToggleAmboEnabled = (enabled: boolean) => {
    setAmboEnabled(enabled);
    if (onToggleObjective && gameObjectives && gameObjectives.ambo !== enabled) {
      onToggleObjective('ambo');
    }
    const amboVal = parseFloat(manualAmboStr.replace(',', '.')) || sheet.baseAmboPrize || 0.25;
    handleUpdateBaseRates(sheet.baseCost, sheet.basePrize, sheet.baseTernaPrize, ternaEnabled, amboVal, enabled);
    notify(enabled ? 'Pago de Ambo (2 números) HABILITADO para esta partida' : 'Pago de Ambo DESACTIVADO');
  };

  const handleApplyManualRates = () => {
    const cClean = manualCostStr.replace(',', '.').trim();
    const pClean = manualPrizeStr.replace(',', '.').trim();
    const tClean = manualTernaStr.replace(',', '.').trim();
    const aClean = manualAmboStr.replace(',', '.').trim();

    const cost = Math.max(0.01, parseFloat(cClean) || sheet.baseCost || 0.10);
    const prize = Math.max(0, parseFloat(pClean) || sheet.basePrize || 1.35);
    const terna = Math.max(0, parseFloat(tClean) || sheet.baseTernaPrize || 0.50);
    const ambo = Math.max(0, parseFloat(aClean) || sheet.baseAmboPrize || 0.25);

    setManualCostStr(cost.toString());
    setManualPrizeStr(prize.toString());
    setManualTernaStr(terna.toString());
    setManualAmboStr(ambo.toString());
    handleUpdateBaseRates(cost, prize, terna, ternaEnabled, ambo, amboEnabled);
    notify(
      `¡Valores aplicados! Entrada: $${cost.toFixed(2)} | Bingo: $${prize.toFixed(2)}${
        ternaEnabled ? ` | Terna: $${terna.toFixed(2)}` : ''
      }${amboEnabled ? ` | Ambo: $${ambo.toFixed(2)}` : ''}`
    );
  };

  // Update individual column
  const handleUpdateColumn = (colIndex: number, updates: Partial<BingoSheetColumn>) => {
    setSheet((prev) => {
      const newColumns = [...prev.columns];
      newColumns[colIndex] = {
        ...newColumns[colIndex],
        ...updates,
      };
      return { ...prev, columns: newColumns };
    });
  };

  // 1-Click fill entire column with active player
  const handleFillColumn = (colIndex: number) => {
    if (!activePlayer) {
      notify('Selecciona primero un jugador para llenar la columna.');
      return;
    }
    setSheet((prev) => {
      const newColumns = [...prev.columns];
      const targetCol = { ...newColumns[colIndex] };
      targetCol.cells = targetCol.cells.map((cell) => ({
        ...cell,
        playerId: activePlayer.id,
        playerName: activePlayer.name,
        color: activePlayer.color,
        textColor: activePlayer.textColor || '#000000',
        isPaid: false,
      }));
      newColumns[colIndex] = targetCol;
      const updatedPlayers = prev.players.map((p) =>
        p.id === activePlayer.id || p.name.toLowerCase().trim() === activePlayer.name.toLowerCase().trim()
          ? { ...p, paid: false }
          : p
      );
      return { ...prev, columns: newColumns, players: updatedPlayers };
    });
    notify(`Columna ${sheet.columns[colIndex].title} asignada a ${activePlayer.name}`);
  };

  // Toggle red divider line for a column
  const handleToggleRedDivider = (colIndex: number) => {
    setSheet((prev) => {
      const newColumns = [...prev.columns];
      newColumns[colIndex] = {
        ...newColumns[colIndex],
        hasRedDividerRight: !newColumns[colIndex].hasRedDividerRight,
      };
      return { ...prev, columns: newColumns };
    });
  };

  // Add new player
  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizePlayerName(newPlayerName);
    if (!cleanName) return;

    const newPlayer: BingoSheetPlayer = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      color: newPlayerColor,
      textColor: newPlayerTextColor || '#000000',
      paid: false,
    };

    setSheet((prev) => ({
      ...prev,
      players: [...prev.players, newPlayer],
    }));

    setSelectedPlayerId(newPlayer.id);
    setNewPlayerName('');
    notify(`Jugador "${newPlayer.name}" agregado con éxito`);
  };

  // Change background color of a player and sync their assigned cells
  const handleUpdatePlayerColor = (playerId: string, newColor: string) => {
    pushUndoSnapshot();
    setSheet((prev) => {
      const targetPlayer = prev.players.find((p) => p.id === playerId);
      const pNameLower = targetPlayer ? targetPlayer.name.toLowerCase().trim() : '';

      const updatedPlayers = prev.players.map((p) =>
        p.id === playerId || (pNameLower && p.name.toLowerCase().trim() === pNameLower)
          ? { ...p, color: newColor }
          : p
      );

      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => {
          const isMine =
            cell.playerId === playerId ||
            (pNameLower && cell.playerName && cell.playerName.toLowerCase().trim() === pNameLower);
          return isMine ? { ...cell, color: newColor } : cell;
        }),
      }));

      return {
        ...prev,
        players: updatedPlayers,
        columns: updatedColumns,
      };
    });
  };

  // Change letter/text color of a player and sync their assigned cells
  const handleUpdatePlayerTextColor = (playerId: string, newTextColor: string) => {
    pushUndoSnapshot();
    setSheet((prev) => {
      const targetPlayer = prev.players.find((p) => p.id === playerId);
      const pNameLower = targetPlayer ? targetPlayer.name.toLowerCase().trim() : '';

      const updatedPlayers = prev.players.map((p) =>
        p.id === playerId || (pNameLower && p.name.toLowerCase().trim() === pNameLower)
          ? { ...p, textColor: newTextColor }
          : p
      );

      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => {
          const isMine =
            cell.playerId === playerId ||
            (pNameLower && cell.playerName && cell.playerName.toLowerCase().trim() === pNameLower);
          return isMine ? { ...cell, textColor: newTextColor } : cell;
        }),
      }));

      return {
        ...prev,
        players: updatedPlayers,
        columns: updatedColumns,
      };
    });
  };

  // Toggle paid status for a player
  const handleTogglePlayerPaid = (playerId: string) => {
    pushUndoSnapshot();
    setSheet((prev) => {
      const targetPlayer = prev.players.find((p) => p.id === playerId);
      const pNameLower = targetPlayer ? targetPlayer.name.toLowerCase().trim() : '';

      // Determine if the player has any unpaid assigned cells
      let hasUnpaid = false;
      prev.columns.forEach((col) => {
        col.cells.forEach((cell) => {
          const isMine =
            cell.playerId === playerId ||
            (pNameLower && cell.playerName && cell.playerName.toLowerCase().trim() === pNameLower);
          if (isMine && !cell.isPaid) {
            hasUnpaid = true;
          }
        });
      });

      const nextPaidState = hasUnpaid ? true : false;

      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => {
          const isMine =
            cell.playerId === playerId ||
            (pNameLower && cell.playerName && cell.playerName.toLowerCase().trim() === pNameLower);
          return isMine ? { ...cell, isPaid: nextPaidState } : cell;
        }),
      }));

      const updatedPlayers = prev.players.map((p) =>
        p.id === playerId || (pNameLower && p.name.toLowerCase().trim() === pNameLower)
          ? { ...p, paid: nextPaidState }
          : p
      );

      return {
        ...prev,
        players: updatedPlayers,
        columns: updatedColumns,
      };
    });
  };

  // Mark all remaining newly added unpaid cells of a player as paid
  const handleMarkRemainingPlayerCellsPaid = (playerId: string) => {
    pushUndoSnapshot();
    setSheet((prev) => {
      const targetPlayer = prev.players.find((p) => p.id === playerId);
      const pNameLower = targetPlayer ? targetPlayer.name.toLowerCase().trim() : '';

      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => {
          const isMine =
            cell.playerId === playerId ||
            (pNameLower && cell.playerName && cell.playerName.toLowerCase().trim() === pNameLower);
          return isMine ? { ...cell, isPaid: true } : cell;
        }),
      }));

      const updatedPlayers = prev.players.map((p) =>
        p.id === playerId || (pNameLower && p.name.toLowerCase().trim() === pNameLower)
          ? { ...p, paid: true }
          : p
      );

      return {
        ...prev,
        players: updatedPlayers,
        columns: updatedColumns,
      };
    });
    notify('Casillas pendientes marcadas como pagadas');
  };

  /**
   * Finds the optimal combination of column indices for a given row to match the exact target multiplier,
   * prioritizing previous columns if they still match, and automatically adapting when lines are added or removed.
   * Strict Rule: NEVER touch or return cells belonging to other players.
   */
  const findBestColumnsForTargetMultiplier = (
    columns: BingoSheetColumn[],
    rowNumber: number,
    targetMultiplier: number,
    previousColIndexes: number[] = [],
    playerId: string,
    playerName: string
  ): number[] => {
    const pNameLower = playerName.toLowerCase().trim();
    const available: { colIndex: number; multiplier: number; wasPrevious: boolean }[] = [];

    columns.forEach((col, cIdx) => {
      const cell = col.cells[rowNumber - 1];
      const isFree = !cell || (!cell.playerId && !cell.playerName);
      const isMine =
        cell &&
        (cell.playerId === playerId ||
          (cell.playerName && cell.playerName.toLowerCase().trim() === pNameLower));

      if (isFree || isMine) {
        available.push({
          colIndex: cIdx,
          multiplier: col.multiplier || 1,
          wasPrevious: previousColIndexes.includes(cIdx),
        });
      }
    });

    if (available.length === 0 || targetMultiplier <= 0) return [];

    // Step 0: If the EXACT previous columns are all available and sum to targetMultiplier, use them!
    if (previousColIndexes.length > 0) {
      const allPrevAvailable = previousColIndexes.every((pIdx) =>
        available.some((a) => a.colIndex === pIdx)
      );
      if (allPrevAvailable) {
        const prevSum = previousColIndexes.reduce((acc, pIdx) => {
          const found = available.find((a) => a.colIndex === pIdx);
          return acc + (found?.multiplier || 0);
        }, 0);
        if (prevSum === targetMultiplier) {
          return [...previousColIndexes];
        }
      }
    }

    // Step 1: Look for an available single column that matches targetMultiplier
    const singleMatches = available.filter((a) => a.multiplier === targetMultiplier);
    if (singleMatches.length > 0) {
      const prevMatch = singleMatches.find((a) => a.wasPrevious);
      return [(prevMatch || singleMatches[0]).colIndex];
    }

    // Step 2: Search for an exact combination of available columns that sums to targetMultiplier
    // Sort available prioritizing: wasPrevious first, then largest multiplier
    const sortedAvailable = [...available].sort((a, b) => {
      if (a.wasPrevious !== b.wasPrevious) return a.wasPrevious ? -1 : 1;
      return b.multiplier - a.multiplier;
    });

    let bestSubset: number[] = [];
    let bestDiff = Infinity;
    let bestPrevMatchCount = -1;
    let bestCount = Infinity;

    const search = (
      idx: number,
      currentSum: number,
      currentCols: number[],
      prevMatchCount: number
    ) => {
      const diff = Math.abs(currentSum - targetMultiplier);

      const isBetter =
        diff < bestDiff ||
        (diff === bestDiff && prevMatchCount > bestPrevMatchCount) ||
        (diff === bestDiff && prevMatchCount === bestPrevMatchCount && currentCols.length < bestCount);

      if (isBetter) {
        bestDiff = diff;
        bestSubset = [...currentCols];
        bestPrevMatchCount = prevMatchCount;
        bestCount = currentCols.length;
      }

      if (diff === 0 && prevMatchCount === previousColIndexes.length) return; // Optimal match found
      if (idx >= sortedAvailable.length) return;

      for (let i = idx; i < sortedAvailable.length; i++) {
        const item = sortedAvailable[i];
        if (currentSum + item.multiplier > targetMultiplier + bestDiff && bestDiff === 0) continue;
        currentCols.push(item.colIndex);
        search(
          i + 1,
          currentSum + item.multiplier,
          currentCols,
          prevMatchCount + (item.wasPrevious ? 1 : 0)
        );
        currentCols.pop();
      }
    };

    search(0, 0, [], 0);

    return bestSubset;
  };

  /**
   * Helper that assigns "Mismos" for a single player inside updatedColumns:
   * Finds the previous row values (e.g. 2 X3, 4 X1) and equals them by searching
   * in the current sheet without taking numbers from any other players.
   */
  const assignMismosForPlayer = (
    updatedColumns: BingoSheetColumn[],
    player: BingoSheetPlayer
  ): {
    assignedCount: number;
    assignedSummary: string[];
    skippedSummary: string[];
  } => {
    const pNameLower = player.name.toLowerCase().trim();
    let rowValues = getPreviousPlayerRowValues75(player.id, player.name);

    // Fallback: Check getPreviousPlayerCells75 if rowValues is empty
    if (!rowValues || Object.keys(rowValues).length === 0) {
      const prevCells = getPreviousPlayerCells75(player.id, player.name);
      if (prevCells && prevCells.length > 0) {
        rowValues = {};
        prevCells.forEach((c) => {
          const rNum = c.rowNumber || c.rowIndex + 1;
          if (!rowValues[rNum]) {
            rowValues[rNum] = {
              rowNumber: rNum,
              totalMultiplier: 0,
              columnIndexes: [],
              columnMultipliers: [],
            };
          }
          const mult = c.multiplier || 1;
          rowValues[rNum].totalMultiplier += mult;
          rowValues[rNum].columnIndexes.push(c.columnIndex);
          rowValues[rNum].columnMultipliers.push(mult);
        });
      }
    }

    if (!rowValues || Object.keys(rowValues).length === 0) {
      return { assignedCount: 0, assignedSummary: [], skippedSummary: [] };
    }

    let assignedCount = 0;
    const assignedSummary: string[] = [];
    const skippedSummary: string[] = [];

    // Sort rows by rowNumber (1 to 15)
    const sortedRowEntries = Object.entries(rowValues).sort(
      ([a], [b]) => Number(a) - Number(b)
    );

    sortedRowEntries.forEach(([rowStr, rowInfo]) => {
      const rowNum = Number(rowStr);
      const targetMult = rowInfo.totalMultiplier;
      const prevCols = rowInfo.columnIndexes || [];

      if (rowNum < 1 || rowNum > 15 || targetMult <= 0) return;

      const chosenCols = findBestColumnsForTargetMultiplier(
        updatedColumns,
        rowNum,
        targetMult,
        prevCols,
        player.id,
        player.name
      );

      if (chosenCols.length > 0) {
        let achievedMult = 0;
        chosenCols.forEach((cIdx) => {
          const col = updatedColumns[cIdx];
          if (!col || !col.cells) return;
          const targetCell = col.cells[rowNum - 1];
          if (!targetCell) return;

          // Double security check: NEVER steal or overwrite another player's cell!
          const isOther =
            targetCell.playerId &&
            targetCell.playerId !== player.id &&
            targetCell.playerName &&
            targetCell.playerName.toLowerCase().trim() !== pNameLower;
          if (isOther) return;

          targetCell.playerId = player.id;
          targetCell.playerName = player.name;
          targetCell.color = player.color;
          targetCell.textColor = player.textColor || '#000000';
          targetCell.isPaid = false;
          assignedCount++;
          achievedMult += col.multiplier || 1;
        });

        // Clear any old cell on THIS row that belonged to this player but wasn't in chosenCols
        updatedColumns.forEach((col, cIdx) => {
          if (!chosenCols.includes(cIdx)) {
            const cell = col.cells[rowNum - 1];
            if (
              cell &&
              (cell.playerId === player.id ||
                (cell.playerName && cell.playerName.toLowerCase().trim() === pNameLower))
            ) {
              cell.playerId = undefined;
              cell.playerName = undefined;
              cell.color = undefined;
              cell.isPaid = false;
            }
          }
        });

        assignedSummary.push(`${rowNum} (X${achievedMult})`);
      } else {
        skippedSummary.push(`Fila ${rowNum} (X${targetMult})`);
      }
    });

    return { assignedCount, assignedSummary, skippedSummary };
  };

  // Re-assign automatically all cells/numbers this player had in the previous game ("Mismos")
  // Strict Rule: DO NOT remove or steal cells already assigned to other players; ONLY assign available cells!
  const handleAssignSameCellsFromPreviousGame = (player: BingoSheetPlayer) => {
    pushUndoSnapshot();

    let result = {
      assignedCount: 0,
      assignedSummary: [] as string[],
      skippedSummary: [] as string[],
    };

    setSheet((prev) => {
      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => ({ ...cell })),
      }));

      result = assignMismosForPlayer(updatedColumns, player);

      return {
        ...prev,
        columns: updatedColumns,
      };
    });

    if (result.assignedCount === 0 && result.skippedSummary.length === 0) {
      notify(`No se encontraron casillas previas para "${player.name}" en la partida anterior.`);
    } else if (result.skippedSummary.length > 0 && result.assignedSummary.length > 0) {
      notify(
        `¡Mismos anotados para ${player.name}! Se anotó: ${result.assignedSummary.join(', ')}. ${result.skippedSummary.join(', ')} ya estaba ocupada por otros jugadores.`
      );
    } else if (result.assignedSummary.length > 0) {
      notify(
        `¡Mismos anotados para ${player.name}! Se igualó la partida pasada: ${result.assignedSummary.join(', ')}.`
      );
    } else {
      notify(
        `No se pudieron anotar los mismos para ${player.name}: ${result.skippedSummary.join(', ')} ya están ocupados por otros jugadores.`
      );
    }
  };

  // Re-assign same cells from previous game for ALL current players
  // Strict Rule: DO NOT remove or steal cells already assigned to other players; ONLY assign available cells!
  const handleAssignSameCellsForAllPlayers = () => {
    if (sheet.players.length === 0) {
      notify('No hay jugadores registrados.');
      return;
    }

    pushUndoSnapshot();

    let totalAssigned = 0;
    let playersProcessed = 0;
    const skippedDetails: string[] = [];

    setSheet((prev) => {
      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => ({ ...cell })),
      }));

      prev.players.forEach((player) => {
        const res = assignMismosForPlayer(updatedColumns, player);
        if (res.assignedCount > 0) {
          totalAssigned += res.assignedCount;
          playersProcessed++;
        }
        if (res.skippedSummary.length > 0) {
          skippedDetails.push(`${player.name}: ${res.skippedSummary.join(', ')}`);
        }
      });

      return {
        ...prev,
        columns: updatedColumns,
      };
    });

    if (totalAssigned > 0) {
      if (skippedDetails.length > 0) {
        notify(
          `¡Mismos restaurados para ${playersProcessed} jugadores! (${totalAssigned} casillas anotadas sin tocar números de otros).`
        );
      } else {
        notify(
          `¡Mismos restaurados para todos los jugadores! Se anotaron ${totalAssigned} casillas con sus multiplicadores exactos.`
        );
      }
    } else {
      notify('No se encontraron casillas previas para anotar o todas las casillas ya estaban ocupadas.');
    }
  };

  // Delete player
  const handleDeletePlayer = (playerId: string) => {
    setSheet((prev) => {
      const filteredPlayers = prev.players.filter((p) => p.id !== playerId);
      // Also unassign from cells
      const updatedColumns = prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) =>
          cell.playerId === playerId
            ? { ...cell, playerId: undefined, playerName: undefined, color: undefined }
            : cell
        ),
      }));
      return { ...prev, players: filteredPlayers, columns: updatedColumns };
    });
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(sheet.players.find((p) => p.id !== playerId)?.id || '');
    }
  };

  // Change total rows (e.g. 10, 12, 15, 18, 20)
  const handleChangeTotalRows = (newRowsCount: number) => {
    const clamped = Math.max(5, Math.min(30, newRowsCount));
    setSheet((prev) => {
      const updatedColumns = prev.columns.map((col) => {
        const newCells: BingoSheetCell[] = [];
        for (let r = 1; r <= clamped; r++) {
          const existing = col.cells.find((c) => c.rowNumber === r);
          if (existing) {
            newCells.push(existing);
          } else {
            newCells.push({ rowNumber: r });
          }
        }
        return { ...col, cells: newCells };
      });
      return {
        ...prev,
        totalRows: clamped,
        columns: updatedColumns,
      };
    });
    notify(`Hoja ajustada a ${clamped} casillas por columna`);
  };

  // Add column
  const handleAddColumn = () => {
    setSheet((prev) => {
      const nextNum = prev.columns.length + 1;
      const mult = 1;
      const cells: BingoSheetCell[] = [];
      for (let r = 1; r <= prev.totalRows; r++) {
        cells.push({ rowNumber: r });
      }

      const newCol: BingoSheetColumn = {
        id: `col_${Date.now()}`,
        colNumber: nextNum,
        title: `X${mult}`,
        multiplier: mult,
        hasRedDividerRight: false,
        columnPrice: mult * prev.baseCost,
        columnPrize: mult * prev.basePrize,
        cells,
      };

      return {
        ...prev,
        columns: [...prev.columns, newCol],
      };
    });
    notify('Nueva columna agregada');
  };

  // Remove column
  const handleRemoveColumn = (colIndex: number) => {
    if (sheet.columns.length <= 1) {
      notify('Debe haber al menos 1 columna.');
      return;
    }
    setSheet((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, idx) => idx !== colIndex),
    }));
  };

  // Reset / Clear all cells (executed reliably without blocking confirm dialogs)
  const executeClearAllCells = () => {
    pushUndoSnapshot();
    setSheet((prev) => ({
      ...prev,
      players: prev.players.map((p) => ({ ...p, paid: false })),
      columns: prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => ({
          ...cell,
          playerId: undefined,
          playerName: undefined,
          color: undefined,
          isPaid: false,
        })),
      })),
    }));
    notify('Todas las casillas han sido vaciadas y se reiniciaron los pagos (puedes Deshacer si fue un error)');
  };

  // Quick action: Unmark all paid cells and players (so all become unpaid/pending)
  const handleClearAllPaidStatus = () => {
    setSheet((prev) => ({
      ...prev,
      players: prev.players.map((p) => ({ ...p, paid: false })),
      columns: prev.columns.map((col) => ({
        ...col,
        cells: col.cells.map((cell) => ({
          ...cell,
          isPaid: false,
        })),
      })),
    }));
    notify('Todos los números y jugadores fueron desmarcados como pagados');
  };


  // Reset to photo demo with 0.10x1.35 rate
  const handleResetToPhotoDemo = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('bingo_custom_sheet_data_v2');
    window.location.reload();
  };

  // Print sheet
  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      className="min-h-screen flex flex-col font-sans selection:bg-orange-500 selection:text-white"
      style={{
        backgroundColor: 'var(--bg-page, #fff7ed)',
        backgroundImage: 'var(--bg-page-gradient)',
        color: 'var(--text-primary, #431407)',
      }}
    >
      {/* Print-only CSS injection to ensure 100% fidelity on A4/Letter paper */}
      <style>{`
        @media print {
          body {
            background: #ffffff !important;
            color: #000000 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-container {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 4px !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
          }
          .printable-sheet {
            border: 2px solid #000000 !important;
            background: #ffffff !important;
            color: #000000 !important;
            page-break-inside: avoid;
            box-shadow: none !important;
          }
          .printable-sheet * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      {/* Floating Notification Toast */}
      {showNotification && (
        <div className="fixed top-5 right-5 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-semibold animate-fade-in border border-emerald-400">
          <Check className="w-4 h-4" />
          <span>{showNotification}</span>
        </div>
      )}

      {/* Column Edit Modal */}
      {editingColumnIndex !== null && sheet.columns[editingColumnIndex] && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up text-[#431407]">
            <div className="flex items-center justify-between border-b border-orange-200 pb-3">
              <h3 className="text-sm font-black text-[#431407] flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-orange-600" />
                Configurar Columna {editingColumnIndex + 1} ({sheet.columns[editingColumnIndex].title})
              </h3>
              <button
                onClick={() => setEditingColumnIndex(null)}
                className="text-orange-800 hover:text-orange-950 text-xs px-2.5 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 font-bold border border-orange-200"
              >
                Cerrar
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Multiplier Quick Buttons */}
              <div>
                <label className="block text-[11px] font-bold text-orange-900 uppercase tracking-wider mb-1.5">
                  Multiplicador para toda la columna hacia abajo:
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleSetColumnMultiplier(editingColumnIndex, m)}
                      className={`py-2 rounded-xl text-xs font-black transition-all ${
                        sheet.columns[editingColumnIndex].multiplier === m
                          ? 'bg-orange-500 text-white shadow-md scale-105 ring-2 ring-orange-300'
                          : 'bg-white text-orange-950 border border-orange-200 hover:bg-orange-100'
                      }`}
                    >
                      X{m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
                    Valor por casilla:
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={getCellCost(sheet.columns[editingColumnIndex])}
                      onChange={(e) => {
                        const clean = e.target.value.replace(',', '.');
                        const num = parseFloat(clean);
                        if (!isNaN(num) && num >= 0) {
                          handleUpdateColumn(editingColumnIndex, { columnPrice: num });
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-emerald-500 text-emerald-950 font-bold text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-orange-900 uppercase tracking-wider mb-1">
                    Puntos por casilla:
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={getCellPrize(sheet.columns[editingColumnIndex])}
                      onChange={(e) => {
                        const clean = e.target.value.replace(',', '.');
                        const num = parseFloat(clean);
                        if (!isNaN(num) && num >= 0) {
                          handleUpdateColumn(editingColumnIndex, { columnPrize: num });
                        }
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-orange-400 text-orange-950 font-bold text-sm focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-orange-100/70 border border-orange-200 text-[11px] text-orange-950 space-y-1">
                <div className="flex justify-between">
                  <span>Multiplicador actual:</span>
                  <strong className="text-orange-700 text-sm font-black">
                    X{sheet.columns[editingColumnIndex].multiplier || 1}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span>Total columna (15 casillas):</span>
                  <strong className="text-emerald-700 font-black">
                    {(getCellCost(sheet.columns[editingColumnIndex]) * sheet.totalRows).toFixed(2)}
                  </strong>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-orange-200">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(sheet.columns[editingColumnIndex].hasRedDividerRight)}
                    onChange={() => handleToggleRedDivider(editingColumnIndex)}
                    className="w-4 h-4 rounded accent-red-600"
                  />
                  <span className="text-xs text-orange-950 font-semibold">Línea divisoria roja a la derecha</span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setEditingColumnIndex(null)}
                  className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold shadow-md transition-all active:scale-95"
                >
                  Guardar y Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sequence Row (Terna & Bingo) Edit Modal */}
      {editingSeqRowModal !== null && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up text-[#431407]">
            <div className="flex items-center justify-between border-b border-orange-200 pb-3">
              <h3 className="text-sm font-black text-[#431407] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-purple-600" />
                Secuencia de Fila #{editingSeqRowModal}
              </h3>
              <button
                type="button"
                onClick={() => setEditingSeqRowModal(null)}
                className="text-orange-800 hover:text-orange-950 text-xs px-2.5 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 font-bold border border-orange-200"
              >
                Cerrar
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Configura los valores de la secuencia para esta fila: {isAmboActive && <><strong className="text-sky-800 font-black">A</strong> (Ambo), </>}<strong className="text-purple-800 font-black">T</strong> (Terna) y <strong className="text-amber-800 font-black">B</strong> (Bingo).
            </p>

            <form onSubmit={handleSaveSeqRow} className="space-y-3.5">
              <div className={`grid ${isAmboActive ? 'grid-cols-3' : 'grid-cols-2'} gap-2.5`}>
                {isAmboActive && (
                  <div className="p-2.5 bg-sky-50 rounded-xl border border-sky-200 space-y-1">
                    <label className="block text-[10.5px] font-black text-sky-950 uppercase tracking-wider">
                      Ambo (A):
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={seqModalAmbo}
                      onChange={(e) => setSeqModalAmbo(e.target.value)}
                      placeholder="Ej: 2"
                      className="w-full px-2 py-1.5 rounded-lg bg-white border border-sky-300 font-black text-center text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <span className="text-[8.5px] text-sky-700 block text-center font-semibold">
                      Fila Ambo
                    </span>
                  </div>
                )}

                <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 space-y-1">
                  <label className="block text-[10.5px] font-black text-purple-950 uppercase tracking-wider">
                    Terna (T):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={seqModalTerna}
                    onChange={(e) => setSeqModalTerna(e.target.value)}
                    placeholder="Ej: 14"
                    autoFocus={!isAmboActive}
                    className="w-full px-2 py-1.5 rounded-lg bg-white border border-purple-300 font-black text-center text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span className="text-[8.5px] text-purple-700 block text-center font-semibold">
                    Fila Terna
                  </span>
                </div>

                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
                  <label className="block text-[10.5px] font-black text-amber-950 uppercase tracking-wider">
                    Bingo (B):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={seqModalBingo}
                    onChange={(e) => setSeqModalBingo(e.target.value)}
                    placeholder="Ej: 68"
                    className="w-full px-2 py-1.5 rounded-lg bg-white border border-amber-300 font-black text-center text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="text-[8.5px] text-amber-700 block text-center font-semibold">
                    Fila Bingo
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSeqModalAmbo('');
                    setSeqModalTerna('');
                    setSeqModalBingo('');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Limpiar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-black text-xs shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  Guardar Secuencia
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Player Balance Adjustment Modal */}
      {editingPlayerBalance !== null && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up text-[#431407]">
            <div className="flex items-center justify-between border-b border-orange-200 pb-3">
              <h3 className="text-sm font-black text-[#431407] flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span>Ajustar Saldo: <strong>{editingPlayerBalance.name}</strong></span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingPlayerBalance(null)}
                className="text-orange-800 hover:text-orange-950 text-xs px-2.5 py-1 rounded-lg bg-orange-100 hover:bg-orange-200 font-bold border border-orange-200 cursor-pointer"
              >
                Cerrar
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Ajusta los montos acumulados de <strong>Ganó</strong> y <strong>Debe</strong> para el saldo de este jugador:
            </p>

            {/* Quick Settle / Reset Balance to $0 */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 flex items-center justify-between gap-2.5 shadow-2xs">
              <div className="min-w-0">
                <span className="text-xs font-black text-amber-950 block uppercase tracking-tight">¿Premio pagado o cuenta saldada?</span>
                <span className="text-[10px] text-amber-900 block leading-tight mt-0.5 font-semibold">
                  Reinicia deudas y ganancias acumuladas a $0.00 para empezar desde cero.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleResetIndividualPlayerBalance(editingPlayerBalance.id, editingPlayerBalance.name)}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-black font-black text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap flex-shrink-0"
                title="Pone el saldo en $0.00 y marca pagadas sus casillas"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reiniciar a $0</span>
              </button>
            </div>

            <form onSubmit={handleSavePlayerBalance} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                {/* Ganó */}
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 space-y-1.5">
                  <label className="block text-[11px] font-black text-emerald-950 uppercase tracking-wider">
                    Ganó Acumulado ($):
                  </label>
                  <input
                    type="text"
                    value={manualGanoStr}
                    onChange={(e) => setManualGanoStr(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 font-black text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setManualGanoStr('0')}
                      className="flex-1 py-0.5 text-[9px] font-bold bg-white text-emerald-800 rounded border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                    >
                      Poner $0
                    </button>
                  </div>
                </div>

                {/* Debe */}
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1.5">
                  <label className="block text-[11px] font-black text-amber-950 uppercase tracking-wider">
                    Debe ($):
                  </label>
                  <input
                    type="text"
                    value={manualDebeStr}
                    onChange={(e) => setManualDebeStr(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 font-black text-center text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => setManualDebeStr('0')}
                      className="px-2 py-0.5 text-[9.5px] font-black bg-emerald-100 text-emerald-900 rounded border border-emerald-300 hover:bg-emerald-200 cursor-pointer"
                      title="Marca la deuda completa como pagada ($0.00)"
                    >
                      Pagar Todo ($0)
                    </button>
                    {[1, 2, 5, 10].map((amt) => {
                      const curVal = parseFloat(manualDebeStr.replace(',', '.')) || 0;
                      if (curVal <= 0) return null;
                      return (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            const remaining = Math.max(0, curVal - amt);
                            setManualDebeStr(remaining.toFixed(2));
                          }}
                          className="px-1.5 py-0.5 text-[9px] font-bold bg-white text-amber-900 rounded border border-amber-200 hover:bg-amber-100 cursor-pointer"
                          title={`Abonar $${amt} a la deuda`}
                        >
                          - ${amt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Saldo Final Preview */}
              {(() => {
                const gVal = parseFloat(manualGanoStr.replace(',', '.')) || 0;
                const dVal = parseFloat(manualDebeStr.replace(',', '.')) || 0;
                const net = gVal - dVal;
                return (
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
                    net > 0
                      ? 'bg-emerald-100/80 border-emerald-300 text-emerald-950'
                      : net < 0
                      ? 'bg-rose-100/80 border-rose-300 text-rose-950'
                      : 'bg-slate-100 border-slate-300 text-slate-800'
                  }`}>
                    <span className="text-xs font-black uppercase">Saldo Total Resultante:</span>
                    <span className="text-sm font-black">
                      {net > 0 ? `+$${net.toFixed(2)}` : net < 0 ? `-$${Math.abs(net).toFixed(2)}` : '$0.00'}
                    </span>
                  </div>
                );
              })()}

              <div className="flex items-center gap-2 pt-1 border-t border-orange-200">
                <button
                  type="button"
                  onClick={() => setEditingPlayerBalance(null)}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Guardar Saldo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up text-[#431407]">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-100 border border-rose-300 flex-shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#431407]">¿Vaciar Cartón?</h3>
                <p className="text-xs text-orange-800">Esta acción limpiará todas las casillas.</p>
              </div>
            </div>
            <p className="text-xs text-orange-900">
              Se desasignarán todos los jugadores de las casillas de la planilla actual.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-orange-200">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="px-3.5 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-900 text-xs font-bold transition-all border border-orange-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  executeClearAllCells();
                  setShowClearConfirmModal(false);
                }}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-all shadow-md active:scale-95 flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, Vaciar Todo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Restore Button when top navigation is hidden */}
      {areTopNavsHidden && !is15SheetExpanded && (
        <div className="no-print fixed top-2 left-3 z-50 animate-fade-in">
          <button
            type="button"
            onClick={() => setAreTopNavsHidden(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md text-orange-950 border border-orange-300 shadow-md text-xs font-black hover:bg-orange-50 transition-all cursor-pointer active:scale-95"
            title="Mostrar cabecera superior y menú"
          >
            <ChevronDown className="w-3.5 h-3.5 text-orange-600" />
            <span>Mostrar Menú</span>
          </button>
        </div>
      )}

      {/* Top Navbar / Clean Navigation Header (Hidden when areTopNavsHidden is true) */}
      {!areTopNavsHidden && (
        <>
          <header className="no-print sticky top-0 z-40 bg-[#fffaf5]/95 backdrop-blur-md border-b border-orange-200 px-4 sm:px-6 py-2.5 flex items-center justify-between shadow-xs">
            <button
              onClick={onBackToGame}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-bold transition-all border border-orange-300 active:scale-95 shadow-xs"
              title="Regresar al Bolillero y Sorteador"
            >
              <ArrowLeft className="w-4 h-4 text-orange-700" />
              <span>Volver al Bolillero</span>
            </button>

            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-orange-600" />
              <span className="text-sm sm:text-base font-black tracking-tight text-[#431407]">
                Planilla Oficial
              </span>
            </div>

            <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
              {/* Admin Panel Button */}
              {onOpenAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-black transition-all active:scale-95 shadow-xs cursor-pointer"
                  title="Panel de Administrador (Gestión de Usuarios)"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                  <span className="hidden md:inline">Panel Admin</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSidebarTab('background')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 shadow-xs cursor-pointer ${
                  sidebarTab === 'background'
                    ? 'bg-purple-600 text-white border-purple-400 font-black'
                    : 'bg-purple-50 hover:bg-purple-100 text-purple-950 border-purple-200'
                }`}
                title="Personalizar fondo y opacidad del cartón"
              >
                <Palette className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Fondo</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all active:scale-95 shadow-xs cursor-pointer"
                title="Imprimir o exportar como PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Imprimir</span>
              </button>

              <button
                onClick={() => setShowClearConfirmModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-900 border border-rose-200 text-xs font-black transition-all active:scale-95 shadow-xs cursor-pointer"
                title="Vaciar todas las casillas del cartón"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Vaciar Cartón</span>
                <span className="sm:hidden">Vaciar</span>
              </button>

              {/* Ocultar Encabezado Button for maximizing vertical space */}
              <button
                type="button"
                onClick={() => setAreTopNavsHidden(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 border border-orange-300 text-xs font-black transition-all active:scale-95 shadow-xs cursor-pointer"
                title="Ocultar cabecera superior para ganar espacio vertical y ver las planillas completas"
              >
                <ChevronUp className="w-3.5 h-3.5 text-orange-700" />
                <span className="hidden sm:inline">Ocultar Encabezado</span>
                <span className="sm:hidden">Ocultar</span>
              </button>

              {/* Botón Deshacer (al lado izquierdo de Partidas Guardadas, mismo tamaño) */}
              <button
                type="button"
                onClick={handleUndo}
                disabled={sheetUndoStack.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 shadow-xs border ${
                  sheetUndoStack.length > 0
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500 cursor-pointer shadow-sm'
                    : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                }`}
                title="Deshacer hasta 4 movimientos o acciones dentro de la planilla (Ctrl+Z)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Deshacer</span>
                <span className="sm:hidden">Deshacer</span>
                {sheetUndoStack.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-800 text-white text-[10px] font-black">
                    {sheetUndoStack.length}
                  </span>
                )}
              </button>

              {/* Botón Resultados (al lado izquierdo de Partidas Guardadas, mismo tamaño) */}
              <button
                type="button"
                onClick={handleShowPreviousGameResults}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950 border border-amber-600 text-xs font-black transition-all active:scale-95 shadow-xs cursor-pointer"
                title="Ver directamente los resultados y planilla completa de la partida anterior"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-950 fill-amber-950/20" />
                <span className="hidden sm:inline">Resultados</span>
                <span className="sm:hidden">Resultados</span>
              </button>

              {/* Botón Minimizar y Expandir (al lado izquierdo de Partidas Guardadas, mismo tamaño) */}
              <button
                type="button"
                onClick={() => {
                  const next = !is15SheetExpanded;
                  setIs15SheetExpanded(next);
                  setIs15PanelCollapsed(next);
                  notify(next ? 'Planilla expandida' : 'Vista normal restaurada');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 text-xs font-black transition-all active:scale-95 shadow-xs cursor-pointer"
                title={is15SheetExpanded ? 'Minimizar planilla (vista normal)' : 'Expandir planilla completa'}
              >
                {is15SheetExpanded ? (
                  <>
                    <Minimize2 className="w-3.5 h-3.5 text-amber-900" />
                    <span className="hidden sm:inline">Minimizar</span>
                    <span className="sm:hidden">Minimizar</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3.5 h-3.5 text-amber-900" />
                    <span className="hidden sm:inline">Expandir</span>
                    <span className="sm:hidden">Expandir</span>
                  </>
                )}
              </button>

              {/* Partidas Guardadas Button */}
              {onOpenSavedGamesGallery && (
                <button
                  type="button"
                  onClick={onOpenSavedGamesGallery}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition-all active:scale-95 shadow-xs cursor-pointer border border-amber-700"
                  title="Abrir galería con todas las partidas guardadas, planillas e historial"
                >
                  <Layers className="w-3.5 h-3.5 text-yellow-200" />
                  <span className="hidden sm:inline">Partidas Guardadas</span>
                  <span className="sm:hidden">Partidas</span>
                  {savedGamesCount !== undefined && savedGamesCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-yellow-300 text-[10px] font-black">
                      {savedGamesCount}
                    </span>
                  )}
                </button>
              )}

              {/* Nueva Partida */}
              {onStartNewGame && (
                <button
                  type="button"
                  onClick={onStartNewGame}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all active:scale-95 shadow-xs cursor-pointer"
                  title="Finalizar partida actual, archivar y comenzar nueva partida"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span className="hidden sm:inline">Nueva Partida</span>
                  <span className="sm:hidden">+ Nueva</span>
                </button>
              )}
            </div>
          </header>

          {/* Planilla Format Switcher: Multiplicadores 1 al 15 vs Triples 90 (Solo Admin puede cambiar; Operadora tiene panel fijo) */}
          <div className="no-print w-full max-w-[1550px] mx-auto px-3 sm:px-4 pt-3 flex items-center justify-between flex-wrap gap-2">
            {isAdmin ? (
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-orange-100/90 border border-orange-300 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleSelectSheetType('multipliers-15')}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    selectedSheetType === 'multipliers-15'
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'text-orange-950 hover:bg-orange-200/60'
                  }`}
                >
                  <Grid className="w-3.5 h-3.5" />
                  <span>Planilla Oficial (1 al 15 Multiplicadores)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSheetType('traditional-90')}
                  className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    selectedSheetType === 'traditional-90'
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'text-orange-950 hover:bg-orange-200/60'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Planilla Triples 90 (Tablas 1 y 2 - Foto)</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black uppercase tracking-wider">
                    Nueva
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-orange-100/90 border border-orange-300 shadow-2xs select-none">
                {assignedMode === '90' ? (
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black bg-orange-500 text-white shadow-xs">
                    <Table2 className="w-3.5 h-3.5" />
                    <span>Planilla Triples 90 (Panel Asignado)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-600 text-white shadow-xs">
                    <Grid className="w-3.5 h-3.5" />
                    <span>Planilla Oficial (1 al 15 Multiplicadores - Panel Asignado)</span>
                  </div>
                )}
              </div>
            )}

            <div className="text-xs font-bold text-orange-900/70 hidden md:block">
              {selectedSheetType === 'traditional-90'
                ? 'Formato Tradicional 90 Bolas: 30 Filas por Tabla (1-30, 31-60, 61-90)'
                : 'Formato Oficial 15 Filas con Columnas X1, X2, X3, X4'}
            </div>
          </div>
        </>
      )}

      {/* Main Content Area */}
      {selectedSheetType === 'traditional-90' ? (
        /* TRADITIONAL 90-BALL DUAL/MULTI TABLES FORMAT WITH INTEGRATED BOLILLERO 90 */
        <div className={`flex-1 w-full max-w-[1700px] mx-auto ${areTopNavsHidden ? 'p-1' : 'p-2 sm:p-3'} flex flex-col items-center`}>
          <BingoTraditional90Sheet
            drawnBalls={drawnBalls}
            players={sheet.players}
            onUpdatePlayers={(newPlayers) => setSheet((prev) => ({ ...prev, players: newPlayers }))}
            currentUser={currentUser}
            onStopBolillero={onStopBolillero}
            onBingoCompleted={onBingoCompleted}
            autoHighlightDrawn={autoHighlightDrawn}
            onToggleAutoHighlightDrawn={onToggleAutoHighlightDrawn}
            currentBall={currentBall}
            onDrawBall={onDrawBall}
            isPlaying={isPlaying}
            onTogglePlay={onTogglePlay}
            onResetGame={onResetGame}
            settings={settings}
            onUpdateSettings={onUpdateSettings}
            gameSequence90={gameSequence90}
            onOpenGameSnapshot={onOpenGameSnapshot}
            onClearSequence90={onClearSequence90}
            totalBalls={totalBalls}
            areBuilderHeadersHidden={areTopNavsHidden}
            onToggleBuilderHeaders={() => setAreTopNavsHidden((prev) => !prev)}
            onStartNewGame={onStartNewGame}
            onOpenSavedGamesGallery={onOpenSavedGamesGallery}
            savedGamesCount={savedGamesCount}
          />
        </div>
      ) : (
        /* OFFICIAL 1-15 MULTIPLIERS FORMAT */
        <div
          className={`flex-1 w-full ${
            is15SheetExpanded
              ? 'fixed inset-0 z-40 bg-[#fffaf5] p-1.5 sm:p-2 flex flex-col overflow-hidden h-screen'
              : 'max-w-[1550px] mx-auto p-3 sm:p-4 flex flex-col lg:flex-row gap-4 items-start justify-center'
          }`}
        >
          <div
            className={`w-full flex-1 flex ${
              is15SheetExpanded
                ? 'flex-row items-stretch gap-2 overflow-hidden min-h-0'
                : 'flex-col lg:flex-row gap-4 items-start'
            }`}
          >
          {/* Left Side: Controls & Configuration */}
          {(!is15SheetExpanded || !is15PanelCollapsed) && (
          <aside
            className={`no-print ${
              is15SheetExpanded
                ? 'w-60 lg:w-64 h-full overflow-y-auto pr-0.5 gap-2.5 text-xs'
                : 'w-full lg:w-80 gap-4'
            } flex flex-col flex-shrink-0 transition-all`}
          >
            {/* Header bar with Ocultar button when expanded */}
            {is15SheetExpanded && (
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-orange-100/90 rounded-xl border border-orange-200 text-xs font-black text-orange-950">
                <span className="flex items-center gap-1">
                  <Settings2 className="w-3.5 h-3.5 text-orange-600" />
                  <span>Panel Control</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIs15PanelCollapsed(true)}
                  className="px-2 py-0.5 rounded-lg bg-white hover:bg-orange-200 text-orange-900 border border-orange-300 text-[10px] font-black flex items-center gap-0.5 cursor-pointer transition-all active:scale-95 shadow-2xs"
                  title="Ocultar panel (puedes volver a abrirlo en cualquier momento)"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-orange-700" />
                  <span>Ocultar</span>
                </button>
              </div>
            )}
            {/* Navigation tabs for sidebar */}
            <div
              className={`grid grid-cols-4 ${
                is15SheetExpanded ? 'p-0.5 rounded-lg text-[9px]' : 'p-1 rounded-xl text-[10.5px]'
              } bg-orange-100/80 border border-orange-200 font-bold text-orange-950`}
            >
              <button
                onClick={() => setSidebarTab('players')}
                className={`${
                  is15SheetExpanded ? 'py-1 px-0.5' : 'py-2 px-1'
                } rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 ${
                  sidebarTab === 'players'
                    ? 'bg-orange-500 text-white shadow-xs font-black'
                    : 'text-orange-900/80 hover:bg-orange-200/50'
                }`}
                title="Gestión y asignación de jugadores"
              >
                <Users className={`${is15SheetExpanded ? 'w-3 h-3' : 'w-3.5 h-3.5'} flex-shrink-0`} />
                <span className="truncate">Jugadores</span>
              </button>
              <button
                onClick={() => setSidebarTab('background')}
                className={`${
                  is15SheetExpanded ? 'py-1 px-0.5' : 'py-2 px-1'
                } rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 ${
                  sidebarTab === 'background'
                    ? 'bg-purple-600 text-white shadow-xs font-black'
                    : 'text-orange-900/80 hover:bg-orange-200/50'
                }`}
                title="Fondo del cartón, marcas de agua y opacidad"
              >
                <Palette className={`${is15SheetExpanded ? 'w-3 h-3' : 'w-3.5 h-3.5'} flex-shrink-0`} />
                <span className="truncate">Fondo</span>
              </button>
              <button
                onClick={() => setSidebarTab('columns')}
                className={`${
                  is15SheetExpanded ? 'py-1 px-0.5' : 'py-2 px-1'
                } rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 ${
                  sidebarTab === 'columns'
                    ? 'bg-orange-500 text-white shadow-xs font-black'
                    : 'text-orange-900/80 hover:bg-orange-200/50'
                }`}
                title="Multiplicadores de columna X1, X2..."
              >
                <TrendingUp className={`${is15SheetExpanded ? 'w-3 h-3' : 'w-3.5 h-3.5'} flex-shrink-0`} />
                <span className="truncate">Columnas</span>
              </button>
              <button
                onClick={() => setSidebarTab('rates')}
                className={`${
                  is15SheetExpanded ? 'py-1 px-0.5' : 'py-2 px-1'
                } rounded-lg transition-all flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 ${
                  sidebarTab === 'rates'
                    ? 'bg-orange-500 text-white shadow-xs font-black'
                    : 'text-orange-900/80 hover:bg-orange-200/50'
                }`}
                title="Valores base y premios"
              >
                <Calculator className={`${is15SheetExpanded ? 'w-3 h-3' : 'w-3.5 h-3.5'} flex-shrink-0`} />
                <span className="truncate">Valores</span>
              </button>
            </div>

            {/* TAB 1: Columns Multipliers Management (X1, X2, X3...) */}
            {sidebarTab === 'columns' && (
              <div
                className={`${
                  is15SheetExpanded ? 'p-2 sm:p-2.5 rounded-xl space-y-2.5 text-xs' : 'p-4 sm:p-5 rounded-2xl space-y-4'
                } bg-[#ffffff] border border-orange-200 shadow-md animate-fade-in text-[#431407]`}
              >
                <div className="flex items-center justify-between border-b border-orange-100 pb-2">
                  <div>
                    <h2
                      className={`${
                        is15SheetExpanded ? 'text-xs' : 'text-sm'
                      } font-black text-[#431407] flex items-center gap-1.5`}
                    >
                      <TrendingUp className={`${is15SheetExpanded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-orange-600`} />
                      Multiplicadores de Columna
                    </h2>
                    <p className={`${is15SheetExpanded ? 'text-[10px]' : 'text-[11px]'} text-orange-900/70 mt-0.5`}>
                      Define el valor de todas las casillas de esa columna.
                    </p>
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="space-y-1">
                  <span className="text-[9.5px] font-bold uppercase text-orange-900/80 tracking-wider">
                    Presets Rápidos:
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => handleSetAllColumnsMultiplier(1)}
                      className={`${
                        is15SheetExpanded ? 'py-1 px-1 text-[10px]' : 'py-1.5 px-2 text-xs'
                      } rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-950 font-bold border border-orange-200 transition-all text-center`}
                      title="Todas las columnas en X1"
                    >
                      Todas X1
                    </button>
                    <button
                      type="button"
                      onClick={handleSetStaircaseMultipliers}
                      className={`${
                        is15SheetExpanded ? 'py-1 px-1 text-[10px]' : 'py-1.5 px-2 text-xs'
                      } rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold border border-amber-300 transition-all text-center`}
                      title="Col 1: X1, Col 2: X2, Col 3: X3..."
                    >
                      X1, X2, X3...
                    </button>
                    <button
                      type="button"
                      onClick={handleSetPairsMultipliers}
                      className={`${
                        is15SheetExpanded ? 'py-1 px-1 text-[10px]' : 'py-1.5 px-2 text-xs'
                      } rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-950 font-bold border border-orange-300 transition-all text-center`}
                      title="X1, X1, X2, X2, X3, X3..."
                    >
                      Por Pares
                    </button>
                  </div>
                </div>

              {/* List of Columns with Direct Multiplier Selectors */}
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {sheet.columns.map((col, cIdx) => {
                  const mult = col.multiplier || 1;
                  const colCost = getCellCost(col);
                  const colPrize = getCellPrize(col);

                  return (
                    <div
                      key={col.id}
                      className="p-3 rounded-xl bg-[#fffaf5] border border-orange-200 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-orange-200 border border-orange-300 flex items-center justify-center text-xs font-black text-orange-950">
                            {cIdx + 1}
                          </span>
                          <span className="text-base font-black text-orange-600">
                            X{mult}
                          </span>
                          {col.hasRedDividerRight && (
                            <span className="px-1.5 py-0.2 rounded bg-red-100 text-red-700 text-[9px] font-bold border border-red-300">
                              Línea Roja
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-orange-950">
                          Valor: <strong className="text-emerald-700 font-black">{colCost.toFixed(2)}</strong> • Puntos:{' '}
                          <strong className="text-orange-700 font-black">{colPrize.toFixed(2)}</strong>
                        </div>
                      </div>

                      {/* Multiplier buttons for this column */}
                      <div className="flex items-center justify-between gap-1 pt-1">
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => handleSetColumnMultiplier(cIdx, m)}
                              className={`w-7 h-7 rounded-lg text-xs font-black transition-all ${
                                mult === m
                                  ? 'bg-orange-500 text-white shadow-md scale-105'
                                  : 'bg-white hover:bg-orange-100 text-orange-950 border border-orange-200'
                              }`}
                              title={`Establecer columna ${cIdx + 1} en X${m}`}
                            >
                              X{m}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleFillColumn(cIdx)}
                            className="px-2 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white text-[10px] font-bold shadow-xs active:scale-95"
                            title="Llenar columna con jugador seleccionado"
                          >
                            Llenar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleRedDivider(cIdx)}
                            className={`p-1 rounded text-[10px] font-bold border ${
                              col.hasRedDividerRight ? 'bg-red-600 text-white border-red-700' : 'bg-white text-orange-950 border-orange-200 hover:bg-orange-100'
                            }`}
                            title="Alternar divisor rojo"
                          >
                            |
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveColumn(cIdx)}
                            disabled={sheet.columns.length <= 1}
                            className="p-1 rounded text-orange-400 hover:text-rose-600 disabled:opacity-30"
                            title="Eliminar columna"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Add column button */}
              <button
                type="button"
                onClick={handleAddColumn}
                className="w-full py-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-bold transition-all border border-orange-300 flex items-center justify-center gap-1.5 shadow-xs active:scale-95"
              >
                <Grid className="w-3.5 h-3.5 text-orange-600" />
                <span>+ Agregar Otra Columna</span>
              </button>
            </div>
          )}

          {/* TAB 2: Base Rates & Sheet Info */}
          {sidebarTab === 'rates' && (
            <div
              className={`${
                is15SheetExpanded ? 'p-2 sm:p-2.5 rounded-xl space-y-2.5 text-xs' : 'p-4 sm:p-5 rounded-2xl space-y-4'
              } bg-[#ffffff] border border-orange-200 shadow-md animate-fade-in text-[#431407]`}
            >
              <div className="flex items-center justify-between border-b border-orange-100 pb-2">
                <h2
                  className={`${
                    is15SheetExpanded ? 'text-xs' : 'text-sm'
                  } font-black text-[#431407] flex items-center gap-1.5`}
                >
                  <Calculator className={`${is15SheetExpanded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-orange-600`} />
                  Tasa Base del Juego
                </h2>
                <span className="text-[10px] font-bold text-orange-900/70">
                  {sheet.columns.length} col. × {sheet.totalRows} filas
                </span>
              </div>

              {/* Base Rate 0.10 x 1.35 - Free-Form Manual Entry */}
              <div
                className={`${
                  is15SheetExpanded ? 'p-2 rounded-lg space-y-2' : 'p-3.5 sm:p-4 rounded-xl space-y-3.5'
                } bg-orange-50/90 border border-orange-200`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 h-6 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-xs">
                      <Coins className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <span className="text-xs font-black text-orange-950 uppercase tracking-wide block">
                        Valores Base por cada X1
                      </span>
                      <span className="text-[10px] text-orange-900/70 block">
                        Ingresa cualquier número manualmente (acepta decimales con punto o coma)
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                    Entrada Libre
                  </span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {/* 1. Valor Inicial del Juego (Entrada Base X1) */}
                  <div className="p-2.5 rounded-xl bg-white border border-emerald-400 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-black text-emerald-950 uppercase tracking-wider">
                        Valor Inicial del Juego (X1):
                      </label>
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Costo Casilla
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-emerald-600 font-bold text-base pointer-events-none">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualCostStr}
                        onChange={(e) => handleCostInputChange(e.target.value)}
                        onBlur={handleCostInputBlur}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleApplyManualRates();
                        }}
                        placeholder="0.10"
                        className="w-full pl-7 pr-8 py-1.5 rounded-lg bg-emerald-50/40 border border-emerald-300 text-emerald-950 text-base font-black focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all tabular-nums"
                      />
                      {manualCostStr && (
                        <button
                          type="button"
                          onClick={() => setManualCostStr('')}
                          className="absolute right-2 p-1 rounded-full text-emerald-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                          title="Borrar para escribir nuevo valor"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 2. Cuánto Paga el Bingo (Premio Bingo X1) */}
                  <div className="p-2.5 rounded-xl bg-white border border-orange-400 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-black text-orange-950 uppercase tracking-wider">
                        Cuánto Paga el Bingo (X1):
                      </label>
                      <span className="text-[10px] font-extrabold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                        Premio Bingo
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <span className="absolute left-3 text-orange-600 font-bold text-base pointer-events-none">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={manualPrizeStr}
                        onChange={(e) => handlePrizeInputChange(e.target.value)}
                        onBlur={handlePrizeInputBlur}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleApplyManualRates();
                        }}
                        placeholder="1.35"
                        className="w-full pl-7 pr-8 py-1.5 rounded-lg bg-orange-50/40 border border-orange-300 text-orange-950 text-base font-black focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all tabular-nums"
                      />
                      {manualPrizeStr && (
                        <button
                          type="button"
                          onClick={() => setManualPrizeStr('')}
                          className="absolute right-2 p-1 rounded-full text-orange-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                          title="Borrar para escribir nuevo valor"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3. Cuánto Paga la Terna (Premio Terna X1 - OPCIONAL) */}
                  <div className={`p-2.5 rounded-xl bg-white border shadow-xs space-y-2 transition-all ${
                    ternaEnabled ? 'border-purple-400 ring-1 ring-purple-300/40' : 'border-slate-200 bg-slate-50/60'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ternaEnabled}
                          onChange={(e) => handleToggleTernaEnabled(e.target.checked)}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-300 cursor-pointer"
                        />
                        <span className="text-[11px] font-black text-purple-950 uppercase tracking-wider">
                          Pagar Terna en esta partida
                        </span>
                      </label>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        ternaEnabled
                          ? 'text-purple-800 bg-purple-50 border-purple-200'
                          : 'text-slate-500 bg-slate-100 border-slate-200'
                      }`}>
                        {ternaEnabled ? 'Opcional (Activa)' : 'Opcional (Desactivada)'}
                      </span>
                    </div>

                    {ternaEnabled ? (
                      <div className="space-y-1 animate-fade-in">
                        <label className="block text-[10px] font-bold text-purple-900">
                          Cuánto Paga la Terna (X1):
                        </label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-purple-600 font-bold text-base pointer-events-none">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={manualTernaStr}
                            onChange={(e) => handleTernaInputChange(e.target.value)}
                            onBlur={handleTernaInputBlur}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleApplyManualRates();
                            }}
                            placeholder="0.50"
                            className="w-full pl-7 pr-8 py-1.5 rounded-lg bg-purple-50/40 border border-purple-300 text-purple-950 text-base font-black focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all tabular-nums"
                          />
                          {manualTernaStr && (
                            <button
                              type="button"
                              onClick={() => setManualTernaStr('')}
                              className="absolute right-2 p-1 rounded-full text-purple-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                              title="Borrar para escribir nuevo valor"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 font-semibold italic">
                        Solo se pagará el Bingo. Marca la casilla de arriba si esta partida también pagará Terna.
                      </p>
                    )}
                  </div>

                  {/* 4. Cuánto Paga el Ambo (Premio Ambo X1 - OPCIONAL: 2 números en una fila) */}
                  <div className={`p-2.5 rounded-xl bg-white border shadow-xs space-y-2 transition-all ${
                    amboEnabled ? 'border-sky-400 ring-1 ring-sky-300/40 bg-sky-50/20' : 'border-slate-200 bg-slate-50/60'
                  }`}>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={amboEnabled}
                          onChange={(e) => handleToggleAmboEnabled(e.target.checked)}
                          className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-gray-300 cursor-pointer"
                        />
                        <span className="text-[11px] font-black text-sky-950 uppercase tracking-wider">
                          Pagar Ambo (2 números) en esta partida
                        </span>
                      </label>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        amboEnabled
                          ? 'text-sky-800 bg-sky-50 border-sky-200'
                          : 'text-slate-500 bg-slate-100 border-slate-200'
                      }`}>
                        {amboEnabled ? 'Opcional (Activa)' : 'Opcional (Desactivada)'}
                      </span>
                    </div>

                    {amboEnabled ? (
                      <div className="space-y-1 animate-fade-in">
                        <label className="block text-[10px] font-bold text-sky-900">
                          Cuánto Paga el Ambo (X1):
                        </label>
                        <div className="relative flex items-center">
                          <span className="absolute left-3 text-sky-600 font-bold text-base pointer-events-none">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={manualAmboStr}
                            onChange={(e) => handleAmboInputChange(e.target.value)}
                            onBlur={handleAmboInputBlur}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleApplyManualRates();
                            }}
                            placeholder="0.25"
                            className="w-full pl-7 pr-8 py-1.5 rounded-lg bg-sky-50/40 border border-sky-300 text-sky-950 text-base font-black focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all tabular-nums"
                          />
                          {manualAmboStr && (
                            <button
                              type="button"
                              onClick={() => setManualAmboStr('')}
                              className="absolute right-2 p-1 rounded-full text-sky-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                              title="Borrar para escribir nuevo valor"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 font-semibold italic">
                        Marca la casilla si esta partida premiará Ambo (la primera fila en completar 2 números).
                      </p>
                    )}
                  </div>
                </div>

                {/* Explicit Apply Button */}
                <button
                  type="button"
                  onClick={handleApplyManualRates}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-amber-700 text-white font-black text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-98 cursor-pointer"
                >
                  <Check className="w-4 h-4 text-white" />
                  <span>Aplicar y Guardar Valores en Todas las Columnas</span>
                </button>
              </div>

              {/* Title & Host Fields */}
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-orange-900 uppercase tracking-wider mb-1">
                    Título de la Planilla:
                  </label>
                  <input
                    type="text"
                    value={sheet.title}
                    onChange={(e) => setSheet({ ...sheet, title: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-orange-200 text-orange-950 focus:outline-none focus:border-orange-500 font-bold"
                    placeholder="Ej: BIENVENIDOS A LA FAMILIA TEOO"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-orange-900 uppercase tracking-wider mb-1">
                      Les Atiende:
                    </label>
                    <input
                      type="text"
                      value={sheet.hostName}
                      onChange={(e) => setSheet({ ...sheet, hostName: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-orange-200 text-orange-950 focus:outline-none focus:border-orange-500 font-semibold"
                      placeholder="Tu nombre o alias..."
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-orange-900 uppercase tracking-wider mb-1">
                      Yappy / Tel:
                    </label>
                    <input
                      type="text"
                      value={sheet.hostPhone}
                      onChange={(e) => setSheet({ ...sheet, hostPhone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-orange-200 text-orange-950 focus:outline-none focus:border-orange-500 font-mono font-bold"
                      placeholder="Tu número de Yappy o teléfono..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Players & Paint Brush */}
          {sidebarTab === 'players' && (
            <div
              className={`${
                is15SheetExpanded ? 'p-2 sm:p-2.5 rounded-xl space-y-2.5 text-xs' : 'p-4 sm:p-5 rounded-2xl space-y-4'
              } bg-[#ffffff] border border-orange-200 shadow-md animate-fade-in text-[#431407]`}
            >
              <div className="flex items-center justify-between border-b border-orange-100 pb-2">
                <h2
                  className={`${
                    is15SheetExpanded ? 'text-xs' : 'text-sm'
                  } font-black text-[#431407] flex items-center gap-1.5`}
                >
                  <Users className={`${is15SheetExpanded ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-orange-600`} />
                  Jugadores y Cobros
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleClearAllPaidStatus}
                    className="px-1.5 py-0.5 rounded-lg text-[9.5px] font-black bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95"
                    title="Desmarcar todos los números y jugadores como pagados"
                  >
                    <span>Desmarcar Pagados</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAssignSameCellsForAllPlayers}
                    className="px-1.5 py-0.5 rounded-lg text-[9.5px] font-black bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95"
                    title="Anotar automáticamente para todos los jugadores las mismas casillas que tenían en la partida anterior"
                  >
                    <RotateCcw className="w-2.5 h-2.5 text-amber-700" />
                    <span>Mismos</span>
                  </button>
                  <span className="text-[10px] font-bold text-orange-900/70">
                    {sheet.players.length} jug.
                  </span>
                </div>
              </div>

              {/* Players List with Active Selection and Financial Breakdown */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {sheet.players.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[#fffaf5] border border-dashed border-orange-300 text-center space-y-1.5">
                    <Users className="w-6 h-6 text-orange-400 mx-auto" />
                    <p className="text-xs font-bold text-orange-950">No hay jugadores registrados</p>
                    <p className="text-[11px] text-orange-900/70">
                      Escribe el nombre abajo y presiona <strong className="text-orange-600">+ Agregar</strong> para comenzar.
                    </p>
                  </div>
                ) : (
                  sheet.players.map((player) => {
                    const isSelected = player.id === selectedPlayerId;
                    const assignedCells: BingoSheetCell[] = [];
                    sheet.columns.forEach((col) => {
                      col.cells.forEach((cell) => {
                        if (
                          cell.playerId === player.id ||
                          (cell.playerName && cell.playerName.toLowerCase().trim() === player.name.toLowerCase().trim())
                        ) {
                          assignedCells.push(cell);
                        }
                      });
                    });
                    const count = assignedCells.length;
                    const paidCellsCount = assignedCells.filter((c) => Boolean(c.isPaid)).length;
                    const unpaidCellsCount = count - paidCellsCount;
                    const isAllPaid = count > 0 && unpaidCellsCount === 0;
                    const isPartiallyPaid = paidCellsCount > 0 && unpaidCellsCount > 0;
                    const playerCost = stats.playerCosts[player.id] || 0;
                    const mults = stats.playerMultipliers[player.id] || {};

                    return (
                      <div
                        key={player.id}
                        onClick={() => setSelectedPlayerId(player.id)}
                        className={`p-2 rounded-xl cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-orange-100/90 border-orange-400 shadow-xs ring-2 ring-orange-400/50'
                            : 'bg-[#fffaf5] border-orange-200 hover:bg-orange-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          {/* Player identity with overflow protection */}
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-2xs flex-shrink-0"
                              style={{ backgroundColor: player.color }}
                            />
                            <span
                              className="text-xs font-black truncate"
                              style={{
                                color: player.textColor || '#000000',
                                textShadow:
                                  player.textColor && player.textColor !== '#000000'
                                    ? '0 1px 1px rgba(0,0,0,0.8)'
                                    : undefined,
                              }}
                              title={player.name}
                            >
                              {player.name}
                            </span>
                            {isSelected && (
                              <span className="text-[8px] font-black px-1 py-0.2 rounded bg-orange-500 text-white uppercase flex-shrink-0 tracking-tight">
                                Activo
                              </span>
                            )}
                          </div>

                          {/* Compact Action Buttons that never overflow */}
                          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                            {/* Mismos Button: compact micro-pill */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAssignSameCellsFromPreviousGame(player);
                              }}
                              className="px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-tight transition-all flex items-center gap-0.5 shadow-2xs bg-amber-300 hover:bg-amber-200 text-amber-950 border border-amber-400 cursor-pointer active:scale-95 whitespace-nowrap"
                              title={`Anotar automáticamente las mismas casillas y números que ${player.name} tenía en la partida anterior`}
                            >
                              <RotateCcw className="w-2 h-2 text-amber-900" />
                              <span>Mismos</span>
                            </button>

                            {/* Paid Status & Incremental Pay Button */}
                            {isPartiallyPaid ? (
                              <div className="flex items-center gap-1">
                                <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300" title={`Pagó ${paidCellsCount} de ${count} casillas. Hay ${unpaidCellsCount} casillas nuevas pendientes.`}>
                                  {paidCellsCount}/{count}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMarkRemainingPlayerCellsPaid(player.id);
                                  }}
                                  className="px-1.5 py-0.5 rounded-md text-[8.5px] font-black tracking-tight transition-all bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-700 shadow-2xs whitespace-nowrap cursor-pointer active:scale-95"
                                  title={`Marcar las ${unpaidCellsCount} casillas nuevas como pagadas`}
                                >
                                  + Pagar {unpaidCellsCount}
                                </button>
                              </div>
                            ) : isAllPaid ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePlayerPaid(player.id);
                                }}
                                className="px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-tight transition-all flex items-center gap-0.5 shadow-2xs whitespace-nowrap bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200 cursor-pointer active:scale-95"
                                title="Pago Completo Confirmado. Clic para marcar como pendiente."
                              >
                                <span>✓ Pagado ({paidCellsCount})</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePlayerPaid(player.id);
                                }}
                                className="px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-tight transition-all flex items-center gap-0.5 shadow-2xs whitespace-nowrap bg-rose-100 text-rose-900 border border-rose-300 hover:bg-rose-200 cursor-pointer active:scale-95"
                                title="Pago Pendiente. Clic para marcar como Confirmado."
                              >
                                <span>Pendiente</span>
                              </button>
                            )}

                            {/* Delete Player Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePlayer(player.id);
                              }}
                              className="p-1 rounded-md text-orange-400 hover:text-rose-600 hover:bg-rose-100 transition-colors flex-shrink-0"
                              title={`Eliminar jugador ${player.name}`}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Financial & Multiplier breakdown */}
                        <div className="mt-1 flex items-center justify-between text-[10px] text-orange-950 pt-1 border-t border-orange-200/60">
                          <div className="text-orange-900/70 font-semibold truncate mr-1">
                            {count} c.
                            {Object.keys(mults).length > 0 && (
                              <span className="text-orange-700 font-bold ml-1">
                                ({Object.entries(mults).map(([m, c]) => `X${m}:${c}`).join(' ')})
                              </span>
                            )}
                          </div>

                          <div className="font-black flex-shrink-0">
                            Total:{' '}
                            <span className="text-emerald-700 font-black tabular-nums">
                              ${playerCost.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add New Player Form - Compact & Balanced when Expanded */}
              <form
                onSubmit={handleAddPlayer}
                className={`${is15SheetExpanded ? 'space-y-1.5 pt-0.5' : 'space-y-3 pt-1'}`}
              >
                <span
                  className={`${
                    is15SheetExpanded ? 'text-[10px]' : 'text-[11px]'
                  } font-bold text-orange-900 uppercase tracking-wider block`}
                >
                  Nuevo Jugador:
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder={
                      is15SheetExpanded ? 'Nombre del jugador...' : 'Escribe el nombre del jugador...'
                    }
                    className={`flex-1 min-w-0 ${
                      is15SheetExpanded
                        ? 'px-2 py-1 text-[11px] rounded-lg'
                        : 'px-3 py-2 text-xs rounded-xl'
                    } bg-white border border-orange-200 text-orange-950 focus:outline-none focus:border-orange-500 font-bold placeholder:text-orange-900/40`}
                  />
                  <button
                    type="submit"
                    className={`${
                      is15SheetExpanded
                        ? 'px-2.5 py-1 text-[10.5px] rounded-lg gap-1'
                        : 'px-3.5 py-2 text-xs rounded-xl gap-1'
                    } bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-xs active:scale-95 cursor-pointer flex items-center justify-center flex-shrink-0 whitespace-nowrap`}
                    title="Agregar nuevo jugador"
                  >
                    <UserPlus
                      className={`${
                        is15SheetExpanded ? 'w-3 h-3' : 'w-3.5 h-3.5'
                      } flex-shrink-0`}
                    />
                    <span>Agregar</span>
                  </button>
                </div>

                {/* Paleta 1: Color de Fondo de Casilla (Más de 50 Colores Vivos) */}
                <div className={`${is15SheetExpanded ? 'space-y-0.5' : 'space-y-1'}`}>
                  <div className="flex items-center justify-between">
                    <span
                      className={`${
                        is15SheetExpanded ? 'text-[9px]' : 'text-[10px]'
                      } font-black text-orange-950 uppercase tracking-wider flex items-center gap-1`}
                    >
                      <Palette className="w-3 h-3 text-orange-600" />
                      <span>Fondo ({PRESET_COLORS.length} colores vivos):</span>
                    </span>
                    <span
                      className="w-4 h-4 rounded-full border border-black/30 shadow-2xs"
                      style={{ backgroundColor: newPlayerColor }}
                      title="Color de fondo seleccionado"
                    />
                  </div>
                  <div
                    className={`grid ${
                      is15SheetExpanded
                        ? 'grid-cols-6 gap-1 p-1 rounded-lg'
                        : 'grid-cols-11 gap-1.5 p-2 rounded-xl'
                    } bg-orange-50/70 border border-orange-200/90 max-h-28 overflow-y-auto scrollbar-thin`}
                  >
                    {PRESET_COLORS.map((c, idx) => (
                      <button
                        key={`preset_bg_${c.hex}_${c.name}_${idx}`}
                        type="button"
                        onClick={() => {
                          setNewPlayerColor(c.hex);
                          if (activePlayer) {
                            handleUpdatePlayerColor(activePlayer.id, c.hex);
                          }
                        }}
                        className={`${
                          is15SheetExpanded ? 'w-4 h-4' : 'w-5 h-5'
                        } rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                          newPlayerColor === c.hex
                            ? 'scale-125 border-white ring-2 ring-orange-600 shadow-md z-10'
                            : 'border-black/20 hover:scale-110 opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={`${c.name} (${c.hex})${activePlayer ? ` • Clic para aplicar a ${activePlayer.name}` : ''}`}
                      >
                        {newPlayerColor === c.hex && (
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: getContrastTextColor(c.hex) }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paleta 2: Color de Letras (Llamativos y Fosforescentes) */}
                <div className={`${is15SheetExpanded ? 'space-y-0.5' : 'space-y-1'}`}>
                  <div className="flex items-center justify-between">
                    <span
                      className={`${
                        is15SheetExpanded ? 'text-[9px]' : 'text-[10px]'
                      } font-black text-purple-950 uppercase tracking-wider flex items-center gap-1`}
                    >
                      <Type className="w-3 h-3 text-purple-600" />
                      <span>Letras ({FLUORESCENT_TEXT_COLORS.length} fosforescentes):</span>
                    </span>
                    <span
                      className="w-4 h-4 rounded-full border border-black/30 shadow-2xs"
                      style={{ backgroundColor: newPlayerTextColor }}
                      title="Color de letra seleccionado"
                    />
                  </div>
                  <div
                    className={`grid ${
                      is15SheetExpanded
                        ? 'grid-cols-6 gap-1 p-1 rounded-lg'
                        : 'grid-cols-10 gap-1.5 p-2 rounded-xl'
                    } bg-purple-50/70 border border-purple-200/90 max-h-28 overflow-y-auto scrollbar-thin`}
                  >
                    {FLUORESCENT_TEXT_COLORS.map((c, idx) => (
                      <button
                        key={`fluor_txt_${c.hex}_${c.name}_${idx}`}
                        type="button"
                        onClick={() => {
                          setNewPlayerTextColor(c.hex);
                          if (activePlayer) {
                            handleUpdatePlayerTextColor(activePlayer.id, c.hex);
                          }
                        }}
                        className={`${
                          is15SheetExpanded ? 'w-4 h-4' : 'w-5 h-5'
                        } rounded-full border transition-all cursor-pointer flex items-center justify-center ${
                          newPlayerTextColor === c.hex
                            ? 'scale-125 border-white ring-2 ring-purple-600 shadow-md z-10'
                            : 'border-black/30 hover:scale-110 opacity-85 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={`${c.name} (${c.hex})${activePlayer ? ` • Clic para aplicar a ${activePlayer.name}` : ''}`}
                      >
                        {newPlayerTextColor === c.hex && (
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: c.hex === '#000000' ? '#ffffff' : '#000000' }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Vista Previa en Vivo del Texto con Fondo */}
                <div
                  className="p-1.5 rounded-xl border-2 border-black/40 flex items-center justify-between text-center shadow-xs"
                  style={{ backgroundColor: newPlayerColor }}
                >
                  <span className="text-[9px] font-black uppercase opacity-70 tracking-tight" style={{ color: newPlayerTextColor }}>
                    Vista:
                  </span>
                  <span
                    className="font-black uppercase text-xs tracking-tight truncate max-w-[170px]"
                    style={{
                      color: newPlayerTextColor,
                      textShadow: newPlayerTextColor !== '#000000' ? '0 1px 2px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.95)' : undefined,
                    }}
                  >
                    {newPlayerName.trim() ? newPlayerName.toUpperCase() : activePlayer ? activePlayer.name.toUpperCase() : 'NOMBRE JUGADOR'}
                  </span>
                  <span className="text-[9px] font-mono font-bold" style={{ color: newPlayerTextColor }}>
                    #1
                  </span>
                </div>
              </form>
            </div>
          )}

          {/* TAB: Background Settings with Opacity Slider */}
          {sidebarTab === 'background' && (
            <SheetBackgroundSettings
              background={sheet.background}
              onChange={(newBg) => setSheet((prev) => ({ ...prev, background: newBg }))}
              onNotify={notify}
            />
          )}

          {/* Quick Statistics Card */}
          <div
            className={`${
              is15SheetExpanded ? 'p-2 rounded-xl space-y-2 text-xs' : 'p-4 rounded-2xl space-y-3'
            } bg-[#ffffff] border border-orange-200 shadow-md text-[#431407]`}
          >
            <h3
              className={`${
                is15SheetExpanded ? 'text-[11px]' : 'text-xs'
              } font-black text-orange-900 uppercase tracking-wider flex items-center gap-1.5`}
            >
              <Sparkles className="w-3.5 h-3.5 text-orange-500" />
              Resumen General
            </h3>

            <div className={`grid grid-cols-2 ${is15SheetExpanded ? 'gap-1.5' : 'gap-2'}`}>
              <div className={`${is15SheetExpanded ? 'p-1.5 rounded-lg' : 'p-2.5 rounded-xl'} bg-[#fffaf5] border border-orange-200`}>
                <span className="text-[9.5px] text-orange-900/70 font-bold block leading-tight">Total Acumulado</span>
                <span
                  className={`${
                    is15SheetExpanded ? 'text-sm' : 'text-lg'
                  } font-black text-emerald-700 font-mono block mt-0.5 leading-tight`}
                >
                  ${stats.totalRecaudado.toFixed(2)}
                </span>
                <span className="text-[8.5px] text-orange-900/60 block mt-0.5 font-semibold">
                  {stats.filledCells}/{stats.totalCells} casillas
                </span>
              </div>

              <div className={`${is15SheetExpanded ? 'p-1.5 rounded-lg' : 'p-2.5 rounded-xl'} bg-[#fffaf5] border border-orange-200`}>
                <span className="text-[9.5px] text-orange-900/70 font-bold block leading-tight">Total Planilla (100%)</span>
                <span
                  className={`${
                    is15SheetExpanded ? 'text-sm' : 'text-lg'
                  } font-black text-orange-950 font-mono block mt-0.5 leading-tight`}
                >
                  ${stats.totalRecaudacionPosible.toFixed(2)}
                </span>
                <span className="text-[8.5px] text-orange-900/60 block mt-0.5 font-semibold">
                  {stats.emptyCells} restantes
                </span>
              </div>
            </div>
          </div>
        </aside>
        )}

        {/* Floating button on the left to reopen Control Panel when collapsed */}
        {is15SheetExpanded && is15PanelCollapsed && (
          <button
            type="button"
            onClick={() => setIs15PanelCollapsed(false)}
            className="no-print absolute top-3 left-3 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-2xl border border-orange-400 font-black text-xs cursor-pointer active:scale-95 transition-all animate-fade-in"
            title="Abrir panel de control"
          >
            <ChevronRight className="w-4 h-4 text-amber-200" />
            <span>Panel Control</span>
          </button>
        )}

        {/* Right Side: The Sheet */}
        <div
          className={`flex-1 min-w-0 ${
            is15SheetExpanded ? 'h-full flex flex-col justify-center items-center overflow-hidden min-h-0' : 'w-full'
          }`}
        >
          <main
            className={`flex-1 w-full flex flex-col items-center justify-center print-container ${
              is15SheetExpanded ? 'h-full max-h-full overflow-hidden p-0.5 sm:p-1' : 'overflow-x-auto'
            }`}
          >
          {/* Winning Row Banner with automatic calculation of player earnings */}
          {activeWinningRow && !is15SheetExpanded && (
            <div className="no-print w-full max-w-[650px] mb-2">
              <BingoWinningRowBanner
                winningRowNumber={activeWinningRow}
                sheet={sheet}
                onClose={() => setActiveWinningRow(null)}
                winningBall={winningBall}
              />
            </div>
          )}

          {/* Manual Text Size Adjustment Bar & Results Quick Bar (Completely Hideable and Reopenable) */}
          {isTopAdjustmentBarVisible ? (
            <div className="no-print w-full max-w-[1280px] mb-2 px-3 py-1.5 rounded-xl bg-white border-2 border-orange-200/90 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs transition-all animate-fade-in">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Indicador de Fuente */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-100 text-orange-950 font-black text-xs border border-orange-300 shadow-2xs">
                  <Type className="w-3.5 h-3.5 text-orange-700" />
                  <span>Fuente: {cellFontSizeScale}%</span>
                </div>

                {/* Botón Resultados Anteriores (dentro de la barra superior) */}
                <button
                  type="button"
                  onClick={handleShowPreviousGameResults}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-xs border border-amber-600 shadow-2xs cursor-pointer active:scale-95 transition-all"
                  title="Ver directamente los resultados y planilla de la partida anterior"
                >
                  <Trophy className="w-3.5 h-3.5 text-amber-950 fill-amber-950/20" />
                  <span>Resultados Anteriores</span>
                </button>

                {/* Slider */}
                <div className="flex items-center gap-1.5 bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-200">
                  <button
                    type="button"
                    onClick={() => handleCellFontSizeChange(cellFontSizeScale - 5)}
                    className="w-5 h-5 rounded flex items-center justify-center font-black text-xs text-orange-800 hover:bg-orange-200 cursor-pointer active:scale-95"
                    title="Reducir tamaño del texto (-5%)"
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min="75"
                    max="145"
                    step="5"
                    value={cellFontSizeScale}
                    onChange={(e) => handleCellFontSizeChange(Number(e.target.value))}
                    className="w-20 sm:w-32 accent-orange-500 cursor-pointer h-1.5 bg-orange-200 rounded-lg"
                    title={`Ajuste manual de fuente: ${cellFontSizeScale}%`}
                  />
                  <button
                    type="button"
                    onClick={() => handleCellFontSizeChange(cellFontSizeScale + 5)}
                    className="w-5 h-5 rounded flex items-center justify-center font-black text-xs text-orange-800 hover:bg-orange-200 cursor-pointer active:scale-95"
                    title="Aumentar tamaño del texto (+5%)"
                  >
                    +
                  </button>
                  <span className="font-black text-orange-950 font-mono text-[11px] min-w-[34px] text-center">
                    {cellFontSizeScale}%
                  </span>
                  {cellFontSizeScale !== 100 && (
                    <button
                      type="button"
                      onClick={() => handleCellFontSizeChange(100)}
                      className="text-[9.5px] font-bold text-orange-600 hover:text-orange-900 underline ml-0.5 cursor-pointer"
                      title="Restablecer tamaño normal (100%)"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Preajustes y Botón Ocultar Toda la Barra */}
              <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] font-black flex-wrap">
                <span className="text-orange-900/60 font-semibold hidden sm:inline mr-0.5">Preajustes:</span>
                <button
                  type="button"
                  onClick={() => handleCellFontSizeChange(85)}
                  className={`px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                    cellFontSizeScale === 85 ? 'bg-orange-500 text-white border-orange-600 shadow-2xs font-black' : 'bg-white hover:bg-orange-50 text-orange-950 border-orange-200'
                  }`}
                  title="85% (Compacto)"
                >
                  Compacto
                </button>
                <button
                  type="button"
                  onClick={() => handleCellFontSizeChange(100)}
                  className={`px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                    cellFontSizeScale === 100 ? 'bg-orange-500 text-white border-orange-600 shadow-2xs font-black' : 'bg-white hover:bg-orange-50 text-orange-950 border-orange-200'
                  }`}
                  title="100% (Normal)"
                >
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => handleCellFontSizeChange(115)}
                  className={`px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                    cellFontSizeScale === 115 ? 'bg-orange-500 text-white border-orange-600 shadow-2xs font-black' : 'bg-white hover:bg-orange-50 text-orange-950 border-orange-200'
                  }`}
                  title="115% (Grande)"
                >
                  Grande
                </button>
                <button
                  type="button"
                  onClick={() => handleCellFontSizeChange(130)}
                  className={`px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                    cellFontSizeScale === 130 ? 'bg-orange-500 text-white border-orange-600 shadow-2xs font-black' : 'bg-white hover:bg-orange-50 text-orange-950 border-orange-200'
                  }`}
                  title="130% (Extra Grande)"
                >
                  Extra
                </button>

                {/* Botón para Ocultar Toda la Barra Superior (incluyendo el botón de resultados) */}
                <button
                  type="button"
                  onClick={() => handleToggleTopAdjustmentBar(false)}
                  className="ml-1 sm:ml-2 px-2.5 py-1 rounded-lg bg-orange-100 hover:bg-rose-100 text-orange-950 hover:text-rose-900 border border-orange-300 hover:border-rose-300 font-black transition-all cursor-pointer flex items-center gap-1 active:scale-95 shadow-2xs"
                  title="Ocultar toda esta barra superior (incluyendo el botón de resultados)"
                >
                  <EyeOff className="w-3.5 h-3.5 text-orange-700" />
                  <span>Ocultar</span>
                </button>
              </div>
            </div>
          ) : (
            /* Botón para Reabrir la Barra Superior de Ajuste */
            <div className="no-print w-full max-w-[1280px] mb-1.5 flex items-center justify-end">
              <button
                type="button"
                onClick={() => handleToggleTopAdjustmentBar(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/95 hover:bg-orange-50 text-orange-950 border border-orange-300 text-xs font-black shadow-xs hover:shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Mostrar barra superior de ajuste de tamaño de fuente y herramientas"
              >
                <Type className="w-3.5 h-3.5 text-orange-700" />
                <span>Ajuste de Fuente ({cellFontSizeScale}%)</span>
                <ChevronDown className="w-3.5 h-3.5 text-orange-600" />
              </button>
            </div>
          )}

          {/* Paper Canvas */}
          <div
            id="bingo-sheet-print"
            className={`printable-sheet relative overflow-hidden bg-white text-black rounded-xl shadow-2xl border-[3px] border-black transition-all ${
              is15SheetExpanded
                ? 'w-full max-w-[1280px] h-full max-h-full flex flex-col min-h-0 p-2 sm:p-2.5'
                : 'w-full p-2.5 sm:p-3.5 shadow-xl'
            }`}
            style={{
              maxWidth: is15SheetExpanded ? '100%' : `${Math.max(780, 80 + sheet.columns.length * 125)}px`,
            }}
          >
            {/* Background Layer with controllable Opacity & Anti-Brightness Filter */}
            {sheet.background?.enabled && sheet.background.url && (
              <div
                className="absolute inset-0 pointer-events-none z-0 transition-opacity duration-150"
                style={{
                  backgroundImage: `url("${sheet.background.url}")`,
                  backgroundSize:
                    sheet.background.fit === 'tile'
                      ? '140px 140px'
                      : sheet.background.fit === 'contain'
                      ? 'contain'
                      : 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: sheet.background.fit === 'tile' ? 'repeat' : 'no-repeat',
                  opacity: sheet.background.opacity ?? 0.18,
                  filter: `brightness(${sheet.background.brightness ?? 0.92})`,
                }}
              />
            )}

            {/* Inner Content Layer */}
            <div className={`relative z-10 ${is15SheetExpanded ? 'h-full flex flex-col min-h-0' : ''}`}>
              {/* Header: Host, Title, and Yappy (Compact, Single-Line, Clean) */}
              <div
                className={`flex items-center justify-between border-b-[2px] border-black gap-2 select-none flex-shrink-0 ${
                  is15SheetExpanded ? 'pb-1 mb-1' : 'pb-1.5 mb-1.5'
                }`}
              >
                {/* Left: Host Name badge */}
                <div className="border-[1.5px] border-black rounded bg-white flex items-center px-1.5 sm:px-2 py-0.5 gap-1 sm:gap-1.5 shadow-2xs flex-shrink-0">
                  <span className="text-[9.5px] sm:text-xs font-black text-black uppercase tracking-tight whitespace-nowrap">
                    LES ATIENDE:
                  </span>
                  <span
                    className="text-[11px] sm:text-xs md:text-sm font-black tracking-wide text-black uppercase truncate max-w-[100px] sm:max-w-[160px]"
                    title={sheet.hostName || 'LES ATIENDE'}
                  >
                    {(sheet.hostName || 'ADMINISTRACIÓN').toUpperCase()}
                  </span>
                </div>

                {/* Center: Title & Compact Prize Badges - Banner Styling */}
                <div className="min-w-0 flex-1 px-1 flex items-center justify-center gap-1 sm:gap-1.5 overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400 text-black font-black uppercase tracking-wider px-3 sm:px-4 py-0.5 rounded-md border border-amber-500 shadow-2xs flex items-center justify-center text-center truncate max-w-full">
                    <span className="text-[11px] sm:text-xs md:text-sm font-black uppercase text-black tracking-wide truncate drop-shadow-xs">
                      {(sheet.title && sheet.title !== 'PLANILLA OFICIAL') ? sheet.title.toUpperCase() : 'BIENVENIDOS A LA FAMILIA TEOO'}
                    </span>
                  </div>

                  {(isAmboActive || isTernaActive) && (
                    <div className="hidden sm:flex items-center gap-1 flex-shrink-0">
                      {isAmboActive && (
                        <span className="bg-sky-200 text-sky-950 px-1.5 py-0.5 rounded border border-black font-black text-[10px] uppercase">
                          ${(sheet.baseAmboPrize ?? 0.25).toFixed(2)} AMBO
                        </span>
                      )}
                      {isTernaActive && (
                        <span className="bg-emerald-200 text-emerald-950 px-1.5 py-0.5 rounded border border-black font-black text-[10px] uppercase">
                          ${(sheet.baseTernaPrize ?? 0.50).toFixed(2)} TERNA
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: Yappy box */}
                <div className="border-[1.5px] border-black rounded bg-white flex items-center px-1.5 sm:px-2 py-0.5 gap-1 sm:gap-1.5 shadow-2xs flex-shrink-0">
                  <span className="text-[9.5px] sm:text-xs font-black text-black uppercase tracking-tight whitespace-nowrap">
                    YAPPY:
                  </span>
                  <span
                    className="text-[11px] sm:text-xs md:text-sm font-black tracking-wider text-black uppercase whitespace-nowrap"
                    title={sheet.hostPhone || 'YAPPY'}
                  >
                    {sheet.hostPhone || '6341-9199'}
                  </span>
                </div>
              </div>

              {/* THE GRID TABLE */}
              <div
                className={`w-full border-[3px] border-black overflow-hidden bg-white/95 flex flex-col ${
                  is15SheetExpanded ? 'flex-1 min-h-0' : ''
                }`}
              >
              {/* Columns Header Row: AUTOSUMA + SECUENCIA (A | T | B) + BIG X1, X2, X3... MULTIPLIERS */}
              <div
                className="grid divide-x-[2.5px] divide-black border-b-[3px] border-black bg-slate-100 text-center select-none flex-shrink-0"
                style={{
                  gridTemplateColumns: `${seqColWidth}px repeat(${sheet.columns.length}, minmax(0, 1fr))`,
                }}
              >
                {/* Left Column Header: AUTOSUMA DE LÍNEAS + SECUENCIA (A | T | B) */}
                <div className="flex flex-col bg-slate-200 border-r-[2.5px] border-black overflow-hidden select-none justify-between">
                  {/* Conteo Exacto de Líneas de la Planilla (Suma de los multiplicadores de las columnas) */}
                  <div
                    className="py-1 px-1 bg-[#581c87] text-white flex items-center justify-center select-none text-center"
                    title={`Líneas de esta planilla: ${totalLineas} líneas (suma del valor/multiplicador de cada columna abierta). Líneas acumuladas en el turno: ${activeShiftLines}.`}
                  >
                    <div className="flex flex-col items-center leading-none">
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm sm:text-base font-black font-mono leading-none tracking-tight text-yellow-300 drop-shadow-xs">
                          {totalLineas}
                        </span>
                        <span className="text-[7.5px] sm:text-[8px] font-black uppercase text-purple-100 tracking-wider leading-none">
                          LÍN
                        </span>
                      </div>
                      {activeShiftLines > 0 && activeShiftLines !== totalLineas && (
                        <span className="text-[6.5px] sm:text-[7px] text-purple-200 font-bold leading-none mt-0.5" title={`Turno acumulado: ${activeShiftLines} líneas`}>
                          Turno: {activeShiftLines}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* SECUENCIA Banner */}
                  <div className="bg-[#facc15] text-black font-black uppercase text-[8px] sm:text-[9px] tracking-wider text-center py-0.5 border-t border-b border-black leading-none">
                    SECUENCIA
                  </div>

                  {/* Sub-headers: A (Ambo), T (Terna) & B (Bingo) */}
                  <div
                    className={`grid ${
                      isAmboActive ? 'grid-cols-3' : 'grid-cols-2'
                    } divide-x divide-purple-300 bg-[#581c87] text-white font-black text-[8px] sm:text-[9px] py-0.5 text-center leading-none uppercase`}
                  >
                    {isAmboActive && (
                      <span
                        title="Ambo (AMB) - Fila con 2 números antes que las demás"
                        className="cursor-help hover:bg-sky-700 bg-sky-950/40 text-sky-200 transition-colors"
                      >
                        AMB
                      </span>
                    )}
                    <span
                      title="Terna (TER) - Fila de Terna (3 números)"
                      className="cursor-help hover:bg-purple-700 transition-colors"
                    >
                      TER
                    </span>
                    <span
                      title="Bingo (BIN) - Fila de BINGO Ganador"
                      className="cursor-help hover:bg-purple-700 transition-colors"
                    >
                      BIN
                    </span>
                  </div>
                </div>

                {/* Individual Columns: SOLO, DOBLE, TRIPLE, CUARTA, QUINTA + BIG X1, X2, X3... HEADERS */}
                {sheet.columns.map((col, cIdx) => {
                  const mult = col.multiplier || 1;
                  const multName =
                    mult === 1
                      ? 'SOLO'
                      : mult === 2
                      ? 'DOBLE'
                      : mult === 3
                      ? 'TRIPLE'
                      : mult === 4
                      ? 'CUARTA'
                      : mult === 5
                      ? 'QUINTA'
                      : `X${mult}`;

                  return (
                    <div
                      key={col.id}
                      className={`relative group select-none flex flex-col h-full ${
                        col.hasRedDividerRight ? 'border-r-[4px] !border-r-red-600' : ''
                      }`}
                    >
                      {/* Cuadro ajustado del multiplicador: más compacto en altura, pero con fuente X y número más gruesa */}
                      <button
                        type="button"
                        onClick={() => {
                          pushUndoSnapshot();
                          handleCycleColumnMultiplier(cIdx);
                        }}
                        className={`w-full h-full py-1 px-0.5 flex flex-col items-center justify-center transition-colors active:scale-95 cursor-pointer ${
                          mult >= 2 ? 'bg-[#facc15] hover:bg-[#fde047]' : 'bg-white hover:bg-amber-50'
                        }`}
                        title={`Columna ${multName} (X${mult}). Clic para alternar multiplicador.`}
                      >
                        <span className="text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-tight text-black leading-none truncate max-w-full">
                          {multName}
                        </span>
                        <span
                          className="text-base sm:text-lg md:text-xl font-black text-black tracking-tight leading-none mt-0.5"
                          style={{
                            fontWeight: 900,
                            WebkitTextStroke: '0.6px black',
                            letterSpacing: '-0.02em',
                          }}
                        >
                          X{mult}
                        </span>
                      </button>

                      {/* Quick action buttons on hover (hidden when printing) */}
                      <div className="no-print absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity z-10">
                        <button
                          type="button"
                          onClick={() => setEditingColumnIndex(cIdx)}
                          className="p-0.5 rounded bg-slate-800 text-white text-[8px] font-bold"
                          title="Configurar columna"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            pushUndoSnapshot();
                            handleFillColumn(cIdx);
                          }}
                          className="p-0.5 rounded bg-blue-600 text-white text-[8px] font-bold"
                          title="Llenar columna completa con jugador activo"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRedDivider(cIdx)}
                          className={`p-0.5 rounded text-[8px] font-bold ${
                            col.hasRedDividerRight ? 'bg-red-600 text-white' : 'bg-slate-300 text-black'
                          }`}
                          title="Alternar línea divisoria roja"
                        >
                          |
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grid Rows (1 to totalRows) */}
              <div className={`flex flex-col divide-y-2 divide-black ${is15SheetExpanded ? 'flex-1 min-h-0' : ''}`}>
                {Array.from({ length: sheet.totalRows }).map((_, rIdx) => {
                  const rowNumber = rIdx + 1;
                  const isBingoActive = gameObjectives ? gameObjectives.bingo : (sheet.bingoEnabled !== false);
                  const isTernaActive = gameObjectives ? gameObjectives.terna : Boolean(sheet.ternaEnabled);
                  const isAmboActive = gameObjectives ? gameObjectives.ambo : Boolean(sheet.amboEnabled);

                  const isBingoCompleted = isBingoActive && completedRowLeaders.includes(rowNumber);
                  const isWinningRow = isBingoActive && (activeWinningRow === rowNumber || isBingoCompleted);
                  const isTernaRow = isTernaActive && (
                    activeTernaRow === rowNumber ||
                    currentMatchTernaRow === rowNumber ||
                    (Boolean(sheet.ternaEnabled) && customSeqEntries[rowNumber]?.terna === rowNumber)
                  );
                  const isAmboRow = isAmboActive && (
                    activeAmboRow === rowNumber ||
                    currentMatchAmboRow === rowNumber
                  );

                  return (
                    <div
                      key={rowNumber}
                      className={`grid divide-x-[2px] divide-black transition-all relative ${
                        is15SheetExpanded ? 'flex-1 min-h-0 max-h-[34px]' : 'h-[28px] sm:h-[30px] min-h-[28px]'
                      }`}
                      style={{
                        gridTemplateColumns: `${seqColWidth}px repeat(${sheet.columns.length}, minmax(0, 1fr))`,
                      }}
                    >
                      {/* LÍNEA / RESALTADO DE BINGO MÁS TRANSPARENTE (Detrás del texto en z-0 para no tapar los nombres) */}
                      {isWinningRow && (
                        <div
                          className="pointer-events-none absolute right-0 inset-y-0 bg-amber-400/25 border-y-2 border-red-500/50 z-0 rounded-r-md transition-all shadow-xs"
                          style={{ left: `${seqColWidth + 3}px` }}
                          title={`¡BINGO en Fila #${rowNumber}!`}
                        />
                      )}

                      {/* RESALTADO DE TERNA EN VERDE CLARITO (Detrás del texto en z-0 para no tapar los nombres) */}
                      {isTernaRow && !isWinningRow && (
                        <div
                          className="pointer-events-none absolute right-0 inset-y-0 bg-emerald-200/35 border-y-2 border-emerald-400/50 z-0 rounded-r-md transition-all shadow-xs"
                          style={{ left: `${seqColWidth + 3}px` }}
                          title={`¡TERNA en Fila #${rowNumber}!`}
                        />
                      )}

                      {/* RESALTADO DE AMBO EN CELESTE CLARITO (Detrás del texto en z-0 para no tapar los nombres) */}
                      {isAmboRow && !isWinningRow && !isTernaRow && (
                        <div
                          className="pointer-events-none absolute right-0 inset-y-0 bg-sky-200/35 border-y-2 border-sky-400/50 z-0 rounded-r-md transition-all shadow-xs"
                          style={{ left: `${seqColWidth + 3}px` }}
                          title={`¡AMBO en Fila #${rowNumber}! (2 números completados antes)`}
                        />
                      )}

                      {/* Left Cell: SECUENCIA (A | T | B) - 100% MANUAL */}
                      {(() => {
                        const isCurrentMatchRow = activeSequenceRow === rowNumber;
                        const customEntry = customSeqEntries[rowNumber];

                        // STRICTLY MANUAL: No automatic numbers, fallbacks, or ghost entries
                        const aVal: number | null =
                          customEntry?.ambo !== undefined && customEntry.ambo !== null && Number(customEntry.ambo) > 0
                            ? Number(customEntry.ambo)
                            : null;

                        const tVal: number | null =
                          customEntry?.terna !== undefined && customEntry.terna !== null && Number(customEntry.terna) > 0
                            ? Number(customEntry.terna)
                            : null;

                        const bVal: number | null =
                          customEntry?.bingo !== undefined && customEntry.bingo !== null && Number(customEntry.bingo) > 0
                            ? Number(customEntry.bingo)
                            : null;

                        return (
                          <div
                            className={`group/seq relative grid ${
                              isAmboActive ? 'grid-cols-3' : 'grid-cols-2'
                            } divide-x divide-black text-center select-none cursor-pointer transition-colors border-r-[2.5px] border-black ${
                              isCurrentMatchRow
                                ? 'bg-amber-100 hover:bg-amber-200 text-black font-black ring-1 ring-amber-400'
                                : 'bg-slate-50 hover:bg-amber-50 text-black'
                            }`}
                            title={`Fila #${rowNumber} - ${
                              isAmboActive ? `A: ${aVal ?? '-'} (Fila Ambo), ` : ''
                            }T: ${tVal ?? '-'} (Fila Terna), B: ${bVal ?? '-'} (Fila Bingo)${
                              isCurrentMatchRow ? ' [Partida Actual en Juego]' : ''
                            }. Pasa el cursor para editar.`}
                          >
                            {/* A (Ambo) */}
                            {isAmboActive && (
                              <div
                                onClick={() => {
                                  setActiveAmboRow((prev) => (prev === rowNumber ? null : rowNumber));
                                  notify(`Fila #${rowNumber} ${activeAmboRow === rowNumber ? 'deseleccionada de' : 'seleccionada para'} AMBO`);
                                }}
                                className={`flex items-center justify-center py-0.5 transition-colors ${
                                  isAmboRow ? 'bg-sky-200 text-sky-950 font-black' : 'bg-sky-50/50 hover:bg-sky-100'
                                }`}
                                title="Clic para alternar Fila Ganadora de AMBO"
                              >
                                {aVal !== null && aVal !== undefined ? (
                                  <span
                                    className="text-sky-950 font-black text-[14px] sm:text-[16px] leading-none drop-shadow-xs"
                                    style={cellFontSizeScale !== 100 ? { fontSize: `calc(1em * ${cellFontSizeScale / 100})` } : undefined}
                                  >
                                    {aVal}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 text-xs font-bold">-</span>
                                )}
                              </div>
                            )}

                            {/* T (Terna) */}
                            <div
                              onClick={() => {
                                setActiveTernaRow((prev) => (prev === rowNumber ? null : rowNumber));
                                notify(`Fila #${rowNumber} ${activeTernaRow === rowNumber ? 'deseleccionada de' : 'seleccionada para'} TERNA`);
                              }}
                              className={`flex items-center justify-center py-0.5 transition-colors ${
                                isTernaRow ? 'bg-emerald-200 text-emerald-950 font-black' : 'hover:bg-emerald-100'
                              }`}
                              title="Clic para alternar Fila Ganadora de TERNA"
                            >
                              {tVal !== null && tVal !== undefined ? (
                                <span
                                  className="text-slate-950 font-black text-[14px] sm:text-[16px] leading-none drop-shadow-xs"
                                  style={cellFontSizeScale !== 100 ? { fontSize: `calc(1em * ${cellFontSizeScale / 100})` } : undefined}
                                >
                                  {tVal}
                                </span>
                              ) : (
                                <span className="text-slate-300 text-xs font-bold">-</span>
                              )}
                            </div>

                            {/* B (Bingo) */}
                            <div
                              onClick={() => {
                                setActiveWinningRow((prev) => (prev === rowNumber ? null : rowNumber));
                                notify(`Fila #${rowNumber} ${activeWinningRow === rowNumber ? 'deseleccionada de' : 'seleccionada para'} BINGO`);
                              }}
                              className={`flex items-center justify-center py-0.5 transition-colors ${
                                isWinningRow ? 'bg-amber-300 text-amber-950 font-black' : 'hover:bg-amber-100'
                              }`}
                              title="Clic para alternar Fila Ganadora de BINGO"
                            >
                              {bVal !== null && bVal !== undefined && Number(bVal) > 0 ? (
                                <span
                                  className="text-slate-950 font-black text-[14px] sm:text-[16px] leading-none drop-shadow-xs"
                                  style={cellFontSizeScale !== 100 ? { fontSize: `calc(1em * ${cellFontSizeScale / 100})` } : undefined}
                                >
                                  {bVal}
                                </span>
                              ) : (
                                <span className="text-slate-300 text-xs font-bold">-</span>
                              )}
                            </div>

                            {/* Quick edit button on hover */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditSeqRow(rowNumber);
                              }}
                              className="no-print absolute -top-1 -right-1 opacity-0 group-hover/seq:opacity-100 p-0.5 bg-purple-900 text-yellow-300 rounded-full shadow-xs hover:scale-110 transition-all z-30"
                              title="Editar valores de secuencia para esta fila"
                            >
                              <Edit3 className="w-2 h-2" />
                            </button>
                          </div>
                        );
                      })()}

                      {/* Cells for each column in this row */}
                      {sheet.columns.map((col, cIdx) => {
                        const cell = col.cells[rIdx] || { rowNumber };
                        const hasPlayer = Boolean(cell.playerName || cell.playerId);
                        const isCellPaid = hasPlayer && Boolean(cell.isPaid);
                        const cellBg = cell.color || 'transparent';
                        const neonBorderColor = getVibrantNeonColor(cell.color);

                        // Borde interno condicional de exactamente 1px de grosor, color neón vibrante correspondiente al color asignado a la casilla
                        // Sin alterar fondo, tamaño ni alineación
                        const innerShadows: string[] = [];
                        if (isCellPaid) {
                          innerShadows.push(`inset 0 0 0 1px ${neonBorderColor}`);
                        }
                        if (isWinningRow) {
                          innerShadows.push('inset 0 0 0 2px rgba(239, 68, 68, 0.75)');
                        } else if (isTernaRow) {
                          innerShadows.push('inset 0 0 0 2px rgba(16, 185, 129, 0.75)');
                        }

                        return (
                          <div
                            key={`${col.id}_${rowNumber}`}
                            onClick={() => handleCellClick(cIdx, rIdx)}
                            className={`relative px-1 py-0.5 flex items-center cursor-pointer select-none transition-colors group overflow-hidden ${
                              col.hasRedDividerRight ? 'border-r-[4px] !border-r-red-600' : ''
                            } ${
                              !hasPlayer && !isWinningRow && !isTernaRow ? 'hover:bg-slate-100' : ''
                            }`}
                            style={{
                              backgroundColor: cellBg,
                              boxShadow: innerShadows.length > 0 ? innerShadows.join(', ') : undefined,
                            }}
                            title={`Columna X${col.multiplier || 1}, Casilla #${rowNumber}${
                              cell.playerName ? ` (${cell.playerName.toUpperCase()}${isCellPaid ? ' - PAGO CONFIRMADO' : ' - PAGO PENDIENTE'})` : ' (Vacía, clic para asignar)'
                            }${isWinningRow ? ' ★ ¡Fila con BINGO!' : isTernaRow ? ' ★ ¡Fila con TERNA!' : ''}`}
                          >
                            {/* Número de casilla: altura completa igual a la casilla, más grande, grueso y visible */}
                            <div
                              onClick={(e) => {
                                if (hasPlayer) {
                                  e.stopPropagation();
                                  handleToggleCellPaid(cIdx, rIdx);
                                }
                              }}
                              className={`self-stretch flex items-center justify-center shrink-0 mr-[2px] sm:mr-[2.5px] z-20 select-none ${
                                hasPlayer ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
                              }`}
                              title={
                                hasPlayer
                                  ? isCellPaid
                                    ? 'Casilla Pagada (Clic para marcar como pendiente)'
                                    : 'Casilla Pendiente de Pago (Clic para marcar como pagada)'
                                  : undefined
                              }
                            >
                              {isCellPaid ? (
                                <span className="h-[calc(100%-3px)] min-w-[17px] sm:min-w-[18px] px-0.5 rounded-xs border-[2px] border-red-600 flex items-center justify-center font-black font-sans text-[11px] sm:text-[12px] md:text-[13px] text-red-600 leading-none bg-red-50/95 shadow-2xs">
                                  {rowNumber}
                                </span>
                              ) : (
                                <span
                                  className="h-full flex items-center justify-center font-black font-sans text-[12px] sm:text-[13.5px] md:text-[14.5px] leading-none text-black select-none tracking-tight"
                                  style={{
                                    fontWeight: 900,
                                    WebkitTextStroke: '0.45px black',
                                  }}
                                >
                                  {rowNumber}
                                </span>
                              )}
                            </div>

                            {/* Player Name / Tag: centrado en el espacio restante de la casilla sin margen excesivo pero sin chocar con el número */}
                            <div className="flex-1 min-w-0 h-full flex items-center justify-center text-center z-10 pointer-events-none overflow-hidden pr-0.5">
                              {hasPlayer ? (() => {
                                const playerForCell = sheet.players.find(
                                  (p) =>
                                    p.id === cell.playerId ||
                                    (cell.playerName && p.name.toLowerCase().trim() === cell.playerName.toLowerCase().trim())
                                );
                                const effectiveTextColor = cell.textColor || playerForCell?.textColor || '#000000';
                                const adaptiveStyle = getAdaptiveCellNameStyle(
                                  cell.playerName,
                                  sheet.columns.length,
                                  is15SheetExpanded,
                                  cellFontSizeScale,
                                  effectiveTextColor
                                );
                                return (
                                  <span
                                    className={adaptiveStyle.className}
                                    style={adaptiveStyle.style}
                                  >
                                    {cell.playerName ? cell.playerName.toUpperCase() : ''}
                                  </span>
                                );
                              })() : (
                                <span className={`no-print text-[8px] sm:text-[8.5px] opacity-0 group-hover:opacity-100 font-black uppercase block leading-none ${
                                  isWinningRow ? 'text-red-700 opacity-70' : isTernaRow ? 'text-emerald-700 opacity-70' : 'text-slate-400'
                                }`}>
                                  + ASIGNAR
                                </span>
                              )}
                            </div>

                            {/* Winning & Terna Indicator Icons */}
                            {isWinningRow && hasPlayer && (
                              <div
                                className="absolute top-0.5 right-0.5 pointer-events-none z-10 text-[10px]"
                                title="¡Casilla ganadora en fila BINGO!"
                              >
                                🏆
                              </div>
                            )}
                            {isTernaRow && !isWinningRow && hasPlayer && (
                              <div
                                className="absolute top-0.5 right-0.5 pointer-events-none z-10 text-[10px]"
                                title="¡Casilla en fila de TERNA!"
                              >
                                ⭐
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* BOTTOM SUMMARY ROWS: NOMBRE, GANO, DEBE, TOTAL (Independiente de las columnas de la planilla) */}
              <div className="border-t-[2.5px] border-black flex flex-col bg-slate-50 flex-shrink-0 select-none overflow-hidden">
                <div className="flex w-full overflow-x-auto scrollbar-thin">
                  {/* Fixed Left Header Column (Matching width of SECUENCIA column in top grid!) */}
                  <div
                    className="flex-shrink-0 sticky left-0 z-20 bg-slate-100 border-r-[2.5px] border-black flex flex-col select-none"
                    style={{
                      width: `${seqColWidth}px`,
                      minWidth: `${seqColWidth}px`,
                      maxWidth: `${seqColWidth}px`,
                    }}
                  >
                    {/* Header 1: NOMBRE */}
                    <div
                      className={`${
                        is15SheetExpanded ? 'h-[22px]' : 'min-h-[26px] py-1'
                      } bg-[#d8b4fe] text-purple-950 font-black text-[10px] sm:text-[11.5px] uppercase tracking-wider flex items-center justify-center border-b border-black`}
                    >
                      NOMBRE
                    </div>
                    {/* Header 2: GANO */}
                    <div
                      className={`${
                        is15SheetExpanded ? 'h-[20px]' : 'min-h-[24px] py-0.5'
                      } bg-[#fde047] text-amber-950 font-black text-[9.5px] sm:text-[11px] uppercase tracking-wider flex items-center justify-center border-b border-black`}
                    >
                      GANO
                    </div>
                    {/* Header 3: DEBE */}
                    <div
                      className={`${
                        is15SheetExpanded ? 'h-[20px]' : 'min-h-[24px] py-0.5'
                      } bg-[#fef08a] text-amber-950 font-black text-[9.5px] sm:text-[11px] uppercase tracking-wider flex items-center justify-center border-b border-black`}
                    >
                      DEBE
                    </div>
                    {/* Header 4: TOTAL */}
                    <div
                      className={`${
                        is15SheetExpanded ? 'h-[20px]' : 'min-h-[24px] py-0.5'
                      } bg-[#facc15] text-amber-950 font-black text-[9.5px] sm:text-[11px] uppercase tracking-wider flex items-center justify-center`}
                    >
                      TOTAL
                    </div>
                  </div>

                  {/* Right Player Columns (One column per registered player, independent of top sheet columns) */}
                  <div className="flex-1 flex min-w-0">
                    {playerSummaryList.length === 0 ? (
                      <div className={`flex-1 flex items-center justify-center ${is15SheetExpanded ? 'h-[82px] py-1 text-[10px]' : 'py-3 text-xs'} px-3 text-slate-400 italic font-bold uppercase bg-white`}>
                        <span>+ Agrega jugadores para ver saldos</span>
                      </div>
                    ) : (
                      playerSummaryList.map((p) => {
                        const isNegative = p.total < 0;
                        const isPositive = p.total > 0;

                        return (
                          <div
                            key={p.id}
                            className="min-w-[80px] sm:min-w-[95px] flex-1 flex flex-col border-r border-black text-center group/pcol"
                          >
                            {/* Row 1: NOMBRE */}
                            <div
                              onClick={() => setSelectedPlayerId(p.id)}
                              className={`${
                                is15SheetExpanded ? 'h-[22px]' : 'min-h-[26px] py-1'
                              } px-0.5 sm:px-1 flex items-center justify-center font-black uppercase cursor-pointer hover:opacity-90 border-b border-black transition-opacity`}
                              style={{
                                backgroundColor: p.color ? `${p.color}dd` : '#f3e8ff',
                                color: '#000000',
                              }}
                              title={`${p.name.toUpperCase()}. Clic para pintar casillas con este jugador.`}
                            >
                              <div className="flex items-center justify-center gap-0.5 w-full">
                                {(() => {
                                  const pObj = sheet.players.find(
                                    (pl) =>
                                      pl.id === p.id ||
                                      pl.name.toLowerCase().trim() === p.name.toLowerCase().trim()
                                  );
                                  const effTextColor = p.textColor || pObj?.textColor || '#000000';
                                  const pNameStyle = getAdaptiveCellNameStyle(
                                    p.name,
                                    6,
                                    is15SheetExpanded,
                                    cellFontSizeScale,
                                    effTextColor
                                  );
                                  return (
                                    <span
                                      className="font-black block text-center"
                                      style={pNameStyle.style}
                                    >
                                      {p.name.toUpperCase()}
                                    </span>
                                  );
                                })()}
                                {p.isBingoWinner && (
                                  <span
                                    className="text-[8px] font-black bg-amber-400 text-amber-950 px-0.5 py-0.2 rounded border border-black leading-none"
                                    title="Ganador de BINGO en esta partida"
                                  >
                                    B
                                  </span>
                                )}
                                {p.isTernaWinner && (
                                  <span
                                    className="text-[8px] font-black bg-emerald-500 text-white px-0.5 py-0.2 rounded border border-black leading-none"
                                    title="Ganador de TERNA en esta partida"
                                  >
                                    T
                                  </span>
                                )}
                                {p.isAmboWinner && (
                                  <span
                                    className="text-[8px] font-black bg-sky-500 text-white px-0.5 py-0.2 rounded border border-black leading-none"
                                    title="Ganador de AMBO en esta partida"
                                  >
                                    A
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Row 2: GANO */}
                            <div
                              onClick={() => {
                                setEditingPlayerBalance({
                                  id: p.id,
                                  name: p.name,
                                  currentGano: p.totalGano,
                                  currentDebe: p.debe,
                                });
                                setManualGanoStr(p.totalGano.toString());
                                setManualDebeStr(p.debe.toString());
                              }}
                              className={`${
                                is15SheetExpanded ? 'h-[20px]' : 'min-h-[24px] py-0.5'
                              } px-0.5 sm:px-1 flex items-center justify-center font-black tabular-nums text-[12px] sm:text-[13px] tracking-tight border-b border-black cursor-pointer hover:bg-yellow-100 transition-colors ${
                                p.totalGano > 0 ? 'text-emerald-950 bg-emerald-100/90' : 'text-black bg-[#fefce8]'
                              }`}
                              style={cellFontSizeScale !== 100 ? { fontSize: `calc(1em * ${cellFontSizeScale / 100})` } : undefined}
                              title={`${p.name.toUpperCase()} - Ganado Acumulado: $${p.previousWon.toFixed(2)}${
                                p.currentWon > 0
                                  ? ` + Esta Partida: $${p.currentWon.toFixed(2)}${
                                      p.currentBingoWon > 0 ? ` [Bingo: $${p.currentBingoWon.toFixed(2)}]` : ''
                                    }${p.currentTernaWon > 0 ? ` [Terna: $${p.currentTernaWon.toFixed(2)}]` : ''}${
                                      p.currentAmboWon > 0 ? ` [Ambo: $${p.currentAmboWon.toFixed(2)}]` : ''
                                    }`
                                  : ''
                              } = $${p.totalGano.toFixed(2)}. Clic para ajustar saldo/ganado.`}
                            >
                              <span className="font-black drop-shadow-2xs">
                                {p.totalGano.toFixed(2)}
                              </span>
                            </div>

                            {/* Row 3: DEBE */}
                            <div
                              onClick={() => {
                                setEditingPlayerBalance({
                                  id: p.id,
                                  name: p.name,
                                  currentGano: p.totalGano,
                                  currentDebe: p.debe,
                                });
                                setManualGanoStr(p.totalGano.toString());
                                setManualDebeStr(p.debe.toString());
                              }}
                              className={`${
                                is15SheetExpanded ? 'h-[20px]' : 'min-h-[24px] py-0.5'
                              } px-0.5 sm:px-1 flex items-center justify-center font-black tabular-nums text-[12px] sm:text-[13px] tracking-tight border-b border-black cursor-pointer hover:bg-yellow-100 transition-colors ${
                                p.debe > 0 ? 'text-rose-950 bg-rose-100/80' : 'text-black bg-[#fefce8]'
                              }`}
                              style={cellFontSizeScale !== 100 ? { fontSize: `calc(1em * ${cellFontSizeScale / 100})` } : undefined}
                              title={`${p.name.toUpperCase()} debe $${p.debe.toFixed(2)}${
                                p.previousDebt > 0 ? ` (Deuda anterior: $${p.previousDebt.toFixed(2)})` : ''
                              }. Clic para abonar o liquidar.`}
                            >
                              <span className="font-black drop-shadow-2xs">
                                {p.debe.toFixed(2)}
                              </span>
                            </div>

                            {/* Row 4: TOTAL */}
                            <div
                              onClick={() => {
                                setEditingPlayerBalance({
                                  id: p.id,
                                  name: p.name,
                                  currentGano: p.totalGano,
                                  currentDebe: p.debe,
                                });
                                setManualGanoStr(p.totalGano.toString());
                                setManualDebeStr(p.debe.toString());
                              }}
                              className={`${
                                is15SheetExpanded ? 'h-[20px]' : 'min-h-[24px] py-0.5'
                              } px-0.5 sm:px-1 flex items-center justify-center font-black tabular-nums text-[12px] sm:text-[13.5px] tracking-tight cursor-pointer hover:opacity-90 transition-opacity relative group/totcell ${
                                isNegative
                                  ? 'text-red-950 bg-red-200/95'
                                  : isPositive
                                  ? 'text-emerald-950 bg-emerald-200/95'
                                  : 'text-black bg-amber-100/90'
                              }`}
                              style={cellFontSizeScale !== 100 ? { fontSize: `calc(1em * ${cellFontSizeScale / 100})` } : undefined}
                              title={`Saldo final de ${p.name.toUpperCase()}: Ganó $${p.totalGano.toFixed(2)} - Debe $${p.debe.toFixed(2)} = $${p.total.toFixed(2)}. Clic para ajustar o reiniciar saldo a $0.`}
                            >
                              <span className="font-black drop-shadow-2xs">
                                {isNegative
                                  ? `-${Math.abs(p.total).toFixed(2)}`
                                  : isPositive
                                  ? `+${p.total.toFixed(2)}`
                                  : '0.00'}
                              </span>

                              {/* Quick Reset to $0.00 Button on Hover when saldo != 0 */}
                              {p.total !== 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleResetIndividualPlayerBalance(p.id, p.name);
                                  }}
                                  className="no-print opacity-0 group-hover/totcell:opacity-100 absolute right-0.5 inset-y-0.5 my-auto px-1 py-0.2 rounded bg-black text-yellow-300 hover:bg-zinc-800 font-black text-[7.5px] tracking-tight leading-none flex items-center gap-0.5 shadow-sm transition-opacity"
                                  title={`Reiniciar saldo de ${p.name.toUpperCase()} a $0.00 (Marcar como pagado)`}
                                >
                                  <RotateCcw className="w-2 h-2" />
                                  <span>$0</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Footer Note */}
            <div className={`border-t border-black/40 flex flex-wrap items-center justify-between text-slate-700 font-bold select-none flex-shrink-0 ${
              is15SheetExpanded ? 'mt-0.5 pt-0.5 text-[8.5px]' : 'mt-2 pt-1.5 text-[9px] sm:text-[10px]'
            }`}>
              <div className="flex flex-wrap items-center gap-2">
                <span>Planilla Oficial por Multiplicadores</span>
                <span className="text-red-700 font-extrabold flex items-center gap-1">
                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-black text-[7px] font-black relative">
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-full border-b-2 border-red-600 -rotate-45" />
                    </span>
                    #
                  </span>
                  Círculo tachado = Pagado
                </span>
                {activeWinningRow && (
                  <span className="text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded font-black flex items-center gap-1">
                    <span>🏆</span>
                    Fila #{activeWinningRow} Ganadora
                  </span>
                )}
              </div>
              <span>Casillas: {stats.filledCells}/{stats.totalCells}</span>
            </div>
          </div>
        </div>
      </main>
      </div>

      {/* Right Side: Vertical Sequence Bar (Slimmer sidebar on right side of sheet, only in unexpanded view) */}
      {!is15SheetExpanded && (
        <div className="no-print w-full lg:w-44 xl:w-48 flex-shrink-0 lg:sticky lg:top-16">
          <GameSequenceBar
            sequence={gameSequence}
            activeRowLeader={activeWinningRow}
            onSelectRowLeader={(row) => {
              setActiveWinningRow(row);
              notify(`Fila #${row} seleccionada en la planilla.`);
            }}
            onOpenGameSnapshot={onOpenGameSnapshot}
            onAddSequenceItem={onAddSequenceItem}
            onClearSequence={onClearSequence}
            onStartNewGame={onStartNewGame}
            onSaveCurrentGame={onSaveCurrentGame}
            onOpenSavedGamesGallery={onOpenSavedGamesGallery}
            savedGamesCount={savedGamesCount}
            mode={mode}
            orientation="vertical"
            onUndo={handleUndo}
            undoCount={sheetUndoStack.length}
            onShowPreviousGameResults={handleShowPreviousGameResults}
            isExpanded={is15SheetExpanded}
            onToggleExpand={() => {
              const next = !is15SheetExpanded;
              setIs15SheetExpanded(next);
              setIs15PanelCollapsed(next);
              notify(next ? 'Planilla expandida' : 'Vista normal restaurada');
            }}
          />
        </div>
      )}
      </div>

      {/* BOTTOM: Horizontal Sequence Line when Sheet is Expanded */}
      {is15SheetExpanded && (
        <div className="no-print w-full pt-1.5 flex-shrink-0 z-30">
          <GameSequenceBar
            sequence={gameSequence}
            activeRowLeader={activeWinningRow}
            onSelectRowLeader={(row) => {
              setActiveWinningRow(row);
              notify(`Fila #${row} seleccionada en la planilla.`);
            }}
            onOpenGameSnapshot={onOpenGameSnapshot}
            onAddSequenceItem={onAddSequenceItem}
            onClearSequence={onClearSequence}
            onStartNewGame={onStartNewGame}
            onSaveCurrentGame={onSaveCurrentGame}
            onOpenSavedGamesGallery={onOpenSavedGamesGallery}
            savedGamesCount={savedGamesCount}
            mode={mode}
            orientation="horizontal"
            compact={true}
            onUndo={handleUndo}
            undoCount={sheetUndoStack.length}
            onShowPreviousGameResults={handleShowPreviousGameResults}
            isExpanded={is15SheetExpanded}
            onToggleExpand={() => {
              const next = !is15SheetExpanded;
              setIs15SheetExpanded(next);
              setIs15PanelCollapsed(next);
              notify(next ? 'Planilla expandida' : 'Vista normal restaurada');
            }}
          />
        </div>
      )}
      </div>
      )}

      {/* Direct Previous Game Results Modal */}
      {directPreviousGameItem && (
        <GameSheetSnapshotModal
          isOpen={!!directPreviousGameItem}
          item={directPreviousGameItem}
          onClose={() => setDirectPreviousGameItem(null)}
        />
      )}

      {/* Selector de Color de Plataforma en la parte inferior de la pantalla */}
      {onSelectPlatformColor && platformColor && !is15SheetExpanded && (
        <div
          className="no-print w-full px-2 sm:px-4 py-2 border-t mt-auto flex-shrink-0"
          style={{
            borderColor: 'var(--surface-border)',
            backgroundColor: 'var(--surface-main)',
          }}
        >
          <div className="max-w-7xl mx-auto">
            <PlatformColorBar
              currentColor={platformColor}
              onSelectColor={onSelectPlatformColor}
            />
          </div>
        </div>
      )}
    </div>
  );
};
