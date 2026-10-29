import React, { useState } from 'react';
import { GameSequenceItem } from '../types';
import { getBingo75Letter, getBallBadgeColor } from '../utils/ballColors';
import {
  X,
  Trophy,
  Clock,
  Calendar,
  DollarSign,
  Gift,
  TrendingUp,
  Printer,
  ChevronLeft,
  ChevronRight,
  Table2,
  ListOrdered,
  FileDown,
  Camera,
  Download,
} from 'lucide-react';
import { downloadGameDirectJpg, downloadGameDirectPdf } from '../utils/exportGameReport';

interface GameSheetSnapshotModalProps {
  isOpen: boolean;
  item: GameSequenceItem | null;
  allSequenceItems?: GameSequenceItem[];
  onClose: () => void;
  onSelectGameIndex?: (index: number) => void;
}

export const GameSheetSnapshotModal: React.FC<GameSheetSnapshotModalProps> = ({
  isOpen,
  item,
  allSequenceItems = [],
  onClose,
  onSelectGameIndex,
}) => {
  const [activeTab, setActiveTab] = useState<'sheet' | 'balls' | 'cage'>('sheet');

  if (!isOpen || !item) return null;

  const currentIndex = allSequenceItems.findIndex(
    (s) => s.round === item.round && s.ballNumber === item.ballNumber
  );

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allSequenceItems.length - 1;

  const handlePrev = () => {
    if (hasPrev && onSelectGameIndex) {
      onSelectGameIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (hasNext && onSelectGameIndex) {
      onSelectGameIndex(currentIndex + 1);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const letter = item.letter || (item.sheetType !== 'traditional-90' ? getBingo75Letter(item.ballNumber) : undefined);
  const currency = item.currency || '$';
  const drawnBalls = item.drawnBallsPlayed || [];
  const drawnSet = new Set(drawnBalls);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in text-[#431407]">
      <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-scale-up">
        {/* Modal Top Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white flex items-center justify-between gap-3 shadow-md flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 border border-white/30 backdrop-blur-xs flex items-center justify-center shadow-xs">
              <Trophy className="w-5 h-5 text-yellow-200 fill-yellow-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-wide leading-tight">
                  Planilla Registrada • Partida #{item.round}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-black uppercase tracking-wider border border-white/30">
                  {item.sheetType === 'traditional-90' ? 'Bingo 90 Triples' : 'Bingo 75 Multiplicadores'}
                </span>
              </div>
              <p className="text-xs text-orange-100 font-medium flex items-center gap-2 mt-0.5">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 opacity-80" />
                  {item.dateFormatted || 'Hoy'}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 opacity-80" />
                  {item.timestamp}
                </span>
                <span>•</span>
                <span className="font-bold text-yellow-200">
                  Duración: {item.durationFormatted || '4m 30s'}
                </span>
              </p>
            </div>
          </div>

          {/* Quick Navigation & Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {allSequenceItems.length > 1 && (
              <div className="flex items-center bg-black/20 rounded-xl p-0.5 border border-white/20">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={handlePrev}
                  className={`p-1.5 rounded-lg transition-all ${
                    hasPrev ? 'hover:bg-white/20 text-white cursor-pointer active:scale-95' : 'text-white/40 cursor-not-allowed'
                  }`}
                  title="Partida anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-black px-1.5 text-white/90">
                  {currentIndex + 1}/{allSequenceItems.length}
                </span>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={handleNext}
                  className={`p-1.5 rounded-lg transition-all ${
                    hasNext ? 'hover:bg-white/20 text-white cursor-pointer active:scale-95' : 'text-white/40 cursor-not-allowed'
                  }`}
                  title="Partida siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => downloadGameDirectJpg(item)}
              className="px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all border border-white/25 active:scale-95 cursor-pointer flex items-center gap-1 shadow-2xs"
              title="Descargar esta planilla como imagen JPG"
            >
              <FileDown className="w-3.5 h-3.5 text-yellow-200" />
              <span>JPG</span>
            </button>

            <button
              type="button"
              onClick={() => downloadGameDirectPdf(item)}
              className="px-2.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-all border border-white/25 active:scale-95 cursor-pointer flex items-center gap-1 shadow-2xs"
              title="Descargar esta planilla como documento PDF"
            >
              <Printer className="w-3.5 h-3.5 text-amber-200" />
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-all border border-white/20 active:scale-95 cursor-pointer"
              title="Imprimir comprobante"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-all border border-white/30 active:scale-95 cursor-pointer ml-1"
              title="Cerrar ventana"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Financial Summary & Game KPI Cards Banner */}
        <div className="p-3 sm:p-4 bg-[#fff1e6] border-b border-orange-200 grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 flex-shrink-0">
          {/* Bola Ganadora */}
          <div className="bg-white p-2.5 rounded-2xl border border-orange-200 shadow-2xs flex items-center gap-2.5">
            <div
              className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${getBallBadgeColor(
                item.ballNumber,
                item.sheetType === 'traditional-90'
              )} flex flex-col items-center justify-center font-black shadow-xs border flex-shrink-0`}
            >
              {letter && <span className="text-[9px] uppercase leading-none opacity-90">{letter}</span>}
              <span className="text-base leading-none font-black">{item.ballNumber}</span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-orange-800 uppercase tracking-wider block">
                Bola Ganadora
              </span>
              <span className="text-xs font-black text-orange-950 truncate block">
                {item.rowLeader ? `Fila #${item.rowLeader}` : `Bola #${item.ballNumber}`}
              </span>
              {item.winningPlayerName && (
                <span className="text-[10px] text-emerald-700 font-bold truncate block">
                  Ganó: {item.winningPlayerName}
                </span>
              )}
            </div>
          </div>

          {/* Recaudado */}
          <div className="bg-white p-2.5 rounded-2xl border border-orange-200 shadow-2xs flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center flex-shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-blue-900/70 uppercase tracking-wider block">
                Recaudado
              </span>
              <span className="text-sm sm:text-base font-black text-blue-950">
                {currency}{(item.totalCollected ?? 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Premios */}
          <div className="bg-white p-2.5 rounded-2xl border border-orange-200 shadow-2xs flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center flex-shrink-0">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-amber-900/70 uppercase tracking-wider block">
                Premios Dados
              </span>
              <span className="text-sm sm:text-base font-black text-amber-950">
                {currency}{(item.totalPrizesPaid ?? 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Ganancia Neta */}
          <div className="bg-white p-2.5 rounded-2xl border border-emerald-200 shadow-2xs flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-900/70 uppercase tracking-wider block">
                Ganancias Netas
              </span>
              <span
                className={`text-sm sm:text-base font-black ${
                  (item.netProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}
              >
                {currency}{(item.netProfit ?? 0).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Duración y Bolas */}
          <div className="bg-white p-2.5 rounded-2xl border border-orange-200 shadow-2xs flex items-center gap-2.5 col-span-2 sm:col-span-1">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 border border-purple-200 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-purple-900/70 uppercase tracking-wider block">
                Tiempo y Bolas
              </span>
              <span className="text-xs sm:text-sm font-black text-purple-950 block">
                {item.durationFormatted || '4m 30s'}
              </span>
              <span className="text-[10px] text-purple-800 font-bold">
                {item.totalBallsDrawnCount ?? drawnBalls.length} bolas jugadas
              </span>
            </div>
          </div>
        </div>

        {/* Sub-Navigation Tabs: Planilla Completa vs Historial de Bolas */}
        <div className="px-4 sm:px-6 pt-2 pb-1 bg-white border-b border-orange-200 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('sheet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'sheet'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-orange-50 text-orange-950 hover:bg-orange-100 border border-orange-200'
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Planilla Jugada</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('balls')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'balls'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-orange-50 text-orange-950 hover:bg-orange-100 border border-orange-200'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>Números Jugados ({drawnBalls.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('cage')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                activeTab === 'cage'
                  ? 'bg-orange-500 text-white shadow-xs'
                  : 'bg-orange-50 text-orange-950 hover:bg-orange-100 border border-orange-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Foto del Bolillero</span>
              {item.cageSnapshotImage && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          </div>

          <div className="text-[11px] text-orange-900/70 font-semibold hidden sm:block">
            Historial inmutable archivado de la Partida #{item.round}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4">
          {/* TAB 1: SHEET VIEW */}
          {activeTab === 'sheet' && (
            <div className="space-y-4">
              {/* If it's a 75-Ball Multiplier Sheet */}
              {item.sheet75Snapshot ? (
                <div className="bg-white p-3 sm:p-4 rounded-2xl border border-orange-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-orange-100 pb-2">
                    <div>
                      <h4 className="text-sm font-black text-orange-950">
                        {item.sheet75Snapshot.title || 'Planilla de Bingo'} • 15 Filas por Multiplicadores
                      </h4>
                      <p className="text-[11px] text-orange-900/70">
                        Costo base X1: {currency}{(item.sheet75Snapshot.baseCost ?? 0.10).toFixed(2)} • Premio base X1: {currency}{(item.sheet75Snapshot.basePrize ?? 1.35).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-purple-100 text-purple-950 text-xs font-black border border-purple-300 shadow-2xs">
                        {item.totalLinesPlayed !== undefined
                          ? `${item.totalLinesPlayed} Líneas Jugadas`
                          : `${item.sheet75Snapshot.columns?.reduce((acc, c) => acc + (c.multiplier || 1), 0) || 12} Líneas Jugadas`}
                      </span>
                      {item.rowLeader && (
                        <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-950 text-xs font-black border border-amber-300 shadow-2xs flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                          Fila Ganadora: #{item.rowLeader}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 15 Rows Multiplier Grid */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-center select-none text-xs">
                      <thead>
                        <tr className="bg-orange-100/80 text-orange-950 font-black text-[11px]">
                          <th className="p-1.5 border border-orange-200 w-12">Fila</th>
                          {item.sheet75Snapshot.columns.map((col, cIdx) => (
                            <th
                              key={col.id || cIdx}
                              className={`p-1.5 border border-orange-200 min-w-[90px] ${
                                col.hasRedDividerRight ? 'border-r-2 border-r-red-500' : ''
                              }`}
                            >
                              <div className="flex flex-col items-center">
                                <span className="font-black text-orange-900">{col.title}</span>
                                <span className="text-[9.5px] text-orange-800/80 font-semibold">
                                  {currency}{(col.columnPrice ?? col.multiplier * 0.1).toFixed(2)}
                                </span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: item.sheet75Snapshot.totalRows || 15 }, (_, rIdx) => {
                          const rowNum = rIdx + 1;
                          const isWinningRow = item.rowLeader === rowNum;

                          return (
                            <tr
                              key={`row-${rowNum}`}
                              className={`transition-colors ${
                                isWinningRow
                                  ? 'bg-[#4ade80] font-black ring-2 ring-[#15803d]'
                                  : rIdx % 2 === 0
                                  ? 'bg-white'
                                  : 'bg-orange-50/40'
                              }`}
                            >
                              {/* Row leader label */}
                              <td
                                className={`p-1.5 border border-orange-200 font-black text-xs ${
                                  isWinningRow ? 'bg-[#15803d] text-white font-black' : 'text-orange-950'
                                }`}
                              >
                                {isWinningRow ? `★ ${rowNum}` : rowNum}
                              </td>

                              {/* Cells */}
                              {item.sheet75Snapshot?.columns.map((col) => {
                                const cell = col.cells.find((c) => c.rowNumber === rowNum);
                                const hasPlayer = cell && (cell.playerName || cell.playerId);

                                return (
                                  <td
                                    key={`cell-${col.id}-${rowNum}`}
                                    className={`p-1 border border-orange-200 ${
                                      col.hasRedDividerRight ? 'border-r-2 border-r-red-500' : ''
                                    } ${isWinningRow ? 'bg-[#4ade80]' : ''}`}
                                  >
                                    {hasPlayer ? (
                                      <div
                                        className={`py-1 px-1.5 rounded-lg text-[10.5px] font-bold truncate max-w-[120px] mx-auto shadow-2xs border ${
                                          isWinningRow ? 'bg-white text-emerald-950 ring-1 ring-emerald-600 font-black' : ''
                                        }`}
                                        style={{
                                          backgroundColor: isWinningRow ? '#ffffff' : cell.color || '#fef08a',
                                          color: '#1f2937',
                                          borderColor: 'rgba(0,0,0,0.1)',
                                        }}
                                      >
                                        {cell.playerName || 'Jugador'}
                                      </div>
                                    ) : (
                                      <span className="text-[10px] text-orange-900/30 font-medium italic">
                                        -
                                      </span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* BOTTOM PLAYER SUMMARY TABLE (GANO, DEBE, TOTAL) */}
                  {(() => {
                    const summaryList = item.playerSummarySnapshot || item.sheet75Snapshot?.playerSummaryList || [];
                    if (summaryList.length === 0) return null;

                    return (
                      <div className="mt-4 border-2 border-black rounded-xl overflow-hidden bg-slate-50 shadow-xs">
                        <div className="bg-[#581c87] text-white px-3 py-1.5 border-b-2 border-black flex items-center justify-between">
                          <span className="text-xs font-black uppercase tracking-wider text-yellow-300">
                            Resumen de Jugadores • GANO, DEBE y TOTAL
                          </span>
                          <span className="text-[10.5px] font-bold text-purple-200">
                            {summaryList.length} jugadores en esta partida
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-center border-collapse text-xs">
                            <thead>
                              <tr className="bg-[#d8b4fe] text-purple-950 font-black text-[11px] border-b-2 border-black">
                                <th className="p-2 text-left border-r-2 border-black">NOMBRE</th>
                                <th className="p-2 border-r-2 border-black bg-[#fde047] text-amber-950">GANO</th>
                                <th className="p-2 border-r-2 border-black bg-[#fef08a] text-amber-950">DEBE</th>
                                <th className="p-2 bg-[#facc15] text-amber-950">TOTAL</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black/40">
                              {summaryList.map((p, pIdx) => {
                                const isNeg = (p.total || 0) < 0;
                                const isPos = (p.total || 0) > 0;
                                return (
                                  <tr key={p.id || pIdx} className={`hover:bg-amber-50/50 ${pIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                    <td className="p-2 text-left font-black text-slate-900 border-r-2 border-black uppercase text-xs">
                                      {p.name}
                                    </td>
                                    <td className="p-2 font-mono font-black text-emerald-800 border-r-2 border-black">
                                      {currency}{Number(p.totalGano || p.currentWon || 0).toFixed(2)}
                                    </td>
                                    <td className="p-2 font-mono font-black text-rose-800 border-r-2 border-black">
                                      {currency}{Number(p.debe || 0).toFixed(2)}
                                    </td>
                                    <td className={`p-2 font-mono font-black text-xs ${isNeg ? 'text-rose-700 bg-rose-50' : isPos ? 'text-emerald-700 bg-emerald-50' : 'text-slate-900'}`}>
                                      {currency}{Number(p.total || 0).toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : item.sheet90Snapshot ? (
                /* If it's a Traditional 90-Ball Triples Sheet */
                <div className="space-y-4">
                  {/* Dynamic Planillas Side by Side */}
                  {(() => {
                    const snap = item.sheet90Snapshot!;
                    const allTables = snap.tables && snap.tables.length > 0
                      ? snap.tables
                      : [snap.table1, snap.table2].filter(Boolean);

                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {allTables.map((table, tIdx) => {
                          const tableNum = table.tableNumber || tIdx + 1;
                          return (
                            <div key={`snap_tbl_${tableNum}_${tIdx}`} className="bg-white p-3 sm:p-4 rounded-2xl border border-orange-200 shadow-sm space-y-2.5">
                              <div className="flex items-center justify-between border-b border-orange-100 pb-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-xs">
                                    {tableNum}
                                  </span>
                                  <h4 className="text-sm font-black text-orange-950">
                                    Planilla #{tableNum} ({table.rows.length} Triples)
                                  </h4>
                                </div>
                                <span className="text-xs font-bold text-orange-800">
                                  Premio: {currency}{(table.prize || 25).toFixed(2)}
                                </span>
                              </div>

                              <div className="space-y-1 max-h-[450px] overflow-y-auto pr-1">
                                {table.rows.map((row) => {
                                  const isWinRow = item.tableNumber === tableNum && item.rowLeader === row.rowNumber;
                                  return (
                                    <div
                                      key={`tbl${tableNum}_r${row.rowNumber}`}
                                      className={`flex items-center justify-between p-1.5 rounded-xl border text-xs ${
                                        isWinRow
                                          ? 'bg-[#4ade80] border-[#15803d] ring-2 ring-[#15803d] font-black text-black shadow-xs'
                                          : 'bg-[#fffaf5] border-orange-200'
                                      }`}
                                    >
                                      <span className="w-6 text-[10px] font-black text-orange-900">
                                        #{row.rowNumber}
                                      </span>
                                      <div className="flex items-center gap-1.5">
                                        {row.numbers.map((num) => {
                                          const isHit = drawnSet.has(num);
                                          const isWinningBall = num === item.ballNumber;
                                          return (
                                            <span
                                              key={num}
                                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[11px] border ${
                                                isWinningBall
                                                  ? 'bg-amber-500 text-white border-amber-600 ring-2 ring-amber-300'
                                                  : isHit
                                                  ? 'bg-emerald-500 text-white border-emerald-600 font-black'
                                                  : 'bg-white text-orange-950 border-orange-200'
                                              }`}
                                            >
                                              {num}
                                            </span>
                                          );
                                        })}
                                      </div>
                                      <span className="text-[10px] font-bold text-orange-900 truncate max-w-[90px]">
                                        {row.playerName || 'Libre'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-white border border-dashed border-orange-200 text-center space-y-2">
                  <Table2 className="w-8 h-8 text-orange-400 mx-auto" />
                  <p className="text-sm font-bold text-orange-950">
                    Planilla registrada para Partida #{item.round}
                  </p>
                  <p className="text-xs text-orange-900/60 max-w-sm mx-auto">
                    Los datos financieros y de bolas de esta partida están guardados. Las nuevas partidas
                    guardarán su propia fotocopia completa del diseño de planilla.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BALLS PLAYED IN THIS MATCH */}
          {activeTab === 'balls' && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-orange-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-orange-100 pb-2">
                <div>
                  <h4 className="text-sm font-black text-orange-950 flex items-center gap-1.5">
                    <ListOrdered className="w-4 h-4 text-orange-600" />
                    Bolas extraídas en orden durante la Partida #{item.round}
                  </h4>
                  <p className="text-xs text-orange-900/70">
                    Total: {drawnBalls.length} bolas jugadas hasta cantar Bingo en el número{' '}
                    <strong className="text-orange-600 font-black">{item.ballNumber}</strong>
                  </p>
                </div>
              </div>

              {drawnBalls.length === 0 ? (
                <p className="text-xs text-orange-900/60 italic py-4 text-center">
                  No se registraron bolas individuales para esta partida manual.
                </p>
              ) : (
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2">
                  {drawnBalls.map((num, idx) => {
                    const isWinningBall = num === item.ballNumber;
                    const ballLetter = item.sheetType !== 'traditional-90' ? getBingo75Letter(num) : undefined;
                    const badgeCol = getBallBadgeColor(num);

                    return (
                      <div
                        key={`${num}-${idx}`}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                          isWinningBall
                            ? 'bg-amber-100 border-amber-500 ring-2 ring-amber-400 font-black scale-105 shadow-md'
                            : 'bg-[#fffaf5] border-orange-200 shadow-2xs'
                        }`}
                      >
                        <span className="text-[9px] text-orange-900/60 font-mono font-bold mb-0.5">
                          #{idx + 1}
                        </span>
                        <div
                          className={`w-8 h-8 rounded-full bg-gradient-to-tr ${badgeCol} flex flex-col items-center justify-center font-black text-xs shadow-xs border`}
                        >
                          {ballLetter && (
                            <span className="text-[7px] uppercase leading-none opacity-90">{ballLetter}</span>
                          )}
                          <span className="leading-none">{num}</span>
                        </div>
                        {isWinningBall && (
                          <span className="text-[8px] font-black uppercase text-amber-800 mt-1">
                            ¡Bingo!
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BOLILLERO SNAPSHOT AT BINGO */}
          {activeTab === 'cage' && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-orange-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-orange-100 pb-2">
                <div>
                  <h4 className="text-sm font-black text-orange-950 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-orange-600" />
                    Captura Fotográfica del Bolillero al momento de cantar Bingo - Partida #{item.round}
                  </h4>
                  <p className="text-xs text-orange-900/70">
                    Captura fotográfica exacta del tablero y esfera en el momento que se cantó bingo en la bola{' '}
                    <strong className="text-orange-600 font-black">{item.ballNumber}</strong>
                  </p>
                </div>
                {item.cageSnapshotImage && (
                  <a
                    href={item.cageSnapshotImage}
                    download={`bolillero_partida_${item.round}.png`}
                    className="py-1.5 px-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black shadow-xs flex items-center gap-1.5 self-start cursor-pointer active:scale-95"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar Foto</span>
                  </a>
                )}
              </div>

              {item.cageSnapshotImage ? (
                <div className="flex flex-col items-center justify-center p-2 bg-[#fffaf5] rounded-2xl border border-orange-200">
                  <img
                    src={item.cageSnapshotImage}
                    alt={`Bolillero al cantar Bingo - Partida #${item.round}`}
                    className="max-h-[60vh] w-auto object-contain rounded-xl shadow-md border border-orange-300"
                  />
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-orange-50/50 border border-dashed border-orange-200 text-center space-y-2">
                  <Camera className="w-8 h-8 text-orange-400 mx-auto" />
                  <p className="text-sm font-bold text-orange-950">
                    Sin foto del bolillero guardada
                  </p>
                  <p className="text-xs text-orange-900/60 max-w-sm mx-auto">
                    Esta partida fue registrada antes de la activación de la captura fotográfica automática del bolillero.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 bg-[#fff1e6] border-t border-orange-200 flex items-center justify-between flex-shrink-0">
          <div className="text-[11px] text-orange-900/80 font-bold">
            Partida #{item.round} • {item.timestamp}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black text-xs transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            Cerrar Planilla
          </button>
        </div>
      </div>
    </div>
  );
};
