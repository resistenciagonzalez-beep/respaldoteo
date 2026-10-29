import React from 'react';
import { BingoMode } from '../types';
import { Sparkles, Check, ChevronRight } from 'lucide-react';

interface ModeSelectionModalProps {
  isOpen: boolean;
  currentMode: BingoMode;
  hasDrawnBalls: boolean;
  onSelectMode: (mode: BingoMode) => void;
  onClose?: () => void;
}

export const ModeSelectionModal: React.FC<ModeSelectionModalProps> = ({
  isOpen,
  currentMode,
  hasDrawnBalls,
  onSelectMode,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="mode-selection-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in select-none"
    >
      <div
        className="w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col transition-all max-h-[95vh]"
        style={{
          backgroundColor: 'var(--surface-main)',
          borderColor: 'var(--surface-border)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-6 pb-3 border-b border-slate-700/20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-bold mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Modalidad de Juego
          </div>
          <h2
            className="text-xl sm:text-2xl font-black tracking-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Selecciona el Modo de Bingo
          </h2>
          <p className="text-xs sm:text-sm opacity-70 mt-1 max-w-md mx-auto">
            Elige entre el clásico Bingo 90 bolas tradicional o el Bingo Americano de 75 bolas (B-I-N-G-O).
          </p>

          {hasDrawnBalls && (
            <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold inline-block">
              ⚠️ Cambiar de modalidad reiniciará las bolas extraídas de la partida actual.
            </div>
          )}
        </div>

        {/* Modal Options Grid: ONLY 2 modes (Bingo 90 and Bingo Americano) */}
        <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto">
          {/* Card 1: Bingo 90 */}
          <div
            id="opt-select-bingo-90"
            onClick={() => onSelectMode('90')}
            className={`group relative rounded-2xl border p-5 cursor-pointer flex flex-col justify-between transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${
              currentMode === '90'
                ? 'ring-2 ring-blue-500 border-blue-500/80 bg-blue-500/10'
                : 'hover:border-blue-400/50 hover:bg-white/5'
            }`}
            style={{
              borderColor: currentMode === '90' ? undefined : 'var(--surface-border)',
              backgroundColor: currentMode === '90' ? undefined : 'var(--surface-card)',
            }}
          >
            {currentMode === '90' && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-sm">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Tradicional / Sala
              </span>
              <h3 className="text-xl font-black mt-2 mb-1 flex items-center gap-2">
                Bingo 90
                <span className="text-xs font-semibold opacity-60 font-normal">90 Bolas</span>
              </h3>
              <p className="text-xs opacity-75 leading-relaxed mb-4">
                Del número 1 al 90. Tablero de 9 columnas. Premios clásicos a Línea y Bingo.
              </p>
            </div>
            <button
              type="button"
              className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                currentMode === '90'
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-white/10 hover:bg-blue-600 hover:text-white text-slate-200'
              }`}
            >
              <span>Jugar Bingo 90</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Card 2: Bingo Americano (75 Bolas) */}
          <div
            id="opt-select-bingo-75"
            onClick={() => onSelectMode('75')}
            className={`group relative rounded-2xl border p-5 cursor-pointer flex flex-col justify-between transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] ${
              currentMode === '75'
                ? 'ring-2 ring-emerald-500 border-emerald-500/80 bg-emerald-500/10'
                : 'hover:border-emerald-400/50 hover:bg-white/5'
            }`}
            style={{
              borderColor: currentMode === '75' ? undefined : 'var(--surface-border)',
              backgroundColor: currentMode === '75' ? undefined : 'var(--surface-card)',
            }}
          >
            {currentMode === '75' && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
            <div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Estilo Americano
              </span>
              <h3 className="text-xl font-black mt-2 mb-1 flex items-center gap-2">
                Bingo Americano
                <span className="text-xs font-semibold opacity-60 font-normal">75 Bolas</span>
              </h3>
              <p className="text-xs opacity-75 leading-relaxed mb-4">
                Del número 1 al 75. 5 columnas identificadas con las letras <strong>B - I - N - G - O</strong>.
              </p>
            </div>
            <button
              type="button"
              className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                currentMode === '75'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-white/10 hover:bg-emerald-600 hover:text-white text-slate-200'
              }`}
            >
              <span>Jugar Bingo Americano</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Footer */}
        {onClose && (
          <div className="p-3 sm:p-4 border-t border-slate-700/20 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border hover:bg-white/10 active:scale-95 transition-all font-semibold text-xs opacity-80 hover:opacity-100 cursor-pointer"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
