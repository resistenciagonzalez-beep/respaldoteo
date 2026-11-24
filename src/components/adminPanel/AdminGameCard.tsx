/**
 * Panel de admin: tarjeta de una partida en la lista de partidas guardadas.
 * Se separó de AdminPanelModal.tsx sin cambiar su contenido ni su funcionamiento.
 */
import React from 'react';
import {
  Gamepad2,
  Table2,
  Trophy,
  Calendar,
  FileDown,
  Printer,
  Eye,
  Edit3,
  FileSpreadsheet,
  FileJson,
  Trash2,
} from 'lucide-react';
import {
  formatTime12h,
} from '../../utils/savedGamesStorage';
import {
  downloadGameDirectJpg,
  downloadGameDirectPdf,
} from '../../utils/exportGameReport';
import type { GameSequenceItem } from '../../types';

export interface AdminGameCardProps {
  game: GameSequenceItem;
  isBingo90: boolean;
  linesCount: number;
  ballsCount: number;
  setSelectedGameForDetail: React.Dispatch<React.SetStateAction<GameSequenceItem | null>>;
  setSelectedGameForSheetView: React.Dispatch<React.SetStateAction<GameSequenceItem | null>>;
  handleOpenEditGameModal: (game: GameSequenceItem) => void;
  handleExportSinglePlanillaCSV: (game: GameSequenceItem) => void;
  handleExportSinglePlanillaJSON: (game: GameSequenceItem) => void;
  handleDeleteGame: (game: GameSequenceItem) => void;
}

export const AdminGameCard: React.FC<AdminGameCardProps> = ({
  game,
  isBingo90,
  linesCount,
  ballsCount,
  setSelectedGameForDetail,
  setSelectedGameForSheetView,
  handleOpenEditGameModal,
  handleExportSinglePlanillaCSV,
  handleExportSinglePlanillaJSON,
  handleDeleteGame,
}) => {
  return (
    <div
      key={game.id}
      className="p-3.5 rounded-2xl bg-white border border-orange-200/90 hover:border-orange-300 shadow-xs transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-3"
    >
      {/* Left: Round Badge & Operator details */}
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        {/* Round and Win Ball Badge */}
        <div className="flex flex-col items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black shadow-xs flex-shrink-0 border border-white/50">
          <span className="text-[10px] uppercase font-bold tracking-wider leading-none">Ronda</span>
          <span className="text-base leading-none mt-0.5">#{game.round}</span>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm text-orange-950">
              Partida #{game.round}
            </span>

            {/* Mode badge */}
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase ${
                isBingo90
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-orange-100 text-orange-900 border-orange-300'
              }`}
            >
              {isBingo90 ? 'Bingo 90 Bolas' : 'Bingo 75 Bolas'}
            </span>

            {/* Operator Badge */}
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-300 flex items-center gap-1">
              <Gamepad2 className="w-3 h-3 text-emerald-700" />
              <span>Operadora: <strong>{game.operatorName || 'Principal'}</strong></span>
            </span>

            {/* Lines count badge */}
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-950 border border-purple-300 flex items-center gap-1 shadow-2xs">
              <span>🎯</span>
              <span><strong>{linesCount} Líneas</strong></span>
            </span>

            {/* Planilla Badge */}
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-900 border border-blue-200 flex items-center gap-1">
              <Table2 className="w-3 h-3 text-blue-600" />
              <span>Planilla Guardada</span>
            </span>
          </div>

          {/* Winning information */}
          <div className="flex items-center gap-3 text-xs text-orange-900/80 mt-1 flex-wrap">
            <span className="font-bold flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-600" />
              Bola Ganadora:{' '}
              <strong className="text-orange-950 bg-amber-100 px-1.5 py-0.2 rounded font-black border border-amber-300">
                 {game.letter ? `${game.letter}-` : ''}{game.ballNumber}
              </strong>
            </span>

            {game.winningPlayerName && (
              <span className="font-semibold">
                Ganador: <strong className="text-orange-950">{game.winningPlayerName}</strong>
              </span>
            )}

            {game.tableNumber && (
              <span className="text-[11px] text-orange-900/70">
                (Planilla #{game.tableNumber})
              </span>
            )}

            <span className="text-[11px] text-orange-900/60 font-medium">
              Total Bolas Cantadas: <strong className="text-orange-950">{ballsCount}</strong>
            </span>

            <span className="text-[11px] text-orange-900/60 font-medium">
              Duración: <strong className="text-orange-950">{game.durationFormatted || `${game.durationSeconds || 0}s`}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Right: Date, Time & Actions */}
      <div className="flex items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-orange-100 flex-shrink-0">
        <div className="text-left lg:text-right">
          <div className="flex items-center gap-1 text-[11px] text-orange-900/70 font-bold">
            <Calendar className="w-3 h-3 text-orange-600" />
            <span>{game.dailyDate || game.dateFormatted || 'Hoy'}</span>
          </div>
          <div className="text-[10px] text-orange-900/50 font-mono">
            {formatTime12h(game.timestamp)}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Download JPG button */}
          <button
            type="button"
            onClick={() => downloadGameDirectJpg(game)}
            className="py-1.5 px-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95"
            title="Descargar comprobante en JPG (imagen)"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>JPG</span>
          </button>

          {/* Download PDF button */}
          <button
            type="button"
            onClick={() => downloadGameDirectPdf(game)}
            className="py-1.5 px-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95"
            title="Descargar documento en PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          {/* View Full Detail Button */}
          <button
            type="button"
            onClick={() => setSelectedGameForDetail(game)}
            className="py-1.5 px-2.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-black border border-orange-300 transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
            title="Ver información completa de todas las bolas y datos de esta partida"
          >
            <Eye className="w-3.5 h-3.5 text-orange-700" />
            <span>Detalle</span>
          </button>

          {/* View Card Sheet Button */}
          <button
            type="button"
            onClick={() => setSelectedGameForSheetView(game)}
            className="py-1.5 px-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-950 text-xs font-black border border-blue-200 transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
            title="Ver e imprimir la copia completa de la planilla de esta partida"
          >
            <Table2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Planilla</span>
          </button>

          {/* Edit Saved Game Button (Admin only) */}
          <button
            type="button"
            onClick={() => handleOpenEditGameModal(game)}
            className="py-1.5 px-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-950 text-xs font-black border border-purple-200 transition-all flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
            title="Modificar datos de esta partida (jugador mal anotado, número de mesa, operadora o valores)"
          >
            <Edit3 className="w-3.5 h-3.5 text-purple-700" />
            <span>Editar</span>
          </button>

          {/* Download Card Sheet CSV */}
          <button
            type="button"
            onClick={() => handleExportSinglePlanillaCSV(game)}
            className="p-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            title="Descargar copia de la planilla en CSV (Excel) a tu dispositivo"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
          </button>

          {/* Download Card Sheet JSON */}
          <button
            type="button"
            onClick={() => handleExportSinglePlanillaJSON(game)}
            className="p-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            title="Descargar copia completa de la planilla en JSON a tu dispositivo"
          >
            <FileJson className="w-3.5 h-3.5 text-amber-700" />
          </button>

          {/* Delete single game button */}
          <button
            type="button"
            onClick={() => handleDeleteGame(game)}
            className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95"
            title="Eliminar permanentemente este registro de partida"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
          </button>
        </div>
      </div>
    </div>
  );
};
