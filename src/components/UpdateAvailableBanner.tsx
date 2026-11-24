import { useEffect, useState } from 'react';

/**
 * Aviso de "Hay una versión nueva".
 *
 * Cuando se publica un cambio, las pantallas que ya estaban abiertas siguen con la
 * versión anterior. Este aviso lo detecta (consultando /version.json cada pocos
 * minutos) y le pide a la operadora recargar CUANDO TERMINE la partida actual.
 * Nunca recarga sola, para no interrumpir un juego.
 */

const CHECK_EVERY_MS = 5 * 60 * 1000;
const FIRST_CHECK_MS = 60 * 1000;
const SNOOZE_MS = 30 * 60 * 1000;

async function fetchPublishedBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { buildId?: unknown };
    return typeof data.buildId === 'string' && data.buildId ? data.buildId : null;
  } catch {
    return null; // sin internet o en desarrollo: no se muestra nada
  }
}

export function UpdateAvailableBanner() {
  // Momento de la última revisión que encontró versión nueva (0 = no hay)
  const [detectedAt, setDetectedAt] = useState(0);
  const [snoozedUntil, setSnoozedUntil] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || import.meta.env.DEV) return;
    let cancelled = false;

    const check = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      const published = await fetchPublishedBuildId();
      if (!cancelled && published && published !== __APP_BUILD_ID__) {
        setDetectedAt(Date.now()); // vuelve a mostrarse en cada revisión si se pospuso
      }
    };

    const firstTimer = window.setTimeout(check, FIRST_CHECK_MS);
    const interval = window.setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!detectedAt || detectedAt < snoozedUntil) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 80,
        width: 'min(94vw, 460px)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 16,
        background: '#1e1b4b',
        color: '#fff',
        boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
        fontFamily: 'Outfit, system-ui, sans-serif',
      }}
    >
      <div style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>
        <strong style={{ display: 'block', fontSize: 13 }}>Hay una versión nueva de la plataforma</strong>
        Recarga cuando termines la partida actual.
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '8px 12px',
          borderRadius: 10,
          border: 'none',
          background: '#f97316',
          color: '#fff',
          fontWeight: 900,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Recargar
      </button>
      <button
        type="button"
        onClick={() => setSnoozedUntil(Date.now() + SNOOZE_MS)}
        style={{
          padding: '8px 10px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.35)',
          background: 'transparent',
          color: '#fff',
          fontWeight: 700,
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Luego
      </button>
    </div>
  );
}
