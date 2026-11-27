/**
 * Barra de ganadores de la Planilla 90: NOMBRE / GANO / DEBE / TOTAL por jugador.
 * En la planilla en vivo tiene los mismos botoncitos que la Planilla 75:
 *  - NOMBRE: marcas P.F / A / B del ganador; tocar el nombre lo selecciona.
 *  - GANO: ✓ marca el premio como entregado (GANO queda en $0).
 *  - DEBE: ✓ marca como pagado lo que debe. Si luego juega más casillas, solo
 *    eso nuevo vuelve a sumarse en DEBE y se puede marcar pagado otra vez.
 *  - TOTAL: "$0" deja el saldo del jugador en cero (pagó y se le entregó todo).
 */
import React from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type { PlayerSummarySnapshotItem } from '../../types';

type SummaryItem = PlayerSummarySnapshotItem & {
  isBingoWinner?: boolean;
  isAmboWinner?: boolean;
  isPfWinner?: boolean;
  cellsCount?: number;
};

interface Planilla90SummaryBarProps {
  summaries: SummaryItem[];
  onPlayerClick?: (playerId: string) => void;
  selectedPlayerId?: string | null;
  compact?: boolean;
  /** Botón ✓ en GANO: premio entregado */
  onClearWon?: (playerId: string) => void;
  /** Botón ✓ en DEBE: pagó lo que debía */
  onMarkPaid?: (playerId: string) => void;
  /** Botón $0 en TOTAL: saldo en cero */
  onResetTotal?: (playerId: string) => void;
  /** Botón para ocultar la barra */
  onHide?: () => void;
}

function fmt(v: number): string {
  return `$${(Number(v) || 0).toFixed(2)}`;
}

const miniBtn =
  'no-print flex-shrink-0 inline-flex items-center justify-center rounded leading-none font-black cursor-pointer active:scale-95 transition-all shadow-sm';

