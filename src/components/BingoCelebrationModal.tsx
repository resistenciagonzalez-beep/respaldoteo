import React from 'react';
import { BingoMode } from '../types';
import { Trophy, Sparkles, X, Volume2, Play } from 'lucide-react';
import { getBingo75Letter } from '../utils/ballColors';

interface BingoCelebrationModalProps {
  isOpen: boolean;
  rowLeader: number;
  rowNumbers: number[];
  mode: BingoMode;
  drawnBall: number;
  onClose: () => void;
  onReplayFanfare?: () => void;
  onStartNewGame?: () => void;
  title?: string;
  subtitle?: string;
  playerName?: string;
  isTriple90?: boolean;
}

export const BingoCelebrationModal: React.FC<BingoCelebrationModalProps> = ({
  isOpen,
  rowLeader,
  rowNumbers,
  mode,
  drawnBall,
  onClose,
  onReplayFanfare,
  onStartNewGame,
  title,
  subtitle,
  playerName,
  isTriple90,
}) => {
  if (!isOpen) return null;

  const headerBadge = isTriple90
    ? '¡Fila Triple de 90 Completa!'
    : '¡Fila Horizontal Completa!';

  const mainTitle = title || '¡¡ ¡¡ BINGO !! !!';

  const descText =
    subtitle ||
    `El número ${drawnBall} ha completado la fila horizontal del número ${rowLeader}.`;

  return (
    <div
      id="bingo-celebration-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in select-none"
    >
      <div
        className="w-full max-w-md sm:max-w-lg rounded-3xl border-2 border-amber-500/70 shadow-[0_0_50px_rgba(245,158,11,0.35)] overflow-hidden flex flex-col transition-all bg-slate-900 text-slate-100"
      >
        {/* Header Ribbon / Trophy */}
        <div className="relative bg-gradient-to-b from-amber-500/30 via-amber-500/10 to-transparent p-6 pb-2 text-center flex flex-col items-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Golden Trophy Icon with Shimmer */}
          <div className="relative mb-3">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-amber-600 via-amber-400 to-yellow-200 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/50 animate-bounce">
              <Trophy className="w-9 h-9 sm:w-11 sm:h-11" />
            </div>
            <div className="absolute -top-1 -right-1 text-amber-300 animate-pulse">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-widest mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            {headerBadge}
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 tracking-tight">
            {mainTitle}
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-sm font-semibold">
            {descText}
          </p>

          {playerName && (
            <div className="mt-2.5 px-3 py-1 rounded-xl bg-amber-400/20 border border-amber-400/50 text-amber-200 text-xs sm:text-sm font-black flex items-center gap-1.5 shadow-sm">
              <span>🏆 Ganador(a):</span>
              <span className="text-yellow-300 font-extrabold uppercase">{playerName}</span>
            </div>
          )}
        </div>

        {/* Winning Numbers Strip */}
        <div className="p-4 sm:p-6 flex flex-col items-center gap-3">
          <div className="text-[11px] uppercase tracking-wider font-bold text-amber-400/90">
            Números de la fila completada:
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 w-full">
            {rowNumbers.map((num) => {
              const letter = mode === '75' ? getBingo75Letter(num) : null;
              const isLastDrawn = num === drawnBall;

              return (
                <div
                  key={num}
                  className={`flex flex-col items-center justify-center rounded-xl p-2 min-w-[52px] sm:min-w-[62px] border transition-all ${
                    isLastDrawn
                      ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-300 shadow-lg scale-105 font-black'
                      : 'bg-slate-800/90 text-amber-200 border-amber-500/40 font-bold'
                  }`}
                >
                  {letter && (
                    <span
                      className={`text-[10px] font-black tracking-widest ${
                        isLastDrawn ? 'text-slate-900' : 'text-amber-400'
                      }`}
                    >
                      {letter}
                    </span>
                  )}
                  <span className="text-base sm:text-lg font-black tabular-nums">
                    {num}
                  </span>
                  {isLastDrawn && (
                    <span className="text-[8px] font-black uppercase text-slate-900 mt-0.5">
                      Último
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-2.5">
          {onReplayFanfare && (
            <button
              onClick={onReplayFanfare}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-700 hover:bg-white/10 active:scale-95 transition-all text-slate-300 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Cantar de nuevo</span>
            </button>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onStartNewGame && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onStartNewGame();
                }}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-emerald-400"
                title="Guardar partida actual y preparar una nueva"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Guardar y Nueva Partida</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-lg shadow-amber-500/30 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Continuar Sorteo</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
