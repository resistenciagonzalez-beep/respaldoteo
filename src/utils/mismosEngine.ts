import {
  BingoSheetData,
  BingoSheetColumn,
  BingoSheetCell,
  BingoSheetPlayer,
  AppUser,
} from '../types';
import { getContrastTextColor, VIBRANT_PLAYER_COLORS } from './playerColors';
import { getPreviousGameSheet75 } from './gameSnapshotStorage';
import { getSavedGamesGallery, getCurrentLocalDateKey, isGameOfOperator } from './savedGamesStorage';

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
 * Devuelve la planilla de 75 bolas de la partida guardada INMEDIATAMENTE ANTERIOR
 * a la partida actual (de la misma operadora). No salta a partidas más viejas.
 */
export function getImmediatelyPrecedingSheet75(
  currentUser?: AppUser | null,
  overrideSheet?: BingoSheetData | null,
  _targetPlayerIdOrName?: string,
  currentMatchRound?: number
): BingoSheetData | null {
  if (overrideSheet && Array.isArray(overrideSheet.columns) && overrideSheet.columns.length > 0) {
    return overrideSheet;
  }

  const gallery = getSavedGamesGallery(); // ordenada de la más reciente a la más antigua
  const localToday = getCurrentLocalDateKey();

  const previousGame = gallery.find((game) => {
    if (!game || !game.sheet75Snapshot || !Array.isArray(game.sheet75Snapshot.columns)) return false;
    if (game.mode === '90' || game.sheetType === 'traditional-90') return false;
    if (currentUser && !isGameOfOperator(game, currentUser)) return false;
    // La partida en curso (si ya se guardó) no cuenta como "anterior"
    if (
      currentMatchRound !== undefined &&
      game.dailyDate === localToday &&
      typeof game.round === 'number' &&
      game.round >= currentMatchRound
    ) {
      return false;
    }
    return true;
  });

  if (previousGame && previousGame.sheet75Snapshot) {
    return previousGame.sheet75Snapshot;
  }

  // Respaldo: planilla archivada en este dispositivo al terminar la partida anterior
  const archived = getPreviousGameSheet75(currentUser);
  if (archived && Array.isArray(archived.columns) && archived.columns.length > 0) {
    return archived;
  }
  return null;
}

