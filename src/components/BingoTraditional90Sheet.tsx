import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  BingoSheetPlayer,
  Traditional90SheetData,
  Traditional90Table,
  Traditional90Row,
  Ball,
  AppUser,
  GameSettings,
  GameSequenceItem,
} from '../types';
import {
  Printer,
  Trash2,
  Check,
  Users,
  Sparkles,
  Plus,
  Trophy,
  X,
  AlertCircle,
  Sliders,
  Heart,
  RotateCcw,
  Layers,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Play,
} from 'lucide-react';
import {
  getPreviousPlayerRows90,
  savePreviousGameSheet90,
  getPreviousGameResultItem,
} from '../utils/gameSnapshotStorage';
import { GameSheetSnapshotModal } from './GameSheetSnapshotModal';
import { Bolillero90Sidebar } from './Bolillero90Sidebar';
import { GameSequenceBar } from './GameSequenceBar';
import { deleteGamePermanently } from '../utils/savedGamesStorage';
import { safeSetItem, safeGetItem } from '../utils/safeStorage';

interface BingoTraditional90SheetProps {
  drawnBalls?: Ball[];
  players: BingoSheetPlayer[];
  onUpdatePlayers: (players: BingoSheetPlayer[]) => void;
  currentUser?: AppUser | null;
  onStopBolillero?: () => void;
  onBingoCompleted?: (info: {
    rowNumber: number;
    numbers: [number, number, number];
    tableNumber: number;
    playerName?: string;
  }) => void;
  autoHighlightDrawn?: boolean;
  onToggleAutoHighlightDrawn?: (val: boolean) => void;
  // Bolillero 90 Live & Sequencer Props
  currentBall?: Ball | null;
  onDrawBall?: () => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  onResetGame?: () => void;
  settings?: GameSettings;
  onUpdateSettings?: (newSettings: GameSettings) => void;
  gameSequence90?: GameSequenceItem[];
  onOpenGameSnapshot?: (item: GameSequenceItem) => void;
  onClearSequence90?: () => void;
  onStartNewGame?: () => void;
  totalBalls?: number;
  areBuilderHeadersHidden?: boolean;
  onToggleBuilderHeaders?: () => void;
  onOpenSavedGamesGallery?: () => void;
  savedGamesCount?: number;
}

const STORAGE_KEY = 'bingo_traditional_90_sheet_v1';

// Generate default 30 rows with triples: [r, r+30, r+60]
const generateDefaultRows = (): Traditional90Row[] => {
  return Array.from({ length: 30 }, (_, i) => {
    const rowNum = i + 1;
    return {
      rowNumber: rowNum,
      numbers: [rowNum, rowNum + 30, rowNum + 60],
      playerId: undefined,
      playerName: undefined,
      color: undefined,
      paid: false,
    };
  });
};

