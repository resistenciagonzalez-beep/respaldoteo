/**
 * Reglas puras del sistema de guardado (sin Firebase ni pantalla).
 *
 * Aquí viven las reglas que deciden fechas, carpetas por turno, número de partida,
 * hora AM/PM y líneas jugadas. Al estar separadas se pueden probar automáticamente
 * (ver saveRules.test.ts): si un cambio rompe una regla, GitHub lo marca en rojo.
 * savedGamesStorage.ts las usa y las vuelve a exportar con los mismos nombres.
 */
import type { GameSequenceItem } from '../types';

/**
 * Zona horaria oficial de la plataforma. Todas las fechas de carpetas y horas de guardado
 * se calculan en hora de Panamá, sin importar la zona horaria configurada en el
 * dispositivo de la operadora (evita que partidas de la noche caigan en la carpeta del día siguiente).
 */
export const APP_TIME_ZONE = 'America/Panama';

let appZoneFormatter: Intl.DateTimeFormat | null = null;

export function getAppZoneParts(d: Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  try {
    if (!appZoneFormatter) {
      appZoneFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: APP_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
    }
    const map: Record<string, string> = {};
    for (const p of appZoneFormatter.formatToParts(d)) {
      map[p.type] = p.value;
    }
    if (map.year && map.month && map.day && map.hour && map.minute && map.second) {
      return {
        year: map.year,
        month: map.month.padStart(2, '0'),
        day: map.day.padStart(2, '0'),
        hour: (map.hour === '24' ? '00' : map.hour).padStart(2, '0'),
        minute: map.minute.padStart(2, '0'),
        second: map.second.padStart(2, '0'),
      };
    }
  } catch {
    // Si el navegador no soporta zonas horarias, se usa la hora del dispositivo
  }
  return {
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1).padStart(2, '0'),
    day: String(d.getDate()).padStart(2, '0'),
    hour: String(d.getHours()).padStart(2, '0'),
    minute: String(d.getMinutes()).padStart(2, '0'),
    second: String(d.getSeconds()).padStart(2, '0'),
  };
}

/**
 * Converts any Date into its YYYY-MM-DD calendar day in Panama time.
 */
export function dateToAppDateKey(d: Date): string {
  const p = getAppZoneParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Returns the YYYY-MM-DD key for the day before the given YYYY-MM-DD key (pure calendar math).
 */
export function getPreviousDateKey(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Muestra una hora en formato normal de 12 horas con AM / PM (ej. "7:16 PM").
 * Acepta "19:16", "19:16:26" o textos antiguos como "07:16:26 p. m.".
 * Solo cambia cómo se MUESTRA: la hora se sigue guardando en 24 h para ordenar bien.
 */
export function formatTime12h(value?: string | null): string {
  if (!value) return '';
  const text = String(value).trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?$/i.exec(text.replace(/\u00a0/g, ' '));
  if (!m) return text;
  let h = Number(m[1]);
  const min = m[2];
  const marker = m[3] ? m[3].toLowerCase() : '';
  if (marker === 'p' && h < 12) h += 12;
  if (marker === 'a' && h === 12) h = 0;
  if (!(h >= 0 && h <= 23)) return text;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${suffix}`;
}

/**
 * Sanitizes an operator name into a normalized, uniform folder name.
 * Example: "Carla García" -> "carla_garcia"
 */
export function sanitizeOperatorFolderName(name?: string): string {
  if (!name || !name.trim()) return 'operadora_principal';
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');
}

/** Si una operadora deja pasar más de este tiempo sin guardar, se considera otra jornada. */
export const SHIFT_SEGMENT_MAX_GAP_MS = 6 * 60 * 60 * 1000;

/** Número de turno de una partida dentro de su fecha (las partidas antiguas son Turno 1). */
export function getGameShiftNumber(game: Partial<GameSequenceItem> | null | undefined): number {
  const n = game ? Number((game as GameSequenceItem).shiftNumber) : NaN;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Separa una clave de carpeta en fecha y número de turno. */
export function parseGameFolderKey(folderKey: string): { dateKey: string; shiftNumber: number } {
  const m = /^(\d{4}-\d{2}-\d{2})(?:#t(\d+))?$/.exec((folderKey || '').trim());
  if (!m) return { dateKey: folderKey, shiftNumber: 1 };
  const n = m[2] ? Number(m[2]) : 1;
  return { dateKey: m[1], shiftNumber: Number.isFinite(n) && n >= 1 ? n : 1 };
}

export function getGameServerSavedMs(game: GameSequenceItem): number | null {
  const raw = (game as any).updatedAt;
  if (raw && typeof raw === 'object' && typeof raw.seconds === 'number') return raw.seconds * 1000;
  if (raw && typeof raw.toMillis === 'function') {
    try {
      return raw.toMillis();
    } catch {
      return null;
    }
  }
  return null;
}

export function isSameOperatorGame(g: GameSequenceItem, item: GameSequenceItem, itemFolder: string): boolean {
  const itemUid = item.operatorUid && item.operatorUid !== 'anon' ? item.operatorUid : null;
  const gUid = g.operatorUid && g.operatorUid !== 'anon' ? g.operatorUid : null;
  if (itemUid && gUid) return itemUid === gUid;
  return sanitizeOperatorFolderName(g.operatorFolder || g.operatorName) === itemFolder;
}

/**
 * Parses any date string format into a strict YYYY-MM-DD canonical key.
 */
export function parseDateStringToDateKey(dateStr?: string | null): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{4}-\d{2}-\d{2}[T\s]/.test(trimmed)) {
    // Sin zona horaria explícita (Z o +hh:mm) la fecha ya es de calendario: se toma tal cual
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return dateToAppDateKey(d);
    }
    return trimmed.slice(0, 10);
  }

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    const p0 = slashParts[0].trim();
    const p1 = slashParts[1].trim();
    const p2 = slashParts[2].trim();
    if (p2.length === 4 && !isNaN(Number(p2))) {
      return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
    } else if (p0.length === 4 && !isNaN(Number(p0))) {
      return `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    }
  }

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3) {
    const p0 = dashParts[0].trim();
    const p1 = dashParts[1].trim();
    const p2 = dashParts[2].trim();
    if (p2.length === 4 && !isNaN(Number(p2))) {
      return `${p2}-${p1.padStart(2, '0')}-${p0.padStart(2, '0')}`;
    } else if (p0.length === 4 && !isNaN(Number(p0))) {
      return `${p0}-${p1.padStart(2, '0')}-${p2.padStart(2, '0')}`;
    }
  }

  const months: Record<string, string> = {
    ene: '01', enero: '01',
    feb: '02', febrero: '02',
    mar: '03', marzo: '03',
    abr: '04', abril: '04',
    may: '05', mayo: '05',
    jun: '06', junio: '06',
    jul: '07', julio: '07',
    ago: '08', agosto: '08',
    sep: '09', set: '09', septiembre: '09',
    oct: '10', octubre: '10',
    nov: '11', noviembre: '11',
    dic: '12', diciembre: '12',
  };
  const words = trimmed.toLowerCase().replace(/de/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    const day = words[0].padStart(2, '0');
    const monthStr = words[1].slice(0, 3);
    const year = words[words.length - 1];
    if (months[monthStr] && /^\d{4}$/.test(year) && /^\d{1,2}$/.test(day)) {
      return `${year}-${months[monthStr]}-${day}`;
    }
  }

  return null;
}

