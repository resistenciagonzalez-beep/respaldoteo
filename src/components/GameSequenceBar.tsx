import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GameSequenceItem, BingoMode } from '../types';
import { getBingo75Letter, getBallBadgeColor } from '../utils/ballColors';
import {
  getCurrentLocalDateKey,
  isRealSavedGameInTodaySubfolder,
  formatTime12h,
} from '../utils/savedGamesStorage';
import {
  Trophy,
  Trash2,
  Sparkles,
  X,
  Clock,
  Table2,
  Eye,
  Play,
  Layers,
  RotateCcw,
  Minimize2,
  Maximize2,
  BookmarkCheck,
  CheckCircle2,
} from 'lucide-react';

interface GameSequenceBarProps {
  sequence: GameSequenceItem[];
  todaySavedGames?: GameSequenceItem[];
  activeRowLeader?: number | null;
  onSelectRowLeader?: (rowLeader: number) => void;
  onOpenGameSnapshot?: (item: GameSequenceItem) => void;
  onAddSequenceItem?: (ballNumber: number, rowLeader?: number, ternaBall?: number) => void;
  onClearSequence?: () => void;
  onStartNewGame?: () => void;
  onSaveCurrentGame?: () => void;
  onOpenSavedGamesGallery?: () => void;
  savedGamesCount?: number;
  mode?: BingoMode;
  compact?: boolean;
  orientation?: 'vertical' | 'horizontal';
  onUndo?: () => void;
  undoCount?: number;
  onShowPreviousGameResults?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isAdmin?: boolean;
  onDeleteGameItem?: (item: GameSequenceItem) => void;
}

