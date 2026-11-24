/**
 * Constantes y funciones de apoyo de la Planilla 75 (BingoSheetBuilder).
 * Se separaron del archivo principal sin cambiar nada de su funcionamiento.
 */
import React from 'react';
import { VIBRANT_PLAYER_COLORS } from '../../utils/playerColors';

// Multiplicadores disponibles por columna (X1 hasta X10)
export const MAX_COLUMN_MULTIPLIER = 10;
export const COLUMN_MULTIPLIER_OPTIONS = Array.from({ length: MAX_COLUMN_MULTIPLIER }, (_, i) => i + 1);
// Colores vivos, brillantes y saturados para los jugadores (no pasteles)
export const PRESET_COLORS = VIBRANT_PLAYER_COLORS;

// Colores extra que se muestran PRIMERO en la paleta de fondos (solo en la paleta; no cambian los colores automáticos)
export const EXTRA_BG_COLORS = [
  { name: 'Rojo Pasión', hex: '#c4001a', border: '#8a0012', text: '#ffffff', darkText: false },
  { name: 'Negro', hex: '#000000', border: '#333333', text: '#ffffff', darkText: false },
];
export const BG_PALETTE_COLORS = [...EXTRA_BG_COLORS, ...PRESET_COLORS];

/**
 * Calculates adaptive font size and letter tracking for player names in cells
 * so the name spans the full available cell space and scales down smoothly.
 */
export interface CellNameStyleResult {
  className: string;
  style: React.CSSProperties;
}

/**
 * Intelligent adaptive font sizing and wrapping for player names.
 * Ensures player names NEVER get cut off or truncated with ellipsis (...),
 * regardless of text length, column count, expanded/reduced mode, or user font slider.
 */
export const getAdaptiveCellNameStyle = (
  name?: string,
  colCount: number = 6,
  isExpanded: boolean = false,
  scalePercent: number = 100,
  customTextColor?: string
): CellNameStyleResult => {
  const isLightText = Boolean(
    customTextColor &&
    customTextColor.toLowerCase() !== '#000000' &&
    customTextColor.toLowerCase() !== '#1e293b'
  );

  if (!name) {
    return {
      className: 'text-xs font-black uppercase block w-full text-center leading-tight',
      style: {
        color: customTextColor || '#000000',
        textShadow: isLightText
          ? '0 1px 2px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.95)'
          : undefined,
      },
    };
  }

  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const totalLen = trimmed.length;
  const maxWordLen = words.reduce((max, w) => Math.max(max, w.length), 0);
  const scale = scalePercent / 100;

  // Approximate available text width per cell based on real table dimensions
  const totalSheetWidth = isExpanded ? 1160 : 920;
  const seqColWidthEstimated = 110;
  const availableColsWidth = Math.max(480, totalSheetWidth - seqColWidthEstimated);
  const approxColWidth = availableColsWidth / Math.max(colCount, 1);

  // Available horizontal text width inside cell (accounting for number badge ~20px + thin separation margin)
  const availableTextWidth = Math.max(30, approxColWidth - 23);

  // If name has multiple words and is longer than 6 characters, wrap across 2 lines
  const hasMultipleWords = words.length > 1;
  const shouldWrap = hasMultipleWords && totalLen > 6;

  // Character width factor for bold uppercase font (Outfit/Inter/Sans font-black)
  const charFactor = 0.62;

  // Maximum font size in px that can physically fit horizontally without ANY truncation
  const limitingLen = shouldWrap ? Math.max(maxWordLen, 3) : Math.max(totalLen, 3);
  const maxFittingPx = availableTextWidth / (limitingLen * charFactor);

  // Preferred font size based on column count
  let preferredPx: number;
  if (shouldWrap) {
    if (colCount >= 10) preferredPx = 9;
    else if (colCount >= 7) preferredPx = 10;
    else if (colCount >= 5) preferredPx = 11.5;
    else preferredPx = 13.5;
  } else {
    if (colCount >= 10) {
      if (totalLen > 9) preferredPx = 8.5;
      else if (totalLen > 7) preferredPx = 9.5;
      else if (totalLen > 5) preferredPx = 11;
      else preferredPx = 12.5;
    } else if (colCount >= 7) {
      if (totalLen > 9) preferredPx = 9.5;
      else if (totalLen > 7) preferredPx = 10.5;
      else if (totalLen > 5) preferredPx = 12;
      else preferredPx = 13.5;
    } else {
      if (totalLen > 9) preferredPx = 11;
      else if (totalLen > 7) preferredPx = 13;
      else if (totalLen > 5) preferredPx = 15;
      else preferredPx = 18;
    }
  }

  // Apply user scale factor
  const scaledPx = preferredPx * scale;

  // STRICT GUARANTEE: Never allow scaledPx to exceed maxFittingPx!
  // This guarantees that text will NEVER overflow the cell boundaries or truncate!
  const finalPx = Math.max(7, Math.min(scaledPx, maxFittingPx));

  return {
    className: 'font-black uppercase block w-full text-center leading-none select-none tracking-tight',
    style: {
      color: customTextColor || '#000000',
      textShadow: isLightText
        ? '0 1px 2px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.95)'
        : undefined,
      fontSize: `${finalPx.toFixed(1)}px`,
      lineHeight: shouldWrap ? '0.94' : '1.05',
      letterSpacing: totalLen > 8 ? '-0.035em' : totalLen > 6 ? '-0.02em' : '-0.01em',
      whiteSpace: shouldWrap ? 'normal' : 'nowrap',
      wordBreak: shouldWrap ? 'break-word' : 'normal',
      overflowWrap: shouldWrap ? 'break-word' : 'normal',
    },
  };
};

/**
 * Generates a vibrant, high-intensity neon version of the player's/cell's assigned color.
 * Preserves the exact hue/family of the cell but ensures 100% saturation and optimal neon luminescence.
 */
export const getVibrantNeonColor = (colorStr?: string): string => {
  if (!colorStr || colorStr === 'transparent') {
    return '#00f0ff'; // Vibrant neon cyan fallback
  }

  const clean = colorStr.trim();
  if (clean.startsWith('hsl')) {
    return clean;
  }

  // Parse HEX
  const hex = clean.replace(/^#/, '');
  let r = 0, g = 0, b = 0;

  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return clean;
  }

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return clean;
  }

  // Convert RGB to HSL
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;

  if (max !== min) {
    const d = max - min;
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  const hueDeg = Math.round(h * 360);
  const isYellowOrAmber = hueDeg >= 40 && hueDeg <= 68;
  const neonLightness = isYellowOrAmber ? 48 : 50;

  return `hsl(${hueDeg}, 100%, ${neonLightness}%)`;
};

export const getCanonicalPlayerKey = (id?: string, name?: string): string => {
  if (name && name.trim()) return name.trim().toLowerCase();
  if (id && id.trim()) return id.trim().toLowerCase();
  return 'anon';
};

export const STORAGE_KEY = 'bingo_custom_sheet_data_v5';
// Casillas máximas de la columna SECUENCIA (se recorren con las flechas ▲ ▼)
export const SEQ_MAX_SLOTS = 99;
