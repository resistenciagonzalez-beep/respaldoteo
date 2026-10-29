import React, { useState, useMemo } from 'react';
import { Ball, BingoMode, GameSettings, SpeedPreset, AppUser, GameSequenceItem, SheetViewType, PlatformColor, GameObjectives } from '../types';
import { MiniBallsTumbler } from './MiniBallsTumbler';
import { PlatformColorBar } from './PlatformColorBar';
import {
  Volume2,
  VolumeX,
  Megaphone,
  MicOff,
  Maximize2,
  Minimize2,
  RefreshCw,
  PauseCircle,
  Zap,
  SmartphoneCharging,
  Tv2,
  Table2,
  CircleDot,
  Grid3X3,
  Settings2,
  ShieldCheck,
  LogIn,
  Layers,
} from 'lucide-react';

interface BingoEsFormatProps {
  currentBall: Ball | null;
  drawnBalls: Ball[];
  remainingBalls: number[];
  totalBalls: number;
  mode: BingoMode;
  isPlaying: boolean;
  isExtracting: boolean;
  isFinished: boolean;
  settings: GameSettings;
  isFullscreen: boolean;
  drawOrder?: 'sequential' | 'random';
  completedRowLeaders?: number[];
  ternaRowLeader?: number | null;
  ternaBallNumber?: number | null;
  currentMatchAmboRow?: number | null;
  currentMatchAmboBall?: number | null;
  gameObjectives?: GameObjectives;
  onToggleObjective?: (key: 'bingo' | 'terna' | 'ambo') => void;
  currentUser?: AppUser | null;
  gameSequence?: GameSequenceItem[];
  onAddSequenceItem?: (ballNumber: number, rowLeader?: number) => void;
  onClearSequence?: () => void;
  onToggleDrawOrder?: () => void;
  onDrawNext: () => void;
  onTogglePlay: () => void;
  onReset: () => void;
  onOpenModeSelect: () => void;
  onBingo: () => void;
  onToggleVoice: () => void;
  onToggleSfx: () => void;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
  onOpenSheetBuilder?: (sheetType?: SheetViewType) => void;
  onOpenSheet75?: () => void;
  onOpenSheet90?: () => void;
  onOpenAdmin?: () => void;
  onOpenLogin?: () => void;
  onToggleViewFormat?: () => void;
  onChangeSpeed?: (preset: SpeedPreset, seconds: number) => void;
  onOpenGameSnapshot?: (item: GameSequenceItem) => void;
  onStartNewGame?: () => void;
  onOpenSavedGamesGallery?: () => void;
  savedGamesCount?: number;
  platformColor?: PlatformColor;
  onSelectPlatformColor?: (color: PlatformColor) => void;
}

