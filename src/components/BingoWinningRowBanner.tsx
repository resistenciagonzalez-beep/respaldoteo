import React from 'react';
import { BingoSheetData } from '../types';
import { Trophy, X, Users, ChevronDown, ChevronUp } from 'lucide-react';

interface BingoWinningRowBannerProps {
  winningRowNumber: number;
  sheet: BingoSheetData;
  onClose?: () => void;
  winningBall?: number | null;
}

export interface PlayerRowWinning {
  playerId?: string;
  playerName: string;
  color: string;
  totalPrize: number;
  columnsWon: {
    colNumber: number;
    title: string;
    multiplier: number;
    prize: number;
  }[];
}

export const BingoWinningRowBanner: React.FC<BingoWinningRowBannerProps> = ({
  winningRowNumber,
  sheet,
  onClose,
  winningBall,
}) => {
  const [isExpanded, setIsExpanded] = React.useState<boolean>(true);

  // Calculate earnings for each player in this specific row
  const rowAnalysis = React.useMemo(() => {
    let totalRowPrize = 0;
    let totalAssignedPrize = 0;
    const playerMap: Record<string, PlayerRowWinning> = {};

    sheet.columns.forEach((col) => {
      const mult = col.multiplier || 1;
      const colPrize = col.columnPrize !== undefined ? col.columnPrize : mult * (sheet.basePrize ?? 1.35);
      totalRowPrize += colPrize;

      const cell = col.cells[winningRowNumber - 1];
      if (cell && (cell.playerId || cell.playerName)) {
        const pKey = cell.playerId || cell.playerName || 'anon';
        const pName = cell.playerName || 'Jugador';
        const pColor = cell.color || '#fed7aa';

        if (!playerMap[pKey]) {
          playerMap[pKey] = {
            playerId: cell.playerId,
            playerName: pName,
            color: pColor,
            totalPrize: 0,
            columnsWon: [],
          };
        }

        playerMap[pKey].totalPrize += colPrize;
        playerMap[pKey].columnsWon.push({
          colNumber: col.colNumber,
          title: col.title,
          multiplier: mult,
          prize: colPrize,
        });

        totalAssignedPrize += colPrize;
      }
    });

    const winnersList = Object.values(playerMap).sort((a, b) => b.totalPrize - a.totalPrize);
    const unassignedPrize = Math.max(0, totalRowPrize - totalAssignedPrize);

    return {
      totalRowPrize,
      totalAssignedPrize,
      unassignedPrize,
      winnersList,
    };
  }, [winningRowNumber, sheet]);

  return (
    <div className="w-full rounded-2xl border-2 border-red-500 bg-gradient-to-r from-red-500/10 via-rose-500/15 to-red-500/10 shadow-lg p-3 sm:p-4 text-[#431407] animate-fade-in mb-3">
      <div className="flex items-center justify-between gap-2 border-b border-red-300/80 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-md animate-bounce">
            <Trophy className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded-md shadow-xs">
                ¡¡ BINGO EN FILA #{winningRowNumber} !!
              </span>
              {winningBall && (
                <span className="text-[11px] font-bold text-red-900 bg-red-100 px-2 py-0.5 rounded border border-red-300">
                  Bola Cantada: <strong>#{winningBall}</strong>
                </span>
              )}
            </div>
            <span className="text-[11px] font-bold text-red-900/80">
              La fila #{winningRowNumber} está marcada en rojo. Total repartido:{' '}
              <strong className="text-red-700 text-sm font-black">
                {rowAnalysis.totalAssignedPrize.toFixed(2)} pts
              </strong>{' '}
              de {rowAnalysis.totalRowPrize.toFixed(2)} pts posibles.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-900 transition-all cursor-pointer"
            title={isExpanded ? 'Contraer resumen' : 'Expandir resumen'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-red-100 hover:bg-rose-200 text-red-900 transition-all cursor-pointer"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded Breakdown of Players that won in this row */}
      {isExpanded && (
        <div className="pt-2.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-red-950">
            <span className="flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-red-600" />
              Jugadores ganadores en la Fila #{winningRowNumber}:
            </span>
            <span className="text-[11px] font-bold text-red-800">
              {rowAnalysis.winnersList.length} {rowAnalysis.winnersList.length === 1 ? 'jugador premiado' : 'jugadores premiados'}
            </span>
          </div>

          {rowAnalysis.winnersList.length === 0 ? (
            <div className="p-2.5 rounded-xl bg-white/80 border border-red-200 text-center text-xs text-red-900 font-semibold">
              Ningún jugador tenía casillas asignadas en esta fila. Premio acumulado de la fila:{' '}
              <strong className="text-red-700">{rowAnalysis.totalRowPrize.toFixed(2)} pts</strong>.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {rowAnalysis.winnersList.map((winner) => (
                <div
                  key={winner.playerId || winner.playerName}
                  className="p-2.5 rounded-xl bg-white border-2 border-red-400 shadow-sm flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-black/30 flex-shrink-0"
                        style={{ backgroundColor: winner.color }}
                      />
                      <span className="text-sm font-black text-red-950 truncate max-w-[130px]">
                        {winner.playerName}
                      </span>
                    </div>
                    <span className="text-base font-black text-emerald-700 font-mono">
                      +{winner.totalPrize.toFixed(2)} pts
                    </span>
                  </div>

                  {/* Columns list won */}
                  <div className="mt-1.5 pt-1 border-t border-red-100 flex flex-wrap gap-1 text-[10px] text-red-900">
                    {winner.columnsWon.map((col, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 rounded bg-red-50 border border-red-200 font-bold"
                      >
                        Col {col.title} ({col.prize.toFixed(2)})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {rowAnalysis.unassignedPrize > 0 && rowAnalysis.winnersList.length > 0 && (
            <div className="text-[11px] text-red-900/70 text-right font-medium">
              * {rowAnalysis.unassignedPrize.toFixed(2)} pts no asignados por casillas vacías en la fila.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
