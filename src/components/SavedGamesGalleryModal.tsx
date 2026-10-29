import React, { useState, useMemo } from 'react';
import { GameSequenceItem, AppUser } from '../types';
import { getBingo75Letter, getBallBadgeColor } from '../utils/ballColors';
import {
  X,
  Trophy,
  Calendar,
  Clock,
  Printer,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Table2,
  ListOrdered,
  Eye,
  Search,
  Layers,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  Folder,
  FolderOpen,
  FileDown,
  Camera,
  CalendarDays,
  UserCheck,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import {
  clearAllSavedGamesGallery,
  deleteGamePermanently,
  isGameOfOperator,
  getGameNormalizedDateKey,
  getGameLines,
  deleteGamesOfDay,
  deleteGamesOfOperatorFolder,
  getCurrentLocalDateKey,
  reorganizeAndHealAllStoredGames,
} from '../utils/savedGamesStorage';
import {
  exportElementAsJpg,
  exportElementAsPdf,
  downloadGameDirectJpg,
  downloadGameDirectPdf,
} from '../utils/exportGameReport';

interface SavedGamesGalleryModalProps {
  isOpen: boolean;
  savedGames: GameSequenceItem[];
  onClose: () => void;
  onRefreshGallery?: () => void;
  currentUser?: AppUser | null;
  isAdmin?: boolean;
}

export const SavedGamesGalleryModal: React.FC<SavedGamesGalleryModalProps> = ({
  isOpen,
  savedGames,
  onClose,
  onRefreshGallery,
  currentUser,
  isAdmin = false,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | '75' | '90'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGame, setSelectedGame] = useState<GameSequenceItem | null>(null);
  const [activeTab, setActiveTab] = useState<'sheet' | 'balls' | 'cage'>('sheet');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(true);
  const [table90View, setTable90View] = useState<'both' | '1' | '2'>('both');

  // Folders by Operator & Subfolders by Day (Día / Fecha) state
  const [viewMode, setViewMode] = useState<'folders' | 'all'>('folders');
  const [selectedFolderOperator, setSelectedFolderOperator] = useState<string | null>(() => {
    if (!isAdmin && currentUser) {
      return (currentUser.name || 'Operadora Principal').trim();
    }
    return null;
  });
  const [selectedFolderDay, setSelectedFolderDay] = useState<string | null>(null);

  // Automatically lock non-admin operator to their individual folder
  React.useEffect(() => {
    if (!isAdmin && currentUser) {
      setSelectedFolderOperator((currentUser.name || 'Operadora Principal').trim());
    }
  }, [isAdmin, currentUser]);

  // Reorganization & Auto-healing state
  const [isReorganizing, setIsReorganizing] = useState<boolean>(false);
  const [reorganizeFeedback, setReorganizeFeedback] = useState<{
    count: number;
    total: number;
    message: string;
  } | null>(null);

  // Auto-audit on modal open to ensure all subfolders are strictly sorted by exact dates
  React.useEffect(() => {
    if (isOpen) {
      reorganizeAndHealAllStoredGames().then((res) => {
        if (res.reorganizedCount > 0) {
          console.log(`[GALLERY_OPEN] Auto-reorganized ${res.reorganizedCount} games into exact date subfolders.`);
          onRefreshGallery?.();
        }
      }).catch((e) => {
        console.warn('Auto-reorganize check on gallery open skipped:', e);
      });
    }
  }, [isOpen]);

  const handleManualReorganize = async () => {
    if (isReorganizing) return;
    setIsReorganizing(true);
    try {
      const res = await reorganizeAndHealAllStoredGames();
      setReorganizeFeedback({
        count: res.reorganizedCount,
        total: res.totalChecked,
        message:
          res.reorganizedCount > 0
            ? `Se reorganizaron ${res.reorganizedCount} partida(s) a su subcarpeta de fecha exacta (${res.totalChecked} partidas verificadas).`
            : `Todas las subcarpetas (${res.totalChecked} partidas) corresponden exactamente a sus fechas.`,
      });
      onRefreshGallery?.();
      setTimeout(() => setReorganizeFeedback(null), 5000);
    } catch (e) {
      console.error('Error reorganizing subfolders:', e);
    } finally {
      setIsReorganizing(false);
    }
  };

  // In-app deletion modals state
  const [itemToDelete, setItemToDelete] = useState<GameSequenceItem | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [dayToDelete, setDayToDelete] = useState<string | null>(null);

  const handleOpenGameDetail = (game: GameSequenceItem) => {
    setSelectedGame(game);
    setIsFullScreen(true);
    setActiveTab('sheet');
  };

  const handleCloseDetail = () => {
    setSelectedGame(null);
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let list = [...savedGames];

    // Non-admin operators ONLY see their own matches! Everything is strictly individual.
    if (!isAdmin && currentUser) {
      list = list.filter((g) => isGameOfOperator(g, currentUser));
    }

    if (filterMode === '75') {
      list = list.filter((g) => g.mode === '75' || g.sheetType === 'multipliers-15');
    } else if (filterMode === '90') {
      list = list.filter((g) => g.mode === '90' || g.sheetType === 'traditional-90');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) => {
        const roundMatch = String(g.round).includes(q);
        const playerMatch = g.winningPlayerName?.toLowerCase().includes(q);
        const ballMatch = String(g.ballNumber).includes(q);
        const dateMatch = g.dateFormatted?.toLowerCase().includes(q);
        const opMatch = g.operatorName?.toLowerCase().includes(q);
        return roundMatch || playerMatch || ballMatch || dateMatch || opMatch;
      });
    }

    list.sort((a, b) => {
      if (sortOrder === 'desc') {
        return (b.round || 0) - (a.round || 0);
      } else {
        return (a.round || 0) - (b.round || 0);
      }
    });

    return list;
  }, [savedGames, filterMode, sortOrder, searchQuery, isAdmin, currentUser]);

  // Group items by operator for folder view with role-based restriction & exact line counts (NO INVENTED NUMBERS)
  const operatorFolders = useMemo(() => {
    const groups: Record<
      string,
      {
        operatorName: string;
        operatorUid: string;
        games: GameSequenceItem[];
        totalLines: number;
        totalCollected: number;
        totalPrizes: number;
        lastDate?: string;
      }
    > = {};

    filteredItems.forEach((game) => {
      const opName = (game.operatorName || 'Operadora Principal').trim();
      if (!groups[opName]) {
        groups[opName] = {
          operatorName: opName,
          operatorUid: game.operatorUid || 'anon',
          games: [],
          totalLines: 0,
          totalCollected: 0,
          totalPrizes: 0,
          lastDate: game.dateFormatted || game.dailyDate,
        };
      }
      groups[opName].games.push(game);
      // Exact lines played: suma del valor/multiplicador de cada columna (ej: 4 columnas X2 = 8 líneas)
      const lines = getGameLines(game);
      groups[opName].totalLines += lines;
      groups[opName].totalCollected = Math.round((groups[opName].totalCollected + (game.totalCollected || 0)) * 100) / 100;
      groups[opName].totalPrizes = Math.round((groups[opName].totalPrizes + (game.totalPrizesPaid || 0)) * 100) / 100;
    });

    let list = Object.values(groups);

    // Operator visibility constraint:
    // If user is NOT an administrator, they must ONLY see their own operator folder!
    if (!isAdmin && currentUser) {
      const myOpName = (currentUser.name || 'Operadora Principal').trim().toLowerCase();
      const myOpUid = currentUser.id || currentUser.uid;

      list = list.filter(
        (f) =>
          f.operatorName.trim().toLowerCase() === myOpName ||
          (myOpUid && f.operatorUid === myOpUid)
      );

      // If the operator hasn't saved games yet or emptied sheet, still ensure their folder is displayed!
      if (list.length === 0) {
        list = [
          {
            operatorName: (currentUser.name || 'Operadora Principal').trim(),
            operatorUid: myOpUid || 'anon',
            games: [],
            totalLines: 0,
            totalCollected: 0,
            totalPrizes: 0,
            lastDate: 'Hoy',
          },
        ];
      }
    }

    return list.sort((a, b) => b.games.length - a.games.length);
  }, [filteredItems, isAdmin, currentUser]);

  // Subfolders by Day (Día / Fecha) when inside an operator's folder
  const operatorDaysList = useMemo(() => {
    if (!selectedFolderOperator) return [];

    const targetOpName = selectedFolderOperator.trim().toLowerCase();
    const folderGames = filteredItems.filter(
      (g) => (g.operatorName || 'Operadora Principal').trim().toLowerCase() === targetOpName
    );

    // Group games by exact normalized dateKey (YYYY-MM-DD) - STRICT ISOLATION PER DAY
    const dayMap: Record<
      string,
      {
        dateKey: string;
        displayDate: string;
        fullDate: string;
        formattedDate: string;
        games: GameSequenceItem[];
        totalLines: number;
        totalCollected: number;
        totalPrizes: number;
        netProfit: number;
      }
    > = {};

    folderGames.forEach((g) => {
      const dateKey = getGameNormalizedDateKey(g);

      if (!dayMap[dateKey]) {
        const todayKey = getCurrentLocalDateKey();
        const yesterdayObj = new Date();
        yesterdayObj.setDate(yesterdayObj.getDate() - 1);
        const yesterdayKey = `${yesterdayObj.getFullYear()}-${String(yesterdayObj.getMonth() + 1).padStart(2, '0')}-${String(yesterdayObj.getDate()).padStart(2, '0')}`;

        let prefix = '';
        if (dateKey === todayKey) prefix = 'Hoy - ';
        else if (dateKey === yesterdayKey) prefix = 'Ayer - ';

        let display = dateKey;
        let fullDate = dateKey;
        try {
          const [y, m, d] = dateKey.split('-').map(Number);
          if (y && m && d) {
            const dateObj = new Date(y, m - 1, d);
            const weekday = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
            const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
            const formatted = dateObj.toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            });
            fullDate = `${capitalizedWeekday}, ${formatted}`;
            display = dateObj.toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
          }
        } catch (err) {
          console.warn('Error formatting date key:', err);
        }

        dayMap[dateKey] = {
          dateKey,
          displayDate: `${prefix}${display}`,
          fullDate,
          formattedDate: g.dateFormatted || display,
          games: [],
          totalLines: 0,
          totalCollected: 0,
          totalPrizes: 0,
          netProfit: 0,
        };
      }

      dayMap[dateKey].games.push(g);
      const lines = getGameLines(g);
      dayMap[dateKey].totalLines += lines;
      dayMap[dateKey].totalCollected = Math.round((dayMap[dateKey].totalCollected + (g.totalCollected || 0)) * 100) / 100;
      dayMap[dateKey].totalPrizes = Math.round((dayMap[dateKey].totalPrizes + (g.totalPrizesPaid || 0)) * 100) / 100;
      dayMap[dateKey].netProfit = Math.round((dayMap[dateKey].totalCollected - dayMap[dateKey].totalPrizes) * 100) / 100;
    });

    // If no games exist yet for this operator, provide today's empty folder so it's ready
    if (Object.keys(dayMap).length === 0) {
      const todayKey = getCurrentLocalDateKey();
      const todayObj = new Date();
      const weekday = todayObj.toLocaleDateString('es-ES', { weekday: 'long' });
      const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      const formatted = todayObj.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const todayDisplay = todayObj.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      dayMap[todayKey] = {
        dateKey: todayKey,
        displayDate: `Hoy - ${todayDisplay}`,
        fullDate: `${capitalizedWeekday}, ${formatted}`,
        formattedDate: new Date().toLocaleDateString('es-ES'),
        games: [],
        totalLines: 0,
        totalCollected: 0,
        totalPrizes: 0,
        netProfit: 0,
      };
    }

    return Object.values(dayMap).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [selectedFolderOperator, filteredItems]);

  // Actual display list based on folder and day subfolder selection (STRICT ISOLATION)
  const displayItems = useMemo(() => {
    let list = filteredItems;

    if (viewMode === 'folders' && selectedFolderOperator) {
      const targetOpName = selectedFolderOperator.trim().toLowerCase();
      list = list.filter(
        (g) => (g.operatorName || 'Operadora Principal').trim().toLowerCase() === targetOpName
      );

      if (selectedFolderDay && selectedFolderDay !== 'all') {
        list = list.filter((g) => getGameNormalizedDateKey(g) === selectedFolderDay);
      }
    } else if (!isAdmin && currentUser) {
      const currentOpName = (currentUser.name || 'Operadora Principal').trim().toLowerCase();
      list = list.filter(
        (g) => (g.operatorName || 'Operadora Principal').trim().toLowerCase() === currentOpName
      );
    }

    return list;
  }, [filteredItems, viewMode, selectedFolderOperator, selectedFolderDay, isAdmin, currentUser]);

  // Day deletion handlers (ONLY ADMIN)
  const handleRequestDeleteDay = (dateKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAdmin) return;
    setDayToDelete(dateKey);
  };

  const handleConfirmDeleteDay = async () => {
    if (!isAdmin || !dayToDelete || !selectedFolderOperator) return;
    const targetDay = dayToDelete;
    const targetOp = selectedFolderOperator;
    setDayToDelete(null);

    await deleteGamesOfDay(targetOp, targetDay);

    if (selectedFolderDay === targetDay) {
      setSelectedFolderDay(null);
    }
    onRefreshGallery?.();
  };

  // Export handlers
  const handleExportCurrentJpg = async () => {
    if (!selectedGame) return;
    const target = document.getElementById('gallery-sheet-export-target');
    if (target) {
      await exportElementAsJpg(
        target,
        `Partida_${selectedGame.round}_${selectedGame.operatorName || 'Operadora'}_${selectedGame.dailyDate || 'fecha'}.jpg`
      );
    } else {
      await downloadGameDirectJpg(selectedGame);
    }
  };

  const handleExportCurrentPdf = async () => {
    if (!selectedGame) return;
    const target = document.getElementById('gallery-sheet-export-target');
    if (target) {
      await exportElementAsPdf(
        target,
        `Partida_${selectedGame.round}_${selectedGame.operatorName || 'Operadora'}_${selectedGame.dailyDate || 'fecha'}.pdf`,
        {
          round: selectedGame.round,
          operator: selectedGame.operatorName || 'Operadora',
          date: selectedGame.dateFormatted || selectedGame.dailyDate,
        }
      );
    } else {
      await downloadGameDirectPdf(selectedGame);
    }
  };

  const handleRequestDeleteFolder = (folderName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;
    setFolderToDelete(folderName);
  };

  const handleConfirmDeleteFolder = async () => {
    if (!isAdmin || !folderToDelete) return;
    const targetFolder = folderToDelete;
    setFolderToDelete(null);

    await deleteGamesOfOperatorFolder(targetFolder);

    if (selectedFolderOperator === targetFolder) {
      setSelectedFolderOperator(null);
    }
    onRefreshGallery?.();
  };

  if (!isOpen) return null;

  // Selected game navigation in gallery
  const selectedIndex = selectedGame
    ? filteredItems.findIndex((g) => (g.id && g.id === selectedGame.id) || (g.round === selectedGame.round && g.timestamp === selectedGame.timestamp))
    : -1;

  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < filteredItems.length - 1;

  const handlePrevGame = () => {
    if (hasPrev) {
      setSelectedGame(filteredItems[selectedIndex - 1]);
    }
  };

  const handleNextGame = () => {
    if (hasNext) {
      setSelectedGame(filteredItems[selectedIndex + 1]);
    }
  };

  const handleRequestDeleteItem = (game: GameSequenceItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!isAdmin) return;
    setItemToDelete(game);
  };

  const handleConfirmDeleteItem = async () => {
    if (!isAdmin || !itemToDelete) return;
    const target = itemToDelete;
    setItemToDelete(null);

    await deleteGamePermanently(target);

    if (
      selectedGame &&
      ((selectedGame.id && selectedGame.id === target.id) ||
        (selectedGame.round === target.round && selectedGame.timestamp === target.timestamp))
    ) {
      setSelectedGame(null);
    }
    onRefreshGallery?.();
  };

  const handleClearAll = async () => {
    if (!isAdmin) return;
    setShowClearConfirm(false);
    await clearAllSavedGamesGallery();
    setSelectedGame(null);
    onRefreshGallery?.();
  };

  return (
    <div
      className={`fixed inset-0 z-[99999] bg-black/85 backdrop-blur-xs flex flex-col ${
        selectedGame && isFullScreen
          ? 'p-0 overflow-hidden'
          : 'items-center justify-center p-2 sm:p-4 overflow-y-auto'
      } animate-fade-in text-slate-900`}
    >
      <div
        className={`bg-[#fffaf5] flex flex-col overflow-hidden transition-all duration-200 ${
          selectedGame && isFullScreen
            ? 'w-full h-full max-w-none max-h-none rounded-none shadow-none'
            : 'border-2 border-orange-400 rounded-3xl max-w-6xl w-full max-h-[92vh] shadow-2xl animate-scale-up'
        }`}
      >
        {/* Header: Gallery Title OR Detailed Inspector Top Bar */}
        {!selectedGame ? (
          <div className="px-4 sm:px-6 py-3.5 bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white flex items-center justify-between gap-3 shadow-md flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 backdrop-blur-xs flex items-center justify-center shadow-xs">
                <Layers className="w-5 h-5 text-yellow-200" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-black tracking-wide leading-tight">
                    Galería de Partidas Guardadas
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-white/25 text-white text-xs font-black border border-white/30">
                    {savedGames.length} {savedGames.length === 1 ? 'partida' : 'partidas'}
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-orange-100 font-medium">
                  Historial completo archivado con planillas, bolas cantadas y balances
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleManualReorganize}
                disabled={isReorganizing}
                className="px-2.5 py-1 rounded-xl bg-amber-500/80 hover:bg-amber-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-amber-300/40 shadow-xs disabled:opacity-50"
                title="Auditar y reorganizar todas las partidas en sus subcarpetas por fecha exacta"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReorganizing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">
                  {isReorganizing ? 'Reorganizando...' : 'Reorganizar Subcarpetas'}
                </span>
              </button>

              {isAdmin && savedGames.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="px-2.5 py-1 rounded-xl bg-rose-700/80 hover:bg-rose-700 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-rose-400/40"
                  title="Vaciar todo el historial de partidas guardadas"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Vaciar Galería</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                title="Cerrar galería"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          /* INSPECTOR FULLSCREEN / EXTENDED HEADER */
          <div className="px-3 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-amber-700 via-orange-600 to-amber-700 text-white flex items-center justify-between gap-2 sm:gap-4 shadow-md flex-shrink-0">
            {/* Left: Volver a la Galería + Round info */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={handleCloseDetail}
                className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer border border-white/30 active:scale-95 shadow-xs whitespace-nowrap"
                title="Salir de la vista de planilla y regresar a la galería normal"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Volver a la Galería</span>
                <span className="sm:hidden">Volver</span>
              </button>

              <div className="h-6 w-px bg-white/30 hidden sm:block" />

              <div className="flex items-center gap-2 min-w-0">
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-950/80 text-yellow-300 font-black text-xs sm:text-sm border border-yellow-400/30 shadow-2xs">
                  Ronda #{selectedGame.round}
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 rounded-md text-xs font-bold bg-white/20 text-white border border-white/25">
                  {selectedGame.mode === '90' || selectedGame.sheetType === 'traditional-90'
                    ? 'Bingo 90 Tradicional'
                    : 'Bingo 75 Multiplicadores'}
                </span>
                <span className="text-[11px] text-orange-100 hidden lg:inline truncate font-mono">
                  📅 {selectedGame.dailyDate} • ⏰ {selectedGame.timestamp} ({selectedGame.durationFormatted || '0m 30s'})
                </span>
              </div>
            </div>

            {/* Right: Navigator + Print + Fullscreen toggle + Close */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              {/* Prev / Next controls */}
              <div className="flex items-center bg-black/20 rounded-xl p-0.5 border border-white/20">
                <button
                  type="button"
                  onClick={handlePrevGame}
                  disabled={!hasPrev}
                  className={`p-1 sm:px-2.5 sm:py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                    hasPrev ? 'hover:bg-white/20 text-white cursor-pointer' : 'text-white/40 cursor-not-allowed'
                  }`}
                  title="Partida anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden md:inline">Anterior</span>
                </button>
                <span className="px-2 text-[11px] font-mono text-white/90 font-black hidden sm:inline">
                  {selectedIndex + 1}/{filteredItems.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextGame}
                  disabled={!hasNext}
                  className={`p-1 sm:px-2.5 sm:py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition-all ${
                    hasNext ? 'hover:bg-white/20 text-white cursor-pointer' : 'text-white/40 cursor-not-allowed'
                  }`}
                  title="Siguiente partida"
                >
                  <span className="hidden md:inline">Siguiente</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleExportCurrentJpg}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors border border-white/20 shadow-2xs"
                title="Descargar esta planilla como imagen JPG"
              >
                <FileDown className="w-3.5 h-3.5 text-yellow-200" />
                <span className="hidden sm:inline">JPG</span>
              </button>

              <button
                type="button"
                onClick={handleExportCurrentPdf}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors border border-white/20 shadow-2xs"
                title="Descargar esta planilla como documento PDF"
              >
                <Printer className="w-3.5 h-3.5 text-amber-200" />
                <span className="hidden sm:inline">PDF</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors border border-white/20 shadow-2xs"
                title="Imprimir esta partida y su planilla"
              >
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Imprimir</span>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedGame) setItemToDelete(selectedGame);
                  }}
                  className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors border border-rose-400/40 shadow-2xs"
                  title="Eliminar esta partida permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Borrar</span>
                </button>
              )}

              {/* Toggle Fullscreen / Windowed */}
              <button
                type="button"
                onClick={() => setIsFullScreen((prev) => !prev)}
                className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors border border-white/20 shadow-2xs"
                title={isFullScreen ? 'Reducir a tamaño de ventana' : 'Extender a toda la pantalla'}
              >
                {isFullScreen ? (
                  <>
                    <Minimize2 className="w-4 h-4 text-yellow-200" />
                    <span className="hidden xl:inline">Ventana</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4 text-yellow-200" />
                    <span className="hidden xl:inline">Pantalla Completa</span>
                  </>
                )}
              </button>

              <button
                onClick={handleCloseDetail}
                className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer border border-white/20"
                title="Cerrar planilla y volver a la galería"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Clear All Confirmation banner */}
        {isAdmin && showClearConfirm && (
          <div className="bg-rose-100 border-b border-rose-300 px-4 py-2.5 flex items-center justify-between text-xs text-rose-950 animate-fade-in flex-shrink-0">
            <span className="font-bold">
              ¿Estás seguro de que deseas eliminar permanentemente todas las partidas guardadas?
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearAll}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-black"
              >
                Sí, vaciar
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {reorganizeFeedback && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between gap-2 shadow-sm animate-fade-in border-b border-emerald-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>{reorganizeFeedback.message}</span>
            </div>
            <button
              onClick={() => setReorganizeFeedback(null)}
              className="text-emerald-100 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top Filters & Controls Bar (Only when browsing the gallery grid) */}
        {!selectedGame && (
          <div className="px-4 sm:px-6 py-2.5 bg-orange-100/60 border-b border-orange-200 flex items-center justify-between flex-wrap gap-2 flex-shrink-0">
            {/* View Mode & Mode Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Folder vs List View Toggle */}
              <div className="flex items-center gap-1 bg-white/90 p-0.5 rounded-xl border border-orange-300 shadow-2xs">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('folders');
                    setSelectedFolderOperator(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'folders' && selectedFolderOperator === null
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-orange-100'
                  }`}
                  title="Ver partidas agrupadas en carpetas por operadora"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>Carpetas por Operadora ({operatorFolders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('all');
                    setSelectedFolderOperator(null);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                    viewMode === 'all'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-orange-100'
                  }`}
                  title="Ver listado general de todas las partidas"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Todas ({filteredItems.length})</span>
                </button>
              </div>

              {/* Mode Filters */}
              <div className="flex items-center gap-1 bg-white/80 p-0.5 rounded-xl border border-orange-300 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setFilterMode('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterMode === 'all'
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-orange-100'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('75')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterMode === '75'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-emerald-50'
                  }`}
                >
                  Bingo 75
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode('90')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filterMode === '90'
                      ? 'bg-orange-600 text-white shadow-xs'
                      : 'text-slate-700 hover:bg-orange-50'
                  }`}
                >
                  Bingo 90
                </button>
              </div>
            </div>

            {/* Search Input & Sort Order Toggle */}
            <div className="flex items-center gap-2 flex-1 max-w-sm justify-end">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar ronda, operadora, jugador..."
                  className="w-full pl-8 pr-2.5 py-1 text-xs rounded-xl border border-orange-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-orange-400 font-medium"
                />
              </div>

              <button
                type="button"
                onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                className="px-2.5 py-1 rounded-xl border border-orange-300 bg-white hover:bg-orange-50 text-xs font-bold text-slate-800 flex items-center gap-1 shadow-2xs cursor-pointer whitespace-nowrap"
                title={sortOrder === 'desc' ? 'Ordenar: Más recientes primero' : 'Ordenar: Ronda 1 a la última'}
              >
                <ArrowUpDown className="w-3.5 h-3.5 text-orange-600" />
                <span className="hidden sm:inline">
                  {sortOrder === 'desc' ? 'Recientes' : 'Ronda 1-N'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Content Body: Gallery Grid OR Detailed Game Inspector */}
        <div
          className={
            selectedGame
              ? 'flex-1 min-h-0 flex flex-col p-2 sm:p-2.5 bg-[#fffaf5] overflow-hidden'
              : 'flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50'
          }
        >
          {!selectedGame ? (
            viewMode === 'folders' && selectedFolderOperator === null ? (
              /* FOLDERS GRID VIEW (CARPETAS SEGÚN LA OPERADORA) */
              operatorFolders.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center mx-auto mb-3 text-orange-500 shadow-inner">
                    <Folder className="w-8 h-8 opacity-70" />
                  </div>
                  <h4 className="text-base font-black text-slate-800">No hay carpetas de operadoras creadas aún</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                    Cada operadora que guarde una partida tendrá su propia carpeta organizada aquí automáticamente para que el administrador mantenga control total.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-orange-950 flex items-center gap-2">
                        <Folder className="w-4 h-4 text-amber-600" />
                        <span>Carpetas de Operadoras ({operatorFolders.length})</span>
                      </h4>
                      <p className="text-xs text-orange-900/60 font-medium">
                        Selecciona una carpeta para ver únicamente las partidas archivadas por esa operadora
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {operatorFolders.map((folder) => (
                      <div
                        key={folder.operatorName}
                        onClick={() => setSelectedFolderOperator(folder.operatorName)}
                        className="bg-white border-2 border-amber-200 hover:border-orange-500 rounded-3xl p-5 shadow-sm hover:shadow-lg transition-all cursor-pointer relative group flex flex-col justify-between overflow-hidden"
                      >
                        <div>
                          <div className="flex items-center justify-between border-b border-orange-100 pb-3 mb-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shadow-md border border-white/40 flex-shrink-0 group-hover:scale-105 transition-transform">
                                <Folder className="w-6 h-6 text-yellow-100 fill-yellow-100/30" />
                              </div>
                              <div className="min-w-0">
                                <span className="text-[10px] font-black uppercase tracking-wider text-orange-700 bg-orange-100 px-2 py-0.2 rounded-md">
                                  Carpeta de Operadora
                                </span>
                                <h4 className="text-base font-black text-orange-950 truncate mt-1">
                                  {folder.operatorName}
                                </h4>
                                <p className="text-[11px] text-orange-900/60 font-medium truncate">
                                  Última actividad: {folder.lastDate || 'Reciente'}
                                </p>
                              </div>
                            </div>

                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => handleRequestDeleteFolder(folder.operatorName, e)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                title={`Eliminar todas las partidas de la carpeta "${folder.operatorName}"`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Folder Metrics */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className="bg-orange-50/80 rounded-xl p-2.5 border border-orange-200 text-center">
                              <span className="text-[10px] font-bold text-orange-900/70 block uppercase">Partidas</span>
                              <span className="text-xl font-black text-orange-950 font-mono">
                                {folder.games.length}
                              </span>
                            </div>
                            <div className="bg-purple-50/80 rounded-xl p-2.5 border border-purple-200 text-center">
                              <span className="text-[10px] font-bold text-purple-900/70 block uppercase">Líneas Jugadas</span>
                              <span className="text-xl font-black text-purple-950 font-mono">
                                {folder.totalLines}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 flex items-center justify-between text-xs text-slate-700 font-semibold">
                            <span>Recaudado: <strong className="text-emerald-700 font-mono">${folder.totalCollected.toFixed(2)}</strong></span>
                            <span>Premios: <strong className="text-rose-700 font-mono">${folder.totalPrizes.toFixed(2)}</strong></span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="w-full mt-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all group-hover:shadow-md cursor-pointer"
                        >
                          <FolderOpen className="w-4 h-4 text-yellow-200" />
                          <span>Abrir Carpeta ({folder.games.length} partidas)</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : viewMode === 'folders' && selectedFolderOperator && selectedFolderDay === null ? (
              /* SUBFOLDERS BY DAY (SUB-CARPETAS POR DÍA) FOR THE SELECTED OPERATOR */
              <div className="space-y-4">
                {/* Breadcrumb Header */}
                <div className="flex items-center justify-between bg-orange-100/90 border border-orange-300 p-2.5 rounded-2xl shadow-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFolderOperator(null);
                          setSelectedFolderDay(null);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white border border-orange-300 text-xs font-black text-orange-950 flex items-center gap-1.5 hover:bg-orange-50 cursor-pointer shadow-2xs active:scale-95"
                      >
                        <ChevronLeft className="w-4 h-4 text-orange-600" />
                        <span>Volver a Carpetas</span>
                      </button>
                    ) : (
                      <div className="px-3 py-1.5 rounded-xl bg-white/80 border border-orange-200 text-xs font-bold text-orange-900 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Mi Carpeta Exclusiva</span>
                      </div>
                    )}
                    <div className="h-5 w-px bg-orange-300 hidden sm:block" />
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-black text-orange-950">
                        Operadora: <strong className="text-orange-700">{selectedFolderOperator}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-orange-200 text-orange-900 text-[10px] font-black border border-orange-300">
                        {operatorDaysList.length} {operatorDaysList.length === 1 ? 'día registrado' : 'días registrados'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Option to view all games of this operator without day filter */}
                    <button
                      type="button"
                      onClick={() => setSelectedFolderDay('all')}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                      title="Ver todas las partidas archivadas de esta operadora juntas"
                    >
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      <span>Ver Todas ({filteredItems.filter((g) => (g.operatorName || 'Operadora Principal').trim().toLowerCase() === selectedFolderOperator.trim().toLowerCase()).length})</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={(e) => handleRequestDeleteFolder(selectedFolderOperator, e)}
                        className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        title="Eliminar todas las partidas de esta operadora"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span className="hidden sm:inline">Vaciar</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Subfolders Grid by Day */}
                {operatorDaysList.length === 0 ? (
                  <div className="py-12 text-center bg-white rounded-3xl border border-orange-200 p-6">
                    <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-2 text-orange-600">
                      <CalendarDays className="w-7 h-7" />
                    </div>
                    <h5 className="font-black text-slate-800 text-sm">No hay subcarpetas por día aún para {selectedFolderOperator}</h5>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Al guardar o finalizar partidas, cada partida se agrupará automáticamente en su subcarpeta correspondiente por día con su fecha y líneas jugadas.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {operatorDaysList.map((dayFolder) => {
                      const isToday = dayFolder.dateKey === getCurrentLocalDateKey();
                      return (
                        <div
                          key={dayFolder.dateKey}
                          onClick={() => setSelectedFolderDay(dayFolder.dateKey)}
                          className={`bg-white border-2 ${isToday ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-200 hover:border-orange-500'} rounded-3xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer relative group flex flex-col justify-between overflow-hidden`}
                        >
                          <div>
                            {/* Day Header */}
                            <div className="flex items-start justify-between gap-2 border-b border-orange-100 pb-2.5 mb-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-10 h-10 rounded-2xl ${isToday ? 'bg-gradient-to-br from-amber-500 to-orange-600' : 'bg-gradient-to-br from-slate-600 to-slate-800'} text-white flex items-center justify-center shadow-md flex-shrink-0`}>
                                  <CalendarDays className="w-5 h-5 text-white" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${isToday ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700'}`}>
                                      {isToday ? '📅 Hoy' : '📁 Día'}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-bold font-mono">
                                      {dayFolder.dateKey}
                                    </span>
                                  </div>
                                  <h5 className="text-sm font-black text-slate-900 truncate mt-0.5">
                                    {dayFolder.displayDate}
                                  </h5>
                                  <p className="text-[10.5px] text-slate-500 font-medium">
                                    {dayFolder.games.length} {dayFolder.games.length === 1 ? 'partida registrada' : 'partidas registradas'}
                                  </p>
                                </div>
                              </div>

                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={(e) => handleRequestDeleteDay(dayFolder.dateKey, e)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                                  title={`Eliminar únicamente las partidas del día ${dayFolder.dateKey}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            {/* Day Metrics */}
                            <div className="grid grid-cols-2 gap-2 mb-2.5">
                              <div className="bg-orange-50 rounded-xl p-2 border border-orange-200 text-center">
                                <span className="text-[9px] font-bold text-orange-800 uppercase block">Partidas</span>
                                <span className="text-lg font-black text-orange-950 font-mono">
                                  {dayFolder.games.length}
                                </span>
                              </div>
                              <div className="bg-purple-50 rounded-xl p-2 border border-purple-200 text-center">
                                <span className="text-[9px] font-bold text-purple-800 uppercase block">Líneas Jugadas</span>
                                <span className="text-lg font-black text-purple-950 font-mono">
                                  {dayFolder.totalLines}
                                </span>
                              </div>
                            </div>

                            <div className="bg-slate-50 rounded-xl p-2 border border-slate-200 flex items-center justify-between text-xs text-slate-700 font-bold">
                              <span>Recaudado: <strong className="text-emerald-700 font-mono">${dayFolder.totalCollected.toFixed(2)}</strong></span>
                              <span>Premios: <strong className="text-rose-700 font-mono">${dayFolder.totalPrizes.toFixed(2)}</strong></span>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="w-full mt-3 py-2 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-all"
                          >
                            <FolderOpen className="w-3.5 h-3.5 text-yellow-200" />
                            <span>Abrir Día ({dayFolder.games.length} partidas)</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* GAMES LIST VIEW (Inside a Day Subfolder or All Partidas) */
              <div>
                {/* Folder & Day Breadcrumbs */}
                {viewMode === 'folders' && selectedFolderOperator && (
                  <div className="flex items-center justify-between bg-orange-100/90 border border-orange-300 p-2.5 rounded-2xl mb-3 shadow-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedFolderDay(null)}
                        className="px-3 py-1.5 rounded-xl bg-white border border-orange-300 text-xs font-black text-orange-950 flex items-center gap-1.5 hover:bg-orange-50 cursor-pointer shadow-2xs active:scale-95"
                      >
                        <ChevronLeft className="w-4 h-4 text-orange-600" />
                        <span>Volver a Subcarpetas de Días</span>
                      </button>
                      <div className="h-5 w-px bg-orange-300 hidden sm:block" />
                      <div className="flex items-center gap-1.5 text-xs font-black text-orange-950">
                        <FolderOpen className="w-4 h-4 text-amber-600" />
                        <span>{selectedFolderOperator}</span>
                        <span className="text-orange-400">/</span>
                        <span className="text-orange-700">
                          {selectedFolderDay === 'all'
                            ? 'Todas las partidas'
                            : operatorDaysList.find((d) => d.dateKey === selectedFolderDay)?.displayDate || `Día ${selectedFolderDay}`}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-orange-200 text-orange-900 text-[10px] font-black border border-orange-300">
                          {displayItems.length} {displayItems.length === 1 ? 'partida' : 'partidas'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-orange-50 text-orange-900 border border-orange-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                        title="Imprimir resumen y planilla de las partidas de este día"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-600" />
                        <span className="hidden sm:inline">Imprimir Día</span>
                      </button>

                      {isAdmin && (
                        selectedFolderDay && selectedFolderDay !== 'all' ? (
                          <button
                            type="button"
                            onClick={(e) => handleRequestDeleteDay(selectedFolderDay, e)}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                            title="Eliminar únicamente las partidas de este día sin tocar otros días"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Vaciar este Día</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleRequestDeleteFolder(selectedFolderOperator, e)}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                            title="Eliminar todas las partidas de esta operadora"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span className="hidden sm:inline">Vaciar Carpeta</span>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* DEDICATED DAY SUMMARY HEADER CARD (Only when viewing a specific day subfolder) */}
                {viewMode === 'folders' && selectedFolderOperator && selectedFolderDay && selectedFolderDay !== 'all' && (() => {
                  const currentDayInfo = operatorDaysList.find((d) => d.dateKey === selectedFolderDay);
                  if (!currentDayInfo) return null;
                  return (
                    <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 rounded-2xl p-4 sm:p-5 text-white shadow-md mb-4 border border-amber-300 animate-fade-in">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/20 pb-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center border border-white/30 shadow-inner flex-shrink-0">
                            <CalendarDays className="w-6 h-6 text-yellow-200" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider bg-black/20 text-yellow-100 px-2 py-0.5 rounded-md border border-white/20">
                                Subcarpeta del Día
                              </span>
                              <span className="text-xs font-mono font-bold text-white/90">
                                {currentDayInfo.dateKey}
                              </span>
                            </div>
                            <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                              {currentDayInfo.fullDate || currentDayInfo.displayDate}
                            </h3>
                            <p className="text-xs text-white/90 font-medium">
                              Operadora: <strong className="text-yellow-100">{selectedFolderOperator}</strong> • Información y líneas exclusivas registradas en este día
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Financial and Line stats for this day */}
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-slate-900">
                        <div className="bg-white/95 rounded-xl p-2.5 text-center shadow-xs">
                          <span className="text-[9px] font-black text-slate-500 uppercase block">Partidas Jugadas</span>
                          <span className="text-xl font-black text-orange-950 font-mono">
                            {currentDayInfo.games.length}
                          </span>
                        </div>

                        <div className="bg-white/95 rounded-xl p-2.5 text-center shadow-xs">
                          <span className="text-[9px] font-black text-purple-700 uppercase block">Líneas Jugadas</span>
                          <span className="text-xl font-black text-purple-950 font-mono">
                            {currentDayInfo.totalLines}
                          </span>
                        </div>

                        <div className="bg-white/95 rounded-xl p-2.5 text-center shadow-xs">
                          <span className="text-[9px] font-black text-emerald-700 uppercase block">Total Recaudado</span>
                          <span className="text-xl font-black text-emerald-800 font-mono">
                            ${currentDayInfo.totalCollected.toFixed(2)}
                          </span>
                        </div>

                        <div className="bg-white/95 rounded-xl p-2.5 text-center shadow-xs">
                          <span className="text-[9px] font-black text-rose-700 uppercase block">Premios Pagados</span>
                          <span className="text-xl font-black text-rose-800 font-mono">
                            ${currentDayInfo.totalPrizes.toFixed(2)}
                          </span>
                        </div>

                        <div className="bg-white/95 rounded-xl p-2.5 text-center shadow-xs col-span-2 sm:col-span-1">
                          <span className="text-[9px] font-black text-slate-600 uppercase block">Ganancia Neta</span>
                          <span className={`text-xl font-black font-mono ${currentDayInfo.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                            ${currentDayInfo.netProfit.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {displayItems.length === 0 ? (
                  <div className="py-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-orange-100 border-2 border-orange-300 flex items-center justify-center mx-auto mb-3 text-orange-500 shadow-inner">
                      <Layers className="w-8 h-8 opacity-70" />
                    </div>
                    <h4 className="text-base font-black text-slate-800">
                      {savedGames.length === 0 ? 'No hay partidas guardadas aún' : 'No se encontraron partidas con ese filtro'}
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      Cuando finalices y archives una partida mediante el botón <strong>"Nueva Partida"</strong> o cantes un BINGO, la partida quedará registrada aquí con su planilla completa y todos sus datos.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {displayItems.map((game, idx) => {
                      const is90 = game.mode === '90' || game.sheetType === 'traditional-90';
                      const letter = game.letter || (!is90 ? getBingo75Letter(game.ballNumber) : undefined);
                      const currency = game.currency || '$';
                      const ballsCount = game.totalBallsDrawnCount || (game.drawnBallsPlayed ? game.drawnBallsPlayed.length : 0);
                      const exactGameLines = getGameLines(game);

                      return (
                        <div
                          key={game.id || `${game.round}_${game.timestamp}_${idx}`}
                          onClick={() => handleOpenGameDetail(game)}
                          className="bg-white border-2 border-orange-200 hover:border-orange-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer relative group flex flex-col justify-between overflow-hidden"
                        >
                          {/* Top Header Card */}
                          <div>
                            <div className="flex items-center justify-between border-b border-orange-100 pb-2.5 mb-2.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-2.5 py-0.5 rounded-md bg-amber-500 text-white font-black text-xs shadow-2xs">
                                  Ronda #{game.round}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider ${
                                    is90 ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {is90 ? 'Bingo 90 Triples' : 'Bingo 75'}
                                </span>
                                <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-0.5" title="Total de líneas jugadas en esta partida">
                                  <span>🎯</span>
                                  <strong>{exactGameLines} líneas</strong>
                                </span>
                              </div>

                              {isAdmin && (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => handleRequestDeleteItem(game, e)}
                                    className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Eliminar registro de esta partida"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Operator and Subfolder Time Tag */}
                            <div className="mb-2 flex items-center justify-between gap-1 text-[11px] font-bold text-orange-900/80 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200 flex-wrap">
                              <div className="flex items-center gap-1 min-w-0">
                                <Folder className="w-3 h-3 text-amber-600 flex-shrink-0" />
                                <span className="truncate">Operadora: <strong>{game.operatorName || 'Operadora Principal'}</strong></span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono font-bold border border-amber-300" title="Subcarpeta por fecha (dailyDate)">
                                  📁 {game.dailyDate}
                                </span>
                                <span className="text-[10px] bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded font-mono font-bold border border-blue-300" title="Hora exacta de guardado">
                                  ⏰ {game.timestamp}
                                </span>
                              </div>
                            </div>

                            {/* Main Winning Ball & Key Info */}
                            <div className="flex items-center gap-3.5 mb-3">
                              {/* Giant winning ball badge */}
                              <div
                                className={`w-14 h-14 rounded-full bg-gradient-to-br ${getBallBadgeColor(
                                  game.ballNumber,
                                  is90
                                )} border-2 flex flex-col items-center justify-center shadow-md flex-shrink-0`}
                              >
                                {letter && (
                                  <span className="text-[10px] font-black uppercase leading-none opacity-90">
                                    {letter}
                                  </span>
                                )}
                                <span className="text-xl font-black leading-none">{game.ballNumber}</span>
                              </div>

                              {/* Round Details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                                  <Calendar className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                                  <span className="truncate">{game.dateFormatted || 'Fecha no registrada'}</span>
                                  <span>•</span>
                                  <span className="truncate">{game.timestamp}</span>
                                </div>

                                <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium mt-0.5">
                                  <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                  <span>Duración: {game.durationFormatted || '0m 30s'}</span>
                                </div>

                                <div className="text-xs font-semibold text-slate-700 mt-1">
                                  <span>Bolas cantadas: </span>
                                  <strong className="text-slate-900">{ballsCount}</strong>
                                  <span className="text-[11px] text-slate-500">
                                    /{is90 ? 90 : 75} ({Math.round((ballsCount / (is90 ? 90 : 75)) * 100)}%)
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Winning Player / Row if recorded */}
                            {(game.winningPlayerName || game.rowLeader) && (
                              <div className="mb-3 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center gap-1.5 text-xs">
                                <Trophy className="w-3.5 h-3.5 text-amber-600 fill-amber-600 flex-shrink-0" />
                                <span className="font-bold text-amber-950 truncate">
                                  {game.winningPlayerName
                                    ? `Ganador: ${game.winningPlayerName}`
                                    : `Fila premiada: #${game.rowLeader}`}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Financials & Action Footer */}
                          <div className="border-t border-orange-100 pt-2.5">
                            <div className="grid grid-cols-3 gap-1 text-center mb-2.5">
                              <div className="bg-slate-50 rounded-lg p-1 border border-slate-200">
                                <span className="text-[9px] font-bold text-slate-500 block uppercase">Recaudo</span>
                                <span className="text-xs font-black text-slate-900">
                                  {currency}{Number(game.totalCollected || 0).toFixed(2)}
                                </span>
                              </div>
                              <div className="bg-slate-50 rounded-lg p-1 border border-slate-200">
                                <span className="text-[9px] font-bold text-slate-500 block uppercase">Premios</span>
                                <span className="text-xs font-black text-amber-700">
                                  {currency}{Number(game.totalPrizesPaid || 0).toFixed(2)}
                                </span>
                              </div>
                              <div className="bg-emerald-50 rounded-lg p-1 border border-emerald-200">
                                <span className="text-[9px] font-bold text-emerald-700 block uppercase">Beneficio</span>
                                <span className="text-xs font-black text-emerald-800">
                                  {currency}{Number(game.netProfit || 0).toFixed(2)}
                                </span>
                              </div>
                            </div>

                            {/* Actions: View Sheet + Export JPG/PDF */}
                            <div className="flex flex-col gap-1.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenGameDetail(game);
                                }}
                                className="w-full py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm hover:shadow transition-all cursor-pointer active:scale-98"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Ver Planilla Completa</span>
                                <Maximize2 className="w-3 h-3 text-orange-200 ml-1" />
                              </button>

                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadGameDirectJpg(game);
                                  }}
                                  className="flex-1 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-900 font-bold text-[11px] flex items-center justify-center gap-1 border border-orange-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                                  title="Descargar comprobante en JPG (imagen)"
                                >
                                  <FileDown className="w-3 h-3 text-orange-700" />
                                  <span>Descargar JPG</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadGameDirectPdf(game);
                                  }}
                                  className="flex-1 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] flex items-center justify-center gap-1 border border-amber-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                                  title="Descargar documento en PDF"
                                >
                                  <Printer className="w-3 h-3 text-amber-700" />
                                  <span>Descargar PDF</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          ) : (
            /* DETAILED GAME INSPECTOR VIEW - SINGLE PLANE (UN SOLO PLANO DE PANTALLA SIN SCROLL) */
            <div className="h-full min-h-0 flex flex-col gap-1.5 w-full max-w-[1700px] mx-auto overflow-hidden">
              {/* Compact Sub-Bar: Winner, Financials, Table/Balls Selector */}
              <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-1.5 bg-white border border-orange-200 rounded-xl shadow-2xs flex-shrink-0">
                {/* Left side: Winning ball + Winner badge + Bolas count */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getBallBadgeColor(
                      selectedGame.ballNumber,
                      selectedGame.mode === '90' || selectedGame.sheetType === 'traditional-90'
                    )} border flex flex-col items-center justify-center shadow-xs flex-shrink-0`}
                  >
                    {selectedGame.letter && (
                      <span className="text-[8px] font-black uppercase leading-none opacity-90">
                        {selectedGame.letter}
                      </span>
                    )}
                    <span className="text-sm font-black leading-none font-mono">
                      {selectedGame.ballNumber}
                    </span>
                  </div>

                  {selectedGame.winningPlayerName ? (
                    <div className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-300 flex items-center gap-1.5 text-xs font-black text-amber-950 shadow-2xs">
                      <Trophy className="w-3.5 h-3.5 text-amber-600 fill-amber-500 flex-shrink-0" />
                      <span className="truncate max-w-[140px] sm:max-w-[200px]">
                        Ganador: <strong>{selectedGame.winningPlayerName}</strong>
                      </span>
                      {selectedGame.rowLeader && (
                        <span className="text-amber-800 font-extrabold bg-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                          Fila #{selectedGame.rowLeader}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-slate-700">
                      Partida #{selectedGame.round} Finalizada
                    </span>
                  )}

                  <span className="text-xs font-semibold text-slate-500 hidden md:inline">
                    {selectedGame.totalBallsDrawnCount || selectedGame.drawnBallsPlayed?.length || 0} bolas cantadas
                  </span>
                </div>

                {/* Center: Financial stats */}
                <div className="flex items-center gap-2 text-xs font-black">
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-800 text-[11px] whitespace-nowrap">
                    Recaudo: <strong>{selectedGame.currency || '$'}{Number(selectedGame.totalCollected || 0).toFixed(2)}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] whitespace-nowrap">
                    Premios: <strong>{selectedGame.currency || '$'}{Number(selectedGame.totalPrizesPaid || 0).toFixed(2)}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] whitespace-nowrap">
                    Beneficio: <strong>{selectedGame.currency || '$'}{Number(selectedGame.netProfit || 0).toFixed(2)}</strong>
                  </span>
                </div>

                {/* Right: Mode 90 table switcher & Tab switcher */}
                <div className="flex items-center gap-1.5">
                  {(selectedGame.mode === '90' || selectedGame.sheetType === 'traditional-90') && activeTab === 'sheet' && (
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-300 text-[11px] font-bold">
                      <button
                        type="button"
                        onClick={() => setTable90View('both')}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          table90View === 'both' ? 'bg-orange-600 text-white font-black shadow-2xs' : 'text-slate-700 hover:bg-slate-200'
                        }`}
                        title="Ver ambas tablas"
                      >
                        Ambas
                      </button>
                      <button
                        type="button"
                        onClick={() => setTable90View('1')}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          table90View === '1' ? 'bg-orange-600 text-white font-black shadow-2xs' : 'text-slate-700 hover:bg-slate-200'
                        }`}
                        title="Ver Tabla 1"
                      >
                        Tabla 1
                      </button>
                      <button
                        type="button"
                        onClick={() => setTable90View('2')}
                        className={`px-2 py-0.5 rounded transition-colors ${
                          table90View === '2' ? 'bg-orange-600 text-white font-black shadow-2xs' : 'text-slate-700 hover:bg-slate-200'
                        }`}
                        title="Ver Tabla 2"
                      >
                        Tabla 2
                      </button>
                    </div>
                  )}

                  <div className="flex items-center bg-orange-100/80 rounded-lg p-0.5 border border-orange-300 text-xs font-black">
                    <button
                      type="button"
                      onClick={() => setActiveTab('sheet')}
                      className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                        activeTab === 'sheet'
                          ? 'bg-orange-600 text-white shadow-2xs'
                          : 'text-orange-950 hover:bg-orange-200'
                      }`}
                    >
                      <Table2 className="w-3.5 h-3.5" />
                      <span>Planilla</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('balls')}
                      className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                        activeTab === 'balls'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'text-slate-700 hover:bg-orange-200'
                      }`}
                    >
                      <ListOrdered className="w-3.5 h-3.5" />
                      <span>Bolas ({selectedGame.drawnBallsPlayed?.length || 0})</span>
                    </button>
                    {Boolean(selectedGame.cageSnapshotImage) && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('cage')}
                        className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                          activeTab === 'cage'
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'text-slate-700 hover:bg-orange-200'
                        }`}
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Foto Bolillero</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Main Inspector Sheet / Balls Container (FLEX-1 MIN-H-0 OVERFLOW-HIDDEN: ZERO VERTICAL SCROLL) */}
              <div id="gallery-sheet-export-target" className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white p-1">
                {activeTab === 'sheet' ? (
                  /* TAB 1: FULL SHEET INSPECTION ON A SINGLE SCREEN PLANE */
                  selectedGame.sheetType === 'traditional-90' || selectedGame.mode === '90' ? (
                    /* 90 Traditional Sheet Snapshot */
                    selectedGame.sheet90Snapshot ? (
                      <div className={`flex-1 min-h-0 grid ${table90View === 'both' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'} gap-2 w-full overflow-hidden`}>
                        {[
                          selectedGame.sheet90Snapshot.table1,
                          selectedGame.sheet90Snapshot.table2,
                          ...(selectedGame.sheet90Snapshot.tables || []),
                        ]
                          .filter(Boolean)
                          .slice(0, 4)
                          .filter((table, tIdx) => {
                            const tblNum = table?.tableNumber || tIdx + 1;
                            if (table90View === '1') return tblNum === 1;
                            if (table90View === '2') return tblNum === 2;
                            return true;
                          })
                          .map((table, tIdx) => {
                            const tblNum = table?.tableNumber || tIdx + 1;
                            const drawnSet = new Set(selectedGame.drawnBallsPlayed || []);
                            const rows = table?.rows || [];
                            const leftHalfRows = rows.slice(0, 15);
                            const rightHalfRows = rows.slice(15, 30);

                            return (
                              <div
                                key={tblNum}
                                className="border-2 border-black rounded-xl overflow-hidden bg-white shadow-md flex-1 min-h-0 flex flex-col"
                              >
                                {/* Table header */}
                                <div className="bg-slate-900 text-yellow-300 px-3 py-1 border-b-2 border-black flex items-center justify-between font-black text-xs flex-shrink-0">
                                  <span className="uppercase tracking-wide">{table?.title || `TABLA #${tblNum}`}</span>
                                  <span className="text-yellow-100 font-mono text-[11px] sm:text-xs">
                                    Fila: {selectedGame.currency || '$'}{table?.pricePerRow || 1.0} • Premio: {selectedGame.currency || '$'}{table?.prize || 25.0}
                                  </span>
                                </div>

                                {/* Split into 2 sub-columns of 15 rows side-by-side so all 30 rows fit in a single screen plane! */}
                                <div className="flex-1 min-h-0 grid grid-cols-2 divide-x-2 divide-black overflow-hidden">
                                  {/* Left sub-column: Rows 1..15 */}
                                  <div className="flex-1 min-h-0 flex flex-col divide-y divide-black/80">
                                    {leftHalfRows.map((row) => {
                                      const hits = row.numbers.filter((n) => drawnSet.has(n));
                                      const isBingo = hits.length === 3;

                                      return (
                                        <div
                                          key={row.rowNumber}
                                          className={`flex-1 min-h-0 flex items-center justify-between px-2 text-xs relative transition-all ${
                                            isBingo
                                              ? 'bg-[#4ade80] font-black ring-2 ring-[#15803d] ring-inset shadow-xs'
                                              : ''
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span
                                              className={`w-6 font-black text-[11px] ${
                                                isBingo ? 'text-emerald-950 font-black' : 'text-slate-800'
                                              }`}
                                            >
                                              #{row.rowNumber}
                                            </span>
                                            <div className="flex items-center gap-1 font-mono">
                                              {row.numbers.map((n) => (
                                                <span
                                                  key={n}
                                                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full font-bold text-[10px] sm:text-xs flex items-center justify-center transition-all ${
                                                    drawnSet.has(n)
                                                      ? isBingo
                                                        ? 'bg-[#15803d] text-white ring-2 ring-emerald-300 font-black shadow-2xs'
                                                        : 'bg-amber-400 text-amber-950 ring-1 ring-amber-600 font-black shadow-2xs'
                                                      : isBingo
                                                      ? 'bg-white text-emerald-950 font-black border border-emerald-600'
                                                      : 'bg-slate-100 text-slate-800 border border-slate-300'
                                                  }`}
                                                >
                                                  {n}
                                                </span>
                                              ))}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1 min-w-0">
                                            {isBingo && (
                                              <span className="px-1.5 py-0.2 rounded-full bg-[#15803d] text-white font-black text-[9px] animate-pulse shadow-2xs">
                                                ★ BINGO
                                              </span>
                                            )}
                                            <span
                                              className={`font-black truncate text-[11px] max-w-[80px] sm:max-w-[110px] text-right ${
                                                isBingo ? 'text-black' : 'text-slate-900'
                                              }`}
                                            >
                                              {row.playerName || '-'}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Right sub-column: Rows 16..30 */}
                                  <div className="flex-1 min-h-0 flex flex-col divide-y divide-black/80">
                                    {rightHalfRows.map((row) => {
                                      const hits = row.numbers.filter((n) => drawnSet.has(n));
                                      const isBingo = hits.length === 3;

                                      return (
                                        <div
                                          key={row.rowNumber}
                                          className={`flex-1 min-h-0 flex items-center justify-between px-2 text-xs relative transition-all ${
                                            isBingo
                                              ? 'bg-[#4ade80] font-black ring-2 ring-[#15803d] ring-inset shadow-xs'
                                              : ''
                                          }`}
                                        >
                                          <div className="flex items-center gap-1.5 min-w-0">
                                            <span
                                              className={`w-6 font-black text-[11px] ${
                                                isBingo ? 'text-emerald-950 font-black' : 'text-slate-800'
                                              }`}
                                            >
                                              #{row.rowNumber}
                                            </span>
                                            <div className="flex items-center gap-1 font-mono">
                                              {row.numbers.map((n) => (
                                                <span
                                                  key={n}
                                                  className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full font-bold text-[10px] sm:text-xs flex items-center justify-center transition-all ${
                                                    drawnSet.has(n)
                                                      ? isBingo
                                                        ? 'bg-[#15803d] text-white ring-2 ring-emerald-300 font-black shadow-2xs'
                                                        : 'bg-amber-400 text-amber-950 ring-1 ring-amber-600 font-black shadow-2xs'
                                                      : isBingo
                                                      ? 'bg-white text-emerald-950 font-black border border-emerald-600'
                                                      : 'bg-slate-100 text-slate-800 border border-slate-300'
                                                  }`}
                                                >
                                                  {n}
                                                </span>
                                              ))}
                                            </div>
                                          </div>

                                          <div className="flex items-center gap-1 min-w-0">
                                            {isBingo && (
                                              <span className="px-1.5 py-0.2 rounded-full bg-[#15803d] text-white font-black text-[9px] animate-pulse shadow-2xs">
                                                ★ BINGO
                                              </span>
                                            )}
                                            <span
                                              className={`font-black truncate text-[11px] max-w-[80px] sm:max-w-[110px] text-right ${
                                                isBingo ? 'text-black' : 'text-slate-900'
                                              }`}
                                            >
                                              {row.playerName || '-'}
                                            </span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-slate-500 text-xs">
                        No se guardó el snapshot visual completo de la planilla 90 en esta versión previa.
                      </div>
                    )
                  ) : (
                    /* 75 Multipliers Sheet Snapshot on a Single Screen Plane with ZERO scrolling */
                    selectedGame.sheet75Snapshot ? (
                      (() => {
                        const s75 = selectedGame.sheet75Snapshot;
                        const numCols = s75.columns?.length || 4;
                        const seqColWidth = 115;
                        const exactGameLines =
                          selectedGame.totalLinesPlayed !== undefined
                            ? selectedGame.totalLinesPlayed
                            : (s75.columns?.reduce((acc, c) => acc + (c.multiplier || 1), 0) || 12);
                        const summaryList =
                          selectedGame.playerSummarySnapshot ||
                          s75.playerSummaryList ||
                          [];

                        return (
                          <div className="flex-1 min-h-0 flex flex-col border-2 border-black rounded-xl overflow-hidden bg-white shadow-md w-full">
                            {/* Host Header */}
                            <div className="bg-slate-100 px-3 py-1 border-b-2 border-black flex items-center justify-between text-xs font-black text-slate-900 flex-shrink-0">
                              <div>
                                <span>LES ATIENDE: </span>
                                <strong className="text-black uppercase">
                                  {s75.hostName || selectedGame.operatorName || 'OFICIAL'}
                                </strong>
                              </div>
                              <div className="text-center">
                                <span className="font-black text-xs sm:text-sm uppercase tracking-wider">
                                  {(s75.title && s75.title !== 'PLANILLA OFICIAL') ? s75.title : 'BIENVENIDOS A LA FAMILIA TEOO'}
                                </span>
                              </div>
                              <div>
                                <span>YAPPY: </span>
                                <strong className="text-black font-mono">
                                  {s75.hostPhone || '6341-9199'}
                                </strong>
                              </div>
                            </div>

                            {/* Grid Columns Header: SECUENCIA (A | T | B) + Multipliers X1, X2, X3... */}
                            <div
                              className="grid divide-x-2 divide-black border-b-2 border-black bg-slate-100 text-center font-black text-xs flex-shrink-0"
                              style={{
                                gridTemplateColumns: `${seqColWidth}px repeat(${numCols}, minmax(0, 1fr))`,
                              }}
                            >
                              {/* Left Header: LINES & SECUENCIA */}
                              <div className="flex flex-col bg-slate-200 border-r-2 border-black overflow-hidden select-none">
                                <div className="py-0.5 px-0.5 bg-[#581c87] text-white flex flex-col items-center justify-center text-center">
                                  <span className="text-sm sm:text-base font-black font-mono leading-none tracking-tight text-yellow-300">
                                    {exactGameLines}
                                  </span>
                                  <span className="text-[7.5px] font-black uppercase text-purple-100 tracking-wider leading-none mt-0.5">
                                    LÍNEAS (TURNO)
                                  </span>
                                  <span className="text-[7px] text-purple-200/90 font-bold leading-tight mt-0.5 whitespace-nowrap">
                                    Esta: {exactGameLines} lín.
                                  </span>
                                </div>
                                <div className="bg-[#facc15] text-black font-black uppercase text-[9px] tracking-wider text-center py-0.5 border-t border-b border-black leading-none">
                                  SECUENCIA
                                </div>
                                <div className="grid grid-cols-3 divide-x divide-purple-300 bg-[#581c87] text-white font-black text-[8.5px] py-0.5 text-center leading-none uppercase">
                                  <span title="Ambo">AMB</span>
                                  <span title="Terna">TER</span>
                                  <span title="Bingo">BIN</span>
                                </div>
                              </div>

                              {/* Multiplier Columns: SOLO X1, DOBLE X2, TRIPLE X3... */}
                              {s75.columns.map((col, cIdx) => {
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
                                    key={col.id || cIdx}
                                    className={`py-0.5 px-1 flex flex-col items-center justify-center ${
                                      mult >= 2 ? 'bg-[#facc15] text-black font-black' : 'bg-slate-100 text-purple-950 font-black'
                                    }`}
                                  >
                                    <span className="text-[8.5px] font-black uppercase tracking-wider leading-none text-black">
                                      {multName}
                                    </span>
                                    <span className="text-base sm:text-lg font-black text-black font-mono leading-none mt-0.5">
                                      X{mult}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* 15 Rows: Each row takes flex-1 min-h-0 so ALL 15 fit precisely on a single screen without scrolling! */}
                            <div className="flex-1 min-h-0 flex flex-col divide-y divide-black/80">
                              {Array.from({ length: s75.totalRows || 15 }).map((_, rIdx) => {
                                const rowNumber = rIdx + 1;
                                const isWinningRow = selectedGame.rowLeader === rowNumber;
                                const isTernaRow = selectedGame.ternaLeader === rowNumber;
                                const isAmboRow = selectedGame.amboLeader === rowNumber;

                                // Secuencia values for row
                                const aVal =
                                  selectedGame.sequenceSnapshot?.[rowNumber]?.ambo ??
                                  s75.customSeqEntries?.[rowNumber]?.ambo ??
                                  (isAmboRow ? rowNumber : null);

                                const tVal =
                                  selectedGame.sequenceSnapshot?.[rowNumber]?.terna ??
                                  s75.customSeqEntries?.[rowNumber]?.terna ??
                                  (isTernaRow ? rowNumber : null);

                                const bVal =
                                  selectedGame.sequenceSnapshot?.[rowNumber]?.bingo ??
                                  s75.customSeqEntries?.[rowNumber]?.bingo ??
                                  (isWinningRow ? rowNumber : null);

                                return (
                                  <div
                                    key={rowNumber}
                                    className={`flex-1 min-h-0 grid divide-x divide-black/80 relative items-stretch transition-all ${
                                      isWinningRow
                                        ? 'bg-[#4ade80] font-black border-y-2 border-[#15803d] ring-2 ring-[#22c55e] z-10'
                                        : isTernaRow
                                        ? 'bg-emerald-100/70 font-black'
                                        : isAmboRow
                                        ? 'bg-sky-100/70 font-black'
                                        : ''
                                    }`}
                                    style={{
                                      gridTemplateColumns: `${seqColWidth}px repeat(${numCols}, minmax(0, 1fr))`,
                                    }}
                                  >
                                    {/* Left Cell: SECUENCIA (A | T | B) */}
                                    <div className="grid grid-cols-3 divide-x divide-black text-center text-xs font-black select-none border-r-2 border-black bg-slate-50">
                                      {/* A */}
                                      <div className={`flex items-center justify-center font-mono ${isAmboRow ? 'bg-sky-200 text-sky-950 font-black' : 'text-slate-800'}`}>
                                        {aVal !== null && aVal !== undefined ? (
                                          <span className="font-black text-xs sm:text-sm">{aVal}</span>
                                        ) : (
                                          <span className="text-slate-300 text-[10px]">-</span>
                                        )}
                                      </div>
                                      {/* T */}
                                      <div className={`flex items-center justify-center font-mono ${isTernaRow ? 'bg-emerald-200 text-emerald-950 font-black' : 'text-slate-800'}`}>
                                        {tVal !== null && tVal !== undefined ? (
                                          <span className="font-black text-xs sm:text-sm">{tVal}</span>
                                        ) : (
                                          <span className="text-slate-300 text-[10px]">-</span>
                                        )}
                                      </div>
                                      {/* B */}
                                      <div className={`flex items-center justify-center font-mono ${isWinningRow ? 'bg-amber-300 text-amber-950 font-black' : 'text-slate-800'}`}>
                                        {bVal !== null && bVal !== undefined ? (
                                          <span className="font-black text-xs sm:text-sm">{bVal}</span>
                                        ) : (
                                          <span className="text-slate-300 text-[10px]">-</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Columns */}
                                    {s75.columns.map((col, cIdx) => {
                                      const cell = col.cells[rIdx] || { rowNumber };

                                      return (
                                        <div
                                          key={cIdx}
                                          className={`px-1.5 sm:px-2 flex items-center justify-between relative overflow-hidden text-xs ${
                                            isWinningRow ? 'bg-[#4ade80]' : ''
                                          }`}
                                          style={{
                                            backgroundColor: isWinningRow
                                              ? '#4ade80'
                                              : cell.color || 'transparent',
                                          }}
                                        >
                                          <span
                                            className={`text-[9px] sm:text-[10px] font-black select-none ${
                                              isWinningRow ? 'text-emerald-950 font-black' : 'text-slate-500'
                                            }`}
                                          >
                                            #{rowNumber}
                                          </span>
                                          <span
                                            className={`font-black truncate text-center flex-1 px-1 uppercase text-[11px] sm:text-xs ${
                                              isWinningRow ? 'text-black font-black text-sm' : 'text-slate-950'
                                            }`}
                                            title={cell.playerName || ''}
                                          >
                                            {cell.playerName ? cell.playerName.toUpperCase() : '-'}
                                          </span>

                                          {/* Winner Badges */}
                                          {isWinningRow && cIdx === numCols - 1 && (
                                            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#15803d] text-white text-[9px] font-black tracking-wider uppercase ml-1 flex-shrink-0 animate-pulse">
                                              ★ BINGO
                                            </span>
                                          )}
                                          {isTernaRow && !isWinningRow && cIdx === numCols - 1 && (
                                            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black tracking-wider uppercase ml-1 flex-shrink-0">
                                              ⭐ TERNA
                                            </span>
                                          )}
                                          {isAmboRow && !isWinningRow && !isTernaRow && cIdx === numCols - 1 && (
                                            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full bg-sky-600 text-white text-[9px] font-black tracking-wider uppercase ml-1 flex-shrink-0">
                                              🔷 AMBO
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>

                            {/* BOTTOM SUMMARY ROWS: NOMBRE, GANO, DEBE, TOTAL (CON NÚMEROS EN NEGRITA Y LEGIBLES) */}
                            <div className="border-t-2 border-black flex flex-col bg-slate-50 flex-shrink-0 select-none overflow-hidden">
                              <div className="flex w-full overflow-x-auto scrollbar-thin">
                                {/* Left Header Column (Matching width of SECUENCIA column) */}
                                <div
                                  className="flex-shrink-0 sticky left-0 z-20 bg-slate-100 border-r-2 border-black flex flex-col select-none"
                                  style={{
                                    width: `${seqColWidth}px`,
                                    minWidth: `${seqColWidth}px`,
                                    maxWidth: `${seqColWidth}px`,
                                  }}
                                >
                                  <div className="h-[20px] bg-[#d8b4fe] text-purple-950 font-black text-[9.5px] uppercase tracking-wider flex items-center justify-center border-b border-black">
                                    NOMBRE
                                  </div>
                                  <div className="h-[18px] bg-[#fde047] text-amber-950 font-black text-[9px] uppercase tracking-wider flex items-center justify-center border-b border-black">
                                    GANO
                                  </div>
                                  <div className="h-[18px] bg-[#fef08a] text-amber-950 font-black text-[9px] uppercase tracking-wider flex items-center justify-center border-b border-black">
                                    DEBE
                                  </div>
                                  <div className="h-[18px] bg-[#facc15] text-amber-950 font-black text-[9px] uppercase tracking-wider flex items-center justify-center">
                                    TOTAL
                                  </div>
                                </div>

                                {/* Right Player Columns */}
                                <div className="flex-1 flex min-w-0">
                                  {summaryList.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center h-[74px] px-3 text-slate-400 italic font-bold uppercase text-[10px] bg-white">
                                      <span>Sin saldos registrados en esta partida</span>
                                    </div>
                                  ) : (
                                    summaryList.map((p, pIdx) => {
                                      const isNeg = (p.total || 0) < 0;
                                      const isPos = (p.total || 0) > 0;
                                      const ganoVal = Number(p.totalGano || p.currentWon || 0);
                                      const debeVal = Number(p.debe || 0);
                                      const totalVal = Number(p.total || 0);

                                      return (
                                        <div
                                          key={p.id || pIdx}
                                          className="min-w-[75px] sm:min-w-[90px] flex-1 flex flex-col border-r border-black text-center"
                                        >
                                          {/* NOMBRE */}
                                          <div
                                            className="h-[20px] px-1 flex items-center justify-center font-black uppercase text-[10px] sm:text-[11px] border-b border-black truncate"
                                            style={{
                                              backgroundColor: p.color ? `${p.color}dd` : '#f3e8ff',
                                              color: '#000000',
                                            }}
                                            title={p.name}
                                          >
                                            <span className="font-black truncate">{p.name.toUpperCase()}</span>
                                            {p.isBingoWinner && (
                                              <span className="ml-0.5 text-[7.5px] font-black bg-amber-400 text-amber-950 px-0.5 rounded border border-black leading-none">B</span>
                                            )}
                                            {p.isTernaWinner && (
                                              <span className="ml-0.5 text-[7.5px] font-black bg-emerald-500 text-white px-0.5 rounded border border-black leading-none">T</span>
                                            )}
                                            {p.isAmboWinner && (
                                              <span className="ml-0.5 text-[7.5px] font-black bg-sky-500 text-white px-0.5 rounded border border-black leading-none">A</span>
                                            )}
                                          </div>

                                          {/* GANO (NEGRITA) */}
                                          <div
                                            className={`h-[18px] px-1 flex items-center justify-center font-black tabular-nums text-[11px] sm:text-xs border-b border-black ${
                                              ganoVal > 0 ? 'text-emerald-950 bg-emerald-100 font-black' : 'text-black bg-[#fefce8] font-black'
                                            }`}
                                          >
                                            <strong className="font-black font-mono">{ganoVal.toFixed(2)}</strong>
                                          </div>

                                          {/* DEBE (NEGRITA) */}
                                          <div
                                            className={`h-[18px] px-1 flex items-center justify-center font-black tabular-nums text-[11px] sm:text-xs border-b border-black ${
                                              debeVal > 0 ? 'text-rose-950 bg-rose-100 font-black' : 'text-black bg-[#fefce8] font-black'
                                            }`}
                                          >
                                            <strong className="font-black font-mono">{debeVal.toFixed(2)}</strong>
                                          </div>

                                          {/* TOTAL (NEGRITA) */}
                                          <div
                                            className={`h-[18px] px-1 flex items-center justify-center font-black tabular-nums text-[11px] sm:text-xs ${
                                              isNeg
                                                ? 'text-red-950 bg-red-200 font-black'
                                                : isPos
                                                ? 'text-emerald-950 bg-emerald-200 font-black'
                                                : 'text-black bg-amber-100 font-black'
                                            }`}
                                          >
                                            <strong className="font-black font-mono">
                                              {isNeg
                                                ? `-${Math.abs(totalVal).toFixed(2)}`
                                                : isPos
                                                ? `+${totalVal.toFixed(2)}`
                                                : '0.00'}
                                            </strong>
                                          </div>
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="py-8 text-center text-slate-500 text-xs">
                        No se guardó el snapshot visual completo de la planilla 75 en esta versión previa.
                      </div>
                    )
                  )
                ) : activeTab === 'balls' ? (
                  /* TAB 2: ALL BALLS PLAYED IN ORDER (Fits inside the single plane with internal scroll if necessary) */
                  <div className="flex-1 min-h-0 bg-white rounded-xl border-2 border-orange-300 p-3 shadow-sm flex flex-col overflow-hidden">
                    <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-2 flex-shrink-0">
                      Extracciones de la Partida en Orden ({selectedGame.drawnBallsPlayed?.length || 0} bolas)
                    </h4>

                    {selectedGame.drawnBallsPlayed && selectedGame.drawnBallsPlayed.length > 0 ? (
                      <div className="flex-1 min-h-0 overflow-y-auto flex flex-wrap gap-1.5 content-start p-1">
                        {selectedGame.drawnBallsPlayed.map((num, idx) => {
                          const isWinningLast = num === selectedGame.ballNumber;

                          return (
                            <div
                              key={idx}
                              className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 shadow-2xs font-mono text-xs font-black ${
                                isWinningLast
                                  ? 'bg-red-600 text-white border-red-700 ring-2 ring-red-400 scale-105 shadow-md'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                            >
                              <span className="text-[9px] opacity-60">#{idx + 1}</span>
                              <span className="text-sm">{num}</span>
                              {isWinningLast && <span className="text-[10px]">🏆</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No se registraron las bolas cantadas en esta partida.</p>
                    )}
                  </div>
                ) : (
                  /* TAB 3: BOLILLERO SNAPSHOT PHOTO */
                  <div className="flex-1 min-h-0 bg-white rounded-xl border-2 border-orange-300 p-3 shadow-sm flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                        <Camera className="w-4 h-4 text-orange-600" />
                        <span>Captura del Bolillero al Cantar Bingo - Partida #{selectedGame.round}</span>
                      </h4>
                      {selectedGame.cageSnapshotImage && (
                        <a
                          href={selectedGame.cageSnapshotImage}
                          download={`bolillero_partida_${selectedGame.round}.png`}
                          className="py-1 px-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-black flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>Descargar Foto</span>
                        </a>
                      )}
                    </div>
                    {selectedGame.cageSnapshotImage ? (
                      <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-2 bg-[#fffaf5] rounded-xl border border-orange-200">
                        <img
                          src={selectedGame.cageSnapshotImage}
                          alt={`Bolillero Partida #${selectedGame.round}`}
                          className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
                        />
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                        <Camera className="w-10 h-10 text-slate-300" />
                        <p className="text-xs font-bold text-slate-700">Sin foto del bolillero guardada</p>
                        <p className="text-[11px] text-slate-400 max-w-xs">
                          Esta partida fue registrada antes de la activación de la captura fotográfica del bolillero.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Single Game Confirmation Dialog */}
      {isAdmin && itemToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in select-none">
          <div className="w-full max-w-md bg-white border-2 border-rose-300 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  ¿Eliminar Partida #{itemToDelete.round}?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Se eliminará permanentemente esta partida guardada ({itemToDelete.operatorName || 'Operadora'}, {itemToDelete.totalLinesPlayed || 68} líneas) de la galería y de la base de datos.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteItem}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Eliminar Partida</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Dialog */}
      {isAdmin && folderToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in select-none">
          <div className="w-full max-w-md bg-white border-2 border-rose-300 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  ¿Vaciar carpeta de {folderToDelete}?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Se eliminarán permanentemente todas las partidas guardadas de esta operadora de la galería y de la base de datos.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFolderToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteFolder}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Vaciar Carpeta</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Day Subfolder Confirmation Dialog */}
      {isAdmin && dayToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in select-none">
          <div className="w-full max-w-md bg-white border-2 border-rose-300 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                <CalendarDays className="w-6 h-6 text-rose-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  ¿Vaciar partidas del día {dayToDelete}?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Se eliminarán únicamente las partidas y líneas registradas en esta fecha ({dayToDelete}) para la operadora <strong className="text-slate-900">{selectedFolderOperator}</strong>. Ningún otro día ni operadora se verá afectado.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDayToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteDay}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Vaciar este Día</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
