/**
 * Reloj confiable de la plataforma.
 *
 * Algunas operadoras tienen la fecha u hora de su dispositivo mal configurada
 * (adelantada o atrasada varias horas). Eso hacía que las partidas cayeran en la
 * carpeta de otro día. Aquí se compara el reloj del dispositivo con la hora del
 * servidor (encabezado "Date" de la propia página) y, si la diferencia es grande,
 * se corrige automáticamente.
 *
 * - No bloquea nada: mientras no hay respuesta del servidor se usa el reloj del dispositivo.
 * - Solo corrige diferencias mayores a 2 minutos (las pequeñas no afectan las carpetas).
 * - Se vuelve a revisar cada 30 minutos y al recuperar la conexión.
 */

const MIN_OFFSET_TO_APPLY_MS = 2 * 60 * 1000;
const RESYNC_INTERVAL_MS = 30 * 60 * 1000;

let clockOffsetMs = 0;
let syncInFlight: Promise<void> | null = null;
let started = false;

/** Milisegundos actuales corregidos con la hora del servidor. */
export function trustedNowMs(): number {
  return Date.now() + clockOffsetMs;
}

/** Fecha actual corregida con la hora del servidor. */
export function trustedNow(): Date {
  return new Date(trustedNowMs());
}

/** Diferencia aplicada (para diagnóstico). */
export function getTrustedClockOffsetMs(): number {
  return clockOffsetMs;
}

export function syncTrustedClock(): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve();
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    try {
      const t0 = Date.now();
      const res = await fetch(`${window.location.origin}/?clock=${t0}`, {
        method: 'HEAD',
        cache: 'no-store',
      });
      const t1 = Date.now();
      const header = res.headers.get('date');
      if (!header) return;
      const serverMs = Date.parse(header);
      if (isNaN(serverMs)) return;
      // El encabezado tiene precisión de 1 segundo: se compara contra el punto medio de la petición
      const offset = serverMs + 500 - Math.round((t0 + t1) / 2);
      const nextOffset = Math.abs(offset) >= MIN_OFFSET_TO_APPLY_MS ? offset : 0;
      if (nextOffset !== clockOffsetMs) {
        clockOffsetMs = nextOffset;
        if (nextOffset !== 0) {
          console.info(
            '[RELOJ] La hora de este dispositivo difiere de la real en ' +
              Math.round(nextOffset / 60000) +
              ' minutos. Se usa la hora correcta para las carpetas.'
          );
        }
      }
    } catch {
      // Sin conexión: se mantiene la última corrección conocida
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

export function startTrustedClock(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  void syncTrustedClock();
  try {
    window.setInterval(() => void syncTrustedClock(), RESYNC_INTERVAL_MS);
    window.addEventListener('online', () => void syncTrustedClock());
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  startTrustedClock();
}