export const BingoTraditional90Sheet: React.FC<BingoTraditional90SheetProps> = ({
  drawnBalls = [],
  players,
  onUpdatePlayers,
  currentUser,
  onStopBolillero,
  onBingoCompleted,
  autoHighlightDrawn: autoHighlightDrawnProp,
  currentBall,
  onDrawBall,
  isPlaying = false,
  onTogglePlay,
  onResetGame,
  settings,
  onUpdateSettings,
  gameSequence90 = [],
  onOpenGameSnapshot,
  onClearSequence90,
  onStartNewGame,
  totalBalls = 90,
  areBuilderHeadersHidden = false,
  onToggleBuilderHeaders,
  onOpenSavedGamesGallery,
  savedGamesCount,
}) => {
  // Initial sheet state supporting dynamic tables
  const initialSheet: Traditional90SheetData = useMemo(() => {
    const defaultTable1: Traditional90Table = {
      tableNumber: 1,
      title: '1',
      pricePerRow: 1.0,
      prize: 25.0,
      footerNotes: '',
      rows: generateDefaultRows(),
    };
    const defaultTable2: Traditional90Table = {
      tableNumber: 2,
      title: '2',
      pricePerRow: 1.0,
      prize: 25.0,
      footerNotes: '',
      rows: generateDefaultRows(),
    };

    try {
      const saved = safeGetItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const parsedTables: Traditional90Table[] =
          parsed.tables && parsed.tables.length > 0
            ? parsed.tables
            : [parsed.table1 || defaultTable1, parsed.table2 || defaultTable2].filter(Boolean);

        return {
          ...parsed,
          tables: parsedTables,
          table1: parsedTables[0] || defaultTable1,
          table2: parsedTables[1] || defaultTable2,
        };
      }
    } catch (err) {
      console.warn('Error loading initial 90-ball sheet:', err);
    }

    return {
      hostName: '',
      hostPhone: '',
      dateStr: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      pricePerRow: 1.0,
      table1: defaultTable1,
      table2: defaultTable2,
      tables: [defaultTable1, defaultTable2],
      players: [],
    };
  }, []);

  const [sheetData, setSheetData] = useState<Traditional90SheetData>(initialSheet);
  const sheetDataRef = useRef<Traditional90SheetData>(sheetData);
  sheetDataRef.current = sheetData;

  // Tables array normalized
  const tablesList = useMemo(() => {
    if (sheetData.tables && sheetData.tables.length > 0) {
      return sheetData.tables;
    }
    return [sheetData.table1, sheetData.table2].filter(Boolean);
  }, [sheetData.tables, sheetData.table1, sheetData.table2]);

  // Active marker table number (ONLY this planilla shows the yellow balls when balls are drawn!)
  const [activeMarkerTableNumber, setActiveMarkerTableNumber] = useState<number>(() => {
    return tablesList[0]?.tableNumber || 1;
  });

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [activeTableFilter, setActiveTableFilter] = useState<'all' | number>('all');

  // Sheet Density: ultra (extra compact for full screen vertical view), compact, mini, or standard
  const [sheetDensity, setSheetDensity] = useState<'ultra' | 'compact' | 'mini' | 'standard'>(() => {
    try {
      const saved = safeGetItem('bingo_90_sheet_density') as 'ultra' | 'compact' | 'mini' | 'standard' | null;
      if (saved && ['ultra', 'compact', 'mini', 'standard'].includes(saved)) {
        return saved;
      }
    } catch (err) {
      console.warn('Error reading bingo_90_sheet_density:', err);
    }
    return 'ultra';
  });

  const handleSetDensity = (newDensity: 'ultra' | 'compact' | 'mini' | 'standard') => {
    setSheetDensity(newDensity);
    safeSetItem('bingo_90_sheet_density', newDensity);
  };
  const [showPlayersBar, setShowPlayersBar] = useState<boolean>(true);

  // Track celebrated bingos to avoid loop
  const celebratedSheetBingosRef = useRef<Set<string>>(new Set());

  // Auto highlight drawn balls toggle (persisted)
  const [localAutoHighlightDrawn] = useState<boolean>(() => {
    try {
      return safeGetItem('bingo_auto_highlight_drawn') === 'true';
    } catch (err) {
      console.warn('Error reading bingo_auto_highlight_drawn:', err);
      return true;
    }
  });

  const isAutoHighlightActive =
    autoHighlightDrawnProp !== undefined ? autoHighlightDrawnProp : localAutoHighlightDrawn;

  const [manuallyCircledNumbers, setManuallyCircledNumbers] = useState<Set<number>>(new Set());

  // Amplified Fullscreen Sheet View (shows compact collapsible bolillero, horizontal sequence, and maximized sheet)
  const [isSheetExpanded, setIsSheetExpanded] = useState<boolean>(false);
  // When sheet is expanded, left bolillero panel can be collapsed or opened on demand
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState<boolean>(false);

  // Allow pressing Escape to exit expanded fullscreen sheet view
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSheetExpanded) {
        setIsSheetExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSheetExpanded]);

  // Listen to new game / clean slate event to wipe old marks and reset celebration locks
  useEffect(() => {
    const handleResetEvent = (evt: Event) => {
      const e = evt as CustomEvent<{ keepPlayers?: boolean }>;
      if (sheetDataRef.current) {
        savePreviousGameSheet90(sheetDataRef.current, currentUser);
      }

      setManuallyCircledNumbers(new Set());
      celebratedSheetBingosRef.current.clear();
      const keepPlayers = e?.detail?.keepPlayers ?? true;

      setSheetData((prev) => {
        const currentList = prev.tables && prev.tables.length > 0 ? prev.tables : [prev.table1, prev.table2];
        const updated = currentList.map((t) => ({
          ...t,
          rows: t.rows.map((r) => ({
            ...r,
            ...(keepPlayers ? {} : { playerId: undefined, playerName: undefined, color: undefined }),
            paid: false, // Ensure paid status is reset for the new game
          })),
        }));
        return {
          ...prev,
          tables: updated,
          table1: updated[0] || prev.table1,
          table2: updated[1] || prev.table2,
        };
      });
    };

    window.addEventListener('bingo_reset_sheet_for_new_game', handleResetEvent);
    return () => {
      window.removeEventListener('bingo_reset_sheet_for_new_game', handleResetEvent);
    };
  }, [currentUser]);

  // Toast notification
  const [notification, setNotification] = useState<string | null>(null);
  const notifyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (notifyTimeoutRef.current) {
        clearTimeout(notifyTimeoutRef.current);
      }
    };
  }, []);

  const notify = useCallback((msg: string) => {
    setNotification(msg);
    if (notifyTimeoutRef.current) {
      clearTimeout(notifyTimeoutRef.current);
    }
    notifyTimeoutRef.current = setTimeout(() => {
      setNotification(null);
      notifyTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Range assignment modal state
  const [showRangeModal, setShowRangeModal] = useState<boolean>(false);
  const [rangeTargetTable, setRangeTargetTable] = useState<number>(1);
  const [rangeStartRow, setRangeStartRow] = useState<number>(1);
  const [rangeEndRow, setRangeEndRow] = useState<number>(4);

  // Clear confirmation modal
  const [clearTarget, setClearTarget] = useState<number | 'all' | null>(null);

  // Collapsible top toolbar state to maximize vertical screen space
  const [isToolbarHidden, setIsToolbarHidden] = useState<boolean>(() => {
    try {
      return safeGetItem('bingo_90_toolbar_hidden') === 'true';
    } catch (err) {
      console.warn('Error reading bingo_90_toolbar_hidden:', err);
      return false;
    }
  });

  const handleToggleToolbar = () => {
    setIsToolbarHidden((prev) => {
      const next = !prev;
      safeSetItem('bingo_90_toolbar_hidden', String(next));
      notify(next ? 'Barra de opciones oculta. Máximo espacio vertical activo.' : 'Barra de opciones restaurada.');
      return next;
    });
  };

  // Undo history stack for up to 4 moves / actions
  const [sheet90UndoStack, setSheet90UndoStack] = useState<Traditional90Table[][]>([]);

  const pushUndoSnapshot90 = useCallback((tablesToSave?: Traditional90Table[]) => {
    setSheetData((current) => {
      const source = tablesToSave || (current.tables && current.tables.length > 0 ? current.tables : [current.table1, current.table2]);
      const cloned = source.map((tbl) => ({
        ...tbl,
        rows: tbl.rows.map((r) => ({ ...r })),
      }));
      setSheet90UndoStack((prev) => [cloned, ...prev].slice(0, 4));
      return current;
    });
  }, []);

  const handleUndo90 = useCallback(() => {
    if (sheet90UndoStack.length === 0) {
      notify('No hay movimientos previos para deshacer (máximo 4)');
      return;
    }
    const [prevTables, ...rest] = sheet90UndoStack;
    setSheet90UndoStack(rest);
    setSheetData((prev) => ({
      ...prev,
      tables: prevTables,
      table1: prevTables[0] || prev.table1,
      table2: prevTables[1] || prev.table2,
    }));
    notify(`Acción deshecha. Movimientos restantes: ${rest.length}/4`);
  }, [sheet90UndoStack, notify]);

  // Keyboard shortcut listener for Ctrl+Z / Cmd+Z to undo in 90-ball sheet
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const activeTag = (document.activeElement?.tagName || '').toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        e.preventDefault();
        handleUndo90();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo90]);

  // Direct modal for viewing previous game results
  const [directPreviousGameItem, setDirectPreviousGameItem] = useState<GameSequenceItem | null>(null);

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

  // "Mismos": Anotar automáticamente las mismas filas que tenía un jugador en la partida anterior
  // Regla: No quitar filas a otros jugadores; solo anotar las que estén disponibles
  const handleAssignSameRowsFromPreviousGame = (player: BingoSheetPlayer) => {
    const prevRows = getPreviousPlayerRows90(player.id, player.name, currentUser);
    if (!prevRows || prevRows.length === 0) {
      notify(`No hay filas previas guardadas para ${player.name}`);
      return;
    }

    pushUndoSnapshot90();

    let assigned = 0;
    let skipped = 0;

    setSheetData((prev) => {
      const currentList = prev.tables && prev.tables.length > 0 ? prev.tables : [prev.table1, prev.table2];
      const pNameLower = player.name.toLowerCase().trim();

      const updatedTables = currentList.map((tbl, tIdx) => {
        const tableNum = tbl.tableNumber || tIdx + 1;
        const newRows = [...tbl.rows];
        prevRows.forEach((item) => {
          if (item.table === tableNum && newRows[item.rowNumber - 1]) {
            const existingRow = newRows[item.rowNumber - 1];
            const isMine =
              existingRow.playerId === player.id ||
              (existingRow.playerName && existingRow.playerName.toLowerCase().trim() === pNameLower);
            const isAvailable = (!existingRow.playerId && !existingRow.playerName) || isMine;

            if (isAvailable) {
              newRows[item.rowNumber - 1] = {
                ...existingRow,
                playerId: player.id,
                playerName: player.name,
                color: player.color,
                textColor: player.textColor || '#000000',
                paid: false,
              };
              assigned++;
            } else {
              skipped++;
            }
          }
        });
        return { ...tbl, rows: newRows };
      });

      return {
        ...prev,
        tables: updatedTables,
        table1: updatedTables[0] || prev.table1,
        table2: updatedTables[1] || prev.table2,
      };
    });

    if (skipped > 0) {
      notify(`Se anotaron ${assigned} filas disponibles para ${player.name} (${skipped} ocupadas por otros)`);
    } else {
      notify(`Se anotaron ${assigned} filas de la partida anterior para ${player.name}`);
    }
  };

  // "Mismos a Todos": Anotar automáticamente las mismas filas para todos los jugadores
  // Regla: No quitar filas a otros jugadores; solo anotar las que estén disponibles
  const handleAssignSameRowsForAllPlayers = () => {
    if (players.length === 0) {
      notify('No hay jugadores registrados');
      return;
    }

    pushUndoSnapshot90();

    let totalApplied = 0;
    let totalSkipped = 0;

    setSheetData((prev) => {
      const currentList = prev.tables && prev.tables.length > 0 ? prev.tables : [prev.table1, prev.table2];
      const updatedTables = currentList.map((tbl, tIdx) => {
        const tableNum = tbl.tableNumber || tIdx + 1;
        const newRows = [...tbl.rows];
        players.forEach((player) => {
          const prevRows = getPreviousPlayerRows90(player.id, player.name, currentUser);
          if (prevRows && prevRows.length > 0) {
            const pNameLower = player.name.toLowerCase().trim();
            prevRows.forEach((item) => {
              if (item.table === tableNum && newRows[item.rowNumber - 1]) {
                const existingRow = newRows[item.rowNumber - 1];
                const isMine =
                  existingRow.playerId === player.id ||
                  (existingRow.playerName && existingRow.playerName.toLowerCase().trim() === pNameLower);
                const isAvailable = (!existingRow.playerId && !existingRow.playerName) || isMine;

                if (isAvailable) {
                  newRows[item.rowNumber - 1] = {
                    ...existingRow,
                    playerId: player.id,
                    playerName: player.name,
                    color: player.color,
                    textColor: player.textColor || '#000000',
                    paid: false,
                  };
                  totalApplied++;
                } else {
                  totalSkipped++;
                }
              }
            });
          }
        });
        return { ...tbl, rows: newRows };
      });

      return {
        ...prev,
        tables: updatedTables,
        table1: updatedTables[0] || prev.table1,
        table2: updatedTables[1] || prev.table2,
      };
    });

    if (totalSkipped > 0) {
      notify(`¡Mismos restaurados! Se anotaron ${totalApplied} filas disponibles (${totalSkipped} ya estaban ocupadas).`);
    } else {
      notify(`¡Mismos restaurados! Se anotaron ${totalApplied} filas para todos los jugadores`);
    }
  };

  // Add a new independent Planilla
  const handleAddTable = () => {
    const nextNum = tablesList.length + 1;
    const newTable: Traditional90Table = {
      id: `table_${Date.now()}_${nextNum}`,
      tableNumber: nextNum,
      title: String(nextNum),
      pricePerRow: sheetData.pricePerRow || 1.0,
      prize: 25.0,
      footerNotes: '',
      rows: generateDefaultRows(),
    };
    const updated = [...tablesList, newTable];
    setSheetData((prev) => ({
      ...prev,
      tables: updated,
      table1: updated[0] || prev.table1,
      table2: updated[1] || prev.table2,
    }));
    notify(`Planilla #${nextNum} agregada con éxito`);
  };

  // Delete an independent Planilla
  const handleDeleteTable = (tableNumber: number) => {
    if (tablesList.length <= 1) {
      notify('Debe haber al menos una planilla abierta');
      return;
    }
    const filtered = tablesList.filter((t) => t.tableNumber !== tableNumber);
    const reindexed = filtered.map((t, idx) => ({
      ...t,
      tableNumber: idx + 1,
      title: t.title === String(t.tableNumber) ? String(idx + 1) : t.title,
    }));
    setSheetData((prev) => ({
      ...prev,
      tables: reindexed,
      table1: reindexed[0],
      table2: reindexed[1] || reindexed[0],
    }));
    if (activeMarkerTableNumber === tableNumber) {
      setActiveMarkerTableNumber(reindexed[0].tableNumber);
    }
    notify(`Planilla eliminada`);
  };

  // Persist to IndexedDB-backed safeStorage
  useEffect(() => {
    safeSetItem(STORAGE_KEY, JSON.stringify(sheetData));
  }, [sheetData]);

  // Hydrate if IndexedDB KV store finishes async hydration on initial boot
  useEffect(() => {
    const handleIdbHydrated = () => {
      try {
        const savedRaw = safeGetItem(STORAGE_KEY);
        if (savedRaw) {
          const parsed = JSON.parse(savedRaw);
          if (parsed && (parsed.tables || parsed.table1)) {
            setSheetData((prev) => {
              const hasAssigned = (prev.tables || []).some((t) =>
                t.rows?.some((r) => Boolean(r.playerId || r.playerName))
              );
              if (hasAssigned) return prev;
              const parsedTables: Traditional90Table[] =
                parsed.tables && parsed.tables.length > 0
                  ? parsed.tables
                  : [parsed.table1, parsed.table2].filter(Boolean);
              return {
                ...prev,
                ...parsed,
                tables: parsedTables,
                table1: parsedTables[0] || prev.table1,
                table2: parsedTables[1] || prev.table2,
              };
            });
          }
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('bingo_indexeddb_kv_hydrated', handleIdbHydrated);
    return () => window.removeEventListener('bingo_indexeddb_kv_hydrated', handleIdbHydrated);
  }, []);

  // Set of drawn ball numbers from bolillero 90
  const drawnSet = useMemo(() => {
    return new Set<number>(drawnBalls.map((b) => b.number));
  }, [drawnBalls]);

  // Balls actually completed in game (from bolillero drawn balls OR manual circles)
  const effectiveHitsSet = useMemo(() => {
    const combined = new Set<number>(drawnSet);
    manuallyCircledNumbers.forEach((n) => combined.add(n));
    return combined;
  }, [drawnSet, manuallyCircledNumbers]);

  // Helper to calculate hits on 3 numbers
  const getRowHits = useCallback(
    (numbers: number[]) => {
      const hitCount = numbers.filter((n) => effectiveHitsSet.has(n)).length;
      return {
        count: hitCount,
        isBingo: hitCount === 3,
      };
    },
    [effectiveHitsSet]
  );

  // Winning rows across ALL open planillas
  const winningRows = useMemo(() => {
    const list: {
      tableNum: number;
      tableTitle: string;
      rowNumber: number;
      numbers: [number, number, number];
      playerName?: string;
    }[] = [];

    tablesList.forEach((tbl, tIdx) => {
      const tableNum = tbl.tableNumber || tIdx + 1;
      tbl.rows.forEach((r) => {
        const hits = getRowHits(r.numbers);
        if (hits.isBingo) {
          list.push({
            tableNum,
            tableTitle: tbl.title || String(tableNum),
            rowNumber: r.rowNumber,
            numbers: r.numbers as [number, number, number],
            playerName: r.playerName,
          });
        }
      });
    });

    return list;
  }, [tablesList, getRowHits]);

  // AUTOMATICALLY STOP BOLILLERO WHEN A ROW REACHES 3 NUMBERS ON ANY OPEN PLANILLA
  useEffect(() => {
    if (winningRows.length === 0) return;

    for (const win of winningRows) {
      const key = `t${win.tableNum}_r${win.rowNumber}_${win.numbers.join('_')}`;
      if (!celebratedSheetBingosRef.current.has(key)) {
        celebratedSheetBingosRef.current.add(key);

        if (onStopBolillero) {
          onStopBolillero();
        }

        notify(
          `🎉 ¡¡ BINGO EN PLANILLA #${win.tableNum} !! Fila #${win.rowNumber} ([${win.numbers.join(
            ', '
          )}])${win.playerName ? ` de ${win.playerName}` : ''}. ¡Bolillero 90 detenido!`
        );

        if (onBingoCompleted) {
          onBingoCompleted({
            rowNumber: win.rowNumber,
            numbers: win.numbers,
            tableNumber: win.tableNum,
            playerName: win.playerName,
          });
        }
      }
    }
  }, [winningRows, onStopBolillero, onBingoCompleted, notify]);

  // Selected player object
  const activePlayer = useMemo(() => {
    return players.find((p) => p.id === selectedPlayerId) || null;
  }, [players, selectedPlayerId]);

  // Toggle manually circled number
  const handleToggleCircleNumber = (num: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setManuallyCircledNumbers((prev) => {
      const next = new Set(prev);
      if (next.has(num)) {
        next.delete(num);
      } else {
        next.add(num);
      }
      return next;
    });
  };

  // Assign player to a specific row on a specific planilla
  const handleRowClick = (tableNum: number, rowIndex: number) => {
    setSheetData((prev) => {
      const currentList = prev.tables && prev.tables.length > 0 ? prev.tables : [prev.table1, prev.table2];
      const updatedTables = currentList.map((tbl, tIdx) => {
        const thisTableNum = tbl.tableNumber || tIdx + 1;
        if (thisTableNum !== tableNum) return tbl;

        const currentRows = [...tbl.rows];
        const currentRow = currentRows[rowIndex];

        if (!activePlayer) {
          // If no player selected and row has a player, clear row
          if (currentRow.playerId || currentRow.playerName) {
            currentRows[rowIndex] = {
              ...currentRow,
              playerId: undefined,
              playerName: undefined,
              color: undefined,
              paid: false,
            };
            notify(`Fila #${rowIndex + 1} de Planilla ${tableNum} desasignada.`);
            return { ...tbl, rows: currentRows };
          }
          notify('Selecciona un jugador arriba para asignarlo a esta fila.');
          return tbl;
        }

        // If already assigned to this player, clear it (toggle off)
        if (currentRow.playerId === activePlayer.id) {
          currentRows[rowIndex] = {
            ...currentRow,
            playerId: undefined,
            playerName: undefined,
            color: undefined,
            paid: false,
          };
          notify(`Fila #${rowIndex + 1} desasignada.`);
        } else {
          // Assign player (newly added row starts as unpaid: paid: false)
          currentRows[rowIndex] = {
            ...currentRow,
            playerId: activePlayer.id,
            playerName: activePlayer.name,
            color: activePlayer.color,
            textColor: activePlayer.textColor || '#000000',
            paid: false,
          };
          // Player now has an unpaid row, so their paid status becomes false until paid again
          if (activePlayer.paid) {
            const updatedP = players.map((pl) =>
              pl.id === activePlayer.id ? { ...pl, paid: false } : pl
            );
            onUpdatePlayers(updatedP);
          }
          notify(`Fila #${rowIndex + 1} asignada a ${activePlayer.name}.`);
        }

        return { ...tbl, rows: currentRows };
      });

      return {
        ...prev,
        tables: updatedTables,
        table1: updatedTables[0] || prev.table1,
        table2: updatedTables[1] || prev.table2,
      };
    });
  };

  // Assign range of rows
  const handleApplyRange = () => {
    if (!activePlayer) {
      notify('Primero selecciona un jugador de la lista.');
      return;
    }
    const start = Math.min(rangeStartRow, rangeEndRow);
    const end = Math.max(rangeStartRow, rangeEndRow);

    setSheetData((prev) => {
      const currentList = prev.tables && prev.tables.length > 0 ? prev.tables : [prev.table1, prev.table2];
      const updatedTables = currentList.map((tbl, tIdx) => {
        const thisTableNum = tbl.tableNumber || tIdx + 1;
        if (thisTableNum !== rangeTargetTable) return tbl;

        const updatedRows = tbl.rows.map((row) => {
          if (row.rowNumber >= start && row.rowNumber <= end) {
            return {
              ...row,
              playerId: activePlayer.id,
              playerName: activePlayer.name,
              color: activePlayer.color,
              textColor: activePlayer.textColor || '#000000',
              paid: false,
            };
          }
          return row;
        });

        if (activePlayer.paid) {
          const updatedP = players.map((pl) =>
            pl.id === activePlayer.id ? { ...pl, paid: false } : pl
          );
          onUpdatePlayers(updatedP);
        }

        return { ...tbl, rows: updatedRows };
      });

      return {
        ...prev,
        tables: updatedTables,
        table1: updatedTables[0] || prev.table1,
        table2: updatedTables[1] || prev.table2,
      };
    });

    notify(`Filas ${start} a ${end} en Planilla #${rangeTargetTable} asignadas a ${activePlayer.name}.`);
    setShowRangeModal(false);
  };

  // Clear rows of table or all
  const handleConfirmClear = () => {
    if (!clearTarget) return;

    setSheetData((prev) => {
      const currentList = prev.tables && prev.tables.length > 0 ? prev.tables : [prev.table1, prev.table2];
      const updatedTables = currentList.map((tbl, tIdx) => {
        const thisTableNum = tbl.tableNumber || tIdx + 1;
        if (clearTarget === 'all' || clearTarget === thisTableNum) {
          return {
            ...tbl,
            rows: generateDefaultRows(),
            footerNotes: '',
          };
        }
        return tbl;
      });

      return {
        ...prev,
        tables: updatedTables,
        table1: updatedTables[0] || prev.table1,
        table2: updatedTables[1] || prev.table2,
      };
    });

    setClearTarget(null);
    notify('Planilla limpiada con éxito.');
  };

  // Toggle paid status for a player across all their assigned rows
  const handleTogglePlayerPaid = (playerId: string) => {
    const p = players.find((pl) => pl.id === playerId);
    if (!p) return;
    const newPaidStatus = !p.paid;

    const updatedPlayers = players.map((item) =>
      item.id === playerId ? { ...item, paid: newPaidStatus } : item
    );
    onUpdatePlayers(updatedPlayers);

    setSheetData((prev) => {
      const currentList = prev.tables && prev.tables.length > 0 ? prev.tables : [prev.table1, prev.table2];
      const updatedTables = currentList.map((tbl) => ({
        ...tbl,
        rows: tbl.rows.map((r) => (r.playerId === playerId ? { ...r, paid: newPaidStatus } : r)),
      }));

      return {
        ...prev,
        tables: updatedTables,
        table1: updatedTables[0] || prev.table1,
        table2: updatedTables[1] || prev.table2,
      };
    });

    notify(`${p.name}: pago ${newPaidStatus ? 'CONFIRMADO (con línea roja diagonal)' : 'PENDIENTE'}.`);
  };

  // Density styles - Optimized vertically to fit all 30 rows on screen without vertical overflow
  const densityConfig = {
    ultra: {
      wrapper: 'p-0.5',
      headerPadding: 'px-1.5 py-0.5 min-h-[28px]',
      titleSize: 'text-base sm:text-lg',
      row: 'h-[17px]', // 17px * 30 = 510px total height! Fits on any screen
      numBox: 'w-28 sm:w-32 px-1',
      numFontSize: 'text-[10px] sm:text-[11px] font-black leading-none',
      circled: 'bg-amber-300 ring-1 ring-amber-500 font-black text-slate-950 rounded px-0.5 shadow-2xs leading-none',
      playerBox: 'px-1 text-[10px] font-bold leading-tight',
      statsText: 'text-[8.5px] leading-tight',
      footerPadding: 'px-1.5 py-0.5 min-h-[24px]',
      footerInput: 'text-[9.5px] font-bold py-0 px-1 h-4.5',
      badgeHits: 'text-[7.5px] px-0.5 leading-none',
    },
    compact: {
      wrapper: 'p-0.5 sm:p-1',
      headerPadding: 'px-1.5 py-0.5 min-h-[30px]',
      titleSize: 'text-lg sm:text-xl',
      row: 'h-[19px]', // 19px * 30 = 570px
      numBox: 'w-28 sm:w-32 px-1',
      numFontSize: 'text-[11px] sm:text-[11.5px] font-black leading-none',
      circled: 'bg-amber-300 ring-1 ring-amber-500 font-black text-slate-950 rounded px-0.5 shadow-2xs leading-none',
      playerBox: 'px-1 text-[10.5px] font-bold leading-tight',
      statsText: 'text-[9px]',
      footerPadding: 'px-1.5 py-0.5 min-h-[26px]',
      footerInput: 'text-[10px] font-bold py-0.5 px-1 h-5',
      badgeHits: 'text-[8px] px-1 leading-none',
    },
    mini: {
      wrapper: 'p-0.5',
      headerPadding: 'px-1 py-0.5 min-h-[26px]',
      titleSize: 'text-base sm:text-lg',
      row: 'h-[16px]', // 16px * 30 = 480px! Ultra compact
      numBox: 'w-28 sm:w-32 px-1',
      numFontSize: 'text-[10px] font-black leading-none',
      circled: 'bg-amber-300 ring-1 ring-amber-500 font-black text-slate-950 rounded px-0.5 shadow-2xs leading-none',
      playerBox: 'px-1 text-[9.5px] font-bold leading-tight',
      statsText: 'text-[8.5px]',
      footerPadding: 'px-1 py-0.5 min-h-[22px]',
      footerInput: 'text-[9px] font-bold py-0 px-1 h-4',
      badgeHits: 'text-[7.5px] px-0.5 leading-none',
    },
    standard: {
      wrapper: 'p-1',
      headerPadding: 'px-2 py-1 min-h-[34px]',
      titleSize: 'text-xl sm:text-2xl',
      row: 'h-[22px]', // 22px * 30 = 660px
      numBox: 'w-28 sm:w-32 px-1.5',
      numFontSize: 'text-xs sm:text-[12.5px] font-black leading-none',
      circled: 'bg-amber-300 ring-1 ring-amber-500 font-black text-slate-950 rounded px-1 shadow-2xs leading-none',
      playerBox: 'px-1.5 text-xs font-bold leading-tight',
      statsText: 'text-[10px]',
      footerPadding: 'px-2 py-0.5 min-h-[28px]',
      footerInput: 'text-xs font-bold py-0.5 px-1.5 h-5.5',
      badgeHits: 'text-[8.5px] px-1 leading-none',
    },
  };

  const currentD = densityConfig[sheetDensity];

  // Dynamic width classes based on whether the table has the numbers column (Table 1) or is row-only (Table 2+)
  // and whether the sheet is in amplified expanded fullscreen view
  const getTableWidthStyle = (totalCount: number, isNumbersTable: boolean) => {
    if (isSheetExpanded) {
      if (totalCount === 1) {
        // Single sheet in fullscreen: wide and prominent without overflowing or looking overstretched
        return 'w-full max-w-[560px] flex-shrink-0';
      }
      if (totalCount === 2) {
        // 2 sheets: P1 with numbers expands generously, P2 expands proportionally
        if (isNumbersTable) {
          return 'w-full sm:w-[440px] md:w-[480px] lg:w-[520px] flex-shrink-0';
        }
        return 'w-full sm:w-[320px] md:w-[360px] lg:w-[400px] flex-shrink-0';
      }
      if (totalCount === 3) {
        if (isNumbersTable) {
          return 'w-full sm:w-[380px] lg:w-[410px] xl:w-[440px] flex-shrink-0';
        }
        return 'w-full sm:w-[270px] lg:w-[290px] xl:w-[320px] flex-shrink-0';
      }
      // 4 or more sheets in expanded fullscreen view: comfortably wide to fill the expanded screen
      if (isNumbersTable) {
        return 'w-full sm:w-[340px] lg:w-[360px] xl:w-[380px] flex-shrink-0';
      }
      return 'w-full sm:w-[240px] lg:w-[260px] xl:w-[280px] flex-shrink-0';
    }

    // Normal view (sidebar present):
    if (totalCount === 1) {
      return 'w-full max-w-[380px]';
    }
    if (isNumbersTable) {
      // Table 1 (contains the 3 numbers column): ~320px - 340px
      return 'w-full sm:w-[325px] lg:w-[340px] flex-shrink-0';
    }
    // Table 2 and subsequent (no numbers column, just row index + player): ~215px - 235px
    return 'w-full sm:w-[215px] lg:w-[230px] flex-shrink-0';
  };

  // Render an individual table/planilla
  const renderTable = (tableData: Traditional90Table, tableIndex: number) => {
    const tableNum = tableData.tableNumber || tableIndex + 1;
    if (activeTableFilter !== 'all' && activeTableFilter !== tableNum) {
      return null;
    }

    const isNumbersTable = tableIndex === 0; // Table 1 is the master table showing numbers and marked balls
    const filledCount = tableData.rows.filter((r) => r.playerName || r.playerId).length;
    const totalCollected = filledCount * (tableData.pricePerRow || sheetData.pricePerRow || 1);
    const widthClass = getTableWidthStyle(tablesList.length, isNumbersTable);

    return (
      <div
        key={`table_${tableData.id || tableNum}`}
        className={`${widthClass} ${currentD.wrapper} bg-white rounded-xl border-2 border-black/90 shadow-md flex flex-col overflow-hidden text-black select-none transition-all`}
      >
        {/* Table Big Number Header */}
        <div
          className={`border-b-2 border-black/90 bg-[#fffdfa] ${currentD.headerPadding} flex items-center justify-between gap-1`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex items-center gap-0.5">
              <span
                className={`${currentD.titleSize} font-black text-rose-600 leading-none tracking-tighter drop-shadow-xs`}
              >
                {tableData.title || String(tableNum)}
              </span>
              <Heart className="w-2.5 h-2.5 fill-rose-400 text-rose-500 ml-0.5" />
            </div>
            <div className="flex flex-col ml-0.5 min-w-0">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-black uppercase text-slate-950 tracking-wider truncate">
                  Planilla #{tableNum}
                </span>
                {isNumbersTable ? (
                  <span
                    className="px-1.5 py-0.2 rounded-full bg-amber-400 text-amber-950 font-black text-[8px] leading-none flex items-center gap-0.5 shadow-2xs ring-1 ring-amber-500"
                    title="Esta planilla muestra y marca los números con resaltador amarillo"
                  >
                    Marcador
                  </span>
                ) : (
                  <span
                    className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 font-bold text-[8px] leading-none border border-slate-300"
                    title="Planilla vinculada: marca BINGO al cantarse los números de la fila"
                  >
                    Vinculada
                  </span>
                )}
              </div>
              <span className={`${currentD.statsText} font-bold text-slate-500 truncate`}>
                {filledCount}/30 vendidas • ${totalCollected.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Right Header Actions: + Rango, Delete */}
          <div className="no-print flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setRangeTargetTable(tableNum);
                setShowRangeModal(true);
              }}
              className="px-1.5 py-0.5 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-950 text-[9px] font-black transition-all border border-orange-300 shadow-2xs cursor-pointer"
              title="Asignar un bloque de filas a un jugador"
            >
              + Rango
            </button>

            <button
              type="button"
              onClick={() => setClearTarget(tableNum)}
              className="p-1 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
              title={`Limpiar Planilla #${tableNum}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>

            {tablesList.length > 1 && !isNumbersTable && (
              <button
                type="button"
                onClick={() => handleDeleteTable(tableNum)}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-100 transition-all cursor-pointer"
                title={`Eliminar Planilla #${tableNum} de la pantalla`}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 30 Rows */}
        <div className="flex-1 flex flex-col divide-y divide-black/70">
          {tableData.rows.map((row, rIdx) => {
            const hits = getRowHits(row.numbers);
            const hasPlayer = Boolean(row.playerName || row.playerId);
            const isPaid = row.paid ?? false;
            const rowColor = row.color || 'transparent';

            return (
              <div
                key={`${tableNum}_${row.rowNumber}`}
                onClick={() => handleRowClick(tableNum, rIdx)}
                className={`flex items-stretch ${currentD.row} cursor-pointer group transition-colors relative ${
                  hits.isBingo ? 'bg-amber-100/95 ring-2 ring-amber-500 ring-inset font-black animate-pulse' : ''
                }`}
                title={`Fila #${row.rowNumber}: [${row.numbers.join(', ')}] • ${
                  row.playerName ? `Jugador: ${row.playerName}` : 'Clic para asignar jugador'
                }`}
              >
                {isNumbersTable ? (
                  /* PLANILLA #1: 3 Numbers of the Row: [r. (r+30). (r+60).] with clear bold font */
                  <div
                    className={`${currentD.numBox} flex items-center justify-between border-r-2 border-black/90 bg-slate-50/90 group-hover:bg-orange-50/70 transition-colors flex-shrink-0`}
                  >
                    <div className="flex items-center justify-between w-full px-1">
                      {row.numbers.map((num) => {
                        const isCircled =
                          (isAutoHighlightActive && drawnSet.has(num)) ||
                          manuallyCircledNumbers.has(num);

                        return (
                          <span
                            key={num}
                            onClick={(e) => handleToggleCircleNumber(num, e)}
                            className={`tabular-nums font-mono ${currentD.numFontSize} tracking-tight transition-all cursor-pointer px-1 py-0.2 rounded select-none ${
                              isCircled
                                ? currentD.circled
                                : 'text-slate-950 font-black hover:text-orange-600'
                            }`}
                            title={
                              isCircled
                                ? `Bola ${num} cantada. Clic para desmarcar`
                                : `Bola ${num}. Clic para marcar con resaltador amarillo`
                            }
                          >
                            {num}.
                          </span>
                        );
                      })}
                    </div>

                    {/* Hits badge for table 1 */}
                    {hits.count > 0 && (
                      <span
                        className={`${currentD.badgeHits} font-black rounded-full leading-none flex items-center ml-0.5 flex-shrink-0 ${
                          hits.isBingo
                            ? 'bg-red-600 text-white animate-pulse'
                            : hits.count === 2
                            ? 'bg-amber-500 text-black'
                            : 'bg-slate-300 text-black'
                        }`}
                      >
                        {hits.isBingo ? 'BINGO' : `${hits.count}`}
                      </span>
                    )}
                  </div>
                ) : (
                  /* PLANILLA #2+: NO NUMBERS COLUMN - ONLY SLEEK ROW INDEX */
                  <div
                    className="w-7 sm:w-8 flex items-center justify-center border-r-2 border-black/90 bg-slate-100/90 font-mono font-black text-[11px] text-slate-700 flex-shrink-0 select-none"
                    title={`Fila #${row.rowNumber}`}
                  >
                    {row.rowNumber}.
                  </div>
                )}

                {/* Assigned Player Name + Color + Diagonal Paid Line + BINGO Badge on Planilla 2 */}
                {(() => {
                  const pObj = players.find(
                    (p) =>
                      p.id === row.playerId ||
                      (row.playerName && p.name.toLowerCase().trim() === row.playerName.toLowerCase().trim())
                  );
                  const effectiveTextColor = row.textColor || pObj?.textColor || '#0f172a';
                  const isLight = Boolean(
                    effectiveTextColor &&
                    effectiveTextColor !== '#000000' &&
                    effectiveTextColor !== '#0f172a'
                  );
                  return (
                    <div
                      className={`flex-1 ${currentD.playerBox} flex items-center justify-between relative overflow-hidden transition-colors`}
                      style={{
                        backgroundColor: rowColor !== 'transparent' ? rowColor : '#ffffff',
                      }}
                    >
                      <span
                        className="truncate max-w-[130px] select-none font-black"
                        style={{
                          color: effectiveTextColor,
                          textShadow: isLight
                            ? '0 1px 2px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.95)'
                            : undefined,
                        }}
                      >
                        {hasPlayer ? row.playerName : <span className="text-slate-300 font-light">-</span>}
                      </span>

                  {/* Diagonal red line for confirmed payment */}
                  {isPaid && (
                    <div
                      className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden"
                      title="Pago Confirmado"
                    >
                      <div className="w-[180%] h-0.5 bg-red-600 shadow-xs transform -rotate-12 border-t border-red-500" />
                    </div>
                  )}

                  {/* Right row badge: On Planilla 2, highlights BINGO or hits progress */}
                  <div className="flex items-center gap-1 ml-1 flex-shrink-0 z-10">
                    {!isNumbersTable && (
                      hits.isBingo ? (
                        <span className="px-1.5 py-0.2 rounded-full bg-red-600 text-white font-black text-[8.5px] uppercase tracking-wider shadow-xs animate-bounce flex items-center gap-0.5">
                          <span>🎉 BINGO</span>
                        </span>
                      ) : hits.count > 0 ? (
                        <span
                          className={`px-1 py-0.2 rounded-full font-black text-[8.5px] leading-none ${
                            hits.count === 2
                              ? 'bg-amber-400 text-amber-950 ring-1 ring-amber-500'
                              : 'bg-slate-200 text-slate-800'
                          }`}
                          title={`${hits.count} aciertos de 3 en Fila #${row.rowNumber}`}
                        >
                          {hits.count}
                        </span>
                      ) : null
                    )}

                    {hasPlayer && (
                      isPaid ? (
                        <Check className="w-2.5 h-2.5 text-red-600 stroke-[3]" />
                      ) : (
                        <span className="text-[8px] font-black text-rose-700 bg-rose-100/90 px-0.5 rounded leading-none">
                          $
                        </span>
                      )
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })}
        </div>

        {/* Bottom Box (Notes, Total, Winner) - Compact */}
        <div
          className={`border-t-2 border-black/90 ${currentD.footerPadding} bg-[#fffdfa] flex items-center justify-between gap-1.5 text-[10px]`}
        >
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="font-bold text-slate-700 uppercase text-[9px] flex-shrink-0">Ganador:</span>
            <input
              type="text"
              value={tableData.footerNotes || ''}
              onChange={(e) => {
                const val = e.target.value;
                setSheetData((prev) => {
                  const currentList = prev.tables && prev.tables.length > 0 ? prev.tables : [prev.table1, prev.table2];
                  const updatedTables = currentList.map((tbl, tIdx) => {
                    const thisTableNum = tbl.tableNumber || tIdx + 1;
                    return thisTableNum === tableNum ? { ...tbl, footerNotes: val } : tbl;
                  });
                  return {
                    ...prev,
                    tables: updatedTables,
                    table1: updatedTables[0] || prev.table1,
                    table2: updatedTables[1] || prev.table2,
                  };
                });
              }}
              placeholder="Anotar folio o ganador..."
              className={`w-full ${currentD.footerInput} rounded bg-slate-50 border border-slate-300 font-bold text-slate-900 focus:outline-none focus:border-black`}
            />
          </div>
          <span className="font-bold text-slate-800 flex-shrink-0 text-[9.5px]">
            Premio: ${Number(tableData.prize || 25).toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full flex flex-col items-center select-none text-[#431407]">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 z-50 px-4 py-2 rounded-2xl bg-[#431407] text-white text-xs font-bold shadow-xl animate-fade-in flex items-center gap-2 border border-orange-400">
          <Sparkles className="w-4 h-4 text-orange-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Main Toolbar: Planillas Filter, Add Planilla, Density, Marker Selector, Print (Collapsible for full vertical screen view) */}
      {!isSheetExpanded && (isToolbarHidden ? (
        <div className="no-print w-full max-w-[1600px] bg-white/95 backdrop-blur-xs rounded-xl border border-orange-200 shadow-2xs px-2.5 py-1 mb-1.5 flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleToggleToolbar}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95"
              title="Mostrar barra de opciones completa"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Mostrar Opciones</span>
            </button>

            <span className="text-[11px] font-bold text-slate-500 hidden md:inline">
              Barra oculta • Vista completa de las 30 filas sin scroll
            </span>

            {/* Quick table filter if more than 1 table */}
            {tablesList.length > 1 && (
              <div className="flex items-center gap-0.5 bg-[#fffaf5] p-0.5 rounded-lg border border-orange-200">
                <button
                  type="button"
                  onClick={() => setActiveTableFilter('all')}
                  className={`px-2 py-0.5 rounded text-[10.5px] font-black transition-all ${
                    activeTableFilter === 'all'
                      ? 'bg-orange-500 text-white shadow-xs'
                      : 'text-orange-950 hover:bg-orange-100'
                  }`}
                >
                  Todas ({tablesList.length})
                </button>
                {tablesList.map((tbl, idx) => {
                  const tableNum = tbl.tableNumber || idx + 1;
                  return (
                    <button
                      key={`collapsed_filter_btn_${tableNum}`}
                      type="button"
                      onClick={() => setActiveTableFilter(tableNum)}
                      className={`px-1.5 py-0.5 rounded text-[10.5px] font-black transition-all ${
                        activeTableFilter === tableNum
                          ? 'bg-orange-500 text-white shadow-xs'
                          : 'text-orange-950 hover:bg-orange-100'
                      }`}
                    >
                      P{tableNum}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Collapsed right quick controls */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Quick Density Switcher */}
            <div className="flex items-center gap-0.5 bg-[#fffaf5] p-0.5 rounded-lg border border-orange-200">
              <button
                type="button"
                onClick={() => handleSetDensity('ultra')}
                className={`px-2 py-0.5 rounded text-[10.5px] font-black transition-all ${
                  sheetDensity === 'ultra'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
                title="Densidad Ultra (Máxima compactación vertical para que quepan las 30 filas completas en pantalla)"
              >
                Ultra
              </button>
              <button
                type="button"
                onClick={() => handleSetDensity('compact')}
                className={`px-2 py-0.5 rounded text-[10.5px] font-black transition-all ${
                  sheetDensity === 'compact'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
                title="Densidad Compacta"
              >
                Compacto
              </button>
              <button
                type="button"
                onClick={() => handleSetDensity('mini')}
                className={`px-2 py-0.5 rounded text-[10.5px] font-black transition-all ${
                  sheetDensity === 'mini'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
                title="Densidad Mini"
              >
                Mini
              </button>
              <button
                type="button"
                onClick={() => handleSetDensity('standard')}
                className={`px-2 py-0.5 rounded text-[10.5px] font-black transition-all ${
                  sheetDensity === 'standard'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
                title="Densidad Normal"
              >
                Normal
              </button>
            </div>

            {/* Toggle Players Bar */}
            <button
              type="button"
              onClick={() => setShowPlayersBar(!showPlayersBar)}
              className={`px-2 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 border ${
                showPlayersBar
                  ? 'bg-orange-100 text-orange-950 border-orange-200'
                  : 'bg-orange-500 text-white border-orange-600'
              }`}
              title={showPlayersBar ? 'Ocultar barra de jugadores' : 'Mostrar barra de jugadores'}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Jugadores</span>
            </button>

            {/* Immersive / Builder Headers Toggle */}
            {onToggleBuilderHeaders && (
              <button
                type="button"
                onClick={onToggleBuilderHeaders}
                className={`px-2 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 border cursor-pointer ${
                  areBuilderHeadersHidden
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-orange-50 hover:bg-orange-100 text-orange-950 border-orange-200'
                }`}
                title={areBuilderHeadersHidden ? 'Mostrar encabezados superiores' : 'Ocultar cabeceras de la aplicación para mayor espacio vertical'}
              >
                {areBuilderHeadersHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden lg:inline">{areBuilderHeadersHidden ? 'Mostrar Menú' : 'Modo Inmersivo'}</span>
              </button>
            )}

            {/* Print */}
            <button
              type="button"
              onClick={() => window.print()}
              className="p-1 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-950 transition-all border border-orange-300 cursor-pointer"
              title="Imprimir planillas"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="no-print w-full max-w-[1600px] bg-white rounded-2xl border border-orange-200 shadow-sm p-2 sm:p-3 mb-2 flex flex-wrap items-center justify-between gap-2">
          {/* Left: Filter Planillas Tabs + Add Planilla Button */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-1 bg-[#fffaf5] p-1 rounded-xl border border-orange-200">
              <button
                type="button"
                onClick={() => setActiveTableFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  activeTableFilter === 'all'
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
              >
                Todas ({tablesList.length})
              </button>
              {tablesList.map((tbl, idx) => {
                const tableNum = tbl.tableNumber || idx + 1;
                return (
                  <button
                    key={`filter_btn_${tableNum}`}
                    type="button"
                    onClick={() => setActiveTableFilter(tableNum)}
                    className={`px-2 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      activeTableFilter === tableNum
                        ? 'bg-orange-500 text-white shadow-xs'
                        : 'text-orange-950 hover:bg-orange-100'
                    }`}
                  >
                    Planilla {tableNum}
                  </button>
                );
              })}
            </div>

            {/* Add Planilla Button */}
            <button
              type="button"
              onClick={handleAddTable}
              className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
              title="Agregar una nueva planilla independiente a la pantalla"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Planilla</span>
            </button>
          </div>

          {/* Center: Yellow Ball Marker Info Pill */}
          <div className="flex items-center gap-1.5 bg-[#fffaf5] px-2.5 py-1 rounded-xl border border-orange-200 shadow-2xs text-[11px] font-black text-orange-950">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-300 ring-2 ring-amber-400" />
            <span>Planilla 1 marca bolas cantadas • Planilla 2 marca BINGO al completar</span>
          </div>

          {/* Right: Density, Players toggle, Hide Toolbar, Print, Clear */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Density Buttons */}
            <div className="flex items-center gap-0.5 bg-[#fffaf5] p-0.5 rounded-xl border border-orange-200">
              <button
                type="button"
                onClick={() => handleSetDensity('ultra')}
                className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all ${
                  sheetDensity === 'ultra'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
                title="Densidad Ultra (Máxima compactación vertical para que quepan las 30 filas completas en un solo plano de pantalla)"
              >
                Ultra
              </button>
              <button
                type="button"
                onClick={() => handleSetDensity('compact')}
                className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all ${
                  sheetDensity === 'compact'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
                title="Densidad Compacta"
              >
                Compacto
              </button>
              <button
                type="button"
                onClick={() => handleSetDensity('mini')}
                className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all ${
                  sheetDensity === 'mini'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
                title="Densidad Mini"
              >
                Mini
              </button>
              <button
                type="button"
                onClick={() => handleSetDensity('standard')}
                className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all ${
                  sheetDensity === 'standard'
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'text-orange-950 hover:bg-orange-100'
                }`}
                title="Densidad Normal"
              >
                Normal
              </button>
            </div>

            {/* Toggle Players Bar */}
            <button
              type="button"
              onClick={() => setShowPlayersBar(!showPlayersBar)}
              className={`px-2 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 border ${
                showPlayersBar
                  ? 'bg-orange-100 text-orange-950 border-orange-200'
                  : 'bg-orange-500 text-white border-orange-600'
              }`}
              title={showPlayersBar ? 'Ocultar barra de jugadores' : 'Mostrar barra de jugadores'}
            >
              <Users className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Jugadores</span>
            </button>

            {/* Immersive / Builder Headers Toggle */}
            {onToggleBuilderHeaders && (
              <button
                type="button"
                onClick={onToggleBuilderHeaders}
                className={`px-2 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 border cursor-pointer ${
                  areBuilderHeadersHidden
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                    : 'bg-orange-50 hover:bg-orange-100 text-orange-950 border-orange-200'
                }`}
                title={areBuilderHeadersHidden ? 'Mostrar encabezados superiores' : 'Ocultar cabeceras superiores para mayor espacio vertical'}
              >
                {areBuilderHeadersHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span className="hidden lg:inline">{areBuilderHeadersHidden ? 'Mostrar Menú' : 'Modo Inmersivo'}</span>
              </button>
            )}

            {/* Ocultar Barra de Opciones Toggle Button */}
            <button
              type="button"
              onClick={handleToggleToolbar}
              className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-black transition-all border border-orange-300 shadow-2xs cursor-pointer active:scale-95"
              title="Ocultar barra de opciones para ver las planillas completas verticalmente"
            >
              <ChevronUp className="w-3.5 h-3.5 text-orange-800" />
              <span className="hidden sm:inline">Ocultar Barra</span>
              <span className="sm:hidden">Ocultar</span>
            </button>

            {/* Print */}
            <button
              type="button"
              onClick={() => window.print()}
              className="px-2.5 py-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95"
              title="Imprimir planillas de juego"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>

            {/* Resultados Partida Anterior */}
            <button
              type="button"
              onClick={handleShowPreviousGameResults}
              className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-xs border border-amber-600 shadow-xs flex items-center gap-1 cursor-pointer active:scale-95"
              title="Ver directamente los resultados y planilla de la partida anterior"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-950 fill-amber-950/20" />
              <span className="hidden sm:inline">Resultados</span>
              <span className="sm:hidden">Resultados</span>
            </button>

            {/* Partidas Guardadas */}
            {onOpenSavedGamesGallery && (
              <button
                type="button"
                onClick={onOpenSavedGamesGallery}
                className="px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95 border border-amber-700"
                title="Abrir galería de todas las partidas guardadas con planillas completas e historial"
              >
                <Layers className="w-3.5 h-3.5 text-yellow-200" />
                <span className="hidden sm:inline">Partidas Guardadas</span>
                <span className="sm:hidden">Partidas</span>
                {savedGamesCount !== undefined && savedGamesCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-yellow-300 text-[9px] font-black">
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
                className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95"
                title="Finalizar partida actual, archivar y comenzar nueva partida"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span className="hidden sm:inline">Nueva Partida</span>
              </button>
            )}

            {/* Clear All */}
            <button
              type="button"
              onClick={() => setClearTarget('all')}
              className="p-1 rounded-xl bg-orange-100 hover:bg-rose-100 text-orange-900 hover:text-rose-700 transition-all border border-orange-200 cursor-pointer"
              title="Limpiar todas las planillas"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}

      {/* Winning Alert Banner if a row hit 3 numbers */}
      {winningRows.length > 0 && (
        <div className="no-print w-full max-w-[1600px] bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 p-2.5 rounded-2xl shadow-lg border-2 border-yellow-300 flex items-center justify-between gap-2 mb-2 animate-pulse">
          <div className="flex items-center gap-2 min-w-0">
            <Trophy className="w-5 h-5 text-amber-950 flex-shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-xs sm:text-sm font-black tracking-tight text-amber-950 truncate">
                ¡¡ BINGO CANTADO EN BOLILLERO 90 !! ¡Bolillero detenido automáticamente!
              </span>
              <span className="text-[11px] font-extrabold text-amber-900 truncate">
                {winningRows
                  .map(
                    (w) =>
                      `Planilla #${w.tableNum} • Fila #${w.rowNumber} [${w.numbers.join(', ')}]${
                        w.playerName ? ` de ${w.playerName}` : ''
                      }`
                  )
                  .join(' | ')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onStartNewGame && (
              <button
                type="button"
                onClick={onStartNewGame}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer border border-emerald-400"
                title="Guardar esta partida y comenzar una nueva"
              >
                <Play className="w-3 h-3 fill-white" />
                <span>Nueva Partida</span>
              </button>
            )}
            <span className="px-2 py-0.5 rounded-lg bg-black text-white text-[10px] font-black uppercase shadow-xs">
              ¡3 Aciertos!
            </span>
          </div>
        </div>
      )}

      {/* Players Strip: Quick Selector for One-Click Assignment & Payment Strikethrough */}
      {!isSheetExpanded && showPlayersBar && (
        <div className="no-print w-full max-w-[1600px] bg-white rounded-2xl border border-orange-200 shadow-sm p-2 sm:p-2.5 mb-2">
          <div className="flex items-center justify-between mb-1.5 gap-2">
            <span className="text-xs font-black uppercase text-orange-900 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-orange-500" />
              Jugadores y Marcadores ({players.length})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAssignSameRowsForAllPlayers}
                className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95"
                title="Anotar automáticamente las mismas filas que cada jugador tenía en la partida anterior"
              >
                <RotateCcw className="w-2.5 h-2.5 text-amber-700" />
                <span>Mismos a Todos</span>
              </button>
            </div>
          </div>

          {players.length === 0 ? (
            <div className="p-2 rounded-xl bg-[#fffaf5] border border-dashed border-orange-200 text-center text-xs font-bold text-orange-800">
              No hay jugadores aún. Puedes agregarlos desde el panel o seleccionarlos para pintar las filas.
            </div>
          ) : (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {players.map((p) => {
                const isSelected = selectedPlayerId === p.id;
                const isPaid = p.paid ?? false;

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPlayerId(isSelected ? '' : p.id)}
                    className={`px-2 py-0.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 border flex-shrink-0 shadow-2xs ${
                      isSelected
                        ? 'ring-2 ring-orange-500 shadow-md scale-105'
                        : 'hover:scale-102 opacity-90'
                    }`}
                    style={{
                      backgroundColor: p.color,
                      borderColor: isSelected ? '#ea580c' : '#d1d5db',
                      color: p.textColor || '#0f172a',
                    }}
                    title={`Seleccionar a ${p.name}. Clic para asignar a filas.`}
                  >
                    <span
                      style={{
                        color: p.textColor || '#0f172a',
                        textShadow:
                          p.textColor && p.textColor !== '#000000' && p.textColor !== '#0f172a'
                            ? '0 1px 2px rgba(0,0,0,0.85)'
                            : undefined,
                      }}
                    >
                      {p.name}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAssignSameRowsFromPreviousGame(p);
                      }}
                      className="px-1 py-0.2 rounded text-[8px] font-black uppercase transition-all bg-amber-300 hover:bg-amber-200 text-amber-950 border border-amber-400 flex items-center gap-0.5 cursor-pointer active:scale-95 shadow-2xs whitespace-nowrap flex-shrink-0"
                      title={`Anotar automáticamente las mismas filas que ${p.name} tenía en la partida anterior`}
                    >
                      <RotateCcw className="w-2 h-2 text-amber-900" />
                      <span>Mismos</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTogglePlayerPaid(p.id);
                      }}
                      className={`px-1 py-0.2 rounded text-[8px] font-black uppercase transition-all whitespace-nowrap flex-shrink-0 ${
                        isPaid
                          ? 'bg-emerald-600 text-white ring-1 ring-emerald-400'
                          : 'bg-rose-500 text-white'
                      }`}
                      title={isPaid ? 'Pago confirmado (con raya roja diagonal)' : 'Marcar como pagado'}
                    >
                      {isPaid ? '✓ Conf.' : 'Pend.'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Layout: Left Bolillero 90 Sidebar + Right Independent Planillas */}
      <div
        className={`w-full ${
          isSheetExpanded
            ? 'fixed inset-0 z-40 bg-[#fffaf5] p-1.5 sm:p-2 flex flex-col overflow-hidden h-screen'
            : 'max-w-[1600px] flex flex-col lg:flex-row gap-4 items-start justify-center'
        }`}
      >
        <div
          className={`w-full flex-1 flex ${
            isSheetExpanded
              ? 'flex-row items-stretch gap-2 overflow-hidden min-h-0'
              : 'flex-col lg:flex-row gap-4 items-start'
          }`}
        >
          {/* Left Side: Bolillero 90 Virtual & Sequencer Panel */}
          {(!isSheetExpanded || !isLeftPanelCollapsed) && (
            <div
              className={`flex-shrink-0 transition-all ${
                isSheetExpanded ? 'h-full overflow-y-auto pr-0.5' : ''
              }`}
            >
              <Bolillero90Sidebar
                drawnBalls={drawnBalls}
                currentBall={currentBall ?? null}
                onDrawBall={onDrawBall || (() => {})}
                isPlaying={isPlaying}
                onTogglePlay={onTogglePlay || (() => {})}
                onResetGame={onResetGame || (() => {})}
                settings={
                  settings || {
                    mode: '90',
                    theme: 'classic',
                    speed: 'medium',
                    speedSeconds: 3,
                    voiceEnabled: true,
                    voiceVolume: 1,
                    sfxEnabled: true,
                    sayNicknames: true,
                    sheetPrice: 1,
                    payoutPercentage: 70,
                    currencySymbol: '$',
                  }
                }
                onUpdateSettings={onUpdateSettings || (() => {})}
                gameSequence90={gameSequence90}
                onOpenGameSnapshot={onOpenGameSnapshot}
                onClearSequence90={onClearSequence90}
                onStartNewGame={onStartNewGame}
                onOpenSavedGamesGallery={onOpenSavedGamesGallery}
                savedGamesCount={savedGamesCount}
                totalBalls={totalBalls}
                compact={isSheetExpanded}
                isSheetExpanded={isSheetExpanded}
                onToggleCollapse={() => setIsLeftPanelCollapsed(true)}
                hideSequence={isSheetExpanded}
                isAdmin={currentUser?.role === 'admin'}
                onDeleteGameItem={(item) => {
                  void deleteGamePermanently(item);
                  notify(`Partida #${item.round} eliminada.`);
                }}
              />
            </div>
          )}

          {/* Floating button on the left to reopen Bolillero when collapsed */}
          {isSheetExpanded && isLeftPanelCollapsed && (
            <button
              type="button"
              onClick={() => setIsLeftPanelCollapsed(false)}
              className="no-print absolute top-3 left-3 z-50 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white shadow-2xl border border-orange-400 font-black text-xs cursor-pointer active:scale-95 transition-all animate-fade-in"
              title="Abrir panel del bolillero 90"
            >
              <ChevronRight className="w-4 h-4 text-amber-200" />
              <span>Abrir Bolillero</span>
            </button>
          )}

          {/* Right Side: Dynamic Independent Planillas Grid / Flex Container */}
          <div
            className={`flex-1 min-w-0 ${
              isSheetExpanded ? 'h-full flex flex-col overflow-hidden min-h-0' : 'w-full'
            }`}
          >
            <main
              id="traditional-90-sheet-print"
              className={`printable-sheet relative bg-white text-black rounded-xl sm:rounded-2xl shadow-xl border-2 border-black/90 p-2 sm:p-3 flex flex-col gap-1.5 min-w-0 transition-all ${
                isSheetExpanded
                  ? 'flex-1 w-full overflow-y-auto'
                  : 'flex-1 w-full'
              }`}
            >
              {/* Paper Top Title & Host Info */}
              <div className="flex flex-wrap items-center justify-between pb-1 border-b-2 border-black/90 gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-black">
                    PLANILLAS DE TRIPLES • BINGO 90
                  </span>
                  <span className="text-[9px] sm:text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-slate-100 border border-slate-300">
                    {tablesList.length} {tablesList.length === 1 ? 'Planilla' : 'Planillas'} (30 Filas c/u)
                  </span>
                  {isSheetExpanded && (
                    <span className="no-print text-[9px] font-black px-2 py-0.5 rounded-full bg-orange-100 text-orange-950 border border-orange-300 flex items-center gap-1">
                      <span>Planilla Expandida</span>
                      <span className="text-slate-500 font-normal">(Presiona Esc para restaurar)</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-slate-500 uppercase font-black">Atiende:</span>
                    <input
                      type="text"
                      value={sheetData.hostName}
                      onChange={(e) => setSheetData({ ...sheetData, hostName: e.target.value })}
                      placeholder="Anfitrión..."
                      className="px-1 py-0.2 rounded border border-slate-300 text-xs font-black text-black w-24 sm:w-32 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-slate-500 uppercase font-black">Fecha:</span>
                    <input
                      type="text"
                      value={sheetData.dateStr}
                      onChange={(e) => setSheetData({ ...sheetData, dateStr: e.target.value })}
                      className="px-1 py-0.2 rounded border border-slate-300 text-xs font-bold text-black w-20 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Independent Planillas Container (P1 with numbers + P2 without numbers) */}
              <div className="flex flex-wrap items-start justify-center gap-1.5 sm:gap-2 w-full">
                {tablesList.map((tbl, idx) => renderTable(tbl, idx))}
              </div>

              {/* Footer Legend */}
              <div className="pt-1 border-t border-slate-200 flex flex-wrap items-center justify-between text-[9px] text-slate-500 font-semibold gap-1">
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-300 ring-1 ring-amber-500" />
                    P1 marca números cantados (resaltador amarillo) • P2 marca BINGO al completar la fila
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3.5 h-1.5 bg-slate-200 relative overflow-hidden">
                      <span className="absolute inset-0 border-t-2 border-red-500 rotate-12" />
                    </span>
                    Línea diagonal roja = Pago Confirmado
                  </span>
                </div>
                <span>
                  Total: {tablesList.length * 30} triples distribuidos en {tablesList.length} planillas
                </span>
              </div>
            </main>
          </div>
        </div>

        {/* BOTTOM: Horizontal Sequence Line when Sheet is Expanded */}
        {isSheetExpanded && (
          <div className="no-print w-full pt-1.5 flex-shrink-0 z-30">
            <GameSequenceBar
              sequence={gameSequence90}
              onOpenGameSnapshot={onOpenGameSnapshot}
              onClearSequence={onClearSequence90}
              onStartNewGame={onStartNewGame}
              onOpenSavedGamesGallery={onOpenSavedGamesGallery}
              savedGamesCount={savedGamesCount}
              mode="90"
              orientation="horizontal"
              compact={true}
              onUndo={handleUndo90}
              undoCount={sheet90UndoStack.length}
              onShowPreviousGameResults={handleShowPreviousGameResults}
              isExpanded={isSheetExpanded}
              onToggleExpand={() => {
                const next = !isSheetExpanded;
                setIsSheetExpanded(next);
                if (next && onToggleBuilderHeaders && !areBuilderHeadersHidden) {
                  onToggleBuilderHeaders();
                } else if (!next && onToggleBuilderHeaders && areBuilderHeadersHidden) {
                  onToggleBuilderHeaders();
                }
                notify(next ? 'Planilla amplificada en pantalla completa' : 'Vista normal restaurada');
              }}
              isAdmin={currentUser?.role === 'admin'}
              onDeleteGameItem={(item) => {
                void deleteGamePermanently(item);
                notify(`Partida #${item.round} eliminada.`);
              }}
            />
          </div>
        )}
      </div>

      {/* Modal: Asignar Rango de Filas */}
      {showRangeModal && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up text-[#431407]">
            <div className="flex items-center justify-between border-b border-orange-200 pb-2">
              <h4 className="text-sm font-black text-[#431407] flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-orange-600" />
                Asignar Rango de Filas
              </h4>
              <button
                type="button"
                onClick={() => setShowRangeModal(false)}
                className="p-1 rounded-lg text-orange-700 hover:bg-orange-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-black uppercase text-orange-900 mb-1">
                  Jugador Asignado:
                </label>
                <select
                  value={activePlayer?.id || ''}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-orange-300 text-xs font-black text-orange-950"
                >
                  <option value="">-- Seleccionar Jugador --</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase text-orange-900 mb-1">
                  Planilla de Destino:
                </label>
                <select
                  value={rangeTargetTable}
                  onChange={(e) => setRangeTargetTable(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-xl bg-white border border-orange-300 text-xs font-black text-orange-950"
                >
                  {tablesList.map((tbl, idx) => {
                    const num = tbl.tableNumber || idx + 1;
                    return (
                      <option key={`range_t_${num}`} value={num}>
                        Planilla #{num} ({tbl.title || num})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase text-orange-900 mb-1">
                    Fila Inicio (1-30):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={rangeStartRow}
                    onChange={(e) => setRangeStartRow(Math.max(1, Math.min(30, Number(e.target.value))))}
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-orange-300 text-xs font-black text-orange-950 text-center"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black uppercase text-orange-900 mb-1">
                    Fila Fin (1-30):
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={rangeEndRow}
                    onChange={(e) => setRangeEndRow(Math.max(1, Math.min(30, Number(e.target.value))))}
                    className="w-full px-3 py-1.5 rounded-xl bg-white border border-orange-300 text-xs font-black text-orange-950 text-center"
                  />
                </div>
              </div>

              <div className="p-2 rounded-xl bg-orange-100/70 border border-orange-200 text-[11px] text-orange-950 font-bold">
                Se asignarán las filas de la #{Math.min(rangeStartRow, rangeEndRow)} a la #
                {Math.max(rangeStartRow, rangeEndRow)} en la Planilla #{rangeTargetTable} a{' '}
                {activePlayer ? activePlayer.name : '(ningún jugador)'}.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-orange-200">
              <button
                type="button"
                onClick={() => setShowRangeModal(false)}
                className="px-3 py-1.5 rounded-xl bg-orange-200 hover:bg-orange-300 text-orange-950 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApplyRange}
                disabled={!activePlayer}
                className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black disabled:opacity-50"
              >
                Asignar Filas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Table Confirmation Modal */}
      {clearTarget !== null && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#fffaf5] border-2 border-rose-300 rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4 animate-scale-up text-[#431407]">
            <div className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="w-5 h-5" />
              <h4 className="text-sm font-black">
                {clearTarget === 'all'
                  ? '¿Limpiar todas las planillas?'
                  : `¿Limpiar Planilla #${clearTarget}?`}
              </h4>
            </div>

            <p className="text-xs text-orange-900 font-semibold leading-relaxed">
              {clearTarget === 'all'
                ? 'Se borrarán todos los jugadores asignados y notas de todas las planillas.'
                : `Se borrarán todos los jugadores asignados y notas de la Planilla #${clearTarget}.`}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-orange-200">
              <button
                type="button"
                onClick={() => setClearTarget(null)}
                className="px-3 py-1.5 rounded-xl bg-orange-200 hover:bg-orange-300 text-orange-950 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmClear}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-xs"
              >
                Sí, Limpiar
              </button>
            </div>
          </div>
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
    </div>
  );
};
