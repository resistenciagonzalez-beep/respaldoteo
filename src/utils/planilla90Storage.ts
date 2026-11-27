/**
 * Guardado local de la Planilla 90 nueva (claves propias, separadas de la Planilla 75).
 */
import type { AppUser, BingoSheetData } from '../types';
import { safeGetItem, safeSetItem, safeRemoveItem } from './safeStorage';
import { getCurrentLocalDateKey, getSavedGamesGallery, isGameOfOperator } from './savedGamesStorage';
import {
  STORAGE_KEY_PLANILLA90,
  STORAGE_KEY_PLANILLA90_DEBT,
  STORAGE_KEY_PLANILLA90_OFFSETS,
  STORAGE_KEY_PLANILLA90_PREVIOUS,
  STORAGE_KEY_PLANILLA90_WON,
  createDefaultPlanilla90,
  isPlanilla90Snapshot,
  normalizePlanilla90,
  type Planilla90Balances,
} from './planilla90Rules';

function readJson(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = safeGetItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('No se pudo leer', key, e);
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    safeSetItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('No se pudo guardar', key, e);
  }
}

/** Planilla en curso (o una vacía si no hay nada guardado). */
export function loadPlanilla90(): BingoSheetData {
  const raw = readJson(STORAGE_KEY_PLANILLA90);
  return raw ? normalizePlanilla90(raw) : createDefaultPlanilla90();
}

export function savePlanilla90(sheet: BingoSheetData): void {
  writeJson(STORAGE_KEY_PLANILLA90, sheet);
}

/** Planilla en curso tal como está guardada, o null si nunca se usó (para guardar la partida). */
export function getStoredPlanilla90Snapshot(): BingoSheetData | null {
  const raw = readJson(STORAGE_KEY_PLANILLA90);
  return raw && isPlanilla90Snapshot(raw) ? normalizePlanilla90(raw) : null;
}

function hasAssignedCells(sheet: BingoSheetData | null | undefined): boolean {
  return Boolean(
    sheet?.columns?.some((c) => c.cells?.some((cell) => Boolean(cell.playerId || (cell.playerName && cell.playerName.trim()))))
  );
}

export function savePreviousPlanilla90(sheet: BingoSheetData): void {
  if (hasAssignedCells(sheet)) writeJson(STORAGE_KEY_PLANILLA90_PREVIOUS, sheet);
}

/**
 * Planilla de la partida anterior para el botón "Mismos":
 * primero la última partida 90 guardada de esta operadora (formato nuevo), si no, la copia local.
 */
export function getPreviousPlanilla90(user?: AppUser | null, currentRound?: number): BingoSheetData | null {
  try {
    const today = getCurrentLocalDateKey();
    const found = getSavedGamesGallery().find((g) => {
      if (!g || (g.mode !== '90' && g.sheetType !== 'traditional-90')) return false;
      if (!isPlanilla90Snapshot(g.sheet75Snapshot) || !hasAssignedCells(g.sheet75Snapshot)) return false;
      if (user && !isGameOfOperator(g, user)) return false;
      if (currentRound !== undefined && g.dailyDate === today && typeof g.round === 'number' && g.round >= currentRound) {
        return false;
      }
      return true;
    });
    if (found?.sheet75Snapshot) return normalizePlanilla90(found.sheet75Snapshot);
  } catch (e) {
    console.warn('No se pudo buscar la partida 90 anterior', e);
  }
  const local = readJson(STORAGE_KEY_PLANILLA90_PREVIOUS);
  return local && isPlanilla90Snapshot(local) ? normalizePlanilla90(local) : null;
}

function readRecord(key: string): Record<string, number> {
  const raw = readJson(key);
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  Object.entries(raw as Record<string, unknown>).forEach(([k, v]) => {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  });
  return out;
}

export function loadPlanilla90Balances(): Planilla90Balances {
  return {
    won: readRecord(STORAGE_KEY_PLANILLA90_WON),
    debt: readRecord(STORAGE_KEY_PLANILLA90_DEBT),
    offsets: readRecord(STORAGE_KEY_PLANILLA90_OFFSETS),
  };
}

export function savePlanilla90Balances(b: Planilla90Balances): void {
  writeJson(STORAGE_KEY_PLANILLA90_WON, b.won);
  writeJson(STORAGE_KEY_PLANILLA90_DEBT, b.debt);
  if (Object.keys(b.offsets).length > 0) writeJson(STORAGE_KEY_PLANILLA90_OFFSETS, b.offsets);
  else safeRemoveItem(STORAGE_KEY_PLANILLA90_OFFSETS);
}
