import { BingoMode, ThemeName } from '../types';

export interface BallColorSpec {
  bgGradient: string;
  textColor: string;
  borderColor: string;
  shadow: string;
  accent: string;
  letter?: string;
}

export function getBingo75Letter(num: number): 'B' | 'I' | 'N' | 'G' | 'O' {
  if (num <= 15) return 'B';
  if (num <= 30) return 'I';
  if (num <= 45) return 'N';
  if (num <= 60) return 'G';
  return 'O';
}

export function getBallSpec(number: number, mode: BingoMode, theme: ThemeName): BallColorSpec {
  let letter: string | undefined;
  if (mode === '75') {
    letter = getBingo75Letter(number);
  }

  // Choose a base color tier depending on mode and number
  let tier = 0;
  if (mode === '75' && letter) {
    const tierMap: Record<string, number> = { B: 0, I: 1, N: 2, G: 3, O: 4 };
    tier = tierMap[letter] ?? 0;
  } else {
    // Group into color sets by 10s for 90 and 80, or mod for custom
    tier = Math.floor((number - 1) / 10) % 5;
  }

  // Theme-specific styles
  switch (theme) {
    case 'neon': {
      const neonTiers = [
        { bg: 'radial-gradient(circle at 35% 35%, #182848, #050b14)', text: '#38bdf8', border: '#0284c7', shadow: '0 0 16px rgba(56, 189, 248, 0.65)', accent: '#38bdf8' },
        { bg: 'radial-gradient(circle at 35% 35%, #4a044e, #13031a)', text: '#f43f5e', border: '#e11d48', shadow: '0 0 16px rgba(244, 63, 94, 0.65)', accent: '#f43f5e' },
        { bg: 'radial-gradient(circle at 35% 35%, #422006, #120902)', text: '#facc15', border: '#ca8a04', shadow: '0 0 16px rgba(250, 204, 21, 0.65)', accent: '#facc15' },
        { bg: 'radial-gradient(circle at 35% 35%, #052e16, #010f06)', text: '#4ade80', border: '#16a34a', shadow: '0 0 16px rgba(74, 222, 128, 0.65)', accent: '#4ade80' },
        { bg: 'radial-gradient(circle at 35% 35%, #3b0764, #0f021c)', text: '#c084fc', border: '#9333ea', shadow: '0 0 16px rgba(192, 132, 252, 0.65)', accent: '#c084fc' },
      ];
      const t = neonTiers[tier];
      return {
        bgGradient: t.bg,
        textColor: t.text,
        borderColor: t.border,
        shadow: t.shadow,
        accent: t.accent,
        letter,
      };
    }

    case 'minimalist': {
      // Flat, modern pastel/solid design with high contrast clean numbers
      const flatTiers = [
        { bg: '#3b82f6', text: '#ffffff', border: '#2563eb', shadow: '0 2px 6px rgba(0,0,0,0.06)', accent: '#3b82f6' },
        { bg: '#ef4444', text: '#ffffff', border: '#dc2626', shadow: '0 2px 6px rgba(0,0,0,0.06)', accent: '#ef4444' },
        { bg: '#f59e0b', text: '#1e293b', border: '#d97706', shadow: '0 2px 6px rgba(0,0,0,0.06)', accent: '#f59e0b' },
        { bg: '#10b981', text: '#ffffff', border: '#059669', shadow: '0 2px 6px rgba(0,0,0,0.06)', accent: '#10b981' },
        { bg: '#8b5cf6', text: '#ffffff', border: '#7c3aed', shadow: '0 2px 6px rgba(0,0,0,0.06)', accent: '#8b5cf6' },
      ];
      const t = flatTiers[tier];
      return {
        bgGradient: t.bg,
        textColor: t.text,
        borderColor: t.border,
        shadow: t.shadow,
        accent: t.accent,
        letter,
      };
    }

    case 'vintage': {
      // Warm polished wood, carved numerals, brass accents
      const vintageTiers = [
        { bg: 'radial-gradient(circle at 35% 30%, #854d0e, #451a03 85%)', text: '#fef08a', border: '#a16207', shadow: 'inset 0 2px 4px rgba(255,255,255,0.25), 0 4px 8px rgba(0,0,0,0.4)', accent: '#ca8a04' },
        { bg: 'radial-gradient(circle at 35% 30%, #991b1b, #450a0a 85%)', text: '#fef3c7', border: '#b91c1c', shadow: 'inset 0 2px 4px rgba(255,255,255,0.25), 0 4px 8px rgba(0,0,0,0.4)', accent: '#dc2626' },
        { bg: 'radial-gradient(circle at 35% 30%, #713f12, #3d1f05 85%)', text: '#fde047', border: '#854d0e', shadow: 'inset 0 2px 4px rgba(255,255,255,0.25), 0 4px 8px rgba(0,0,0,0.4)', accent: '#eab308' },
        { bg: 'radial-gradient(circle at 35% 30%, #166534, #052e16 85%)', text: '#fef9c3', border: '#15803d', shadow: 'inset 0 2px 4px rgba(255,255,255,0.25), 0 4px 8px rgba(0,0,0,0.4)', accent: '#22c55e' },
        { bg: 'radial-gradient(circle at 35% 30%, #581c87, #2e1065 85%)', text: '#fef08a', border: '#6b21a8', shadow: 'inset 0 2px 4px rgba(255,255,255,0.25), 0 4px 8px rgba(0,0,0,0.4)', accent: '#a855f7' },
      ];
      const t = vintageTiers[tier];
      return {
        bgGradient: t.bg,
        textColor: t.text,
        borderColor: t.border,
        shadow: t.shadow,
        accent: t.accent,
        letter,
      };
    }

    case 'classic':
    default: {
      // Classic shiny polished plastic lottery balls with radial gloss highlight
      const classicTiers = [
        { bg: 'radial-gradient(circle at 30% 28%, #60a5fa 5%, #1d4ed8 60%, #172554 100%)', text: '#ffffff', border: '#3b82f6', shadow: 'inset -3px -3px 8px rgba(0,0,0,0.5), inset 3px 3px 7px rgba(255,255,255,0.65), 0 6px 14px rgba(0,0,0,0.25)', accent: '#2563eb' },
        { bg: 'radial-gradient(circle at 30% 28%, #f87171 5%, #b91c1c 60%, #450a0a 100%)', text: '#ffffff', border: '#ef4444', shadow: 'inset -3px -3px 8px rgba(0,0,0,0.5), inset 3px 3px 7px rgba(255,255,255,0.65), 0 6px 14px rgba(0,0,0,0.25)', accent: '#dc2626' },
        { bg: 'radial-gradient(circle at 30% 28%, #fde047 5%, #ca8a04 60%, #713f12 100%)', text: '#18181b', border: '#eab308', shadow: 'inset -3px -3px 8px rgba(0,0,0,0.5), inset 3px 3px 7px rgba(255,255,255,0.75), 0 6px 14px rgba(0,0,0,0.25)', accent: '#ca8a04' },
        { bg: 'radial-gradient(circle at 30% 28%, #4ade80 5%, #15803d 60%, #052e16 100%)', text: '#ffffff', border: '#22c55e', shadow: 'inset -3px -3px 8px rgba(0,0,0,0.5), inset 3px 3px 7px rgba(255,255,255,0.65), 0 6px 14px rgba(0,0,0,0.25)', accent: '#16a34a' },
        { bg: 'radial-gradient(circle at 30% 28%, #c084fc 5%, #7e22ce 60%, #3b0764 100%)', text: '#ffffff', border: '#a855f7', shadow: 'inset -3px -3px 8px rgba(0,0,0,0.5), inset 3px 3px 7px rgba(255,255,255,0.65), 0 6px 14px rgba(0,0,0,0.25)', accent: '#7e22ce' },
      ];
      const t = classicTiers[tier];
      return {
        bgGradient: t.bg,
        textColor: t.text,
        borderColor: t.border,
        shadow: t.shadow,
        accent: t.accent,
        letter,
      };
    }
  }
}

export function getBallBadgeColor(num: number, is90: boolean = false): string {
  if (is90) {
    return 'from-orange-500 to-amber-600 text-white border-orange-300';
  }
  if (num <= 15) return 'from-blue-600 to-indigo-700 text-white border-blue-400';
  if (num <= 30) return 'from-rose-500 to-red-600 text-white border-rose-400';
  if (num <= 45) return 'from-amber-400 to-yellow-500 text-amber-950 border-amber-300';
  if (num <= 60) return 'from-emerald-500 to-green-600 text-white border-emerald-400';
  return 'from-purple-600 to-violet-700 text-white border-purple-400';
}

