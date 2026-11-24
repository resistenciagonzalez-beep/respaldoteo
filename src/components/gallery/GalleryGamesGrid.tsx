/**
 * Galería: cuadrícula de tarjetas de partidas guardadas.
 * Se separó de SavedGamesGalleryModal.tsx sin cambiar su contenido ni su funcionamiento.
 */
import React from 'react';
import {
  getBingo75Letter,
  getBallBadgeColor,
} from '../../utils/ballColors';
import {
  getGameLines,
  formatTime12h,
} from '../../utils/savedGamesStorage';
import {
  Trash2,
  Folder,
  Calendar,
  Clock,
  Trophy,
  Eye,
  Maximize2,
  FileDown,
  Printer,
} from 'lucide-react';
import {
  downloadGameDirectJpg,
  downloadGameDirectPdf,
} from '../../utils/exportGameReport';
import type { GameSequenceItem } from '../../types';

export interface GalleryGamesGridProps {
  displayItems: GameSequenceItem[];
  handleOpenGameDetail: (game: GameSequenceItem) => void;
  isAdmin: boolean;
  handleRequestDeleteItem: (game: GameSequenceItem, e?: React.MouseEvent) => void;
}

export const GalleryGamesGrid: React.FC<GalleryGamesGridProps> = ({
  displayItems,
  handleOpenGameDetail,
  isAdmin,
  handleRequestDeleteItem,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {displayItems.map((game, idx) => {
        const is90 = game.mode === '90' || game.sheetType === 'traditional-90';
        const letter = game.letter || (!is90 ? getBingo75Letter(game.ballNumber) : undefined);
        const currency = game.currency || '$';
        const ballsCount = game.totalBallsDrawnCount || (game.drawnBallsPlayed ? game.drawnBallsPlayed.length : 0);
        const exactGameLines = getGameLines(game);

        return (
          <div
            key={game.id || `${game.round}_${game.timestamp}_${idx}`}
            onClick={() => handleOpenGameDetail(game)}
            className="bg-white border-2 border-orange-200 hover:border-orange-500 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer relative group flex flex-col justify-between overflow-hidden"
          >
            {/* Top Header Card */}
            <div>
              <div className="flex items-center justify-between border-b border-orange-100 pb-2.5 mb-2.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-500 text-white font-black text-xs shadow-2xs">
                    Ronda #{game.round}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider ${
                      is90 ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {is90 ? 'Bingo 90 Triples' : 'Bingo 75'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md font-bold text-[10px] bg-purple-100 text-purple-900 border border-purple-200 flex items-center gap-0.5" title="Total de líneas jugadas en esta partida">
                    <span>🎯</span>
                    <strong>{exactGameLines} líneas</strong>
                  </span>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleRequestDeleteItem(game, e)}
                      className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 transition-all shadow-2xs cursor-pointer flex items-center gap-1 active:scale-95"
                      title="Eliminar registro de esta partida"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-black">Borrar</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Operator and Subfolder Time Tag */}
              <div className="mb-2 flex items-center justify-between gap-1 text-[11px] font-bold text-orange-900/80 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200 flex-wrap">
                <div className="flex items-center gap-1 min-w-0">
                  <Folder className="w-3 h-3 text-amber-600 flex-shrink-0" />
                  <span className="truncate">Operadora: <strong>{game.operatorName || 'Operadora Principal'}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-[10px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded font-mono font-bold border border-amber-300" title="Subcarpeta por fecha (dailyDate)">
                    📁 {game.dailyDate}
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded font-mono font-bold border border-blue-300" title="Hora exacta de guardado">
                    ⏰ {formatTime12h(game.timestamp)}
                  </span>
                </div>
              </div>

              {/* Main Winning Ball & Key Info */}
              <div className="flex items-center gap-3.5 mb-3">
                {/* Giant winning ball badge */}
                <div
                  className={`w-14 h-14 rounded-full bg-gradient-to-br ${getBallBadgeColor(
                    game.ballNumber,
                    is90
                  )} border-2 flex flex-col items-center justify-center shadow-md flex-shrink-0`}
                >
                  {letter && (
                    <span className="text-[10px] font-black uppercase leading-none opacity-90">
                      {letter}
                    </span>
                  )}
                  <span className="text-xl font-black leading-none">{game.ballNumber}</span>
                </div>

                {/* Round Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                    <span className="truncate">{game.dateFormatted || 'Fecha no registrada'}</span>
                    <span>•</span>
                    <span className="truncate">{formatTime12h(game.timestamp)}</span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span>Duración: {game.durationFormatted || '0m 30s'}</span>
                  </div>

                  <div className="text-xs font-semibold text-slate-700 mt-1">
                    <span>Bolas cantadas: </span>
                    <strong className="text-slate-900">{ballsCount}</strong>
                    <span className="text-[11px] text-slate-500">
                      /{is90 ? 90 : 75} ({Math.round((ballsCount / (is90 ? 90 : 75)) * 100)}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Winning Player / Row if recorded */}
              {(game.winningPlayerName || game.rowLeader) && (
                <div className="mb-3 px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center gap-1.5 text-xs">
                  <Trophy className="w-3.5 h-3.5 text-amber-600 fill-amber-600 flex-shrink-0" />
                  <span className="font-bold text-amber-950 truncate">
                    {game.winningPlayerName
                      ? `Ganador: ${game.winningPlayerName}`
                      : `Fila premiada: #${game.rowLeader}`}
                  </span>
                </div>
              )}
            </div>

            {/* Financials & Action Footer */}
            <div className="border-t border-orange-100 pt-2.5">
              <div className="grid grid-cols-3 gap-1 text-center mb-2.5">
                <div className="bg-slate-50 rounded-lg p-1 border border-slate-200">
                  <span className="text-[9px] font-bold text-slate-500 block uppercase">Recaudo</span>
                  <span className="text-xs font-black text-slate-900">
                    {currency}{Number(game.totalCollected || 0).toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-lg p-1 border border-slate-200">
                  <span className="text-[9px] font-bold text-slate-500 block uppercase">Premios</span>
                  <span className="text-xs font-black text-amber-700">
                    {currency}{Number(game.totalPrizesPaid || 0).toFixed(2)}
                  </span>
                </div>
                <div className="bg-emerald-50 rounded-lg p-1 border border-emerald-200">
                  <span className="text-[9px] font-bold text-emerald-700 block uppercase">Beneficio</span>
                  <span className="text-xs font-black text-emerald-800">
                    {currency}{Number(game.netProfit || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Actions: View Sheet + Export JPG/PDF */}
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenGameDetail(game);
                  }}
                  className="w-full py-1.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm hover:shadow transition-all cursor-pointer active:scale-98"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Ver Planilla Completa</span>
                  <Maximize2 className="w-3 h-3 text-orange-200 ml-1" />
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadGameDirectJpg(game);
                    }}
                    className="flex-1 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-900 font-bold text-[11px] flex items-center justify-center gap-1 border border-orange-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                    title="Descargar comprobante en JPG (imagen)"
                  >
                    <FileDown className="w-3 h-3 text-orange-700" />
                    <span>Descargar JPG</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadGameDirectPdf(game);
                    }}
                    className="flex-1 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-[11px] flex items-center justify-center gap-1 border border-amber-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                    title="Descargar documento en PDF"
                  >
                    <Printer className="w-3 h-3 text-amber-700" />
                    <span>Descargar PDF</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
