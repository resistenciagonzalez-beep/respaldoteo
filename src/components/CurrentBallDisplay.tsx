import React, { useMemo, memo } from 'react';
import { Ball, BingoMode, ThemeName } from '../types';
import { getBallSpec } from '../utils/ballColors';
import { getSpanishNickname } from '../utils/bingoNicknames';
import { History } from 'lucide-react';

interface CurrentBallDisplayProps {
  currentBall: Ball | null;
  drawnBalls: Ball[];
  mode: BingoMode;
  theme: ThemeName;
  sayNicknames: boolean;
  onOpenHistory: () => void;
  ternaInfo?: { ballNumber: number; rowLeader: number } | null;
}

export const CurrentBallDisplay: React.FC<CurrentBallDisplayProps> = memo(({
  currentBall,
  drawnBalls,
  mode,
  theme,
  sayNicknames,
  onOpenHistory,
  ternaInfo = null,
}) => {
  // Last 5 balls excluding current (or last 5 drawn overall)
  const recentBalls = useMemo(() => drawnBalls.slice(-6, -1).reverse(), [drawnBalls]);
  const currentSpec = useMemo(
    () => (currentBall ? getBallSpec(currentBall.number, mode, theme) : null),
    [currentBall, mode, theme]
  );
  const nickname = useMemo(
    () => (currentBall && sayNicknames ? getSpanishNickname(currentBall.number) : null),
    [currentBall, sayNicknames]
  );

  return (
    <div id="current-ball-container" className="flex flex-col items-center justify-center p-2.5 sm:p-3 w-full">
      {/* Giant Ball Presentation */}
      <div className="relative flex flex-col items-center justify-center min-h-[140px] sm:min-h-[160px] w-full">
        {currentBall && currentSpec ? (
          <div className="flex flex-col items-center animate-ball-pop">
            {/* 3D Ball Container */}
            <div
              className="relative rounded-full flex flex-col items-center justify-center select-none shadow-2xl transition-all duration-300"
              style={{
                width: 'clamp(100px, 16vw, 135px)',
                height: 'clamp(100px, 16vw, 135px)',
                background: currentSpec.bgGradient,
                borderColor: currentSpec.borderColor,
                borderWidth: theme === 'neon' ? '3px' : '2px',
                borderStyle: 'solid',
                boxShadow: currentSpec.shadow,
                color: currentSpec.textColor,
              }}
            >
              {/* Spherical glossy reflection highlight (Classic & Vintage) */}
              {theme === 'classic' && (
                <div className="absolute top-1.5 left-4 w-8 h-4 rounded-full bg-white/40 blur-[1px] -rotate-35 pointer-events-none" />
              )}
              {theme === 'vintage' && (
                <div className="absolute inset-1.5 rounded-full border border-amber-300/30 pointer-events-none" />
              )}

              {/* Letter for Bingo 75 */}
              {mode === '75' && currentSpec.letter && (
                <span
                  className="font-black tracking-widest text-sm sm:text-base leading-none opacity-90 drop-shadow-xs uppercase"
                  style={{
                    fontFamily: 'var(--font-heading)',
                  }}
                >
                  {currentSpec.letter}
                </span>
              )}

              {/* Giant Number */}
              <span
                className="font-black text-4xl sm:text-5xl md:text-6xl tracking-tighter leading-none select-none drop-shadow-md"
                style={{
                  fontFamily: theme === 'neon' ? 'var(--font-heading)' : 'system-ui, sans-serif',
                }}
              >
                {currentBall.number}
              </span>

              {/* Turn order indicator */}
              <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider opacity-75 mt-0.5">
                Bola #{currentBall.order || drawnBalls.length}
              </span>
            </div>

            {/* Traditional nickname callout if present */}
            {nickname && (
              <div
                className="mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold tracking-wide border shadow-xs text-center"
                style={{
                  backgroundColor: 'var(--surface-card)',
                  borderColor: 'var(--surface-border)',
                  color: 'var(--text-primary)',
                }}
              >
                «{nickname}»
              </div>
            )}
          </div>
        ) : (
          /* Empty / Waiting state */
          <div className="flex flex-col items-center justify-center text-center p-3 sm:p-4 rounded-2xl border border-dashed border-slate-700/40">
            <div
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border border-dashed flex items-center justify-center opacity-40 mb-1.5"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              <span className="text-2xl sm:text-3xl font-black text-slate-500">?</span>
            </div>
            <p className="text-xs font-medium opacity-70">
              Presiona «Extraer Bola» o «Iniciar»
            </p>
          </div>
        )}
      </div>

      {/* Live Terna Announcement Pill if Terna has been reached in current round */}
      {ternaInfo && (
        <div className="mt-1.5 mb-0.5 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/50 text-purple-300 text-[11px] sm:text-xs font-black flex items-center gap-1.5 shadow-xs animate-pulse select-none">
          <span>🎯</span>
          <span>¡TERNA CANTADA: Fila #{ternaInfo.rowLeader} con la balota #{ternaInfo.ballNumber}!</span>
        </div>
      )}

      {/* Horizontal Bar: Last 5 Drawn Balls */}
      <div
        id="recent-balls-bar"
        className="w-full max-w-xl mt-2 px-3 py-1.5 rounded-xl border flex items-center justify-between gap-2 shadow-xs transition-all"
        style={{
          backgroundColor: 'var(--surface-card)',
          borderColor: 'var(--surface-border)',
        }}
      >
        <div className="flex items-center gap-1 text-[11px] font-semibold opacity-70 whitespace-nowrap">
          <History className="w-3 h-3" />
          <span className="hidden sm:inline">Últimas:</span>
        </div>

        {/* List of 5 past balls */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 px-1 justify-center flex-1">
          {recentBalls.length > 0 ? (
            recentBalls.map((ball) => {
              const spec = getBallSpec(ball.number, mode, theme);
              return (
                <div
                  key={ball.number}
                  className="flex-shrink-0 flex items-center justify-center rounded-full font-bold text-xs shadow-xs transition-transform hover:scale-110"
                  style={{
                    width: '28px',
                    height: '28px',
                    background: spec.bgGradient,
                    color: spec.textColor,
                    border: `1.5px solid ${spec.borderColor}`,
                    boxShadow: theme === 'neon' ? spec.shadow : undefined,
                  }}
                  title={`Bola #${ball.order}: ${mode === '75' && spec.letter ? `${spec.letter}-${ball.number}` : ball.number}`}
                >
                  {ball.number}
                </div>
              );
            })
          ) : (
            <span className="text-[11px] opacity-50 italic">Sin bolas extraídas aún</span>
          )}
        </div>

        {/* Open full drawer / list */}
        <button
          id="btn-open-full-history"
          onClick={onOpenHistory}
          className="text-[11px] font-semibold px-2 py-0.5 rounded-lg border transition-colors hover:bg-white/10 active:scale-95 whitespace-nowrap"
          style={{
            borderColor: 'var(--surface-border)',
            color: 'var(--text-secondary)',
          }}
          title="Ver registro completo"
        >
          Historial ({drawnBalls.length})
        </button>
      </div>
    </div>
  );
});
