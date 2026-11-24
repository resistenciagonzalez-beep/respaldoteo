import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Carga diferida de pantallas grandes (panel de administración, galería...).
 *
 * - La pantalla NO se descarga al abrir la página: así la plataforma abre más rápido.
 * - Unos segundos después de abrir, se descarga en segundo plano con `preload()`,
 *   para que al tocar el botón abra al instante y siga funcionando aunque se
 *   publique una versión nueva mientras la página está abierta.
 * - Si la descarga falla (internet inestable), se reintenta sola 2 veces.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PreloadableComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<unknown>;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithPreload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  let promise: Promise<{ default: T }> | null = null;

  const load = () => {
    if (!promise) {
      promise = (async () => {
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await factory();
          } catch (err) {
            lastError = err;
            if (attempt < 2) await wait(1000 * (attempt + 1));
          }
        }
        throw lastError;
      })().catch((err) => {
        promise = null; // se podrá volver a intentar después
        throw err;
      });
    }
    return promise;
  };

  const Component = lazy(load) as PreloadableComponent<T>;
  Component.preload = () => load().catch(() => undefined);
  return Component;
}

/** Ejecuta `task` cuando el navegador esté desocupado, sin afectar la carga inicial. */
export function runWhenIdle(task: () => void, delayMs = 3000): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let idleId: number | null = null;
  const timer = window.setTimeout(() => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (typeof ric === 'function') {
      idleId = ric.call(window, task);
    } else {
      task();
    }
  }, delayMs);
  return () => {
    window.clearTimeout(timer);
    const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (idleId !== null && typeof cic === 'function') cic.call(window, idleId);
  };
}
