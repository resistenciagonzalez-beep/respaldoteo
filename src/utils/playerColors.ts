export interface PlayerColorSpec {
  name: string;
  hex: string;
  border: string;
  text: string;
  darkText: boolean;
}

/**
 * Paleta de colores de fondo oscuros, intensos y saturados para los jugadores.
 * Contiene los 30 colores de la cuadrícula provista más negro, sin tonos pasteles.
 */
export const VIBRANT_PLAYER_COLORS: PlayerColorSpec[] = [
  { name: 'Negro', hex: '#000000', border: '#333333', text: '#ffffff', darkText: false },
  // --- Los 30 colores exactos de la imagen (6 filas x 5 columnas) ---
  // Fila 1:
  { name: 'Lima Amarillo Brillante', hex: '#f5f630', border: '#b0b123', text: '#000000', darkText: true },
  { name: 'Naranja Intenso', hex: '#fe7902', border: '#b75701', text: '#000000', darkText: true },
  { name: 'Rojo Coral Intenso', hex: '#fd4f3c', border: '#b6392b', text: '#ffffff', darkText: false },
  { name: 'Rojo Carmesí', hex: '#d90f2d', border: '#9c0b20', text: '#ffffff', darkText: false },
  { name: 'Fucsia Neón Intenso', hex: '#fd4a9b', border: '#b63570', text: '#ffffff', darkText: false },

  // Fila 2:
  { name: 'Magenta Vino Oscuro', hex: '#a82063', border: '#791747', text: '#ffffff', darkText: false },
  { name: 'Púrpura Imperial', hex: '#7d2b92', border: '#5a1f69', text: '#ffffff', darkText: false },
  { name: 'Lavanda Azulado', hex: '#a58ae2', border: '#7763a3', text: '#000000', darkText: true },
  { name: 'Índigo Profundo', hex: '#2f2b92', border: '#221f69', text: '#ffffff', darkText: false },
  { name: 'Azul Cobalto Oscuro', hex: '#0145c1', border: '#01328b', text: '#ffffff', darkText: false },

  // Fila 3:
  { name: 'Azul Eléctrico Profundo', hex: '#023db7', border: '#012c84', text: '#ffffff', darkText: false },
  { name: 'Cyan Intenso', hex: '#01a7dd', border: '#01789f', text: '#ffffff', darkText: false },
  { name: 'Turquesa Océano Profundo', hex: '#01a0af', border: '#01737e', text: '#ffffff', darkText: false },
  { name: 'Verde Esmeralda', hex: '#018b73', border: '#016453', text: '#ffffff', darkText: false },
  { name: 'Verde Hoja Intenso', hex: '#7bc803', border: '#599002', text: '#000000', darkText: true },

  // Fila 4:
  { name: 'Lima Ácido Intenso', hex: '#c6df02', border: '#8fa101', text: '#000000', darkText: true },
  { name: 'Oro Cálido', hex: '#ecb901', border: '#aa8501', text: '#000000', darkText: true },
  { name: 'Ámbar Ocre Tostado', hex: '#d58201', border: '#995e01', text: '#000000', darkText: true },
  { name: 'Terracota Óxido Oscuro', hex: '#b7482d', border: '#843420', text: '#ffffff', darkText: false },
  { name: 'Rubí Frambuesa Oscuro', hex: '#b62149', border: '#831835', text: '#ffffff', darkText: false },

  // Fila 5:
  { name: 'Ciruela Vino Muy Oscuro', hex: '#541035', border: '#3c0c26', text: '#ffffff', darkText: false },
  { name: 'Violeta Medianoche Oscuro', hex: '#2b134e', border: '#1f0e38', text: '#ffffff', darkText: false },
  { name: 'Azul Cerúleo', hex: '#71b8e6', border: '#5184a6', text: '#000000', darkText: true },
  { name: 'Menta Jade', hex: '#8dd1bb', border: '#669687', text: '#000000', darkText: true },
  { name: 'Oliva Dorado Oscuro', hex: '#75731d', border: '#545315', text: '#ffffff', darkText: false },

  // Fila 6:
  { name: 'Salmón Tostado', hex: '#eba386', border: '#a97560', text: '#000000', darkText: true },
  { name: 'Mandarina Oscuro', hex: '#e35801', border: '#a33f01', text: '#ffffff', darkText: false },
  { name: 'Cereza Fucsia Intenso', hex: '#d8267d', border: '#9c1b5a', text: '#ffffff', darkText: false },
  { name: 'Azul Marino Medianoche', hex: '#03164a', border: '#021035', text: '#ffffff', darkText: false },
  { name: 'Verde Bosque Muy Oscuro', hex: '#063930', border: '#042923', text: '#ffffff', darkText: false },

  // --- Colores adicionales complementarios igualmente oscuros y saturados (sin pasteles) ---
  { name: 'Verde Oliva Profundo', hex: '#4d7c0f', border: '#365314', text: '#ffffff', darkText: false },
  { name: 'Cereza Eléctrico', hex: '#e11d48', border: '#9f1239', text: '#ffffff', darkText: false },
  { name: 'Azul Ultramar Oscuro', hex: '#1d4ed8', border: '#1e40af', text: '#ffffff', darkText: false },
  { name: 'Naranja Tostado Fuego', hex: '#c2410c', border: '#9a3412', text: '#ffffff', darkText: false },
  { name: 'Verde Jade Oscuro', hex: '#0f766e', border: '#115e59', text: '#ffffff', darkText: false },
  { name: 'Uva Real Intensa', hex: '#5b21b6', border: '#4c1d95', text: '#ffffff', darkText: false },
  { name: 'Mostaza Oro Profundo', hex: '#b45309', border: '#78350f', text: '#ffffff', darkText: false },
  { name: 'Pistacho Bosque', hex: '#3f6212', border: '#1a2e05', text: '#ffffff', darkText: false },
  { name: 'Rosa Rubí Profundo', hex: '#be123c', border: '#881337', text: '#ffffff', darkText: false },
  { name: 'Azul Océano Oscuro', hex: '#0369a1', border: '#075985', text: '#ffffff', darkText: false },
  { name: 'Verde Trébol Oscuro', hex: '#15803d', border: '#166534', text: '#ffffff', darkText: false },
  { name: 'Púrpura Profundo', hex: '#6b21a8', border: '#581c87', text: '#ffffff', darkText: false },
  { name: 'Naranja Ladrillo', hex: '#9a3412', border: '#7c2d12', text: '#ffffff', darkText: false },
  { name: 'Teal Petróleo Oscuro', hex: '#115e59', border: '#134e4a', text: '#ffffff', darkText: false },
  { name: 'Fucsia Magenta Oscuro', hex: '#9d174d', border: '#831843', text: '#ffffff', darkText: false },
  { name: 'Azul Real Nocturno', hex: '#1e40af', border: '#172554', text: '#ffffff', darkText: false },
  { name: 'Ocre Bronce Dorado', hex: '#854d0e', border: '#713f12', text: '#ffffff', darkText: false },
  { name: 'Verde Pino Selva', hex: '#14532d', border: '#052e16', text: '#ffffff', darkText: false },
  { name: 'Fucsia Remolacha', hex: '#86198f', border: '#701a75', text: '#ffffff', darkText: false },
  { name: 'Azul Zafiro Oscuro', hex: '#0f4c81', border: '#0a3055', text: '#ffffff', darkText: false },
  { name: 'Rojo Carmesí Profundo', hex: '#9f1239', border: '#881337', text: '#ffffff', darkText: false },
  { name: 'Morado Noche Oscuro', hex: '#4c1d95', border: '#2e1065', text: '#ffffff', darkText: false },
  { name: 'Teja Terracota Quemado', hex: '#7c2d12', border: '#431407', text: '#ffffff', darkText: false },
  { name: 'Esmeralda Muy Oscuro', hex: '#064e3b', border: '#022c22', text: '#ffffff', darkText: false },
  { name: 'Ciruela Mora Oscura', hex: '#701a75', border: '#4a044e', text: '#ffffff', darkText: false },
];

