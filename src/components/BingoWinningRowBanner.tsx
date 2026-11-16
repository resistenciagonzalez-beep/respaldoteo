import React, { useMemo } from 'react';
import { BingoSheetData } from '../types';
import { Trophy, X } from 'lucide-react';

interface BingoWinningRowBannerProps {
  winningRowNumber: number | null;
  winningBall?: number | null;
  ternaRowNumber?: number | null;
  ternaBall?: number | null;
  amboRowNumber?: number | null;
  amboBall?: number | null;
  sheet: BingoSheetData;
  onClose: () => void;
  large?: boolean; // planilla expandida: se muestra más grande
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
  large = false,
}) => {
  const hasAnyActiveRow =
    (winningRowNumber !== null && winningRowNumber !== undefined) ||
    (ternaRowNumber !== null && ternaRowNumber !== undefined) ||
    (amboRowNumber !== null && amboRowNumber !== undefined);

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
    <div
      className={
        'no-print mb-1 rounded-xl bg-red-900/95 border border-red-400/40 text-white shadow-sm flex flex-wrap items-center justify-between ' +
        (large ? 'px-4 py-2 gap-3 text-[17px]' : 'px-3 py-1.5 gap-2 text-[13px]')
      }
    >
      {/* Left: Compact Winning Row Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="inline-flex items-center gap-1 font-black text-amber-300 uppercase tracking-tight">
          <Trophy className="w-[1.2em] h-[1.2em] text-amber-300" />
          <span>Filas:</span>
        </span>

        {amboRowNumber !== null && amboRowNumber !== undefined && (
          <span className="text-[0.9em] font-black uppercase px-1.5 py-0.2 rounded bg-sky-500/30 text-sky-100 border border-sky-300/40">
            Ambo #{amboRowNumber}
            {amboBall !== null && amboBall !== undefined ? ` (${amboBall})` : ''}
          </span>
        )}

        {ternaRowNumber !== null && ternaRowNumber !== undefined && (
          <span className="text-[0.9em] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-100 border border-emerald-300/40">
            Terna #{ternaRowNumber}
            {ternaBall !== null && ternaBall !== undefined ? ` (${ternaBall})` : ''}
          </span>
        )}

        {winningRowNumber !== null && winningRowNumber !== undefined && (
          <span className="text-[0.9em] font-black uppercase px-1.5 py-0.2 rounded bg-amber-400 text-amber-950 border border-amber-200">
            Bingo #{winningRowNumber}
            {winningBall !== null && winningBall !== undefined ? ` (${winningBall})` : ''}
          </span>
        )}
      </div>

      {/* Center: Compact Inline Winners Pills */}
      <div className="flex items-center gap-1 flex-wrap flex-1 justify-center min-w-0">
        {winners.length === 0 ? (
          <span className="text-[0.9em] text-amber-200/80 italic">Sin ganadores en fila</span>
        ) : (
          winners.map((w) => (
            <span
              key={w.playerId}
              className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-white/10 border border-white/20 text-[0.9em] font-black whitespace-nowrap"
              title={`${w.playerName.toUpperCase()} (${w.categoriesWon.join('+')}): +${sheet.currency}${w.totalPrize.toFixed(2)}`}
            >
              <span
                className="w-[0.7em] h-[0.7em] rounded-full border border-white/70 flex-shrink-0"
                style={{ backgroundColor: w.color }}
              />
              <span className="text-white truncate max-w-[11em]">{w.playerName.toUpperCase()}</span>
              <span className="text-amber-300 font-mono">+{sheet.currency}{w.totalPrize.toFixed(2)}</span>
            </span>
          ))
        )}
      </div>

      {/* Right: Total & Close Button */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto">
        <span className="px-1.5 py-0.2 rounded bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 font-black text-[0.9em] font-mono whitespace-nowrap">
          Total: {sheet.currency}{grandTotalPrizes.toFixed(2)}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded bg-white/10 hover:bg-white/25 text-white/80 hover:text-white transition-colors cursor-pointer"
          title="Ocultar barra de premios"
        >
          <X className="w-[1.2em] h-[1.2em]" />
        </button>
      </div>
    </div>
  );
};

