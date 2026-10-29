import React, { useState, useMemo, memo } from 'react';
import { Ball, BingoMode, ThemeName } from '../types';
import { Search, CheckCircle2, Award } from 'lucide-react';

interface MasterBoardProps {
  mode: BingoMode;
  totalBalls: number;
  customMin?: number;
  customMax?: number;
  drawnBalls: Ball[];
  currentBall: Ball | null;
  theme: ThemeName;
  completedRowLeaders?: number[];
  ternaRowLeader?: number | null;
  ternaBallNumber?: number | null;
}

export const MasterBoard: React.FC<MasterBoardProps> = memo(({
  mode,
  drawnBalls,
  currentBall,
  completedRowLeaders = [],
  ternaRowLeader = null,
  ternaBallNumber = null,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Map drawn balls for fast O(1) status lookup
  const drawnMap = useMemo(() => {
    const map = new Map<number, Ball>();
    drawnBalls.forEach((b) => map.set(b.number, b));
    return map;
  }, [drawnBalls]);

  // Generate list of numbers (90 or 75)
  const numberList = useMemo(() => {
    const max = mode === '90' ? 90 : 75;
    const list: number[] = [];
    for (let i = 1; i <= max; i++) list.push(i);
    return list;
  }, [mode]);

  // For Bingo 75, group by B-I-N-G-O columns (5 columns x 15 numbers)
  const bingo75Columns = useMemo(() => {
    if (mode !== '75') return null;
    return [
      { letter: 'B', range: [1, 15] },
      { letter: 'I', range: [16, 30] },
      { letter: 'N', range: [31, 45] },
      { letter: 'G', range: [46, 60] },
      { letter: 'O', range: [61, 75] },
    ];
  }, [mode]);

  // For Bingo 90, group by 9 columns of 10 numbers each (1-10, 11-20, ... 81-90)
  const bingo90Columns = useMemo(() => {
    if (mode !== '90') return null;
    return [
      { label: '1-10', range: [1, 10] },
      { label: '11-20', range: [11, 20] },
      { label: '21-30', range: [21, 30] },
      { label: '31-40', range: [31, 40] },
      { label: '41-50', range: [41, 50] },
      { label: '51-60', range: [51, 60] },
      { label: '61-70', range: [61, 70] },
      { label: '71-80', range: [71, 80] },
      { label: '81-90', range: [81, 90] },
    ];
  }, [mode]);

  const searchNum = parseInt(searchQuery.trim(), 10);
  const isSearchMatch = !isNaN(searchNum) && searchNum > 0;

  return (
    <div
      id="master-control-board"
      className="w-full h-full rounded-2xl border p-2.5 sm:p-3.5 shadow-sm transition-all flex flex-col min-h-0"
      style={{
        backgroundColor: 'var(--surface-main)',
        borderColor: 'var(--surface-border)',
      }}
    >
      {/* Header with Title, Mode Badge & Quick Number Verifier */}
      <div className="flex flex-row items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-700/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <h2
            className="text-xs sm:text-sm font-black tracking-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Tablero Master {mode === '90' ? 'Bingo 90' : mode === '75' ? 'Bingo 75' : ''}
          </h2>
          <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold border border-blue-500/20 whitespace-nowrap">
            {drawnBalls.length}/{numberList.length} ({Math.round((drawnBalls.length / (numberList.length || 1)) * 100)}%)
          </span>
          {ternaRowLeader && (
            <span
              className="text-[9.5px] sm:text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-black border border-purple-400/40 flex items-center gap-1 shadow-xs animate-pulse"
              title={`¡Fila #${ternaRowLeader} logró TERNA (3 números completados primero)!${ternaBallNumber ? ` Balota #${ternaBallNumber}` : ''}`}
            >
              <span>⭐</span>
              <span>TERNA: Fila #{ternaRowLeader}{ternaBallNumber ? ` (#${ternaBallNumber})` : ''}</span>
            </span>
          )}
        </div>

        {/* Quick Search / Card Verification */}
        <div className="relative w-36 sm:w-48">
          <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            id="input-search-number"
            type="number"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Verificar nº..."
            className="w-full text-[11px] sm:text-xs pl-7 pr-2.5 py-1 rounded-lg border bg-black/10 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-slate-500"
            style={{
              borderColor: 'var(--surface-border)',
              color: 'var(--text-primary)',
            }}
          />
          {isSearchMatch && (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
              {drawnMap.has(searchNum) ? (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-950/80 px-1 py-0.5 rounded">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Extraído
                </span>
              ) : (
                <span className="text-[9px] font-bold text-amber-400 bg-amber-950/80 px-1 py-0.5 rounded">
                  En bombo
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RENDER FOR BINGO 75 (5 Classical Columns B-I-N-G-O) OR BINGO 90 (9 Classical Columns) */}
      {mode === '75' && bingo75Columns ? (
        <div className="flex-1 grid grid-cols-5 gap-1 sm:gap-1.5 min-h-0">
          {bingo75Columns.map((col) => {
            const numbers = numberList.filter(
              (n) => n >= col.range[0] && n <= col.range[1]
            );
            return (
              <div key={col.letter} className="flex flex-col h-full min-h-0">
                {/* Column Letter Header */}
                <div
                  className="w-full py-1 rounded-lg mb-1 text-center font-black text-xs sm:text-sm tracking-widest text-blue-400 bg-slate-800/80 border border-slate-700/60 shadow-xs flex-shrink-0"
                >
                  {col.letter}
                </div>

                {/* Column Numbers Grid - 15 evenly distributed rows */}
                <div
                  className="w-full flex-1 grid gap-0.5 sm:gap-1 min-h-0"
                  style={{ gridTemplateRows: 'repeat(15, minmax(0, 1fr))' }}
                >
                  {numbers.map((num) => {
                    const isDrawn = drawnMap.has(num);
                    const isCurrent = currentBall?.number === num;
                    const isHighlighted = isSearchMatch && searchNum === num;
                    const rowLeader = ((num - 1) % 15) + 1;
                    const isWinningRow = completedRowLeaders.includes(rowLeader);
                    const isTernaRow = ternaRowLeader === rowLeader;

                    return (
                      <div
                        key={num}
                        className={`relative w-full h-full min-h-0 rounded sm:rounded-md flex items-center justify-center font-black tabular-nums text-xs sm:text-sm transition-all duration-150 select-none ${
                          isCurrent
                            ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-[1.03] z-10 shadow-md font-black'
                            : isHighlighted
                            ? 'ring-2 ring-emerald-400 scale-[1.03] z-10'
                            : isWinningRow
                            ? 'bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 ring-1 ring-amber-300 font-black shadow-xs z-5'
                            : isTernaRow && isDrawn
                            ? 'bg-purple-600 text-white font-black ring-1 ring-purple-300 shadow-xs'
                            : isDrawn
                            ? 'bg-blue-600 text-white font-black'
                            : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
                        }`}
                        title={`Número ${num}${
                          isWinningRow
                            ? ' (¡Fila Completa BINGO!)'
                            : isTernaRow && isDrawn
                            ? ` (¡Fila #${ternaRowLeader} logró TERNA!)`
                            : isDrawn
                            ? ' (Extraído)'
                            : ' (En bombo)'
                        }`}
                      >
                        <span>{num}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* RENDER FOR BINGO 90 (9 Classical Columns of 10 Numbers each) */
        <div className="flex-1 grid grid-cols-9 gap-0.5 sm:gap-1 min-h-0">
          {bingo90Columns?.map((col) => {
            const numbers = numberList.filter(
              (n) => n >= col.range[0] && n <= col.range[1]
            );
            return (
              <div key={col.label} className="flex flex-col h-full min-h-0">
                {/* Column Tens Range Header */}
                <div
                  className="w-full py-0.5 sm:py-1 rounded-md sm:rounded-lg mb-1 text-center font-extrabold text-[10px] sm:text-xs text-blue-400 bg-slate-800/80 border border-slate-700/60 truncate flex-shrink-0"
                  title={`Columna ${col.label}`}
                >
                  {col.label}
                </div>

                {/* Column Numbers Grid - 10 evenly distributed rows */}
                <div
                  className="w-full flex-1 grid gap-0.5 sm:gap-1 min-h-0"
                  style={{ gridTemplateRows: 'repeat(10, minmax(0, 1fr))' }}
                >
                  {numbers.map((num) => {
                    const isDrawn = drawnMap.has(num);
                    const isCurrent = currentBall?.number === num;
                    const isHighlighted = isSearchMatch && searchNum === num;
                    const rowLeader = ((num - 1) % 30) + 1;
                    const isWinningRow = completedRowLeaders.includes(rowLeader);

                    return (
                      <div
                        key={num}
                        className={`relative w-full h-full min-h-0 rounded sm:rounded-md flex items-center justify-center font-black tabular-nums text-xs sm:text-sm transition-all duration-150 select-none ${
                          isCurrent
                            ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300 scale-[1.04] z-10 shadow-md font-black'
                            : isHighlighted
                            ? 'ring-2 ring-emerald-400 scale-[1.04] z-10'
                            : isWinningRow
                            ? 'bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 ring-1 ring-amber-300 font-black shadow-xs z-5'
                            : isDrawn
                            ? 'bg-blue-600 text-white font-black'
                            : 'bg-slate-800/60 text-slate-400 border border-slate-700/50'
                        }`}
                        title={`Número ${num}${
                          isWinningRow
                            ? ' (¡Fila Completa BINGO!)'
                            : isDrawn
                            ? ' (Extraído)'
                            : ' (En bombo)'
                        }`}
                      >
                        <span>{num}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
