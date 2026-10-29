import React, { useRef, useState } from 'react';
import { BingoSheetBackground } from '../types';
import {
  SHEET_BACKGROUND_PRESETS,
  BackgroundPreset,
} from '../utils/sheetBackgroundPresets';
import {
  Upload,
  Image as ImageIcon,
  Sliders,
  Sparkles,
  SunMedium,
  Check,
  RotateCcw,
  Eye,
  EyeOff,
  Grid,
  Layers,
} from 'lucide-react';

interface SheetBackgroundSettingsProps {
  background: BingoSheetBackground | undefined;
  onChange: (bg: BingoSheetBackground) => void;
  onNotify: (msg: string) => void;
}

export const SheetBackgroundSettings: React.FC<SheetBackgroundSettingsProps> = ({
  background,
  onChange,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const currentBg: BingoSheetBackground = background || {
    enabled: false,
    presetId: 'bingo-watermark',
    url: SHEET_BACKGROUND_PRESETS[0].svgDataUri,
    opacity: 0.18,
    brightness: 0.92,
    fit: 'tile',
  };

  const handleToggleEnabled = () => {
    const nextEnabled = !currentBg.enabled;
    onChange({
      ...currentBg,
      enabled: nextEnabled,
      url: currentBg.url || SHEET_BACKGROUND_PRESETS[0].svgDataUri,
    });
    onNotify(nextEnabled ? 'Fondo del cartón activado' : 'Fondo del cartón desactivado');
  };

  const handleOpacityChange = (opacityVal: number) => {
    onChange({
      ...currentBg,
      enabled: true,
      opacity: Math.max(0.03, Math.min(1, opacityVal)),
    });
  };

  const handleBrightnessChange = (brightVal: number) => {
    onChange({
      ...currentBg,
      brightness: Math.max(0.4, Math.min(1.2, brightVal)),
    });
  };

  const handleFitChange = (fit: 'cover' | 'contain' | 'tile') => {
    onChange({
      ...currentBg,
      fit,
    });
    onNotify(`Ajuste de fondo: ${fit === 'tile' ? 'Mosaico' : fit === 'cover' ? 'Cubrir' : 'Centrado'}`);
  };

  const handleSelectPreset = (preset: BackgroundPreset) => {
    onChange({
      ...currentBg,
      enabled: true,
      presetId: preset.id,
      url: preset.svgDataUri,
      fit: preset.fit,
      opacity: currentBg.opacity || preset.defaultOpacity,
    });
    onNotify(`Fondo "${preset.name}" aplicado`);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      onNotify('Por favor selecciona un archivo de imagen (PNG, JPG, WEBP, SVG).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        onChange({
          ...currentBg,
          enabled: true,
          presetId: undefined,
          url: result,
          fit: 'cover',
          // Keep opacity soft and comfortable to respect user desire to avoid brightness
          opacity: currentBg.opacity && currentBg.opacity <= 0.4 ? currentBg.opacity : 0.18,
          brightness: 0.90,
        });
        onNotify('Imagen cargada con éxito. Ajusta la opacidad deseada abajo.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleApplyUrl = () => {
    if (!urlInput.trim()) return;
    onChange({
      ...currentBg,
      enabled: true,
      presetId: undefined,
      url: urlInput.trim(),
      fit: 'cover',
      opacity: currentBg.opacity && currentBg.opacity <= 0.4 ? currentBg.opacity : 0.18,
      brightness: 0.90,
    });
    setUrlInput('');
    onNotify('Fondo por URL aplicado');
  };

  const handleResetToNone = () => {
    onChange({
      ...currentBg,
      enabled: false,
    });
    onNotify('Fondo desactivado (Cartón en blanco limpio)');
  };

  const opacityPercent = Math.round((currentBg.opacity ?? 0.18) * 100);
  const brightnessPercent = Math.round((currentBg.brightness ?? 0.92) * 100);

  // Badge label for opacity feedback
  const getOpacityBadge = (val: number) => {
    if (val <= 12) return { text: 'Muy Tenue', color: 'text-sky-400 bg-sky-950/60 border-sky-700/50' };
    if (val <= 25) return { text: 'Suave (Recomendado)', color: 'text-emerald-400 bg-emerald-950/60 border-emerald-700/50' };
    if (val <= 45) return { text: 'Medio', color: 'text-amber-400 bg-amber-950/60 border-amber-700/50' };
    return { text: 'Intenso', color: 'text-rose-400 bg-rose-950/60 border-rose-700/50' };
  };

  const opacityBadge = getOpacityBadge(opacityPercent);

  return (
    <div className="space-y-4 animate-fade-in text-xs text-[#431407]">
      {/* Header with Enable Switch */}
      <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-purple-100 text-purple-900 border border-purple-200">
              <ImageIcon className="w-4 h-4 text-purple-700" />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#431407]">Fondo del Cartón</h2>
              <p className="text-[11px] text-orange-900/70">Marca de agua o imagen de fondo</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs ${
              currentBg.enabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-black'
                : 'bg-orange-100 hover:bg-orange-200 text-orange-950 border border-orange-300'
            }`}
          >
            {currentBg.enabled ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Activado</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>Desactivado</span>
              </>
            )}
          </button>
        </div>

        {currentBg.enabled && (
          <div className="pt-1 text-[11px] text-orange-950 flex items-center justify-between border-t border-orange-100">
            <span className="text-orange-900/70">Estado actual:</span>
            <span className="font-bold text-purple-900">
              {currentBg.presetId
                ? `Plantilla: ${SHEET_BACKGROUND_PRESETS.find((p) => p.id === currentBg.presetId)?.name || 'Marca'}`
                : 'Imagen personalizada'}
            </span>
          </div>
        )}
      </div>

      {/* Main Opacity & Anti-Brightness Controls */}
      <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-md space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-orange-900 uppercase tracking-wide flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-orange-600" />
            Ajuste de Opacidad
          </span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${opacityBadge.color}`}
          >
            {opacityBadge.text} • {opacityPercent}%
          </span>
        </div>

        {/* Range Slider for Opacity */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] text-orange-900/70 font-semibold">
            <span>Tenue (3%)</span>
            <span className="text-orange-950 font-mono font-bold text-xs">{opacityPercent}%</span>
            <span>Marcado (75%)</span>
          </div>
          <input
            type="range"
            min="3"
            max="75"
            step="1"
            value={opacityPercent}
            onChange={(e) => handleOpacityChange(Number(e.target.value) / 100)}
            className="w-full accent-orange-500 h-2 bg-orange-100 rounded-lg cursor-pointer"
          />
        </div>

        {/* Quick Opacity Preset Buttons */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {[
            { label: 'Tenue', val: 0.10 },
            { label: 'Suave', val: 0.18 },
            { label: 'Medio', val: 0.30 },
            { label: 'Marcado', val: 0.50 },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleOpacityChange(item.val)}
              className={`py-1 rounded-lg text-[10px] font-bold border transition-all ${
                Math.abs((currentBg.opacity ?? 0.18) - item.val) < 0.04
                  ? 'bg-orange-500 text-white border-orange-500 font-black shadow-xs'
                  : 'bg-[#fffaf5] text-orange-950 border-orange-200 hover:bg-orange-100'
              }`}
            >
              {item.label} ({Math.round(item.val * 100)}%)
            </button>
          ))}
        </div>

        {/* Anti-Brightness / Luminosity Control */}
        <div className="pt-2.5 border-t border-orange-100 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-orange-950 flex items-center gap-1">
              <SunMedium className="w-3.5 h-3.5 text-amber-500" />
              Atenuar Brillo (Anti-Reflejo)
            </span>
            <span className="text-orange-900/70 font-mono font-bold">{brightnessPercent}%</span>
          </div>
          <input
            type="range"
            min="50"
            max="105"
            step="1"
            value={brightnessPercent}
            onChange={(e) => handleBrightnessChange(Number(e.target.value) / 100)}
            className="w-full accent-amber-500 h-1.5 bg-orange-100 rounded-lg cursor-pointer"
          />
          <p className="text-[10px] text-orange-900/70 leading-tight">
            💡 Reduce la luminosidad de imágenes muy blancas o brillantes para que los números del cartón resalten con total claridad.
          </p>
        </div>

        {/* Background Fit / Mode */}
        <div className="pt-2.5 border-t border-orange-100 space-y-1.5">
          <span className="text-[10px] font-bold text-orange-900 uppercase tracking-wider block">
            Modo de Repetición / Ajuste:
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              { id: 'tile' as const, label: 'Mosaico', icon: Grid },
              { id: 'cover' as const, label: 'Cubrir', icon: Layers },
              { id: 'contain' as const, label: 'Centrado', icon: ImageIcon },
            ]).map((mode) => {
              const Icon = mode.icon;
              const isActive = (currentBg.fit || 'tile') === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleFitChange(mode.id)}
                  className={`py-1.5 px-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold border transition-all ${
                    isActive
                      ? 'bg-purple-600 text-white border-purple-500 font-black shadow-xs'
                      : 'bg-[#fffaf5] text-orange-950 border-orange-200 hover:bg-orange-100'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Built-in Presets Gallery */}
      <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-md space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            Galería de Diseños Prediseñados
          </span>
          <span className="text-[10px] text-orange-900/70 font-semibold">1 Clic para aplicar</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SHEET_BACKGROUND_PRESETS.map((preset) => {
            const isSelected = currentBg.enabled && currentBg.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between h-24 relative overflow-hidden group ${
                  isSelected
                    ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-400'
                    : 'border-orange-200 bg-[#fffaf5] hover:border-orange-300 hover:bg-orange-50'
                }`}
              >
                {/* Background mini-pattern preview */}
                <div
                  className="absolute inset-0 opacity-20 pointer-events-none"
                  style={{
                    backgroundImage: `url("${preset.svgDataUri}")`,
                    backgroundSize: '40px 40px',
                    backgroundRepeat: 'repeat',
                  }}
                />

                <div className="relative z-10 flex items-start justify-between w-full">
                  <span className="font-black text-orange-950 text-xs block leading-tight">
                    {preset.name}
                  </span>
                  {isSelected && (
                    <span className="p-1 rounded-full bg-purple-600 text-white">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </span>
                  )}
                </div>

                <div className="relative z-10">
                  <p className="text-[9.5px] text-orange-900/70 line-clamp-2 leading-tight font-medium">
                    {preset.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Image Upload (File / Drag & Drop / URL) */}
      <div className="p-3.5 rounded-2xl bg-white border border-orange-200 shadow-md space-y-3">
        <span className="text-xs font-black text-orange-900 uppercase tracking-wide flex items-center gap-1.5">
          <Upload className="w-3.5 h-3.5 text-orange-600" />
          Subir tu Propia Imagen o Logo
        </span>

        {/* Drag & Drop File Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-4 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 ${
            isDragging
              ? 'border-orange-500 bg-orange-100/50 text-orange-950'
              : 'border-orange-300 hover:border-orange-400 bg-[#fffaf5] hover:bg-orange-50 text-orange-950'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center">
            <Upload className="w-4 h-4" />
          </div>
          <span className="font-bold text-xs text-orange-950">
            Haz clic para elegir foto o arrástrala aquí
          </span>
          <span className="text-[10px] text-orange-900/60">
            Soporta PNG, JPG, WEBP o SVG
          </span>
        </div>

        {/* URL Input */}
        <div className="space-y-1 pt-1">
          <label className="block text-[10px] font-bold text-orange-900 uppercase tracking-wider">
            O pegar enlace de internet (URL):
          </label>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              placeholder="https://ejemplo.com/fondo.jpg"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyUrl();
                }
              }}
              className="flex-1 bg-white border border-orange-200 rounded-xl px-2.5 py-1.5 text-xs text-orange-950 placeholder-orange-300 focus:outline-none focus:border-orange-500 font-mono"
            />
            <button
              type="button"
              onClick={handleApplyUrl}
              className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition-colors shadow-xs active:scale-95"
            >
              Aplicar
            </button>
          </div>
        </div>

        {/* Clear Background button */}
        {currentBg.enabled && (
          <div className="pt-2 border-t border-orange-100 flex justify-end">
            <button
              type="button"
              onClick={handleResetToNone}
              className="px-3 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 border border-orange-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Quitar Fondo (Dejar Blanco)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