export const GameSequenceBar: React.FC<GameSequenceBarProps> = ({
  sequence,
  todaySavedGames = [],
  activeRowLeader,
  onSelectRowLeader,
  onOpenGameSnapshot,
  onAddSequenceItem,
  onClearSequence,
  onStartNewGame,
  onSaveCurrentGame,
  onOpenSavedGamesGallery,
  savedGamesCount,
  mode = '75',
  compact = false,
  orientation = 'vertical',
  onUndo,
  undoCount = 0,
  onShowPreviousGameResults,
  isExpanded = false,
  onToggleExpand,
  isAdmin = false,
  onDeleteGameItem,
}) => {
  // Strict Rule: ONLY real games manually saved in today's subfolder (subfolderDay === todayKey)
  // are allowed in the right-hand sequence bar. Never show invented or unsaved sequence items.
  // Games are numbered sequentially (1, 2, 3, 4...) in chronological order of completion.
  const displayedShortcuts = useMemo(() => {
    const todayKey = getCurrentLocalDateKey();
    const map = new Map<string | number, GameSequenceItem & { isSavedToday?: boolean }>();

    (todaySavedGames || []).forEach((saved) => {
      if (!saved || !isRealSavedGameInTodaySubfolder(saved, todayKey)) return;
      const key = saved.id || `${saved.timestamp || ''}_${saved.round}`;
      if (key !== undefined) {
        map.set(key, { ...saved, isSavedToday: true });
      }
    });

    const chronologicalAsc = Array.from(map.values()).sort((a, b) => {
      const timeA = (a.timestamp || '').trim();
      const timeB = (b.timestamp || '').trim();
      if (timeA && timeB && timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }
      return (a.round || 0) - (b.round || 0);
    });

    const numbered = chronologicalAsc.map((item, idx) => ({
      ...item,
      round: idx + 1,
    }));

    return numbered.sort((a, b) => b.round - a.round);
  }, [todaySavedGames]);

  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [inputTernaStr, setInputTernaStr] = useState<string>('');
  const [inputBallStr, setInputBallStr] = useState<string>('');
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<GameSequenceItem | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(inputBallStr.trim(), 10);
    const max = mode === '75' ? 75 : 90;
    if (isNaN(num) || num < 1 || num > max) return;

    const rowLeader = mode === '75' ? ((num - 1) % 15) + 1 : ((num - 1) % 10) + 1;
    const ternaNum = parseInt(inputTernaStr.trim(), 10);
    if (onAddSequenceItem) {
      onAddSequenceItem(num, rowLeader, !isNaN(ternaNum) ? ternaNum : undefined);
    }
    setInputBallStr('');
    setInputTernaStr('');
    setShowAddModal(false);
  };

  const handleItemClick = (item: GameSequenceItem) => {
    const row =
      item.rowLeader ||
      (mode === '75'
        ? ((item.ballNumber - 1) % 15) + 1
        : ((item.ballNumber - 1) % 10) + 1);

    if (onSelectRowLeader) {
      onSelectRowLeader(row);
    }
    if (onOpenGameSnapshot) {
      onOpenGameSnapshot(item);
    }
  };

  // Helper to render modals directly onto document.body via Portal to guarantee they stay in front of everything
  const renderModals = () => {
    if (typeof document === 'undefined') return null;

    return createPortal(
      <>
        {/* Modal to manually add a winning bingo number */}
        {showAddModal && (
          <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-2xl p-4 max-w-xs w-full shadow-2xl space-y-3 animate-scale-up text-[#431407]">
              <div className="flex items-center justify-between border-b border-orange-200 pb-1.5">
                <h4 className="text-xs font-black text-[#431407] flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-orange-600" />
                  Registrar BINGO en Secuencia
                </h4>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="p-1 rounded-lg text-orange-700 hover:bg-orange-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleAdd} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-purple-950 uppercase tracking-wider mb-1">
                      Terna (T - Opcional):
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={mode === '75' ? 75 : 90}
                      value={inputTernaStr}
                      onChange={(e) => setInputTernaStr(e.target.value)}
                      placeholder="Ej: 14"
                      className="w-full px-2 py-1.5 rounded-xl bg-white border border-purple-300 text-sm font-black text-purple-950 text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-orange-950 uppercase tracking-wider mb-1">
                      Bingo (B):
                    </label>
                    <input
                      type="number"
                      min="1"
                      max={mode === '75' ? 75 : 90}
                      value={inputBallStr}
                      onChange={(e) => setInputBallStr(e.target.value)}
                      placeholder="Ej: 68"
                      autoFocus
                      className="w-full px-2 py-1.5 rounded-xl bg-white border border-orange-300 text-sm font-black text-orange-950 text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-black shadow-sm active:scale-95 cursor-pointer"
                  >
                    Registrar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal to confirm emptying the right-hand sequence bar */}
        {showClearModal && (
          <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#fffaf5] border-2 border-orange-300 rounded-2xl p-4 max-w-xs w-full shadow-2xl space-y-3 animate-scale-up text-[#431407]">
              <h4 className="text-xs font-black text-rose-700 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                ¿Vaciar Barra de Secuencia?
              </h4>
              <p className="text-[11px] text-orange-950 leading-normal">
                Se vaciará la barra de secuencia derecha ({displayedShortcuts.length} {displayedShortcuts.length === 1 ? 'partida' : 'partidas'} del día actual).
              </p>
              <div className="flex gap-2 pt-1 border-t border-orange-200">
                <button
                  type="button"
                  onClick={() => setShowClearModal(false)}
                  className="flex-1 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onClearSequence) onClearSequence();
                    setShowClearModal(false);
                  }}
                  className="flex-1 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-sm cursor-pointer"
                >
                  Sí, Vaciar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal to confirm deleting a single game from sequence (Admin Only) */}
        {isAdmin && itemToDelete && (
          <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-[#fffaf5] border-2 border-rose-300 rounded-2xl p-4 max-w-xs w-full shadow-2xl space-y-3 animate-scale-up text-[#431407]">
              <h4 className="text-xs font-black text-rose-700 flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                ¿Borrar Partida #{itemToDelete.round}?
              </h4>
              <p className="text-[11px] text-orange-950 leading-normal">
                Se eliminará permanentemente esta partida de la secuencia del día y de las partidas guardadas.
              </p>
              <div className="flex gap-2 pt-1 border-t border-orange-200">
                <button
                  type="button"
                  onClick={() => setItemToDelete(null)}
                  className="flex-1 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteGameItem) onDeleteGameItem(itemToDelete);
                    setItemToDelete(null);
                  }}
                  className="flex-1 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-sm cursor-pointer"
                >
                  Sí, Borrar
                </button>
              </div>
            </div>
          </div>
        )}
      </>,
      document.body
    );
  };

  // =========================================================================
  // SLIM VERTICAL ORIENTATION (Refined, slim sidebar)
  // =========================================================================
  if (orientation === 'vertical') {
    return (
      <aside className="w-full flex flex-col rounded-2xl bg-white/95 border border-orange-200 shadow-md p-2 sm:p-2.5 select-none text-[#431407]">
        {/* Header (Slim & Compact) */}
        <div className="border-b border-orange-100 pb-2 mb-2">
          <div className="flex items-center justify-between gap-1 mb-1.5">
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-2xs flex-shrink-0">
                <Trophy className="w-3 h-3 fill-white" />
              </div>
              <div>
                <h3 className="text-[11px] font-black text-[#431407] leading-none uppercase tracking-wide">
                  Secuencia / Hoy
                </h3>
              </div>
            </div>

            {displayedShortcuts.length > 0 && (
              <span
                className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-950 text-[9.5px] font-black border border-emerald-300 shadow-2xs flex items-center gap-0.5"
                title="Accesos directos a partidas guardadas y jugadas hoy"
              >
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                <span>{displayedShortcuts.length} {displayedShortcuts.length === 1 ? 'partida' : 'partidas'}</span>
              </span>
            )}
          </div>

          {/* Quick Action Buttons (Slim & Tight) */}
          <div className="flex items-center gap-1 mt-1.5">
            {onOpenSavedGamesGallery && (
              <button
                type="button"
                onClick={onOpenSavedGamesGallery}
                className="flex-1 py-1 px-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black transition-all shadow-xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer border border-amber-700"
                title="Abrir galería de todas las partidas guardadas con planillas completas e historial"
              >
                <Layers className="w-3 h-3 text-yellow-200" />
                <span className="truncate">Partidas</span>
                {savedGamesCount !== undefined && savedGamesCount > 0 && (
                  <span className="px-1 py-0.1 rounded-full bg-amber-950 text-yellow-300 text-[8.5px] font-black">
                    {savedGamesCount}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 mt-1.5">
            {onStartNewGame && (
              <button
                type="button"
                onClick={onStartNewGame}
                className="flex-1 py-1 px-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black transition-all shadow-2xs flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                title="Finalizar partida actual y comenzar una nueva"
              >
                <Play className="w-2.5 h-2.5 fill-white" />
                <span>+ Nueva</span>
              </button>
            )}

            {displayedShortcuts.length > 0 && onClearSequence && (
              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className="py-1 px-1.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white text-[10px] font-black transition-all border border-rose-200 flex items-center justify-center gap-0.5 active:scale-95 cursor-pointer"
                title="Vaciar barra de secuencia del día"
              >
                <Trash2 className="w-3 h-3" />
                <span>Vaciar</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list of rounds (Direct Shortcuts to Saved Games of the Day) */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 max-h-[600px] scrollbar-thin">
          {displayedShortcuts.length === 0 ? (
            <div className="p-3 rounded-xl bg-[#fffaf5] border border-dashed border-orange-200 text-center space-y-1 my-auto">
              <Sparkles className="w-4 h-4 text-orange-400 mx-auto" />
              <p className="text-[11px] font-bold text-orange-950 leading-tight">
                Sin partidas guardadas hoy
              </p>
              <p className="text-[9.5px] text-orange-900/60 leading-tight">
                Cada vez que guardes una partida durante el día, se creará aquí su acceso directo.
              </p>
            </div>
          ) : (
            displayedShortcuts.map((item, idx) => {
              const letter =
                item.letter || (mode === '75' && item.ballNumber > 0 ? getBingo75Letter(item.ballNumber) : undefined);
              const row =
                item.rowLeader ||
                (item.ballNumber > 0
                  ? (mode === '75'
                      ? ((item.ballNumber - 1) % 15) + 1
                      : ((item.ballNumber - 1) % 10) + 1)
                  : undefined);
              const isSelected = row !== undefined && activeRowLeader === row;
              const badgeGradient = item.ballNumber > 0 ? getBallBadgeColor(item.ballNumber, mode !== '75') : 'from-amber-600 to-orange-700 text-white border-amber-400';
              const isSaved = Boolean(item.isSavedToday || item.sheet75Snapshot || item.sheet90Snapshot);

              return (
                <div
                  key={item.id || `${item.round}_${item.ballNumber}_${idx}`}
                  onClick={() => handleItemClick(item)}
                  className={`p-1.5 rounded-xl transition-all border cursor-pointer select-none shadow-2xs relative overflow-hidden group ${
                    isSelected
                      ? 'bg-amber-100/90 border-amber-400 shadow-xs ring-1 ring-amber-400'
                      : isSaved
                      ? 'bg-gradient-to-br from-white to-emerald-50/40 border-emerald-200/90 hover:border-emerald-400 hover:shadow-xs'
                      : 'bg-[#fffaf5] border-orange-200/90 hover:bg-orange-50 hover:border-orange-300'
                  }`}
                  title={`Partida #${item.round}: Clic para abrir el acceso directo y ver la planilla completa con sus saldos y números`}
                >
                  {/* Top line: Round + Status + Time */}
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[9.5px] font-black uppercase tracking-wider text-orange-950 flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full ${isSaved ? 'bg-emerald-500 animate-pulse' : 'bg-orange-500'}`} />
                        P#{item.round}
                      </span>
                      {isSaved && (
                        <span className="text-[7.5px] px-1 py-0.2 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 font-black uppercase leading-none">
                          Guardada
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {item.timestamp && (
                        <span className="text-[8.5px] text-orange-900/60 font-semibold flex items-center gap-0.5">
                          <Clock className="w-2 h-2 text-orange-400" />
                          {formatTime12h(item.timestamp)}
                        </span>
                      )}
                      {isAdmin && onDeleteGameItem && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete(item);
                          }}
                          className="p-0.5 rounded bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 transition-colors cursor-pointer"
                          title={`Borrar Partida #${item.round} (Solo Admin)`}
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Ball + Row Info */}
                  <div className="flex items-center justify-between gap-1.5">
                    {/* Ball Circle (Slim 30px) */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr ${badgeGradient} flex flex-col items-center justify-center font-black shadow-xs border flex-shrink-0`}
                      >
                        {item.ballNumber > 0 ? (
                          <>
                            {letter && (
                              <span className="text-[7px] uppercase tracking-wider leading-none opacity-90">
                                {letter}
                              </span>
                            )}
                            <span className="text-xs leading-none">{item.ballNumber}</span>
                          </>
                        ) : (
                          <Table2 className="w-3.5 h-3.5 text-white" />
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        {row !== undefined ? (
                          <span className="text-[10px] font-black text-orange-950 truncate flex items-center gap-0.5">
                            Partida #{item.round} • Fila #{row}
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-orange-950 truncate">
                            Partida #{item.round}
                          </span>
                        )}

                        {item.winningPlayerName && (
                          <span className="text-[8.5px] font-bold text-amber-900 truncate flex items-center gap-0.5" title={`Ganador: ${item.winningPlayerName}`}>
                            <Trophy className="w-2.5 h-2.5 text-amber-600 flex-shrink-0" />
                            <span className="truncate">{item.winningPlayerName}</span>
                          </span>
                        )}

                        <span className="text-[8.5px] text-emerald-700 font-black flex items-center gap-0.5 group-hover:text-emerald-900 transition-colors mt-0.5">
                          <Eye className="w-2.5 h-2.5 text-emerald-600" />
                          <span>Ver planilla</span>
                        </span>
                      </div>
                    </div>

                    {/* Financial or Balls metric pill */}
                    <div className="flex flex-col items-end flex-shrink-0">
                      {item.totalCollected !== undefined && item.totalCollected > 0 && (
                        <span className="text-[9.5px] font-black text-emerald-800 font-mono">
                          ${Number(item.totalCollected).toFixed(2)}
                        </span>
                      )}
                      {item.totalLinesPlayed !== undefined && (
                        <span className="text-[8px] text-slate-500 font-bold">
                          {item.totalLinesPlayed} lín.
                        </span>
                      )}
                      {item.durationFormatted && (
                        <span className="text-[7.5px] text-orange-900/60 font-medium">
                          {item.durationFormatted}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Portaled Modals */}
        {renderModals()}
      </aside>
    );
  }

  // =========================================================================
  // SLIM HORIZONTAL ORIENTATION (For top/bottom bars in Arcade format)
  // =========================================================================
  return (
    <div
      className={`w-full rounded-xl border transition-all select-none ${
        compact
          ? 'py-1 px-2 bg-[#fff7ed] border-orange-200 shadow-2xs'
          : 'py-1.5 px-3 bg-gradient-to-r from-[#fff7ed] via-[#ffedd5] to-[#fed7aa] border-orange-300 shadow-xs'
      }`}
    >
      <div className="flex items-center justify-between gap-2 h-8">
        {/* Left Label */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-5 h-5 rounded-lg bg-orange-500 text-white flex items-center justify-center shadow-2xs">
            <Trophy className="w-3 h-3 fill-white" />
          </div>
          <span className="text-[11px] font-black text-orange-950 uppercase tracking-wide flex items-center gap-1">
            Secuencia / Hoy
            {displayedShortcuts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-950 text-[9px] font-black border border-emerald-300">
                {displayedShortcuts.length}
              </span>
            )}
          </span>
        </div>

        {/* Center: Scrollable Chips */}
        <div className="flex-1 flex items-center gap-1 overflow-x-auto py-0.5 px-1 scrollbar-thin">
          {displayedShortcuts.length === 0 ? (
            <div className="text-[10.5px] text-orange-900/60 italic font-medium px-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-orange-400" />
              <span>Sin partidas guardadas hoy</span>
            </div>
          ) : (
            displayedShortcuts.map((item, idx) => {
              const letter =
                item.letter || (mode === '75' && item.ballNumber > 0 ? getBingo75Letter(item.ballNumber) : undefined);
              const row =
                item.rowLeader ||
                (item.ballNumber > 0
                  ? (mode === '75'
                      ? ((item.ballNumber - 1) % 15) + 1
                      : ((item.ballNumber - 1) % 10) + 1)
                  : undefined);
              const isSelected = row !== undefined && activeRowLeader === row;
              const isSaved = Boolean(item.isSavedToday || item.sheet75Snapshot || item.sheet90Snapshot);

              return (
                <button
                  key={item.id || `${item.round}_${item.ballNumber}_${idx}`}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black transition-all flex-shrink-0 cursor-pointer shadow-2xs active:scale-95 ${
                    isSelected
                      ? 'bg-amber-500 text-white border border-amber-600 shadow-xs'
                      : isSaved
                      ? 'bg-white hover:bg-emerald-50 text-emerald-950 border border-emerald-300 hover:border-emerald-500'
                      : 'bg-white/95 hover:bg-white text-orange-950 border border-orange-300 hover:border-orange-400'
                  }`}
                  title={`Partida #${item.round}: ${item.ballNumber > 0 ? `Bola ${letter ? `${letter}-` : ''}${item.ballNumber}` : 'Planilla'} (Fila #${row || '?'}${item.winningPlayerName ? ` • ${item.winningPlayerName}` : ''}). Toca para ver planilla guardada`}
                >
                  <span className={`text-[9px] uppercase font-black ${isSaved ? 'text-emerald-700' : 'text-orange-800'}`}>
                    P{item.round}:
                  </span>
                  {item.ballNumber > 0 ? (
                    <span className="font-black text-xs text-orange-950">
                      {letter && <span className="text-[9px] mr-0.5 opacity-80">{letter}</span>}
                      {item.ballNumber}
                    </span>
                  ) : (
                    <Table2 className="w-3 h-3 text-emerald-600" />
                  )}
                  {item.tableNumber && (
                    <span className="text-[8.5px] px-1 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 font-extrabold">
                      Pl.{item.tableNumber}
                    </span>
                  )}
                  {item.winningPlayerName && (
                    <span className="text-[9px] max-w-[70px] truncate text-slate-700 font-bold hidden sm:inline">
                      {item.winningPlayerName}
                    </span>
                  )}
                  <Eye className="w-2.5 h-2.5 text-emerald-600" />
                </button>
              );
            })
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Deshacer */}
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={undoCount === 0}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all shadow-2xs flex items-center gap-1 border active:scale-95 ${
                undoCount > 0
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-500 cursor-pointer'
                  : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
              }`}
              title="Deshacer hasta 4 movimientos en la planilla (Ctrl+Z)"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span className="hidden sm:inline">Deshacer</span>
              {undoCount > 0 && (
                <span className="px-1 py-0.1 rounded-full bg-blue-800 text-white text-[9px] font-black">
                  {undoCount}
                </span>
              )}
            </button>
          )}

          {/* Resultados */}
          {onShowPreviousGameResults && (
            <button
              type="button"
              onClick={onShowPreviousGameResults}
              className="px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-amber-950 text-[10px] font-black transition-all shadow-2xs flex items-center gap-1 active:scale-95 cursor-pointer border border-amber-600"
              title="Ver directamente los resultados de la partida anterior"
            >
              <Trophy className="w-2.5 h-2.5 text-amber-950 fill-amber-950/20" />
              <span className="hidden sm:inline">Resultados</span>
            </button>
          )}

          {/* Minimizar / Expandir */}
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="px-1.5 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 text-[10px] font-black transition-all shadow-2xs flex items-center gap-1 active:scale-95 cursor-pointer"
              title={isExpanded ? 'Restaurar planilla (vista normal)' : 'Expandir planilla'}
            >
              {isExpanded ? (
                <>
                  <Minimize2 className="w-2.5 h-2.5 text-amber-900" />
                  <span className="hidden sm:inline">Minimizar</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-2.5 h-2.5 text-amber-900" />
                  <span className="hidden sm:inline">Expandir</span>
                </>
              )}
            </button>
          )}

          {onOpenSavedGamesGallery && (
            <button
              type="button"
              onClick={onOpenSavedGamesGallery}
              className="px-2 py-0.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-black transition-all shadow-2xs flex items-center gap-1 active:scale-95 cursor-pointer border border-amber-700"
              title="Abrir galería de partidas guardadas"
            >
              <Layers className="w-2.5 h-2.5 text-yellow-200" />
              <span className="hidden sm:inline">Partidas Guardadas</span>
              <span className="sm:hidden">Partidas</span>
              {savedGamesCount !== undefined && savedGamesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-yellow-300 text-[9px] font-black">
                  {savedGamesCount}
                </span>
              )}
            </button>
          )}

          {onStartNewGame && (
            <button
              type="button"
              onClick={onStartNewGame}
              className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black transition-all shadow-2xs flex items-center gap-1 active:scale-95 cursor-pointer"
              title="Finalizar partida actual y comenzar una nueva"
            >
              <Play className="w-2.5 h-2.5 fill-white" />
              <span className="hidden sm:inline">Nueva Partida</span>
            </button>
          )}

          {displayedShortcuts.length > 0 && onClearSequence && (
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="px-2 py-0.5 rounded-lg bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white text-[10px] font-black transition-all border border-rose-200 flex items-center gap-1 active:scale-95 cursor-pointer"
              title="Vaciar barra de secuencia del día"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Vaciar</span>
            </button>
          )}
        </div>
      </div>

      {/* Portaled Modals */}
      {renderModals()}
    </div>
  );
};
