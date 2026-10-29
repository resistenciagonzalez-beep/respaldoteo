import React, { memo } from 'react';
import { SpeedPreset } from '../types';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface ControlsBarProps {
  isPlaying: boolean;
  isExtracting: boolean;
  remainingCount: number;
  totalBalls: number;
  speed: SpeedPreset;
  speedSeconds: number;
  voiceEnabled: boolean;
  sfxEnabled: boolean;
  onTogglePlay: () => void;
  onDrawNext: () => void;
  onReset: () => void;
  onChangeSpeed: (preset: SpeedPreset, seconds: number) => void;
  onToggleVoice: () => void;
  onToggleSfx: () => void;
  onOpenSettings: () => void;
  onCelebrateBingo: () => void;
}

const SPEED_OPTIONS: { preset: SpeedPreset; label: string; seconds: number }[] = [
  { preset: 'slow', label: 'Lento (5s)', seconds: 5.0 },
  { preset: 'normal', label: 'Normal (3s)', seconds: 3.0 },
  { preset: 'fast', label: 'Rápido (1.5s)', seconds: 1.5 },
  { preset: 'turbo', label: 'Turbo (0.8s)', seconds: 0.8 },
];

export const ControlsBar: React.FC<ControlsBarProps> = memo(({
  isPlaying,
  isExtracting,
  remainingCount,
  speedSeconds,
  voiceEnabled,
  sfxEnabled,
  onTogglePlay,
  onDrawNext,
  onReset,
  onChangeSpeed,
  onToggleVoice,
  onToggleSfx,
  onOpenSettings,
  onCelebrateBingo,
}) => {
  const isFinished = remainingCount === 0;

  return (
    <div
      id="game-controls-bar"
      className="w-full rounded-2xl border p-2.5 sm:p-3 shadow-sm flex flex-col gap-2 transition-all flex-shrink-0"
      style={{
        backgroundColor: 'var(--surface-main)',
        borderColor: 'var(--surface-border)',
      }}
    >
      {/* Primary Action Buttons & Utilities */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Play / Pause Toggle Button */}
          <button
            id="btn-auto-play"
            onClick={onTogglePlay}
            disabled={isFinished}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-600 text-black'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pausar</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Iniciar</span>
              </>
            )}
          </button>

          {/* Manual Extract Next Ball */}
          <button
            id="btn-extract-next"
            onClick={onDrawNext}
            disabled={isPlaying || isExtracting || isFinished}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs sm:text-sm shadow-xs border transition-all active:scale-95 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              borderColor: 'var(--surface-border)',
              backgroundColor: 'var(--surface-card)',
              color: 'var(--text-primary)',
            }}
          >
            <SkipForward className="w-4 h-4 text-blue-400" />
            <span>Extraer Bola</span>
          </button>

          {/* Reiniciar Partida */}
          <button
            id="btn-reset-game"
            onClick={onReset}
            className="p-2 rounded-xl font-medium text-xs border transition-all hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 active:scale-95 text-slate-400"
            style={{ borderColor: 'var(--surface-border)' }}
            title="Reiniciar partida"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Audio & Utilities */}
        <div className="flex items-center gap-1.5">
          {/* Celebrate Bingo button */}
          <button
            id="btn-celebrate-bingo"
            onClick={onCelebrateBingo}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 active:scale-95 transition-all shadow-xs"
            title="Cantar ¡Bingo! / ¡Línea!"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">¡Bingo!</span>
          </button>

          {/* SFX sound toggle */}
          <button
            id="btn-toggle-sfx"
            onClick={onToggleSfx}
            className={`p-2 rounded-xl border transition-all active:scale-95 ${
              sfxEnabled
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                : 'opacity-40 hover:opacity-70'
            }`}
            style={{ borderColor: sfxEnabled ? undefined : 'var(--surface-border)' }}
            title={sfxEnabled ? 'Efectos de sonido: Activados' : 'Efectos de sonido: Desactivados'}
          >
            {sfxEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          {/* Voice Announcer toggle */}
          <button
            id="btn-toggle-voice"
            onClick={onToggleVoice}
            className={`p-2 rounded-xl border transition-all active:scale-95 ${
              voiceEnabled
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400'
                : 'opacity-40 hover:opacity-70'
            }`}
            style={{ borderColor: voiceEnabled ? undefined : 'var(--surface-border)' }}
            title={voiceEnabled ? 'Locución por voz: Activada' : 'Locución por voz: Desactivada'}
          >
            {voiceEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
          </button>

          {/* Settings modal trigger */}
          <button
            id="btn-open-settings"
            onClick={onOpenSettings}
            className="p-2 rounded-xl border transition-all hover:bg-white/10 active:scale-95 text-slate-300"
            style={{ borderColor: 'var(--surface-border)' }}
            title="Ajustes de juego y temas"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Speed Slider & Presets */}
      <div className="pt-1.5 border-t border-slate-700/20 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-[11px] font-semibold opacity-80 whitespace-nowrap">
            Velocidad: <strong className="text-blue-400">{speedSeconds}s</strong>
          </span>
          <input
            type="range"
            min="0.8"
            max="5.0"
            step="0.1"
            value={speedSeconds}
            onChange={(e) => {
              const sec = parseFloat(e.target.value);
              let p: SpeedPreset = 'normal';
              if (sec >= 4.5) p = 'slow';
              else if (sec >= 2.5) p = 'normal';
              else if (sec >= 1.2) p = 'fast';
              else p = 'turbo';
              onChangeSpeed(p, sec);
            }}
            className="w-24 sm:w-28 accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
            title="Ajustar velocidad del sorteo automático"
          />
        </div>

        {/* Preset pill buttons */}
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto justify-end">
          {SPEED_OPTIONS.map((opt) => {
            const isSelected = Math.abs(speedSeconds - opt.seconds) < 0.2;
            return (
              <button
                key={opt.preset}
                id={`btn-speed-${opt.preset}`}
                onClick={() => onChangeSpeed(opt.preset, opt.seconds)}
                className={`text-[11px] px-2 py-0.5 rounded-md border font-medium transition-all active:scale-95 whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-500 font-bold shadow-xs'
                    : 'hover:bg-white/10 opacity-70'
                }`}
                style={{
                  borderColor: isSelected ? undefined : 'var(--surface-border)',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
