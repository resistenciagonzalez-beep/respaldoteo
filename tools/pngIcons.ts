/**
 * Genera los íconos de la app (PWA) a partir del logo, al compilar.
 *
 * No usa programas externos: lee el PNG del logo, lo achica con buena calidad
 * (promediando píxeles) y escribe PNG nuevos. Así el logo se guarda una sola vez
 * en el proyecto (branding/1795541856961_image.png) y los tamaños se crean solos.
 */
import zlib from 'zlib';

export interface RgbImage {
  width: number;
  height: number;
  data: Uint8Array; // RGB, 3 bytes por píxel
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Lee un PNG de 8 bits por canal (RGB o RGBA, sin entrelazado). El canal alfa se mezcla sobre negro. */
export function decodePng(file: Buffer): RgbImage {
  if (!file.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('El logo no es un PNG válido');
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const chunk = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      const bitDepth = chunk[8];
      colorType = chunk[9];
      const interlace = chunk[12];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error('Formato de logo no soportado (se necesita PNG RGB/RGBA de 8 bits sin entrelazado)');
      }
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * bpp);
  let prev = new Uint8Array(stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const cur = raw[pos++];
      const left = x >= bpp ? line[x - bpp] : 0;
      const up = prev[x];
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      let v: number;
      switch (filter) {
        case 0: v = cur; break;
        case 1: v = cur + left; break;
        case 2: v = cur + up; break;
        case 3: v = cur + ((left + up) >> 1); break;
        case 4: v = cur + paeth(left, up, upLeft); break;
        default: throw new Error('Filtro PNG desconocido: ' + filter);
      }
      line[x] = v & 0xff;
    }
    pixels.set(line, y * stride);
    prev = line;
  }
  if (bpp === 3) return { width, height, data: pixels };
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    const a = pixels[i + 3] / 255;
    rgb[j] = Math.round(pixels[i] * a);
    rgb[j + 1] = Math.round(pixels[i + 1] * a);
    rgb[j + 2] = Math.round(pixels[i + 2] * a);
  }
  return { width, height, data: rgb };
}

/** Escribe un PNG RGB de 8 bits. */
export function encodePng(img: RgbImage): Buffer {
  const stride = img.width * 3;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(img.data.buffer, img.data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Achica la imagen promediando los píxeles de cada zona (buena calidad al reducir). */
export function resize(src: RgbImage, width: number, height: number): RgbImage {
  const out = new Uint8Array(width * height * 3);
  const sx = src.width / width;
  const sy = src.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let r = 0;
      let g = 0;
      let b = 0;
      let total = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        if (wy <= 0 || yy >= src.height) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          if (wx <= 0 || xx >= src.width) continue;
          const w = wx * wy;
          const i = (yy * src.width + xx) * 3;
          r += src.data[i] * w;
          g += src.data[i + 1] * w;
          b += src.data[i + 2] * w;
          total += w;
        }
      }
      const o = (y * width + x) * 3;
      out[o] = Math.round(r / total);
      out[o + 1] = Math.round(g / total);
      out[o + 2] = Math.round(b / total);
    }
  }
  return { width, height, data: out };
}

/** Color promedio de los bordes del logo (para el fondo del ícono adaptable). */
function edgeColor(img: RgbImage): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const add = (x: number, y: number) => {
    const i = (y * img.width + x) * 3;
    r += img.data[i];
    g += img.data[i + 1];
    b += img.data[i + 2];
    n++;
  };
  for (let x = 0; x < img.width; x++) {
    add(x, 0);
    add(x, img.height - 1);
  }
  for (let y = 0; y < img.height; y++) {
    add(0, y);
    add(img.width - 1, y);
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Ícono "adaptable" de Android: el logo al 80% sobre su color de fondo, para que no se corte. */
export function maskable(src: RgbImage, size: number): RgbImage {
  const [r, g, b] = edgeColor(src);
  const out = new Uint8Array(size * size * 3);
  for (let i = 0; i < out.length; i += 3) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  const inner = Math.round(size * 0.8);
  const off = Math.round((size - inner) / 2);
  const logo = resize(src, inner, inner);
  for (let y = 0; y < inner; y++) {
    out.set(logo.data.subarray(y * inner * 3, (y + 1) * inner * 3), ((y + off) * size + off) * 3);
  }
  return { width: size, height: size, data: out };
}

/** Todos los íconos que usa la app: nombre de archivo -> contenido PNG. */
export function buildAppIcons(logoPng: Buffer): Record<string, Buffer> {
  const logo = decodePng(logoPng);
  return {
    'icons/icon-192.png': encodePng(resize(logo, 192, 192)),
    'icons/icon-512.png': encodePng(resize(logo, 512, 512)),
    'icons/icon-maskable-512.png': encodePng(maskable(logo, 512)),
    'icons/apple-touch-icon.png': encodePng(resize(logo, 180, 180)),
    'icons/favicon-48.png': encodePng(resize(logo, 48, 48)),
  };
}
