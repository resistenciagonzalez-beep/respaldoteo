import React, { useState } from 'react';
import {
  Trophy,
  Clock,
  CheckCircle2,
  X,
  BookmarkCheck,
} from 'lucide-react';
import { SheetViewType } from '../types';

export interface NewGameModalOptions {
  keepPlayers: boolean;
  keepSequence: boolean;
  keepBalances: boolean;
  endTurno?: boolean;
}

interface NewGameModalProps {
  isOpen: boolean;
  currentRound: number;
  winningBall?: number | null;
  durationFormatted?: string;
  currentDuration?: string;
  ballsDrawnCount?: number;
  totalCollected?: number;
  totalPrizesPaid?: number;
  netProfit?: number;
  financials?: {
    totalCollected: number;
    totalPrizesPaid: number;
    netProfit: number;
  };
  sheetType?: SheetViewType;
  currency?: string;
  operatorName?: string;
  onClose: () => void;
  onConfirmArchiveAndNewGame?: (options: NewGameModalOptions) => void;
  onConfirm?: (options: NewGameModalOptions) => void;
}

export const NewGameModal: React.FC<NewGameModalProps> = ({
  isOpen,
  currentRound,
  operatorName = 'Operadora',
  onClose,
  onConfirmArchiveAndNewGame,
  onConfirm,
}) => {
  const [keepPlayers, setKeepPlayers] = useState<boolean>(true);
  const [keepSequence, setKeepSequence] = useState<boolean>(true);
  const [keepBalances, setKeepBalances] = useState<boolean>(true);
  const [endTurno, setEndTurno] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleStart = () => {
    const opts: NewGameModalOptions = { keepPlayers, keepSequence, keepBalances, endTurno };
    if (onConfirmArchiveAndNewGame) {
      onConfirmArchiveAndNewGame(opts);
    } else if (onConfirm) {
      onConfirm(opts);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in text-[#431407]">
      <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden animate-scale-up">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-yellow-200 fill-yellow-200" />
            </div>
            <div>
              <h3 className="text-base font-black leading-none">
                Finalizar Partida #{currentRound}
              </h3>
              <p className="text-xs text-orange-100 font-medium mt-0.5">
                Archivar planilla y preparar la Partida #{currentRound + 1}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Action Choice for Next Sheet */}
          <div className="space-y-3">
            {/* Jugadores y Planilla */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-orange-950 uppercase tracking-wide block">
                1. Planilla y Jugadores:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKeepPlayers(true)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    keepPlayers
                      ? 'bg-orange-100/90 border-orange-500 ring-2 ring-orange-400 shadow-sm'
                      : 'bg-white border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      keepPlayers
                        ? 'border-orange-600 bg-orange-600 text-white'
                        : 'border-orange-300 bg-white'
                    }`}
                  >
                    {keepPlayers && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="font-black text-xs text-orange-950 block">
                      Mantener Jugadores
                    </span>
                    <p className="text-[10px] text-orange-900/70 mt-0.5 leading-tight">
                      Limpia marcas del bolillero y conserva los jugadores en las casillas.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setKeepPlayers(false)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    !keepPlayers
                      ? 'bg-orange-100/90 border-orange-500 ring-2 ring-orange-400 shadow-sm'
                      : 'bg-white border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      !keepPlayers
                        ? 'border-orange-600 bg-orange-600 text-white'
                        : 'border-orange-300 bg-white'
                    }`}
                  >
                    {!keepPlayers && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="font-black text-xs text-orange-950 block">
                      Planilla en Blanco
                    </span>
                    <p className="text-[10px] text-orange-900/70 mt-0.5 leading-tight">
                      Vacía todas las casillas para nuevas ventas desde cero.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Columna de Secuencia (Terna y Bingo) */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-orange-950 uppercase tracking-wide block">
                2. Columna de Secuencia (Terna y Bingo):
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKeepSequence(true)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    keepSequence
                      ? 'bg-amber-100/90 border-amber-500 ring-2 ring-amber-400 shadow-sm'
                      : 'bg-white border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      keepSequence
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-orange-300 bg-white'
                    }`}
                  >
                    {keepSequence && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="font-black text-xs text-amber-950 block">
                      Mantener Secuencia (Recomendado)
                    </span>
                    <p className="text-[10px] text-orange-900/70 mt-0.5 leading-tight">
                      Conserva los números de Terna y Bingo anteriores; la nueva partida se anotará en la siguiente fila.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setKeepSequence(false)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    !keepSequence
                      ? 'bg-rose-100/90 border-rose-500 ring-2 ring-rose-400 shadow-sm'
                      : 'bg-white border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      !keepSequence
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : 'border-orange-300 bg-white'
                    }`}
                  >
                    {!keepSequence && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="font-black text-xs text-rose-950 block">
                      Reiniciar Secuencia
                    </span>
                    <p className="text-[10px] text-orange-900/70 mt-0.5 leading-tight">
                      Borra la secuencia para comenzar a registrar Terna y Bingo desde la Fila #1.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Saldos Acumulados de Jugadores */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-orange-950 uppercase tracking-wide block">
                3. Saldos de Jugadores (Ganó, Debe y Total):
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKeepBalances(true)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    keepBalances
                      ? 'bg-emerald-100/90 border-emerald-500 ring-2 ring-emerald-400 shadow-sm'
                      : 'bg-white border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      keepBalances
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-orange-300 bg-white'
                    }`}
                  >
                    {keepBalances && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="font-black text-xs text-emerald-950 block">
                      Mantener Saldos Acumulados
                    </span>
                    <p className="text-[10px] text-orange-900/70 mt-0.5 leading-tight">
                      Suma lo ganado en la partida anterior al saldo para seguir jugando en las próximas partidas.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setKeepBalances(false)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    !keepBalances
                      ? 'bg-rose-100/90 border-rose-500 ring-2 ring-rose-400 shadow-sm'
                      : 'bg-white border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      !keepBalances
                        ? 'border-rose-600 bg-rose-600 text-white'
                        : 'border-orange-300 bg-white'
                    }`}
                  >
                    {!keepBalances && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="font-black text-xs text-rose-950 block">
                      Reiniciar Saldos
                    </span>
                    <p className="text-[10px] text-orange-900/70 mt-0.5 leading-tight">
                      Pone en 0.00 lo ganado y los saldos acumulados de los jugadores.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Control de Turno de la Operadora */}
            <div className="space-y-1.5 pt-1 border-t border-orange-200">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-orange-950 uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-purple-600" />
                  <span>4. Turno de Trabajo ({operatorName}):</span>
                </label>
                <span className="text-[10px] font-black text-purple-800 bg-purple-100 px-2 py-0.2 rounded-full border border-purple-200">
                  Carpetas por Turno
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEndTurno(false)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    !endTurno
                      ? 'bg-purple-100/90 border-purple-500 ring-2 ring-purple-400 shadow-sm'
                      : 'bg-white border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      !endTurno
                        ? 'border-purple-600 bg-purple-600 text-white'
                        : 'border-orange-300 bg-white'
                    }`}
                  >
                    {!endTurno && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="font-black text-xs text-purple-950 block">
                      Continuar Turno Actual
                    </span>
                    <p className="text-[10px] text-purple-900/70 mt-0.5 leading-tight">
                      Mantiene el turno abierto para seguir acumulando las líneas y partidas tiradas hoy.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setEndTurno(true)}
                  className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                    endTurno
                      ? 'bg-amber-100/90 border-amber-600 ring-2 ring-amber-500 shadow-sm'
                      : 'bg-white border-orange-200 hover:bg-orange-50'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      endTurno
                        ? 'border-amber-600 bg-amber-600 text-white'
                        : 'border-orange-300 bg-white'
                    }`}
                  >
                    {endTurno && <CheckCircle2 className="w-3 h-3" />}
                  </div>
                  <div>
                    <span className="font-black text-xs text-amber-950 block">
                      📁 Terminar Turno (Cerrar Turno)
                    </span>
                    <p className="text-[10px] text-amber-900/80 mt-0.5 leading-tight">
                      Cierra el turno actual creando una subcarpeta con fecha y hora exacta con solo las partidas de este turno.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* Sync with Gallery Notice */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-emerald-50 border border-emerald-200/90 text-emerald-950 shadow-xs">
            <BookmarkCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <p className="text-[11px] leading-snug font-medium text-emerald-900">
              Esta partida quedará archivada y sincronizada en la <strong>Galería de Partidas Guardadas</strong> con su planilla completa y números cantados.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-[#fff1e6] border-t border-orange-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-bold transition-all cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <BookmarkCheck className="w-3.5 h-3.5 fill-white text-emerald-600" />
            <span>Guardar en Galería y Comenzar Partida #{currentRound + 1}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
