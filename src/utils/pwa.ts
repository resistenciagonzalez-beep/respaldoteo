/**
 * Base de la app instalable (PWA).
 *
 * - Registra el service worker (/sw.js): permite abrir la plataforma con mala señal.
 * - Pide al teléfono que NO borre los datos guardados (partidas por subir, sesión).
 * - Si la app está instalada en el celular, mantiene la pantalla encendida mientras
 *   está abierta (útil durante el juego). En el navegador normal no cambia nada.
 *
 * Interruptor de emergencia: abrir la página con ?sinsw=1 desactiva el service worker
 * en ese dispositivo y borra sus copias, por si alguna vez hiciera falta.
 */

const SW_URL = '/sw.js';

function isInstalledApp(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

async function disableServiceWorker(): Promise<void> {
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('teo-')).map((k) => caches.delete(k)));
    console.warn('[PWA] Service worker desactivado en este dispositivo.');
  } catch (err) {
    console.warn('[PWA] No se pudo desactivar el service worker:', err);
  }
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (new URLSearchParams(window.location.search).has('sinsw')) {
    void disableServiceWorker();
    return;
  }
  navigator.serviceWorker.register(SW_URL).catch((err) => {
    console.warn('[PWA] No se pudo registrar el service worker:', err);
  });
}

function requestPersistentStorage(): void {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      void navigator.storage.persisted().then((already) => {
        if (!already) void navigator.storage.persist().catch(() => undefined);
      });
    }
  } catch {
    // no disponible en este navegador
  }
}

function keepScreenOnWhenInstalled(): void {
  if (!('wakeLock' in navigator) || !isInstalledApp()) return;

  let sentinel: WakeLockSentinel | null = null;
  const acquire = async () => {
    if (document.visibilityState !== 'visible' || sentinel) return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch {
      sentinel = null; // por ejemplo, batería baja: no pasa nada
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();
  });
  void acquire();
}

/** Se llama una sola vez al abrir la plataforma (solo en la versión publicada). */
export function setupPwa(): void {
  if (typeof window === 'undefined' || import.meta.env.DEV) return;
  const start = () => {
    registerServiceWorker();
    requestPersistentStorage();
    keepScreenOnWhenInstalled();
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
