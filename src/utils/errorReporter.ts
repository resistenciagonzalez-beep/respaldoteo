/**
 * Registro de errores para administradores.
 *
 * Cuando algo falla en el teléfono o computadora de una operadora, se guarda un aviso corto
 * en la base de datos (colección "error_logs") para que los administradores lo vean en el Panel.
 *
 * Protecciones para no saturar nada:
 * - Solo en la versión publicada (no mientras se programa).
 * - Máximo 5 avisos por sesión y nunca el mismo error dos veces en 10 minutos.
 * - Textos recortados y sin datos de partidas ni contraseñas.
 * - Si no se puede guardar, se ignora en silencio (nunca afecta el juego).
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { ERROR_LOG_COLLECTION, clipText, describeError, shouldReport, type ErrorLogEntry } from './errorReportRules';


const sessionState: { sent: number; history: Record<string, number> } = { sent: 0, history: {} };

function shortDevice(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';
  const standalone =
    typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  return clipText((standalone ? '[app instalada] ' : '') + ua, 200);
}

/** Envía un aviso de error (si corresponde). Nunca lanza errores. */
export function reportError(error: unknown, source: ErrorLogEntry['source']): void {
  try {
    if (!import.meta.env.PROD) return;
    const { message, detail } = describeError(error);
    const nowMs = Date.now();
    if (!shouldReport(message, nowMs, sessionState)) return;
    const user = auth.currentUser;
    if (!user) return; // sin sesión no se puede guardar en la base de datos
    sessionState.sent += 1;
    sessionState.history[message] = nowMs;
    const entry: ErrorLogEntry = {
      message,
      detail,
      source,
      path: clipText(typeof location !== 'undefined' ? location.pathname : '', 100),
      device: shortDevice(),
      build: clipText(typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : '', 60),
      uid: user.uid,
      email: clipText(user.email || '', 120),
      createdAtMs: nowMs,
    };
    void addDoc(collection(db, ERROR_LOG_COLLECTION), { ...entry, createdAt: serverTimestamp() }).catch(() => {});
  } catch {
    // El registro de errores nunca debe causar otro error
  }
}

let listening = false;

/** Escucha los errores generales de la página (se llama una sola vez al iniciar). */
export function startErrorReporting(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('error', (event) => {
    reportError(event.error || event.message, 'pagina');
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, 'promesa');
  });
}