/**
 * Motor del botón "MISMOS".
 *
 * Copia en la partida actual EXACTAMENTE los mismos números con los mismos valores que el jugador
 * tenía en la partida anterior. Ejemplo: si tenía el 4 en X5, el 2 en X2 y el 5 en X7, se anota
 * el 4 en una columna X5, el 2 en una X2 y el 5 en una X7.
 *
 * Reglas:
 * 1. Cada casilla anterior se copia con su número y su valor exactos (no se suman valores).
 * 2. Si la casilla de ese valor ya está ocupada, se busca otra columna del MISMO valor con ese número libre.
 * 3. Si no hay, se completa el valor combinando casillas libres de ese número que sumen exactamente lo mismo
 *    (ej.: X5 = X3 + X2).
 * 4. Si no se puede completar, se abre una columna nueva con ese valor (las que hagan falta).
 *    Las columnas nuevas se reutilizan para los siguientes números.
 * 5. Nunca se quitan casillas a otros jugadores ni se sobrescribe nada.
 * 6. Si el jugador ya tiene ese número con ese valor anotado, no se duplica.
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
  targetPlayerIdOrName?: string;
  baseCost?: number;
  basePrize?: number;
}): MismosExecutionResult {
  const updatedColumns: BingoSheetColumn[] = (currentSheet.columns || []).map((col) => ({
    ...col,
    cells: (col.cells || []).map((cell) => ({ ...cell })),
  }));
  const updatedPlayers: BingoSheetPlayer[] = (currentSheet.players || []).map((p) => ({ ...p }));

  const emptyResult = (message: string): MismosExecutionResult => ({
    success: false,
    totalAssigned: 0,
    totalTarget: 0,
    playersProcessed: 0,
    newPlayersAdded: 0,
    newColumnsCreated: 0,
    playerReports: [],
    updatedColumns,
    updatedPlayers,
    message,
  });

  if (!previousSheet || !Array.isArray(previousSheet.columns) || previousSheet.columns.length === 0) {
    return emptyResult('No se encontró la partida anterior para copiar los mismos números.');
  }

  const totalRows = currentSheet.totalRows || previousSheet.totalRows || 15;
  const queryNorm = targetPlayerIdOrName ? normalizePlayerName(targetPlayerIdOrName) : '';

  const cellBelongsTo = (cell: BingoSheetCell | undefined, id: string, normName: string): boolean => {
    if (!cell || isCellFree(cell)) return false;
    if (id && cell.playerId === id) return true;
    return Boolean(normName && cell.playerName && normalizePlayerName(cell.playerName) === normName);
  };

  const getRowCell = (col: BingoSheetColumn, rowNum: number): BingoSheetCell | undefined => {
    const byIndex = col.cells[rowNum - 1];
    if (byIndex && (byIndex.rowNumber === undefined || byIndex.rowNumber === rowNum)) return byIndex;
    return col.cells.find((c) => c && c.rowNumber === rowNum) || byIndex;
  };

  const getRowIndex = (col: BingoSheetColumn, rowNum: number): number => {
    const byIndex = col.cells[rowNum - 1];
    if (byIndex && (byIndex.rowNumber === undefined || byIndex.rowNumber === rowNum)) return rowNum - 1;
    const found = col.cells.findIndex((c) => c && c.rowNumber === rowNum);
    return found >= 0 ? found : rowNum - 1;
  };

  // 1. Jugadores de la partida anterior que tenían casillas
  interface PlayerTarget {
    id: string;
    name: string;
    color: string;
    textColor?: string;
  }
  const targetList: PlayerTarget[] = [];
  const seenKeys = new Set<string>();

  previousSheet.columns.forEach((col) => {
    if (!Array.isArray(col.cells)) return;
    col.cells.forEach((cell) => {
      if (isCellFree(cell)) return;
      const pId = cell.playerId || '';
      const pName = cell.playerName || '';
      const key = normalizePlayerName(pName) || pId;
      if (!key || seenKeys.has(key)) return;
      if (targetPlayerIdOrName && pId !== targetPlayerIdOrName && normalizePlayerName(pName) !== queryNorm) return;
      seenKeys.add(key);
      const prevDef = (previousSheet.players || []).find(
        (p) => (pId && p.id === pId) || (pName && normalizePlayerName(p.name) === normalizePlayerName(pName))
      );
      const color =
        cell.color || (prevDef && prevDef.color) || VIBRANT_PLAYER_COLORS[targetList.length % VIBRANT_PLAYER_COLORS.length].hex;
      targetList.push({
        id: pId || (prevDef && prevDef.id) || 'player_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: pName || (prevDef && prevDef.name) || 'Jugador',
        color,
        textColor: cell.textColor || (prevDef && prevDef.textColor) || getContrastTextColor(color),
      });
    });
  });

  if (targetList.length === 0) {
    return emptyResult(
      targetPlayerIdOrName
        ? '"' + targetPlayerIdOrName + '" no tenía números anotados en la partida anterior.'
        : 'La partida anterior no tiene números anotados.'
    );
  }

  let totalAssigned = 0;
  let totalTarget = 0;
  let newPlayersAdded = 0;
  let newColumnsCreated = 0;
  const playerReports: MismosPlayerReport[] = [];
  const assignedDetail: string[] = [];

  const assignCell = (col: BingoSheetColumn, rowNum: number, player: PlayerTarget) => {
    const idx = getRowIndex(col, rowNum);
    while (col.cells.length <= idx) {
      col.cells.push({ rowNumber: col.cells.length + 1 });
    }
    col.cells[idx] = {
      ...col.cells[idx],
      rowNumber: rowNum,
      playerId: player.id,
      playerName: player.name,
      color: player.color,
      textColor: player.textColor || getContrastTextColor(player.color),
      isPaid: false,
    };
  };

  const createColumn = (multiplier: number): BingoSheetColumn => {
    const cells: BingoSheetCell[] = [];
    for (let r = 1; r <= totalRows; r++) cells.push({ rowNumber: r });
    const template = updatedColumns.find((c) => (c.multiplier || 1) === multiplier);
    const newCol: BingoSheetColumn = {
      id: 'col_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      colNumber: updatedColumns.length + 1,
      title: 'X' + multiplier,
      multiplier,
      hasRedDividerRight: false,
      columnPrice: template && typeof template.columnPrice === 'number' ? template.columnPrice : multiplier * (baseCost || 0.1),
      columnPrize: template && typeof template.columnPrize === 'number' ? template.columnPrize : multiplier * (basePrize || 1.35),
      cells,
    };
    updatedColumns.push(newCol);
    newColumnsCreated++;
    return newCol;
  };

  // Busca casillas libres de ese número cuyos valores sumen EXACTAMENTE "value" (con la menor cantidad de casillas)
  const findExactCombination = (rowNum: number, value: number, allowEqual = false): BingoSheetColumn[] | null => {
    const free = updatedColumns
      .filter(
        (col) =>
          isCellFree(getRowCell(col, rowNum)) &&
          ((col.multiplier || 1) < value || (allowEqual && (col.multiplier || 1) === value))
      )
      .sort((a, b) => (b.multiplier || 1) - (a.multiplier || 1))
      .slice(0, 24);
    let best: BingoSheetColumn[] | null = null;
    const search = (start: number, remaining: number, chosen: BingoSheetColumn[]) => {
      if (remaining === 0) {
        if (!best || chosen.length < best.length) best = chosen.slice();
        return;
      }
      if (best && chosen.length >= best.length) return;
      for (let i = start; i < free.length; i++) {
        const m = free[i].multiplier || 1;
        if (m > remaining) continue;
        chosen.push(free[i]);
        search(i + 1, remaining - m, chosen);
        chosen.pop();
      }
    };
    search(0, value, []);
    return best;
  };

  targetList.forEach((target) => {
    const targetNorm = normalizePlayerName(target.name);

    let currentPlayer = updatedPlayers.find(
      (p) => (target.id && p.id === target.id) || normalizePlayerName(p.name) === targetNorm
    );
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

    const player: PlayerTarget = {
      id: currentPlayer.id,
      name: currentPlayer.name,
      color: currentPlayer.color,
      textColor: currentPlayer.textColor || getContrastTextColor(currentPlayer.color),
    };

    // Casillas exactas de la partida anterior: número -> lista de valores (uno por casilla)
    const previousByRow = new Map<number, number[]>();
    previousSheet.columns.forEach((col) => {
      if (!Array.isArray(col.cells)) return;
      col.cells.forEach((cell, idx) => {
        if (!cellBelongsTo(cell, target.id, targetNorm)) return;
        const rowNum = cell.rowNumber || idx + 1;
        const list = previousByRow.get(rowNum) || [];
        list.push(col.multiplier || 1);
        previousByRow.set(rowNum, list);
      });
    });

    const summary = new Map<number, { target: number; assigned: number }>();
    let playerTarget = 0;
    let playerAssigned = 0;

    Array.from(previousByRow.keys())
      .sort((a, b) => a - b)
      .forEach((rowNum) => {
        const neededValues = (previousByRow.get(rowNum) || []).slice().sort((a, b) => b - a);
        const rowTotal = neededValues.reduce((sum, val) => sum + val, 0);

        neededValues.forEach((value) => {
          playerTarget++;
          totalTarget++;
          const s = summary.get(value) || { target: 0, assigned: 0 };
          s.target++;
          summary.set(value, s);
        });

        const markRowAssigned = () => {
          neededValues.forEach((value) => {
            const s = summary.get(value);
            if (s) s.assigned++;
            playerAssigned++;
            totalAssigned++;
          });
        };

        // Lo que el jugador YA tiene anotado en este número en la partida actual
        const ownValues: number[] = [];
        updatedColumns.forEach((col) => {
          if (cellBelongsTo(getRowCell(col, rowNum), player.id, targetNorm)) ownValues.push(col.multiplier || 1);
        });
        const ownTotal = ownValues.reduce((sum, val) => sum + val, 0);

        // Ya tiene el valor completo de ese número: no se duplica
        if (ownTotal >= rowTotal) {
          markRowAssigned();
          return;
        }

        // Piezas que faltan según cómo estaba anotado antes (sin las que ya tiene iguales)
        const pendingPieces = neededValues.slice();
        ownValues.forEach((ov) => {
          const idx = pendingPieces.indexOf(ov);
          if (idx >= 0) pendingPieces.splice(idx, 1);
        });
        const remaining = rowTotal - ownTotal;

        // 1) SIMPLIFICAR: la menor cantidad de casillas libres de ese número que sumen exactamente lo que falta
        //    (ej.: antes 2 casillas X2 = 4, ahora hay una X4 libre -> se anota en la X4)
        const simplified = findExactCombination(rowNum, remaining, true);
        if (simplified && simplified.length > 0 && simplified.length <= Math.max(1, pendingPieces.length)) {
          simplified.forEach((col) => assignCell(col, rowNum, player));
          assignedDetail.push(rowNum + ' X' + remaining);
          markRowAssigned();
          return;
        }

        // 2) Si no se puede simplificar: igual que antes, valor por valor
        if (pendingPieces.length === 0) pendingPieces.push(remaining);
        pendingPieces.forEach((value) => {
          const sameValueCol = updatedColumns.find(
            (col) => (col.multiplier || 1) === value && isCellFree(getRowCell(col, rowNum))
          );
          if (sameValueCol) {
            assignCell(sameValueCol, rowNum, player);
          } else {
            const combo = findExactCombination(rowNum, value);
            if (combo && combo.length > 0) {
              combo.forEach((col) => assignCell(col, rowNum, player));
            } else {
              const newCol = createColumn(value);
              assignCell(newCol, rowNum, player);
            }
          }
          assignedDetail.push(rowNum + ' X' + value);
        });
        markRowAssigned();
      });

    playerReports.push({
      playerId: player.id,
      playerName: player.name,
      isNewPlayer,
      targetCount: playerTarget,
      assignedCount: playerAssigned,
      shortageCount: Math.max(0, playerTarget - playerAssigned),
      valuesSummary: Array.from(summary.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([value, s]) => ({
          value,
          target: s.target,
          assigned: s.assigned,
          shortage: Math.max(0, s.target - s.assigned),
        })),
    });
  });

  // Renumerar columnas para que queden en orden
  updatedColumns.forEach((col, idx) => {
    col.colNumber = idx + 1;
  });

  const columnsNote =
    newColumnsCreated > 0 ? ' Se abrieron ' + newColumnsCreated + ' columna(s) nueva(s).' : '';
  let message: string;
  if (targetPlayerIdOrName) {
    const report = playerReports[0];
    const detail = assignedDetail.length > 0 ? assignedDetail.join(', ') : 'ya los tenía todos anotados';
    message = 'Mismos de ' + (report ? report.playerName : targetPlayerIdOrName) + ': ' + detail + '.' + columnsNote;
  } else {
    message =
      'Mismos anotados para ' + targetList.length + ' jugador(es): ' + totalAssigned + ' número(s).' + columnsNote;
  }

  return {
    success: totalTarget > 0,
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
