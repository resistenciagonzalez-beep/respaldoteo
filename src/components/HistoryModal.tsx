import React from 'react';
import { Ball, BingoMode, ThemeName } from '../types';
import { getBallSpec } from '../utils/ballColors';
import { getSpanishNickname } from '../utils/bingoNicknames';
import { X, History, FileText } from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  drawnBalls: Ball[];
  mode: BingoMode;
  theme: ThemeName;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  drawnBalls,
  mode,
  theme,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        style={{
          backgroundColor: 'var(--surface-card)',
          borderColor: 'var(--surface-border)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-700/20">
          <div className="flex items-center gap-2 font-bold text-base sm:text-lg">
            <History className="w-5 h-5 text-blue-400" />
            <span>Historial Completo de Extracciones ({drawnBalls.length})</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">
          {drawnBalls.length === 0 ? (
            <div className="py-12 text-center opacity-60 text-sm">
              Aún no se ha extraído ninguna bola en esta partida.
            </div>
          ) : (
            <div className="space-y-2">
              {[...drawnBalls].reverse().map((ball, idx) => {
                const spec = getBallSpec(ball.number, mode, theme);
                const nickname = getSpanishNickname(ball.number);
                const order = ball.order || drawnBalls.length - idx;

                return (
                  <div
                    key={`${ball.number}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-xl border bg-black/10 hover:bg-black/20 transition-colors"
                    style={{ borderColor: 'var(--surface-border)' }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Mini ball badge */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shadow-sm"
                        style={{
                          background: spec.bgGradient,
                          color: spec.textColor,
                          border: `1.5px solid ${spec.borderColor}`,
                        }}
                      >
                        {ball.number}
                      </div>

                      <div>
                        <div className="font-bold text-sm flex items-center gap-1.5">
                          <span>
                            {mode === '75' && spec.letter
                              ? `${spec.letter}-${ball.number}`
                              : `Bola ${ball.number}`}
                          </span>
                          {nickname && (
                            <span className="text-xs font-normal opacity-70 italic">
                              «{nickname}»
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] opacity-50">
                          {ball.drawnAt
                            ? new Date(ball.drawnAt).toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : 'Turno inicial'}
                        </div>
                      </div>
                    </div>

                    <div className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white/5 border border-white/10 opacity-75">
                      #{order}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700/20 flex items-center justify-between">
          <div className="text-xs opacity-60">
            {drawnBalls.length > 0 && `Total: ${drawnBalls.length} bolas`}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