/**
 * Paleta de colores llamativos y fosforescentes para las LETRAS / TEXTO de los jugadores.
 * Diseñados para brindar un contraste espectacular y resaltar al máximo en las celdas del cartón.
 */
export const FLUORESCENT_TEXT_COLORS: PlayerColorSpec[] = [
  { name: 'Negro Clásico', hex: '#000000', border: '#333333', text: '#ffffff', darkText: false },
  { name: 'Blanco Radiante', hex: '#ffffff', border: '#cccccc', text: '#000000', darkText: true },
  { name: 'Amarillo Neón Flúor', hex: '#ffff00', border: '#eab308', text: '#000000', darkText: true },
  { name: 'Verde Lima Fosforescente', hex: '#39ff14', border: '#16a34a', text: '#000000', darkText: true },
  { name: 'Cyan Eléctrico', hex: '#00f0ff', border: '#0284c7', text: '#000000', darkText: true },
  { name: 'Rosa Neón Brillante', hex: '#ff007f', border: '#be123c', text: '#ffffff', darkText: false },
  { name: 'Naranja Fuego Flúor', hex: '#ff5500', border: '#ea580c', text: '#ffffff', darkText: false },
  { name: 'Magenta Fosforescente', hex: '#ff00ff', border: '#a21caf', text: '#ffffff', darkText: false },
  { name: 'Verde Láser Radioactivo', hex: '#00ff66', border: '#059669', text: '#000000', darkText: true },
  { name: 'Azul Eléctrico Neón', hex: '#0066ff', border: '#1d4ed8', text: '#ffffff', darkText: false },
  { name: 'Rojo Neón Láser', hex: '#ff073a', border: '#b91c1c', text: '#ffffff', darkText: false },
  { name: 'Púrpura Eléctrico', hex: '#9d00ff', border: '#6b21a8', text: '#ffffff', darkText: false },
  { name: 'Turquesa Neón', hex: '#00f5d4', border: '#0d9488', text: '#000000', darkText: true },
  { name: 'Amarillo Solar Oro', hex: '#ffd700', border: '#ca8a04', text: '#000000', darkText: true },
  { name: 'Naranja Neón Puro', hex: '#ff6600', border: '#c2410c', text: '#000000', darkText: true },
  { name: 'Azul Hielo Glow', hex: '#7df9ff', border: '#0284c7', text: '#000000', darkText: true },
  { name: 'Fucsia Láser', hex: '#ff1493', border: '#9d174d', text: '#ffffff', darkText: false },
  { name: 'Verde Esmeralda Neón', hex: '#00e676', border: '#047857', text: '#000000', darkText: true },
  { name: 'Coral Fosforescente', hex: '#ff3d00', border: '#bf360c', text: '#ffffff', darkText: false },
  { name: 'Morado Neón Glow', hex: '#bc13fe', border: '#7e22ce', text: '#ffffff', darkText: false },
  { name: 'Lima Ácido', hex: '#ccff00', border: '#65a30d', text: '#000000', darkText: true },
  { name: 'Rosa Neón Candy', hex: '#f43f5e', border: '#9f1239', text: '#ffffff', darkText: false },
  { name: 'Aguamarina Neón', hex: '#00ffff', border: '#0891b2', text: '#000000', darkText: true },
  { name: 'Azul Cobalto Glow', hex: '#2979ff', border: '#1565c0', text: '#ffffff', darkText: false },
  { name: 'Rojo Carmesí Neón', hex: '#ff1744', border: '#c62828', text: '#ffffff', darkText: false },
  { name: 'Dorado Metálico', hex: '#ffcc00', border: '#ca8a04', text: '#000000', darkText: true },
  { name: 'Verde Neón Suave', hex: '#69f0ae', border: '#00c853', text: '#000000', darkText: true },
  { name: 'Violeta Eléctrico', hex: '#b388ff', border: '#651fff', text: '#000000', darkText: true },
  { name: 'Naranja Glow Suave', hex: '#ff9e80', border: '#ff3d00', text: '#000000', darkText: true },
  { name: 'Gris Grafito Oscuro', hex: '#1e293b', border: '#0f172a', text: '#ffffff', darkText: false },
];

/**
 * Retorna color de texto adecuado (blanco o negro oscuro) para un fondo dado.
 */
export function getContrastTextColor(hexColor?: string): string {
  if (!hexColor) return '#0f172a';
  const clean = hexColor.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? '#000000' : '#ffffff';
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 150 ? '#000000' : '#ffffff';
  }
  return '#000000';
}
