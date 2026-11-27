/**
 * Reglas puras del registro de errores (sin Firebase): límites y limpieza de textos.
 * Tienen pruebas automáticas en errorReportRules.test.ts.
 */
export const ERROR_LOG_COLLECTION = 'error_logs';
export const MAX_REPORTS_PER_SESSION = 5;
export const SAME_ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const MESSAGE_MAX = 300;
const DETAIL_MAX = 1500;

export interface ErrorLogEntry {
  message: string;
  detail: string;
  source: 'pantalla' | 'pagina' | 'promesa';
  path: string;
  device: string;
  build: string;
  uid: string;
  email: string;
  createdAtMs: number;
}

/** Recorta un texto y quita saltos de línea repetidos. */
export function clipText(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  const clean = text.replace(/\s+\n/g, '\n').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

/** Convierte cualquier error en un mensaje y detalle cortos. */
export function describeError(error: unknown): { message: string; detail: string } {
  if (error instanceof Error) {
    return { message: clipText(error.message || error.name, MESSAGE_MAX), detail: clipText(error.stack || '', DETAIL_MAX) };
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return { message: clipText((error as { message: unknown }).message, MESSAGE_MAX), detail: '' };
  }
  return { message: clipText(error, MESSAGE_MAX), detail: '' };
}

/** Errores del navegador que no son de la plataforma y solo harían ruido. */
export function isIgnorableError(message: string): boolean {
  return (
    !message ||
    /ResizeObserver loop/i.test(message) ||
    /Script error\.?$/i.test(message) ||
    /extension:\/\//i.test(message) ||
    /chrome-extension/i.test(message)
  );
}

/**
 * Decide si un error se debe enviar (límite por sesión y sin repetir el mismo en 10 minutos).
 * `history` guarda la última hora de envío de cada mensaje.
 */
export function shouldReport(
  message: string,
  nowMs: number,
  state: { sent: number; history: Record<string, number> }
): boolean {
  if (isIgnorableError(message)) return false;
  if (state.sent >= MAX_REPORTS_PER_SESSION) return false;
  const last = state.history[message];
  if (last !== undefined && nowMs - last < SAME_ERROR_COOLDOWN_MS) return false;
  return true;
}
