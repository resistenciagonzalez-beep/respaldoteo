// SVG Presets for Bingo Sheet Backgrounds
// All presets are lightweight vector SVGs encoded cleanly so they render sharply at any resolution

export interface BackgroundPreset {
  id: string;
  name: string;
  description: string;
  previewColor: string;
  fit: 'cover' | 'contain' | 'tile';
  defaultOpacity: number;
  svgDataUri: string;
}

// 1. Watermark Bingo: Diagonal repeated "BINGO" with subtle balls
const svgBingoWatermark = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="280" height="200" viewBox="0 0 280 200"><g fill="none" stroke="%23334155" stroke-width="1.2" stroke-opacity="0.45"><circle cx="40" cy="40" r="28"/><text x="40" y="47" font-family="sans-serif" font-weight="900" font-size="20" fill="%23334155" fill-opacity="0.5" text-anchor="middle">75</text><circle cx="180" cy="140" r="34"/><text x="180" y="148" font-family="sans-serif" font-weight="900" font-size="24" fill="%23334155" fill-opacity="0.5" text-anchor="middle">90</text></g><text x="140" y="105" font-family="Impact, sans-serif" font-size="52" font-weight="900" fill="%231e293b" fill-opacity="0.25" letter-spacing="8" transform="rotate(-25 140 100)" text-anchor="middle">BINGO</text></svg>`;

// 2. Lucky Stars & Sparkles
const svgLuckyStars = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><path d="M80 30 L84 45 L99 45 L87 54 L91 69 L80 60 L69 69 L73 54 L61 45 L76 45 Z" fill="%23ca8a04" fill-opacity="0.35"/><circle cx="25" cy="120" r="6" fill="%23eab308" fill-opacity="0.25"/><circle cx="135" cy="110" r="10" fill="%23ca8a04" fill-opacity="0.2"/><path d="M130 35 Q130 45 120 45 Q130 45 130 55 Q130 45 140 45 Q130 45 130 35 Z" fill="%23eab308" fill-opacity="0.35"/><path d="M35 55 Q35 62 28 62 Q35 62 35 69 Q35 62 42 62 Q35 62 35 55 Z" fill="%23ca8a04" fill-opacity="0.3"/></svg>`;

// 3. Elegant Geometric Mesh
const svgGeometricMesh = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><path d="M0 40 L40 0 L80 40 L40 80 Z" fill="none" stroke="%23475569" stroke-width="1.2" stroke-opacity="0.35"/><circle cx="40" cy="40" r="14" fill="none" stroke="%23475569" stroke-width="1" stroke-opacity="0.3"/><circle cx="40" cy="40" r="3" fill="%23475569" fill-opacity="0.4"/></svg>`;

// 4. Subtle Bingo Balls Pattern
const svgBingoBalls = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><g fill="none" stroke="%232563eb" stroke-opacity="0.3" stroke-width="1.5"><circle cx="50" cy="50" r="32"/><circle cx="50" cy="50" r="22" stroke-dasharray="3,3"/><text x="50" y="56" font-family="sans-serif" font-weight="900" font-size="18" fill="%232563eb" fill-opacity="0.35" text-anchor="middle">15</text><circle cx="150" cy="150" r="32"/><circle cx="150" cy="150" r="22" stroke-dasharray="3,3"/><text x="150" y="156" font-family="sans-serif" font-weight="900" font-size="18" fill="%232563eb" fill-opacity="0.35" text-anchor="middle">77</text></g><circle cx="140" cy="45" r="18" fill="none" stroke="%23dc2626" stroke-opacity="0.25" stroke-width="1.2"/><text x="140" y="50" font-family="sans-serif" font-weight="900" font-size="13" fill="%23dc2626" fill-opacity="0.3" text-anchor="middle">B</text><circle cx="60" cy="145" r="18" fill="none" stroke="%2316a34a" stroke-opacity="0.25" stroke-width="1.2"/><text x="60" y="150" font-family="sans-serif" font-weight="900" font-size="13" fill="%2316a34a" fill-opacity="0.3" text-anchor="middle">O</text></svg>`;

// 5. Soft Waves & Flow
const svgWaves = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><path d="M0 20 Q30 40 60 20 T120 20 M0 60 Q30 80 60 60 T120 60 M0 100 Q30 120 60 100 T120 100" fill="none" stroke="%230d9488" stroke-width="1.4" stroke-opacity="0.32"/></svg>`;

// 6. Dot Matrix Grid
const svgDotMatrix = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="2" fill="%2364748b" fill-opacity="0.35"/></svg>`;

export const SHEET_BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'bingo-watermark',
    name: 'Marca BINGO',
    description: 'Sello diagonal con bolas de bingo y tipografía tradicional',
    previewColor: '#e2e8f0',
    fit: 'tile',
    defaultOpacity: 0.18,
    svgDataUri: svgBingoWatermark,
  },
  {
    id: 'bingo-balls',
    name: 'Bolas de Sorteo',
    description: 'Ilustración estilizada de bolillero y esferas numeradas',
    previewColor: '#dbeafe',
    fit: 'tile',
    defaultOpacity: 0.16,
    svgDataUri: svgBingoBalls,
  },
  {
    id: 'lucky-stars',
    name: 'Estrellas y Suerte',
    description: 'Destellos dorados y constelación festiva para sorteos',
    previewColor: '#fef08a',
    fit: 'tile',
    defaultOpacity: 0.18,
    svgDataUri: svgLuckyStars,
  },
  {
    id: 'geometric-mesh',
    name: 'Malla Geométrica',
    description: 'Rombo elegante y moderno de alta sofisticación',
    previewColor: '#cbd5e1',
    fit: 'tile',
    defaultOpacity: 0.15,
    svgDataUri: svgGeometricMesh,
  },
  {
    id: 'soft-waves',
    name: 'Ondas Turquesa',
    description: 'Ondas suaves y orgánicas con tono refrescante',
    previewColor: '#ccfbf1',
    fit: 'tile',
    defaultOpacity: 0.15,
    svgDataUri: svgWaves,
  },
  {
    id: 'dot-matrix',
    name: 'Matriz de Puntos',
    description: 'Trama milimétrica limpia estilo papel de seguridad',
    previewColor: '#f1f5f9',
    fit: 'tile',
    defaultOpacity: 0.16,
    svgDataUri: svgDotMatrix,
  },
];
