/**
 * Textos que se ajustan solos a su espacio en la Planilla 75:
 * el título del encabezado y el nombre del jugador dentro de cada casilla.
 * Se separaron del archivo principal sin cambiar nada de su funcionamiento.
 */
import React, { useRef, useState } from 'react';

/**
 * Título del encabezado de la planilla: usa el tamaño más grande posible
 * sin cortarse, según el espacio disponible.
 */
export const SheetHeaderFitTitle: React.FC<{ text: string; maxPx?: number; minPx?: number }> = ({
  text,
  maxPx = 32,
  minPx = 11,
}) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [fontPx, setFontPx] = useState<number>(maxPx);

  React.useLayoutEffect(() => {
    const box = boxRef.current;
    const span = textRef.current;
    if (!box || !span) return;

    const fit = () => {
      const available = box.clientWidth - 8;
      if (available <= 0) return;
      span.style.fontSize = maxPx + 'px';
      const needed = span.scrollWidth;
      const next = needed > available ? Math.max(minPx, Math.floor((maxPx * available) / needed)) : maxPx;
      span.style.fontSize = next + 'px';
      setFontPx(next);
    };

    fit();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => fit());
      observer.observe(box);
    }
    return () => {
      if (observer) observer.disconnect();
    };
  }, [text, maxPx, minPx]);

  return (
    <div ref={boxRef} className="min-w-0 flex-1 px-1 flex items-center justify-center overflow-hidden">
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap text-center font-black uppercase text-black tracking-wide"
        style={{ fontSize: fontPx + 'px', lineHeight: 1.05 }}
        title={text}
      >
        {text}
      </span>
    </div>
  );
};

/* ===================== Nombre ajustado a la casilla =====================
 * Hace que el nombre del jugador ocupe el alto de la casilla. Si es largo, primero se
 * "angosta" un poco (sin perder alto ni grosor) y, solo si aun así no cabe, se recorta
 * por la derecha. Usa UN solo ResizeObserver compartido y mide el texto con canvas
 * (sin reflujo), así no afecta el rendimiento aunque haya muchas casillas con nombre.
 */
let cellFitCanvasCtx: CanvasRenderingContext2D | null = null;
export const getCellFitCtx = (): CanvasRenderingContext2D | null => {
  if (cellFitCanvasCtx) return cellFitCanvasCtx;
  if (typeof document === 'undefined') return null;
  cellFitCanvasCtx = document.createElement('canvas').getContext('2d');
  return cellFitCanvasCtx;
};
export const cellFitCallbacks = new Map<Element, () => void>();
let cellFitObserver: ResizeObserver | null = null;
export const observeCellFit = (el: Element, cb: () => void) => {
  if (typeof ResizeObserver === 'undefined') return;
  if (!cellFitObserver) {
    cellFitObserver = new ResizeObserver((entries) => {
      for (const entry of entries) cellFitCallbacks.get(entry.target)?.();
    });
  }
  cellFitCallbacks.set(el, cb);
  cellFitObserver.observe(el);
};
export const unobserveCellFit = (el: Element) => {
  cellFitCallbacks.delete(el);
  cellFitObserver?.unobserve(el);
};

// Cuánto se puede angostar un nombre largo (1 = normal). 0.6 sigue viéndose limpio y legible.
export const CELL_NAME_MIN_SQUEEZE = 0.6;

export type CellFitState = { px: number; lines: string[]; squeeze: number; overflow: boolean };

