import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const frontendDir = import.meta.dirname;

export default defineConfig(({mode}) => {
  const rootEnv = loadEnv(mode, path.resolve(frontendDir, '..'), '');
  const cwdEnv = loadEnv(mode, process.cwd(), '');
  const env = {...rootEnv, ...cwdEnv};
  const rawBase = process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || '/';
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  const googleMapsKey =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    env.GOOGLE_MAPS_API_KEY ||
    '';

  return {
    root: frontendDir,
    base,
    define: {
      'import.meta.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(googleMapsKey),
    },
    build: {
      outDir: path.resolve(frontendDir, 'dist'),
      emptyOutDir: true,
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(frontendDir, 'dist');
          const srcAssets = path.resolve(frontendDir, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': frontendDir,
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
