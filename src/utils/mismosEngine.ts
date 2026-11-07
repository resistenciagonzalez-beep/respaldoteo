import {
  BingoSheetData,
  BingoSheetColumn,
  BingoSheetCell,
  BingoSheetPlayer,
  AppUser,
  GameSequenceItem,
} from '../types';
import { getContrastTextColor, VIBRANT_PLAYER_COLORS } from './playerColors';
import { getCurrentLocalDateKey, getOperatorStorageKey, isGameOfOperator } from './gameNormalization';
import { safeGetItem } from './safeStorage';
import {
  getSavedGamesHistoryForMismos,
  getSavedGamesHistoryFromMemoryForMismos,
} from './gameHistoryRepository';

export interface MismosPlayerReport {
  playerId: string;
  playerName: string;
  isNewPlayer: boolean;
  targetCount: number;
  assignedCount: number;
  shortageCount: number;
  valuesSummary: { value: number; target: number; assigned: number; shortage: number }[];
}

export interface MismosExecutionResult {
  success: boolean;
  totalAssigned: number;
  totalTarget: number;
  playersProcessed: number;
  newPlayersAdded: number;
  newColumnsCreated: number;
  playerReports: MismosPlayerReport[];
  updatedColumns: BingoSheetColumn[];
  updatedPlayers: BingoSheetPlayer[];
  message: string;
}

/**
 * Normalizes player name for reliable, case-insensitive comparison
 */
