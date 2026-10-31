import React, { useMemo } from 'react';
import { BingoSheetData } from '../types';
import { Trophy, Sparkles, DollarSign, X, CheckCircle2 } from 'lucide-react';

interface BingoWinningRowBannerProps {
  winningRowNumber: number | null;
  winningBall?: number | null;
  ternaRowNumber?: number | null;
  ternaBall?: number | null;
  amboRowNumber?: number | null;
  amboBall?: number | null;
  sheet: BingoSheetData;
  onClose: () => void;
  onMarkPlayerGanoPaid?: (playerId: string, playerName: string) => void;
  playerSummaryList?: Array<{
    id: string;
    name: string;
    totalGano: number;
    debe: number;
    total: number;
  }>;
}

interface HitDetail {
  colTitle: string;
  multiplier: number;
  prize: number;
  row: number;
}

interface PlayerWinningBreakdown {
  playerId: string;
  playerName: string;
  color: string;
  bingoHits: HitDetail[];
  ternaHits: HitDetail[];
  amboHits: HitDetail[];
  bingoTotal: number;
  ternaTotal: number;
  amboTotal: number;
  totalPrize: number;
  categoriesWon: ('AMBO' | 'TERNA' | 'BINGO')[];
}

export const BingoWinningRowBanner: React.FC<BingoWinningRowBannerProps> = ({
  winningRowNumber,
  winningBall,
  ternaRowNumber,
  ternaBall,
  amboRowNumber,
  amboBall,
  sheet,
  onClose,
  onMarkPlayerGanoPaid,
  playerSummaryList = [],
}) => {
  const hasAnyActiveRow =
    (winningRowNumber !== null && winningRowNumber !== undefined) ||
    (ternaRowNumber !== null && ternaRowNumber !== undefined) ||
    (amboRowNumber !== null && amboRowNumber !== undefined);

  // Calculate per-player winnings across Bingo, Terna, and Ambo (1 of 3, 2 of 3, or all 3 of 3)
  const winners = useMemo(() => {
    if (!hasAnyActiveRow) return [];

    const winnersMap = new Map<string, PlayerWinningBreakdown>();

    const ensureWinnerEntry = (key: string, playerId: string, playerName: string, color?: string) => {
      let existing = winnersMap.get(key);
      if (!existing) {
        existing = {
          playerId,
          playerName,
          color: color || '#f59e0b',
          bingoHits: [],
          ternaHits: [],
          amboHits: [],
          bingoTotal: 0,
          ternaTotal: 0,
          amboTotal: 0,
          totalPrize: 0,
          categoriesWon: [],
        };
        winnersMap.set(key, existing);
      }
      return existing;
    };

    const getCanonicalKey = (id?: string, name?: string) => {
      if (name && name.trim()) return name.trim().toLowerCase();
      if (id && id.trim()) return id.trim().toLowerCase();
      return 'anon';
    };

    sheet.columns.forEach((col) => {
      const mult = col.multiplier || 1;
      const colTitle = col.title || `X${mult}`;

      // 1. Ambo check
      if (amboRowNumber !== null && amboRowNumber !== undefined && amboRowNumber >= 1) {
        const cell = col.cells[amboRowNumber - 1];
        if (cell && (cell.playerId || cell.playerName)) {
          const prize =
            col.columnAmboPrize !== undefined
              ? col.columnAmboPrize
              : mult * (sheet.baseAmboPrize ?? 0.25);
          const key = getCanonicalKey(cell.playerId, cell.playerName);
          const entry = ensureWinnerEntry(
            key,
            cell.playerId || key,
            cell.playerName || 'Jugador',
            cell.color
          );
          entry.amboHits.push({ colTitle, multiplier: mult, prize, row: amboRowNumber });
          entry.amboTotal = Math.round((entry.amboTotal + prize) * 100) / 100;
          entry.totalPrize = Math.round((entry.totalPrize + prize) * 100) / 100;
          if (!entry.categoriesWon.includes('AMBO')) {
            entry.categoriesWon.push('AMBO');
          }
        }
      }

      // 2. Terna check
      if (ternaRowNumber !== null && ternaRowNumber !== undefined && ternaRowNumber >= 1) {
        const cell = col.cells[ternaRowNumber - 1];
        if (cell && (cell.playerId || cell.playerName)) {
          const prize =
            col.columnTernaPrize !== undefined
              ? col.columnTernaPrize
              : mult * (sheet.baseTernaPrize ?? 0.50);
          const key = getCanonicalKey(cell.playerId, cell.playerName);
          const entry = ensureWinnerEntry(
            key,
            cell.playerId || key,
            cell.playerName || 'Jugador',
            cell.color
          );
          entry.ternaHits.push({ colTitle, multiplier: mult, prize, row: ternaRowNumber });
          entry.ternaTotal = Math.round((entry.ternaTotal + prize) * 100) / 100;
          entry.totalPrize = Math.round((entry.totalPrize + prize) * 100) / 100;
          if (!entry.categoriesWon.includes('TERNA')) {
            entry.categoriesWon.push('TERNA');
          }
        }
      }

      // 3. Bingo check
      if (winningRowNumber !== null && winningRowNumber !== undefined && winningRowNumber >= 1) {
        const cell = col.cells[winningRowNumber - 1];
        if (cell && (cell.playerId || cell.playerName)) {
          const prize =
            col.columnPrize !== undefined
              ? col.columnPrize
              : mult * (sheet.basePrize ?? 1.35);
          const key = getCanonicalKey(cell.playerId, cell.playerName);
          const entry = ensureWinnerEntry(
            key,
            cell.playerId || key,
            cell.playerName || 'Jugador',
            cell.color
          );
          entry.bingoHits.push({ colTitle, multiplier: mult, prize, row: winningRowNumber });
          entry.bingoTotal = Math.round((entry.bingoTotal + prize) * 100) / 100;
          entry.totalPrize = Math.round((entry.totalPrize + prize) * 100) / 100;
          if (!entry.categoriesWon.includes('BINGO')) {
            entry.categoriesWon.push('BINGO');
          }
        }
      }
    });

    return Array.from(winnersMap.values()).sort((a, b) => b.totalPrize - a.totalPrize);
  }, [
    hasAnyActiveRow,
    winningRowNumber,
    ternaRowNumber,
    amboRowNumber,
    sheet.columns,
    sheet.basePrize,
    sheet.baseTernaPrize,
    sheet.baseAmboPrize,
  ]);

  if (!hasAnyActiveRow) return null;

  const grandTotalPrizes = winners.reduce((acc, w) => acc + w.totalPrize, 0);

  return (
    <div className="no-print mb-2 rounded-2xl bg-gradient-to-r from-red-700 via-rose-600 to-red-700 p-0.5 shadow-xl animate-fade-in">
      <div className="bg-red-950/90 backdrop-blur-md rounded-[14px] px-3 py-2.5 text-white flex flex-col gap-2">
        {/* Top Row: Winning Rows Title & Total Payout */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-400/25 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center font-black shadow-md flex-shrink-0">
              <Trophy className="w-4 h-4 fill-amber-900" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500/40 text-amber-200 border border-amber-300/30 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  Cálculo Automático de Premios
                </span>

                {amboRowNumber !== null && amboRowNumber !== undefined && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-sky-500/30 text-sky-200 border border-sky-300/40">
                    AMBO: Fila #{amboRowNumber}
                    {amboBall !== null && amboBall !== undefined ? ` (N° ${amboBall})` : ''}
                  </span>
                )}

                {ternaRowNumber !== null && ternaRowNumber !== undefined && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-300/40">
                    TERNA: Fila #{ternaRowNumber}
                    {ternaBall !== null && ternaBall !== undefined ? ` (N° ${ternaBall})` : ''}
                  </span>
                )}

                {winningRowNumber !== null && winningRowNumber !== undefined && (
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 border border-amber-200 shadow-2xs">
                    BINGO: Fila #{winningRowNumber}
                    {winningBall !== null && winningBall !== undefined ? ` (N° ${winningBall})` : ''}
                  </span>
                )}
              </div>
              <h3 className="text-xs sm:text-sm font-black tracking-tight text-white mt-0.5">
                Liquidación Automática por Jugador (Bingo, Terna y Ambo)
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="px-2.5 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-right">
              <span className="text-[9px] uppercase tracking-wider text-emerald-200 block font-bold">
                Total Premios Partida
              </span>
              <span className="text-xs sm:text-sm font-black text-emerald-300 flex items-center justify-end gap-0.5">
                <DollarSign className="w-3.5 h-3.5" />
                {sheet.currency}
                {grandTotalPrizes.toFixed(2)}
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              title="Ocultar aviso de premios"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bottom Row: Winners Breakdown Cards */}
        {winners.length === 0 ? (
          <div className="py-1.5 px-3 rounded-xl bg-white/5 border border-white/10 text-xs text-amber-200/90 flex items-center justify-between">
            <span>Ningún jugador tiene casillas asignadas en las filas ganadoras indicadas.</span>
            <span className="font-bold text-white/60">Premios: {sheet.currency}0.00</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {winners.map((w) => {
              const summary = playerSummaryList.find(
                (p) =>
                  p.id === w.playerId ||
                  p.name.toLowerCase().trim() === w.playerName.toLowerCase().trim()
              );
              const isAlreadyPaidOut = summary ? summary.totalGano <= 0 : false;
              const countWon = w.categoriesWon.length;

              return (
                <div
                  key={w.playerId}
                  className="p-2.5 rounded-xl bg-white/10 border border-white/20 flex flex-col justify-between gap-2 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-white shadow-xs"
                        style={{ backgroundColor: w.color }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-xs sm:text-sm text-white truncate block">
                            {w.playerName.toUpperCase()}
                          </span>
                          <span
                            className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase tracking-tight ${
                              countWon === 3
                                ? 'bg-amber-400 text-amber-950 border border-white'
                                : countWon === 2
                                ? 'bg-purple-400 text-purple-950 border border-purple-200'
                                : 'bg-white/20 text-amber-200 border border-white/20'
                            }`}
                          >
                            {countWon === 3
                              ? '¡Ganó las 3! (3/3)'
                              : countWon === 2
                              ? `Ganó 2 de 3 (${w.categoriesWon.join('+')})`
                              : `Ganó 1 de 3 (${w.categoriesWon[0]})`}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 pl-1">
                      <span className="text-[9px] uppercase text-amber-200/80 font-bold block leading-none">
                        Ganó en Partida
                      </span>
                      <span className="text-sm sm:text-base font-black text-amber-300 font-mono">
                        +{sheet.currency}
                        {w.totalPrize.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Itemized breakdown per prize won (Ambo / Terna / Bingo) */}
                  <div className="flex flex-wrap gap-1">
                    {w.amboHits.length > 0 && (
                      <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-100 border border-sky-300/40">
                        Ambo (F#{amboRowNumber} • {w.amboHits.map((h) => h.colTitle).join('+')}): +$
                        {w.amboTotal.toFixed(2)}
                      </span>
                    )}
                    {w.ternaHits.length > 0 && (
                      <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded bg-emerald-500/30 text-emerald-100 border border-emerald-300/40">
                        Terna (F#{ternaRowNumber} • {w.ternaHits.map((h) => h.colTitle).join('+')}): +$
                        {w.ternaTotal.toFixed(2)}
                      </span>
                    )}
                    {w.bingoHits.length > 0 && (
                      <span className="text-[9.5px] font-black px-1.5 py-0.5 rounded bg-amber-400/30 text-amber-100 border border-amber-300/40">
                        Bingo (F#{winningRowNumber} • {w.bingoHits.map((h) => h.colTitle).join('+')}): +$
                        {w.bingoTotal.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Player Ledger Summary & Mark GANO as Paid Action */}
                  {summary && (
                    <div className="pt-1.5 border-t border-white/15 flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-2 flex-wrap font-bold">
                        <span className="text-emerald-200">
                          GANÓ: <strong className="text-white">${summary.totalGano.toFixed(2)}</strong>
                        </span>
                        <span className="text-rose-200">
                          DEBE: <strong className="text-white">${summary.debe.toFixed(2)}</strong>
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded font-black ${
                            summary.total > 0
                              ? 'bg-emerald-500/30 text-emerald-200'
                              : summary.total < 0
                              ? 'bg-rose-500/40 text-rose-100'
                              : 'bg-white/15 text-white'
                          }`}
                        >
                          TOTAL:{' '}
                          {summary.total > 0
                            ? `+$${summary.total.toFixed(2)}`
                            : summary.total < 0
                            ? `-$${Math.abs(summary.total).toFixed(2)}`
                            : '$0.00'}
                        </span>
                      </div>

                      {onMarkPlayerGanoPaid && (
                        isAlreadyPaidOut ? (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/30 border border-emerald-300/40 text-emerald-100 font-black text-[9.5px] flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Pagado ($0)</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onMarkPlayerGanoPaid(w.playerId, w.playerName)}
                            className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-emerald-950 font-black text-[9.5px] shadow-xs transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap"
                            title={`Marcar premio de ${w.playerName.toUpperCase()} como enviado/pagado (deja GANO en $0.00)`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Marcar Pagado</span>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
