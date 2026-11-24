import React, { useState, useMemo } from 'react';
import { GameSequenceItem, AppUser } from '../types';

import {
  X,
  Printer,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Search,
  Layers,
  ArrowUpDown,
  Maximize2,
  Minimize2,
  Folder,
  FolderOpen,
  FileDown,
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
  getGameFolderKey,
  getGameShiftNumber,
  getGameLines,
  deleteGamesOfDay,
  deleteGamesOfOperatorFolder,
  getCurrentLocalDateKey,
  getPreviousDateKey,
  reorganizeAndHealAllStoredGames,
  hydrateAllHistoricalGamesInPages,
  subscribeToSavedGamesFirestore,
  subscribeToUsersCentralized,
  sanitizeOperatorFolderName,
  formatTime12h,
} from '../utils/savedGamesStorage';
import {
  exportElementAsJpg,
  exportElementAsPdf,
  downloadGameDirectJpg,
  downloadGameDirectPdf,
} from '../utils/exportGameReport';
import { GalleryGameInspector } from './gallery/GalleryGameInspector';
import { GalleryGamesGrid } from './gallery/GalleryGamesGrid';

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
  isAdmin: isAdminProp = false,
}) => {
  // El rango sale del perfil verificado en Firestore (no de una lista de correos en el navegador)
  const isAdmin = Boolean(isAdminProp || currentUser?.role === 'admin');

  const [filterMode, setFilterMode] = useState<'all' | '75' | '90'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGame, setSelectedGame] = useState<GameSequenceItem | null>(null);
  const [activeTab, setActiveTab] = useState<'sheet' | 'balls' | 'cage'>('sheet');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState<boolean>(true);
  const [table90View, setTable90View] = useState<'both' | '1' | '2'>('both');
  const [liveFirestoreGames, setLiveFirestoreGames] = useState<GameSequenceItem[] | null>(null);
  const [registeredUsers, setRegisteredUsers] = useState<AppUser[]>([]);

  // Folders by Operator & Subfolders by Day (Día / Fecha) state
  const [viewMode, setViewMode] = useState<'folders' | 'all'>('folders');
  const [selectedFolderOperator, setSelectedFolderOperator] = useState<string | null>(() => {
    if (!isAdmin && currentUser) {
      return (currentUser.name || 'Operadora Principal').trim();
    }
    return null;
  });
  const [selectedFolderDay, setSelectedFolderDay] = useState<string | null>(null);

  // Automatically lock non-admin operator to their individual folder, and unlock for admins so all folders appear
  React.useEffect(() => {
    if (!isAdmin && currentUser) {
      setSelectedFolderOperator((currentUser.name || 'Operadora Principal').trim());
    } else if (isAdmin) {
      setSelectedFolderOperator(null);
      setSelectedFolderDay(null);
    }
  }, [isAdmin, currentUser?.id, currentUser?.email]);

  // Reorganization & Auto-healing state
  const [isReorganizing, setIsReorganizing] = useState<boolean>(false);
  const [reorganizeFeedback, setReorganizeFeedback] = useState<{
    count: number;
    total: number;
    message: string;
  } | null>(null);

  // Real-time Firestore games & users sync on modal open so admins always see 100% of operator folders and games
  React.useEffect(() => {
    if (!isOpen) return;

    const unsubGames = subscribeToSavedGamesFirestore((games) => {
      setLiveFirestoreGames(games);
    });
    const unsubUsers = subscribeToUsersCentralized((users) => {
      setRegisteredUsers(users);
    });

    void hydrateAllHistoricalGamesInPages();

    reorganizeAndHealAllStoredGames()
      .then((res) => {
        if (res.reorganizedCount > 0) {
          onRefreshGallery?.();
        }
      })
      .catch((e) => {
        console.warn('Auto-reorganize check on gallery open skipped:', e);
      });

    return () => {
      unsubGames();
      unsubUsers();
    };
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

  // Filter and sort items (merging both prop savedGames and liveFirestoreGames so 100% of games up to date are always shown)
  const filteredItems = useMemo(() => {
    const mergedMap = new Map<string, GameSequenceItem>();
    for (const g of savedGames) {
      if (g) {
        const key = g.id || `${g.operatorName || 'op'}_${g.dailyDate || ''}_${g.mode || '75'}_${g.round}_${g.timestamp || ''}`;
        mergedMap.set(key, g);
      }
    }
    if (liveFirestoreGames) {
      for (const g of liveFirestoreGames) {
        if (g) {
          const key = g.id || `${g.operatorName || 'op'}_${g.dailyDate || ''}_${g.mode || '75'}_${g.round}_${g.timestamp || ''}`;
          mergedMap.set(key, g);
        }
      }
    }
    let list = Array.from(mergedMap.values());

    // Non-admin operators ONLY see their own matches! Admins ALWAYS see all matches of all operators.
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
  }, [savedGames, liveFirestoreGames, filterMode, sortOrder, searchQuery, isAdmin, currentUser]);

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

    // Fecha más reciente real de cada carpeta (para "Última actividad")
    const lastKeyByOp: Record<string, string> = {};
    filteredItems.forEach((game) => {
      const opName = (game.operatorName || 'Operadora Principal').trim();
      const opKey = sanitizeOperatorFolderName(game.operatorFolder || opName);
      if (!groups[opKey]) {
        groups[opKey] = {
          operatorName: opName,
          operatorUid: game.operatorUid || 'anon',
          games: [],
          totalLines: 0,
          totalCollected: 0,
          totalPrizes: 0,
          lastDate: game.dateFormatted || game.dailyDate,
        };
      }
      groups[opKey].games.push(game);
      const gameDateKey = getGameNormalizedDateKey(game);
      if (!lastKeyByOp[opKey] || gameDateKey > lastKeyByOp[opKey]) {
        lastKeyByOp[opKey] = gameDateKey;
        groups[opKey].lastDate = game.dateFormatted || game.dailyDate || gameDateKey;
      }
      // Exact lines played: suma del valor/multiplicador de cada columna (ej: 4 columnas X2 = 8 líneas)
      const lines = getGameLines(game);
      groups[opKey].totalLines += lines;
      groups[opKey].totalCollected = Math.round((groups[opKey].totalCollected + (game.totalCollected || 0)) * 100) / 100;
      groups[opKey].totalPrizes = Math.round((groups[opKey].totalPrizes + (game.totalPrizesPaid || 0)) * 100) / 100;
    });

    // For Administrators, also ensure all registered operators appear as folders even if they have 0 games in the current filter
    if (isAdmin && registeredUsers.length > 0 && !searchQuery.trim()) {
      registeredUsers.forEach((u) => {
        if (!u || !u.name) return;
        const opName = u.name.trim();
        const opKey = sanitizeOperatorFolderName(opName);
        if (!groups[opKey] && u.role === 'operator') {
          groups[opKey] = {
            operatorName: opName,
            operatorUid: u.id || u.uid || 'anon',
            games: [],
            totalLines: 0,
            totalCollected: 0,
            totalPrizes: 0,
            lastDate: u.lastActive || 'Sin partidas',
          };
        }
      });
    }

    let list = Object.values(groups);

    // Operator visibility constraint:
    // If user is NOT an administrator, they must ONLY see their own operator folder!
    if (!isAdmin && currentUser) {
      const myOpName = (currentUser.name || 'Operadora Principal').trim().toLowerCase();
      const myOpKey = sanitizeOperatorFolderName(currentUser.name || 'Operadora Principal');
      const myOpUid = currentUser.id || currentUser.uid;

      list = list.filter(
        (f) =>
          f.operatorName.trim().toLowerCase() === myOpName ||
          sanitizeOperatorFolderName(f.operatorName) === myOpKey ||
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
  }, [filteredItems, isAdmin, currentUser, registeredUsers, searchQuery]);

  // Subfolders by Day (Día / Fecha) when inside an operator's folder
  const operatorDaysList = useMemo(() => {
    if (!selectedFolderOperator) return [];

    const targetOpName = selectedFolderOperator.trim().toLowerCase();
    const targetOpFolder = sanitizeOperatorFolderName(selectedFolderOperator);
    const folderGames = filteredItems.filter((g) => {
      const gName = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gName);
      return gName === targetOpName || gFolder === targetOpFolder;
    });

    // Agrupar por carpeta de TURNO: fecha de inicio del turno (YYYY-MM-DD) + número de turno.
    // dateKey = clave de la carpeta ("YYYY-MM-DD" o "YYYY-MM-DD#t2"); calendarDate = la fecha.
    const dayMap: Record<
      string,
      {
        dateKey: string;
        calendarDate: string;
        shiftNumber: number;
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
      const calendarDate = getGameNormalizedDateKey(g);
      const dateKey = getGameFolderKey(g);

      if (!dayMap[dateKey]) {
        const todayKey = getCurrentLocalDateKey();
        const yesterdayKey = getPreviousDateKey(todayKey);

        let prefix = '';
        if (calendarDate === todayKey) prefix = 'Hoy - ';
        else if (calendarDate === yesterdayKey) prefix = 'Ayer - ';

        let display = calendarDate;
        let fullDate = calendarDate;
        try {
          const [y, m, d] = calendarDate.split('-').map(Number);
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
          calendarDate,
          shiftNumber: getGameShiftNumber(g),
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

    // If no games exist yet for this operator, only provide today's empty placeholder folder for non-admin operators
    if (Object.keys(dayMap).length === 0 && !isAdmin) {
      const todayKey = getCurrentLocalDateKey();
      const [ty, tm, td] = todayKey.split('-').map(Number);
      const todayObj = new Date(ty, tm - 1, td);
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
        calendarDate: todayKey,
        shiftNumber: 1,
        displayDate: `Hoy - ${todayDisplay}`,
        fullDate: `${capitalizedWeekday}, ${formatted}`,
        formattedDate: todayObj.toLocaleDateString('es-ES'),
        games: [],
        totalLines: 0,
        totalCollected: 0,
        totalPrizes: 0,
        netProfit: 0,
      };
    }

    // Si una fecha tiene más de un turno, cada carpeta lo indica ("· Turno 1", "· Turno 2"...)
    const shiftsPerDate: Record<string, number> = {};
    Object.values(dayMap).forEach((f) => {
      shiftsPerDate[f.calendarDate] = (shiftsPerDate[f.calendarDate] || 0) + 1;
    });
    Object.values(dayMap).forEach((f) => {
      if (f.shiftNumber > 1 || shiftsPerDate[f.calendarDate] > 1) {
        f.displayDate = `${f.displayDate} · Turno ${f.shiftNumber}`;
        f.fullDate = `${f.fullDate} · Turno ${f.shiftNumber}`;
      }
    });

    return Object.values(dayMap).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [selectedFolderOperator, filteredItems, isAdmin]);

  // Actual display list based on folder and day subfolder selection (STRICT ISOLATION)
  const displayItems = useMemo(() => {
    let list = filteredItems;

    if (viewMode === 'folders' && selectedFolderOperator) {
      const targetOpName = selectedFolderOperator.trim().toLowerCase();
      const targetOpFolder = sanitizeOperatorFolderName(selectedFolderOperator);
      list = list.filter((g) => {
        const gName = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
        const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gName);
        return gName === targetOpName || gFolder === targetOpFolder;
      });

      if (selectedFolderDay && selectedFolderDay !== 'all') {
        list = list.filter((g) => getGameFolderKey(g) === selectedFolderDay);
      }
    } else if (!isAdmin && currentUser) {
      const currentOpName = (currentUser.name || 'Operadora Principal').trim().toLowerCase();
      const currentOpFolder = sanitizeOperatorFolderName(currentUser.name || 'Operadora Principal');
      list = list.filter((g) => {
        const gName = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
        const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gName);
        return gName === currentOpName || gFolder === currentOpFolder;
      });
    }

    return list;
  }, [filteredItems, viewMode, selectedFolderOperator, selectedFolderDay, isAdmin, currentUser]);

  // La cuadrícula se muestra por tandas para que la Galería no se trabe con miles de partidas.
  // Contadores, totales y filtros siguen usando TODAS las partidas.
  const GALLERY_PAGE_SIZE = 40;
  const [visibleGalleryCount, setVisibleGalleryCount] = useState(GALLERY_PAGE_SIZE);
  React.useEffect(() => {
    setVisibleGalleryCount(GALLERY_PAGE_SIZE);
  }, [viewMode, selectedFolderOperator, selectedFolderDay, filterMode, sortOrder, searchQuery]);
  const visibleGalleryItems = useMemo(
    () => displayItems.slice(0, visibleGalleryCount),
    [displayItems, visibleGalleryCount]
  );
  const hiddenGalleryCount = Math.max(0, displayItems.length - visibleGalleryItems.length);

  // Day deletion handlers (ONLY ADMIN)
  const handleRequestDeleteDay = (dateKey: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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

    // Check if the operator still has any remaining games; if not, return to main folders view
    const remainingForOp = filteredItems.filter((g) => {
      const gName = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
      const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gName);
      const matchesOp =
        gName === targetOp.trim().toLowerCase() ||
        gFolder === sanitizeOperatorFolderName(targetOp);
      return matchesOp && getGameFolderKey(g) !== targetDay;
    });
    if (remainingForOp.length === 0) {
      setSelectedFolderOperator(null);
    }

    setReorganizeFeedback({
      count: 0,
      total: 0,
      message: `Subcarpeta del día ${targetDay} (${targetOp}) eliminada correctamente.`,
    });
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
    e.preventDefault();
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
      setSelectedFolderDay(null);
    }
    setReorganizeFeedback({
      count: 0,
      total: 0,
      message: `Carpeta de "${targetFolder}" y todas sus partidas fueron eliminadas permanentemente.`,
    });
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
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
    setReorganizeFeedback({
      count: 0,
      total: 0,
      message: `Partida #${target.round} eliminada permanentemente.`,
    });
    onRefreshGallery?.();
  };

  const handleClearAll = async () => {
    if (!isAdmin) return;
    setShowClearConfirm(false);
    await clearAllSavedGamesGallery();
    setSelectedGame(null);
    setSelectedFolderOperator(null);
    setSelectedFolderDay(null);
    setReorganizeFeedback({
      count: 0,
      total: 0,
      message: 'Todas las partidas y carpetas de la galería fueron eliminadas permanentemente.',
    });
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
                    {filteredItems.length} {filteredItems.length === 1 ? 'partida' : 'partidas'}
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

              {isAdmin && filteredItems.length > 0 && (
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
                  📅 {selectedGame.dailyDate} • ⏰ {formatTime12h(selectedGame.timestamp)} ({selectedGame.durationFormatted || '0m 30s'})
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
                                className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 transition-all shadow-2xs cursor-pointer flex items-center gap-1 flex-shrink-0 active:scale-95"
                                title={`Eliminar todas las partidas de la carpeta "${folder.operatorName}"`}
                              >
                                <Trash2 className="w-4 h-4" />
                                <span className="text-[10px] font-black">Borrar</span>
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
                      <span>
                        Ver Todas (
                        {
                          filteredItems.filter((g) => {
                            const gName = (g.operatorName || 'Operadora Principal').trim().toLowerCase();
                            const gFolder = sanitizeOperatorFolderName(g.operatorFolder || gName);
                            return (
                              gName === selectedFolderOperator.trim().toLowerCase() ||
                              gFolder === sanitizeOperatorFolderName(selectedFolderOperator)
                            );
                          }).length
                        }
                        )
                      </span>
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
                      const isToday = dayFolder.calendarDate === getCurrentLocalDateKey();
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
                                      {dayFolder.calendarDate}
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
                                  className="px-2 py-1 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 transition-all shadow-2xs cursor-pointer flex items-center gap-1 flex-shrink-0 active:scale-95"
                                  title={`Eliminar únicamente las partidas de esta carpeta (${dayFolder.displayDate})`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-black">Borrar</span>
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
                                {currentDayInfo.calendarDate}
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
                      {filteredItems.length === 0 ? 'No hay partidas guardadas aún' : 'No se encontraron partidas con ese filtro'}
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                      Cuando finalices y archives una partida mediante el botón <strong>"Nueva Partida"</strong> o cantes un BINGO, la partida quedará registrada aquí con su planilla completa y todos sus datos.
                    </p>
                  </div>
                ) : (
                  <>
                    <GalleryGamesGrid
                      displayItems={visibleGalleryItems}
                      handleOpenGameDetail={handleOpenGameDetail}
                      isAdmin={isAdmin}
                      handleRequestDeleteItem={handleRequestDeleteItem}
                    />
                    {hiddenGalleryCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setVisibleGalleryCount((n) => n + GALLERY_PAGE_SIZE)}
                        className="mt-4 w-full py-3 rounded-2xl bg-orange-100 hover:bg-orange-200 border border-orange-300 text-orange-950 text-sm font-black transition-colors cursor-pointer"
                      >
                        Mostrar {Math.min(GALLERY_PAGE_SIZE, hiddenGalleryCount)} partidas más (quedan {hiddenGalleryCount})
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          ) : (
            /* DETAILED GAME INSPECTOR VIEW - SINGLE PLANE (UN SOLO PLANO DE PANTALLA SIN SCROLL) */
            <GalleryGameInspector
              selectedGame={selectedGame}
              activeTab={activeTab}
              setTable90View={setTable90View}
              table90View={table90View}
              setActiveTab={setActiveTab}
            />
          )}
        </div>
      </div>

      {/* Delete Single Game Confirmation Dialog */}
      {isAdmin && itemToDelete && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in select-none">
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
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in select-none">
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
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in select-none">
          <div className="w-full max-w-md bg-white border-2 border-rose-300 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                <CalendarDays className="w-6 h-6 text-rose-600" />
              </div>
              <div className="flex-1">
                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  ¿Vaciar partidas de la carpeta {operatorDaysList.find((d) => d.dateKey === dayToDelete)?.displayDate || dayToDelete}?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Se eliminarán únicamente las partidas y líneas registradas en esta carpeta ({operatorDaysList.find((d) => d.dateKey === dayToDelete)?.displayDate || dayToDelete}) para la operadora <strong className="text-slate-900">{selectedFolderOperator}</strong>. Ningún otro día ni operadora se verá afectado.
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
