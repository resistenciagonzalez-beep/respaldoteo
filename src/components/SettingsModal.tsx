import React, { useState, useEffect } from 'react';
import { BingoMode, ThemeName, GameSettings } from '../types';
import { BingoVoiceAnnouncer, sfx } from '../utils/audio';
import {
  X,
  Palette,
  Layers,
  Volume2,
  Mic,
  Sparkles,
  Check,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  settings: GameSettings;
  drawnCount: number;
  onClose: () => void;
  onSaveSettings: (newSettings: GameSettings, requiresReset: boolean) => void;
  onOpenAdmin?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  drawnCount,
  onClose,
  onSaveSettings,
  onOpenAdmin,
}) => {
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(settings.theme);
  const [currentMode, setCurrentMode] = useState<BingoMode>(settings.mode);
  const [customMin, setCustomMin] = useState<number>(settings.customMin ?? 1);
  const [customMax, setCustomMax] = useState<number>(settings.customMax ?? 75);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(settings.voiceEnabled);
  const [sfxEnabled, setSfxEnabled] = useState<boolean>(settings.sfxEnabled);
  const [sayNicknames, setSayNicknames] = useState<boolean>(settings.sayNicknames);
  const [voiceVolume, setVoiceVolume] = useState<number>(settings.voiceVolume);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string | undefined>(
    settings.selectedVoiceName
  );
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (isOpen) {
      setCurrentTheme(settings.theme);
      setCurrentMode(settings.mode);
      setCustomMin(settings.customMin ?? 1);
      setCustomMax(settings.customMax ?? 75);
      setVoiceEnabled(settings.voiceEnabled);
      setSfxEnabled(settings.sfxEnabled);
      setSayNicknames(settings.sayNicknames);
      setVoiceVolume(settings.voiceVolume);
      setSelectedVoiceName(settings.selectedVoiceName);

      const sorted = BingoVoiceAnnouncer.getSortedSpanishVoices();
      setAvailableVoices(sorted.map((s) => s.voice));

      // Auto-select best cheerful male voice if none explicitly selected
      if (!settings.selectedVoiceName) {
        const bestMale = BingoVoiceAnnouncer.getBestCheerfulMaleVoice();
        if (bestMale) {
          setSelectedVoiceName(bestMale.name);
        }
      } else {
        setSelectedVoiceName(settings.selectedVoiceName);
      }
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const modeChanged = currentMode !== settings.mode;

  const handleSave = () => {
    if (sfxEnabled) sfx.playClick();
    onSaveSettings(
      {
        ...settings,
        theme: currentTheme,
        mode: currentMode,
        customMin,
        customMax,
        voiceEnabled,
        sfxEnabled,
        sayNicknames,
        voiceVolume,
        selectedVoiceName,
      },
      modeChanged
    );
    onClose();
  };

  const testVoice = () => {
    BingoVoiceAnnouncer.speakText(
      '¡Hola a todos! ¡Soy tu locutor de bingo! ¡Mucha suerte y a divertirse!',
      voiceVolume,
      selectedVoiceName
    );
  };

  const THEMES: { id: ThemeName; name: string; desc: string; previewColor: string }[] = [
    {
      id: 'pastel-orange',
      name: 'Naranja Pastel (Recomendado)',
      desc: 'Tono pastel cálido, suave y luminoso con acentos durazno y naranja',
      previewColor: 'linear-gradient(135deg, #fdba74, #f97316)',
    },
    {
      id: 'pastel-yellow',
      name: 'Amarillo Pastel',
      desc: 'Tono pastel cálido, alegre y armonioso para toda la plataforma',
      previewColor: 'linear-gradient(135deg, #fde047, #eab308)',
    },
    {
      id: 'classic',
      name: 'Clásico Casino',
      desc: 'Bolas plásticas con gradiente y brillo de salón de bingo',
      previewColor: 'linear-gradient(135deg, #1d4ed8, #dc2626)',
    },
    {
      id: 'neon',
      name: 'Neón / Cyberpunk',
      desc: 'Bolas oscuras con números y aros fosforescentes',
      previewColor: 'linear-gradient(135deg, #00f0ff, #f43f5e)',
    },
    {
      id: 'minimalist',
      name: 'Minimalista (Flat)',
      desc: 'Diseño plano limpio, tipografía moderna y alta claridad',
      previewColor: 'linear-gradient(135deg, #3b82f6, #10b981)',
    },
    {
      id: 'vintage',
      name: 'Vintage / Madera',
      desc: 'Texturas cálidas de caoba, latón bruñido y relieve clásico',
      previewColor: 'linear-gradient(135deg, #854d0e, #ca8a04)',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          backgroundColor: 'var(--surface-card)',
          borderColor: 'var(--surface-border)',
          color: 'var(--text-primary)',
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700/20">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Palette className="w-5 h-5 text-blue-400" />
            <span>Configuración y Temas</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-6 text-sm">
          {/* 1. Selector de Temas */}
          <div>
            <label className="font-bold flex items-center gap-2 mb-2 text-xs uppercase tracking-wider opacity-70">
              <Palette className="w-4 h-4 text-blue-400" /> Tema Visual de Interfaz y Bolas
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {THEMES.map((th) => {
                const isSelected = currentTheme === th.id;
                return (
                  <button
                    key={th.id}
                    onClick={() => setCurrentTheme(th.id)}
                    className={`p-3 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                      isSelected
                        ? 'ring-2 ring-blue-500 border-blue-500/80 bg-blue-500/10'
                        : 'hover:bg-white/5 opacity-80'
                    }`}
                    style={{
                      borderColor: isSelected ? undefined : 'var(--surface-border)',
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex-shrink-0 shadow-md flex items-center justify-center text-white"
                      style={{ background: th.previewColor }}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm">{th.name}</div>
                      <div className="text-[11px] opacity-60 leading-tight mt-0.5">
                        {th.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Modos de Juego */}
          <div>
            <label className="font-bold flex items-center gap-2 mb-2 text-xs uppercase tracking-wider opacity-70">
              <Layers className="w-4 h-4 text-amber-400" /> Modo de Juego
            </label>
            <select
              id="select-game-mode"
              value={currentMode}
              onChange={(e) => setCurrentMode(e.target.value as BingoMode)}
              className="w-full p-2.5 rounded-xl border bg-black/20 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              style={{
                borderColor: 'var(--surface-border)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="90">Bingo 90 (Tradicional / 90 bolas)</option>
              <option value="75">Bingo Americano (75 bolas / B-I-N-G-O)</option>
            </select>

            {modeChanged && drawnCount > 0 && (
              <div className="mt-2.5 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Cambiar de modo reiniciará la partida en curso ({drawnCount} bolas extraídas).
                </span>
              </div>
            )}
          </div>

          {/* 3. Audio y Locución */}
          <div className="space-y-3">
            <label className="font-bold flex items-center gap-2 text-xs uppercase tracking-wider opacity-70">
              <Volume2 className="w-4 h-4 text-emerald-400" /> Audio y Locutor de Voz
            </label>

            {/* Voice toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'var(--surface-border)' }}>
              <div className="flex items-center gap-2.5">
                <Mic className="w-4 h-4 text-emerald-400" />
                <div>
                  <div className="font-semibold text-xs sm:text-sm">Cantar números con voz</div>
                  <div className="text-[11px] opacity-60">Usa síntesis de voz en español (Web Speech)</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
            </div>

            {/* Voice selector & preview */}
            {voiceEnabled && (
              <div className="p-3 rounded-xl border bg-black/10 space-y-2.5" style={{ borderColor: 'var(--surface-border)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs opacity-80 font-medium">Voz en español:</span>
                  <button
                    onClick={testVoice}
                    className="text-xs px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors"
                  >
                    Probar voz
                  </button>
                </div>
                {availableVoices.length > 0 ? (
                  <select
                    value={selectedVoiceName || ''}
                    onChange={(e) => setSelectedVoiceName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border bg-black/30 text-xs font-medium focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: 'var(--surface-border)', color: 'var(--text-primary)' }}
                  >
                    {availableVoices.map((v) => {
                      const isMale = BingoVoiceAnnouncer.isMaleVoice(v);
                      const isNatural = BingoVoiceAnnouncer.isNaturalVoice(v);
                      let label = v.name;
                      if (isNatural && isMale) {
                        label = `🌟 ${v.name} (Masculina Natural - Alegre)`;
                      } else if (isMale) {
                        label = `🎙️ ${v.name} (Voz Masculina)`;
                      } else if (isNatural) {
                        label = `✨ ${v.name} (Voz Natural)`;
                      } else {
                        label = `${v.name} (${v.lang})`;
                      }

                      return (
                        <option key={v.name} value={v.name}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div className="text-xs opacity-60 italic">Voz en español predeterminada del navegador (modulada masculina y alegre)</div>
                )}
                <div className="text-[11px] text-emerald-400/90 font-medium flex items-center gap-1.5">
                  <span>✓</span> Modulación activa: Entonación masculina cálida y alegre de locutor de bingo.
                </div>

                {/* Nicknames toggle for Bingo 90 */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div>
                    <div className="text-xs font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Cantar apodos populares
                    </div>
                    <div className="text-[11px] opacity-60">Ej: «La niña bonita: 15», «Los dos patitos: 22»</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sayNicknames}
                    onChange={(e) => setSayNicknames(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* SFX Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'var(--surface-border)' }}>
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-4 h-4 text-blue-400" />
                <div>
                  <div className="font-semibold text-xs sm:text-sm">Efectos de sonido (SFX)</div>
                  <div className="text-[11px] opacity-60">Giro de bombo, tintineo de bolas y campanas</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={sfxEnabled}
                onChange={(e) => setSfxEnabled(e.target.checked)}
                className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
              />
            </div>

            {/* Admin Panel Quick Access */}
            {onOpenAdmin && (
              <div
                className="flex items-center justify-between p-3 rounded-xl border bg-amber-400/15"
                style={{ borderColor: 'var(--surface-border)' }}
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-500" />
                  <div>
                    <div className="font-bold text-xs sm:text-sm">Panel de Administrador</div>
                    <div className="text-[11px] opacity-70">Gestionar usuarios, agregar y retirar accesos</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAdmin();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-amber-950 text-xs font-black transition-all shadow-xs border border-amber-500 cursor-pointer"
                >
                  Abrir Panel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-700/20 flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold border hover:bg-white/5 transition-colors"
            style={{ borderColor: 'var(--surface-border)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all active:scale-95"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
};
