import React, { useState, useMemo, useCallback, memo } from 'react';
import { Ball, GameSettings, GameSequenceItem } from '../types';
import { getBallSpec } from '../utils/ballColors';
import { MiniBallsTumbler } from './MiniBallsTumbler';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Radio,
  Trophy,
  Grid,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  Sparkles,
  Eye,
  Trash2,
  Layers,
  Gauge,
} from 'lucide-react';

interface Bolillero90SidebarProps {
  drawnBalls: Ball[];
  currentBall: Ball | null;
  onDrawBall: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onResetGame: () => void;
  settings: GameSettings;
  onUpdateSettings: (newSettings: GameSettings) => void;
  gameSequence90: GameSequenceItem[];
  onOpenGameSnapshot?: (item: GameSequenceItem) => void;
  onClearSequence90?: () => void;
  onStartNewGame?: () => void;
  totalBalls?: number;
  onOpenSavedGamesGallery?: () => void;
  savedGamesCount?: number;
  compact?: boolean;
  isSheetExpanded?: boolean;
  onToggleCollapse?: () => void;
  hideSequence?: boolean;
  isAdmin?: boolean;
  onDeleteGameItem?: (item: GameSequenceItem) => void;
}

export const Bolillero90Sidebar: React.FC<Bolillero90SidebarProps> = memo(({
  drawnBalls,
  currentBall,
  onDrawBall,
  isPlaying,
  onTogglePlay,
  onResetGame,
  settings,
  onUpdateSettings,
  gameSequence90,
  onOpenGameSnapshot,
  onClearSequence90,
  onStartNewGame,
  totalBalls = 90,
  onOpenSavedGamesGallery,
  savedGamesCount,
  compact = false,
  onToggleCollapse,
  hideSequence = false,
  isAdmin = false,
  onDeleteGameItem,
}) => {
  const [showMasterBoard, setShowMasterBoard] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [showClearSeqConfirm, setShowClearSeqConfirm] = useState<boolean>(false);

  // Set of drawn numbers
  const drawnNumbersSet = useMemo(() => new Set(drawnBalls.map((b) => b.number)), [drawnBalls]);

  // Current ball styling
  const currentSpec = useMemo(
    () => (currentBall ? getBallSpec(currentBall.number, '90', settings.theme) : null),
    [currentBall, settings.theme]
  );

  // Recent balls excluding current (last 6)
  const recentBalls = useMemo(() => drawnBalls.slice(-7, -1).reverse(), [drawnBalls]);

  const handleToggleVoice = useCallback(() => {
    onUpdateSettings({
      ...settings,
      voiceEnabled: !settings.voiceEnabled,
    });
  }, [onUpdateSettings, settings]);

  const handleToggleSfx = useCallback(() => {
    onUpdateSettings({
      ...settings,
      sfxEnabled: !settings.sfxEnabled,
    });
  }, [onUpdateSettings, settings]);

  return (
    <aside
      id="bolillero-90-sidebar"
      className={`w-full ${
        compact ? 'lg:w-60 xl:w-64 p-2 gap-2 text-xs' : 'lg:w-72 xl:w-80 p-3 gap-3'
      } flex flex-col flex-shrink-0 bg-white/95 rounded-2xl border-2 border-orange-300 shadow-md select-none text-orange-950 print:hidden transition-all`}
    >
      {/* Top Header: Bolillero 90 Live Status */}
      <div className="flex items-center justify-between border-b border-orange-100 pb-1.5 gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative w-2.5 h-2.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </div>
          <div className="min-w-0">
            <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-black tracking-wide text-orange-950 flex items-center gap-1 leading-none truncate`}>
              Bolillero 90
              <span className="text-[9px] uppercase font-bold text-orange-600 bg-orange-100 px-1 py-0.2 rounded-full border border-orange-200">
                En Vivo
              </span>
            </h3>
            {!compact && (
              <span className="text-[11px] text-orange-800/80 font-medium">
                Sincronizado con planillas 90
              </span>
            )}
          </div>
        </div>

        {/* Counter Badge & Collapse Toggle */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex flex-col items-end">
            <span className={`px-1.5 py-0.5 rounded-lg bg-orange-500 text-white font-black ${compact ? 'text-[10px]' : 'text-xs'} shadow-2xs`}>
              {drawnBalls.length}/{totalBalls}
            </span>
            {!compact && (
              <span className="text-[9.5px] text-orange-800 font-semibold mt-0.5">
                {totalBalls - drawnBalls.length} restantes
              </span>
            )}
          </div>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-1 px-1.5 rounded-lg bg-orange-100 hover:bg-orange-200 text-orange-900 border border-orange-200 text-[10px] font-black flex items-center gap-0.5 cursor-pointer transition-all active:scale-95 shadow-2xs"
              title="Ocultar panel del bolillero (puedes volver a abrirlo en cualquier momento)"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-orange-700" />
              <span>Ocultar</span>
            </button>
          )}
        </div>
      </div>

      {/* Bolillero Visual Mixer Tumbler */}
      <div className={`relative w-full ${compact ? 'h-16 sm:h-20' : 'h-24 sm:h-28'} rounded-xl overflow-hidden shadow-inner bg-slate-950 border border-slate-800 transition-all`}>
        <MiniBallsTumbler />
        {isPlaying && (
          <div className="absolute top-1.5 right-1.5 z-30">
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white text-[9px] font-black animate-pulse shadow-sm">
              <Radio className="w-2.5 h-2.5 animate-spin" />
              GIRANDO
            </span>
          </div>
        )}
      </div>

      {/* Big Ball Presentation & Current Callout */}
      <div className={`flex flex-col items-center justify-center ${compact ? 'p-1.5' : 'p-2.5'} rounded-xl bg-gradient-to-b from-orange-50/80 to-amber-100/60 border border-orange-200`}>
        {currentBall && currentSpec ? (
          <div className="flex flex-col items-center animate-ball-pop text-center">
            <div
              className="relative rounded-full flex flex-col items-center justify-center shadow-xl transition-transform"
              style={{
                width: compact ? '62px' : '78px',
                height: compact ? '62px' : '78px',
                background: currentSpec.bgGradient,
                borderColor: currentSpec.borderColor,
                borderWidth: '2px',
                borderStyle: 'solid',
                boxShadow: currentSpec.shadow,
                color: currentSpec.textColor,
              }}
            >
              {/* Glossy highlight */}
              <div className="absolute top-1 left-2.5 w-5 h-2.5 rounded-full bg-white/40 blur-[0.8px] -rotate-35 pointer-events-none" />
              <span className={`font-black ${compact ? 'text-2xl' : 'text-3xl'} leading-none drop-shadow-md`}>
                {currentBall.number}
              </span>
            </div>

            {/* Voice callout text - Solo cantando números */}
            <div className="mt-1">
              <div className={`${compact ? 'text-[11px]' : 'text-xs'} font-black text-orange-950 flex items-center justify-center gap-1`}>
                <span>Número {currentBall.number}</span>
              </div>
              {!compact && (
                settings.voiceEnabled ? (
                  <div className="flex items-center justify-center gap-1 text-[10.5px] text-emerald-700 font-bold mt-0.5">
                    <Volume2 className="w-3 h-3 text-emerald-600 animate-pulse" />
                    <span>Cantando solo números</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1 text-[10.5px] text-slate-500 font-semibold mt-0.5">
                    <VolumeX className="w-3 h-3" />
                    <span>Voz silenciada</span>
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
          <div className={`${compact ? 'py-2' : 'py-4'} text-center text-orange-900/60 flex flex-col items-center gap-1`}>
            <div className={`${compact ? 'w-8 h-8' : 'w-12 h-12'} rounded-full border-2 border-dashed border-orange-300 flex items-center justify-center text-orange-400`}>
              <Radio className={`${compact ? 'w-4 h-4' : 'w-5 h-5'}`} />
            </div>
            <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold text-orange-950`}>
              Listo para iniciar
            </span>
          </div>
        )}
      </div>

      {/* Main Extraction Controls */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={onDrawBall}
          disabled={isPlaying || drawnBalls.length >= totalBalls}
          className={`col-span-1 ${
            compact ? 'py-1.5 px-1.5 text-[10.5px] rounded-lg' : 'py-2.5 px-2 text-xs rounded-xl'
          } font-black flex items-center justify-center gap-1 transition-all shadow-md bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white disabled:opacity-50 disabled:cursor-not-allowed active:scale-98`}
          title="Extraer siguiente bola del bombo 90"
        >
          <Sparkles className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          <span>Extraer Bola</span>
        </button>

        <button
          onClick={onTogglePlay}
          disabled={drawnBalls.length >= totalBalls}
          className={`col-span-1 ${
            compact ? 'py-1.5 px-1.5 text-[10.5px] rounded-lg' : 'py-2.5 px-2 text-xs rounded-xl'
          } font-black flex items-center justify-center gap-1 transition-all shadow-md active:scale-98 text-white ${
            isPlaying
              ? 'bg-rose-600 hover:bg-rose-700 ring-2 ring-rose-400 animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-700 ring-1 ring-emerald-400'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isPlaying ? 'Pausar extracción automática' : 'Iniciar extracción automática'}
        >
          {isPlaying ? (
            <>
              <Pause className={compact ? 'w-3 h-3 fill-white' : 'w-3.5 h-3.5 fill-white'} />
              <span>Pausar</span>
            </>
          ) : (
            <>
              <Play className={compact ? 'w-3 h-3 fill-white' : 'w-3.5 h-3.5 fill-white'} />
              <span>Automático</span>
            </>
          )}
        </button>
      </div>

      {/* Selector de Velocidad (Sorteo Automático) */}
      <div
        className={`flex items-center justify-between ${
          compact ? 'px-2 py-1 rounded-lg text-[10.5px]' : 'px-2.5 py-1.5 rounded-xl text-xs'
        } bg-orange-100/60 border border-orange-200`}
      >
        <div className="flex items-center gap-1 text-orange-950 font-bold min-w-0">
          <Gauge className={`${compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-orange-600 flex-shrink-0`} />
          <span className={compact ? 'text-[10px]' : ''}>Velocidad:</span>
          <span className={`font-black text-orange-700 tabular-nums ${compact ? 'text-[10px]' : ''}`}>
            {settings.speedSeconds ?? 3}s
          </span>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {[
            { label: '5s', sec: 5.0, preset: 'slow' as const },
            { label: '3s', sec: 3.0, preset: 'normal' as const },
            { label: '2s', sec: 2.0, preset: 'fast' as const },
            { label: '1s', sec: 1.0, preset: 'turbo' as const },
          ].map((item) => {
            const isSelected = Math.abs((settings.speedSeconds ?? 3) - item.sec) < 0.2;
            return (
              <button
                key={item.sec}
                type="button"
                onClick={() => {
                  onUpdateSettings({
                    ...settings,
                    speed: item.preset,
                    speedSeconds: item.sec,
                  });
                }}
                className={`${
                  compact ? 'px-1.5 py-0.5 text-[9px] rounded' : 'px-2 py-0.5 rounded-md text-[10.5px]'
                } font-black transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-orange-500 text-white shadow-xs'
                    : 'bg-white text-orange-950 border border-orange-200 hover:bg-orange-100/70'
                }`}
                title={`Intervalo de ${item.sec} segundos por bola`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Audio & Settings Shortcuts */}
      <div
        className={`flex items-center justify-between ${
          compact ? 'px-1.5 py-1 rounded-lg text-[10px]' : 'px-2 py-1.5 rounded-xl text-xs'
        } bg-orange-100/70 border border-orange-200 font-bold`}
      >
        <button
          onClick={handleToggleVoice}
          className={`flex items-center gap-1 ${
            compact ? 'px-1.5 py-0.5 rounded-md text-[9.5px]' : 'px-2 py-1 rounded-lg'
          } transition-colors ${
            settings.voiceEnabled
              ? 'bg-emerald-500 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
          title="Activar o desactivar voz que canta las bolas"
        >
          {settings.voiceEnabled ? (
            <Volume2 className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          ) : (
            <VolumeX className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
          )}
          <span>Voz {settings.voiceEnabled ? 'ON' : 'OFF'}</span>
        </button>

        <button
          onClick={handleToggleSfx}
          className={`flex items-center gap-1 ${
            compact ? 'px-1.5 py-0.5 rounded-md text-[9.5px]' : 'px-2 py-1 rounded-lg'
          } transition-colors ${
            settings.sfxEnabled
              ? 'bg-amber-500 text-white shadow-xs'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
          title="Efectos de sonido de bolillero"
        >
          <span>Efectos {settings.sfxEnabled ? 'ON' : 'OFF'}</span>
        </button>

        {/* Reset button */}
        <button
          onClick={() => {
            if (drawnBalls.length > 0) {
              setShowResetConfirm(true);
            } else {
              onResetGame();
            }
          }}
          className={`${
            compact ? 'p-0.5 px-1 rounded-md text-[10px]' : 'p-1 rounded-lg'
          } bg-white hover:bg-rose-100 text-rose-600 border border-rose-200 transition-colors cursor-pointer`}
          title="Reiniciar Bolillero 90"
        >
          <RotateCcw className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        </button>
      </div>

      {/* Reset confirmation modal mini */}
      {showResetConfirm && (
        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 text-xs space-y-2 animate-fade-in">
          <p className="font-bold leading-tight">
            ¿Reiniciar el bolillero 90 para una nueva partida?
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-2 py-1 rounded-md bg-white border border-rose-200 text-rose-800 font-semibold"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                setShowResetConfirm(false);
                onResetGame();
              }}
              className="px-2.5 py-1 rounded-md bg-rose-600 text-white font-bold"
            >
              Sí, Reiniciar
            </button>
          </div>
        </div>
      )}

      {/* Recent Balls Strip */}
      {recentBalls.length > 0 && (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px] font-bold text-orange-900">
            <span>Últimas cantadas:</span>
            {!compact && (
              <span className="text-[10px] text-orange-700 font-medium">
                (más recientes primero)
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none">
            {recentBalls.map((b) => (
              <div
                key={b.number}
                className={`${
                  compact ? 'w-5 h-5 text-[9.5px]' : 'w-7 h-7 text-xs'
                } rounded-full flex-shrink-0 flex items-center justify-center font-black bg-gradient-to-br from-orange-400 to-amber-500 text-white shadow-xs border border-orange-300`}
                title={`Bola ${b.number}`}
              >
                {b.number}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Mini Master Board (1..90) */}
      <div className={`border border-orange-200 ${compact ? 'rounded-lg' : 'rounded-xl'} overflow-hidden bg-white`}>
        <button
          onClick={() => setShowMasterBoard(!showMasterBoard)}
          className={`w-full ${
            compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-xs'
          } flex items-center justify-between font-bold text-orange-950 hover:bg-orange-50 transition-colors`}
        >
          <span className="flex items-center gap-1 truncate">
            <Grid className={compact ? 'w-3 h-3 text-orange-500' : 'w-3.5 h-3.5 text-orange-500'} />
            Tablero Master ({drawnBalls.length}/90)
          </span>
          {showMasterBoard ? (
            <ChevronUp className={compact ? 'w-3 h-3 text-orange-600' : 'w-3.5 h-3.5 text-orange-600'} />
          ) : (
            <ChevronDown className={compact ? 'w-3 h-3 text-orange-600' : 'w-3.5 h-3.5 text-orange-600'} />
          )}
        </button>

        {showMasterBoard && (
          <div className={`p-1.5 border-t border-orange-100 bg-[#fffaf5] ${compact ? 'max-h-36' : 'max-h-48'} overflow-y-auto`}>
            <div className={`grid grid-cols-10 ${compact ? 'gap-0.5' : 'gap-1'} text-center`}>
              {Array.from({ length: 90 }, (_, i) => {
                const num = i + 1;
                const isDrawn = drawnNumbersSet.has(num);
                const isCurrent = currentBall?.number === num;
                return (
                  <div
                    key={num}
                    className={`${
                      compact ? 'h-4 text-[8px]' : 'h-5 text-[10px]'
                    } rounded flex items-center justify-center font-black transition-all ${
                      isCurrent
                        ? 'bg-amber-500 text-white ring-1 ring-amber-400 scale-105 z-10 shadow-xs'
                        : isDrawn
                        ? 'bg-orange-500 text-white font-bold'
                        : 'bg-white text-orange-950/70 border border-orange-200'
                    }`}
                  >
                    {num}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Game Sequence / Partidas 90 Section (Hidden when displayed in bottom horizontal bar) */}
      {!hideSequence && (
        <div className="border border-orange-200 rounded-xl overflow-hidden bg-white flex flex-col flex-1">
          <div className="px-2.5 py-1.5 bg-orange-100/80 border-b border-orange-200 flex items-center justify-between text-xs font-bold text-orange-950">
            <span className="flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-orange-600 fill-orange-600" />
              Partidas 90 ({gameSequence90.length})
            </span>
            <div className="flex items-center gap-1">
              {onOpenSavedGamesGallery && (
                <button
                  type="button"
                  onClick={onOpenSavedGamesGallery}
                  className="px-2 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer border border-amber-700"
                  title="Abrir galería de partidas guardadas con planillas completas"
                >
                  <Layers className="w-2.5 h-2.5 text-yellow-200" />
                  <span>Historial</span>
                  {savedGamesCount !== undefined && savedGamesCount > 0 && (
                    <span className="px-1 rounded-full bg-amber-950 text-yellow-300 text-[8px] font-black">
                      {savedGamesCount}
                    </span>
                  )}
                </button>
              )}
              {onStartNewGame && (
                <button
                  type="button"
                  onClick={onStartNewGame}
                  className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] flex items-center gap-1 shadow-2xs transition-all active:scale-95 cursor-pointer"
                  title="Guardar partida actual y comenzar una nueva"
                >
                  <Play className="w-2.5 h-2.5 fill-white" />
                  <span>+ Nueva</span>
                </button>
              )}
              {isAdmin && gameSequence90.length > 0 && onClearSequence90 && (
                <button
                  onClick={() => setShowClearSeqConfirm(true)}
                  className="text-[10px] text-rose-600 hover:text-rose-700 flex items-center gap-0.5 cursor-pointer"
                  title="Limpiar historial de partidas 90 (Solo Admin)"
                >
                  <Trash2 className="w-3 h-3" />
                  Limpiar
                </button>
              )}
            </div>
          </div>

          {isAdmin && showClearSeqConfirm && (
            <div className="p-2 bg-rose-50 border-b border-rose-200 text-rose-950 text-xs space-y-1.5">
              <p className="font-bold text-[11px]">¿Borrar historial de partidas 90?</p>
              <div className="flex justify-end gap-1.5">
                <button
                  onClick={() => setShowClearSeqConfirm(false)}
                  className="px-2 py-0.5 rounded bg-white text-rose-700 text-[10px]"
                >
                  No
                </button>
                <button
                  onClick={() => {
                    setShowClearSeqConfirm(false);
                    if (onClearSequence90) onClearSequence90();
                  }}
                  className="px-2 py-0.5 rounded bg-rose-600 text-white font-bold text-[10px]"
                >
                  Sí, borrar
                </button>
              </div>
            </div>
          )}

          <div className="p-2 flex-1 max-h-56 overflow-y-auto space-y-1.5 text-xs">
            {gameSequence90.length === 0 ? (
              <div className="py-4 text-center text-orange-900/40 text-[11px] font-medium italic">
                Aún no hay partidas de Bingo 90 registradas. Cuando se cante BINGO en el bolillero 90, se guardará aquí.
              </div>
            ) : (
              gameSequence90.map((item, idx) => (
                <div
                  key={`seq90_${item.round}_${idx}`}
                  onClick={() => onOpenGameSnapshot && onOpenGameSnapshot(item)}
                  className="p-1.5 rounded-lg border border-orange-200 hover:border-orange-400 bg-[#fffaf5] hover:bg-orange-50 cursor-pointer transition-all flex items-center justify-between gap-1 shadow-2xs group"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center font-black text-[10px] flex-shrink-0">
                      #{item.round}
                    </span>
                    <div className="min-w-0">
                      <div className="font-black text-orange-950 text-[11px] truncate flex items-center gap-1">
                        <span>Bola {item.ballNumber}</span>
                        {item.tableNumber && (
                          <span className="text-[9.5px] px-1 py-0.2 rounded bg-amber-200 text-amber-900 font-extrabold">
                            Planilla #{item.tableNumber}
                          </span>
                        )}
                      </div>
                      <div className="text-[9.5px] text-orange-800/80 truncate">
                        Fila #{item.rowLeader} • {item.winningPlayerName || 'Ganador'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[9px] text-orange-700 font-semibold">
                      {item.timestamp || item.durationFormatted}
                    </span>
                    {isAdmin && onDeleteGameItem && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteGameItem(item);
                        }}
                        className="p-1 rounded bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white border border-rose-200 transition-colors cursor-pointer"
                        title={`Borrar Partida #${item.round} (Solo Admin)`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                    <Eye className="w-3.5 h-3.5 text-orange-400 group-hover:text-orange-600" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </aside>
  );
});