export const BingoEsFormat: React.FC<BingoEsFormatProps> = ({
  currentBall,
  drawnBalls,
  totalBalls,
  mode,
  isPlaying,
  isExtracting,
  isFinished,
  settings,
  isFullscreen,
  completedRowLeaders = [],
  ternaRowLeader = null,
  ternaBallNumber = null,
  currentMatchAmboRow = null,
  currentMatchAmboBall = null,
  gameObjectives = { bingo: true, terna: false, ambo: false },
  onToggleObjective,
  currentUser,
  onDrawNext,
  onTogglePlay,
  onReset,
  onOpenModeSelect,
  onToggleVoice,
  onToggleSfx,
  onToggleFullscreen,
  onOpenSettings,
  onOpenSheetBuilder,
  onOpenSheet75,
  onOpenSheet90,
  onOpenAdmin,
  onOpenLogin,
  onChangeSpeed,
  onOpenSavedGamesGallery,
  savedGamesCount,
  platformColor,
  onSelectPlatformColor,
}) => {
  // Default to Vertical orientation for phone recording as requested
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');

  const isAdmin = currentUser?.role === 'admin';
  const assignedMode = currentUser?.assignedMode || (isAdmin ? 'all' : (mode || '75'));

  const isPastelOrange = settings.theme === 'pastel-orange';

  // Set of drawn numbers for instant O(1) lookup
  const drawnSet = useMemo(() => new Set(drawnBalls.map((b) => b.number)), [drawnBalls]);

  // Recent 5 balls (most recent first)
  const last5Balls = drawnBalls.slice(-5).reverse();

  // Distinct vibrant colors for B-I-N-G-O letters
  const columns75 = [
    {
      letter: 'B',
      range: [1, 15] as [number, number],
      headerStyle: 'bg-gradient-to-b from-blue-600 to-blue-800 text-white border-blue-400 shadow-sm shadow-blue-950/50',
      textColor: 'text-blue-400',
    },
    {
      letter: 'I',
      range: [16, 30] as [number, number],
      headerStyle: 'bg-gradient-to-b from-rose-600 to-rose-800 text-white border-rose-400 shadow-sm shadow-rose-950/50',
      textColor: 'text-rose-400',
    },
    {
      letter: 'N',
      range: [31, 45] as [number, number],
      headerStyle: 'bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 font-black border-amber-300 shadow-sm shadow-amber-950/50',
      textColor: 'text-amber-400',
    },
    {
      letter: 'G',
      range: [46, 60] as [number, number],
      headerStyle: 'bg-gradient-to-b from-emerald-600 to-emerald-800 text-white border-emerald-400 shadow-sm shadow-emerald-950/50',
      textColor: 'text-emerald-400',
    },
    {
      letter: 'O',
      range: [61, 75] as [number, number],
      headerStyle: 'bg-gradient-to-b from-purple-600 to-purple-800 text-white border-purple-400 shadow-sm shadow-purple-950/50',
      textColor: 'text-purple-400',
    },
  ];

  // Calculate numbers that are exactly 1 ball away from completing a row to make BINGO
  const almostBingoNumbers = useMemo(() => {
    const almost = new Set<number>();
    if (mode === '75') {
      for (let r = 1; r <= 15; r++) {
        const row = [r, r + 15, r + 30, r + 45, r + 60];
        const drawnInRow = row.filter((n) => drawnSet.has(n));
        if (drawnInRow.length === 4) {
          const missing = row.find((n) => !drawnSet.has(n));
          if (missing !== undefined) {
            almost.add(missing);
          }
        }
      }
    } else if (mode === '90') {
      for (let r = 1; r <= 10; r++) {
        const row = Array.from({ length: 9 }, (_, c) => r + c * 10);
        const drawnInRow = row.filter((n) => drawnSet.has(n));
        if (drawnInRow.length === 8) {
          const missing = row.find((n) => !drawnSet.has(n));
          if (missing !== undefined) {
            almost.add(missing);
          }
        }
      }
    }
    return almost;
  }, [drawnSet, mode]);

  // Bingo 90 columns definition (9 columns of exactly 10 numbers each)
  const columns90 = [
    { label: '1-10', min: 1, max: 10 },
    { label: '11-20', min: 11, max: 20 },
    { label: '21-30', min: 21, max: 30 },
    { label: '31-40', min: 31, max: 40 },
    { label: '41-50', min: 41, max: 50 },
    { label: '51-60', min: 51, max: 60 },
    { label: '61-70', min: 61, max: 70 },
    { label: '71-80', min: 71, max: 80 },
    { label: '81-90', min: 81, max: 90 },
  ];

  // Helper for Giant Ball presentation
  const renderGiantBall = (sizeClass: string) => (
    <div
      className={`relative rounded-full flex flex-col items-center justify-center select-none transition-all shadow-xl border-4 ${
        isExtracting
          ? 'border-amber-500 shadow-amber-500/50 scale-[1.03] ring-4 ring-amber-300'
          : 'border-amber-400 shadow-amber-500/30'
      } bg-gradient-to-b from-[#fefce8] via-[#fef08a] to-[#facc15] text-[#3b1e08] ${
        !isPlaying && !isExtracting && !isFinished
          ? 'cursor-pointer active:scale-95 hover:border-amber-500'
          : 'cursor-not-allowed opacity-95'
      } ${sizeClass}`}
      onClick={!isPlaying && !isExtracting && !isFinished ? onDrawNext : undefined}
      title={
        isExtracting
          ? 'Extrayendo bola...'
          : isPlaying
          ? 'Sorteo automático en curso'
          : 'Presiona para extraer la siguiente bola'
      }
      style={{
        boxShadow: isExtracting
          ? '0 0 25px rgba(245, 158, 11, 0.45), inset 0 2px 4px rgba(255, 255, 255, 0.4)'
          : '0 10px 25px -5px rgba(234, 179, 8, 0.4), inset 0 2px 4px rgba(255, 255, 255, 0.4)',
      }}
    >
      {isExtracting ? (
        /* Mini bolitas tumbling animation before the number pops out */
        <MiniBallsTumbler />
      ) : (
        <>
          {/* Spherical glossy reflection highlight */}
          <div className="absolute top-1 left-2.5 w-6 h-3 rounded-full bg-white/40 blur-[1px] -rotate-35 pointer-events-none" />

          {/* Letter for Bingo 75 if available */}
          {currentBall?.letter && (
            <span className="text-[11px] sm:text-xs font-black text-amber-900 tracking-widest leading-none mb-0.5">
              {currentBall.letter}
            </span>
          )}

          {/* Big Number */}
          <span
            key={currentBall ? currentBall.number : 'empty'}
            className="font-black text-[#3b1e08] tracking-tighter leading-none select-none animate-ball-pop text-3xl sm:text-4xl drop-shadow-xs"
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {currentBall ? currentBall.number : totalBalls}
          </span>
        </>
      )}
    </div>
  );

  // Helper for Top Control Bar
  const renderTopBar = () => (
    <div className="w-full flex flex-wrap items-center justify-between px-2 py-1 flex-shrink-0 border-b border-amber-300/80 bg-amber-50/90 text-amber-950 gap-1 rounded-t-xl sm:rounded-t-2xl">
      {/* Grupo 1: Navegación de juego y Planillas compactas (h-7) */}
      <div className="flex items-center gap-1 flex-wrap">
        {/* Selector de Modalidad: Solo Administradoras pueden alternar; Operadoras tienen insignia fija */}
        {isAdmin ? (
          <button
            id="btn-bingo-format-back"
            onClick={onOpenModeSelect}
            className="h-7 px-2 rounded-md flex items-center gap-1 cursor-pointer active:scale-95 bg-amber-200 hover:bg-amber-300 text-amber-950 border border-amber-400 font-bold text-[11px] shadow-xs transition-all"
            title="Cambiar modalidad de juego (90 Bolas / 75 Bolas) - Acceso Administrador"
          >
            {mode === '90' ? (
              <CircleDot className="w-3.5 h-3.5 text-amber-900" />
            ) : (
              <Grid3X3 className="w-3.5 h-3.5 text-amber-900" />
            )}
            <span>{mode === '90' ? '90 Bolas' : '75 Bolas'}</span>
            <span className="text-[9px] opacity-60">▼</span>
          </button>
        ) : (
          <div
            id="badge-operator-fixed-mode"
            className="h-7 px-2.5 rounded-md flex items-center gap-1.5 bg-amber-100/90 text-amber-950 border border-amber-300 font-black text-[11px] shadow-2xs select-none"
            title={`Modo Exclusivo Asignado: Bingo ${mode === '90' ? '90 Bolas' : '75 Bolas'} (Panel Bloqueado)`}
          >
            {mode === '90' ? (
              <CircleDot className="w-3.5 h-3.5 text-amber-800" />
            ) : (
              <Grid3X3 className="w-3.5 h-3.5 text-amber-800" />
            )}
            <span>{mode === '90' ? 'Bingo 90' : 'Bingo 75'}</span>
          </div>
        )}

        {/* Acceso Directo Planilla 75: Visible para Admin o para Operadoras asignadas a Bingo 75 */}
        {(isAdmin || assignedMode === '75') && (onOpenSheet75 || onOpenSheetBuilder) && (
          <button
            id="btn-open-sheet-75"
            onClick={() => {
              if (onOpenSheet75) onOpenSheet75();
              else onOpenSheetBuilder?.('multipliers-15');
            }}
            className="h-7 px-2 rounded-md flex items-center gap-1 cursor-pointer active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-xs transition-all border border-emerald-700 whitespace-nowrap"
            title="Abrir directamente la Planilla de 75 Bolas (1 al 15)"
          >
            <Table2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Planilla 75</span>
          </button>
        )}

        {/* Acceso Directo Planilla 90: Visible para Admin o para Operadoras asignadas a Bingo 90 */}
        {(isAdmin || assignedMode === '90') && (onOpenSheet90 || onOpenSheetBuilder) && (
          <button
            id="btn-open-sheet-90"
            onClick={() => {
              if (onOpenSheet90) onOpenSheet90();
              else onOpenSheetBuilder?.('traditional-90');
            }}
            className="h-7 px-2 rounded-md flex items-center gap-1 cursor-pointer active:scale-95 bg-orange-600 hover:bg-orange-500 text-white font-bold text-[11px] shadow-xs transition-all border border-orange-700 whitespace-nowrap"
            title="Abrir directamente la Planilla de 90 Bolas (Triples Tablas 1 y 2)"
          >
            <Table2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Planilla 90</span>
          </button>
        )}

        {/* Acceso Directo Partidas Guardadas */}
        {onOpenSavedGamesGallery && (
          <button
            id="btn-open-saved-games-gallery"
            onClick={onOpenSavedGamesGallery}
            className="h-7 px-2 rounded-md flex items-center gap-1 cursor-pointer active:scale-95 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] shadow-xs transition-all border border-amber-700 whitespace-nowrap"
            title="Abrir galería de partidas guardadas con historial y planillas completas"
          >
            <Layers className="w-3.5 h-3.5 text-yellow-200 flex-shrink-0" />
            <span>Partidas</span>
            {savedGamesCount !== undefined && savedGamesCount > 0 && (
              <span className="px-1 py-0.2 rounded-full bg-amber-950 text-yellow-300 text-[9px] font-black leading-none ml-0.5">
                {savedGamesCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Grupo 2: Herramientas y funciones del sistema compactas (h-7 w-7) */}
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {/* Alternar Orientación: Teléfono Vertical vs Horizontal */}
        <button
          onClick={() => setOrientation((o) => (o === 'vertical' ? 'horizontal' : 'vertical'))}
          className={`w-7 h-7 rounded-md flex items-center justify-center active:scale-95 transition-all border shadow-xs ${
            isPastelOrange
              ? 'bg-orange-100 hover:bg-orange-200 text-orange-900 border-orange-300'
              : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
          }`}
          title={orientation === 'vertical' ? 'Cambiar a modo horizontal' : 'Cambiar a modo vertical (teléfono)'}
        >
          {orientation === 'vertical' ? (
            <SmartphoneCharging className={`w-3.5 h-3.5 ${isPastelOrange ? 'text-orange-900' : 'text-amber-900'}`} />
          ) : (
            <Tv2 className={`w-3.5 h-3.5 ${isPastelOrange ? 'text-orange-900' : 'text-amber-900'}`} />
          )}
        </button>

        {/* Reiniciar partida */}
        <button
          onClick={onReset}
          className={`w-7 h-7 rounded-md flex items-center justify-center active:scale-95 transition-all border shadow-xs ${
            isPastelOrange
              ? 'bg-orange-100 hover:bg-orange-200 text-orange-900 border-orange-300'
              : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
          }`}
          title="Reiniciar partida"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isPastelOrange ? 'text-orange-900' : 'text-amber-900'}`} />
        </button>

        {/* Efectos de sonido */}
        <button
          onClick={onToggleSfx}
          className={`w-7 h-7 rounded-md flex items-center justify-center active:scale-95 transition-all border shadow-xs ${
            isPastelOrange
              ? 'bg-orange-100 hover:bg-orange-200 text-orange-900 border-orange-300'
              : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
          }`}
          title={settings.sfxEnabled ? 'Silenciar efectos' : 'Activar efectos'}
        >
          {settings.sfxEnabled ? (
            <Volume2 className="w-3.5 h-3.5 text-emerald-700" />
          ) : (
            <VolumeX className={`w-3.5 h-3.5 ${isPastelOrange ? 'text-orange-900/40' : 'text-amber-900/40'}`} />
          )}
        </button>

        {/* Locución de voz */}
        <button
          onClick={onToggleVoice}
          className="w-7 h-7 rounded-md flex items-center justify-center bg-amber-100 hover:bg-amber-200 text-amber-900 active:scale-95 transition-all border border-amber-300 shadow-xs"
          title={settings.voiceEnabled ? 'Desactivar voz' : 'Activar voz'}
        >
          {settings.voiceEnabled ? (
            <Megaphone className="w-3.5 h-3.5 text-amber-900" />
          ) : (
            <MicOff className="w-3.5 h-3.5 text-amber-900/40" />
          )}
        </button>

        {/* Pantalla Completa */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="w-7 h-7 rounded-md flex items-center justify-center bg-amber-100 hover:bg-amber-200 text-amber-900 active:scale-95 transition-all border border-amber-300 shadow-xs cursor-pointer"
          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla Completa'}
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>

        {/* Usuario / Sesión */}
        {onOpenLogin && (
          <button
            id="btn-topbar-user"
            onClick={onOpenLogin}
            className={`h-7 px-2 rounded-md flex items-center gap-1 active:scale-95 transition-all border shadow-xs text-[11px] font-bold cursor-pointer ${
              currentUser
                ? currentUser.role === 'admin'
                  ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300'
                  : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-950 border-emerald-300'
                : 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
            }`}
            title={currentUser ? `Cuenta: ${currentUser.name} (${currentUser.role === 'admin' ? 'Administrador' : 'Operador'})` : 'Iniciar Sesión'}
          >
            {currentUser ? (
              <>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentUser.avatarColor || (currentUser.role === 'admin' ? '#f59e0b' : '#10b981') }} />
                <span className="truncate max-w-[80px]">{currentUser.name}</span>
                <span className="text-[9px] uppercase px-1 py-0.2 rounded font-black opacity-80">
                  {currentUser.role === 'admin' ? '👑' : '🎮'}
                </span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ingresar</span>
              </>
            )}
          </button>
        )}

        {/* Panel de Administrador */}
        {onOpenAdmin && (
          <button
            id="btn-topbar-admin"
            onClick={onOpenAdmin}
            className={`w-7 h-7 rounded-md flex items-center justify-center active:scale-95 transition-all border shadow-xs cursor-pointer ${
              currentUser?.role === 'admin'
                ? 'bg-amber-200 hover:bg-amber-300 text-amber-950 border-amber-400'
                : 'bg-orange-100/70 hover:bg-orange-200 text-orange-900/60 border-orange-300/60'
            }`}
            title={
              currentUser?.role === 'admin'
                ? 'Panel de Administrador (Gestión de Usuarios y Tiempo Real)'
                : 'Panel de Administrador (Restringido a Administradores)'
            }
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${currentUser?.role === 'admin' ? 'text-amber-950' : 'text-orange-900/60'}`} />
          </button>
        )}

        {/* Ajustes generales */}
        <button
          onClick={onOpenSettings}
          className="w-7 h-7 rounded-md flex items-center justify-center bg-amber-100 hover:bg-amber-200 text-amber-900 active:scale-95 transition-all border border-amber-300 shadow-xs"
          title="Ajustes"
        >
          <Settings2 className="w-3.5 h-3.5 text-amber-900" />
        </button>
      </div>
    </div>
  );

  // Helper to render the complete Master Board
  const renderMasterBoard = () => (
    <div
      className="flex-1 w-full h-full flex flex-col rounded-xl border-2 p-1 shadow-xs overflow-hidden min-h-0"
      style={{
        backgroundColor: 'var(--surface-main)',
        borderColor: 'var(--surface-border)',
      }}
    >
      {/* AMBO Announcement Banner if achieved */}
      {currentMatchAmboRow && (
        <div
          className="mb-1 py-1 px-2.5 rounded-lg bg-gradient-to-r from-sky-800 via-cyan-700 to-blue-800 text-cyan-200 font-black text-xs flex items-center justify-between shadow-md border border-sky-400 animate-pulse flex-shrink-0"
          title={`¡Fila #${currentMatchAmboRow} logró AMBO (primera fila en marcar 2 números en el bolillero)!`}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-sm">🎯</span>
            <span className="text-white uppercase tracking-wider text-[11px]">¡AMBO EN EL BOLILLERO!</span>
            <span className="bg-cyan-300 text-slate-950 px-1.5 py-0.2 rounded-md font-black">
              Fila #{currentMatchAmboRow}
            </span>
          </span>
          {currentMatchAmboBall && (
            <span className="text-[10px] bg-sky-950/80 px-2 py-0.5 rounded-full text-cyan-200 border border-sky-400/30">
              Balota #{currentMatchAmboBall}
            </span>
          )}
        </div>
      )}

      {/* TERNA Announcement Banner if achieved */}
      {ternaRowLeader && (
        <div
          className="mb-1 py-1 px-2.5 rounded-lg bg-gradient-to-r from-purple-800 via-purple-700 to-indigo-800 text-yellow-300 font-black text-xs flex items-center justify-between shadow-md border border-purple-500 animate-pulse flex-shrink-0"
          title={`¡Fila #${ternaRowLeader} logró TERNA (primera fila en marcar 3 números en el bolillero)!`}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-sm">⭐</span>
            <span className="text-white uppercase tracking-wider text-[11px]">¡TERNA EN EL BOLILLERO!</span>
            <span className="bg-yellow-400 text-purple-950 px-1.5 py-0.2 rounded-md font-black">
              Fila #{ternaRowLeader}
            </span>
          </span>
          {ternaBallNumber && (
            <span className="text-[10px] bg-purple-950/80 px-2 py-0.5 rounded-full text-purple-200 border border-purple-400/30">
              Balota #{ternaBallNumber}
            </span>
          )}
        </div>
      )}

      {/* Column Headers (B - I - N - G - O for 75; or 9 columns for 90) */}
      {mode === '75' ? (
        <div className="grid grid-cols-5 gap-1 mb-1 flex-shrink-0">
          {columns75.map((col) => (
            <div
              key={col.letter}
              className={`py-1 rounded-md text-center font-black text-sm sm:text-base tracking-wider border ${col.headerStyle}`}
            >
              {col.letter}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-9 gap-0.5 mb-1 flex-shrink-0">
          {columns90.map((col) => (
            <div
              key={col.label}
              className={`py-0.5 rounded text-center font-black text-[10px] truncate border ${
                isPastelOrange
                  ? 'text-orange-950 bg-orange-200 border-orange-300'
                  : 'text-amber-950 bg-amber-200 border-amber-300'
              }`}
              title={`Columna ${col.label}`}
            >
              {col.label}
            </div>
          ))}
        </div>
      )}

      {/* Ball Rack Container */}
      <div
        className={`flex-1 rounded-lg border p-0.5 sm:p-1 overflow-hidden flex flex-col min-h-0 ${
          isPastelOrange
            ? 'border-orange-200 bg-[#fff7ed]'
            : 'border-amber-200 bg-[#fefce8]'
        }`}
      >
        {mode === '75' ? (
          /* 5 Columns x 15 Rows = 75 Balls (B-I-N-G-O) */
          <div className="flex-1 grid grid-cols-5 gap-1 h-full min-h-0">
            {columns75.map((col) => {
              const numbers: number[] = [];
              for (let n = col.range[0]; n <= col.range[1]; n++) {
                numbers.push(n);
              }

              return (
                <div
                  key={col.letter}
                  className="flex-1 grid gap-0.5 h-full min-h-0"
                  style={{ gridTemplateRows: 'repeat(15, minmax(0, 1fr))' }}
                >
                  {numbers.map((num) => {
                    const isDrawn = drawnSet.has(num);
                    const isCurrent = currentBall?.number === num;
                    const rowLeader = ((num - 1) % 15) + 1;
                    const isWinningRow = completedRowLeaders.includes(rowLeader);
                    const isTernaRow = ternaRowLeader === rowLeader;
                    const isAlmostBingo = !isDrawn && almostBingoNumbers.has(num);

                    return (
                      <div
                        key={num}
                        className={`relative w-full h-full min-h-0 rounded flex items-center justify-center font-black tabular-nums select-none transition-all ${
                          isCurrent
                            ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-500 scale-[1.04] z-20 shadow-md font-black'
                            : isWinningRow
                            ? 'bg-gradient-to-tr from-amber-400 to-yellow-300 text-amber-950 ring-1 ring-amber-400 font-black shadow-sm z-10'
                            : isAlmostBingo
                            ? 'animate-almost-bingo border-2 border-emerald-500 bg-emerald-100 text-emerald-950 font-black z-15'
                            : isDrawn
                            ? 'bingo-ball-called'
                            : 'bingo-ball-uncalled'
                        }`}
                        style={{
                          fontSize: 'clamp(10px, 1.3vw, 15px)',
                        }}
                        title={`Número ${num}${
                          isWinningRow
                            ? ' (¡Fila Completa BINGO!)'
                            : isAlmostBingo
                            ? ' (¡A SOLO 1 NÚMERO!)'
                            : isDrawn
                            ? ' (Extraído)'
                            : ' (En bombo)'
                        }`}
                      >
                        <span>{num}</span>
                        {col.letter === 'B' && isWinningRow && (
                          <span
                            className="absolute -left-0.5 -top-0.5 text-[8px]"
                            title={`¡Fila ${rowLeader} Completa!`}
                          >
                            🏆
                          </span>
                        )}
                        {col.letter === 'B' && isTernaRow && !isWinningRow && (
                          <span
                            className="absolute -left-0.5 -top-0.5 text-[8px]"
                            title={`¡Fila ${rowLeader} logró TERNA!`}
                          >
                            ⭐
                          </span>
                        )}
                        {isAlmostBingo && (
                          <span
                            className="absolute -right-0.5 -top-0.5 text-[7px]"
                            title="¡Falta solo este número para completar la fila!"
                          >
                            🔔
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : (
          /* Bingo 90 Mode: 9 Columns x 10 Rows */
          <div className="flex-1 grid grid-cols-9 gap-0.5 h-full min-h-0">
            {columns90.map((col) => {
              const numbers: number[] = [];
              for (let n = col.min; n <= col.max; n++) {
                numbers.push(n);
              }

              return (
                <div
                  key={col.label}
                  className="flex-1 grid gap-0.5 h-full min-h-0"
                  style={{ gridTemplateRows: 'repeat(10, minmax(0, 1fr))' }}
                >
                  {numbers.map((num) => {
                    const isDrawn = drawnSet.has(num);
                    const isCurrent = currentBall?.number === num;
                    const rowLeader = ((num - 1) % 30) + 1;
                    const isWinningRow = completedRowLeaders.includes(rowLeader);
                    const isAlmostBingo = !isDrawn && almostBingoNumbers.has(num);

                    return (
                      <div
                        key={num}
                        className={`relative w-full h-full min-h-0 rounded flex items-center justify-center font-black tabular-nums select-none transition-all ${
                          isCurrent
                            ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-500 scale-[1.04] z-20 shadow-md font-black'
                            : isWinningRow
                            ? 'bg-gradient-to-tr from-amber-400 to-yellow-300 text-amber-950 ring-1 ring-amber-400 font-black shadow-sm z-10'
                            : isAlmostBingo
                            ? 'animate-almost-bingo border-2 border-emerald-500 bg-emerald-100 text-emerald-950 font-black z-15'
                            : isDrawn
                            ? 'bingo-ball-called'
                            : 'bingo-ball-uncalled'
                        }`}
                        style={{
                          fontSize: 'clamp(9px, 1.2vw, 14px)',
                        }}
                        title={`Número ${num}${
                          isWinningRow
                            ? ' (¡Fila Completa BINGO!)'
                            : isAlmostBingo
                            ? ' (¡A SOLO 1 NÚMERO!)'
                            : isDrawn
                            ? ' (Extraído)'
                            : ' (En bombo)'
                        }`}
                      >
                        <span>{num}</span>
                        {col.min === 1 && isWinningRow && (
                          <span
                            className="absolute -left-0.5 -top-0.5 text-[8px]"
                            title={`¡Fila ${rowLeader} Completa!`}
                          >
                            🏆
                          </span>
                        )}
                        {isAlmostBingo && (
                          <span
                            className="absolute -right-0.5 -top-0.5 text-[7px]"
                            title="¡Falta solo este número para completar la fila!"
                          >
                            🔔
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      id="bingo-format-container"
      className="h-screen w-screen max-h-screen overflow-hidden flex flex-col items-center justify-between p-1 sm:p-2 select-none"
      style={{
        backgroundColor: 'var(--bg-page)',
        backgroundImage: 'var(--bg-page-gradient)',
        color: 'var(--text-primary)',
      }}
    >
      {orientation === 'vertical' ? (
        /* ========================================================================= */
        /* VERTICAL PHONE-OPTIMIZED COMPACT FORMAT (Todo cabe para grabar con celular)*/
        /* ========================================================================= */
        <div
          className="w-full flex-1 max-w-[500px] rounded-2xl sm:rounded-3xl border-2 p-1.5 sm:p-2 shadow-xl flex flex-col justify-between overflow-hidden gap-1 min-h-0"
          style={{
            backgroundColor: 'var(--surface-main)',
            borderColor: 'var(--surface-border)',
            color: 'var(--text-primary)',
          }}
        >
          {/* 1. Header Bar */}
          {renderTopBar()}

          {/* 2. Compact Draw Controls & Giant Ball Section */}
          <div
            className="w-full rounded-xl border p-1.5 flex items-center justify-between gap-2 flex-shrink-0"
            style={{
              backgroundColor: 'var(--surface-card, #ffffff)',
              borderColor: 'var(--surface-border)',
            }}
          >
            {/* Left: Giant Ball */}
            <div className="flex flex-col items-center justify-center flex-shrink-0">
              {renderGiantBall('w-18 h-18 sm:w-20 sm:h-20')}
              <div className="mt-1 text-center font-extrabold tracking-wider text-[10px] sm:text-[11px]" style={{ color: 'var(--text-primary)' }}>
                BOLA: <span className="font-black text-amber-600">{drawnBalls.length}</span>/{totalBalls}
              </div>
            </div>

            {/* Right: Recent Balls Strip + Action Buttons + Speed */}
            <div className="flex-1 flex flex-col justify-between gap-1 min-w-0">
              {/* Recent 5 balls */}
              <div
                className="flex items-center justify-between rounded-lg p-1 border"
                style={{
                  backgroundColor: 'var(--surface-main)',
                  borderColor: 'var(--surface-border)',
                }}
              >
                <span className="text-[9px] font-bold uppercase tracking-tight pl-1" style={{ color: 'var(--text-muted)' }}>
                  Últimas:
                </span>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3, 4].map((idx) => {
                    const ball = last5Balls[idx];
                    return (
                      <div
                        key={idx}
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[10px] shadow-xs ${
                          ball
                            ? 'bg-gradient-to-tr from-amber-400 to-yellow-300 text-amber-950 border border-amber-500'
                            : 'bg-black/5 border border-black/10'
                        }`}
                        title={ball ? `Bola #${ball.order}: ${ball.number}` : undefined}
                      >
                        {ball && <span>{ball.number}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Bar: Iniciar/Pausar + Switches B (Bingo), T (Terna), A (Ambo) */}
              <div className="flex items-center gap-1.5">
                <button
                  id="btn-bingo-pause"
                  onClick={onTogglePlay}
                  disabled={isFinished}
                  className="bingo-action-btn-secondary h-8 px-2.5 rounded-lg flex items-center justify-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed font-black text-[11px] active:scale-95 transition-all shadow-xs flex-shrink-0"
                  title={isPlaying ? 'Pausar sorteo automático' : 'Iniciar sorteo automático'}
                >
                  {isPlaying ? (
                    <>
                      <PauseCircle className="w-3.5 h-3.5 text-amber-950" />
                      <span>Pausar</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 text-amber-950 fill-amber-500" />
                      <span>¡Iniciar!</span>
                    </>
                  )}
                </button>

                {/* 3 Switches: B (Bingo), T (Terna), A (Ambo) */}
                <div className="flex-1 flex items-center justify-between gap-1 bg-amber-950/5 p-0.5 rounded-lg border border-amber-950/10">
                  {/* Switch B: Bingo */}
                  <button
                    type="button"
                    onClick={() => onToggleObjective && onToggleObjective('bingo')}
                    className={`flex-1 h-7 rounded-md flex items-center justify-center gap-1 text-[11px] font-black transition-all cursor-pointer active:scale-95 ${
                      gameObjectives.bingo
                        ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-500 shadow-xs'
                        : 'bg-white/70 text-slate-400 border border-slate-200 hover:text-slate-600'
                    }`}
                    title={gameObjectives.bingo ? 'B (Bingo): ACTIVO en esta partida' : 'B (Bingo): INACTIVO (Clic para activar)'}
                  >
                    <span className="w-4 h-4 rounded-full bg-amber-950 text-amber-300 flex items-center justify-center text-[9px] font-black leading-none">B</span>
                    <span className="text-[10px]">Bingo</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${gameObjectives.bingo ? 'bg-amber-950 animate-pulse' : 'bg-slate-300'}`} />
                  </button>

                  {/* Switch T: Terna */}
                  <button
                    type="button"
                    onClick={() => onToggleObjective && onToggleObjective('terna')}
                    className={`flex-1 h-7 rounded-md flex items-center justify-center gap-1 text-[11px] font-black transition-all cursor-pointer active:scale-95 ${
                      gameObjectives.terna
                        ? 'bg-emerald-500 text-white ring-2 ring-emerald-400 shadow-xs'
                        : 'bg-white/70 text-slate-400 border border-slate-200 hover:text-slate-600'
                    }`}
                    title={gameObjectives.terna ? 'T (Terna): ACTIVA en esta partida' : 'T (Terna): INACTIVA (Clic para activar)'}
                  >
                    <span className="w-4 h-4 rounded-full bg-emerald-950 text-emerald-300 flex items-center justify-center text-[9px] font-black leading-none">T</span>
                    <span className="text-[10px]">Terna</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${gameObjectives.terna ? 'bg-white animate-pulse' : 'bg-slate-300'}`} />
                  </button>

                  {/* Switch A: Ambo */}
                  <button
                    type="button"
                    onClick={() => onToggleObjective && onToggleObjective('ambo')}
                    className={`flex-1 h-7 rounded-md flex items-center justify-center gap-1 text-[11px] font-black transition-all cursor-pointer active:scale-95 ${
                      gameObjectives.ambo
                        ? 'bg-sky-500 text-white ring-2 ring-sky-400 shadow-xs'
                        : 'bg-white/70 text-slate-400 border border-slate-200 hover:text-slate-600'
                    }`}
                    title={gameObjectives.ambo ? 'A (Ambo): ACTIVO en esta partida (2 números en fila)' : 'A (Ambo): INACTIVO (Clic para activar)'}
                  >
                    <span className="w-4 h-4 rounded-full bg-sky-950 text-sky-300 flex items-center justify-center text-[9px] font-black leading-none">A</span>
                    <span className="text-[10px]">Ambo</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${gameObjectives.ambo ? 'bg-white animate-pulse' : 'bg-slate-300'}`} />
                  </button>
                </div>
              </div>

              {/* Speed Preset mini-bar */}
              {onChangeSpeed && (
                <div className="flex items-center justify-between gap-1 text-[9px] font-bold pt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  <div className="flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5 text-amber-600" />
                    <span>Vel:</span>
                    <span className="font-extrabold">{settings.speedSeconds}s</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[
                      { p: 'slow' as SpeedPreset, l: '5s', sec: 5.0 },
                      { p: 'normal' as SpeedPreset, l: '3s', sec: 3.0 },
                      { p: 'fast' as SpeedPreset, l: '1.5s', sec: 1.5 },
                      { p: 'turbo' as SpeedPreset, l: '0.8s', sec: 0.8 },
                    ].map((opt) => {
                      const isSel = Math.abs(settings.speedSeconds - opt.sec) < 0.2;
                      return (
                        <button
                          key={opt.p}
                          onClick={() => onChangeSpeed(opt.p, opt.sec)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-black transition-all ${
                            isSel
                              ? 'bg-amber-400 text-amber-950 shadow-xs ring-1 ring-amber-500'
                              : 'bg-black/5 hover:bg-black/10 border border-black/10'
                          }`}
                        >
                          {opt.l}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 3. Master Board filling the rest of vertical height */}
          {renderMasterBoard()}
        </div>
      ) : (
        /* ========================================================================= */
        /* HORIZONTAL / WIDESCREEN DESKTOP FORMAT                                    */
        /* ========================================================================= */
        <div
          className="w-full flex-1 max-w-[1400px] rounded-2xl sm:rounded-3xl border-2 p-2 shadow-xl flex flex-col justify-between overflow-hidden gap-1.5 min-h-0"
          style={{
            backgroundColor: 'var(--surface-main)',
            borderColor: 'var(--surface-border)',
            color: 'var(--text-primary)',
          }}
        >
          {/* Top Bar */}
          {renderTopBar()}

          <div className="w-full h-full flex flex-row gap-2 overflow-hidden min-h-0">
            {/* Left Column: Ball & Controls */}
            <div className="w-[30%] lg:w-[26%] h-full flex flex-col justify-between items-center py-1 overflow-hidden min-h-0">
              <div className="w-full flex flex-col items-center justify-center my-1">
                {renderGiantBall('w-28 h-28 sm:w-32 sm:h-32')}
                <div className="mt-1.5 text-center font-extrabold tracking-wider text-xs" style={{ color: 'var(--text-primary)' }}>
                  BOLA: <span className="font-black text-amber-600">{drawnBalls.length}</span> / {totalBalls}
                </div>
              </div>

              {/* Recent 5 Balls Strip */}
              <div
                className="w-full max-w-[260px] rounded-xl border py-1 px-2 flex items-center justify-around my-1 shadow-xs"
                style={{
                  backgroundColor: 'var(--surface-card, #ffffff)',
                  borderColor: 'var(--surface-border)',
                }}
              >
                {[0, 1, 2, 3, 4].map((idx) => {
                  const ball = last5Balls[idx];
                  return (
                    <div
                      key={idx}
                      className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shadow-xs ${
                        ball
                          ? 'bg-gradient-to-tr from-amber-400 to-yellow-300 text-amber-950 border border-amber-500'
                          : 'bg-black/5 border border-black/10'
                      }`}
                      title={ball ? `Bola #${ball.order}: ${ball.number}` : undefined}
                    >
                      {ball && <span>{ball.number}</span>}
                    </div>
                  );
                })}
              </div>

              {/* Play / Pause Action Button */}
              <div className="w-full max-w-[260px] flex my-1">
                <button
                  onClick={onTogglePlay}
                  disabled={isFinished}
                  className="bingo-action-btn-secondary w-full h-10 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 font-black text-xs active:scale-95 shadow-xs"
                >
                  {isPlaying ? (
                    <>
                      <PauseCircle className="w-4 h-4 text-amber-950" />
                      <span>Pausar Sorteo</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-950 fill-amber-500" />
                      <span>¡Iniciar Sorteo!</span>
                    </>
                  )}
                </button>
              </div>

              {/* 3 Switches: B (Bingo), T (Terna), A (Ambo) */}
              <div className="w-full max-w-[260px] flex flex-col gap-1.5 my-1 p-2.5 rounded-xl bg-black/5 border border-black/10 shadow-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-center text-amber-950/80">
                  Premios a Pagar en esta Partida:
                </span>
                <div className="flex items-center justify-between gap-1.5">
                  {/* B Switch */}
                  <button
                    type="button"
                    onClick={() => onToggleObjective && onToggleObjective('bingo')}
                    className={`flex-1 py-2 px-1 rounded-lg flex flex-col items-center justify-center gap-1 text-xs font-black transition-all cursor-pointer active:scale-95 ${
                      gameObjectives.bingo
                        ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-500 shadow-xs'
                        : 'bg-white/70 text-slate-400 border border-slate-200 hover:text-slate-600'
                    }`}
                    title={gameObjectives.bingo ? 'B (Bingo): ACTIVO en esta partida' : 'B (Bingo): INACTIVO (Clic para activar)'}
                  >
                    <span className="w-5 h-5 rounded-full bg-amber-950 text-amber-300 flex items-center justify-center text-xs font-black">B</span>
                    <span className="text-[10px]">Bingo</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${gameObjectives.bingo ? 'bg-amber-950 animate-pulse' : 'bg-slate-300'}`} />
                  </button>

                  {/* T Switch */}
                  <button
                    type="button"
                    onClick={() => onToggleObjective && onToggleObjective('terna')}
                    className={`flex-1 py-2 px-1 rounded-lg flex flex-col items-center justify-center gap-1 text-xs font-black transition-all cursor-pointer active:scale-95 ${
                      gameObjectives.terna
                        ? 'bg-emerald-500 text-white ring-2 ring-emerald-400 shadow-xs'
                        : 'bg-white/70 text-slate-400 border border-slate-200 hover:text-slate-600'
                    }`}
                    title={gameObjectives.terna ? 'T (Terna): ACTIVA en esta partida' : 'T (Terna): INACTIVA (Clic para activar)'}
                  >
                    <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-300 flex items-center justify-center text-xs font-black">T</span>
                    <span className="text-[10px]">Terna</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${gameObjectives.terna ? 'bg-white animate-pulse' : 'bg-slate-300'}`} />
                  </button>

                  {/* A Switch */}
                  <button
                    type="button"
                    onClick={() => onToggleObjective && onToggleObjective('ambo')}
                    className={`flex-1 py-2 px-1 rounded-lg flex flex-col items-center justify-center gap-1 text-xs font-black transition-all cursor-pointer active:scale-95 ${
                      gameObjectives.ambo
                        ? 'bg-sky-500 text-white ring-2 ring-sky-400 shadow-xs'
                        : 'bg-white/70 text-slate-400 border border-slate-200 hover:text-slate-600'
                    }`}
                    title={gameObjectives.ambo ? 'A (Ambo): ACTIVO en esta partida (2 números en fila)' : 'A (Ambo): INACTIVO (Clic para activar)'}
                  >
                    <span className="w-5 h-5 rounded-full bg-sky-950 text-sky-300 flex items-center justify-center text-xs font-black">A</span>
                    <span className="text-[10px]">Ambo</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${gameObjectives.ambo ? 'bg-white animate-pulse' : 'bg-slate-300'}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Master Board */}
            <div className="flex-1 h-full min-h-0 overflow-hidden">
              {renderMasterBoard()}
            </div>
          </div>
        </div>
      )}

      {/* Selector de Color de Plataforma en la parte inferior de la pantalla */}
      {onSelectPlatformColor && platformColor && (
        <div className="w-full max-w-[1400px] pt-1 flex-shrink-0">
          <PlatformColorBar
            currentColor={platformColor}
            onSelectColor={onSelectPlatformColor}
            compact={orientation === 'vertical'}
          />
        </div>
      )}
    </div>
  );
};