export const CellFitName: React.FC<{
  text: string;
  scalePercent: number;
  style: React.CSSProperties;
  /** Proporción del alto que usa el nombre a 100% (por defecto 0.74) */
  heightRatio?: number;
}> = ({ text, scalePercent, style, heightRatio = 0.74 }) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<CellFitState | null>(null);
  const upper = text.toUpperCase().trim();

  React.useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const compute = () => {
      const w = box.clientWidth - 2;
      const h = box.clientHeight;
      const ctx = getCellFitCtx();
      if (w <= 4 || h <= 4 || !ctx) return;
      const family = window.getComputedStyle(box).fontFamily || 'sans-serif';
      ctx.font = `900 100px ${family}`;
      // ancho por cada px de fuente (con margen por el contorno que lo hace más grueso)
      const widthPerPx = (t: string) => (ctx.measureText(t).width / 100) * 1.06;
      const scale = Math.max(0.75, Math.min(1.45, scalePercent / 100));

      // Calcula tamaño, angostado y recorte para un juego de renglones
      const solve = (lines: string[], lineW: number) => {
        const n = lines.length;
        const maxH = n === 1 ? h * heightRatio : (h * 0.9) / (n * 0.95);
        const hardMax = n === 1 ? h * 0.9 : (h * 0.96) / (n * 0.95);
        // tamaño a 100%: alto deseado, sin pasarse del ancho aun angostando al máximo
        const base = Math.min(maxH, w / Math.max(lineW * CELL_NAME_MIN_SQUEEZE, 0.01));
        const px = Math.max(7, Math.min(base * scale, hardMax));
        const squeeze = Math.max(CELL_NAME_MIN_SQUEEZE, Math.min(1, w / Math.max(px * lineW, 0.01)));
        const overflow = px * lineW * squeeze > w + 0.5;
        // puntaje: alto real con penalización suave por angostar
        const score = base * Math.sqrt(Math.min(1, w / Math.max(base * lineW, 0.01)) || 1);
        return { px: Math.floor(px * 4) / 4, lines, squeeze: Math.round(squeeze * 100) / 100, overflow, score };
      };

      let best = solve([upper], widthPerPx(upper));
      const words = upper.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        let bestSplit: string[] = [upper];
        let bestW = Infinity;
        for (let i = 1; i < words.length; i++) {
          const a = words.slice(0, i).join(' ');
          const b = words.slice(i).join(' ');
          const mw = Math.max(widthPerPx(a), widthPerPx(b));
          if (mw < bestW) {
            bestW = mw;
            bestSplit = [a, b];
          }
        }
        const two = solve(bestSplit, bestW);
        if (two.score > best.score * 1.1) best = two;
      }
      const next: CellFitState = { px: best.px, lines: best.lines, squeeze: best.squeeze, overflow: best.overflow };
      setFit((prev) =>
        prev &&
        prev.px === next.px &&
        prev.squeeze === next.squeeze &&
        prev.overflow === next.overflow &&
        prev.lines.join('|') === next.lines.join('|')
          ? prev
          : next
      );
    };
    compute();
    observeCellFit(box, compute);
    // Recalcular cuando terminen de cargar las fuentes
    let alive = true;
    if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(() => alive && compute()).catch(() => {});
    }
    return () => {
      alive = false;
      unobserveCellFit(box);
    };
  }, [upper, scalePercent, heightRatio]);

  const px = fit?.px;
  // Contorno proporcional: todos los nombres (largos o cortos) se ven igual de gruesos
  const stroke = px ? Math.max(0.35, Math.min(0.9, px * 0.035)) : 0.4;

  return (
    <div
      ref={boxRef}
      className={`w-full h-full min-w-0 flex items-center overflow-hidden ${fit?.overflow ? 'justify-start' : 'justify-center'}`}
    >
      <span
        className="font-black uppercase block flex-shrink-0 select-none text-center"
        style={{
          ...style,
          fontSize: px ? `${px}px` : style.fontSize,
          fontWeight: 900,
          lineHeight: fit && fit.lines.length > 1 ? 0.95 : 1,
          letterSpacing: '0',
          whiteSpace: 'nowrap',
          wordBreak: 'normal',
          overflowWrap: 'normal',
          WebkitTextStroke: `${stroke.toFixed(2)}px currentColor`,
          transform: fit && fit.squeeze < 1 ? `scaleX(${fit.squeeze})` : undefined,
          transformOrigin: fit?.overflow ? 'left center' : 'center center',
        }}
      >
        {fit && fit.lines.length > 1 ? (
          <>
            {fit.lines[0]}
            <br />
            {fit.lines[1]}
          </>
        ) : (
          upper
        )}
      </span>
    </div>
  );
};
