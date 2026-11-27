/**
 * Galería: vista de una partida guardada (planilla, bolas y foto del bolillero).
 * Se separó de SavedGamesGalleryModal.tsx sin cambiar su contenido ni su funcionamiento.
 */
import React from 'react';
import {
  getBallBadgeColor,
} from '../../utils/ballColors';
import {
  Trophy,
  Table2,
  ListOrdered,
  Camera,
  FileDown,
} from 'lucide-react';
import type { GameSequenceItem } from '../../types';
import { isPlanilla90Snapshot } from '../../utils/planilla90Rules';
import { Planilla90SnapshotView } from '../planilla90/Planilla90SnapshotView';

export interface GalleryGameInspectorProps {
  selectedGame: GameSequenceItem;
  activeTab: 'sheet' | 'balls' | 'cage';
  setTable90View: React.Dispatch<React.SetStateAction<'both' | '1' | '2'>>;
  table90View: 'both' | '1' | '2';
  setActiveTab: React.Dispatch<React.SetStateAction<'sheet' | 'balls' | 'cage'>>;
}

export const GalleryGameInspector: React.FC<GalleryGameInspectorProps> = ({
  selectedGame,
  activeTab,
  setTable90View,
  table90View,
  setActiveTab,
}) => {
  return (
    <div className="h-full min-h-0 flex flex-col gap-1.5 w-full max-w-[1700px] mx-auto overflow-hidden">
      {/* Compact Sub-Bar: Winner, Financials, Table/Balls Selector */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-1.5 bg-white border border-orange-200 rounded-xl shadow-2xs flex-shrink-0">
        {/* Left side: Winning ball + Winner badge + Bolas count */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getBallBadgeColor(
              selectedGame.ballNumber,
              selectedGame.mode === '90' || selectedGame.sheetType === 'traditional-90'
            )} border flex flex-col items-center justify-center shadow-xs flex-shrink-0`}
          >
            {selectedGame.letter && (
              <span className="text-[8px] font-black uppercase leading-none opacity-90">
                {selectedGame.letter}
              </span>
            )}
            <span className="text-sm font-black leading-none font-mono">
              {selectedGame.ballNumber}
            </span>
          </div>

          {selectedGame.winningPlayerName ? (
            <div className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-100 to-yellow-100 border border-amber-300 flex items-center gap-1.5 text-xs font-black text-amber-950 shadow-2xs">
              <Trophy className="w-3.5 h-3.5 text-amber-600 fill-amber-500 flex-shrink-0" />
              <span className="truncate max-w-[140px] sm:max-w-[200px]">
                Ganador: <strong>{selectedGame.winningPlayerName}</strong>
              </span>
              {selectedGame.rowLeader && (
                <span className="text-amber-800 font-extrabold bg-amber-200 px-1.5 py-0.5 rounded text-[10px]">
                  Fila #{selectedGame.rowLeader}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs font-bold text-slate-700">
              Partida #{selectedGame.round} Finalizada
            </span>
          )}

          <span className="text-xs font-semibold text-slate-500 hidden md:inline">
            {selectedGame.totalBallsDrawnCount || selectedGame.drawnBallsPlayed?.length || 0} bolas cantadas
          </span>
        </div>

        {/* Center: Financial stats */}
        <div className="flex items-center gap-2 text-xs font-black">
          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-800 text-[11px] whitespace-nowrap">
            Recaudo: <strong>{selectedGame.currency || '$'}{Number(selectedGame.totalCollected || 0).toFixed(2)}</strong>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] whitespace-nowrap">
            Premios: <strong>{selectedGame.currency || '$'}{Number(selectedGame.totalPrizesPaid || 0).toFixed(2)}</strong>
          </span>
          <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] whitespace-nowrap">
            Beneficio: <strong>{selectedGame.currency || '$'}{Number(selectedGame.netProfit || 0).toFixed(2)}</strong>
          </span>
        </div>

        {/* Right: Mode 90 table switcher & Tab switcher */}
        <div className="flex items-center gap-1.5">
          {(selectedGame.mode === '90' || selectedGame.sheetType === 'traditional-90') && activeTab === 'sheet' && !isPlanilla90Snapshot(selectedGame.sheet75Snapshot) && (
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-300 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setTable90View('both')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  table90View === 'both' ? 'bg-orange-600 text-white font-black shadow-2xs' : 'text-slate-700 hover:bg-slate-200'
                }`}
                title="Ver ambas tablas"
              >
                Ambas
              </button>
              <button
                type="button"
                onClick={() => setTable90View('1')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  table90View === '1' ? 'bg-orange-600 text-white font-black shadow-2xs' : 'text-slate-700 hover:bg-slate-200'
                }`}
                title="Ver Tabla 1"
              >
                Tabla 1
              </button>
              <button
                type="button"
                onClick={() => setTable90View('2')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  table90View === '2' ? 'bg-orange-600 text-white font-black shadow-2xs' : 'text-slate-700 hover:bg-slate-200'
                }`}
                title="Ver Tabla 2"
              >
                Tabla 2
              </button>
            </div>
          )}

          <div className="flex items-center bg-orange-100/80 rounded-lg p-0.5 border border-orange-300 text-xs font-black">
            <button
              type="button"
              onClick={() => setActiveTab('sheet')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                activeTab === 'sheet'
                  ? 'bg-orange-600 text-white shadow-2xs'
                  : 'text-orange-950 hover:bg-orange-200'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Planilla</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('balls')}
              className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                activeTab === 'balls'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-700 hover:bg-orange-200'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Bolas ({selectedGame.drawnBallsPlayed?.length || 0})</span>
            </button>
            {Boolean(selectedGame.cageSnapshotImage) && (
              <button
                type="button"
                onClick={() => setActiveTab('cage')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all cursor-pointer ${
                  activeTab === 'cage'
                    ? 'bg-orange-600 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-orange-200'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Foto Bolillero</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Inspector Sheet / Balls Container (FLEX-1 MIN-H-0 OVERFLOW-HIDDEN: ZERO VERTICAL SCROLL) */}
      <div id="gallery-sheet-export-target" className="flex-1 min-h-0 flex flex-col overflow-hidden bg-white p-1">
        {activeTab === 'sheet' ? (
          /* TAB 1: FULL SHEET INSPECTION ON A SINGLE SCREEN PLANE */
          isPlanilla90Snapshot(selectedGame.sheet75Snapshot) ? (
            /* Planilla 90 nueva (formato por columnas) */
            <div className="flex-1 min-h-0 overflow-auto p-1">
              <Planilla90SnapshotView game={selectedGame} snapshot={selectedGame.sheet75Snapshot!} />
            </div>
          ) : selectedGame.sheetType === 'traditional-90' || selectedGame.mode === '90' ? (
            /* 90 Traditional Sheet Snapshot */
            selectedGame.sheet90Snapshot ? (
              <div className={`flex-1 min-h-0 grid ${table90View === 'both' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'} gap-2 w-full overflow-hidden`}>
                {[
                  selectedGame.sheet90Snapshot.table1,
                  selectedGame.sheet90Snapshot.table2,
                  ...(selectedGame.sheet90Snapshot.tables || []),
                ]
                  .filter(Boolean)
                  .slice(0, 4)
                  .filter((table, tIdx) => {
                    const tblNum = table?.tableNumber || tIdx + 1;
                    if (table90View === '1') return tblNum === 1;
                    if (table90View === '2') return tblNum === 2;
                    return true;
                  })
                  .map((table, tIdx) => {
                    const tblNum = table?.tableNumber || tIdx + 1;
                    const drawnSet = new Set(selectedGame.drawnBallsPlayed || []);
                    const rows = table?.rows || [];
                    const leftHalfRows = rows.slice(0, 15);
                    const rightHalfRows = rows.slice(15, 30);

                    return (
                      <div
                        key={tblNum}
                        className="border-2 border-black rounded-xl overflow-hidden bg-white shadow-md flex-1 min-h-0 flex flex-col"
                      >
                        {/* Table header */}
                        <div className="bg-slate-900 text-yellow-300 px-3 py-1 border-b-2 border-black flex items-center justify-between font-black text-xs flex-shrink-0">
                          <span className="uppercase tracking-wide">{table?.title || `TABLA #${tblNum}`}</span>
                          <span className="text-yellow-100 font-mono text-[11px] sm:text-xs">
                            Fila: {selectedGame.currency || '$'}{table?.pricePerRow || 1.0} • Premio: {selectedGame.currency || '$'}{table?.prize || 25.0}
                          </span>
                        </div>

                        {/* Split into 2 sub-columns of 15 rows side-by-side so all 30 rows fit in a single screen plane! */}
                        <div className="flex-1 min-h-0 grid grid-cols-2 divide-x-2 divide-black overflow-hidden">
                          {/* Left sub-column: Rows 1..15 */}
                          <div className="flex-1 min-h-0 flex flex-col divide-y divide-black/80">
                            {leftHalfRows.map((row) => {
                              const hits = row.numbers.filter((n) => drawnSet.has(n));
                              const isBingo = hits.length === 3;

                              return (
                                <div
                                  key={row.rowNumber}
                                  className={`flex-1 min-h-0 flex items-center justify-between px-2 text-xs relative transition-all ${
                                    isBingo
                                      ? 'bg-[#4ade80] font-black ring-2 ring-[#15803d] ring-inset shadow-xs'
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className={`w-6 font-black text-[11px] ${
                                        isBingo ? 'text-emerald-950 font-black' : 'text-slate-800'
                                      }`}
                                    >
                                      #{row.rowNumber}
                                    </span>
                                    <div className="flex items-center gap-1 font-mono">
                                      {row.numbers.map((n) => (
                                        <span
                                          key={n}
                                          className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full font-bold text-[10px] sm:text-xs flex items-center justify-center transition-all ${
                                            drawnSet.has(n)
                                              ? isBingo
                                                ? 'bg-[#15803d] text-white ring-2 ring-emerald-300 font-black shadow-2xs'
                                                : 'bg-amber-400 text-amber-950 ring-1 ring-amber-600 font-black shadow-2xs'
                                              : isBingo
                                              ? 'bg-white text-emerald-950 font-black border border-emerald-600'
                                              : 'bg-slate-100 text-slate-800 border border-slate-300'
                                          }`}
                                        >
                                          {n}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 min-w-0">
                                    {isBingo && (
                                      <span className="px-1.5 py-0.2 rounded-full bg-[#15803d] text-white font-black text-[9px] animate-pulse shadow-2xs">
                                        ★ BINGO
                                      </span>
                                    )}
                                    <span
                                      className={`font-black truncate text-[11px] max-w-[80px] sm:max-w-[110px] text-right ${
                                        isBingo ? 'text-black' : 'text-slate-900'
                                      }`}
                                    >
                                      {row.playerName || '-'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Right sub-column: Rows 16..30 */}
                          <div className="flex-1 min-h-0 flex flex-col divide-y divide-black/80">
                            {rightHalfRows.map((row) => {
                              const hits = row.numbers.filter((n) => drawnSet.has(n));
                              const isBingo = hits.length === 3;

                              return (
                                <div
                                  key={row.rowNumber}
                                  className={`flex-1 min-h-0 flex items-center justify-between px-2 text-xs relative transition-all ${
                                    isBingo
                                      ? 'bg-[#4ade80] font-black ring-2 ring-[#15803d] ring-inset shadow-xs'
                                      : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className={`w-6 font-black text-[11px] ${
                                        isBingo ? 'text-emerald-950 font-black' : 'text-slate-800'
                                      }`}
                                    >
                                      #{row.rowNumber}
                                    </span>
                                    <div className="flex items-center gap-1 font-mono">
                                      {row.numbers.map((n) => (
                                        <span
                                          key={n}
                                          className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full font-bold text-[10px] sm:text-xs flex items-center justify-center transition-all ${
                                            drawnSet.has(n)
                                              ? isBingo
                                                ? 'bg-[#15803d] text-white ring-2 ring-emerald-300 font-black shadow-2xs'
                                                : 'bg-amber-400 text-amber-950 ring-1 ring-amber-600 font-black shadow-2xs'
                                              : isBingo
                                              ? 'bg-white text-emerald-950 font-black border border-emerald-600'
                                              : 'bg-slate-100 text-slate-800 border border-slate-300'
                                          }`}
                                        >
                                          {n}
                                        </span>
                                      ))}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 min-w-0">
                                    {isBingo && (
                                      <span className="px-1.5 py-0.2 rounded-full bg-[#15803d] text-white font-black text-[9px] animate-pulse shadow-2xs">
                                        ★ BINGO
                                      </span>
                                    )}
                                    <span
                                      className={`font-black truncate text-[11px] max-w-[80px] sm:max-w-[110px] text-right ${
                                        isBingo ? 'text-black' : 'text-slate-900'
                                      }`}
                                    >
                                      {row.playerName || '-'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                No se guardó el snapshot visual completo de la planilla 90 en esta versión previa.
              </div>
            )
          ) : (
            /* 75 Multipliers Sheet Snapshot on a Single Screen Plane with ZERO scrolling */
            selectedGame.sheet75Snapshot ? (
              (() => {
                const s75 = selectedGame.sheet75Snapshot;
                const numCols = s75.columns?.length || 4;
                const seqColWidth = 115;
                const exactGameLines =
                  selectedGame.totalLinesPlayed !== undefined
                    ? selectedGame.totalLinesPlayed
                    : (s75.columns?.reduce((acc, c) => acc + (c.multiplier || 1), 0) || 12);
                const summaryList =
                  selectedGame.playerSummarySnapshot ||
                  s75.playerSummaryList ||
                  [];

                return (
                  <div className="flex-1 min-h-0 flex flex-col border-2 border-black rounded-xl overflow-hidden bg-white shadow-md w-full">
                    {/* Host Header */}
                    <div className="bg-slate-100 px-3 py-1 border-b-2 border-black flex items-center justify-between text-xs font-black text-slate-900 flex-shrink-0">
                      <div>
                        <span>LES ATIENDE: </span>
                        <strong className="text-black uppercase">
                          {s75.hostName || selectedGame.operatorName || 'OFICIAL'}
                        </strong>
                      </div>
                      <div className="text-center">
                        <span className="font-black text-xs sm:text-sm uppercase tracking-wider">
                          {(s75.title && s75.title !== 'PLANILLA OFICIAL') ? s75.title : 'BIENVENIDOS A LA FAMILIA TEOO'}
                        </span>
                      </div>
                      <div>
                        <span>YAPPY: </span>
                        <strong className="text-black font-mono">
                          {s75.hostPhone || '6341-9199'}
                        </strong>
                      </div>
                    </div>

                    {/* Grid Columns Header: SECUENCIA (A | T | B) + Multipliers X1, X2, X3... */}
                    <div
                      className="grid divide-x-2 divide-black border-b-2 border-black bg-slate-100 text-center font-black text-xs flex-shrink-0"
                      style={{
                        gridTemplateColumns: `${seqColWidth}px repeat(${numCols}, minmax(0, 1fr))`,
                      }}
                    >
                      {/* Left Header: LINES & SECUENCIA */}
                      <div className="flex flex-col bg-slate-200 border-r-2 border-black overflow-hidden select-none">
                        <div className="py-0.5 px-0.5 bg-[#581c87] text-white flex flex-col items-center justify-center text-center">
                          <span className="text-sm sm:text-base font-black font-mono leading-none tracking-tight text-yellow-300">
                            {exactGameLines}
                          </span>
                          <span className="text-[7.5px] font-black uppercase text-purple-100 tracking-wider leading-none mt-0.5">
                            LÍNEAS (TURNO)
                          </span>
                          <span className="text-[7px] text-purple-200/90 font-bold leading-tight mt-0.5 whitespace-nowrap">
                            Esta: {exactGameLines} lín.
                          </span>
                        </div>
                        <div className="bg-[#facc15] text-black font-black uppercase text-[9px] tracking-wider text-center py-0.5 border-t border-b border-black leading-none">
                          SECUENCIA
                        </div>
                        <div className="grid grid-cols-3 divide-x divide-purple-300 bg-[#581c87] text-white font-black text-[8.5px] py-0.5 text-center leading-none uppercase">
                          <span title="Ambo">AMB</span>
                          <span title="Terna">TER</span>
                          <span title="Bingo">BIN</span>
                        </div>
                      </div>

                      {/* Multiplier Columns: SOLO X1, DOBLE X2, TRIPLE X3... */}
                      {s75.columns.map((col, cIdx) => {
                        const mult = col.multiplier || 1;
                        const multName =
                          mult === 1
                            ? 'SOLO'
                            : mult === 2
                            ? 'DOBLE'
                            : mult === 3
                            ? 'TRIPLE'
                            : mult === 4
                            ? 'CUARTA'
                            : mult === 5
                            ? 'QUINTA'
                            : `X${mult}`;

                        return (
                          <div
                            key={col.id || cIdx}
                            className={`py-0.5 px-1 flex flex-col items-center justify-center ${
                              mult >= 2 ? 'bg-[#facc15] text-black font-black' : 'bg-slate-100 text-purple-950 font-black'
                            }`}
                          >
                            <span className="text-[8.5px] font-black uppercase tracking-wider leading-none text-black">
                              {multName}
                            </span>
                            <span className="text-base sm:text-lg font-black text-black font-mono leading-none mt-0.5">
                              X{mult}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* 15 Rows: Each row takes flex-1 min-h-0 so ALL 15 fit precisely on a single screen without scrolling! */}
                    <div className="flex-1 min-h-0 flex flex-col divide-y divide-black/80">
                      {Array.from({ length: s75.totalRows || 15 }).map((_, rIdx) => {
                        const rowNumber = rIdx + 1;
                        const isWinningRow = selectedGame.rowLeader === rowNumber;
                        const isTernaRow = selectedGame.ternaLeader === rowNumber;
                        const isAmboRow = selectedGame.amboLeader === rowNumber;

                        // Secuencia values for row
                        const aVal =
                          selectedGame.sequenceSnapshot?.[rowNumber]?.ambo ??
                          s75.customSeqEntries?.[rowNumber]?.ambo ??
                          (isAmboRow ? rowNumber : null);

                        const tVal =
                          selectedGame.sequenceSnapshot?.[rowNumber]?.terna ??
                          s75.customSeqEntries?.[rowNumber]?.terna ??
                          (isTernaRow ? rowNumber : null);

                        const bVal =
                          selectedGame.sequenceSnapshot?.[rowNumber]?.bingo ??
                          s75.customSeqEntries?.[rowNumber]?.bingo ??
                          (isWinningRow ? rowNumber : null);

                        return (
                          <div
                            key={rowNumber}
                            className={`flex-1 min-h-0 grid divide-x divide-black/80 relative items-stretch transition-all ${
                              isWinningRow
                                ? 'bg-[#4ade80] font-black border-y-2 border-[#15803d] ring-2 ring-[#22c55e] z-10'
                                : isTernaRow
                                ? 'bg-emerald-100/70 font-black'
                                : isAmboRow
                                ? 'bg-sky-100/70 font-black'
                                : ''
                            }`}
                            style={{
                              gridTemplateColumns: `${seqColWidth}px repeat(${numCols}, minmax(0, 1fr))`,
                            }}
                          >
                            {/* Left Cell: SECUENCIA (A | T | B) */}
                            <div className="grid grid-cols-3 divide-x divide-black text-center text-xs font-black select-none border-r-2 border-black bg-slate-50">
                              {/* A */}
                              <div className={`flex items-center justify-center font-mono ${isAmboRow ? 'bg-sky-200 text-sky-950 font-black' : 'text-slate-800'}`}>
                                {aVal !== null && aVal !== undefined ? (
                                  <span className="font-black text-xs sm:text-sm">{aVal}</span>
                                ) : (
                                  <span className="text-slate-300 text-[10px]">-</span>
                                )}
                              </div>
                              {/* T */}
                              <div className={`flex items-center justify-center font-mono ${isTernaRow ? 'bg-emerald-200 text-emerald-950 font-black' : 'text-slate-800'}`}>
                                {tVal !== null && tVal !== undefined ? (
                                  <span className="font-black text-xs sm:text-sm">{tVal}</span>
                                ) : (
                                  <span className="text-slate-300 text-[10px]">-</span>
                                )}
                              </div>
                              {/* B */}
                              <div className={`flex items-center justify-center font-mono ${isWinningRow ? 'bg-amber-300 text-amber-950 font-black' : 'text-slate-800'}`}>
                                {bVal !== null && bVal !== undefined ? (
                                  <span className="font-black text-xs sm:text-sm">{bVal}</span>
                                ) : (
                                  <span className="text-slate-300 text-[10px]">-</span>
                                )}
                              </div>
                            </div>

                            {/* Columns */}
                            {s75.columns.map((col, cIdx) => {
                              const cell = col.cells[rIdx] || { rowNumber };

                              return (
                                <div
                                  key={cIdx}
                                  className={`px-1.5 sm:px-2 flex items-center justify-between relative overflow-hidden text-xs ${
                                    isWinningRow ? 'bg-[#4ade80]' : ''
                                  }`}
                                  style={{
                                    backgroundColor: isWinningRow
                                      ? '#4ade80'
                                      : cell.color || 'transparent',
                                  }}
                                >
                                  <span
                                    className={`text-[9px] sm:text-[10px] font-black select-none ${
                                      isWinningRow ? 'text-emerald-950 font-black' : 'text-slate-500'
                                    }`}
                                  >
                                    #{rowNumber}
                                  </span>
                                  <span
                                    className={`font-black truncate text-center flex-1 px-1 uppercase text-[11px] sm:text-xs ${
                                      isWinningRow ? 'text-black font-black text-sm' : 'text-slate-950'
                                    }`}
                                    title={cell.playerName || ''}
                                  >
                                    {cell.playerName ? cell.playerName.toUpperCase() : '-'}
                                  </span>

                                  {/* Winner Badges */}
                                  {isWinningRow && cIdx === numCols - 1 && (
                                    <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#15803d] text-white text-[9px] font-black tracking-wider uppercase ml-1 flex-shrink-0 animate-pulse">
                                      ★ BINGO
                                    </span>
                                  )}
                                  {isTernaRow && !isWinningRow && cIdx === numCols - 1 && (
                                    <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black tracking-wider uppercase ml-1 flex-shrink-0">
                                      ⭐ TERNA
                                    </span>
                                  )}
                                  {isAmboRow && !isWinningRow && !isTernaRow && cIdx === numCols - 1 && (
                                    <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full bg-sky-600 text-white text-[9px] font-black tracking-wider uppercase ml-1 flex-shrink-0">
                                      🔷 AMBO
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>

                    {/* BOTTOM SUMMARY ROWS: NOMBRE, GANO, DEBE, TOTAL (CON NÚMEROS EN NEGRITA Y LEGIBLES) */}
                    <div className="border-t-2 border-black flex flex-col bg-slate-50 flex-shrink-0 select-none overflow-hidden">
                      <div className="flex w-full overflow-x-auto scrollbar-thin">
                        {/* Left Header Column (Matching width of SECUENCIA column) */}
                        <div
                          className="flex-shrink-0 sticky left-0 z-20 bg-slate-100 border-r-2 border-black flex flex-col select-none"
                          style={{
                            width: `${seqColWidth}px`,
                            minWidth: `${seqColWidth}px`,
                            maxWidth: `${seqColWidth}px`,
                          }}
                        >
                          <div className="h-[20px] bg-[#d8b4fe] text-purple-950 font-black text-[9.5px] uppercase tracking-wider flex items-center justify-center border-b border-black">
                            NOMBRE
                          </div>
                          <div className="h-[18px] bg-[#fde047] text-amber-950 font-black text-[9px] uppercase tracking-wider flex items-center justify-center border-b border-black">
                            GANO
                          </div>
                          <div className="h-[18px] bg-[#fef08a] text-amber-950 font-black text-[9px] uppercase tracking-wider flex items-center justify-center border-b border-black">
                            DEBE
                          </div>
                          <div className="h-[18px] bg-[#facc15] text-amber-950 font-black text-[9px] uppercase tracking-wider flex items-center justify-center">
                            TOTAL
                          </div>
                        </div>

                        {/* Right Player Columns */}
                        <div className="flex-1 flex min-w-0">
                          {summaryList.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center h-[74px] px-3 text-slate-400 italic font-bold uppercase text-[10px] bg-white">
                              <span>Sin saldos registrados en esta partida</span>
                            </div>
                          ) : (
                            summaryList.map((p, pIdx) => {
                              const isNeg = (p.total || 0) < 0;
                              const isPos = (p.total || 0) > 0;
                              const ganoVal = Number(p.totalGano || p.currentWon || 0);
                              const debeVal = Number(p.debe || 0);
                              const totalVal = Number(p.total || 0);

                              return (
                                <div
                                  key={p.id || pIdx}
                                  className="min-w-[75px] sm:min-w-[90px] flex-1 flex flex-col border-r border-black text-center"
                                >
                                  {/* NOMBRE */}
                                  <div
                                    className="h-[20px] px-1 flex items-center justify-center font-black uppercase text-[10px] sm:text-[11px] border-b border-black truncate"
                                    style={{
                                      backgroundColor: p.color ? `${p.color}dd` : '#f3e8ff',
                                      color: '#000000',
                                    }}
                                    title={p.name}
                                  >
                                    <span className="font-black truncate">{p.name.toUpperCase()}</span>
                                    {p.isBingoWinner && (
                                      <span className="ml-0.5 text-[7.5px] font-black bg-amber-400 text-amber-950 px-0.5 rounded border border-black leading-none">B</span>
                                    )}
                                    {p.isTernaWinner && (
                                      <span className="ml-0.5 text-[7.5px] font-black bg-emerald-500 text-white px-0.5 rounded border border-black leading-none">T</span>
                                    )}
                                    {p.isAmboWinner && (
                                      <span className="ml-0.5 text-[7.5px] font-black bg-sky-500 text-white px-0.5 rounded border border-black leading-none">A</span>
                                    )}
                                  </div>

                                  {/* GANO (NEGRITA) */}
                                  <div
                                    className={`h-[18px] px-1 flex items-center justify-center font-black tabular-nums text-[11px] sm:text-xs border-b border-black ${
                                      ganoVal > 0 ? 'text-emerald-950 bg-emerald-100 font-black' : 'text-black bg-[#fefce8] font-black'
                                    }`}
                                  >
                                    <strong className="font-black font-mono">{ganoVal.toFixed(2)}</strong>
                                  </div>

                                  {/* DEBE (NEGRITA) */}
                                  <div
                                    className={`h-[18px] px-1 flex items-center justify-center font-black tabular-nums text-[11px] sm:text-xs border-b border-black ${
                                      debeVal > 0 ? 'text-rose-950 bg-rose-100 font-black' : 'text-black bg-[#fefce8] font-black'
                                    }`}
                                  >
                                    <strong className="font-black font-mono">{debeVal.toFixed(2)}</strong>
                                  </div>

                                  {/* TOTAL (NEGRITA) */}
                                  <div
                                    className={`h-[18px] px-1 flex items-center justify-center font-black tabular-nums text-[11px] sm:text-xs ${
                                      isNeg
                                        ? 'text-red-950 bg-red-200 font-black'
                                        : isPos
                                        ? 'text-emerald-950 bg-emerald-200 font-black'
                                        : 'text-black bg-amber-100 font-black'
                                    }`}
                                  >
                                    <strong className="font-black font-mono">
                                      {isNeg
                                        ? `-${Math.abs(totalVal).toFixed(2)}`
                                        : isPos
                                        ? `+${totalVal.toFixed(2)}`
                                        : '0.00'}
                                    </strong>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs">
                No se guardó el snapshot visual completo de la planilla 75 en esta versión previa.
              </div>
            )
          )
        ) : activeTab === 'balls' ? (
          /* TAB 2: ALL BALLS PLAYED IN ORDER (Fits inside the single plane with internal scroll if necessary) */
          <div className="flex-1 min-h-0 bg-white rounded-xl border-2 border-orange-300 p-3 shadow-sm flex flex-col overflow-hidden">
            <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-2 flex-shrink-0">
              Extracciones de la Partida en Orden ({selectedGame.drawnBallsPlayed?.length || 0} bolas)
            </h4>

            {selectedGame.drawnBallsPlayed && selectedGame.drawnBallsPlayed.length > 0 ? (
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-wrap gap-1.5 content-start p-1">
                {selectedGame.drawnBallsPlayed.map((num, idx) => {
                  const isWinningLast = num === selectedGame.ballNumber;

                  return (
                    <div
                      key={idx}
                      className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 shadow-2xs font-mono text-xs font-black ${
                        isWinningLast
                          ? 'bg-red-600 text-white border-red-700 ring-2 ring-red-400 scale-105 shadow-md'
                          : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}
                    >
                      <span className="text-[9px] opacity-60">#{idx + 1}</span>
                      <span className="text-sm">{num}</span>
                      {isWinningLast && <span className="text-[10px]">🏆</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">No se registraron las bolas cantadas en esta partida.</p>
            )}
          </div>
        ) : (
          /* TAB 3: BOLILLERO SNAPSHOT PHOTO */
          <div className="flex-1 min-h-0 bg-white rounded-xl border-2 border-orange-300 p-3 shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
              <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-orange-600" />
                <span>Captura del Bolillero al Cantar Bingo - Partida #{selectedGame.round}</span>
              </h4>
              {selectedGame.cageSnapshotImage && (
                <a
                  href={selectedGame.cageSnapshotImage}
                  download={`bolillero_partida_${selectedGame.round}.png`}
                  className="py-1 px-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-black flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Descargar Foto</span>
                </a>
              )}
            </div>
            {selectedGame.cageSnapshotImage ? (
              <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-2 bg-[#fffaf5] rounded-xl border border-orange-200">
                <img
                  src={selectedGame.cageSnapshotImage}
                  alt={`Bolillero Partida #${selectedGame.round}`}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
                <Camera className="w-10 h-10 text-slate-300" />
                <p className="text-xs font-bold text-slate-700">Sin foto del bolillero guardada</p>
                <p className="text-[11px] text-slate-400 max-w-xs">
                  Esta partida fue registrada antes de la activación de la captura fotográfica del bolillero.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
