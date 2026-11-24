/**
 * Panel de admin: ventana con el detalle completo de una partida.
 * Se separó de AdminPanelModal.tsx sin cambiar su contenido ni su funcionamiento.
 */
import React from 'react';
import {
  formatTime12h,
} from '../../utils/savedGamesStorage';
import {
  X,
  CircleDot,
  Camera,
  Download,
  Table2,
  FileSpreadsheet,
  FileJson,
  Eye,
  FileDown,
  Printer,
  Edit3,
  Trash2,
} from 'lucide-react';
import {
  createDefaultSheet75,
  createDefaultSheet90,
} from '../../utils/gameSnapshotStorage';
import {
  downloadGameDirectJpg,
  downloadGameDirectPdf,
} from '../../utils/exportGameReport';
import type { GameSequenceItem } from '../../types';

export interface AdminGameDetailModalProps {
  selectedGameForDetail: GameSequenceItem;
  setSelectedGameForDetail: React.Dispatch<React.SetStateAction<GameSequenceItem | null>>;
  handleExportSinglePlanillaCSV: (game: GameSequenceItem) => void;
  handleExportSinglePlanillaJSON: (game: GameSequenceItem) => void;
  setSelectedGameForSheetView: React.Dispatch<React.SetStateAction<GameSequenceItem | null>>;
  handleOpenEditGameModal: (game: GameSequenceItem) => void;
  handleDeleteGame: (game: GameSequenceItem) => void;
}

