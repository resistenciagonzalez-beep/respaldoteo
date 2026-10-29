import React from 'react';
import { Palette, Check } from 'lucide-react';
import { PlatformColor, PlatformColorOption } from '../types';

export const PLATFORM_COLORS: PlatformColorOption[] = [
  { id: 'red', name: 'Rojo', swatchHex: '#ef4444', badgeHex: '#dc2626', description: 'Rojo Carmesí' },
  { id: 'blue', name: 'Azul', swatchHex: '#3b82f6', badgeHex: '#2563eb', description: 'Azul Zafiro' },
  { id: 'green', name: 'Verde', swatchHex: '#22c55e', badgeHex: '#16a34a', description: 'Verde Esmeralda' },
  { id: 'purple', name: 'Morado', swatchHex: '#a855f7', badgeHex: '#9333ea', description: 'Morado Real' },
  { id: 'black', name: 'Negro', swatchHex: '#18181b', badgeHex: '#09090b', description: 'Negro Casino' },
  { id: 'gray', name: 'Gris', swatchHex: '#64748b', badgeHex: '#475569', description: 'Gris Pizarra' },
  { id: 'brown', name: 'Marrón', swatchHex: '#854d0e', badgeHex: '#713f12', description: 'Marrón Café' },
  { id: 'pink', name: 'Rosado', swatchHex: '#ec4899', badgeHex: '#db2777', description: 'Rosado Fucsia' },
  { id: 'yellow', name: 'Amarillo', swatchHex: '#eab308', badgeHex: '#ca8a04', description: 'Amarillo Solar' },
  { id: 'orange', name: 'Naranja', swatchHex: '#f97316', badgeHex: '#ea580c', description: 'Naranja Original' },
];

interface PlatformColorBarProps {
  currentColor: PlatformColor;
  onSelectColor: (color: PlatformColor) => void;
  className?: string;
  compact?: boolean;
}

export const PlatformColorBar: React.FC<PlatformColorBarProps> = ({
  currentColor,
  onSelectColor,
  className = '',
  compact = false,
}) => {
  const activeColorObj = PLATFORM_COLORS.find((c) => c.id === currentColor) || PLATFORM_COLORS[0];

  return (
    <nav
      id="platform-color-bar"
      aria-label="Selector de Color de Plataforma"
      className={`w-full flex items-center justify-between gap-2 px-2 sm:px-3 py-1 rounded-xl border backdrop-blur-md shadow-xs select-none transition-all ${className}`}
      style={{
        backgroundColor: 'var(--surface-main, rgba(255, 255, 255, 0.95))',
        borderColor: 'var(--surface-border, rgba(0, 0, 0, 0.1))',
        color: 'var(--text-primary, #000000)',
      }}
    >
      {/* Label and Active Color Display */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center shadow-xs text-white"
          style={{ backgroundColor: activeColorObj.swatchHex }}
          title={`Color activo: ${activeColorObj.name}`}
        >
          <Palette className="w-3 h-3 drop-shadow-xs" />
        </div>
        <span className="text-[11px] font-black tracking-tight hidden sm:inline whitespace-nowrap">
          Color:
        </span>
        <span
          className="text-[10px] sm:text-[11px] font-black px-1.5 py-0.5 rounded-md border"
          style={{
            borderColor: 'var(--surface-border)',
            backgroundColor: 'var(--surface-card)',
            color: 'var(--text-primary)',
          }}
        >
          {activeColorObj.name}
        </span>
      </div>

      {/* Swatches List */}
      <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-0.5 scrollbar-none">
        {PLATFORM_COLORS.map((color) => {
          const isSelected = color.id === currentColor;
          return (
            <button
              key={color.id}
              id={`btn-platform-color-${color.id}`}
              onClick={() => onSelectColor(color.id)}
              className={`group relative flex items-center justify-center rounded-full transition-all duration-150 cursor-pointer ${
                compact ? 'w-5 h-5 sm:w-6 sm:h-6' : 'w-5 h-5 sm:w-6 sm:h-6'
              } ${
                isSelected
                  ? 'scale-110 shadow-md ring-2 ring-offset-1 ring-offset-white/80 dark:ring-offset-black/80'
                  : 'opacity-85 hover:opacity-100 hover:scale-110'
              }`}
              style={{
                backgroundColor: color.swatchHex,
                outlineColor: color.badgeHex,
              }}
              title={`Cambiar a ${color.name} (${color.description})`}
              aria-label={`Color ${color.name}`}
              aria-pressed={isSelected}
            >
              {/* Highlight gradient shine */}
              <span className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 via-transparent to-white/40 pointer-events-none" />

              {/* Checkmark for selected color */}
              {isSelected && (
                <Check
                  className={`w-3 h-3 drop-shadow-md stroke-[3] ${
                    color.id === 'yellow' ? 'text-black' : 'text-white'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Indicator / Reset Hint */}
      <div className="hidden md:flex items-center text-[10px] font-semibold opacity-70 flex-shrink-0 whitespace-nowrap">
        <span>Personaliza la apariencia</span>
      </div>
    </nav>
  );
};