export const Planilla90SummaryBar: React.FC<Planilla90SummaryBarProps> = ({
  summaries,
  onPlayerClick,
  selectedPlayerId,
  compact = false,
  onClearWon,
  onMarkPaid,
  onResetTotal,
  onHide,
}) => {
  const labelCls = 'flex items-center px-2 font-black text-white bg-black border-b border-slate-600 last:border-b-0';
  const fontSize = compact ? 12 : 'clamp(14px, 2.7vh, 32px)';
  // Botoncitos proporcionales a la letra de la barra
  const iconStyle: React.CSSProperties = { width: '0.75em', height: '0.75em' };

  return (
    <div className="w-full border-[3px] border-t-0 border-black bg-white flex flex-shrink-0 overflow-hidden" style={{ fontSize }}>
      <div className="relative grid grid-rows-4 flex-shrink-0 border-r-[3px] border-black" style={{ width: '6.2em' }}>
        <span className={labelCls}>NOMBRE</span>
        <span className={labelCls}>GANO</span>
        <span className={labelCls}>DEBE</span>
        <span className={labelCls}>TOTAL</span>
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            className="no-print absolute top-0.5 right-0.5 px-1 rounded bg-yellow-300 text-black font-black leading-none cursor-pointer hover:bg-yellow-200"
            style={{ fontSize: '0.5em', paddingTop: '0.25em', paddingBottom: '0.25em' }}
            title="Ocultar la barra de ganadores"
          >
            ▼
          </button>
        )}
      </div>
      <div className="flex-1 min-w-0 overflow-x-auto">
        {summaries.length === 0 ? (
          <div className="h-full flex items-center px-3 font-bold text-slate-500" style={{ fontSize: '0.8em' }}>
            Aún no hay jugadores en la planilla.
          </div>
        ) : (
          <div className="flex h-full min-w-full">
            {summaries.map((p) => {
              const winner = p.isBingoWinner || p.isAmboWinner || p.isPfWinner;
              const cell =
                'relative flex items-center justify-center gap-[0.2em] px-1 font-black tabular-nums border-b border-slate-300 last:border-b-0 whitespace-nowrap';
              const debePaid = p.debe <= 0 && (p.cellsCount ?? 0) > 0;
              return (
                <div
                  key={p.id}
                  className={`grid grid-rows-4 flex-1 min-w-[5.6em] border-r-2 last:border-r-0 border-black ${
                    selectedPlayerId === p.id ? 'ring-4 ring-inset ring-blue-500' : ''
                  } ${winner ? 'bg-amber-50' : ''}`}
                >
                  {/* NOMBRE + marcas de ganador */}
                  <div
                    className={`${cell} uppercase ${onPlayerClick ? 'cursor-pointer hover:brightness-95' : ''}`}
                    style={{ backgroundColor: p.color || '#e2e8f0', color: p.textColor || '#000' }}
                    onClick={onPlayerClick ? () => onPlayerClick(p.id) : undefined}
                    title={onPlayerClick ? `${p.name}: tocar para seleccionarlo y pintar casillas` : p.name}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.isPfWinner && (
                      <span className="rounded border border-black bg-emerald-500 text-white px-[0.15em] leading-none" style={{ fontSize: '0.55em' }} title="Ganó P.F">
                        P.F
                      </span>
                    )}
                    {p.isAmboWinner && (
                      <span className="rounded border border-black bg-sky-500 text-white px-[0.15em] leading-none" style={{ fontSize: '0.55em' }} title="Ganó AMBO">
                        A
                      </span>
                    )}
                    {p.isBingoWinner && (
                      <span className="rounded border border-black bg-amber-400 text-amber-950 px-[0.15em] leading-none" style={{ fontSize: '0.55em' }} title="Ganó BINGO">
                        B
                      </span>
                    )}
                  </div>

                  {/* GANO */}
                  <div className={`${cell} ${p.totalGano > 0 ? 'text-emerald-800 bg-emerald-50' : 'text-black'}`}>
                    <span>{fmt(p.totalGano)}</span>
                    {onClearWon && p.totalGano > 0 && (
                      <button
                        type="button"
                        onClick={() => onClearWon(p.id)}
                        className={`${miniBtn} bg-emerald-600 text-white hover:bg-emerald-700 p-[0.1em]`}
                        title={`Marcar premio de ${p.name} como entregado (GANO queda en $0)`}
                      >
                        <Check style={iconStyle} strokeWidth={4} />
                      </button>
                    )}
                  </div>

                  {/* DEBE */}
                  <div className={`${cell} ${p.debe > 0 ? 'text-red-700 bg-rose-50' : 'text-black'}`}>
                    {debePaid && onMarkPaid ? (
                      <span className="text-emerald-700" style={{ fontSize: '0.8em' }}>
                        PAGADO
                      </span>
                    ) : (
                      <span>{fmt(p.debe)}</span>
                    )}
                    {onMarkPaid && p.debe > 0 && (
                      <button
                        type="button"
                        onClick={() => onMarkPaid(p.id)}
                        className={`${miniBtn} bg-red-600 text-white hover:bg-red-700 p-[0.1em]`}
                        title={`Marcar como pagado lo que debe ${p.name}`}
                      >
                        <Check style={iconStyle} strokeWidth={4} />
                      </button>
                    )}
                  </div>

                  {/* TOTAL */}
                  <div
                    className={`${cell} group/tot ${
                      p.total < 0 ? 'text-red-800 bg-red-100' : p.total > 0 ? 'text-emerald-900 bg-emerald-100' : 'text-black bg-amber-50'
                    }`}
                  >
                    <span>{p.total < 0 ? `-${fmt(Math.abs(p.total))}` : p.total > 0 ? `+${fmt(p.total)}` : fmt(0)}</span>
                    {onResetTotal && p.total !== 0 && (
                      <button
                        type="button"
                        onClick={() => onResetTotal(p.id)}
                        className={`${miniBtn} bg-black text-yellow-300 hover:bg-zinc-800 px-[0.2em] py-[0.1em] gap-[0.1em]`}
                        style={{ fontSize: '0.5em' }}
                        title={`Dejar el saldo de ${p.name} en $0 (pagó y se le entregó todo)`}
                      >
                        <RotateCcw style={{ width: '1em', height: '1em' }} />
                        $0
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