export const AdminGameDetailModal: React.FC<AdminGameDetailModalProps> = ({
  selectedGameForDetail,
  setSelectedGameForDetail,
  handleExportSinglePlanillaCSV,
  handleExportSinglePlanillaJSON,
  setSelectedGameForSheetView,
  handleOpenEditGameModal,
  handleDeleteGame,
}) => {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#fffaf5] border-2 border-orange-300 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-[#431407]">
        {/* Detail Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-orange-100 via-amber-100 to-orange-100 border-b border-orange-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center font-black shadow-xs">
              #{selectedGameForDetail.round}
            </div>
            <div>
              <h3 className="text-base font-black text-orange-950">
                Detalle Completo - Partida #{selectedGameForDetail.round}
              </h3>
              <p className="text-xs text-orange-900/70 font-semibold">
                Modo {selectedGameForDetail.mode === '90' ? 'Bingo 90 Bolas' : 'Bingo 75 Bolas'} • {selectedGameForDetail.dailyDate || selectedGameForDetail.dateFormatted} a las {formatTime12h(selectedGameForDetail.timestamp)}
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedGameForDetail(null)}
            className="p-1.5 rounded-xl hover:bg-orange-200 text-orange-950 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Detail Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[72vh]">
          {/* Highlights Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            <div className="p-2.5 rounded-2xl bg-white border border-orange-200 shadow-xs">
              <span className="text-[10px] uppercase font-black text-orange-900/60 block">Operadora</span>
              <span className="text-xs font-black text-orange-950 truncate block mt-0.5">
                {selectedGameForDetail.operatorName || 'Principal'}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-amber-50 border border-amber-300 shadow-xs">
              <span className="text-[10px] uppercase font-black text-amber-900/70 block">Bola Ganadora</span>
              <span className="text-base font-black text-amber-950 block mt-0.5">
                {selectedGameForDetail.letter ? `${selectedGameForDetail.letter}-` : ''}{selectedGameForDetail.ballNumber}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-300 shadow-xs">
              <span className="text-[10px] uppercase font-black text-purple-900/70 block">Líneas Jugadas</span>
              <span className="text-base font-black text-purple-950 block mt-0.5 font-mono">
                {selectedGameForDetail.totalLinesPlayed || (selectedGameForDetail.mode === '90' ? 30 : 68)}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-white border border-orange-200 shadow-xs">
              <span className="text-[10px] uppercase font-black text-orange-900/60 block">Total Bolas</span>
              <span className="text-sm font-black text-orange-950 block mt-0.5">
                {selectedGameForDetail.drawnBallsPlayed?.length || selectedGameForDetail.totalBallsDrawnCount || 0}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-white border border-orange-200 shadow-xs">
              <span className="text-[10px] uppercase font-black text-orange-900/60 block">Duración</span>
              <span className="text-xs font-black text-orange-950 block mt-0.5">
                {selectedGameForDetail.durationFormatted || `${selectedGameForDetail.durationSeconds || 0}s`}
              </span>
            </div>
          </div>

          {/* Winner & Sheet Breakdown */}
          <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-xs space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-orange-100">
              <span className="text-orange-900/70 font-bold">Jugador Ganador:</span>
              <strong className="text-orange-950 font-black">{selectedGameForDetail.winningPlayerName || 'Sin asignar'}</strong>
            </div>

            {selectedGameForDetail.tableNumber && (
              <div className="flex justify-between py-1 border-b border-orange-100">
                <span className="text-orange-900/70 font-bold">Planilla / Mesa Ganadora:</span>
                <strong className="text-orange-950 font-black">Planilla #{selectedGameForDetail.tableNumber}</strong>
              </div>
            )}

            {selectedGameForDetail.rowLeader && (
              <div className="flex justify-between py-1 border-b border-orange-100">
                <span className="text-orange-900/70 font-bold">Fila / Línea Ganadora:</span>
                <strong className="text-orange-950 font-black">Línea #{selectedGameForDetail.rowLeader}</strong>
              </div>
            )}

            <div className="flex justify-between py-1">
              <span className="text-orange-900/70 font-bold">Correo de la Operadora:</span>
              <span className="text-orange-900/80 font-mono text-[11px]">{selectedGameForDetail.operatorEmail || 'No registrado'}</span>
            </div>
          </div>

          {/* Complete sequence of balls extracted in order */}
          <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-orange-950 tracking-wider flex items-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5 text-orange-600" />
                <span>Secuencia Completa de Bolas Cantadas (en orden):</span>
              </span>
              <span className="text-[11px] text-orange-900/60 font-bold">
                {selectedGameForDetail.drawnBallsPlayed?.length || 0} bolas
              </span>
            </div>

            {(!selectedGameForDetail.drawnBallsPlayed || selectedGameForDetail.drawnBallsPlayed.length === 0) ? (
              <p className="text-xs text-orange-900/60 italic py-2">No se guardó el registro de bolas individuales para esta partida.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 bg-orange-50/50 rounded-xl border border-orange-200/60">
                {selectedGameForDetail.drawnBallsPlayed.map((num, idx) => {
                  const isWinning = num === selectedGameForDetail.ballNumber;
                  return (
                    <div
                      key={idx}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shadow-xs transition-all ${
                        isWinning
                          ? 'bg-amber-500 text-white ring-2 ring-amber-400 font-black scale-110'
                          : 'bg-white text-orange-950 border border-orange-300'
                      }`}
                      title={`Orden #${idx + 1}: Bola ${num}${isWinning ? ' (BOLA GANADORA)' : ''}`}
                    >
                      {num}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bolillero Snapshot Section (Captura del bolillero al momento de cantar bingo) */}
          {selectedGameForDetail.cageSnapshotImage ? (
            <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-orange-950 tracking-wider flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-orange-600" />
                  <span>Captura Fotográfica del Bolillero al Hacer Bingo:</span>
                </span>
                <a
                  href={selectedGameForDetail.cageSnapshotImage}
                  download={`bolillero_partida_${selectedGameForDetail.round}.png`}
                  className="text-[11px] font-bold text-orange-600 hover:text-orange-700 underline flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Descargar Foto</span>
                </a>
              </div>
              <div className="relative rounded-2xl overflow-hidden border border-orange-200 bg-orange-950/5 flex items-center justify-center p-2">
                <img
                  src={selectedGameForDetail.cageSnapshotImage}
                  alt={`Bolillero Partida #${selectedGameForDetail.round}`}
                  className="max-h-72 w-auto object-contain rounded-xl shadow-xs"
                />
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-orange-50/70 border border-orange-200 text-[11px] text-orange-900/60 italic flex items-center gap-2">
              <Camera className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <span>Esta partida fue guardada antes de habilitar la captura automática del bolillero.</span>
            </div>
          )}

          {/* Complete Card Sheet / Planilla Section */}
          {(() => {
            const isBingo90 = selectedGameForDetail.mode === '90' || selectedGameForDetail.sheetType === 'traditional-90';
            const sheet75 = selectedGameForDetail.sheet75Snapshot || (!isBingo90 ? createDefaultSheet75() : null);
            const sheet90 = selectedGameForDetail.sheet90Snapshot || (isBingo90 ? createDefaultSheet90() : null);

            return (
              <div className="p-4 rounded-2xl bg-white border-2 border-orange-300 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-orange-100 pb-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
                      <Table2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs sm:text-sm font-black text-orange-950 uppercase tracking-wide">
                          Copia Completa de la Planilla Guardada
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-black border border-emerald-300">
                          Archivada
                        </span>
                      </div>
                      <p className="text-[11px] text-orange-900/70 font-semibold mt-0.5">
                        {isBingo90
                          ? 'Bingo 90 Tripletas • 30 filas por mesa'
                          : 'Bingo 75 Multiplicadores • 15 filas por columna'}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons inside the section */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleExportSinglePlanillaCSV(selectedGameForDetail)}
                      className="py-1.5 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      title="Descargar esta planilla en archivo CSV (Excel) con todas sus casillas, jugadores y precios"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Descargar CSV (Excel)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportSinglePlanillaJSON(selectedGameForDetail)}
                      className="py-1.5 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      title="Descargar la estructura completa de la planilla en JSON"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      <span>Descargar JSON</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedGameForSheetView(selectedGameForDetail)}
                      className="py-1.5 px-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      title="Abrir la planilla completa en modal interactivo con opciones de impresión"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver Planilla Completa</span>
                    </button>
                  </div>
                </div>

                {/* Financial & Sheet Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-orange-900/60 block">Recaudado Planilla</span>
                    <strong className="text-sm font-black text-orange-950 mt-0.5 block">
                      ${selectedGameForDetail.totalCollected?.toFixed(2) || '0.00'}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-orange-900/60 block">Premios Pagados</span>
                    <strong className="text-sm font-black text-orange-950 mt-0.5 block">
                      ${selectedGameForDetail.totalPrizesPaid?.toFixed(2) || '0.00'}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-orange-900/60 block">Ganancia Neta</span>
                    <strong className={`text-sm font-black mt-0.5 block ${(selectedGameForDetail.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      ${selectedGameForDetail.netProfit?.toFixed(2) || '0.00'}
                    </strong>
                  </div>
                  <div className="p-2.5 rounded-xl bg-orange-50/70 border border-orange-200 shadow-2xs">
                    <span className="text-[10px] uppercase font-bold text-orange-900/60 block">Anfitrión / Host</span>
                    <strong className="text-xs font-black text-orange-950 mt-0.5 block truncate">
                      {isBingo90 ? (sheet90?.hostName || 'Operadora') : (sheet75?.hostName || 'Operadora')}
                    </strong>
                  </div>
                </div>

                {/* Preview Table of the Sheet */}
                {isBingo90 && sheet90 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-orange-900/80">
                      <span>Mesas de Bingo 90 Guardadas:</span>
                      <span className="text-[11px] text-orange-900/60">
                        Precio por fila: ${sheet90.pricePerRow || 1.0}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 bg-orange-50/40 rounded-xl border border-orange-200/60">
                      {(sheet90.tables && sheet90.tables.length > 0 ? sheet90.tables : [sheet90.table1, sheet90.table2].filter(Boolean)).map((table, tIdx) => {
                        const tblNum = table.tableNumber || tIdx + 1;
                        const isWinTable = tblNum === selectedGameForDetail.tableNumber;
                        return (
                          <div
                            key={tblNum}
                            className={`p-2.5 rounded-xl border text-xs ${
                              isWinTable ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/40' : 'bg-white border-orange-200'
                            }`}
                          >
                            <div className="flex items-center justify-between font-black text-xs text-orange-950 border-b border-orange-100 pb-1 mb-1.5">
                              <span>Planilla #{tblNum}</span>
                              {isWinTable && (
                                <span className="text-[10px] bg-amber-500 text-white px-2 py-0.2 rounded-full font-black">
                                  ★ Ganó Aquí
                                </span>
                              )}
                              <span className="text-[10px] text-orange-900/60 font-semibold">
                                Premio: ${table.prize || 25}
                              </span>
                            </div>
                            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                              {table.rows.slice(0, 10).map((r) => {
                                const isWinRow = isWinTable && r.rowNumber === selectedGameForDetail.rowLeader;
                                return (
                                  <div
                                    key={r.rowNumber}
                                    className={`flex items-center justify-between p-1 rounded-lg text-[11px] ${
                                      isWinRow ? 'bg-amber-200/90 font-black text-amber-950 ring-1 ring-amber-400' : 'bg-orange-50/50'
                                    }`}
                                  >
                                    <span className="font-bold text-orange-900/80">F#{r.rowNumber}:</span>
                                    <span className="font-mono text-[10px] text-orange-950 font-bold">
                                      [{r.numbers.join(', ')}]
                                    </span>
                                    <span className="font-semibold truncate max-w-[90px] text-orange-950">
                                      {r.playerName || <span className="opacity-40 italic">Libre</span>}
                                    </span>
                                    {r.paid && (
                                      <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-bold">
                                        $
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {table.rows.length > 10 && (
                                <div className="text-center text-[10px] text-orange-900/60 font-semibold pt-1">
                                  + {table.rows.length - 10} filas más guardadas
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : sheet75 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-orange-900/80">
                      <span>Columnas de Multiplicadores Guardadas:</span>
                      <span className="text-[11px] text-orange-900/60">
                        Base: ${sheet75.baseCost || 0.10} • Premio: ${sheet75.basePrize || 1.35}
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto p-1.5 bg-orange-50/40 rounded-xl border border-orange-200/60">
                      {sheet75.columns.slice(0, 8).map((col) => (
                        <div key={col.id || col.colNumber} className="w-24 bg-white p-2 rounded-xl border border-orange-200 text-xs flex-shrink-0">
                          <div className="text-center font-black text-orange-950 border-b border-orange-100 pb-1 mb-1">
                            <div>{col.title || `Col ${col.colNumber}`}</div>
                            <div className="text-[9px] text-amber-700 font-bold">{col.multiplier}x</div>
                          </div>
                          <div className="space-y-1">
                            {col.cells.slice(0, 5).map((cell) => {
                              const isWinLine = cell.rowNumber === selectedGameForDetail.rowLeader;
                              return (
                                <div
                                  key={cell.rowNumber}
                                  className={`p-1 rounded text-[10px] truncate ${
                                    isWinLine ? 'bg-amber-200 font-black text-amber-950 ring-1 ring-amber-400' : 'bg-orange-50/70 text-orange-900/80'
                                  }`}
                                  title={`Fila ${cell.rowNumber}: ${cell.playerName || 'Libre'}`}
                                >
                                  <span className="font-mono font-bold">#{cell.rowNumber}</span>{' '}
                                  <span>{cell.playerName || '-'}</span>
                                </div>
                              );
                            })}
                            {col.cells.length > 5 && (
                              <div className="text-center text-[9px] text-orange-900/50">
                                +{col.cells.length - 5}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </div>

        {/* Detail Modal Footer */}
        <div className="px-5 py-3 bg-orange-50 border-t border-orange-200 flex flex-col sm:flex-row items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => downloadGameDirectJpg(selectedGameForDetail)}
              className="py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Descargar comprobante de esta partida como imagen JPG"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Descargar JPG</span>
            </button>

            <button
              type="button"
              onClick={() => downloadGameDirectPdf(selectedGameForDetail)}
              className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Descargar comprobante de esta partida como documento PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Descargar PDF</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportSinglePlanillaCSV(selectedGameForDetail)}
              className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Descargar copia de la planilla en archivo CSV para Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Descargar CSV</span>
            </button>

            <button
              type="button"
              onClick={() => handleExportSinglePlanillaJSON(selectedGameForDetail)}
              className="py-2 px-3 rounded-xl bg-amber-700 hover:bg-amber-600 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Descargar copia completa de la planilla en archivo JSON"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>Planilla (JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleOpenEditGameModal(selectedGameForDetail);
              }}
              className="py-2 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Modificar datos o jugadores de esta partida"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Editar Partida</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleDeleteGame(selectedGameForDetail);
                setSelectedGameForDetail(null);
              }}
              className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Eliminar este registro de partida permanentemente"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Borrar Partida</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedGameForDetail(null)}
            className="py-2 px-4 rounded-xl bg-orange-200 hover:bg-orange-300 text-orange-950 font-bold text-xs transition-all cursor-pointer"
          >
            Cerrar Detalle
          </button>
        </div>
      </div>
    </div>
  );
};
