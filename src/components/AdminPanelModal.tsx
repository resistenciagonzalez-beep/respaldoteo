import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Users,
  ShieldCheck,
  Search,
  X,
  Check,
  Download,
  Activity,
  BarChart3,
  CircleDot,
  FileJson,
  FileSpreadsheet,
  Radio,
  Gamepad2,
  Crown,
  Bell,
  UserCheck,
  UserX,
  ArrowUpDown,
  Mail,
  RefreshCw,
  ShieldAlert,
  Calendar,
  Eye,
  Trophy,
  Hash,
  Table2,
  FileDown,
  Printer,
  Trash2,
  Edit3,
  Camera,
  Sparkles,
} from 'lucide-react';
import { AppUser, ActivityLogItem, GameSequenceItem, Traditional90Table, Traditional90Row } from '../types';
import { useAuth } from '../hooks/useAuth';
import {
  getSavedGamesGallery,
  deleteGamePermanently,
  deleteGamesOfDay,
  updateGameUnified,
  subscribeToSavedGamesFirestore,
  getCurrentLocalDateKey,
  getGameNormalizedDateKey,
  subscribeToUsersCentralized,
  subscribeToActivityLogsCentralized,
  updateUserFieldsCentralized,
} from '../utils/savedGamesStorage';
import { downloadGameDirectJpg, downloadGameDirectPdf } from '../utils/exportGameReport';
import { GameSheetSnapshotModal } from './GameSheetSnapshotModal';
import { createDefaultSheet75, createDefaultSheet90 } from '../utils/gameSnapshotStorage';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { currentUser, isAdmin, logActivity } = useAuth();

  const [activeTab, setActiveTab] = useState<'saved_games' | 'activity' | 'users' | 'stats'>('saved_games');
  const [usersList, setUsersList] = useState<AppUser[]>([]);
  const [activitiesList, setActivitiesList] = useState<ActivityLogItem[]>([]);
  const [savedGamesList, setSavedGamesList] = useState<GameSequenceItem[]>([]);
  const [, setIsFirestoreConnected] = useState<boolean>(true);

  // Deletion confirmation modals state
  const [gameToDelete, setGameToDelete] = useState<GameSequenceItem | null>(null);
  const [dayFolderToDelete, setDayFolderToDelete] = useState<string | null>(null);
  const [showConfirmClearFiltered, setShowConfirmClearFiltered] = useState<boolean>(false);
  const deletedGameIdsRef = useRef<Set<string>>(new Set());

  // Search & Filter for Users & Activities
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'operator'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [activityFilterOperator, setActivityFilterOperator] = useState<string>('all');

  // Search & Filter for Saved Games
  const currentLocalDate = getCurrentLocalDateKey();
  const [gameDateFilter, setGameDateFilter] = useState<string>('all');
  const [customDatePicker, setCustomDatePicker] = useState<string>('');
  const [gameOperatorFilter, setGameOperatorFilter] = useState<string>('all');
  const [gameModeFilter, setGameModeFilter] = useState<'all' | '75' | '90'>('all');
  const [gameSearchTerm, setGameSearchTerm] = useState('');

  // Selected game for full detail inspection modal
  const [selectedGameForDetail, setSelectedGameForDetail] = useState<GameSequenceItem | null>(null);

  // Selected game for complete card sheet (planilla) inspection modal
  const [selectedGameForSheetView, setSelectedGameForSheetView] = useState<GameSequenceItem | null>(null);

  // Admin Editing Game State
  const [editingGame, setEditingGame] = useState<GameSequenceItem | null>(null);
  const [editFormRound, setEditFormRound] = useState<number>(1);
  const [editFormWinningPlayer, setEditFormWinningPlayer] = useState<string>('');
  const [editFormTableNumber, setEditFormTableNumber] = useState<string>('');
  const [editFormRowLeader, setEditFormRowLeader] = useState<string>('');
  const [editFormOperatorName, setEditFormOperatorName] = useState<string>('');
  const [editFormTotalCollected, setEditFormTotalCollected] = useState<number>(0);
  const [editFormTotalPrizes, setEditFormTotalPrizes] = useState<number>(0);
  const [editRenameOldPlayer, setEditRenameOldPlayer] = useState<string>('');
  const [editRenameNewPlayer, setEditRenameNewPlayer] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Floating Toast Notifications for real-time events
  const [toasts, setToasts] = useState<
    { id: string; title: string; desc: string; time: string; type: string }[]
  >([]);

  const isFirstLoadRef = useRef(true);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const bannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set());

  useEffect(() => {
    const activeToastTimeouts = toastTimeoutsRef.current;
    return () => {
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current);
      }
      activeToastTimeouts.forEach((timer) => clearTimeout(timer));
      activeToastTimeouts.clear();
    };
  }, []);

  const showBanner = useCallback((msg: string) => {
    setBannerMessage(msg);
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
    }
    bannerTimeoutRef.current = setTimeout(() => {
      setBannerMessage(null);
      bannerTimeoutRef.current = null;
    }, 3500);
  }, []);

  const addToast = useCallback((title: string, desc: string, type: string = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    const newToast = {
      id,
      title,
      desc,
      time: new Date().toLocaleTimeString(),
      type,
    };
    setToasts((prev) => [newToast, ...prev.slice(0, 4)]);

    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimeoutsRef.current.delete(timer);
    }, 4500);
    toastTimeoutsRef.current.add(timer);
  }, []);

  // 1. Real-time listener for Firestore `users` collection via centralized service
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribeUsers = subscribeToUsersCentralized(
      (users) => {
        setIsFirestoreConnected(true);
        setUsersList(users);
      },
      (err) => {
        console.warn('Firestore users listener error:', err);
        setIsFirestoreConnected(false);
      }
    );

    return () => unsubscribeUsers();
  }, [isOpen]);

  // 2. Real-time listener for Firestore `activity_logs` collection via centralized service
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribeActivity = subscribeToActivityLogsCentralized(
      (logs, addedChanges) => {
        setIsFirestoreConnected(true);

        if (!isFirstLoadRef.current) {
          addedChanges.forEach((data) => {
            addToast(
              `Actividad: ${data.action || 'Acción de Operador'}`,
              `${data.operatorName || 'Operador'}: ${data.details || ''}`,
              data.actionType === 'draw_ball' ? 'ball' : data.actionType === 'register' ? 'register' : 'activity'
            );
          });
        }

        setActivitiesList(logs);
        isFirstLoadRef.current = false;
      },
      (err) => {
        console.warn('Firestore activity_logs listener error:', err);
        setIsFirestoreConnected(false);
      }
    );

    return () => unsubscribeActivity();
  }, [isOpen, addToast]);

  // 3. Real-time listener for Firestore `saved_games` collection via centralized service
  useEffect(() => {
    if (!isOpen) return;

    const currentLocal = getSavedGamesGallery().filter(
      (g) => g && g.id && !deletedGameIdsRef.current.has(g.id)
    );
    setSavedGamesList(currentLocal);

    const unsubscribeGames = subscribeToSavedGamesFirestore((games) => {
      setIsFirestoreConnected(true);
      const filtered = games.filter((g) => g && g.id && !deletedGameIdsRef.current.has(g.id));
      filtered.sort((a, b) => (b.round || 0) - (a.round || 0));
      setSavedGamesList(filtered);
    });

    return () => unsubscribeGames();
  }, [isOpen]);

  // Role toggle handler
  const handleToggleRole = async (user: AppUser) => {
    const newRole = user.role === 'admin' ? 'operator' : 'admin';
    try {
      await updateUserFieldsCentralized(user.id, { role: newRole });

      await logActivity(
        'Cambio de Rango de Usuario',
        'role_change',
        `El administrador asignó el rol "${newRole.toUpperCase()}" a ${user.name} (${user.email})`
      );

      showBanner(`Rol de ${user.name} actualizado a ${newRole.toUpperCase()}.`);
    } catch (e: unknown) {
      console.error(e);
      showBanner(`Error al actualizar rol: ${e instanceof Error ? e.message : 'Error'}`);
    }
  };

  // Status toggle handler
  const handleToggleStatus = async (user: AppUser) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active';
    try {
      await updateUserFieldsCentralized(user.id, { status: newStatus });

      await logActivity(
        'Cambio de Estado de Cuenta',
        'status_change',
        `El administrador cambió el estado de ${user.name} a "${newStatus.toUpperCase()}"`
      );

      showBanner(`Estado de ${user.name} cambiado a ${newStatus.toUpperCase()}.`);
    } catch (e: unknown) {
      console.error(e);
      showBanner(`Error al actualizar estado: ${e instanceof Error ? e.message : 'Error'}`);
    }
  };

  // Operator Assigned Mode toggle handler (Admin management)
  const handleToggleAssignedMode = async (user: AppUser) => {
    const newMode: '75' | '90' = user.assignedMode === '90' ? '75' : '90';
    try {
      await updateUserFieldsCentralized(user.id, { assignedMode: newMode });

      await logActivity(
        'Reasignación de Modalidad',
        'role_change',
        `El administrador reasignó la modalidad de ${user.name} (${user.email}) a Bingo ${newMode} Bolas`
      );

      showBanner(`Modalidad de ${user.name} cambiada a Bingo ${newMode} Bolas.`);
    } catch (e: unknown) {
      console.error(e);
      showBanner(`Error al actualizar modalidad: ${e instanceof Error ? e.message : 'Error'}`);
    }
  };

  // -------------------------------------------------------------
  // Filtered Saved Games (Partidas de Operadoras)
  // -------------------------------------------------------------
  const filteredSavedGames = useMemo(() => {
    return savedGamesList.filter((game) => {
      const gameDate = getGameNormalizedDateKey(game);
      // 1. Date Filter
      if (gameDateFilter === 'today') {
        if (gameDate !== currentLocalDate) return false;
      } else if (gameDateFilter === 'custom' && customDatePicker) {
        if (gameDate !== customDatePicker) return false;
      }

      // 2. Operator Filter
      if (gameOperatorFilter !== 'all') {
        if (game.operatorUid !== gameOperatorFilter && game.operatorName !== gameOperatorFilter) {
          return false;
        }
      }

      // 3. Mode Filter
      if (gameModeFilter !== 'all') {
        if (game.mode !== gameModeFilter) return false;
      }

      // 4. Text Search
      if (gameSearchTerm.trim()) {
        const term = gameSearchTerm.toLowerCase();
        const matchesRound = `partida ${game.round}`.includes(term) || `ronda ${game.round}`.includes(term) || `${game.round}` === term;
        const matchesOperator = (game.operatorName || '').toLowerCase().includes(term) || (game.operatorEmail || '').toLowerCase().includes(term);
        const matchesWinner = (game.winningPlayerName || '').toLowerCase().includes(term);
        const matchesBall = `bola ${game.ballNumber}`.includes(term) || `${game.ballNumber}` === term;
        if (!matchesRound && !matchesOperator && !matchesWinner && !matchesBall) {
          return false;
        }
      }

      return true;
    });
  }, [savedGamesList, gameDateFilter, customDatePicker, gameOperatorFilter, gameModeFilter, gameSearchTerm, currentLocalDate]);

  // List of distinct operators who have saved games
  const savedGamesOperators = useMemo(() => {
    const map = new Map<string, string>();
    savedGamesList.forEach((g) => {
      if (g.operatorName) {
        map.set(g.operatorUid || g.operatorName, g.operatorName);
      }
    });
    return Array.from(map.entries());
  }, [savedGamesList]);

  // -------------------------------------------------------------
  // Daily Lines Counter & Stats (EXCLUSIVE FOR ADMIN)
  // -------------------------------------------------------------
  const todayGames = useMemo(() => {
    return savedGamesList.filter((g) => getGameNormalizedDateKey(g) === currentLocalDate);
  }, [savedGamesList, currentLocalDate]);

  const todayLinesTotal = useMemo(() => {
    return todayGames.reduce((acc, g) => acc + (g.totalLinesPlayed || 68), 0);
  }, [todayGames]);

  // Selected date games & lines based on active date filter
  const selectedDateGames = useMemo(() => {
    if (gameDateFilter === 'today') {
      return savedGamesList.filter((g) => getGameNormalizedDateKey(g) === currentLocalDate);
    }
    if (gameDateFilter === 'custom' && customDatePicker) {
      return savedGamesList.filter((g) => getGameNormalizedDateKey(g) === customDatePicker);
    }
    return savedGamesList;
  }, [savedGamesList, gameDateFilter, customDatePicker, currentLocalDate]);

  const selectedDateLinesTotal = useMemo(() => {
    return selectedDateGames.reduce(
      (acc, g) =>
        acc +
        (g.totalLinesPlayed ??
          (g.mode === '90'
            ? 30
            : (g.sheet75Snapshot?.columns?.reduce((sum, c) => sum + (Number(c.multiplier) || 1), 0) || 11))),
      0
    );
  }, [selectedDateGames]);

  // Breakdown of lines and games played by operator today
  const todayOperatorsBreakdown = useMemo(() => {
    const map = new Map<string, { operatorName: string; gamesCount: number; linesTotal: number }>();
    todayGames.forEach((g) => {
      const op = g.operatorName || 'Principal';
      if (!map.has(op)) {
        map.set(op, { operatorName: op, gamesCount: 0, linesTotal: 0 });
      }
      const entry = map.get(op)!;
      entry.gamesCount += 1;
      entry.linesTotal +=
        g.totalLinesPlayed ??
        (g.mode === '90'
          ? 30
          : (g.sheet75Snapshot?.columns?.reduce((sum, c) => sum + (Number(c.multiplier) || 1), 0) || 11));
    });
    return Array.from(map.values());
  }, [todayGames]);

  // Daily summary aggregating total lines played across all dates
  const dailyLinesSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        gamesCount: number;
        linesTotal: number;
        operators: Set<string>;
        collected: number;
        prizes: number;
      }
    >();
    savedGamesList.forEach((g) => {
      const d = getGameNormalizedDateKey(g);
      if (!map.has(d)) {
        map.set(d, {
          date: d,
          gamesCount: 0,
          linesTotal: 0,
          operators: new Set(),
          collected: 0,
          prizes: 0,
        });
      }
      const entry = map.get(d)!;
      entry.gamesCount += 1;
      entry.linesTotal +=
        g.totalLinesPlayed ??
        (g.mode === '90'
          ? 30
          : (g.sheet75Snapshot?.columns?.reduce((sum, c) => sum + (Number(c.multiplier) || 1), 0) || 11));
      if (g.operatorName) entry.operators.add(g.operatorName);
      entry.collected += (g.totalCollected || 0);
      entry.prizes += (g.totalPrizesPaid || 0);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [savedGamesList]);

  // Request deletion of an individual game (opens in-app confirmation modal)
  const handleDeleteGame = (game: GameSequenceItem) => {
    setGameToDelete(game);
  };

  // Confirm and execute permanent deletion of the game
  const handleConfirmDeleteGame = async () => {
    if (!gameToDelete) return;
    const game = gameToDelete;
    setGameToDelete(null);

    try {
      if (game.id) deletedGameIdsRef.current.add(game.id);
      await deleteGamePermanently(game);
      setSavedGamesList((prev) =>
        prev.filter((g) => {
          if (game.id && g.id === game.id) return false;
          if (g.round === game.round && g.timestamp === game.timestamp) return false;
          return true;
        })
      );
      if (
        selectedGameForDetail &&
        (selectedGameForDetail.id === game.id ||
          (selectedGameForDetail.round === game.round && selectedGameForDetail.timestamp === game.timestamp))
      ) {
        setSelectedGameForDetail(null);
      }
      showBanner(`Partida #${game.round} eliminada permanentemente.`);
    } catch (err: unknown) {
      console.error('Error deleting game:', err);
      showBanner(`Error al eliminar partida: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  // Request clear all saved games in active date filter (opens in-app confirmation modal)
  const handleClearFilteredGames = () => {
    if (filteredSavedGames.length === 0) return;
    setShowConfirmClearFiltered(true);
  };

  // Confirm and execute clearing of all filtered games
  const handleConfirmClearFilteredGames = async () => {
    setShowConfirmClearFiltered(false);
    if (filteredSavedGames.length === 0) return;

    try {
      const targetList = [...filteredSavedGames];
      for (const g of targetList) {
        if (g.id) deletedGameIdsRef.current.add(g.id);
        await deleteGamePermanently(g);
      }
      const idsToDelete = new Set(targetList.map((g) => g.id).filter(Boolean));
      setSavedGamesList((prev) => prev.filter((g) => !idsToDelete.has(g.id)));
      showBanner(`${targetList.length} partidas eliminadas permanentemente.`);
    } catch (err: unknown) {
      console.error('Error clearing filtered games:', err);
      showBanner(`Error al eliminar partidas: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  // -------------------------------------------------------------
  // ADMIN EDIT SAVED GAME HANDLERS
  // -------------------------------------------------------------
  const handleOpenEditGameModal = (game: GameSequenceItem) => {
    setEditingGame(game);
    setEditFormRound(game.round || 1);
    setEditFormWinningPlayer(game.winningPlayerName || '');
    setEditFormTableNumber(game.tableNumber !== undefined ? String(game.tableNumber) : '');
    setEditFormRowLeader(game.rowLeader !== undefined ? String(game.rowLeader) : '');
    setEditFormOperatorName(game.operatorName || 'Operadora');
    setEditFormTotalCollected(game.totalCollected || 0);
    setEditFormTotalPrizes(game.totalPrizesPaid || 0);
    setEditRenameOldPlayer('');
    setEditRenameNewPlayer('');
  };

  const handleSaveGameModifications = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGame) return;

    setIsSavingEdit(true);
    try {
      const collected = Number(editFormTotalCollected) || 0;
      const prizes = Number(editFormTotalPrizes) || 0;
      const netProfit = Number((collected - prizes).toFixed(2));

      const updatedGame: GameSequenceItem = {
        ...editingGame,
        round: Number(editFormRound) || editingGame.round,
        winningPlayerName: editFormWinningPlayer.trim() || undefined,
        tableNumber: editFormTableNumber.trim() ? Number(editFormTableNumber) : undefined,
        rowLeader: editFormRowLeader.trim() ? Number(editFormRowLeader) : undefined,
        operatorName: editFormOperatorName.trim() || editingGame.operatorName,
        totalCollected: collected,
        totalPrizesPaid: prizes,
        netProfit,
      };

      // If administrator requested renaming a misannotated player across sheet
      if (editRenameOldPlayer.trim() && editRenameNewPlayer.trim()) {
        const oldName = editRenameOldPlayer.trim().toLowerCase();
        const newName = editRenameNewPlayer.trim();

        if (updatedGame.winningPlayerName && updatedGame.winningPlayerName.toLowerCase() === oldName) {
          updatedGame.winningPlayerName = newName;
        }

        if (updatedGame.sheet75Snapshot?.columns) {
          updatedGame.sheet75Snapshot = {
            ...updatedGame.sheet75Snapshot,
            columns: updatedGame.sheet75Snapshot.columns.map((col) => ({
              ...col,
              cells: col.cells.map((cell) => ({
                ...cell,
                playerName: cell.playerName && cell.playerName.toLowerCase() === oldName ? newName : cell.playerName,
              })),
            })),
          };
        }

        if (updatedGame.sheet90Snapshot) {
          const updateTable = (t: Traditional90Table): Traditional90Table => ({
            ...t,
            rows: (t.rows || []).map((r: Traditional90Row) => ({
              ...r,
              playerName: r.playerName && r.playerName.toLowerCase() === oldName ? newName : r.playerName,
            })),
          });

          updatedGame.sheet90Snapshot = {
            ...updatedGame.sheet90Snapshot,
            table1: updatedGame.sheet90Snapshot.table1 ? updateTable(updatedGame.sheet90Snapshot.table1) : updatedGame.sheet90Snapshot.table1,
            table2: updatedGame.sheet90Snapshot.table2 ? updateTable(updatedGame.sheet90Snapshot.table2) : updatedGame.sheet90Snapshot.table2,
            tables: updatedGame.sheet90Snapshot.tables?.map(updateTable),
          };
        }
      }

      const { game: verifiedGame } = await updateGameUnified(updatedGame);

      // Update state with confirmed Firestore document
      setSavedGamesList((prev) => prev.map((g) => (g.id === verifiedGame.id ? verifiedGame : g)));
      if (selectedGameForDetail && selectedGameForDetail.id === verifiedGame.id) {
        setSelectedGameForDetail(verifiedGame);
      }

      await logActivity(
        'Modificación de Partida Guardada',
        'sheet_update',
        `El administrador editó la partida #${updatedGame.round} (Operadora: ${updatedGame.operatorName})`
      );

      showBanner(`Partida #${updatedGame.round} modificada y guardada correctamente.`);
      setEditingGame(null);
    } catch (err: unknown) {
      console.error('Error saving game modifications:', err);
      showBanner(`Error al guardar cambios: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // -------------------------------------------------------------
  // EXPORT / DOWNLOAD SAVED GAMES (Complete info)
  // -------------------------------------------------------------
  // 1. Export as Full JSON (Includes COMPLETE copy of every game's card sheet / planilla)
  const handleExportSavedGamesJSON = () => {
    if (filteredSavedGames.length === 0) {
      showBanner('No hay partidas guardadas para exportar en este filtro.');
      return;
    }

    const exportPayload = {
      title: 'Reporte Completo de Partidas Guardadas de Bingo con Copias de Planillas',
      exportedAt: new Date().toISOString(),
      adminExporter: {
        name: currentUser?.name || 'Administrador',
        email: currentUser?.email || '',
      },
      totalGames: filteredSavedGames.length,
      filterApplied: {
        date: gameDateFilter === 'custom' ? customDatePicker : gameDateFilter,
        operator: gameOperatorFilter,
        mode: gameModeFilter,
      },
      games: filteredSavedGames.map((g) => {
        const isBingo90 = g.mode === '90' || g.sheetType === 'traditional-90';
        const fullSheet = isBingo90
          ? (g.sheet90Snapshot || createDefaultSheet90())
          : (g.sheet75Snapshot || createDefaultSheet75());

        return {
          id: g.id,
          round: g.round,
          mode: g.mode,
          sheetType: g.sheetType,
          dateFormatted: g.dateFormatted,
          dailyDate: g.dailyDate,
          timestamp: g.timestamp,
          operator: {
            uid: g.operatorUid,
            name: g.operatorName,
            email: g.operatorEmail,
          },
          winningBall: {
            number: g.ballNumber,
            letter: g.letter,
            rowLeader: g.rowLeader,
          },
          winner: {
            playerName: g.winningPlayerName || 'Sin asignar',
            tableNumber: g.tableNumber || null,
          },
          metrics: {
            durationSeconds: g.durationSeconds,
            durationFormatted: g.durationFormatted,
            totalBallsDrawnCount: g.totalBallsDrawnCount || g.drawnBallsPlayed?.length || 0,
            totalCollected: g.totalCollected || 0,
            totalPrizesPaid: g.totalPrizesPaid || 0,
            netProfit: g.netProfit || 0,
            currency: g.currency || '$',
          },
          drawnBallsSequence: g.drawnBallsPlayed || [],
          // COPIA COMPLETA DE LA PLANILLA DE LA PARTIDA GUARDADA
          sheetCopy: fullSheet,
          sheet75Snapshot: g.sheet75Snapshot || (!isBingo90 ? fullSheet : null),
          sheet90Snapshot: g.sheet90Snapshot || (isBingo90 ? fullSheet : null),
        };
      }),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateLabel = gameDateFilter === 'today' ? `hoy_${currentLocalDate}` : gameDateFilter === 'custom' ? customDatePicker : 'todas';
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `partidas_completas_con_planillas_bingo_${dateLabel}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showBanner(`Descargadas ${filteredSavedGames.length} partidas con sus planillas completas en formato JSON.`);
  };

  // 2. Export ONLY the Complete Card Sheets (Planillas) of all filtered games in JSON
  const handleExportAllSheetsJSON = () => {
    if (filteredSavedGames.length === 0) {
      showBanner('No hay partidas guardadas para exportar en este filtro.');
      return;
    }

    const exportPayload = {
      title: 'Copias Completas de Planillas de Bingo',
      description: 'Copia íntegra de cada planilla (tablas, columnas, casillas, jugadores asignados, costos y premios) de cada partida registrada',
      exportedAt: new Date().toISOString(),
      adminExporter: {
        name: currentUser?.name || 'Administrador',
        email: currentUser?.email || '',
      },
      totalPlanillas: filteredSavedGames.length,
      filterApplied: {
        date: gameDateFilter === 'custom' ? customDatePicker : gameDateFilter,
        operator: gameOperatorFilter,
        mode: gameModeFilter,
      },
      planillas: filteredSavedGames.map((g) => {
        const isBingo90 = g.mode === '90' || g.sheetType === 'traditional-90';
        const sheetCopy = isBingo90
          ? (g.sheet90Snapshot || createDefaultSheet90())
          : (g.sheet75Snapshot || createDefaultSheet75());

        return {
          gameId: g.id,
          round: g.round,
          mode: isBingo90 ? 'Bingo 90' : 'Bingo 75',
          sheetType: g.sheetType,
          date: g.dailyDate || g.dateFormatted,
          time: g.timestamp,
          operatorName: g.operatorName,
          operatorEmail: g.operatorEmail,
          winningBall: g.ballNumber,
          winningLetter: g.letter,
          winningPlayer: g.winningPlayerName || 'Sin asignar',
          winningRow: g.rowLeader,
          tableNumber: g.tableNumber,
          financials: {
            totalCollected: g.totalCollected,
            totalPrizesPaid: g.totalPrizesPaid,
            netProfit: g.netProfit,
            currency: g.currency || '$',
          },
          drawnBallsSequence: g.drawnBallsPlayed || [],
          // Estructura completa de la planilla
          sheetData: sheetCopy,
        };
      }),
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    const dateLabel = gameDateFilter === 'today' ? `hoy_${currentLocalDate}` : gameDateFilter === 'custom' ? customDatePicker : 'todas';
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `copias_planillas_bingo_${dateLabel}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showBanner(`Descargadas ${filteredSavedGames.length} copias completas de planillas en formato JSON.`);
  };

  // 3. Export as Full CSV (Excel friendly)
  const handleExportSavedGamesCSV = () => {
    if (filteredSavedGames.length === 0) {
      showBanner('No hay partidas guardadas para exportar en este filtro.');
      return;
    }

    const headers = [
      'ID Partida',
      'Fecha (YYYY-MM-DD)',
      'Hora',
      'Operadora / Host',
      'Correo Operadora',
      'Ronda / Nro Partida',
      'Modo Bingo',
      'Tipo de Planilla',
      'Duracion',
      'Duracion (Segundos)',
      'Total Bolas Cantadas',
      'Bola Ganadora',
      'Letra',
      'Fila / Linea Ganadora',
      'Jugador Ganador',
      'Mesa / Carton',
      'Total Recaudado ($)',
      'Total Premios ($)',
      'Ganancia Neta ($)',
      'Copia de Planilla Incluida',
      'Secuencia Completa de Bolas',
    ];

    const rows = filteredSavedGames.map((g) => {
      const ballsSeq = (g.drawnBallsPlayed || []).join(' - ');
      return [
        `"${g.id || ''}"`,
        `"${g.dailyDate || g.dateFormatted || ''}"`,
        `"${g.timestamp || ''}"`,
        `"${(g.operatorName || 'Operadora').replace(/"/g, '""')}"`,
        `"${(g.operatorEmail || '').replace(/"/g, '""')}"`,
        `"${g.round || 1}"`,
        `"${g.mode === '90' ? 'Bingo 90' : 'Bingo 75'}"`,
        `"${g.sheetType || ''}"`,
        `"${g.durationFormatted || ''}"`,
        `"${g.durationSeconds || 0}"`,
        `"${g.drawnBallsPlayed?.length || g.totalBallsDrawnCount || 0}"`,
        `"${g.ballNumber || ''}"`,
        `"${g.letter || ''}"`,
        `"${g.rowLeader || ''}"`,
        `"${(g.winningPlayerName || 'Sin asignar').replace(/"/g, '""')}"`,
        `"${g.tableNumber || ''}"`,
        `"${g.totalCollected || 0}"`,
        `"${g.totalPrizesPaid || 0}"`,
        `"${g.netProfit || 0}"`,
        `"SI (COMPLETA)"`,
        `"${ballsSeq}"`,
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const downloadAnchor = document.createElement('a');
    const dateLabel = gameDateFilter === 'today' ? `hoy_${currentLocalDate}` : gameDateFilter === 'custom' ? customDatePicker : 'todas';
    downloadAnchor.setAttribute('href', encodeURI(csvContent));
    downloadAnchor.setAttribute('download', `partidas_diarias_bingo_${dateLabel}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showBanner(`Archivo CSV con ${filteredSavedGames.length} partidas descargado en tu dispositivo.`);
  };

  // 4. Export single game CARD SHEET COPY in JSON
  const handleExportSinglePlanillaJSON = (game: GameSequenceItem) => {
    const isBingo90 = game.mode === '90' || game.sheetType === 'traditional-90';
    const sheetData = isBingo90
      ? (game.sheet90Snapshot || createDefaultSheet90())
      : (game.sheet75Snapshot || createDefaultSheet75());

    const payload = {
      title: `Copia Completa de Planilla - Partida #${game.round}`,
      exportedAt: new Date().toISOString(),
      adminExporter: currentUser?.name || 'Administrador',
      gameDetails: {
        round: game.round,
        mode: isBingo90 ? 'Bingo 90 Bolas' : 'Bingo 75 Bolas',
        sheetType: game.sheetType,
        date: game.dailyDate || game.dateFormatted,
        time: game.timestamp,
        operator: {
          uid: game.operatorUid,
          name: game.operatorName,
          email: game.operatorEmail,
        },
        winningBall: {
          number: game.ballNumber,
          letter: game.letter,
          rowLeader: game.rowLeader,
        },
        winningPlayer: game.winningPlayerName || 'Sin asignar',
        tableNumber: game.tableNumber || null,
        financials: {
          totalCollected: game.totalCollected || 0,
          totalPrizesPaid: game.totalPrizesPaid || 0,
          netProfit: game.netProfit || 0,
          currency: game.currency || '$',
        },
        drawnBallsPlayed: game.drawnBallsPlayed || [],
      },
      sheetSnapshot: sheetData,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `copia_completa_planilla_partida_${game.round}_${game.mode || '75'}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showBanner(`Copia completa de la planilla de la partida #${game.round} descargada en JSON.`);
  };

  // 6. Export single game CARD SHEET COPY in CSV (Excel format)
  const handleExportSinglePlanillaCSV = (game: GameSequenceItem) => {
    const isBingo90 = game.mode === '90' || game.sheetType === 'traditional-90';
    let csvContent = '';

    if (isBingo90) {
      const sheet = game.sheet90Snapshot || createDefaultSheet90();
      const allTables = sheet.tables && sheet.tables.length > 0 ? sheet.tables : [sheet.table1, sheet.table2].filter(Boolean);

      const meta = [
        ['COPIA COMPLETA DE PLANILLA DE BINGO 90 (TRIPLETAS)'],
        ['Partida #', game.round],
        ['Fecha', game.dailyDate || game.dateFormatted || 'Hoy'],
        ['Hora', game.timestamp || ''],
        ['Operadora', game.operatorName || 'Principal'],
        ['Correo Operadora', game.operatorEmail || ''],
        ['Anfitrión', sheet.hostName || 'No especificado'],
        ['Teléfono', sheet.hostPhone || 'No especificado'],
        ['Precio por Fila ($)', sheet.pricePerRow || 1.0],
        ['Bola Ganadora', game.ballNumber],
        ['Jugador Ganador', game.winningPlayerName || 'Sin asignar'],
        ['Mesa Ganadora', game.tableNumber ? `Planilla #${game.tableNumber}` : 'N/A'],
        ['Línea / Fila Ganadora', game.rowLeader ? `Fila #${game.rowLeader}` : 'N/A'],
        ['Total Recaudado ($)', game.totalCollected || 0],
        ['Total Premios ($)', game.totalPrizesPaid || 0],
        ['Ganancia Neta ($)', game.netProfit || 0],
        ['Bolas Cantadas Jugadas', (game.drawnBallsPlayed || []).join(' - ')],
        [],
        ['TABLA DETALLADA DE LA PLANILLA'],
        ['Mesa / Planilla', 'Fila', 'Número 1 (1-30)', 'Número 2 (31-60)', 'Número 3 (61-90)', 'Jugador Asignado', 'Estado Pago', 'Precio Fila ($)', 'Premio Estimado ($)', '¿Es Fila Ganadora?'],
      ];

      const rows: string[][] = [];
      allTables.forEach((table, tIdx) => {
        const tblNum = table.tableNumber || tIdx + 1;
        (table.rows || []).forEach((row) => {
          const isWinningRow = (tblNum === game.tableNumber || !game.tableNumber) && row.rowNumber === game.rowLeader;
          rows.push([
            `"Planilla ${tblNum}"`,
            `"Fila ${row.rowNumber}"`,
            `"${row.numbers[0]}"`,
            `"${row.numbers[1]}"`,
            `"${row.numbers[2]}"`,
            `"${(row.playerName || 'Sin asignar').replace(/"/g, '""')}"`,
            `"${row.paid ? 'PAGADO' : 'PENDIENTE'}"`,
            `"${table.pricePerRow || sheet.pricePerRow || 1.0}"`,
            `"${table.prize || 25.0}"`,
            `"${isWinningRow ? 'SI (GANADORA)' : 'NO'}"`,
          ]);
        });
      });

      const metaStr = meta.map((m) => m.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const rowsStr = rows.map((r) => r.join(',')).join('\n');
      csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + metaStr + '\n' + rowsStr;
    } else {
      const sheet = game.sheet75Snapshot || createDefaultSheet75();
      const meta = [
        ['COPIA COMPLETA DE PLANILLA DE BINGO 75 (POR COLUMNAS Y MULTIPLICADORES)'],
        ['Partida #', game.round],
        ['Fecha', game.dailyDate || game.dateFormatted || 'Hoy'],
        ['Hora', game.timestamp || ''],
        ['Operadora', game.operatorName || 'Principal'],
        ['Correo Operadora', game.operatorEmail || ''],
        ['Título de la Planilla', sheet.title || 'Planilla Oficial'],
        ['Subtítulo', sheet.subtitle || ''],
        ['Anfitrión', sheet.hostName || 'No especificado'],
        ['Teléfono', sheet.hostPhone || 'No especificado'],
        ['Costo Base por X1 ($)', sheet.baseCost || 0.10],
        ['Premio Base por X1 ($)', sheet.basePrize || 1.35],
        ['Bola Ganadora', `${game.letter ? `${game.letter}-` : ''}${game.ballNumber}`],
        ['Jugador Ganador', game.winningPlayerName || 'Sin asignar'],
        ['Línea Ganadora', game.rowLeader ? `Línea #${game.rowLeader}` : 'N/A'],
        ['Total Recaudado ($)', game.totalCollected || 0],
        ['Total Premios ($)', game.totalPrizesPaid || 0],
        ['Ganancia Neta ($)', game.netProfit || 0],
        ['Bolas Cantadas Jugadas', (game.drawnBallsPlayed || []).join(' - ')],
        [],
        ['DETALLE DE CASILLAS Y COLUMNAS'],
        ['Columna', 'Multiplicador', 'Fila (Línea)', 'B (1-15)', 'I (16-30)', 'N (31-45)', 'G (46-60)', 'O (61-75)', 'Jugador Asignado', 'Precio Casilla ($)', 'Premio Casilla ($)', '¿Línea Ganadora?'],
      ];

      const rows: string[][] = [];
      (sheet.columns || []).forEach((col) => {
        const mult = col.multiplier || 1;
        const colTitle = col.title || `Col ${col.colNumber}`;
        const price = col.columnPrice !== undefined ? col.columnPrice : mult * (sheet.baseCost || 0.10);
        const prize = col.columnPrize !== undefined ? col.columnPrize : mult * (sheet.basePrize || 1.35);

        (col.cells || []).forEach((cell) => {
          const rNum = cell.rowNumber;
          const isWinningLine = rNum === game.rowLeader;
          rows.push([
            `"${colTitle}"`,
            `"${mult}x"`,
            `"Fila ${rNum}"`,
            `"${rNum}"`,
            `"${rNum + 15}"`,
            `"${rNum + 30}"`,
            `"${rNum + 45}"`,
            `"${rNum + 60}"`,
            `"${(cell.playerName || 'Sin asignar').replace(/"/g, '""')}"`,
            `"${price.toFixed(2)}"`,
            `"${prize.toFixed(2)}"`,
            `"${isWinningLine ? 'SI (GANADORA)' : 'NO'}"`,
          ]);
        });
      });

      const metaStr = meta.map((m) => m.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const rowsStr = rows.map((r) => r.join(',')).join('\n');
      csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + metaStr + '\n' + rowsStr;
    }

    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', encodeURI(csvContent));
    downloadAnchor.setAttribute('download', `copia_planilla_partida_${game.round}_${game.mode || '75'}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showBanner(`Copia de la planilla de la partida #${game.round} descargada en CSV (Excel).`);
  };

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchSearch =
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.id && u.id.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchRole = roleFilter === 'all' || u.role === roleFilter;
      const matchStatus = statusFilter === 'all' || u.status === statusFilter;

      return matchSearch && matchRole && matchStatus;
    });
  }, [usersList, searchTerm, roleFilter, statusFilter]);

  // Filtered activities list
  const filteredActivities = useMemo(() => {
    return activitiesList.filter((act) => {
      if (activityFilterOperator !== 'all' && act.operatorUid !== activityFilterOperator) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          act.action.toLowerCase().includes(term) ||
          (act.details && act.details.toLowerCase().includes(term)) ||
          act.operatorName.toLowerCase().includes(term) ||
          act.operatorEmail.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [activitiesList, activityFilterOperator, searchTerm]);

  if (!isOpen) return null;

  // Strict RBAC: Check if current user is Admin
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none">
        <div className="w-full max-w-md bg-[#fffaf5] border-2 border-rose-300 rounded-3xl p-6 text-[#431407] shadow-2xl flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 shadow-xs">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-black text-rose-950">Acceso Restringido</h2>
            <p className="text-xs text-rose-900/80 mt-1 font-semibold leading-relaxed">
              El Panel de Administrador y la descarga de partidas guardadas están reservados exclusivamente para usuarios con rango de <strong>ADMINISTRADOR</strong>.
            </p>
            <p className="text-[11px] text-orange-900/70 mt-2">
              Tu cuenta actual ({currentUser?.email || 'Invitado'}) tiene rango de <strong>{currentUser?.role === 'operator' ? 'Operador' : 'Sin autenticar'}</strong>.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer"
          >
            Entendido, volver a la plataforma
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/65 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-6xl max-h-[94vh] flex flex-col rounded-3xl border-2 border-orange-300 bg-[#fffaf5] text-[#431407] shadow-2xl overflow-hidden relative">
        {/* Floating Toast Alerts for Live Operator Actions */}
        <div className="absolute top-16 right-4 z-70 flex flex-col gap-2 pointer-events-none max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="p-3 rounded-2xl bg-white/95 border-2 border-orange-400 text-orange-950 shadow-xl backdrop-blur-md flex items-start gap-2.5 animate-slide-in pointer-events-auto"
            >
              <div className="w-7 h-7 rounded-xl bg-orange-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-black text-xs text-orange-950 truncate">{t.title}</span>
                  <span className="text-[10px] text-orange-900/60 font-mono flex-shrink-0">{t.time}</span>
                </div>
                <p className="text-[11px] text-orange-900/80 font-medium leading-tight mt-0.5 line-clamp-2">
                  {t.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-b border-orange-200 bg-gradient-to-r from-orange-100 via-amber-100 to-orange-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 border border-orange-600 flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight leading-tight text-[#431407]">
                  Panel de Administrador en Tiempo Real
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Firestore Live
                </span>
              </div>
              <p className="text-xs text-orange-900/70 font-semibold">
                Supervisión de operadoras, descarga de partidas diarias y control de accesos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white border border-orange-200 text-xs font-bold text-orange-950 shadow-xs">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              <span>Admin: {currentUser?.name}</span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-orange-200/80 text-orange-950 transition-colors border border-orange-300/50 cursor-pointer"
              title="Cerrar panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center px-4 sm:px-6 bg-white border-b border-orange-200 gap-1 overflow-x-auto flex-shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('saved_games')}
            className={`py-2.5 px-3.5 text-xs font-black border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'saved_games'
                ? 'border-orange-500 text-orange-950'
                : 'border-transparent text-orange-900/60 hover:text-orange-950'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-600" />
            <span>Partidas Guardadas ({savedGamesList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('activity')}
            className={`py-2.5 px-3.5 text-xs font-black border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'activity'
                ? 'border-orange-500 text-orange-950'
                : 'border-transparent text-orange-900/60 hover:text-orange-950'
            }`}
          >
            <Radio className="w-4 h-4 text-rose-600 animate-pulse" />
            <span>Actividad en Vivo ({activitiesList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`py-2.5 px-3.5 text-xs font-black border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'users'
                ? 'border-orange-500 text-orange-950'
                : 'border-transparent text-orange-900/60 hover:text-orange-950'
            }`}
          >
            <Users className="w-4 h-4 text-orange-600" />
            <span>Operadores y Admins ({usersList.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stats')}
            className={`py-2.5 px-3.5 text-xs font-black border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'stats'
                ? 'border-orange-500 text-orange-950'
                : 'border-transparent text-orange-900/60 hover:text-orange-950'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-amber-600" />
            <span>Métricas del Sistema</span>
          </button>
        </div>

        {/* Feedback Banner */}
        {bannerMessage && (
          <div className="px-4 py-2 bg-emerald-100 border-b border-emerald-300 text-emerald-950 text-xs font-bold flex items-center justify-between animate-fade-in flex-shrink-0">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-700" />
              <span>{bannerMessage}</span>
            </div>
            <button onClick={() => setBannerMessage(null)} className="text-emerald-800 hover:text-emerald-950 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 1: PARTIDAS GUARDADAS DE LAS OPERADORAS                   */}
        {/* ============================================================= */}
        {activeTab === 'saved_games' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Filter and Export Bar */}
            <div className="px-4 py-3 sm:px-6 bg-orange-50/70 border-b border-orange-200 flex flex-col gap-2.5 flex-shrink-0">
              {/* Row 1: Search & Filters */}
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  {/* Search Term */}
                  <div className="relative min-w-[200px] flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-900/50" />
                    <input
                      type="text"
                      placeholder="Buscar por ronda, operadora, bola..."
                      value={gameSearchTerm}
                      onChange={(e) => setGameSearchTerm(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-orange-200 bg-white text-xs font-semibold text-orange-950 placeholder-orange-300 focus:outline-none focus:border-orange-500 shadow-xs"
                    />
                  </div>

                  {/* Filter by Date: Quick Buttons & Picker */}
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-orange-200 shadow-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setGameDateFilter('all');
                        setCustomDatePicker('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        gameDateFilter === 'all'
                          ? 'bg-orange-500 text-white shadow-xs'
                          : 'text-orange-900/70 hover:text-orange-950'
                      }`}
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGameDateFilter('today');
                        setCustomDatePicker('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        gameDateFilter === 'today'
                          ? 'bg-orange-500 text-white shadow-xs'
                          : 'text-orange-900/70 hover:text-orange-950'
                      }`}
                    >
                      Hoy
                    </button>
                    <input
                      type="date"
                      value={customDatePicker}
                      onChange={(e) => {
                        setCustomDatePicker(e.target.value);
                        if (e.target.value) {
                          setGameDateFilter('custom');
                        } else {
                          setGameDateFilter('all');
                        }
                      }}
                      className="px-2 py-0.5 rounded-lg border border-orange-200 text-xs font-semibold text-orange-950 focus:outline-none focus:border-orange-500 cursor-pointer"
                      title="Seleccionar fecha específica"
                    />
                  </div>

                  {/* Filter by Operator */}
                  <select
                    value={gameOperatorFilter}
                    onChange={(e) => setGameOperatorFilter(e.target.value)}
                    className="py-1.5 px-2.5 rounded-xl border border-orange-200 bg-white text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 cursor-pointer shadow-xs max-w-[190px]"
                  >
                    <option value="all">Todas las Operadoras</option>
                    {savedGamesOperators.map(([uid, name]) => (
                      <option key={uid} value={uid}>
                        🎮 {name}
                      </option>
                    ))}
                  </select>

                  {/* Filter by Mode */}
                  <select
                    value={gameModeFilter}
                    onChange={(e) => setGameModeFilter(e.target.value as 'all' | '75' | '90')}
                    className="py-1.5 px-2.5 rounded-xl border border-orange-200 bg-white text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 cursor-pointer shadow-xs"
                  >
                    <option value="all">Todos los Modos</option>
                    <option value="75">Bingo 75</option>
                    <option value="90">Bingo 90</option>
                  </select>
                </div>

                {/* Export Buttons: "Guardar en su dispositivo" */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportSavedGamesCSV}
                    className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                    title="Descargar archivo Excel / CSV con todas las partidas filtradas a tu dispositivo"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Descargar CSV (Excel)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportSavedGamesJSON}
                    className="py-1.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs shadow-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                    title="Descargar toda la información completa de las partidas y sus planillas en JSON a tu dispositivo"
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    <span>Guardar JSON Completo</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportAllSheetsJSON}
                    className="py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                    title="Descargar copia íntegra de todas las planillas de las partidas filtradas en formato JSON"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    <span>Copias de Planillas (JSON)</span>
                  </button>
                </div>
              </div>

              {/* Daily Lines Counter Banner (EXCLUSIVE TO ADMIN) */}
              <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-purple-900 text-white rounded-2xl p-3.5 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-3 border border-purple-400/40">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center text-white shadow-xs flex-shrink-0">
                    <Hash className="w-6 h-6 text-yellow-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-yellow-400 text-purple-950 px-2 py-0.5 rounded-md">
                        Control Diario Exclusivo de Admin
                      </span>
                      <span className="text-xs text-purple-200 font-bold">
                        {gameDateFilter === 'today'
                          ? `Hoy (${currentLocalDate})`
                          : gameDateFilter === 'custom' && customDatePicker
                          ? `Fecha seleccionada (${customDatePicker})`
                          : `Total filtrado`}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <h3 className="text-2xl font-black text-white leading-tight font-mono">
                        {selectedDateLinesTotal.toLocaleString()} LÍNEAS
                      </h3>
                      <span className="text-xs text-purple-200 font-semibold">
                        jugadas en {selectedDateGames.length} {selectedDateGames.length === 1 ? 'partida' : 'partidas'}
                      </span>
                    </div>
                    <p className="text-[11px] text-purple-200/90 font-medium mt-0.5">
                      {todayLinesTotal > 0 && gameDateFilter !== 'today' ? (
                        <>Hoy en total: <strong>{todayLinesTotal} líneas</strong> ({todayGames.length} partidas) • </>
                      ) : null}
                      {todayOperatorsBreakdown.length > 0 ? (
                        <span>Por operadora hoy: {todayOperatorsBreakdown.map((op) => `${op.operatorName}: ${op.linesTotal} lín. (${op.gamesCount} p.)`).join(' • ')}</span>
                      ) : (
                        <span>Conteo exacto acumulado de todas las líneas jugadas</span>
                      )}
                    </p>
                  </div>
                </div>

                {filteredSavedGames.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearFilteredGames}
                    className="py-1.5 px-3 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-black text-xs shadow-xs flex items-center gap-1.5 self-start md:self-center transition-all cursor-pointer border border-rose-400/40 active:scale-95"
                    title="Eliminar permanentemente las partidas de la vista actual"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Partidas Filtradas ({filteredSavedGames.length})</span>
                  </button>
                )}
              </div>

              {/* Informational counter & filter summary */}
              <div className="flex items-center justify-between text-xs text-orange-900/70 font-semibold flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span>
                    Mostrando <strong>{filteredSavedGames.length}</strong> de <strong>{savedGamesList.length}</strong> partidas guardadas
                  </span>
                  {gameDateFilter === 'today' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black border border-emerald-300">
                      Filtrado: Solo Hoy ({currentLocalDate})
                    </span>
                  )}
                  {gameDateFilter === 'custom' && customDatePicker && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black border border-amber-300">
                      Fecha: {customDatePicker}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-orange-900/60">
                  Toda partida archivada por cualquier operadora se almacena automáticamente en Firestore.
                </div>
              </div>
            </div>

            {/* Games Feed / List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 space-y-2.5">
              {filteredSavedGames.length === 0 ? (
                <div className="text-center py-16 flex flex-col items-center justify-center text-orange-900/60">
                  <Trophy className="w-12 h-12 mb-2 stroke-[1.5] opacity-50 text-amber-600" />
                  <p className="text-base font-bold text-orange-950">No hay partidas guardadas que coincidan</p>
                  <p className="text-xs max-w-md mt-1">
                    Cuando una operadora complete o archive una partida en la plataforma (en Bingo 75 o Bingo 90), se guardará automáticamente aquí con toda su información detallada.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredSavedGames.map((game) => {
                    const isBingo90 = game.mode === '90';
                    const ballsCount = game.drawnBallsPlayed?.length || game.totalBallsDrawnCount || 0;
                    const linesCount =
                      game.totalLinesPlayed ??
                      (isBingo90
                        ? 30
                        : (game.sheet75Snapshot?.columns?.reduce((sum, c) => sum + (Number(c.multiplier) || 1), 0) || 11));

                    return (
                      <div
                        key={game.id}
                        className="p-3.5 rounded-2xl bg-white border border-orange-200/90 hover:border-orange-300 shadow-xs transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                      >
                        {/* Left: Round Badge & Operator details */}
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          {/* Round and Win Ball Badge */}
                          <div className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black shadow-xs flex-shrink-0 border border-white/50">
                            <span className="text-[10px] uppercase font-bold tracking-wider leading-none">Ronda</span>
                            <span className="text-base leading-none mt-0.5">#{game.round}</span>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-sm text-orange-950">
                                Partida #{game.round}
                              </span>

                              {/* Mode badge */}
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${
                                  isBingo90
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-orange-100 text-orange-900 border-orange-300'
                                }`}
                              >
                                {isBingo90 ? 'Bingo 90 Bolas' : 'Bingo 75 Bolas'}
                              </span>

                              {/* Operator Badge */}
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                                <Gamepad2 className="w-3 h-3 text-emerald-700" />
                                <span>Operadora: <strong>{game.operatorName || 'Principal'}</strong></span>
                              </span>

                              {/* Lines count badge */}
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-950 border border-purple-300 flex items-center gap-1 shadow-2xs">
                                <span>🎯</span>
                                <span><strong>{linesCount} Líneas</strong></span>
                              </span>

                              {/* Planilla Badge */}
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-900 border border-blue-200 flex items-center gap-1">
                                <Table2 className="w-3 h-3 text-blue-600" />
                                <span>Planilla Guardada</span>
                              </span>
                            </div>

                            {/* Winning information */}
                            <div className="flex items-center gap-3 text-xs text-orange-900/80 mt-1 flex-wrap">
                              <span className="font-bold flex items-center gap-1">
                                <Trophy className="w-3.5 h-3.5 text-amber-600" />
                                Bola Ganadora:{' '}
                                <strong className="text-orange-950 bg-amber-100 px-1.5 py-0.2 rounded font-black border border-amber-300">
                                   {game.letter ? `${game.letter}-` : ''}{game.ballNumber}
                                </strong>
                              </span>

                              {game.winningPlayerName && (
                                <span className="font-semibold">
                                  Ganador: <strong className="text-orange-950">{game.winningPlayerName}</strong>
                                </span>
                              )}

                              {game.tableNumber && (
                                <span className="text-[11px] text-orange-900/70">
                                  (Planilla #{game.tableNumber})
                                </span>
                              )}

                              <span className="text-[11px] text-orange-900/60 font-medium">
                                Total Bolas Cantadas: <strong className="text-orange-950">{ballsCount}</strong>
                              </span>

                              <span className="text-[11px] text-orange-900/60 font-medium">
                                Duración: <strong className="text-orange-950">{game.durationFormatted || `${game.durationSeconds || 0}s`}</strong>
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Date, Time & Actions */}
                        <div className="flex items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-orange-100 flex-shrink-0">
                          <div className="text-left lg:text-right">
                            <div className="flex items-center gap-1 text-[11px] text-orange-900/70 font-bold">
                              <Calendar className="w-3 h-3 text-orange-600" />
                              <span>{game.dailyDate || game.dateFormatted || 'Hoy'}</span>
                            </div>
                            <div className="text-[10px] text-orange-900/50 font-mono">
                              {game.timestamp || ''}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {/* Download JPG button */}
                            <button
                              type="button"
                              onClick={() => downloadGameDirectJpg(game)}
                              className="py-1.5 px-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95"
                              title="Descargar comprobante en JPG (imagen)"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              <span>JPG</span>
                            </button>

                            {/* Download PDF button */}
                            <button
                              type="button"
                              onClick={() => downloadGameDirectPdf(game)}
                              className="py-1.5 px-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95"
                              title="Descargar documento en PDF"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>

                            {/* View Full Detail Button */}
                            <button
                              type="button"
                              onClick={() => setSelectedGameForDetail(game)}
                              className="py-1.5 px-2.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-black border border-orange-300 transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                              title="Ver información completa de todas las bolas y datos de esta partida"
                            >
                              <Eye className="w-3.5 h-3.5 text-orange-700" />
                              <span>Detalle</span>
                            </button>

                            {/* View Card Sheet Button */}
                            <button
                              type="button"
                              onClick={() => setSelectedGameForSheetView(game)}
                              className="py-1.5 px-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-950 text-xs font-black border border-blue-200 transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                              title="Ver e imprimir la copia completa de la planilla de esta partida"
                            >
                              <Table2 className="w-3.5 h-3.5 text-blue-600" />
                              <span>Planilla</span>
                            </button>

                            {/* Edit Saved Game Button (Admin only) */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditGameModal(game)}
                              className="py-1.5 px-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 text-xs font-black border border-purple-200 transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                              title="Modificar datos de esta partida (jugador mal anotado, número de mesa, operadora o valores)"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-purple-700" />
                              <span>Editar</span>
                            </button>

                            {/* Download Card Sheet CSV */}
                            <button
                              type="button"
                              onClick={() => handleExportSinglePlanillaCSV(game)}
                              className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                              title="Descargar copia de la planilla en CSV (Excel) a tu dispositivo"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                            </button>

                            {/* Download Card Sheet JSON */}
                            <button
                              type="button"
                              onClick={() => handleExportSinglePlanillaJSON(game)}
                              className="p-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                              title="Descargar copia completa de la planilla en JSON a tu dispositivo"
                            >
                              <FileJson className="w-3.5 h-3.5 text-amber-700" />
                            </button>

                            {/* Delete single game button */}
                            <button
                              type="button"
                              onClick={() => handleDeleteGame(game)}
                              className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                              title="Eliminar permanentemente este registro de partida"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 2: ACTIVIDAD EN TIEMPO REAL                               */}
        {/* ============================================================= */}
        {activeTab === 'activity' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Filter and Export Bar */}
            <div className="px-4 py-2.5 sm:px-6 bg-orange-50/60 border-b border-orange-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 flex-shrink-0">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-900/50" />
                  <input
                    type="text"
                    placeholder="Buscar actividad o acción..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-orange-200 bg-white text-xs font-semibold text-orange-950 placeholder-orange-300 focus:outline-none focus:border-orange-500 shadow-xs"
                  />
                </div>

                <select
                  value={activityFilterOperator}
                  onChange={(e) => setActivityFilterOperator(e.target.value)}
                  className="py-1.5 px-2.5 rounded-xl border border-orange-200 bg-white text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 cursor-pointer shadow-xs max-w-[180px]"
                >
                  <option value="all">Todos los Operadores</option>
                  {savedGamesOperators.map(([uid, name]) => (
                    <option key={uid} value={uid}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Activities Live Feed */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 space-y-2">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center justify-center text-orange-900/60">
                  <Activity className="w-10 h-10 mb-2 stroke-[1.5] opacity-50" />
                  <p className="text-sm font-bold text-orange-950">Aún no hay actividad registrada</p>
                  <p className="text-xs">
                    Las acciones de los operadores (cantada de bolas, inicio de sesión, planillas) aparecerán aquí en vivo.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredActivities.map((act) => {
                    const isDrawBall = act.actionType === 'draw_ball';
                    const isLogin = act.actionType === 'login';
                    const isSave = act.actionType === 'save_game';

                    return (
                      <div
                        key={act.id}
                        className="p-3 rounded-2xl bg-white border border-orange-200/90 shadow-xs flex items-start sm:items-center justify-between gap-3 hover:border-orange-300 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-xs flex-shrink-0 ${
                              isDrawBall
                                ? 'bg-amber-500'
                                : isLogin
                                ? 'bg-blue-500'
                                : isSave
                                ? 'bg-emerald-500'
                                : 'bg-purple-500'
                            }`}
                          >
                            {isDrawBall ? (
                              <CircleDot className="w-4 h-4" />
                            ) : isLogin ? (
                              <Users className="w-4 h-4" />
                            ) : isSave ? (
                              <Download className="w-4 h-4" />
                            ) : (
                              <Activity className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-xs text-orange-950">
                                {act.action}
                              </span>
                              <span className="text-[10px] px-2 py-0.2 rounded-full bg-orange-100 text-orange-900 font-bold border border-orange-200">
                                {act.operatorName}
                              </span>
                              {act.mode && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-mono font-bold">
                                  Modo {act.mode}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-orange-900/70 font-medium truncate mt-0.5">
                              {act.details || 'Acción completada exitosamente'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right flex-shrink-0 flex flex-col items-end">
                          <span className="text-[10px] text-orange-900/50 font-mono">
                            {new Date(act.timestamp).toLocaleTimeString()}
                          </span>
                          <span className="text-[9px] text-orange-900/40">
                            {new Date(act.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 3: OPERADORES Y ADMINISTRADORES                           */}
        {/* ============================================================= */}
        {activeTab === 'users' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Action Bar */}
            <div className="px-4 py-2.5 sm:px-6 bg-orange-50/60 border-b border-orange-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 flex-shrink-0">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-900/50" />
                <input
                  type="text"
                  placeholder="Buscar operador por nombre o correo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-orange-200 bg-white text-xs font-semibold text-orange-950 placeholder-orange-300 focus:outline-none focus:border-orange-500 shadow-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'operator')}
                  className="py-1.5 px-2.5 rounded-xl border border-orange-200 bg-white text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 cursor-pointer shadow-xs"
                >
                  <option value="all">Todos los Rangos</option>
                  <option value="operator">🎮 Operadores</option>
                  <option value="admin">👑 Administradores</option>
                </select>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
                  className="py-1.5 px-2.5 rounded-xl border border-orange-200 bg-white text-xs font-bold text-orange-950 focus:outline-none focus:border-orange-500 cursor-pointer shadow-xs"
                >
                  <option value="all">Todos los Estados</option>
                  <option value="active">Activos</option>
                  <option value="suspended">Suspendidos</option>
                </select>
              </div>
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 space-y-2.5">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12 flex flex-col items-center justify-center text-orange-900/60">
                  <Users className="w-10 h-10 mb-2 stroke-[1.5] opacity-50" />
                  <p className="text-sm font-bold text-orange-950">No hay usuarios coincidentes</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredUsers.map((user) => {
                    const isUserAdmin = user.role === 'admin';
                    const isSuspended = user.status === 'suspended';
                    const isSelf = currentUser?.id === user.id;

                    return (
                      <div
                        key={user.id}
                        className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs ${
                          isSelf
                            ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/40'
                            : isSuspended
                            ? 'bg-rose-50/70 border-rose-200 opacity-80'
                            : 'bg-white border-orange-200 hover:border-orange-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-xs flex-shrink-0"
                            style={{ backgroundColor: user.avatarColor || (isUserAdmin ? '#f59e0b' : '#10b981') }}
                          >
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-sm text-orange-950 truncate">
                                {user.name}
                              </span>

                              {isSelf && (
                                <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-xs">
                                  Tú (Admin actual)
                                </span>
                              )}

                              <span
                                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  isUserAdmin
                                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                                    : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                }`}
                              >
                                {isUserAdmin ? '👑 Administrador' : '🎮 Operador'}
                              </span>

                              {/* Insignia de Modalidad Asignada */}
                              {!isUserAdmin && (
                                <span
                                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                    user.assignedMode === '90'
                                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                                      : 'bg-amber-100 text-amber-900 border-amber-300'
                                  }`}
                                  title="Modalidad y panel exclusivo asignado"
                                >
                                  {user.assignedMode === '90' ? '🎱 Bingo 90' : '🎯 Bingo 75'}
                                </span>
                              )}

                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  isSuspended
                                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                                    : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                }`}
                              >
                                {isSuspended ? '● Suspendido' : '● Activo'}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-orange-900/70 mt-1 flex-wrap">
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3 opacity-60" />
                                {user.email}
                              </span>
                              <span className="flex items-center gap-1 font-mono text-[10px]">
                                UID: {user.id?.slice(0, 10)}...
                              </span>
                              {user.joinedDate && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3 opacity-60" />
                                  Reg: {user.joinedDate}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Admin Controls */}
                        <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                          {/* Botón para cambiar modalidad asignada a operadoras */}
                          {!isUserAdmin && (
                            <button
                              type="button"
                              onClick={() => handleToggleAssignedMode(user)}
                              className="px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer bg-white hover:bg-orange-50 text-orange-950 border-orange-300 shadow-xs"
                              title={`Cambiar modalidad exclusiva asignada a ${user.assignedMode === '90' ? 'Bingo 75' : 'Bingo 90'}`}
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-orange-600" />
                              <span>{user.assignedMode === '90' ? 'Pasar a B75' : 'Pasar a B90'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => handleToggleRole(user)}
                            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                              isSelf
                                ? 'opacity-40 cursor-not-allowed bg-orange-100 border-orange-200'
                                : isUserAdmin
                                ? 'bg-orange-100 hover:bg-orange-200 text-orange-950 border-orange-300'
                                : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs'
                            }`}
                          >
                            <ArrowUpDown className="w-3.5 h-3.5" />
                            <span>{isUserAdmin ? 'Hacer Operador' : 'Asignar Admin'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isSelf}
                            onClick={() => handleToggleStatus(user)}
                            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
                              isSelf
                                ? 'opacity-40 cursor-not-allowed bg-orange-100 border-orange-200'
                                : isSuspended
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-700 shadow-xs'
                                : 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300'
                            }`}
                          >
                            {isSuspended ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Reactivar</span>
                              </>
                            ) : (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                <span>Suspender</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 4: MÉTRICAS Y RESUMEN                                     */}
        {/* ============================================================= */}
        {activeTab === 'stats' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 space-y-4">
            {/* Top Row: System KPI Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Stat 0: DAILY LINES EXCLUSIVE COUNTER */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-800 to-indigo-900 text-white border border-purple-400/50 shadow-md space-y-1 relative overflow-hidden">
                <div className="flex items-center justify-between text-xs font-black uppercase text-purple-200">
                  <span>Líneas Jugadas Hoy</span>
                  <Hash className="w-4 h-4 text-yellow-300" />
                </div>
                <div className="text-3xl font-black text-white font-mono">
                  {todayLinesTotal.toLocaleString()}
                </div>
                <p className="text-[11px] text-purple-200 font-medium">
                  {todayGames.length} {todayGames.length === 1 ? 'partida jugada hoy' : 'partidas jugadas hoy'}
                </p>
                <div className="absolute -right-3 -bottom-3 w-16 h-16 rounded-full bg-white/5 pointer-events-none" />
              </div>

              {/* Stat 1: Total Historic Lines */}
              <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs font-black uppercase text-orange-900/70">
                  <span>Total Líneas Históricas</span>
                  <Table2 className="w-4 h-4 text-purple-600" />
                </div>
                <div className="text-2xl font-black text-orange-950 font-mono">
                  {savedGamesList.reduce((acc, g) => acc + (g.totalLinesPlayed || 68), 0).toLocaleString()}
                </div>
                <p className="text-[11px] text-orange-900/60">
                  En {savedGamesList.length} partidas totales
                </p>
              </div>

              {/* Stat 2: Total Games */}
              <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs font-black uppercase text-orange-900/70">
                  <span>Partidas Guardadas</span>
                  <Trophy className="w-4 h-4 text-amber-600" />
                </div>
                <div className="text-2xl font-black text-orange-950">{savedGamesList.length}</div>
                <p className="text-[11px] text-orange-900/60">
                  {todayGames.length} archivadas hoy
                </p>
              </div>

              {/* Stat 3: Total Balls */}
              <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs font-black uppercase text-orange-900/70">
                  <span>Bolas Cantadas</span>
                  <CircleDot className="w-4 h-4 text-orange-600" />
                </div>
                <div className="text-2xl font-black text-orange-950">
                  {savedGamesList.reduce((acc, g) => acc + (g.drawnBallsPlayed?.length || g.totalBallsDrawnCount || 0), 0)}
                </div>
                <p className="text-[11px] text-orange-900/60">En todas las partidas</p>
              </div>

              {/* Stat 4: Operators */}
              <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-sm space-y-1">
                <div className="flex items-center justify-between text-xs font-black uppercase text-orange-900/70">
                  <span>Operadores</span>
                  <Users className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-black text-orange-950">
                  {usersList.filter((u) => u.role === 'operator').length}
                </div>
                <p className="text-[11px] text-orange-900/60">
                  {usersList.filter((u) => u.role === 'admin').length} Administradores
                </p>
              </div>
            </div>

            {/* Daily Lines Registry Table (EXCLUSIVE ADMIN HISTORICAL AUDIT) */}
            <div className="p-4 rounded-2xl bg-white border-2 border-purple-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-purple-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center shadow-xs">
                    <Calendar className="w-5 h-5 text-yellow-300" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-purple-950 flex items-center gap-2">
                      <span>Registro Diario de Líneas Jugadas (Control de Admin)</span>
                      <span className="text-[10px] bg-yellow-400 text-purple-950 font-black px-2 py-0.2 rounded-md uppercase">
                        Solo Admin
                      </span>
                    </h4>
                    <p className="text-xs text-purple-900/70 font-medium">
                      Conteo exacto día a día de cuántas líneas se usaron entre todas las partidas realizadas cada fecha
                    </p>
                  </div>
                </div>

                <div className="text-xs text-purple-950 font-bold bg-purple-50 px-3 py-1 rounded-xl border border-purple-200">
                  Hoy: <strong className="text-purple-700 font-mono text-sm">{todayLinesTotal} líneas</strong> ({todayGames.length} partidas)
                </div>
              </div>

              {dailyLinesSummary.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-medium">
                  No hay partidas registradas aún para calcular el historial diario de líneas.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-purple-100">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-purple-50/80 text-purple-950 font-black uppercase text-[10px] tracking-wider border-b border-purple-100">
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3">Partidas del Día</th>
                        <th className="py-2.5 px-3 text-center">Total Líneas Jugadas</th>
                        <th className="py-2.5 px-3">Operadoras de Turno</th>
                        <th className="py-2.5 px-3 text-right">Recaudado</th>
                        <th className="py-2.5 px-3 text-right">Premios</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {dailyLinesSummary.map((item, idx) => {
                        const isToday = item.date === currentLocalDate;
                        return (
                          <tr
                            key={item.date || idx}
                            className={`hover:bg-purple-50/40 transition-colors font-medium ${
                              isToday ? 'bg-purple-50/60 font-semibold' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                              <div className="flex items-center gap-1.5">
                                <span>{item.date}</span>
                                {isToday && (
                                  <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-black uppercase">
                                    Hoy
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <strong>{item.gamesCount}</strong> {item.gamesCount === 1 ? 'partida' : 'partidas'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="inline-block px-3 py-1 rounded-xl bg-purple-100 text-purple-950 font-black font-mono text-sm border border-purple-200">
                                {item.linesTotal.toLocaleString()} líneas
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              {Array.from(item.operators).length > 0 ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  {Array.from(item.operators).map((op) => (
                                    <span key={op} className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[10px] font-bold">
                                      🎮 {op}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400 italic">Operadora Principal</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right text-emerald-700 font-mono font-bold">
                              ${item.collected.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-rose-700 font-mono font-bold">
                              ${item.prizes.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {isAdmin && (
                                <button
                                  type="button"
                                  onClick={() => setDayFolderToDelete(item.date)}
                                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 text-[10px] font-black transition-all cursor-pointer inline-flex items-center gap-1 active:scale-95"
                                  title={`Eliminar todas las partidas de la fecha ${item.date}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Borrar fecha</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 sm:px-6 border-t border-orange-200 bg-orange-50/80 flex flex-col sm:flex-row items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-3 text-xs font-bold text-orange-900/80 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Sincronización en vivo activa
            </span>
            <span>•</span>
            <button
              type="button"
              onClick={handleExportSavedGamesCSV}
              className="hover:underline text-orange-950 font-black flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Descargar Partidas Diarias (CSV)</span>
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={handleExportSavedGamesJSON}
              className="hover:underline text-orange-950 font-black flex items-center gap-1 cursor-pointer"
            >
              <FileJson className="w-3 h-3" />
              <span>Guardar Partidas (JSON)</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs shadow-xs active:scale-95 transition-all cursor-pointer"
          >
            Listo, Salir del Panel
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* MODAL DE DETALLE COMPLETO DE PARTIDA                          */}
      {/* ============================================================= */}
      {selectedGameForDetail && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
          <div className="w-full max-w-2xl max-h-[90vh] bg-[#fffaf5] border-2 border-orange-300 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[#431407]">
            {/* Detail Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-orange-100 via-amber-100 to-orange-100 border-b border-orange-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-black shadow-xs">
                  #{selectedGameForDetail.round}
                </div>
                <div>
                  <h3 className="text-base font-black text-orange-950">
                    Detalle Completo - Partida #{selectedGameForDetail.round}
                  </h3>
                  <p className="text-xs text-orange-900/70 font-semibold">
                    Modo {selectedGameForDetail.mode === '90' ? 'Bingo 90 Bolas' : 'Bingo 75 Bolas'} • {selectedGameForDetail.dailyDate || selectedGameForDetail.dateFormatted} a las {selectedGameForDetail.timestamp}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedGameForDetail(null)}
                className="p-1.5 rounded-xl hover:bg-orange-200 text-orange-950 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Detail Content Body */}
            <div className="p-5 space-y-4 overflow-y-auto max-h-[72vh]">
              {/* Highlights Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                <div className="p-2.5 rounded-2xl bg-white border border-orange-200 shadow-xs">
                  <span className="text-[10px] uppercase font-black text-orange-900/60 block">Operadora</span>
                  <span className="text-xs font-black text-orange-950 truncate block mt-0.5">
                    {selectedGameForDetail.operatorName || 'Principal'}
                  </span>
                </div>

                <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-300 shadow-xs">
                  <span className="text-[10px] uppercase font-black text-amber-900/70 block">Bola Ganadora</span>
                  <span className="text-base font-black text-amber-950 block mt-0.5">
                    {selectedGameForDetail.letter ? `${selectedGameForDetail.letter}-` : ''}{selectedGameForDetail.ballNumber}
                  </span>
                </div>

                <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-300 shadow-xs">
                  <span className="text-[10px] uppercase font-black text-purple-900/70 block">Líneas Jugadas</span>
                  <span className="text-base font-black text-purple-950 block mt-0.5 font-mono">
                    {selectedGameForDetail.totalLinesPlayed || (selectedGameForDetail.mode === '90' ? 30 : 68)}
                  </span>
                </div>

                <div className="p-2.5 rounded-2xl bg-white border border-orange-200 shadow-xs">
                  <span className="text-[10px] uppercase font-black text-orange-900/60 block">Total Bolas</span>
                  <span className="text-sm font-black text-orange-950 block mt-0.5">
                    {selectedGameForDetail.drawnBallsPlayed?.length || selectedGameForDetail.totalBallsDrawnCount || 0}
                  </span>
                </div>

                <div className="p-2.5 rounded-2xl bg-white border border-orange-200 shadow-xs">
                  <span className="text-[10px] uppercase font-black text-orange-900/60 block">Duración</span>
                  <span className="text-xs font-black text-orange-950 block mt-0.5">
                    {selectedGameForDetail.durationFormatted || `${selectedGameForDetail.durationSeconds || 0}s`}
                  </span>
                </div>
              </div>

              {/* Winner & Sheet Breakdown */}
              <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-xs space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-orange-100">
                  <span className="text-orange-900/70 font-bold">Jugador Ganador:</span>
                  <strong className="text-orange-950 font-black">{selectedGameForDetail.winningPlayerName || 'Sin asignar'}</strong>
                </div>

                {selectedGameForDetail.tableNumber && (
                  <div className="flex justify-between py-1 border-b border-orange-100">
                    <span className="text-orange-900/70 font-bold">Planilla / Mesa Ganadora:</span>
                    <strong className="text-orange-950 font-black">Planilla #{selectedGameForDetail.tableNumber}</strong>
                  </div>
                )}

                {selectedGameForDetail.rowLeader && (
                  <div className="flex justify-between py-1 border-b border-orange-100">
                    <span className="text-orange-900/70 font-bold">Fila / Línea Ganadora:</span>
                    <strong className="text-orange-950 font-black">Línea #{selectedGameForDetail.rowLeader}</strong>
                  </div>
                )}

                <div className="flex justify-between py-1">
                  <span className="text-orange-900/70 font-bold">Correo de la Operadora:</span>
                  <span className="text-orange-900/80 font-mono text-[11px]">{selectedGameForDetail.operatorEmail || 'No registrado'}</span>
                </div>
              </div>

              {/* Complete sequence of balls extracted in order */}
              <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-orange-950 tracking-wider flex items-center gap-1.5">
                    <CircleDot className="w-3.5 h-3.5 text-orange-600" />
                    <span>Secuencia Completa de Bolas Cantadas (en orden):</span>
                  </span>
                  <span className="text-[11px] text-orange-900/60 font-bold">
                    {selectedGameForDetail.drawnBallsPlayed?.length || 0} bolas
                  </span>
                </div>

                {(!selectedGameForDetail.drawnBallsPlayed || selectedGameForDetail.drawnBallsPlayed.length === 0) ? (
                  <p className="text-xs text-orange-900/60 italic py-2">No se guardó el registro de bolas individuales para esta partida.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 bg-orange-50/50 rounded-xl border border-orange-200/60">
                    {selectedGameForDetail.drawnBallsPlayed.map((num, idx) => {
                      const isWinning = num === selectedGameForDetail.ballNumber;
                      return (
                        <div
                          key={idx}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shadow-xs transition-all ${
                            isWinning
                              ? 'bg-amber-500 text-white ring-2 ring-amber-400 font-black scale-110'
                              : 'bg-white text-orange-950 border border-orange-300'
                          }`}
                          title={`Orden #${idx + 1}: Bola ${num}${isWinning ? ' (BOLA GANADORA)' : ''}`}
                        >
                          {num}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bolillero Snapshot Section (Captura del bolillero al momento de cantar bingo) */}
              {selectedGameForDetail.cageSnapshotImage ? (
                <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase text-orange-950 tracking-wider flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-orange-600" />
                      <span>Captura Fotográfica del Bolillero al Hacer Bingo:</span>
                    </span>
                    <a
                      href={selectedGameForDetail.cageSnapshotImage}
                      download={`bolillero_partida_${selectedGameForDetail.round}.png`}
                      className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3 h-3" />
                      <span>Descargar Foto</span>
                    </a>
                  </div>
                  <div className="relative rounded-2xl overflow-hidden border border-orange-200 bg-orange-950/5 flex items-center justify-center p-2">
                    <img
                      src={selectedGameForDetail.cageSnapshotImage}
                      alt={`Bolillero Partida #${selectedGameForDetail.round}`}
                      className="max-h-72 w-auto object-contain rounded-xl shadow-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200 text-[11px] text-orange-900/60 italic flex items-center gap-2">
                  <Camera className="w-4 h-4 text-orange-400 flex-shrink-0" />
                  <span>Esta partida fue guardada antes de habilitar la captura automática del bolillero.</span>
                </div>
              )}

              {/* Complete Card Sheet / Planilla Section */}
              {(() => {
                const isBingo90 = selectedGameForDetail.mode === '90' || selectedGameForDetail.sheetType === 'traditional-90';
                const sheet75 = selectedGameForDetail.sheet75Snapshot || (!isBingo90 ? createDefaultSheet75() : null);
                const sheet90 = selectedGameForDetail.sheet90Snapshot || (isBingo90 ? createDefaultSheet90() : null);

                return (
                  <div className="p-4 rounded-2xl bg-white border-2 border-orange-300 shadow-xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-orange-100 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
                          <Table2 className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-black text-orange-950 uppercase tracking-wide">
                              Copia Completa de la Planilla Guardada
                            </h4>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black border border-emerald-300">
                              Archivada
                            </span>
                          </div>
                          <p className="text-[11px] text-orange-900/70 font-semibold mt-0.5">
                            {isBingo90
                              ? 'Bingo 90 Tripletas • 30 filas por mesa'
                              : 'Bingo 75 Multiplicadores • 15 filas por columna'}
                          </p>
                        </div>
                      </div>

                      {/* Action buttons inside the section */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleExportSinglePlanillaCSV(selectedGameForDetail)}
                          className="py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                          title="Descargar esta planilla en archivo CSV (Excel) con todas sus casillas, jugadores y precios"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>Descargar CSV (Excel)</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleExportSinglePlanillaJSON(selectedGameForDetail)}
                          className="py-1.5 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                          title="Descargar la estructura completa de la planilla en JSON"
                        >
                          <FileJson className="w-3.5 h-3.5" />
                          <span>Descargar JSON</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedGameForSheetView(selectedGameForDetail)}
                          className="py-1.5 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                          title="Abrir la planilla completa en modal interactivo con opciones de impresión"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver Planilla Completa</span>
                        </button>
                      </div>
                    </div>

                    {/* Financial & Sheet Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-orange-900/60 block">Recaudado Planilla</span>
                        <strong className="text-sm font-black text-orange-950 mt-0.5 block">
                          ${selectedGameForDetail.totalCollected?.toFixed(2) || '0.00'}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-orange-900/60 block">Premios Pagados</span>
                        <strong className="text-sm font-black text-orange-950 mt-0.5 block">
                          ${selectedGameForDetail.totalPrizesPaid?.toFixed(2) || '0.00'}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-orange-900/60 block">Ganancia Neta</span>
                        <strong className={`text-sm font-black mt-0.5 block ${(selectedGameForDetail.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          ${selectedGameForDetail.netProfit?.toFixed(2) || '0.00'}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 shadow-2xs">
                        <span className="text-[10px] uppercase font-bold text-orange-900/60 block">Anfitrión / Host</span>
                        <strong className="text-xs font-black text-orange-950 mt-0.5 block truncate">
                          {isBingo90 ? (sheet90?.hostName || 'Operadora') : (sheet75?.hostName || 'Operadora')}
                        </strong>
                      </div>
                    </div>

                    {/* Preview Table of the Sheet */}
                    {isBingo90 && sheet90 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-orange-900/80">
                          <span>Mesas de Bingo 90 Guardadas:</span>
                          <span className="text-[11px] text-orange-900/60">
                            Precio por fila: ${sheet90.pricePerRow || 1.0}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 bg-orange-50/40 rounded-xl border border-orange-200/60">
                          {(sheet90.tables && sheet90.tables.length > 0 ? sheet90.tables : [sheet90.table1, sheet90.table2].filter(Boolean)).map((table, tIdx) => {
                            const tblNum = table.tableNumber || tIdx + 1;
                            const isWinTable = tblNum === selectedGameForDetail.tableNumber;
                            return (
                              <div
                                key={tblNum}
                                className={`p-2.5 rounded-xl border text-xs ${
                                  isWinTable ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/40' : 'bg-white border-orange-200'
                                }`}
                              >
                                <div className="flex items-center justify-between font-black text-xs text-orange-950 border-b border-orange-100 pb-1 mb-1.5">
                                  <span>Planilla #{tblNum}</span>
                                  {isWinTable && (
                                    <span className="text-[10px] bg-amber-500 text-white px-2 py-0.2 rounded-full font-black">
                                      ★ Ganó Aquí
                                    </span>
                                  )}
                                  <span className="text-[10px] text-orange-900/60 font-semibold">
                                    Premio: ${table.prize || 25}
                                  </span>
                                </div>
                                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                                  {table.rows.slice(0, 10).map((r) => {
                                    const isWinRow = isWinTable && r.rowNumber === selectedGameForDetail.rowLeader;
                                    return (
                                      <div
                                        key={r.rowNumber}
                                        className={`flex items-center justify-between p-1 rounded-lg text-[11px] ${
                                          isWinRow ? 'bg-amber-200/90 font-black text-amber-950 ring-1 ring-amber-400' : 'bg-orange-50/50'
                                        }`}
                                      >
                                        <span className="font-bold text-orange-900/80">F#{r.rowNumber}:</span>
                                        <span className="font-mono text-[10px] text-orange-950 font-bold">
                                          [{r.numbers.join(', ')}]
                                        </span>
                                        <span className="font-semibold truncate max-w-[90px] text-orange-950">
                                          {r.playerName || <span className="opacity-40 italic">Libre</span>}
                                        </span>
                                        {r.paid && (
                                          <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-bold">
                                            $
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                  {table.rows.length > 10 && (
                                    <div className="text-center text-[10px] text-orange-900/60 font-semibold pt-1">
                                      + {table.rows.length - 10} filas más guardadas
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : sheet75 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-orange-900/80">
                          <span>Columnas de Multiplicadores Guardadas:</span>
                          <span className="text-[11px] text-orange-900/60">
                            Base: ${sheet75.baseCost || 0.10} • Premio: ${sheet75.basePrize || 1.35}
                          </span>
                        </div>
                        <div className="flex gap-2 overflow-x-auto p-1.5 bg-orange-50/40 rounded-xl border border-orange-200/60">
                          {sheet75.columns.slice(0, 8).map((col) => (
                            <div key={col.id || col.colNumber} className="w-24 bg-white p-2 rounded-xl border border-orange-200 text-xs flex-shrink-0">
                              <div className="text-center font-black text-orange-950 border-b border-orange-100 pb-1 mb-1">
                                <div>{col.title || `Col ${col.colNumber}`}</div>
                                <div className="text-[9px] text-amber-700 font-bold">{col.multiplier}x</div>
                              </div>
                              <div className="space-y-1">
                                {col.cells.slice(0, 5).map((cell) => {
                                  const isWinLine = cell.rowNumber === selectedGameForDetail.rowLeader;
                                  return (
                                    <div
                                      key={cell.rowNumber}
                                      className={`p-1 rounded text-[10px] truncate ${
                                        isWinLine ? 'bg-amber-200 font-black text-amber-950 ring-1 ring-amber-400' : 'bg-orange-50/70 text-orange-900/80'
                                      }`}
                                      title={`Fila ${cell.rowNumber}: ${cell.playerName || 'Libre'}`}
                                    >
                                      <span className="font-mono font-bold">#{cell.rowNumber}</span>{' '}
                                      <span>{cell.playerName || '-'}</span>
                                    </div>
                                  );
                                })}
                                {col.cells.length > 5 && (
                                  <div className="text-center text-[9px] text-orange-900/50">
                                    +{col.cells.length - 5}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            {/* Detail Modal Footer */}
            <div className="px-5 py-3 bg-orange-50 border-t border-orange-200 flex flex-col sm:flex-row items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => downloadGameDirectJpg(selectedGameForDetail)}
                  className="py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Descargar comprobante de esta partida como imagen JPG"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Descargar JPG</span>
                </button>

                <button
                  type="button"
                  onClick={() => downloadGameDirectPdf(selectedGameForDetail)}
                  className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Descargar comprobante de esta partida como documento PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Descargar PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportSinglePlanillaCSV(selectedGameForDetail)}
                  className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Descargar copia de la planilla en archivo CSV para Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Descargar CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportSinglePlanillaJSON(selectedGameForDetail)}
                  className="py-2 px-3 rounded-xl bg-amber-700 hover:bg-amber-600 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Descargar copia completa de la planilla en archivo JSON"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  <span>Planilla (JSON)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleOpenEditGameModal(selectedGameForDetail);
                  }}
                  className="py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Modificar datos o jugadores de esta partida"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Editar Partida</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleDeleteGame(selectedGameForDetail);
                    setSelectedGameForDetail(null);
                  }}
                  className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Eliminar este registro de partida permanentemente"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Borrar Partida</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedGameForDetail(null)}
                className="py-2 px-4 rounded-xl bg-orange-200 hover:bg-orange-300 text-orange-950 font-bold text-xs transition-all cursor-pointer"
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Single Game Deletion */}
      {gameToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in select-none">
          <div className="w-full max-w-md bg-white border-2 border-rose-300 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  ¿Eliminar Partida #{gameToDelete.round}?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Se eliminará permanentemente el registro de la partida de{' '}
                  <strong className="text-slate-900">{gameToDelete.operatorName || 'la operadora'}</strong> con{' '}
                  <strong className="text-purple-700">{gameToDelete.totalLinesPlayed || 68} líneas</strong> jugadas. Esta acción borrará la planilla y el balance de Firestore y la galería.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setGameToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteGame}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Eliminar Partida</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Clearing Filtered Games */}
      {showConfirmClearFiltered && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in select-none">
          <div className="w-full max-w-md bg-white border-2 border-rose-300 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  ¿Eliminar {filteredSavedGames.length} Partidas?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Se eliminarán permanentemente todas las partidas de la vista filtrada actual de la base de datos de Firestore y la galería local. Esta acción es irreversible.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmClearFiltered(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClearFilteredGames}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Eliminar Todas ({filteredSavedGames.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* MODAL DE EDICIÓN DE PARTIDA (EXCLUSIVO PARA ADMINISTRADOR)   */}
      {/* ============================================================= */}
      {editingGame && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
          <div className="w-full max-w-xl max-h-[92vh] bg-[#fffaf5] border-2 border-purple-400 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[#431407]">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-purple-100 via-indigo-100 to-purple-100 border-b border-purple-200 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-600 text-white flex items-center justify-center font-black shadow-xs">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-purple-950">
                    Editar Partida Guardada #{editingGame.round}
                  </h3>
                  <p className="text-xs text-purple-900/70 font-semibold">
                    Modificar datos, operadora, montos o corregir nombres de jugadores
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setEditingGame(null)}
                className="p-1.5 rounded-xl hover:bg-purple-200 text-purple-950 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveGameModifications} className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Round Number */}
                <div>
                  <label className="block text-xs font-black uppercase text-orange-950 mb-1">
                    Número de Partida / Ronda
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editFormRound}
                    onChange={(e) => setEditFormRound(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-sm font-bold text-orange-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                {/* Operator Name */}
                <div>
                  <label className="block text-xs font-black uppercase text-orange-950 mb-1">
                    Operadora a Cargo
                  </label>
                  <input
                    type="text"
                    value={editFormOperatorName}
                    onChange={(e) => setEditFormOperatorName(e.target.value)}
                    placeholder="Nombre de la operadora"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-sm font-bold text-orange-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                {/* Winning Player Name */}
                <div>
                  <label className="block text-xs font-black uppercase text-orange-950 mb-1">
                    Jugador Ganador
                  </label>
                  <input
                    type="text"
                    value={editFormWinningPlayer}
                    onChange={(e) => setEditFormWinningPlayer(e.target.value)}
                    placeholder="Ej. Carlos Martínez"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-sm font-bold text-orange-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Table / Planilla Number */}
                <div>
                  <label className="block text-xs font-black uppercase text-orange-950 mb-1">
                    Planilla / Mesa Ganadora (#)
                  </label>
                  <input
                    type="text"
                    value={editFormTableNumber}
                    onChange={(e) => setEditFormTableNumber(e.target.value)}
                    placeholder="Ej. 1"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-sm font-bold text-orange-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Row Leader / Fila */}
                <div>
                  <label className="block text-xs font-black uppercase text-orange-950 mb-1">
                    Fila / Línea Ganadora (#)
                  </label>
                  <input
                    type="text"
                    value={editFormRowLeader}
                    onChange={(e) => setEditFormRowLeader(e.target.value)}
                    placeholder="Ej. 5"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-sm font-bold text-orange-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Total Lines Played */}
                <div>
                  <label className="block text-xs font-black uppercase text-orange-950 mb-1">
                    Total Líneas Abiertas
                  </label>
                  <input
                    type="text"
                    disabled
                    value={`${editingGame.totalLinesPlayed || (editingGame.mode === '90' ? 30 : 68)} líneas`}
                    className="w-full px-3 py-2 rounded-xl bg-orange-100/50 border border-orange-200 text-sm font-bold text-orange-900/70"
                  />
                </div>

                {/* Total Collected */}
                <div>
                  <label className="block text-xs font-black uppercase text-orange-950 mb-1">
                    Total Recaudado ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormTotalCollected}
                    onChange={(e) => setEditFormTotalCollected(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-sm font-bold text-orange-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Total Prizes */}
                <div>
                  <label className="block text-xs font-black uppercase text-orange-950 mb-1">
                    Total Premios Pagados ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFormTotalPrizes}
                    onChange={(e) => setEditFormTotalPrizes(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-orange-300 text-sm font-bold text-orange-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {/* Quick Player Rename in Sheet Section */}
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-black uppercase text-amber-950">
                    Corrección de Jugador Mal Anotado en la Planilla:
                  </span>
                </div>
                <p className="text-[11px] text-amber-900/80 leading-relaxed">
                  Si la operadora escribió mal el nombre de un jugador en la planilla guardada, escribe aquí el nombre incorrecto y el nombre corregido. Se reemplazará en todas las casillas guardadas de esta partida.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-amber-900/70 mb-0.5">
                      Nombre mal escrito (Buscar)
                    </label>
                    <input
                      type="text"
                      value={editRenameOldPlayer}
                      onChange={(e) => setEditRenameOldPlayer(e.target.value)}
                      placeholder="Ej. crlos"
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-amber-900/70 mb-0.5">
                      Nombre correcto (Reemplazar con)
                    </label>
                    <input
                      type="text"
                      value={editRenameNewPlayer}
                      onChange={(e) => setEditRenameNewPlayer(e.target.value)}
                      placeholder="Ej. Carlos"
                      className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-amber-300 text-xs font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-purple-200">
                <button
                  type="button"
                  onClick={() => setEditingGame(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Guardando Cambios...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Guardar Modificaciones</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Delete Entire Date Folder from Admin Panel */}
      {isAdmin && dayFolderToDelete && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white border-2 border-rose-300 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center flex-shrink-0 shadow-xs">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  ¿Eliminar todas las partidas de la fecha {dayFolderToDelete}?
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Se borrarán permanentemente todas las partidas y subcarpetas correspondientes a la fecha <strong className="text-slate-900">{dayFolderToDelete}</strong> de la plataforma y de Firestore.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDayFolderToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetDate = dayFolderToDelete;
                  setDayFolderToDelete(null);
                  await deleteGamesOfDay('all', targetDate);
                  setSavedGamesList(getSavedGamesGallery());
                  await logActivity(
                    'Eliminación de Subcarpeta por Fecha',
                    'reset_game',
                    `Eliminó todas las partidas de la fecha ${targetDate}`
                  );
                  showBanner(`Subcarpeta de la fecha ${targetDate} eliminada permanentemente.`);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all shadow-md cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sí, Eliminar Fecha</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Sheet Inspection Modal */}
      {selectedGameForSheetView && (
        <GameSheetSnapshotModal
          isOpen={!!selectedGameForSheetView}
          item={selectedGameForSheetView}
          allSequenceItems={filteredSavedGames}
          onClose={() => setSelectedGameForSheetView(null)}
        />
      )}
    </div>
  );
};
