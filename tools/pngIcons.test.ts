import { describe, expect, test } from 'bun:test';
import { buildAppIcons, decodePng, encodePng, resize } from './pngIcons';

function solid(width: number, height: number, rgb: [number, number, number]) {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < data.length; i += 3) data.set(rgb, i);
  return { width, height, data };
}

describe('Íconos de la app', () => {
  test('un PNG escrito se puede volver a leer igual', () => {
    const img = solid(10, 7, [200, 30, 90]);
    const back = decodePng(encodePng(img));
    expect(back.width).toBe(10);
    expect(back.height).toBe(7);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });

  test('al achicar, un color sólido se mantiene igual', () => {
    const small = resize(solid(640, 640, [10, 120, 250]), 48, 48);
    expect(small.width).toBe(48);
    expect(Array.from(small.data.subarray(0, 3))).toEqual([10, 120, 250]);
  });

  test('genera los 5 íconos con el tamaño correcto', () => {
    const icons = buildAppIcons(encodePng(solid(640, 640, [234, 88, 12])));
    const sizes = Object.fromEntries(Object.entries(icons).map(([n, b]) => [n, decodePng(b).width]));
    expect(sizes).toEqual({
      'icons/icon-192.png': 192,
      'icons/icon-512.png': 512,
      'icons/icon-maskable-512.png': 512,
      'icons/apple-touch-icon.png': 180,
      'icons/favicon-48.png': 48,
    });
  });
});