/**
 * Calculates the exact lines played for a given game snapshot.
 */
export function getGameLines(game: GameSequenceItem): number {
  if (game.totalLinesPlayed !== undefined && game.totalLinesPlayed !== null && game.totalLinesPlayed > 0) {
    return game.totalLinesPlayed;
  }
  const is90 = game.mode === '90' || game.sheetType === 'traditional-90';
  if (is90) {
    if (game.sheet90Snapshot) {
      const allTables =
        game.sheet90Snapshot.tables && game.sheet90Snapshot.tables.length > 0
          ? game.sheet90Snapshot.tables
          : [game.sheet90Snapshot.table1, game.sheet90Snapshot.table2].filter(Boolean);
      return allTables.length * 30;
    }
    return 30;
  }
  if (game.sheet75Snapshot?.columns && game.sheet75Snapshot.columns.length > 0) {
    return game.sheet75Snapshot.columns.reduce(
      (sum, col) => sum + (Number(col.multiplier) || 1),
      0
    );
  }
  return 11;
}


/**
 * Decide la carpeta (fecha + número de turno) de una partida NUEVA:
 * - Si su turno tiene una partida reciente (menos de 6 horas), va a la misma carpeta,
 *   aunque ya sea otro día (turno de noche que pasa de medianoche).
 * - Si no, va a la fecha de hoy con el siguiente número de turno libre de ese día.
 * `mine` son las partidas de la misma operadora; `getDateKey` da la fecha de carpeta de cada una.
 */
export function decideShiftFolderForNewGame(params: {
  item: GameSequenceItem;
  mine: GameSequenceItem[];
  today: string;
  nowMs: number;
  getDateKey: (g: GameSequenceItem) => string;
}): { dailyDate: string; shiftNumber: number } {
  const { item, mine, today, nowMs, getDateKey } = params;

  // Partida más reciente del mismo turno
  let latestSameShift: GameSequenceItem | null = null;
  let latestMs = -1;
  for (const g of mine) {
    if (g.shiftId !== item.shiftId) continue;
    // Las partidas aún sin confirmar en la nube cuentan como recientes
    const ms = getGameServerSavedMs(g) ?? nowMs;
    if (ms > latestMs) {
      latestMs = ms;
      latestSameShift = g;
    }
  }
  if (latestSameShift && nowMs - latestMs <= SHIFT_SEGMENT_MAX_GAP_MS) {
    return {
      dailyDate: getDateKey(latestSameShift),
      shiftNumber: getGameShiftNumber(latestSameShift),
    };
  }

  // Primera partida del turno: fecha de hoy y siguiente número de turno libre
  let maxShiftToday = 0;
  for (const g of mine) {
    if (getDateKey(g) !== today) continue;
    if (g.shiftId && g.shiftId === item.shiftId) continue;
    maxShiftToday = Math.max(maxShiftToday, getGameShiftNumber(g));
  }
  return { dailyDate: today, shiftNumber: maxShiftToday + 1 };
}

/** Siguiente número de partida dentro de una carpeta de turno (separado para 75 y 90). */
export function computeNextRoundInShift(params: {
  games: GameSequenceItem[];
  folder: { dailyDate: string; shiftNumber: number };
  is90: boolean;
  getDateKey: (g: GameSequenceItem) => string;
}): number {
  const { games, folder, is90, getDateKey } = params;
  let maxRound = 0;
  for (const g of games) {
    if (getDateKey(g) !== folder.dailyDate) continue;
    if (getGameShiftNumber(g) !== folder.shiftNumber) continue;
    const gIs90 = g.mode === '90' || g.sheetType === 'traditional-90';
    if (gIs90 !== is90) continue;
    if (typeof g.round === 'number' && g.round > maxRound) maxRound = g.round;
  }
  return maxRound + 1;
}
