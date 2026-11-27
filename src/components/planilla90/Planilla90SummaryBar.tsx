/**
 * Barra de ganadores de la Planilla 90: NOMBRE / GANO / DEBE / TOTAL por jugador.
 * En la planilla en vivo, tocar un jugador muestra sus acciones rápidas.
 */
import React from 'react';
import type { PlayerSummarySnapshotItem } from '../../types';

interface Planilla90SummaryBarProps {
  summaries: (PlayerSummarySnapshotItem & { isBingoWinner?: boolean; isAmboWinner?: boolean; isPfWinner?: boolean })[];
  onPlayerClick?: (playerId: string) => void;
  selectedPlayerId?: string | null;
  compact?: boolean;
}

function fmt(v: number): string {
  return `$${(Number(v) || 0).toFixed(2)}`;
}

export const Planilla90SummaryBar: React.FC<Planilla90SummaryBarProps> = ({
  summaries,
  onPlayerClick,
  selectedPlayerId,
  compact = false,
}) => {
  const labelCls = 'flex items-center px-2 font-black text-white bg-black border-b border-slate-600 last:border-b-0';
  const fontSize = compact ? 12 : 'clamp(12px, 1.9vh, 22px)';

  return (
    <div className="w-full border-[3px] border-t-0 border-black bg-white flex flex-shrink-0 overflow-hidden" style={{ fontSize }}>
      <div className="grid grid-rows-4 flex-shrink-0 border-r-[3px] border-black" style={{ width: '6.2em' }}>
        <span className={labelCls}>NOMBRE</span>
        <span className={labelCls}>GANO</span>
        <span className={labelCls}>DEBE</span>
        <span className={labelCls}>TOTAL</span>
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
              const cell = 'flex items-center justify-center px-1.5 font-black tabular-nums border-b border-slate-300 last:border-b-0 whitespace-nowrap';
              const body = (
                <>
                  <span
                    className={`${cell} uppercase`}
                    style={{ backgroundColor: p.color || '#e2e8f0', color: p.textColor || '#000' }}
                  >
                    {winner ? '★ ' : ''}
                    {p.name}
                  </span>
                  <span className={`${cell} text-emerald-700`}>{fmt(p.totalGano)}</span>
                  <span className={`${cell} text-red-600`}>{fmt(p.debe)}</span>
                  <span className={`${cell} ${p.total < 0 ? 'text-red-700' : 'text-black'}`}>{fmt(p.total)}</span>
                </>
              );
              const cls = `grid grid-rows-4 flex-1 min-w-[5.2em] border-r-2 last:border-r-0 border-black ${
                selectedPlayerId === p.id ? 'ring-4 ring-inset ring-blue-500' : ''
              } ${winner ? 'bg-amber-50' : ''}`;
              return onPlayerClick ? (
                <button key={p.id} type="button" onClick={() => onPlayerClick(p.id)} className={`${cls} cursor-pointer hover:bg-slate-50`} title="Acciones del jugador">
                  {body}
                </button>
              ) : (
                <div key={p.id} className={cls}>
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