export function normalizePlayerName(name?: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const PREVIOUS_SHEET_75_ARCHIVE_KEY = 'bingo_previous_sheet_75_archive';

function getArchivedPreviousSheet75(
  user: AppUser | null | undefined,
  targetPlayerIdOrName?: string
): BingoSheetData | null {
  const keys = user
    ? [getOperatorStorageKey(PREVIOUS_SHEET_75_ARCHIVE_KEY, user), PREVIOUS_SHEET_75_ARCHIVE_KEY]
    : [PREVIOUS_SHEET_75_ARCHIVE_KEY];
  let fallback: BingoSheetData | null = null;
  for (const key of keys) {
    const raw = safeGetItem(key);
    if (!raw) continue;
    try {
      const sheet = JSON.parse(raw) as BingoSheetData;
      if (!sheet || !Array.isArray(sheet.columns)) continue;
      if (sheetHasPlayerCells(sheet, targetPlayerIdOrName)) return sheet;
      if (!fallback) fallback = sheet;
    } catch (error) {
      console.error('Error reading archived previous sheet75 for Mismos:', error);
    }
  }
  return fallback;
}

/**
 * Checks if a cell is free (not owned or marked by another player).
 */
export function isCellFree(cell?: BingoSheetCell | null): boolean {
  if (!cell) return true;
  const hasId = Boolean(cell.playerId && cell.playerId.trim() !== '');
  const hasName = Boolean(cell.playerName && cell.playerName.trim() !== '');
  return !hasId && !hasName;
}

/**
 * Checks if a given sheet contains at least one assigned cell for a specific player (or any player if not specified).
 */
function sheetHasPlayerCells(sheet?: BingoSheetData | null, targetPlayerIdOrName?: string): boolean {
  if (!sheet || !Array.isArray(sheet.columns) || sheet.columns.length === 0) return false;
  const queryNorm = targetPlayerIdOrName ? normalizePlayerName(targetPlayerIdOrName) : '';
  return sheet.columns.some(
    (c) =>
      Array.isArray(c.cells) &&
      c.cells.some((cell) => {
        if (isCellFree(cell)) return false;
        if (!targetPlayerIdOrName) return true;
        return (
          cell.playerId === targetPlayerIdOrName ||
          normalizePlayerName(cell.playerName) === queryNorm
        );
      })
  );
}

/**
 * Retrieves the immediately preceding 75-ball multiplier sheet snapshot.
 * Prioritizes:
 * 1. Explicit override sheet if provided
 * 2. Most recent saved game from Firestore-backed gallery (excluding the currently active in-progress round)
 * 3. In-session previous sheet snapshot
 */
export async function getImmediatelyPrecedingSheet75(
  currentUser?: AppUser | null,
  overrideSheet?: BingoSheetData | null,
  targetPlayerIdOrName?: string,
  currentMatchRound?: number
): Promise<BingoSheetData | null> {
  if (overrideSheet && Array.isArray(overrideSheet.columns) && overrideSheet.columns.length > 0) {
    return overrideSheet;
  }

  const memoryHistory = getSavedGamesHistoryFromMemoryForMismos(currentUser);
  let history: GameSequenceItem[] = memoryHistory?.fullyLoaded ? memoryHistory.games : [];
  const localToday = getCurrentLocalDateKey();

  // 1. Search the in-memory history belonging to the current operator first.
  if (currentUser) {
    for (const game of memoryHistory?.games || []) {
      if (
        currentMatchRound !== undefined &&
        game.round !== undefined &&
        game.round >= currentMatchRound &&
        game.dailyDate === localToday
      ) {
        continue;
      }
      if (!isGameOfOperator(game, currentUser)) continue;
      if (game.sheet75Snapshot && sheetHasPlayerCells(game.sheet75Snapshot, targetPlayerIdOrName)) {
        return game.sheet75Snapshot;
      }
    }
  }

  // Load Firestore history only when the required game was not found in memory
  // and the in-memory history is not already complete.
  if (!memoryHistory?.fullyLoaded) {
    try {
      history = await getSavedGamesHistoryForMismos(currentUser);
    } catch (error) {
      console.error('Could not read saved game history for Mismos:', error);
    }
  }

  // 2. Check in-session previous sheet archive
  const archived = getArchivedPreviousSheet75(currentUser, targetPlayerIdOrName);
  if (archived && sheetHasPlayerCells(archived, targetPlayerIdOrName)) {
    return archived;
  }

  // 3. Search all saved games in Firestore-backed gallery
  for (const game of history) {
    if (
      currentMatchRound !== undefined &&
      game.round !== undefined &&
      game.round >= currentMatchRound &&
      game.dailyDate === localToday
    ) {
      continue;
    }
    if (game.sheet75Snapshot && sheetHasPlayerCells(game.sheet75Snapshot, targetPlayerIdOrName)) {
      return game.sheet75Snapshot;
    }
  }

  // If targetPlayerIdOrName was specified and not found anywhere, still return latest operator game or archived sheet if it has any cells
  if (currentUser) {
    for (const game of history) {
      if (
        currentMatchRound !== undefined &&
        game.round !== undefined &&
        game.round >= currentMatchRound &&
        game.dailyDate === localToday
      ) {
        continue;
      }
      if (isGameOfOperator(game, currentUser) && game.sheet75Snapshot && sheetHasPlayerCells(game.sheet75Snapshot)) {
        return game.sheet75Snapshot;
      }
    }
  }

  if (archived && sheetHasPlayerCells(archived)) {
    return archived;
  }

  return archived || null;
}

/**
 * Core Deterministic Engine for "Mismos" Button:
 * Reconstructs the exact distribution of numbers and values each player had in the immediately preceding game.
 *
 * Rules:
 * 1. Read previous game snapshot.
 * 2. For each player, identify the exact numbers (rows) and total multiplier/value they had (e.g. 3 X2, 14 X4).
 * 3. In the current game, assign the same numbers with the same values.
 * 4. If a cell of that multiplier is occupied, search the sheet and equalize (e.g. a 3 X4 occupied is equalized with two 3 X2).
 * 5. If all cells of that number are occupied (or there is remaining multiplier needed), automatically open a new column
 *    with the needed multiplier and assign what is needed ("abrir automáticamente una nueva columna y anotar lo que haga falta").
 * 6. NEVER steal numbers from other players.
 * 7. NEVER overwrite existing annotations.
 * 8. If player doesn't exist in current game, auto-create them.
 * 9. 100% deterministic, automated, and faithful replication.
 */
export function executeMismosReconstruction({
  currentSheet,
  previousSheet,
  targetPlayerIdOrName,
  baseCost = 0.1,
  basePrize = 1.35,
}: {
  currentSheet: BingoSheetData;
  previousSheet: BingoSheetData;
  targetPlayerIdOrName?: string; // If set, only runs for this player; if unset, runs for all players
  baseCost?: number;
  basePrize?: number;
}): MismosExecutionResult {
  if (!previousSheet || !Array.isArray(previousSheet.columns) || previousSheet.columns.length === 0) {
    return {
      success: false,
      totalAssigned: 0,
      totalTarget: 0,
      playersProcessed: 0,
      newPlayersAdded: 0,
      newColumnsCreated: 0,
      playerReports: [],
      updatedColumns: currentSheet.columns,
      updatedPlayers: currentSheet.players,
      message: 'No se encontró la partida anterior para replicar los mismos números.',
    };
  }

  const totalRows = currentSheet.totalRows || 15;

  // Deep clone columns and players to maintain strict immutability
  const updatedColumns: BingoSheetColumn[] = currentSheet.columns.map((col) => ({
    ...col,
    cells: col.cells.map((cell) => ({ ...cell })),
  }));

  const updatedPlayers: BingoSheetPlayer[] = currentSheet.players.map((p) => ({ ...p }));

  // Helper to find player in current list
  const findPlayerInCurrent = (id?: string, name?: string): BingoSheetPlayer | undefined => {
    const normName = normalizePlayerName(name);
    return updatedPlayers.find(
      (p) =>
        (id && p.id === id) ||
        (normName && normalizePlayerName(p.name) === normName)
    );
  };

  // Helper to find player in previous list
  const findPlayerInPrevious = (id?: string, name?: string): BingoSheetPlayer | undefined => {
    if (!previousSheet.players) return undefined;
    const normName = normalizePlayerName(name);
    return previousSheet.players.find(
      (p) =>
        (id && p.id === id) ||
        (normName && normalizePlayerName(p.name) === normName)
    );
  };

  // 1. Gather all players to process
  interface PlayerTarget {
    id: string;
    name: string;
    color: string;
    textColor?: string;
  }

  const targetList: PlayerTarget[] = [];
  const processedKeys = new Set<string>();

  // Extract from previous sheet columns to find everyone who had marked cells
  previousSheet.columns.forEach((col) => {
    if (!Array.isArray(col.cells)) return;
    col.cells.forEach((cell) => {
      if (isCellFree(cell)) return;
      const pId = cell.playerId || '';
      const pName = cell.playerName || '';
      const key = normalizePlayerName(pName) || pId;
      if (!key || processedKeys.has(key)) return;

      if (targetPlayerIdOrName) {
        const queryNorm = normalizePlayerName(targetPlayerIdOrName);
        const matchesQuery =
          pId === targetPlayerIdOrName ||
          normalizePlayerName(pName) === queryNorm;
        if (!matchesQuery) return;
      }

      processedKeys.add(key);
      const prevDef = findPlayerInPrevious(pId, pName);
      targetList.push({
        id: pId || prevDef?.id || `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: pName || prevDef?.name || 'Jugador',
        color: cell.color || prevDef?.color || VIBRANT_PLAYER_COLORS[targetList.length % VIBRANT_PLAYER_COLORS.length].hex,
        textColor: cell.textColor || prevDef?.textColor || getContrastTextColor(cell.color || '#000000'),
      });
    });
  });

  // If specific target was given but had no cells in previous game
  if (targetPlayerIdOrName && targetList.length === 0) {
    return {
      success: false,
      totalAssigned: 0,
      totalTarget: 0,
      playersProcessed: 0,
      newPlayersAdded: 0,
      newColumnsCreated: 0,
      playerReports: [],
      updatedColumns,
      updatedPlayers,
      message: `No se encontraron casillas previas para "${targetPlayerIdOrName}" en la partida anterior.`,
    };
  }

  let totalAssigned = 0;
  let totalTarget = 0;
  let newPlayersAdded = 0;
  let newColumnsCreated = 0;
  const playerReports: MismosPlayerReport[] = [];

  // Helper to assign a specific cell on a column
  const assignCellToPlayer = (
    col: BingoSheetColumn,
    rIdx: number,
    rowNum: number,
    player: { id: string; name: string; color: string; textColor?: string }
  ) => {
    col.cells[rIdx] = {
      ...col.cells[rIdx],
      rowNumber: rowNum,
      playerId: player.id,
      playerName: player.name,
      color: player.color,
      textColor: player.textColor || getContrastTextColor(player.color),
      isPaid: false,
    };
  };

  // Helper to create a new column with specified multiplier and assign a given row to player
  const createNewColumnAndAssign = (
    multiplier: number,
    rowNum: number,
    player: { id: string; name: string; color: string; textColor?: string }
  ) => {
    const nextColNum = updatedColumns.length + 1;
    const newColCells: BingoSheetCell[] = [];
    for (let r = 1; r <= totalRows; r++) {
      newColCells.push({ rowNumber: r });
    }

    const newCol: BingoSheetColumn = {
      id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      colNumber: nextColNum,
      title: `X${multiplier}`,
      multiplier: multiplier,
      hasRedDividerRight: false,
      columnPrice: multiplier * (baseCost || 0.1),
      columnPrize: multiplier * (basePrize || 1.35),
      cells: newColCells,
    };

    assignCellToPlayer(newCol, rowNum - 1, rowNum, player);
    updatedColumns.push(newCol);
    newColumnsCreated++;
  };

  // 2. Process each target player
  targetList.forEach((target) => {
    const targetNormName = normalizePlayerName(target.name);

    // Rule 8: If player doesn't exist in current game, auto-create them
    let currentPlayer = findPlayerInCurrent(target.id, target.name);
    let isNewPlayer = false;
    if (!currentPlayer) {
      currentPlayer = {
        id: target.id,
        name: target.name,
        color: target.color,
        textColor: target.textColor || getContrastTextColor(target.color),
        paid: false,
        cumulativeWon: 0,
        cumulativeDebt: 0,
        balance: 0,
      };
      updatedPlayers.push(currentPlayer);
      isNewPlayer = true;
      newPlayersAdded++;
    }

    const playerObj = {
      id: currentPlayer.id,
      name: currentPlayer.name,
      color: currentPlayer.color,
      textColor: currentPlayer.textColor || getContrastTextColor(currentPlayer.color),
    };

    // Calculate total multiplier target per row (número) from previousSheet
    // Map<rowNumber, targetMultiplier>
    const previousRowMultipliers = new Map<number, number>();

    previousSheet.columns.forEach((col) => {
      const colMult = col.multiplier || 1;
      if (!Array.isArray(col.cells)) return;

      col.cells.forEach((cell, rIdx) => {
        if (isCellFree(cell)) return;
        const matchesId = cell.playerId && cell.playerId === target.id;
        const matchesName = cell.playerName && normalizePlayerName(cell.playerName) === targetNormName;

        if (matchesId || matchesName) {
          const rowNum = cell.rowNumber || rIdx + 1;
          const currentVal = previousRowMultipliers.get(rowNum) || 0;
          previousRowMultipliers.set(rowNum, currentVal + colMult);
        }
      });
    });

    let playerTargetCount = 0;
    let playerAssignedCount = 0;
    let playerShortageCount = 0;
    const valuesSummaryMap = new Map<number, { target: number; assigned: number }>();

    // Process row by row (sorted by row number: 1..15)
    const sortedRows = Array.from(previousRowMultipliers.keys()).sort((a, b) => a - b);

    sortedRows.forEach((rowNum) => {
      const targetMultiplier = previousRowMultipliers.get(rowNum)!;
      playerTargetCount++;
      totalTarget++;

      // Check what multiplier this player ALREADY has on this row in currentSheet
      let alreadyMultiplier = 0;
      updatedColumns.forEach((col) => {
        const cell = col.cells[rowNum - 1];
        if (!cell || isCellFree(cell)) return;
        const isMine =
          (cell.playerId && cell.playerId === playerObj.id) ||
          (cell.playerName && normalizePlayerName(cell.playerName) === targetNormName);
        if (isMine) {
          alreadyMultiplier += col.multiplier || 1;
        }
      });

      let remainingNeeded = Math.max(0, targetMultiplier - alreadyMultiplier);

      // Track target in summary
      const existingSummary = valuesSummaryMap.get(targetMultiplier) || { target: 0, assigned: 0 };
      existingSummary.target++;
      valuesSummaryMap.set(targetMultiplier, existingSummary);

      if (remainingNeeded <= 0) {
        playerAssignedCount++;
        totalAssigned++;
        existingSummary.assigned++;
        return;
      }

      // Step 3A: Direct Match First
      // Check if there is an existing column whose multiplier matches remainingNeeded exactly and has rowNum free
      let directMatchColIdx = -1;
      for (let cIdx = 0; cIdx < updatedColumns.length; cIdx++) {
        const col = updatedColumns[cIdx];
        if ((col.multiplier || 1) === remainingNeeded && isCellFree(col.cells[rowNum - 1])) {
          directMatchColIdx = cIdx;
          break;
        }
      }

      if (directMatchColIdx >= 0) {
        const targetCol = updatedColumns[directMatchColIdx];
        assignCellToPlayer(targetCol, rowNum - 1, rowNum, playerObj);
        remainingNeeded = 0;
        playerAssignedCount++;
        totalAssigned++;
        existingSummary.assigned++;
        return;
      }

      // Step 3B: Search on sheet and Equalize across available free cells
      // "en caso tal que alguna casilla este ocupada entonses el sistema debe poder buscar en la planilla e igualar,
      // por ejemplo, si tenia un 3 X4 y en la siguiente estan ocupadan la casilla X4, debe igualarlo y anotarlo
      // en 2 casillas X2 de ese numero, o con las que esten"
      const freeColsForThisRow = updatedColumns
        .map((col, cIdx) => ({ col, cIdx, mult: col.multiplier || 1 }))
        .filter((item) => isCellFree(item.col.cells[rowNum - 1]))
        .sort((a, b) => b.mult - a.mult); // Prioritize larger multipliers first

      for (const item of freeColsForThisRow) {
        if (remainingNeeded <= 0) break;
        if (item.mult <= remainingNeeded) {
          assignCellToPlayer(item.col, rowNum - 1, rowNum, playerObj);
          remainingNeeded -= item.mult;
        }
      }

      // Step 3C: If all cells were occupied or there is remaining needed multiplier,
      // "pero, si llegan a estar ocupadas todas las casillas que se deberian anotar,
      // el sistema debe abrir automaticamente una nueva columna y anotar lo que haga falta"
      if (remainingNeeded > 0) {
        createNewColumnAndAssign(remainingNeeded, rowNum, playerObj);
        remainingNeeded = 0;
      }

      playerAssignedCount++;
      totalAssigned++;
      existingSummary.assigned++;
    });

    const valuesSummary = Array.from(valuesSummaryMap.entries()).map(([value, s]) => ({
      value,
      target: s.target,
      assigned: s.assigned,
      shortage: Math.max(0, s.target - s.assigned),
    }));

    playerReports.push({
      playerId: playerObj.id,
      playerName: playerObj.name,
      isNewPlayer,
      targetCount: playerTargetCount,
      assignedCount: playerAssignedCount,
      shortageCount: playerShortageCount,
      valuesSummary,
    });
  });

  // Construct clear feedback message
  let message = '';
  if (targetPlayerIdOrName) {
    const report = playerReports[0];
    if (report) {
      const summaryParts = report.valuesSummary.map((v) => `X${v.value}: ${v.assigned}/${v.target}`);
      message = `¡Mismos asignados para ${report.playerName}! (${summaryParts.join(', ')})${newColumnsCreated > 0 ? ` • Se abrió ${newColumnsCreated} columna(s) nueva(s)` : ''}.`;
    } else {
      message = `No se pudieron asignar casillas para ${targetPlayerIdOrName}.`;
    }
  } else {
    message = `¡Mismos asignados para ${targetList.length} jugadores! Total: ${totalAssigned} números igualados${newColumnsCreated > 0 ? ` (${newColumnsCreated} columna(s) nueva(s) creadas)` : ''}.`;
  }

  return {
    success: totalAssigned > 0 || playerReports.length > 0,
    totalAssigned,
    totalTarget,
    playersProcessed: targetList.length,
    newPlayersAdded,
    newColumnsCreated,
    playerReports,
    updatedColumns,
    updatedPlayers,
    message,
  };
}
