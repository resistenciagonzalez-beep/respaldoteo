/**
 * Planilla 90: botones de la barra (tamaño, jugadores, ocultar barra, resultados, limpiar).
 * Se separó de BingoTraditional90Sheet.tsx sin cambiar su contenido ni su funcionamiento.
 */
import React from 'react';
import {
  Users,
  Eye,
  EyeOff,
  ChevronUp,
  Printer,
  Trophy,
  Layers,
  Play,
  Trash2,
} from 'lucide-react';

export interface Sheet90ToolbarProps {
  handleSetDensity: (newDensity: 'ultra' | 'compact' | 'mini' | 'standard') => void;
  sheetDensity: 'ultra' | 'compact' | 'mini' | 'standard';
  setShowPlayersBar: React.Dispatch<React.SetStateAction<boolean>>;
  showPlayersBar: boolean;
  onToggleBuilderHeaders: (() => void) | undefined;
  areBuilderHeadersHidden: boolean;
  handleToggleToolbar: () => void;
  handleShowPreviousGameResults: () => void;
  onOpenSavedGamesGallery: (() => void) | undefined;
  savedGamesCount: number | undefined;
  onStartNewGame: (() => void) | undefined;
  setClearTarget: React.Dispatch<React.SetStateAction<number | 'all' | null>>;
}

export const Sheet90Toolbar: React.FC<Sheet90ToolbarProps> = ({
  handleSetDensity,
  sheetDensity,
  setShowPlayersBar,
  showPlayersBar,
  onToggleBuilderHeaders,
  areBuilderHeadersHidden,
  handleToggleToolbar,
  handleShowPreviousGameResults,
  onOpenSavedGamesGallery,
  savedGamesCount,
  onStartNewGame,
  setClearTarget,
}) => {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Density Buttons */}
      <div className="flex items-center gap-0.5 bg-[#fffaf5] p-0.5 rounded-xl border border-orange-200">
        <button
          type="button"
          onClick={() => handleSetDensity('ultra')}
          className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all ${
            sheetDensity === 'ultra'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-orange-950 hover:bg-orange-100'
          }`}
          title="Densidad Ultra (Máxima compactación vertical para que quepan las 30 filas completas en un solo plano de pantalla)"
        >
          Ultra
        </button>
        <button
          type="button"
          onClick={() => handleSetDensity('compact')}
          className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all ${
            sheetDensity === 'compact'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-orange-950 hover:bg-orange-100'
          }`}
          title="Densidad Compacta"
        >
          Compacto
        </button>
        <button
          type="button"
          onClick={() => handleSetDensity('mini')}
          className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all ${
            sheetDensity === 'mini'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-orange-950 hover:bg-orange-100'
          }`}
          title="Densidad Mini"
        >
          Mini
        </button>
        <button
          type="button"
          onClick={() => handleSetDensity('standard')}
          className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all ${
            sheetDensity === 'standard'
              ? 'bg-orange-600 text-white shadow-xs'
              : 'text-orange-950 hover:bg-orange-100'
          }`}
          title="Densidad Normal"
        >
          Normal
        </button>
      </div>

      {/* Toggle Players Bar */}
      <button
        type="button"
        onClick={() => setShowPlayersBar(!showPlayersBar)}
        className={`px-2 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 border ${
          showPlayersBar
            ? 'bg-orange-100 text-orange-950 border-orange-200'
            : 'bg-orange-500 text-white border-orange-600'
        }`}
        title={showPlayersBar ? 'Ocultar barra de jugadores' : 'Mostrar barra de jugadores'}
      >
        <Users className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Jugadores</span>
      </button>

      {/* Immersive / Builder Headers Toggle */}
      {onToggleBuilderHeaders && (
        <button
          type="button"
          onClick={onToggleBuilderHeaders}
          className={`px-2 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1 border cursor-pointer ${
            areBuilderHeadersHidden
              ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
              : 'bg-orange-50 hover:bg-orange-100 text-orange-950 border-orange-200'
          }`}
          title={areBuilderHeadersHidden ? 'Mostrar encabezados superiores' : 'Ocultar cabeceras superiores para mayor espacio vertical'}
        >
          {areBuilderHeadersHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span className="hidden lg:inline">{areBuilderHeadersHidden ? 'Mostrar Menú' : 'Modo Inmersivo'}</span>
        </button>
      )}

      {/* Ocultar Barra de Opciones Toggle Button */}
      <button
        type="button"
        onClick={handleToggleToolbar}
        className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-black transition-all border border-orange-300 shadow-2xs cursor-pointer active:scale-95"
        title="Ocultar barra de opciones para ver las planillas completas verticalmente"
      >
        <ChevronUp className="w-3.5 h-3.5 text-orange-800" />
        <span className="hidden sm:inline">Ocultar Barra</span>
        <span className="sm:hidden">Ocultar</span>
      </button>

      {/* Print */}
      <button
        type="button"
        onClick={() => window.print()}
        className="px-2.5 py-1 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95"
        title="Imprimir planillas de juego"
      >
        <Printer className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Imprimir</span>
      </button>

      {/* Resultados Partida Anterior */}
      <button
        type="button"
        onClick={handleShowPreviousGameResults}
        className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-amber-950 font-black text-xs border border-amber-600 shadow-xs flex items-center gap-1 cursor-pointer active:scale-95"
        title="Ver directamente los resultados y planilla de la partida anterior"
      >
        <Trophy className="w-3.5 h-3.5 text-amber-950 fill-amber-950/20" />
        <span className="hidden sm:inline">Resultados</span>
        <span className="sm:hidden">Resultados</span>
      </button>

      {/* Partidas Guardadas */}
      {onOpenSavedGamesGallery && (
        <button
          type="button"
          onClick={onOpenSavedGamesGallery}
          className="px-2.5 py-1 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95 border border-amber-700"
          title="Abrir galería de todas las partidas guardadas con planillas completas e historial"
        >
          <Layers className="w-3.5 h-3.5 text-yellow-200" />
          <span className="hidden sm:inline">Partidas Guardadas</span>
          <span className="sm:hidden">Partidas</span>
          {savedGamesCount !== undefined && savedGamesCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-yellow-300 text-[9px] font-black">
              {savedGamesCount}
            </span>
          )}
        </button>
      )}

      {/* Nueva Partida */}
      {onStartNewGame && (
        <button
          type="button"
          onClick={onStartNewGame}
          className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95"
          title="Finalizar partida actual, archivar y comenzar nueva partida"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span className="hidden sm:inline">Nueva Partida</span>
        </button>
      )}

      {/* Clear All */}
      <button
        type="button"
        onClick={() => setClearTarget('all')}
        className="p-1 rounded-xl bg-orange-100 hover:bg-rose-100 text-orange-900 hover:text-rose-700 transition-all border border-orange-200 cursor-pointer"
        title="Limpiar todas las planillas"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
