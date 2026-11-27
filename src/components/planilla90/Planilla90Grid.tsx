/**
 * Cuadrícula de la Planilla 90 nueva: SECUENCIA (P.F | A | B) + JUEGO (r, r+30, r+60)
 * + columnas por multiplicador (SOLO, DOBLE, TRIPLE, CUARTA, QUINTA).
 *
 * Se usa en dos lugares:
 *  - En la planilla en vivo (con clics y casillas para escribir).
 *  - En la galería / panel admin, solo para ver una partida guardada.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import type { BingoSheetData, CustomSequenceEntry } from '../../types';
import {
  PLANILLA90_ROWS,
  getMultiplierLabel,
  getRowNumbers,
  type Planilla90WinningRows,
} from '../../utils/planilla90Rules';

export type Planilla90SeqField = 'pf' | 'ambo' | 'bingo';

interface Planilla90GridProps {
  sheet: BingoSheetData;
  drawnNumbers: Set<number>;
  winningRows: Planilla90WinningRows;
  /** true: las filas se estiran para llenar todo el alto disponible (planilla en vivo). */
  fill?: boolean;
  activeSeqSlot?: number;
  onCellClick?: (columnIndex: number, rowIndex: number) => void;
  onHeaderClick?: (columnIndex: number) => void;
  onSeqChange?: (slot: number, field: Planilla90SeqField, value: string) => void;
}

const SEQ_FIELDS: { field: Planilla90SeqField; label: string; enabledKey: 'pfEnabled' | 'amboEnabled' | 'bingoEnabled' }[] = [
  { field: 'pf', label: 'P.F', enabledKey: 'pfEnabled' },
  { field: 'ambo', label: 'A', enabledKey: 'amboEnabled' },
  { field: 'bingo', label: 'B', enabledKey: 'bingoEnabled' },
];

