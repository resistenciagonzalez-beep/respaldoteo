/**
 * Bolillero Virtual de Bingo - Master Host Controller
 * Compatible con Bingo 90, Bingo 75, Bingo 80 y Modo Personalizado.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  BingoMode,
  SpeedPreset,
  Ball,
  GameSettings,
  GameSequenceItem,
  SheetViewType,
  PlatformColor,
  GameObjectives,
  BingoSheetData,
  CustomSequenceMap,
} from './types';
import { PlatformColorBar } from './components/PlatformColorBar';
import { sfx, BingoVoiceAnnouncer } from './utils/audio';
import { getBingo75Letter } from './utils/ballColors';
import { useAuth } from './hooks/useAuth';
import { BingoCageCanvas } from './components/BingoCageCanvas';
import { CurrentBallDisplay } from './components/CurrentBallDisplay';
import { MasterBoard } from './components/MasterBoard';
import { ControlsBar } from './components/ControlsBar';
import { SettingsModal } from './components/SettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { ModeSelectionModal } from './components/ModeSelectionModal';
import { BingoEsFormat } from './components/BingoEsFormat';
import { BingoCelebrationModal } from './components/BingoCelebrationModal';
import { BingoSheetBuilder } from './components/BingoSheetBuilder';
import { AdminPanelModal } from './components/AdminPanelModal';
import { LoginModal } from './components/LoginModal';
import { AuthScreen } from './components/AuthScreen';
import { GameSheetSnapshotModal } from './components/GameSheetSnapshotModal';
import { NewGameModal } from './components/NewGameModal';
import { SavedGamesGalleryModal } from './components/SavedGamesGalleryModal';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import {
  getSavedGamesGallery,
  saveGameUnified,
  deleteGamePermanently,
  subscribeToSavedGamesFirestore,
  isGameOfOperator,
  getOperatorStorageKey,
  STORAGE_KEY_SEQUENCE_75,
  STORAGE_KEY_SEQUENCE_90,
  getCurrentLocalDateKey,
  getCurrentLocalTimeString,
  getGameNormalizedDateKey,
  isRealSavedGameInTodaySubfolder,
  clearRightSequenceBarToday,
} from './utils/savedGamesStorage';
import {
  buildCompleteGameSequenceItem,
  dispatchResetSheetMarksEvent,
  formatGameDuration,
  getStoredSheet75Snapshot,
  getStoredSheet90Snapshot,
  calculateSheet75Financials,
  calculateSheet90Financials,
  savePreviousGameSheet75,
  savePreviousGameSheet90,
} from './utils/gameSnapshotStorage';
import { getActiveShift, recordGameToActiveShift } from './utils/shiftsStorage';
import {
  safeSetItem,
  safeGetItem,
  safeRemoveItem,
  cleanupLocalStorageForQuota,
  toLightweightSequenceItem,
} from './utils/safeStorage';
import {
  Minimize2,
  Volume2,
  VolumeX,
  SlidersHorizontal,
  RotateCcw,
  Crown,
  Tv,
  Table2,
  Gamepad2,
  CircleDot,
  Grid3X3,
  Settings2,
  ShieldCheck,
  ShieldAlert,
  LogIn,
  Layers,
  Loader2,
} from 'lucide-react';

interface VendorFullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}

interface VendorFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

// Helper to get all numbers of a row leader (1..15 in 75-ball; 1..30 in 90-ball)
export function getBingoRowNumbers(rowLeader: number, mode: BingoMode): number[] {
  if (mode === '75') {
    return [
      rowLeader,
      rowLeader + 15,
      rowLeader + 30,
      rowLeader + 45,
      rowLeader + 60,
    ];
  } else {
    // In 90-ball traditional sheet: each row leader r (1..30) consists of the 3 triple numbers: [r, r + 30, r + 60]
    return [
      rowLeader,
      rowLeader + 30,
      rowLeader + 60,
    ];
  }
}

// Find all completed row leaders (1..15 in 75, 1..30 in 90) given a set of drawn numbers
export function findCompletedBingoRows(drawnSet: Set<number>, mode: BingoMode): number[] {
  const maxRows = mode === '75' ? 15 : 30;
  const result: number[] = [];
  for (let r = 1; r <= maxRows; r++) {
    const row = getBingoRowNumbers(r, mode);
    if (row.every((num) => drawnSet.has(num))) {
      result.push(r);
    }
  }
  return result;
}

export default function App() {
  // Game Settings State
  const [settings, setSettings] = useState<GameSettings>({
    mode: '75',
    customMin: 1,
    customMax: 75,
    theme: 'pastel-orange',
    speed: 'normal',
    speedSeconds: 3.0,
    voiceEnabled: true,
    sfxEnabled: true,
    sayNicknames: true,
    voiceVolume: 1.0,
    selectedVoiceName: undefined,
  });

  // Active View Format: 'bingo-es' (exact screenshot format) vs 'simulator-3d' (drum cage)
  const [viewFormat, setViewFormat] = useState<'bingo-es' | 'simulator-3d'>('bingo-es');
  // Current Page/View: 'game' (Bolillero en vivo) vs 'sheet-builder' (Creador de Planilla de Cartón)
  const [currentAppView, setCurrentAppView] = useState<'game' | 'sheet-builder'>('game');
  // Active sheet type inside sheet-builder ('multipliers-15' for 75-ball vs 'traditional-90' for 90-ball)
  const [activeSheetType, setActiveSheetType] = useState<SheetViewType>('multipliers-15');

  // Bolas cantadas highlight option: persisted across bolillero and sheet views
  const [autoHighlightDrawn, setAutoHighlightDrawn] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = safeGetItem('bingo_auto_highlight_drawn');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const handleToggleAutoHighlightDrawn = useCallback((val: boolean) => {
    setAutoHighlightDrawn(val);
    if (typeof window !== 'undefined') {
      safeSetItem('bingo_auto_highlight_drawn', String(val));
    }
  }, []);

  // Platform Color State (Rojo, Azul, Verde, Morado, Negro, Gris, Marrón, Rosado, Amarillo, Naranja)
  const [platformColor, setPlatformColor] = useState<PlatformColor>(() => {
    if (typeof window !== 'undefined') {
      const saved = safeGetItem('bingo_platform_color') as PlatformColor;
      if (saved) return saved;
    }
    return 'orange';
  });

  // Sync platform color attribute to HTML document root and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-platform-color', platformColor);
    safeSetItem('bingo_platform_color', platformColor);
  }, [platformColor]);

  const handleSelectPlatformColor = useCallback((color: PlatformColor) => {
    setPlatformColor(color);
  }, []);


  // Game Engine State
  const [totalBalls, setTotalBalls] = useState<number>(75);
  const [remainingBalls, setRemainingBalls] = useState<number[]>([]);
  const [drawnBalls, setDrawnBalls] = useState<Ball[]>([]);
  const [currentBall, setCurrentBall] = useState<Ball | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  // Modals & View State
  const [isModeSelectionOpen, setIsModeSelectionOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [isLoginOpen, setIsLoginOpen] = useState<boolean>(false);
  const { currentUser, isAdmin, logActivity, loading } = useAuth();
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  // Enforce mode lock for operators based on registration selection:
  // Operators ONLY have access to their chosen Bingo mode panel (75 or 90).
  // Only Administrators can view both panels and toggle freely.
  useEffect(() => {
    if (currentUser && !isAdmin && currentUser.assignedMode) {
      const lockedMode: BingoMode = currentUser.assignedMode === '90' ? '90' : '75';
      const lockedSheet: SheetViewType = lockedMode === '90' ? 'traditional-90' : 'multipliers-15';

      if (settings.mode !== lockedMode) {
        setSettings((s) => ({
          ...s,
          mode: lockedMode,
          customMin: 1,
          customMax: lockedMode === '90' ? 90 : 75,
        }));
        setTotalBalls(lockedMode === '90' ? 90 : 75);
      }
      if (activeSheetType !== lockedSheet) {
        setActiveSheetType(lockedSheet);
      }
      setIsModeSelectionOpen(false);
    }
  }, [currentUser, isAdmin, currentUser?.assignedMode, settings.mode, activeSheetType]);

  const handleOpenAdminPanel = useCallback(() => {
    if (!currentUser) {
      setIsLoginOpen(true);
      return;
    }
    if (!isAdmin) {
      setAccessDeniedMessage(
        'Acceso Denegado: Esta área está restringida exclusivamente a Administradores del sistema. Tu cuenta tiene rango de Operador.'
      );
      return;
    }
    setIsAdminOpen(true);
  }, [currentUser, isAdmin]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [activeTabMobile, setActiveTabMobile] = useState<'cage' | 'board'>('cage');

  // Game Sequence History (ONLY real games saved in today's subfolder, never invented items)
  const [gameSequence, setGameSequence] = useState<GameSequenceItem[]>([]);

  // One-time startup cleanup to prevent QuotaExceededError from previous large base64 dumps
  useEffect(() => {
    cleanupLocalStorageForQuota();
  }, []);

  // Game Sequence History for Bingo 90 (ONLY real games saved in today's subfolder)
  const [gameSequence90, setGameSequence90] = useState<GameSequenceItem[]>([]);

  // Isolate sequence strictly per operator and current day's subfolder (SIN partidas inventadas ni del día anterior)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const todayKey = getCurrentLocalDateKey();

    const myTodayGallery = getSavedGamesGallery().filter(
      (g) =>
        g &&
        isRealSavedGameInTodaySubfolder(g, todayKey) &&
        (isAdmin || !currentUser || isGameOfOperator(g, currentUser))
    );

    const mySeq75 = myTodayGallery
      .filter((g) => g.mode !== '90' && g.sheetType !== 'traditional-90')
      .sort((a, b) => (a.round || 0) - (b.round || 0));

    const mySeq90 = myTodayGallery
      .filter((g) => g.mode === '90' || g.sheetType === 'traditional-90')
      .sort((a, b) => (a.round || 0) - (b.round || 0));

    setGameSequence(mySeq75);
    setGameSequence90(mySeq90);

    const maxR = myTodayGallery.length > 0 ? Math.max(0, ...myTodayGallery.map((g) => g.round || 0)) : 0;
    setCurrentMatchRound(maxR > 0 ? maxR + 1 : 1);
  }, [currentUser, isAdmin]);

  const handleClearSequence = useCallback(() => {
    const todayKey = getCurrentLocalDateKey();
    const today75Games = getSavedGamesGallery().filter(
      (g) =>
        g &&
        g.mode !== '90' &&
        g.sheetType !== 'traditional-90' &&
        getGameNormalizedDateKey(g) === todayKey
    );
    setGameSequence([]);
    setCurrentMatchRound(1);
    void clearRightSequenceBarToday(today75Games, '75').then(() => {
      setSavedGamesList(
        getSavedGamesGallery().filter((g) => g && typeof g.round === 'number' && g.round >= 1)
      );
    });
  }, []);

  const handleClearSequence90 = useCallback(() => {
    const todayKey = getCurrentLocalDateKey();
    const today90Games = getSavedGamesGallery().filter(
      (g) =>
        g &&
        (g.mode === '90' || g.sheetType === 'traditional-90') &&
        getGameNormalizedDateKey(g) === todayKey
    );
    setGameSequence90([]);
    setCurrentMatchRound(1);
    void clearRightSequenceBarToday(today90Games, '90').then(() => {
      setSavedGamesList(
        getSavedGamesGallery().filter((g) => g && typeof g.round === 'number' && g.round >= 1)
      );
    });
  }, []);

  const [lastWinningBall, setLastWinningBall] = useState<number | null>(null);
  const lastWinnerInfoRef = useRef<{
    playerName?: string;
    tableNumber?: number;
    rowLeader?: number;
    ballNumber?: number;
  } | null>(null);

  // Active Game Objectives (B = Bingo, T = Terna, A = Ambo)
  const [gameObjectives, setGameObjectives] = useState<GameObjectives>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = safeGetItem('bingo_game_objectives');
        if (saved) return JSON.parse(saved);
      } catch (err) {
        console.warn('Error reading game objectives:', err);
      }
    }
    return { bingo: true, terna: false, ambo: false };
  });

  const handleToggleObjective = useCallback((key: 'bingo' | 'terna' | 'ambo') => {
    setGameObjectives((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      try {
        safeSetItem('bingo_game_objectives', JSON.stringify(updated));
      } catch (err) {
        console.warn('Error saving game objectives:', err);
      }
      return updated;
    });
  }, []);

  // Live match Ambo (A), Terna (T) and Bingo (B) tracking for current round
  const [currentMatchAmboBall, setCurrentMatchAmboBall] = useState<number | null>(null);
  const [currentMatchAmboRow, setCurrentMatchAmboRow] = useState<number | null>(null);
  const currentMatchAmboBallRef = useRef<number | null>(null);
  const currentMatchAmboRowRef = useRef<number | null>(null);

  const [currentMatchTernaBall, setCurrentMatchTernaBall] = useState<number | null>(null);
  const [currentMatchTernaRow, setCurrentMatchTernaRow] = useState<number | null>(null);
  const currentMatchTernaBallRef = useRef<number | null>(null);
  const currentMatchTernaRowRef = useRef<number | null>(null);

  const [currentMatchBingoBall, setCurrentMatchBingoBall] = useState<number | null>(null);
  const [currentMatchBingoRow, setCurrentMatchBingoRow] = useState<number | null>(null);
  const currentMatchBingoBallRef = useRef<number | null>(null);
  const currentMatchBingoRowRef = useRef<number | null>(null);

  // Modal State for inspecting past game sheets & snapshots
  const [selectedSnapshotModalItem, setSelectedSnapshotModalItem] = useState<GameSequenceItem | null>(null);

  // Modal State for Finalizing current match and generating a fresh one
  const [showNewGameModal, setShowNewGameModal] = useState<boolean>(false);

  // Live Match Timer tracking how long each game lasts without causing 1s root App re-renders during gameplay
  const [matchElapsedSeconds, setMatchElapsedSeconds] = useState<number>(0);
  const matchStartTimeRef = useRef<number | null>(null);
  const hasActiveMatch = isPlaying || drawnBalls.length > 0;

  useEffect(() => {
    if (hasActiveMatch && !matchStartTimeRef.current) {
      matchStartTimeRef.current = Date.now();
    }
  }, [hasActiveMatch]);

  const getMatchElapsedSeconds = useCallback(() => {
    if (!matchStartTimeRef.current) return 0;
    return Math.floor((Date.now() - matchStartTimeRef.current) / 1000);
  }, []);

  useEffect(() => {
    if (!showNewGameModal) return;
    setMatchElapsedSeconds(getMatchElapsedSeconds());
    const interval = setInterval(() => {
      setMatchElapsedSeconds(getMatchElapsedSeconds());
    }, 1000);
    return () => clearInterval(interval);
  }, [showNewGameModal, getMatchElapsedSeconds]);

  // Gallery of Saved Games state & Active Round Counter
  const [showSavedGamesGallery, setShowSavedGamesGallery] = useState<boolean>(false);
  const [savedGamesList, setSavedGamesList] = useState<GameSequenceItem[]>(() => getSavedGamesGallery());

  const [currentMatchRound, setCurrentMatchRound] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const initialGallery = getSavedGamesGallery();
      if (initialGallery.length > 0) {
        const maxR = Math.max(0, ...initialGallery.map((g) => g.round || 0));
        return maxR > 0 ? maxR + 1 : 1;
      }
    }
    return 1;
  });

  const refreshSavedGamesList = useCallback(() => {
    const galleryGames = getSavedGamesGallery();
    const list = galleryGames.filter((g) => {
      if (!g || typeof g.round !== 'number' || g.round < 1) {
        console.warn('[GALLERY_DIAG] refreshSavedGamesList discarded game: invalid round', g);
        return false;
      }
      return true;
    });
    setSavedGamesList(list);
  }, []);

  // Filter games saved today by operator to create direct shortcuts in the right sequence bar
  // Strictly requires real saved games in today's subfolder (no invented games)
  const todaySavedGames = useMemo(() => {
    const todayKey = getCurrentLocalDateKey();
    const isBingo90 = activeSheetType === 'traditional-90' || settings.mode === '90';
    const operatorForBar = currentUser && isAdmin ? { ...currentUser, role: 'operator' as const } : currentUser;

    return savedGamesList
      .filter((g) => {
        if (!g || !isRealSavedGameInTodaySubfolder(g, todayKey)) return false;
        if (operatorForBar && !isGameOfOperator(g, operatorForBar)) return false;
        const gameIs90 = g.mode === '90' || g.sheetType === 'traditional-90';
        if (isBingo90 !== gameIs90) return false;
        return true;
      })
      .sort((a, b) => (b.round || 0) - (a.round || 0));
  }, [savedGamesList, currentUser, isAdmin, activeSheetType, settings.mode]);

  // Listen to global save/delete events and Firestore real-time updates so all operator games stay 100% synchronized
  useEffect(() => {
    refreshSavedGamesList();
    const handleSavedGamesUpdated = (e?: Event) => {
      refreshSavedGamesList();
      const customEv = e as CustomEvent<{ deletedIds?: string[] }> | undefined;
      const deletedIds = customEv?.detail?.deletedIds;
      if (Array.isArray(deletedIds) && deletedIds.length > 0) {
        const deletedSet = new Set(deletedIds);
        setGameSequence((prev) =>
          prev.filter((p) => {
            if (!p) return false;
            if (p.id && deletedSet.has(p.id)) return false;
            return true;
          })
        );
        setGameSequence90((prev) =>
          prev.filter((p) => {
            if (!p) return false;
            if (p.id && deletedSet.has(p.id)) return false;
            return true;
          })
        );
      }
    };

    window.addEventListener('bingo_saved_games_updated', handleSavedGamesUpdated);
    window.addEventListener('storage', handleSavedGamesUpdated);

    // Subscribe to Firestore so all operators' saved games appear in real time in their folders
    const unsubscribeFirestore = subscribeToSavedGamesFirestore((remoteGames) => {
      console.info('[GALLERY_DIAG] App received remoteGames.length:', remoteGames.length);
      setSavedGamesList(remoteGames);

      const todayKey = getCurrentLocalDateKey();
      const myTodayGames = remoteGames.filter(
        (g) =>
          g &&
          isRealSavedGameInTodaySubfolder(g, todayKey) &&
          (isAdmin || !currentUser || isGameOfOperator(g, currentUser))
      );

      if (myTodayGames.length > 0) {
        const maxTodayRound = Math.max(0, ...myTodayGames.map((g) => g.round || 0));
        if (drawnBallsRef.current.length === 0) {
          setCurrentMatchRound((prev) => Math.max(prev, maxTodayRound + 1));
        }

        const myToday75 = myTodayGames
          .filter((g) => g.mode !== '90' && g.sheetType !== 'traditional-90')
          .sort((a, b) => (a.round || 0) - (b.round || 0));
        setGameSequence(myToday75);

        const myToday90 = myTodayGames
          .filter((g) => g.mode === '90' || g.sheetType === 'traditional-90')
          .sort((a, b) => (a.round || 0) - (b.round || 0));
        setGameSequence90(myToday90);
      } else {
        // If no games saved today yet (or all cleared/deleted), keep sequence empty
        setGameSequence([]);
        setGameSequence90([]);
      }
    });

    return () => {
      window.removeEventListener('bingo_saved_games_updated', handleSavedGamesUpdated);
      window.removeEventListener('storage', handleSavedGamesUpdated);
      unsubscribeFirestore();
    };
  }, [refreshSavedGamesList, currentUser, isAdmin]);

  // Real-time calculation of current sheet financials for the active game
  const currentGameFinancials = useMemo(() => {
    if (activeSheetType === 'multipliers-15') {
      const sheet75 = getStoredSheet75Snapshot();
      return calculateSheet75Financials(sheet75, lastWinningBall ? ((lastWinningBall - 1) % 15) + 1 : undefined);
    } else {
      const sheet90 = getStoredSheet90Snapshot();
      return calculateSheet90Financials(sheet90);
    }
  }, [activeSheetType, lastWinningBall, drawnBalls.length]);

  const handleAddSequenceItem = useCallback(
    (ballNumber: number, rowLeader?: number, ternaBallOrPlayer?: number | string) => {
      // Discard invalid ball numbers or 0 to prevent ghost 0s
      if (!ballNumber || ballNumber <= 0) return;

      const isBingo90 = activeSheetType === 'traditional-90' || settings.mode === '90';
      const calcLeader =
        rowLeader !== undefined
          ? rowLeader
          : isBingo90
          ? ((ballNumber - 1) % 30) + 1
          : ((ballNumber - 1) % 15) + 1;

      const winningPlayerName = typeof ternaBallOrPlayer === 'string' ? ternaBallOrPlayer : undefined;

      setLastWinningBall(ballNumber);
      lastWinnerInfoRef.current = {
        playerName: winningPlayerName,
        rowLeader: calcLeader,
        ballNumber,
      };
      setCompletedRowLeaders((prev) =>
        prev.includes(calcLeader) ? prev : [...prev, calcLeader]
      );
      // Do NOT add unsaved/invented items to gameSequence or gameSequence90;
      // games ONLY appear in the right sequence bar when manually saved into today's subfolder.
    },
    [settings.mode, activeSheetType]
  );

  const isArchivingNewGameRef = useRef<boolean>(false);

  // Finalize current match, snapshot its sheet and state, and save to gallery (Offline-First + Sequential Save Queue)
  // Strictly guarantees that the current game is finalized and stored before creating the next game.
  const handleConfirmArchiveAndNewGame = useCallback(
    async ({
      keepPlayers,
      keepSequence = true,
      keepBalances = true,
      endTurno = false,
    }: {
      keepPlayers: boolean;
      keepSequence?: boolean;
      keepBalances?: boolean;
      endTurno?: boolean;
    }) => {
      if (isArchivingNewGameRef.current) {
        return;
      }
      isArchivingNewGameRef.current = true;

      try {
        const isBingo90 = activeSheetType === 'traditional-90' || settings.mode === '90';
        const modeToUse: BingoMode = isBingo90 ? '90' : '75';
        const drawnNumbersPlayed = drawnBallsRef.current.map((b) => b.number);
        const lastBall = drawnBallsRef.current[drawnBallsRef.current.length - 1];
        const winBallNum =
          currentMatchBingoBallRef.current ||
          lastWinningBall ||
          (lastBall ? lastBall.number : 0);
        const winRow =
          currentMatchBingoRowRef.current ||
          (winBallNum > 0
            ? (((winBallNum - 1) % (modeToUse === '75' ? 15 : 30)) + 1)
            : (lastWinnerInfoRef.current?.rowLeader ?? undefined));

        const capturedTernaBall = currentMatchTernaBallRef.current ?? undefined;
        const capturedTernaRow = currentMatchTernaRowRef.current ?? undefined;
        const capturedAmboBall = currentMatchAmboBallRef.current ?? undefined;
        const capturedAmboRow = currentMatchAmboRowRef.current ?? undefined;

        const roundNum = currentMatchRound;

        // Operator & Current Active Shift
        const opUid = currentUser?.id || currentUser?.uid || 'anon';
        const opName = (currentUser?.name || 'Operadora Principal').trim();
        const opEmail = currentUser?.email || '';
        const currentShift = getActiveShift(opUid, opName, opEmail);

        // Capture current sheets BEFORE any reset occurs
        const s75Now = getStoredSheet75Snapshot();
        const s90Now = getStoredSheet90Snapshot();

        // Save snapshots of current sheets as previous game for the "Mismos" auto-restore feature
        if (s75Now) savePreviousGameSheet75(s75Now, currentUser);
        if (s90Now) savePreviousGameSheet90(s90Now, currentUser);

        const exactLines = isBingo90
          ? (s90Now?.tables?.length ? s90Now.tables.length * 30 : 30)
          : (s75Now?.columns?.length
              ? s75Now.columns.reduce((sum, col) => sum + (Number(col.multiplier) || 1), 0)
              : 11);

        // Extract current player summaries (GANO, DEBE, TOTAL) and recorded sequence
        let customSeq: CustomSequenceMap | undefined = undefined;
        try {
          const opSeqKey = getOperatorStorageKey('bingo_sheet_custom_sequence', currentUser);
          const rawSeq = safeGetItem(opSeqKey) || safeGetItem('bingo_sheet_custom_sequence');
          if (rawSeq) customSeq = JSON.parse(rawSeq) as CustomSequenceMap;
        } catch (err) {
          console.warn('Error reading custom sequence:', err);
        }
        if (!customSeq && s75Now?.customSeqEntries) {
          customSeq = s75Now.customSeqEntries;
        }

        // Fallback to manual sequence entry if operator typed numbers directly in the sheet sequence
        const manualEntryForRound = (() => {
          if (!customSeq) return undefined;
          if (customSeq[roundNum]) return customSeq[roundNum];
          const keys = Object.keys(customSeq)
            .map((k) => Number(k))
            .filter((k) => !isNaN(k) && k > 0)
            .sort((a, b) => b - a);
          return keys.length > 0 ? customSeq[keys[0]] : undefined;
        })();

        const manualBingoNum =
          manualEntryForRound?.bingo !== undefined && !isNaN(Number(manualEntryForRound.bingo)) && Number(manualEntryForRound.bingo) > 0
            ? Number(manualEntryForRound.bingo)
            : 0;
        const manualTernaNum =
          manualEntryForRound?.terna !== undefined && !isNaN(Number(manualEntryForRound.terna)) && Number(manualEntryForRound.terna) > 0
            ? Number(manualEntryForRound.terna)
            : undefined;
        const manualAmboNum =
          manualEntryForRound?.ambo !== undefined && !isNaN(Number(manualEntryForRound.ambo)) && Number(manualEntryForRound.ambo) > 0
            ? Number(manualEntryForRound.ambo)
            : undefined;

        const effectiveWinBallNum = winBallNum > 0 ? winBallNum : manualBingoNum;
        const effectiveWinRow =
          winRow ??
          (effectiveWinBallNum > 0
            ? (((effectiveWinBallNum - 1) % (modeToUse === '75' ? 15 : 30)) + 1)
            : undefined);

        const effectiveTernaBall = capturedTernaBall ?? manualTernaNum;
        const effectiveTernaRow =
          capturedTernaRow ??
          (effectiveTernaBall && effectiveTernaBall > 0
            ? (((effectiveTernaBall - 1) % (modeToUse === '75' ? 15 : 30)) + 1)
            : undefined);

        const effectiveAmboBall = capturedAmboBall ?? manualAmboNum;
        const effectiveAmboRow =
          capturedAmboRow ??
          (effectiveAmboBall && effectiveAmboBall > 0
            ? (((effectiveAmboBall - 1) % (modeToUse === '75' ? 15 : 30)) + 1)
            : undefined);

        const playerSummaries = s75Now?.playerSummaryList && s75Now.playerSummaryList.length > 0
          ? s75Now.playerSummaryList
          : (s75Now?.players || []).map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
              totalGano: p.cumulativeWon || 0,
              debe: p.cumulativeDebt || 0,
              total: (p.cumulativeWon || 0) - (p.cumulativeDebt || 0),
            }));

        const now = new Date();
        const exactTime = getCurrentLocalTimeString();
        const localDate = getCurrentLocalDateKey();
        const endShiftTime = endTurno
          ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : undefined;

        const completeItem = buildCompleteGameSequenceItem({
          round: roundNum,
          ballNumber: effectiveWinBallNum,
          letter: effectiveWinBallNum > 0 && modeToUse === '75' ? getBingo75Letter(effectiveWinBallNum) : undefined,
          rowLeader: effectiveWinRow ?? lastWinnerInfoRef.current?.rowLeader,
          ternaBall: effectiveTernaBall,
          ternaLeader: effectiveTernaRow,
          amboBall: effectiveAmboBall,
          amboLeader: effectiveAmboRow,
          winningPlayerName: lastWinnerInfoRef.current?.playerName,
          tableNumber: lastWinnerInfoRef.current?.tableNumber,
          mode: modeToUse,
          sheetType: activeSheetType,
          durationSeconds: getMatchElapsedSeconds() > 0 ? getMatchElapsedSeconds() : 60,
          drawnBallsPlayed: drawnNumbersPlayed,
          sheet75Override: s75Now,
          sheet90Override: s90Now,
          operatorUid: opUid,
          operatorName: opName,
          operatorEmail: opEmail,
          totalLinesPlayed: exactLines,
          shiftId: currentShift.id,
          shiftName: `Turno: ${currentShift.startDate} ${currentShift.startTime}`,
          shiftDate: currentShift.startDate,
          shiftStartTime: currentShift.startTime,
          shiftEndTime: endShiftTime,
          playerSummarySnapshot: playerSummaries,
          dailyDate: localDate,
          timestamp: exactTime,
          sequenceSnapshot: {
            customSeqEntries: customSeq,
            gameSequence: (isBingo90 ? gameSequence90 : gameSequence).slice(0, 30).map(toLightweightSequenceItem),
            amboRow: effectiveAmboRow,
            ternaRow: effectiveTernaRow,
            bingoRow: effectiveWinRow,
            amboBall: effectiveAmboBall,
            ternaBall: effectiveTernaBall,
            bingoBall: effectiveWinBallNum,
          },
        });

        // 1. FINALIZE & SAVE CURRENT GAME FIRST (IndexedDB -> Save Queue -> Firestore verification)
        const { game: confirmedGame } = await saveGameUnified(completeItem);
        refreshSavedGamesList();

        // Synchronize exact lines and shift state
        recordGameToActiveShift(confirmedGame, Boolean(endTurno)).catch((err) => {
          console.error('Error recording game to shift', err);
        });

        // Log operator activity
        void logActivity(
          'Partida guardada y archivada',
          'save_game',
          `Partida #${roundNum} archivada con ${drawnNumbersPlayed.length} bolas jugadas por ${currentUser?.name || 'Operadora Principal'}`,
          modeToUse
        );

        // 2. ONLY AFTER CURRENT GAME IS STORED: Advance round and prepare the new game
        if (keepSequence) {
          if (isBingo90) {
            setGameSequence90((prev) => [confirmedGame, ...prev.filter((i) => i.round !== confirmedGame.round)]);
          } else {
            setGameSequence((prev) => [confirmedGame, ...prev.filter((i) => i.round !== confirmedGame.round)]);
          }
          setCurrentMatchRound((prev) => Math.max(prev + 1, roundNum + 1));
        } else {
          if (isBingo90) {
            setGameSequence90([]);
            safeRemoveItem(STORAGE_KEY_SEQUENCE_90);
          } else {
            setGameSequence([]);
            safeRemoveItem(STORAGE_KEY_SEQUENCE_75);
          }
          safeRemoveItem('bingo_sheet_custom_sequence');
          if (currentUser) {
            safeRemoveItem(getOperatorStorageKey('bingo_sheet_custom_sequence', currentUser));
          }
          setCurrentMatchRound(1);
        }

        // Reset live ambo, terna and bingo tracking for the new game
        currentMatchAmboBallRef.current = null;
        currentMatchAmboRowRef.current = null;
        setCurrentMatchAmboBall(null);
        setCurrentMatchAmboRow(null);
        currentMatchTernaBallRef.current = null;
        currentMatchTernaRowRef.current = null;
        setCurrentMatchTernaBall(null);
        setCurrentMatchTernaRow(null);
        currentMatchBingoBallRef.current = null;
        currentMatchBingoRowRef.current = null;
        setCurrentMatchBingoBall(null);
        setCurrentMatchBingoRow(null);

        // 3. Reset bolillero engine completely
        setIsPlaying(false);
        if (autoPlayTimerRef.current) {
          clearInterval(autoPlayTimerRef.current);
          autoPlayTimerRef.current = null;
        }
        if (drawTimeoutRef.current) {
          clearTimeout(drawTimeoutRef.current);
          drawTimeoutRef.current = null;
        }
        isExtractingRef.current = false;
        setIsExtracting(false);

        const total = modeToUse === '90' ? 90 : 75;
        const all: number[] = [];
        for (let i = 1; i <= total; i++) all.push(i);
        setRemainingBalls(all);
        setDrawnBalls([]);
        drawnBallsRef.current = [];
        setCurrentBall(null);
        setIsFinished(false);

        // 4. Clear row locks, timers, and winner info
        completedRowsRef.current.clear();
        setCompletedRowLeaders([]);
        matchStartTimeRef.current = null;
        setMatchElapsedSeconds(0);
        setLastWinningBall(null);
        lastWinnerInfoRef.current = null;

        // 5. Clear sheet marks and optionally players via custom event (using captured rows from the finished game)
        dispatchResetSheetMarksEvent(
          keepPlayers,
          keepSequence,
          keepBalances,
          winRow,
          capturedTernaRow,
          capturedAmboRow
        );

        // 6. Close new game modal
        setShowNewGameModal(false);
      } finally {
        isArchivingNewGameRef.current = false;
      }
    },
    [settings.mode, activeSheetType, getMatchElapsedSeconds, lastWinningBall, currentMatchRound, refreshSavedGamesList, currentUser, gameSequence, gameSequence90, logActivity]
  );

  // Directly save the current active match to Gallery & Firestore without advancing round
  const handleSaveCurrentGameDirectly = useCallback(
    async (
      sheet75Override?: BingoSheetData | unknown
    ): Promise<{ success: boolean; verified: boolean; game: GameSequenceItem }> => {
      const isBingo90 = activeSheetType === 'traditional-90' || settings.mode === '90';
      const modeToUse: BingoMode = isBingo90 ? '90' : '75';
      const drawnNumbersPlayed = drawnBallsRef.current.map((b) => b.number);
      const lastBall = drawnBallsRef.current[drawnBallsRef.current.length - 1];
      const winBallNum =
        currentMatchBingoBallRef.current ||
        lastWinningBall ||
        (lastBall ? lastBall.number : 0);
      const winRow =
        currentMatchBingoRowRef.current ||
        (winBallNum > 0
          ? (((winBallNum - 1) % (modeToUse === '75' ? 15 : 30)) + 1)
          : (lastWinnerInfoRef.current?.rowLeader ?? undefined));

      const roundNum = currentMatchRound || 1;
      const opUid = currentUser?.id || currentUser?.uid || 'anon';
      const opName = (currentUser?.name || 'Operadora Principal').trim();
      const opEmail = currentUser?.email || '';
      const currentShift = getActiveShift(opUid, opName, opEmail);

      const validSheet75Override =
        sheet75Override && typeof sheet75Override === 'object' && Array.isArray((sheet75Override as any).columns)
          ? (sheet75Override as BingoSheetData)
          : undefined;

      const s75Now = validSheet75Override || getStoredSheet75Snapshot();
      const s90Now = getStoredSheet90Snapshot();

      const exactLines = isBingo90
        ? (s90Now?.tables?.length ? s90Now.tables.length * 30 : 30)
        : (s75Now?.columns?.length
            ? s75Now.columns.reduce((sum, col) => sum + (Number(col.multiplier) || 1), 0)
            : 11);

      let customSeq: CustomSequenceMap | undefined = undefined;
      try {
        const opSeqKey = getOperatorStorageKey('bingo_sheet_custom_sequence', currentUser);
        const rawSeq = safeGetItem(opSeqKey) || safeGetItem('bingo_sheet_custom_sequence');
        if (rawSeq) customSeq = JSON.parse(rawSeq) as CustomSequenceMap;
      } catch (err) {
        console.warn('Error reading custom sequence on direct save:', err);
      }
      if (!customSeq && s75Now?.customSeqEntries) {
        customSeq = s75Now.customSeqEntries;
      }

      const playerSummaries =
        s75Now?.playerSummaryList && s75Now.playerSummaryList.length > 0
          ? s75Now.playerSummaryList
          : (s75Now?.players || []).map((p) => ({
              id: p.id,
              name: p.name,
              color: p.color,
              totalGano: p.cumulativeWon || 0,
              debe: p.cumulativeDebt || 0,
              total: (p.cumulativeWon || 0) - (p.cumulativeDebt || 0),
            }));

      const exactTime = getCurrentLocalTimeString();
      const localDate = getCurrentLocalDateKey();

      const completeItem = buildCompleteGameSequenceItem({
        round: roundNum,
        ballNumber: winBallNum,
        letter: winBallNum > 0 && modeToUse === '75' ? getBingo75Letter(winBallNum) : undefined,
        rowLeader: winRow ?? lastWinnerInfoRef.current?.rowLeader,
        ternaBall: currentMatchTernaBallRef.current ?? undefined,
        ternaLeader: currentMatchTernaRowRef.current ?? undefined,
        amboBall: currentMatchAmboBallRef.current ?? undefined,
        amboLeader: currentMatchAmboRowRef.current ?? undefined,
        winningPlayerName: lastWinnerInfoRef.current?.playerName,
        tableNumber: lastWinnerInfoRef.current?.tableNumber,
        mode: modeToUse,
        sheetType: activeSheetType,
        durationSeconds: getMatchElapsedSeconds() > 0 ? getMatchElapsedSeconds() : 60,
        drawnBallsPlayed: drawnNumbersPlayed,
        sheet75Override: s75Now,
        operatorUid: opUid,
        operatorName: opName,
        operatorEmail: opEmail,
        totalLinesPlayed: exactLines,
        shiftId: currentShift.id,
        shiftName: `Turno: ${currentShift.startDate} ${currentShift.startTime}`,
        shiftDate: currentShift.startDate,
        shiftStartTime: currentShift.startTime,
        playerSummarySnapshot: playerSummaries,
        dailyDate: localDate,
        timestamp: exactTime,
        sequenceSnapshot: {
          customSeqEntries: customSeq,
          gameSequence: (isBingo90 ? gameSequence90 : gameSequence).slice(0, 30).map(toLightweightSequenceItem),
          amboRow: currentMatchAmboRowRef.current ?? undefined,
          ternaRow: currentMatchTernaRowRef.current ?? undefined,
          bingoRow: winRow,
          amboBall: currentMatchAmboBallRef.current ?? undefined,
          ternaBall: currentMatchTernaBallRef.current ?? undefined,
          bingoBall: winBallNum,
        },
      });

      // Persist complete sheet and game records to Firestore with immediate verification
      const result = await saveGameUnified(completeItem);
      refreshSavedGamesList();

      // Create direct shortcut immediately in the sequence bar
      if (isBingo90) {
        setGameSequence90((prev) => [result.game, ...prev.filter((i) => i.round !== result.game.round)]);
      } else {
        setGameSequence((prev) => [result.game, ...prev.filter((i) => i.round !== result.game.round)]);
      }

      logActivity(
        'Partida guardada',
        'save_game',
        `Partida #${roundNum} guardada a las ${exactTime} en carpeta ${localDate}`,
        modeToUse
      );

      return result;
    },
    [
      activeSheetType,
      settings.mode,
      lastWinningBall,
      currentMatchRound,
      currentUser,
      getMatchElapsedSeconds,
      gameSequence,
      gameSequence90,
      refreshSavedGamesList,
    ]
  );

  // Extraction order: 'sequential' (1, 2, 3...) vs 'random' (al azar)
  const [drawOrder, setDrawOrder] = useState<'sequential' | 'random'>('random');
  const drawOrderRef = useRef<'sequential' | 'random'>('random');
  drawOrderRef.current = drawOrder;

  // Track drawn balls in ref for immediate synchronous access without React state lag
  const drawnBallsRef = useRef<Ball[]>([]);

  // CRITICAL: Timers & Extraction locks to prevent race conditions and duplicate calls
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const drawTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const confettiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isExtractingRef = useRef<boolean>(false);

  // Horizontal Row Completion Tracking (Numbers 1..15 for Bingo 75; 1..30 for Bingo 90)
  const [completedRowLeaders, setCompletedRowLeaders] = useState<number[]>([]);
  const completedRowsRef = useRef<Set<number>>(new Set());

  // Celebration state when a row is filled horizontally
  const [bingoCelebration, setBingoCelebration] = useState<{
    rowLeader: number;
    rowNumbers: number[];
    mode: BingoMode;
    drawnBall: number;
    playerName?: string;
  } | null>(null);

  // Stop bolillero immediately (pauses auto-play and clears timers)
  const handleStopBolillero = useCallback(() => {
    setIsPlaying(false);
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  }, []);

  // Full Bingo celebration handler for Bingo 90 sheet completion (just like 75!)
  const handleTraditional90Bingo = useCallback(
    (info: {
      rowNumber: number;
      numbers: [number, number, number];
      tableNumber: number;
      playerName?: string;
    }) => {
      // 1. STOP BOLILLERO IMMEDIATELY
      setIsPlaying(false);
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }

      const winningBallNum = info.numbers[info.numbers.length - 1];
      setLastWinningBall(winningBallNum);
      lastWinnerInfoRef.current = {
        playerName: info.playerName,
        tableNumber: info.tableNumber,
        rowLeader: info.rowNumber,
        ballNumber: winningBallNum,
      };

      if (completedRowsRef.current.has(info.rowNumber)) {
        return;
      }
      completedRowsRef.current.add(info.rowNumber);
      setCompletedRowLeaders((prev) =>
        prev.includes(info.rowNumber) ? prev : [...prev, info.rowNumber]
      );

      // Open celebration modal
      setBingoCelebration({
        rowLeader: info.rowNumber,
        rowNumbers: info.numbers,
        mode: '90',
        drawnBall: winningBallNum,
        playerName: info.playerName,
      });

      // 4. Play victory fanfare sound
      if (settings.sfxEnabled) {
        sfx.playBingoFanfare();
      }

      // 5. Confetti explosion
      confetti({
        particleCount: 160,
        spread: 95,
        origin: { y: 0.55 },
      });
      if (confettiTimeoutRef.current) {
        clearTimeout(confettiTimeoutRef.current);
      }
      confettiTimeoutRef.current = setTimeout(() => {
        confetti({
          particleCount: 90,
          angle: 60,
          spread: 60,
          origin: { x: 0 },
        });
        confetti({
          particleCount: 90,
          angle: 120,
          spread: 60,
          origin: { x: 1 },
        });
        confettiTimeoutRef.current = null;
      }, 350);

      // 6. CANTA BINGO con voz, exactamente igual que en el 75!
      if (settings.voiceEnabled) {
        BingoVoiceAnnouncer.singBingo({
          rowLeader: info.rowNumber,
          drawnBall: winningBallNum,
          mode: '90',
          volume: settings.voiceVolume,
          selectedVoiceName: settings.selectedVoiceName,
          playerName: info.playerName,
        });
      }
    },
    [settings]
  );

  // Helper to cleanly clear any running intervals or timeouts
  const clearAllTimers = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    if (drawTimeoutRef.current) {
      clearTimeout(drawTimeoutRef.current);
      drawTimeoutRef.current = null;
    }
    if (confettiTimeoutRef.current) {
      clearTimeout(confettiTimeoutRef.current);
      confettiTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Initialize ball pool based on current mode ('90' or '75' Americano)
  const initGamePool = useCallback(
    (mode: BingoMode) => {
      // 1. Immediately wipe any running timers
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
      if (drawTimeoutRef.current) {
        clearTimeout(drawTimeoutRef.current);
        drawTimeoutRef.current = null;
      }
      isExtractingRef.current = false;

      // Reset row completion tracking & celebration
      drawnBallsRef.current = [];
      completedRowsRef.current.clear();
      setCompletedRowLeaders([]);
      setBingoCelebration(null);

      const count = mode === '90' ? 90 : 75;
      const pool: number[] = [];
      for (let i = 1; i <= count; i++) pool.push(i);

      // Pre-shuffle pool using Fisher-Yates if drawOrder is random
      if (drawOrderRef.current === 'random') {
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [pool[i], pool[j]] = [pool[j], pool[i]];
        }
      }

      setTotalBalls(count);
      setRemainingBalls(pool);
      setDrawnBalls([]);
      setCurrentBall(null);
      setIsPlaying(false);
      setIsExtracting(false);
      setIsFinished(false);
    },
    []
  );

  // Initial setup on mount
  useEffect(() => {
    initGamePool(settings.mode);
  }, [initGamePool, settings.mode]);

  // Sync theme attribute to HTML document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  // Handle ball extraction logic (No repetition guaranteed, mutex-protected)
  const drawNextBall = useCallback(() => {
    // CRITICAL: Mutex lock to prevent duplicate/simultaneous extractions
    if (isExtractingRef.current || isFinished) return;
    isExtractingRef.current = true;
    setIsExtracting(true);

    setRemainingBalls((prevRemaining) => {
      if (prevRemaining.length === 0) {
        isExtractingRef.current = false;
        setIsExtracting(false);
        setIsPlaying(false);
        setIsFinished(true);
        if (settings.sfxEnabled) sfx.playBingoFanfare();
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
        });
        if (settings.voiceEnabled) {
          BingoVoiceAnnouncer.speakText(
            '¡Atención! Se han extraído todos los números del bombo.',
            settings.voiceVolume,
            settings.selectedVoiceName
          );
        }
        return prevRemaining;
      }

      // Pick number: in sequential ascending order (1, 2, 3...) or random
      let chosenNumber: number;
      let newRemaining: number[];

      if (drawOrderRef.current === 'sequential') {
        const sorted = [...prevRemaining].sort((a, b) => a - b);
        chosenNumber = sorted[0];
        newRemaining = sorted.slice(1);
      } else {
        // Strict random selection with Math.floor(Math.random() * length) and atomic splice
        const randomIndex = Math.floor(Math.random() * prevRemaining.length);
        chosenNumber = prevRemaining[randomIndex];
        newRemaining = [...prevRemaining];
        newRemaining.splice(randomIndex, 1);
      }

      // Trigger extraction animations & SFX
      if (settings.sfxEnabled) {
        sfx.playBallEject();
      }

      // Clear any pending timeout before queuing a new presentation
      if (drawTimeoutRef.current) {
        clearTimeout(drawTimeoutRef.current);
      }

      // After 600ms, the ball lands on the presentation screen
      drawTimeoutRef.current = setTimeout(() => {
        const isEffective90 =
          settings.mode === '90' ||
          (currentAppView === 'sheet-builder' && activeSheetType === 'traditional-90');
        const letter =
          !isEffective90 && settings.mode === '75'
            ? getBingo75Letter(chosenNumber)
            : undefined;

        const newBall: Ball = {
          number: chosenNumber,
          letter,
          drawnAt: new Date(),
          order: drawnBallsRef.current.length + 1,
        };
        setCurrentBall(newBall);

        // Build updated list and set synchronously to guarantee zero state race conditions
        const nextDrawn = [...drawnBallsRef.current, newBall];
        drawnBallsRef.current = nextDrawn;
        setDrawnBalls(nextDrawn);

        // Release extraction mutex lock
        isExtractingRef.current = false;
        setIsExtracting(false);
        drawTimeoutRef.current = null;

        // Sound chime on ball presentation
        if (settings.sfxEnabled) {
          sfx.playRevealChime();
        }

        // Standard ball announcement
        if (settings.voiceEnabled) {
          BingoVoiceAnnouncer.announceNumber({
            number: chosenNumber,
            letter,
            mode: isEffective90 ? '90' : settings.mode,
            sayNicknames: isEffective90 ? false : settings.sayNicknames,
            volume: settings.voiceVolume,
            selectedVoiceName: settings.selectedVoiceName,
          });
        }
      }, 600);

      return newRemaining;
    });
  }, [settings, isFinished, currentAppView, activeSheetType]);

  // Synchronize drawn balls ref & completed rows for master board
  useEffect(() => {
    drawnBallsRef.current = drawnBalls;
    if (drawnBalls.length === 0) {
      setCompletedRowLeaders((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    const currentSet = new Set<number>(drawnBalls.map((b) => b.number));
    const completed = findCompletedBingoRows(currentSet, settings.mode);
    setCompletedRowLeaders(completed);
  }, [drawnBalls, settings.mode]);

  // Clean Speed Change: Clear any prior intervals and apply new interval
  const handleSpeedChange = useCallback((preset: SpeedPreset, seconds: number) => {
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
    setSettings((s) => ({ ...s, speed: preset, speedSeconds: seconds }));
  }, []);

  // Auto-play interval handling with explicit cleanup
  useEffect(() => {
    if (isPlaying && !isFinished) {
      autoPlayTimerRef.current = setInterval(() => {
        drawNextBall();
      }, settings.speedSeconds * 1000);
    } else {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
        autoPlayTimerRef.current = null;
      }
    }

    return () => {
      if (autoPlayTimerRef.current) {
        clearInterval(autoPlayTimerRef.current);
      }
    };
  }, [isPlaying, isFinished, settings.speedSeconds, drawNextBall]);

  // Toggle Auto-play
  const handleTogglePlay = useCallback(() => {
    if (isFinished) return;
    if (settings.sfxEnabled) sfx.playClick();

    // Clear any prior interval before toggling state
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }

    if (!isPlaying) {
      if (drawnBalls.length === 0 && remainingBalls.length > 0 && !isExtractingRef.current) {
        drawNextBall();
      }
      setIsPlaying(true);
    } else {
      setIsPlaying(false);
    }
  }, [isFinished, settings.sfxEnabled, isPlaying, drawnBalls.length, remainingBalls.length, drawNextBall]);

  // Direct reset handler (bypasses modal when already confirmed in sidebar)
  const handleDirectReset = useCallback((forcedMode?: BingoMode) => {
    if (settings.sfxEnabled) sfx.playClick();
    clearAllTimers();
    const modeToUse = forcedMode || (activeSheetType === 'traditional-90' ? '90' : settings.mode);
    initGamePool(modeToUse);
    setShowResetConfirm(false);
    setIsPlaying(false);
    logActivity('Reinicio de bolillero', 'reset_game', 'Se reinició el bolillero a 0 bolas', modeToUse);
    window.dispatchEvent(
      new CustomEvent('bingo_reset_sheet_for_new_game', { detail: { keepPlayers: true } })
    );
  }, [settings.sfxEnabled, clearAllTimers, initGamePool, activeSheetType, settings.mode, logActivity]);

  // Reset confirmation
  const handleResetGame = useCallback(() => {
    if (drawnBalls.length > 0) {
      setShowResetConfirm(true);
    } else {
      handleDirectReset(activeSheetType === 'traditional-90' ? '90' : settings.mode);
    }
  }, [drawnBalls.length, handleDirectReset, activeSheetType, settings.mode]);

  const confirmReset = useCallback(() => {
    handleDirectReset();
  }, [handleDirectReset]);

  // Mode Selection Handlers (Bingo 90 and Bingo Americano)
  const handleSelectMode = useCallback((mode: BingoMode) => {
    if (!isAdmin && currentUser?.assignedMode && mode !== currentUser.assignedMode) {
      setAccessDeniedMessage(
        `Acceso Restringido: Tu cuenta de operadora está configurada exclusivamente para Bingo ${currentUser.assignedMode} Bolas. Solo las administradoras pueden alternar modalidades.`
      );
      return;
    }
    if (settings.sfxEnabled) sfx.playClick();
    clearAllTimers();
    setSettings((prev) => ({
      ...prev,
      mode,
    }));
    initGamePool(mode);
    setIsModeSelectionOpen(false);
  }, [isAdmin, currentUser?.assignedMode, settings.sfxEnabled, clearAllTimers, initGamePool]);

  const handleQuickModeChange = useCallback((mode: BingoMode) => {
    if (settings.mode === mode) return;
    if (!isAdmin && currentUser?.assignedMode && mode !== currentUser.assignedMode) {
      setAccessDeniedMessage(
        `Acceso Restringido: Tu cuenta de operadora está configurada exclusivamente para Bingo ${currentUser.assignedMode} Bolas. Solo las administradoras pueden alternar modalidades.`
      );
      return;
    }
    if (drawnBalls.length > 0) {
      setIsModeSelectionOpen(true);
    } else {
      handleSelectMode(mode);
    }
  }, [settings.mode, isAdmin, currentUser?.assignedMode, drawnBalls.length, handleSelectMode]);

  const handleOpenModeSelect = useCallback(() => {
    if (!isAdmin) {
      setAccessDeniedMessage(
        `Acceso Restringido: Tu cuenta de operadora está configurada exclusivamente para Bingo ${currentUser?.assignedMode || settings.mode} Bolas. Solo las administradoras tienen autorización para ver ambos paneles y cambiar de modo.`
      );
      return;
    }
    setIsModeSelectionOpen(true);
  }, [isAdmin, currentUser?.assignedMode, settings.mode]);

  const handleOpenSheet75 = useCallback(() => {
    if (!isAdmin && currentUser?.assignedMode === '90') {
      setAccessDeniedMessage(
        'Acceso Restringido: Tu cuenta de operadora tiene asignado exclusivamente el panel de Bingo 90 Bolas.'
      );
      return;
    }
    setActiveSheetType('multipliers-15');
    if (settings.mode !== '75') {
      handleSelectMode('75');
    }
    setCurrentAppView('sheet-builder');
  }, [isAdmin, currentUser?.assignedMode, settings.mode, handleSelectMode]);

  const handleOpenSheet90 = useCallback(() => {
    if (!isAdmin && currentUser?.assignedMode === '75') {
      setAccessDeniedMessage(
        'Acceso Restringido: Tu cuenta de operadora tiene asignado exclusivamente el panel de Bingo 75 Bolas.'
      );
      return;
    }
    setActiveSheetType('traditional-90');
    if (settings.mode !== '90') {
      handleSelectMode('90');
    }
    setCurrentAppView('sheet-builder');
  }, [isAdmin, currentUser?.assignedMode, settings.mode, handleSelectMode]);

  // Fullscreen event listener to keep isFullscreen in sync with Esc key or browser gestures
  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as VendorFullscreenDocument;
      const isFs = Boolean(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );
      setIsFullscreen(isFs);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Robust Toggle Fullscreen (handles iframes, desktop, mobile, and simulated viewports)
  const toggleFullscreen = useCallback(() => {
    try {
      const doc = document as VendorFullscreenDocument;
      const isCurrentlyFs = Boolean(
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement ||
        isFullscreen
      );

      if (isCurrentlyFs) {
        if (doc.exitFullscreen) {
          doc.exitFullscreen().catch((err) => console.warn('exitFullscreen notice:', err));
        } else if (doc.webkitExitFullscreen) {
          doc.webkitExitFullscreen();
        }
        setIsFullscreen(false);
      } else {
        const rootEl = document.documentElement as VendorFullscreenElement;
        if (rootEl.requestFullscreen) {
          rootEl
            .requestFullscreen()
            .then(() => {
              setIsFullscreen(true);
            })
            .catch(() => {
              // Permission denied or blocked in iframe: simulate full viewport theater mode!
              setIsFullscreen(true);
            });
        } else if (rootEl.webkitRequestFullscreen) {
          try {
            rootEl.webkitRequestFullscreen();
            setIsFullscreen(true);
          } catch (err) {
            console.warn('Webkit fullscreen error:', err);
            setIsFullscreen(true);
          }
        } else {
          setIsFullscreen(true);
        }
      }
    } catch (err) {
      console.warn('Toggle fullscreen error:', err);
      setIsFullscreen((prev) => !prev);
    }
  }, [isFullscreen]);

  // Manual Celebrate Prize button
  const handleCelebrateBingo = useCallback(() => {
    if (settings.sfxEnabled) sfx.playBingoFanfare();
    confetti({
      particleCount: 110,
      spread: 75,
      origin: { y: 0.55 },
    });
    if (settings.voiceEnabled) {
      BingoVoiceAnnouncer.speakText(
        '¡PREMIADO! ¡Comprobamos cartón premiado!',
        settings.voiceVolume,
        settings.selectedVoiceName
      );
    }
    if (currentBall) {
      const leader =
        settings.mode === '75'
          ? ((currentBall.number - 1) % 15) + 1
          : ((currentBall.number - 1) % 10) + 1;
      setLastWinningBall(currentBall.number);
      setCompletedRowLeaders((prev) => (prev.includes(leader) ? prev : [...prev, leader]));
      setGameSequence((prev) => {
        const item: GameSequenceItem = {
          round: prev.length + 1,
          ballNumber: currentBall.number,
          letter: currentBall.letter,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rowLeader: leader,
        };
        const exists = prev.some(
          (p) => p.ballNumber === item.ballNumber && p.round === item.round
        );
        if (exists) return prev;
        return [...prev, item];
      });
    }
  }, [settings.sfxEnabled, settings.voiceEnabled, settings.voiceVolume, settings.selectedVoiceName, settings.mode, currentBall]);

  // Replay fanfare inside celebration modal
  const handleReplayFanfare = useCallback(() => {
    if (settings.sfxEnabled) sfx.playBingoFanfare();
    confetti({
      particleCount: 130,
      spread: 85,
      origin: { y: 0.5 },
    });
    if (settings.voiceEnabled && bingoCelebration) {
      BingoVoiceAnnouncer.singBingo({
        rowLeader: bingoCelebration.rowLeader,
        drawnBall: bingoCelebration.drawnBall,
        mode: settings.mode,
        volume: settings.voiceVolume,
        selectedVoiceName: settings.selectedVoiceName,
      });
    }
  }, [settings.sfxEnabled, settings.voiceEnabled, settings.mode, settings.voiceVolume, settings.selectedVoiceName, bingoCelebration]);

  // Keyboard Shortcuts (Space: Draw next / play, P: Pause/Play, M: Mute, R: Reset, F: Fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in search input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLSelectElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          setIsPlaying(false);
        } else {
          drawNextBall();
        }
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setSettings((s) => ({
          ...s,
          voiceEnabled: !s.voiceEnabled,
          sfxEnabled: !s.sfxEnabled,
        }));
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleResetGame();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, drawNextBall, handleTogglePlay, handleResetGame, toggleFullscreen]);

  // 1. Loading splash while Firebase Auth initializes
  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#fbf5ee] text-[#431407] select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-lg border-2 border-white/80 animate-pulse">
            <Gamepad2 className="w-7 h-7" />
          </div>
          <div className="flex items-center gap-2 text-xs font-black text-orange-950 uppercase tracking-wider">
            <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
            <span>Cargando plataforma...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. Authentication Gate: Must Register / Log in before having any access to the platform
  if (!currentUser) {
    return <AuthScreen initialMode="register" />;
  }

  // If user navigated to the dedicated Bingo Sheet / Card Creator Landing Page
  if (currentAppView === 'sheet-builder') {
    return (
      <>
        <BingoSheetBuilder
          onBackToGame={() => setCurrentAppView('game')}
          currentUser={currentUser}
          onOpenLogin={() => setIsLoginOpen(true)}
          onOpenAdmin={handleOpenAdminPanel}
          completedRowLeaders={completedRowLeaders}
          winningBall={lastWinningBall ?? (currentBall ? currentBall.number : null)}
          gameSequence={activeSheetType === 'traditional-90' ? gameSequence90 : gameSequence}
          todaySavedGames={todaySavedGames}
          currentMatchRound={currentMatchRound}
          currentMatchAmboBall={currentMatchAmboBall}
          currentMatchAmboRow={currentMatchAmboRow}
          currentMatchTernaBall={currentMatchTernaBall}
          currentMatchBingoBall={currentMatchBingoBall}
          currentMatchTernaRow={currentMatchTernaRow}
          currentMatchBingoRow={currentMatchBingoRow}
          gameObjectives={gameObjectives}
          onToggleObjective={handleToggleObjective}
          onAddSequenceItem={handleAddSequenceItem}
          onClearSequence={handleClearSequence}
          onOpenGameSnapshot={(item) => setSelectedSnapshotModalItem(item)}
          onStartNewGame={() => setShowNewGameModal(true)}
          onSaveCurrentGame={handleSaveCurrentGameDirectly}
          mode={settings.mode}
          drawnBalls={drawnBalls}
          onStopBolillero={handleStopBolillero}
          onBingoCompleted={handleTraditional90Bingo}
          initialSheetType={activeSheetType}
          onSheetTypeChange={setActiveSheetType}
          autoHighlightDrawn={autoHighlightDrawn}
          onToggleAutoHighlightDrawn={handleToggleAutoHighlightDrawn}
          currentBall={currentBall}
          onDrawBall={drawNextBall}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onResetGame={() => handleDirectReset(activeSheetType === 'traditional-90' ? '90' : settings.mode)}
          settings={settings}
          onUpdateSettings={setSettings}
          gameSequence90={gameSequence90}
          onClearSequence90={handleClearSequence90}
          onSelectMode={handleSelectMode}
          totalBalls={totalBalls}
          onOpenSavedGamesGallery={() => {
            refreshSavedGamesList();
            setShowSavedGamesGallery(true);
          }}
          savedGamesCount={savedGamesList.length}
          platformColor={platformColor}
          onSelectPlatformColor={handleSelectPlatformColor}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
        <LoginModal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          onOpenAdmin={handleOpenAdminPanel}
          onAccessDeniedNotice={(msg) => setAccessDeniedMessage(msg)}
        />
        <AdminPanelModal
          isOpen={isAdminOpen}
          onClose={() => setIsAdminOpen(false)}
        />
        {accessDeniedMessage && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none">
            <div className="w-full max-w-sm rounded-3xl border-2 border-rose-300 bg-[#fffaf5] p-5 text-center flex flex-col items-center gap-3 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="font-black text-base text-rose-950">Acceso Restringido</h3>
              <p className="text-xs text-rose-900/80 leading-relaxed font-semibold">
                {accessDeniedMessage}
              </p>
              <div className="flex gap-2 w-full mt-2">
                <button
                  onClick={() => setAccessDeniedMessage(null)}
                  className="flex-1 py-2 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-white shadow transition-all cursor-pointer"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Saved Games Gallery Modal */}
        <SavedGamesGalleryModal
          isOpen={showSavedGamesGallery}
          savedGames={savedGamesList}
          onClose={() => setShowSavedGamesGallery(false)}
          onRefreshGallery={refreshSavedGamesList}
          currentUser={currentUser}
          isAdmin={isAdmin}
        />

        {/* Game Snapshot Viewer Modal */}
        <GameSheetSnapshotModal
          isOpen={!!selectedSnapshotModalItem}
          onClose={() => setSelectedSnapshotModalItem(null)}
          item={selectedSnapshotModalItem}
        />

        {/* New Game & Archive Confirmation Modal */}
        <NewGameModal
          isOpen={showNewGameModal}
          onClose={() => setShowNewGameModal(false)}
          onConfirm={handleConfirmArchiveAndNewGame}
          onConfirmArchiveAndNewGame={handleConfirmArchiveAndNewGame}
          currentRound={currentMatchRound}
          currentDuration={formatGameDuration(matchElapsedSeconds)}
          durationFormatted={formatGameDuration(matchElapsedSeconds)}
          ballsDrawnCount={drawnBalls.length}
          financials={currentGameFinancials}
          winningBall={lastWinningBall ?? (currentBall ? currentBall.number : null)}
          sheetType={activeSheetType}
          currency={settings.currencySymbol || '$'}
        />

        {/* Bingo Celebration Modal when a row is completed in sheet view */}
        {bingoCelebration && (
          <BingoCelebrationModal
            isOpen={!!bingoCelebration}
            rowLeader={bingoCelebration.rowLeader}
            rowNumbers={bingoCelebration.rowNumbers}
            mode={bingoCelebration.mode}
            drawnBall={bingoCelebration.drawnBall}
            playerName={bingoCelebration.playerName}
            isTriple90={bingoCelebration.mode === '90'}
            onClose={() => setBingoCelebration(null)}
            onReplayFanfare={handleReplayFanfare}
            onStartNewGame={() => setShowNewGameModal(true)}
          />
        )}

        {/* Reset Confirmation Dialog in sheet view */}
        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div
              className="w-full max-w-sm rounded-3xl border shadow-2xl p-5 text-center flex flex-col items-center gap-3"
              style={{
                backgroundColor: 'var(--surface-card)',
                borderColor: 'var(--surface-border)',
                color: 'var(--text-primary)',
              }}
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mb-1">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-base">¿Reiniciar partida?</h3>
              <p className="text-xs opacity-70">
                Se restablecerá el bombo con todas las bolas y se borrará el historial de {drawnBalls.length} bolas extraídas.
              </p>
              <div className="flex items-center gap-2.5 w-full mt-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold border hover:bg-white/5 transition-colors cursor-pointer"
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDirectReset(activeSheetType === 'traditional-90' ? '90' : settings.mode)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow transition-all active:scale-95 cursor-pointer"
                >
                  Sí, Reiniciar
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={`h-screen max-h-screen flex flex-col overflow-hidden transition-colors duration-300 select-none ${
        isFullscreen ? 'fixed inset-0 z-50 w-screen h-screen' : ''
      }`}
    >
      {viewFormat === 'bingo-es' ? (
        /* EXACT BINGO.ES ARCADE SKEUOMORPHIC FORMAT (Requested by User) */
        <BingoEsFormat
          currentBall={currentBall}
          drawnBalls={drawnBalls}
          remainingBalls={remainingBalls}
          totalBalls={totalBalls}
          mode={settings.mode}
          completedRowLeaders={completedRowLeaders}
          ternaRowLeader={currentMatchTernaRow}
          ternaBallNumber={currentMatchTernaBall}
          currentMatchAmboRow={currentMatchAmboRow}
          currentMatchAmboBall={currentMatchAmboBall}
          gameObjectives={gameObjectives}
          onToggleObjective={handleToggleObjective}
          currentUser={currentUser}
          gameSequence={gameSequence}
          onAddSequenceItem={handleAddSequenceItem}
          onClearSequence={handleClearSequence}
          isPlaying={isPlaying}
          isExtracting={isExtracting}
          isFinished={isFinished}
          settings={settings}
          isFullscreen={isFullscreen}
          drawOrder={drawOrder}
          onToggleDrawOrder={() =>
            setDrawOrder((prev) => (prev === 'sequential' ? 'random' : 'sequential'))
          }
          onDrawNext={drawNextBall}
          onTogglePlay={handleTogglePlay}
          onReset={() => setShowResetConfirm(true)}
          onOpenModeSelect={handleOpenModeSelect}
          onBingo={handleCelebrateBingo}
          onToggleVoice={() =>
            setSettings((s) => ({ ...s, voiceEnabled: !s.voiceEnabled }))
          }
          onToggleSfx={() =>
            setSettings((s) => ({ ...s, sfxEnabled: !s.sfxEnabled }))
          }
          onToggleFullscreen={toggleFullscreen}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSheetBuilder={(sheetType) => {
            if (sheetType) setActiveSheetType(sheetType);
            setCurrentAppView('sheet-builder');
          }}
          onOpenSheet75={handleOpenSheet75}
          onOpenSheet90={handleOpenSheet90}
          onOpenAdmin={handleOpenAdminPanel}
          onOpenLogin={() => setIsLoginOpen(true)}
          onToggleViewFormat={() => setViewFormat('simulator-3d')}
          onChangeSpeed={handleSpeedChange}
          onOpenGameSnapshot={(item) => setSelectedSnapshotModalItem(item)}
          onStartNewGame={() => setShowNewGameModal(true)}
          onOpenSavedGamesGallery={() => {
            refreshSavedGamesList();
            setShowSavedGamesGallery(true);
          }}
          savedGamesCount={savedGamesList.length}
          platformColor={platformColor}
          onSelectPlatformColor={handleSelectPlatformColor}
        />
      ) : (
        /* SIMULATOR 3D CAGE FORMAT */
        <>
          {/* Top Header / Navigation Bar */}
          <header
            className="w-full border-b backdrop-blur-md px-3 sm:px-5 py-1.5 sm:py-2 flex items-center justify-between shadow-xs flex-shrink-0"
            style={{
              backgroundColor: 'var(--surface-main)',
              borderColor: 'var(--surface-border)',
            }}
          >
            {/* Brand & Mode Quick Switcher */}
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-400 border border-amber-500 flex items-center justify-center text-amber-950 font-black text-sm shadow-xs">
                  <Crown className="w-4 h-4 text-amber-950 fill-amber-900" />
                </div>
                <div>
                  <h1
                    className="font-black text-xs sm:text-sm tracking-tight leading-none"
                    style={{ fontFamily: 'var(--font-heading)' }}
                  >
                    Bolillero Virtual
                  </h1>
                  <span className="text-[10px] opacity-75 font-semibold hidden sm:inline">
                    {drawnBalls.length}/{totalBalls} bolas cantadas
                  </span>
                </div>
              </div>

              {/* View Switcher: Back to Arcade Format */}
              <button
                onClick={() => setViewFormat('bingo-es')}
                className="px-2.5 py-1 rounded-xl bg-amber-400 hover:bg-amber-300 text-amber-950 border border-amber-500 text-xs font-black transition-all flex items-center gap-1.5 shadow-xs active:scale-95"
                title="Volver al formato Arcade"
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Formato Arcade</span>
              </button>

              {/* Permanent Real-Time Offline-First Sync Indicator */}
              <SyncStatusIndicator />

              {/* Mode Selector: Interactive buttons for Admin, locked badge for Operator */}
              {isAdmin ? (
                <div
                  id="header-mode-selector"
                  className="flex items-center p-0.5 rounded-xl border bg-black/5 gap-0.5"
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <button
                    id="btn-mode-90"
                    onClick={() => handleQuickModeChange('90')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      settings.mode === '90'
                        ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    title="90 Bolas (Tradicional)"
                  >
                    <CircleDot className="w-3 h-3" />
                    <span>90 Bolas</span>
                  </button>
                  <button
                    id="btn-mode-75"
                    onClick={() => handleQuickModeChange('75')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      settings.mode === '75'
                        ? 'bg-amber-400 text-amber-950 font-black shadow-xs'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    title="75 Bolas (1 al 75)"
                  >
                    <Grid3X3 className="w-3 h-3" />
                    <span>75 Bolas</span>
                  </button>
                  <button
                    id="btn-open-mode-modal"
                    onClick={handleOpenModeSelect}
                    className="px-2 py-1 rounded-lg text-xs font-semibold opacity-60 hover:opacity-100 hover:bg-black/5 transition-all flex items-center gap-1"
                    title="Elegir modalidad de juego"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div
                  id="badge-operator-fixed-mode-3d"
                  className="px-2.5 py-1 rounded-xl bg-amber-200/80 text-amber-950 font-black text-xs border border-amber-400 shadow-2xs select-none"
                  title={`Modo Exclusivo de Operadora: Bingo ${settings.mode} Bolas`}
                >
                  {settings.mode === '90' ? 'Bingo 90 Bolas' : 'Bingo 75 Bolas'}
                </div>
              )}
            </div>

            {/* Quick Utilities: Planillas, Sound, Fullscreen, Settings */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Direct Planilla 75 Button: Visible for Admin or Operator assigned to 75 */}
              {(isAdmin || currentUser?.assignedMode === '75') && (
                <button
                  id="btn-nav-sheet-75"
                  onClick={handleOpenSheet75}
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border text-xs font-black active:scale-95 transition-all shadow-xs bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700 cursor-pointer"
                  title="Abrir Planilla de 75 Bolas (1 al 15)"
                >
                  <Table2 className="w-3 h-3 flex-shrink-0" />
                  <span className="hidden sm:inline">Planilla 75</span>
                  <span className="sm:hidden">P75</span>
                </button>
              )}

              {/* Direct Planilla 90 Button: Visible for Admin or Operator assigned to 90 */}
              {(isAdmin || currentUser?.assignedMode === '90') && (
                <button
                  id="btn-nav-sheet-90"
                  onClick={handleOpenSheet90}
                  className="flex items-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border text-xs font-black active:scale-95 transition-all shadow-xs bg-orange-600 hover:bg-orange-500 text-white border-orange-700 cursor-pointer"
                  title="Abrir Planilla de 90 Bolas (Triples Tablas 1 y 2)"
                >
                  <Table2 className="w-3 h-3 flex-shrink-0" />
                  <span className="hidden sm:inline">Planilla 90</span>
                  <span className="sm:hidden">P90</span>
                </button>
              )}

              {/* Direct Partidas Guardadas Button */}
              <button
                id="btn-nav-saved-games"
                onClick={() => {
                  refreshSavedGamesList();
                  setShowSavedGamesGallery(true);
                }}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-xs font-black active:scale-95 transition-all shadow-xs bg-amber-600 hover:bg-amber-500 text-white border-amber-700 cursor-pointer"
                title="Abrir galería de partidas guardadas con historial y planillas completas"
              >
                <Layers className="w-3.5 h-3.5 text-yellow-200 flex-shrink-0" />
                <span className="hidden sm:inline">Partidas Guardadas</span>
                <span className="sm:hidden">Partidas</span>
                {savedGamesList.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-yellow-300 text-[9px] font-black leading-none">
                    {savedGamesList.length}
                  </span>
                )}
              </button>

              {/* Quick Sound Toggle */}
              <button
                id="btn-quick-mute"
                onClick={() =>
                  setSettings((s) => ({
                    ...s,
                    voiceEnabled: !s.voiceEnabled,
                    sfxEnabled: !s.sfxEnabled,
                  }))
                }
                className="p-2 rounded-xl border hover:bg-black/5 active:scale-95 transition-all shadow-xs"
                style={{ borderColor: 'var(--surface-border)' }}
                title={
                  settings.voiceEnabled || settings.sfxEnabled
                    ? 'Silenciar todo (M)'
                    : 'Activar sonido (M)'
                }
              >
                {settings.voiceEnabled || settings.sfxEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5 opacity-50" />
                )}
              </button>

              {/* Fullscreen TV / Projector Toggle */}
              <button
                id="btn-toggle-fullscreen"
                onClick={toggleFullscreen}
                className="p-2 rounded-xl border hover:bg-black/5 active:scale-95 transition-all shadow-xs hidden sm:flex"
                style={{ borderColor: 'var(--surface-border)' }}
                title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa (F)'}
              >
                {isFullscreen ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Tv className="w-3.5 h-3.5" />
                )}
              </button>

              {/* User Account / Profile Badge */}
              <button
                id="btn-nav-user"
                onClick={() => setIsLoginOpen(true)}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-bold active:scale-95 transition-all shadow-xs cursor-pointer ${
                  currentUser
                    ? currentUser.role === 'admin'
                      ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                      : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-emerald-300'
                    : 'bg-white hover:bg-orange-50 text-orange-950 border-orange-200'
                }`}
                title={
                  currentUser
                    ? `Usuario: ${currentUser.name} (${currentUser.role === 'admin' ? 'Administrador' : 'Operador'})`
                    : 'Iniciar Sesión / Registro'
                }
              >
                {currentUser ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: currentUser.avatarColor || (currentUser.role === 'admin' ? '#f59e0b' : '#10b981') }}
                    />
                    <span className="hidden sm:inline font-black truncate max-w-[90px]">{currentUser.name}</span>
                    <span className="text-[9px] uppercase px-1 py-0.2 rounded font-black opacity-80">
                      {currentUser.role === 'admin' ? '👑 Admin' : '🎮 Op'}
                    </span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-3.5 h-3.5 text-orange-600" />
                    <span className="hidden sm:inline">Ingresar</span>
                  </>
                )}
              </button>

              {/* Admin Panel Modal Trigger */}
              <button
                id="btn-nav-admin"
                onClick={handleOpenAdminPanel}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-black active:scale-95 transition-all shadow-xs cursor-pointer ${
                  isAdmin
                    ? 'bg-amber-200 hover:bg-amber-300 text-amber-950 border-amber-400'
                    : 'bg-orange-100/70 hover:bg-orange-200 text-orange-900/60 border-orange-300/60'
                }`}
                title={isAdmin ? 'Panel de Administrador en Tiempo Real' : 'Panel Admin (Solo Administradores)'}
              >
                <ShieldCheck className={`w-3.5 h-3.5 ${isAdmin ? 'text-amber-950' : 'text-orange-900/60'}`} />
                <span className="hidden sm:inline">Admin</span>
              </button>

              {/* Settings Modal Trigger */}
              <button
                id="btn-nav-settings"
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 rounded-xl border hover:bg-black/5 active:scale-95 transition-all shadow-xs"
                style={{ borderColor: 'var(--surface-border)' }}
                title="Configuración y Temas"
              >
                <Settings2 className="w-3.5 h-3.5 text-amber-600" />
              </button>
            </div>
          </header>

          {/* Mobile Tab Switcher (Visible on small screens) */}
          <div className="flex lg:hidden border-b border-slate-700/20 px-3 py-1 gap-2 bg-black/10 flex-shrink-0">
            <button
              onClick={() => setActiveTabMobile('cage')}
              className={`flex-1 py-1 rounded-xl text-xs font-bold transition-all ${
                activeTabMobile === 'cage'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              Bombo y Extracción
            </button>
            <button
              onClick={() => setActiveTabMobile('board')}
              className={`flex-1 py-1 rounded-xl text-xs font-bold transition-all ${
                activeTabMobile === 'board'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              Tablero Master ({drawnBalls.length}/{totalBalls})
            </button>
          </div>

          {/* Main Workspace Layout - Fits 100% within viewport */}
          <main className="flex-1 min-h-0 w-full max-w-[1600px] mx-auto p-1.5 sm:p-2.5 overflow-hidden flex flex-col">
            {/* Dual-column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3 h-full min-h-0 overflow-hidden">
              {/* Left Column: Bolillero Central + Bola Gigante + Controles */}
              <div
                className={`lg:col-span-5 xl:col-span-4 h-full flex flex-col justify-between gap-2 min-h-0 overflow-hidden ${
                  activeTabMobile === 'board' ? 'hidden lg:flex' : 'flex'
                }`}
              >
                {/* Bombo Central & Bola Actual Combined Card */}
                <div
                  className="rounded-2xl border shadow-xs overflow-hidden flex flex-col flex-1 min-h-0 justify-between transition-all"
                  style={{
                    backgroundColor: 'var(--surface-main)',
                    borderColor: 'var(--surface-border)',
                  }}
                >
                  {/* Animated 3D/2D Canvas Cage */}
                  <BingoCageCanvas
                    isSpinning={isPlaying}
                    isExtracting={isExtracting}
                    theme={settings.theme}
                    remainingCount={remainingBalls.length}
                    sfxEnabled={settings.sfxEnabled}
                  />

                  {/* Giant Ball & Recent History Bar */}
                  <div className="border-t border-slate-700/20 flex-1 min-h-0 flex flex-col justify-center">
                    <CurrentBallDisplay
                      currentBall={currentBall}
                      drawnBalls={drawnBalls}
                      mode={settings.mode}
                      theme={settings.theme}
                      sayNicknames={settings.sayNicknames}
                      onOpenHistory={() => setIsHistoryOpen(true)}
                      ternaInfo={
                        currentMatchTernaBall !== null && currentMatchTernaRow !== null
                          ? { ballNumber: currentMatchTernaBall, rowLeader: currentMatchTernaRow }
                          : null
                      }
                    />
                  </div>
                </div>

                {/* Controls Bar */}
                <ControlsBar
                  isPlaying={isPlaying}
                  isExtracting={isExtracting}
                  remainingCount={remainingBalls.length}
                  totalBalls={totalBalls}
                  speed={settings.speed}
                  speedSeconds={settings.speedSeconds}
                  voiceEnabled={settings.voiceEnabled}
                  sfxEnabled={settings.sfxEnabled}
                  onTogglePlay={handleTogglePlay}
                  onDrawNext={drawNextBall}
                  onReset={handleResetGame}
                  onChangeSpeed={(preset, seconds) =>
                    setSettings((s) => ({ ...s, speed: preset, speedSeconds: seconds }))
                  }
                  onToggleVoice={() =>
                    setSettings((s) => ({ ...s, voiceEnabled: !s.voiceEnabled }))
                  }
                  onToggleSfx={() =>
                    setSettings((s) => ({ ...s, sfxEnabled: !s.sfxEnabled }))
                  }
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onCelebrateBingo={handleCelebrateBingo}
                />
              </div>

              {/* Right Column: Tablero de Control Master */}
              <div
                className={`lg:col-span-7 xl:col-span-8 h-full flex flex-col min-h-0 overflow-hidden ${
                  activeTabMobile === 'cage' ? 'hidden lg:flex' : 'flex'
                }`}
              >
                <MasterBoard
                  mode={settings.mode}
                  totalBalls={totalBalls}
                  customMin={settings.customMin}
                  customMax={settings.customMax}
                  drawnBalls={drawnBalls}
                  currentBall={currentBall}
                  theme={settings.theme}
                  completedRowLeaders={completedRowLeaders}
                  ternaRowLeader={currentMatchTernaRow}
                  ternaBallNumber={currentMatchTernaBall}
                />
              </div>
            </div>
          </main>

          {/* Bottom Bar with Platform Color Switcher */}
          <div className="w-full px-2 py-1 flex-shrink-0" style={{ backgroundColor: 'var(--surface-main)' }}>
            <div className="max-w-4xl mx-auto">
              <PlatformColorBar
                currentColor={platformColor}
                onSelectColor={handleSelectPlatformColor}
              />
            </div>
          </div>

          {/* Slim Footer */}
          <footer
            className="w-full border-t py-1 px-3 text-center text-[10px] sm:text-xs opacity-50 flex items-center justify-between gap-2 flex-shrink-0"
            style={{ borderColor: 'var(--surface-border)' }}
          >
            <span className="truncate">
              Bolillero Virtual • Atajos: [Espacio] Extraer • [P] Pausar • [M] Sonido • [F] Pantalla completa
            </span>
            <span className="font-semibold whitespace-nowrap">
              Modo: {settings.mode === '90' ? '90 Bolas' : '75 Bolas'}
            </span>
          </footer>
        </>
      )}

      {/* Mode Selection Modal */}
      <ModeSelectionModal
        isOpen={isModeSelectionOpen}
        currentMode={settings.mode}
        hasDrawnBalls={drawnBalls.length > 0}
        onSelectMode={handleSelectMode}
        onClose={() => setIsModeSelectionOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        drawnCount={drawnBalls.length}
        onClose={() => setIsSettingsOpen(false)}
        onOpenAdmin={() => setIsAdminOpen(true)}
        onSaveSettings={(newSettings, requiresReset) => {
          setSettings(newSettings);
          if (requiresReset) {
            initGamePool(newSettings.mode);
          }
        }}
      />

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        drawnBalls={drawnBalls}
        mode={settings.mode}
        theme={settings.theme}
        onClose={() => setIsHistoryOpen(false)}
      />

      {/* Admin Panel Modal (Gestión de Usuarios) */}
      <AdminPanelModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
      />

      {/* Login Modal */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        onOpenAdmin={handleOpenAdminPanel}
        onAccessDeniedNotice={(msg) => setAccessDeniedMessage(msg)}
      />

      {/* Access Denied Dialog if an Operator tries to access Admin Panel */}
      {accessDeniedMessage && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none">
          <div className="w-full max-w-sm rounded-3xl border-2 border-rose-300 bg-[#fffaf5] p-5 text-center flex flex-col items-center gap-3 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="font-black text-base text-rose-950">Acceso Restringido</h3>
            <p className="text-xs text-rose-900/80 leading-relaxed font-semibold">
              {accessDeniedMessage}
            </p>
            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={() => setAccessDeniedMessage(null)}
                className="flex-1 py-2 rounded-xl text-xs font-black bg-orange-500 hover:bg-orange-600 text-white shadow transition-all cursor-pointer"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div
            className="w-full max-w-sm rounded-3xl border shadow-2xl p-5 text-center flex flex-col items-center gap-3"
            style={{
              backgroundColor: 'var(--surface-card)',
              borderColor: 'var(--surface-border)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 mb-1">
              <RotateCcw className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base">¿Reiniciar partida?</h3>
            <p className="text-xs opacity-70">
              Se restablecerá el bombo con todas las bolas y se borrará el historial de {drawnBalls.length} bolas extraídas.
            </p>
            <div className="flex items-center gap-2.5 w-full mt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold border hover:bg-white/5 transition-colors"
                style={{ borderColor: 'var(--surface-border)' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmReset}
                className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow transition-all active:scale-95"
              >
                Sí, Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bingo Celebration Modal when a row is completed */}
      {bingoCelebration && (
        <BingoCelebrationModal
          isOpen={!!bingoCelebration}
          rowLeader={bingoCelebration.rowLeader}
          rowNumbers={bingoCelebration.rowNumbers}
          mode={bingoCelebration.mode}
          drawnBall={bingoCelebration.drawnBall}
          playerName={bingoCelebration.playerName}
          isTriple90={bingoCelebration.mode === '90'}
          onClose={() => setBingoCelebration(null)}
          onReplayFanfare={handleReplayFanfare}
        />
      )}

      {/* Saved Games Gallery Modal */}
      <SavedGamesGalleryModal
        isOpen={showSavedGamesGallery}
        savedGames={savedGamesList}
        onClose={() => setShowSavedGamesGallery(false)}
        onRefreshGallery={refreshSavedGamesList}
        currentUser={currentUser}
        isAdmin={isAdmin}
      />

      {/* Game Snapshot Viewer Modal */}
      <GameSheetSnapshotModal
        isOpen={!!selectedSnapshotModalItem}
        onClose={() => setSelectedSnapshotModalItem(null)}
        item={selectedSnapshotModalItem}
      />

      {/* New Game & Archive Confirmation Modal */}
      <NewGameModal
        isOpen={showNewGameModal}
        onClose={() => setShowNewGameModal(false)}
        onConfirm={handleConfirmArchiveAndNewGame}
        onConfirmArchiveAndNewGame={handleConfirmArchiveAndNewGame}
        currentRound={currentMatchRound}
        currentDuration={formatGameDuration(matchElapsedSeconds)}
        durationFormatted={formatGameDuration(matchElapsedSeconds)}
        ballsDrawnCount={drawnBalls.length}
        financials={currentGameFinancials}
        winningBall={lastWinningBall ?? (currentBall ? currentBall.number : null)}
        sheetType={activeSheetType}
        currency={settings.currencySymbol || '$'}
        operatorName={currentUser?.name || 'Operadora'}
      />
    </div>
  );
}
