import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Configurazione della demo (editor + visualizzatore).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist/app' },
  test: { environment: 'node' },
});