function fmtMoney(v: number | undefined): string {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export const Planilla90Grid: React.FC<Planilla90GridProps> = ({
  sheet,
  drawnNumbers,
  winningRows,
  fill = false,
  activeSeqSlot,
  onCellClick,
  onHeaderClick,
  onSeqChange,
}) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [rowPx, setRowPx] = useState<number>(fill ? 24 : 22);

  // Mide el alto real de cada fila para que números y nombres usen el tamaño más grande posible
  useLayoutEffect(() => {
    if (!fill) return;
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setRowPx(Math.max(12, el.clientHeight / PLANILLA90_ROWS));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);

  // Letra grande: casi todo el alto de la fila (máx. 46 px)
  const fontPx = Math.round(Math.min(46, Math.max(11, rowPx * 0.9)));
  const activeSeq = SEQ_FIELDS.filter((f) => (f.enabledKey === 'bingoEnabled' ? sheet.bingoEnabled !== false : Boolean(sheet[f.enabledKey])));
  const seqWidth = `${Math.max(1, activeSeq.length) * 3}em`;
  const gridCols = `${seqWidth} 7.8em repeat(${sheet.columns.length}, minmax(0, 1fr))`;
  const entries = sheet.customSeqEntries || {};
  const prizeOf = (field: Planilla90SeqField) =>
    field === 'pf' ? sheet.basePfPrize : field === 'ambo' ? sheet.baseAmboPrize : sheet.basePrize;

  return (
    <div
      className={`w-full border-[3px] border-black bg-white flex flex-col select-none ${fill ? 'h-full min-h-0' : ''}`}
      style={{ fontSize: `${fontPx}px` }}
    >
      {/* Encabezados */}
      <div
        className="grid border-b-[3px] border-black bg-slate-100 text-center flex-shrink-0"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="flex flex-col border-r-[3px] border-black bg-[#facc15]">
          <div className="font-black text-black leading-none py-[0.15em]" style={{ fontSize: '0.62em' }}>
            SECUENCIA
          </div>
          <div className="grid border-t-2 border-black bg-[#581c87] text-white" style={{ gridTemplateColumns: `repeat(${Math.max(1, activeSeq.length)}, 1fr)` }}>
            {activeSeq.length === 0 && <span className="font-black" style={{ fontSize: '0.6em' }}>-</span>}
            {activeSeq.map((f) => (
              <span key={f.field} className="font-black leading-tight border-r last:border-r-0 border-purple-300" style={{ fontSize: '0.62em' }}>
                {f.label}
                <span className="block text-yellow-300" style={{ fontSize: '0.85em' }}>({fmtMoney(prizeOf(f.field))})</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center border-r-[3px] border-black bg-black text-white font-black tracking-wider" style={{ fontSize: '0.9em' }}>
          JUEGO
        </div>
        {sheet.columns.map((col, cIdx) => {
          const mult = Number(col.multiplier) || 1;
          const content = (
            <span className="font-black text-black leading-none whitespace-nowrap" style={{ fontSize: `min(1.2em, ${mult >= 4 ? 17 : 20}cqw)` }}>
              {getMultiplierLabel(mult)}
            </span>
          );
          const cls = `flex items-center justify-center py-[0.3em] border-r-2 last:border-r-0 border-black ${
            mult >= 2 ? 'bg-[#facc15]' : 'bg-white'
          } ${col.hasRedDividerRight ? '!border-r-[4px] !border-r-red-600' : ''}`;
          return onHeaderClick ? (
            <button
              key={col.id}
              type="button"
              onClick={() => onHeaderClick(cIdx)}
              className={`${cls} cursor-pointer hover:brightness-95 active:scale-[0.97]`}
              style={{ containerType: 'inline-size' }}
              title="Tocar para cambiar: SOLO, DOBLE, TRIPLE, CUARTA, QUINTA"
            >
              {content}
            </button>
          ) : (
            <div key={col.id} className={cls} style={{ containerType: 'inline-size' }}>
              {content}
            </div>
          );
        })}
      </div>

      {/* Filas 1 a 30 */}
      <div ref={bodyRef} className={`flex flex-col ${fill ? 'flex-1 min-h-0' : ''}`}>
        {Array.from({ length: PLANILLA90_ROWS }, (_, rIdx) => {
          const row = rIdx + 1;
          const slot = row;
          const entry: CustomSequenceEntry = entries[slot] || {};
          const isBingo = winningRows.bingoRow === row;
          const isAmbo = winningRows.amboRow === row;
          const isPf = winningRows.pfRow === row;
          const rowBg = isBingo ? 'bg-amber-300/60' : isAmbo ? 'bg-sky-200/70' : isPf ? 'bg-emerald-200/70' : '';
          const isActiveSlot = activeSeqSlot === slot;

          return (
            <div
              key={row}
              className={`grid border-b last:border-b-0 border-black ${fill ? 'flex-1 min-h-0' : ''}`}
              style={{ gridTemplateColumns: gridCols, height: fill ? undefined : '22px' }}
            >
              {/* SECUENCIA: una casilla por partida */}
              <div
                className={`grid border-r-[3px] border-black ${isActiveSlot ? 'bg-amber-100 ring-2 ring-inset ring-amber-500' : 'bg-slate-50'}`}
                style={{ gridTemplateColumns: `repeat(${Math.max(1, activeSeq.length)}, 1fr)` }}
                title={`Secuencia de la partida #${slot}`}
              >
                {activeSeq.length === 0 && <span />}
                {activeSeq.map((f) => {
                  const raw = entry[f.field];
                  const value = raw !== undefined && raw !== null && Number(raw) > 0 ? String(raw) : '';
                  return onSeqChange ? (
                    <input
                      key={f.field}
                      type="text"
                      inputMode="numeric"
                      value={value}
                      onChange={(e) => onSeqChange(slot, f.field, e.target.value)}
                      placeholder="-"
                      className="w-full h-full min-w-0 bg-transparent text-center font-black text-black leading-none border-r last:border-r-0 border-slate-400 focus:outline-none focus:bg-yellow-100 placeholder:text-slate-300"
                      style={{ fontSize: '1em', fontWeight: 900 }}
                      title={`Anotar bola de ${f.label} de la partida #${slot}`}
                    />
                  ) : (
                    <span
                      key={f.field}
                      className="flex items-center justify-center font-black text-black border-r last:border-r-0 border-slate-400"
                      style={{ fontSize: '1em' }}
                    >
                      {value || ''}
                    </span>
                  );
                })}
              </div>

              {/* JUEGO: los tres números de la fila (los ya cantados en rojo) */}
              <div className={`flex items-center justify-around border-r-[3px] border-black font-black tabular-nums ${rowBg || 'bg-white'}`}>
                {getRowNumbers(row).map((n) => {
                  const drawn = drawnNumbers.has(n);
                  return (
                    <span
                      key={n}
                      className={`leading-none ${drawn ? 'text-white bg-red-600 rounded px-[0.1em]' : 'text-black'}`}
                      style={{ fontSize: '1.05em', fontWeight: 900 }}
                    >
                      {n}
                    </span>
                  );
                })}
              </div>

              {/* Casillas de jugadores */}
              {sheet.columns.map((col, cIdx) => {
                const cell = col.cells[rIdx];
                const name = cell?.playerName || '';
                const hasPlayer = Boolean(cell?.playerId || cell?.playerName);
                const len = Math.max(3, name.length);
                const winRing = isBingo
                  ? 'inset 0 0 0 3px rgba(220,38,38,0.9)'
                  : isAmbo
                  ? 'inset 0 0 0 3px rgba(2,132,199,0.85)'
                  : isPf
                  ? 'inset 0 0 0 3px rgba(5,150,105,0.85)'
                  : undefined;
                const cls = `relative flex items-center justify-center overflow-hidden border-r last:border-r-0 border-black ${
                  col.hasRedDividerRight ? '!border-r-[4px] !border-r-red-600' : ''
                } ${!hasPlayer ? rowBg : ''}`;
                const style: React.CSSProperties = {
                  backgroundColor: hasPlayer ? cell?.color : undefined,
                  boxShadow: winRing || (hasPlayer && cell?.isPaid ? 'inset 0 0 0 2px #16a34a' : undefined),
                  containerType: 'inline-size',
                };
                const label = hasPlayer ? (
                  <span
                    className="font-black uppercase leading-none whitespace-nowrap px-[0.1em]"
                    style={{ color: cell?.textColor || '#000', fontSize: `min(1.15em, ${Math.floor(200 / len)}cqw)`, fontWeight: 900 }}
                  >
                    {name}
                  </span>
                ) : null;
                return onCellClick ? (
                  <button
                    key={`${col.id}_${row}`}
                    type="button"
                    onClick={() => onCellClick(cIdx, rIdx)}
                    className={`${cls} cursor-pointer ${hasPlayer ? '' : 'hover:bg-slate-100'}`}
                    style={style}
                    title={hasPlayer ? `${name}${cell?.isPaid ? ' (pagado)' : ' (pendiente de pago)'}` : 'Vacía: toca para asignar'}
                  >
                    {label}
                  </button>
                ) : (
                  <div key={`${col.id}_${row}`} className={cls} style={style}>
                    {label}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
