import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';
import { buildAppIcons } from './tools/pngIcons';

// Identificador único de cada versión publicada (en Vercel: el commit publicado).
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || `local-${Date.now()}`;

// Escribe /version.json al compilar: la página abierta lo consulta para saber
// si se publicó una versión nueva y mostrar el aviso "Hay una versión nueva".
function versionFilePlugin(): Plugin {
  return {
    name: 'bolillero-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ buildId: BUILD_ID }),
      });
    },
  };
}

// Íconos de la app (logo de Familia Teo). Al compilar se generan los tamaños que usa
// la app instalable (/icons/...) a partir de branding/1795541856961_image.png.
function pwaIconsPlugin(): Plugin {
  return {
    name: 'bolillero-pwa-icons',
    apply: 'build',
    generateBundle() {
      const logo = fs.readFileSync(path.resolve(__dirname, 'branding/1795541856961_image.png'));
      for (const [fileName, png] of Object.entries(buildAppIcons(logo))) {
        this.emitFile({ type: 'asset', fileName, source: png });
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), versionFilePlugin(), pwaIconsPlugin()],
    define: {
      __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
