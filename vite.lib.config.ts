import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Build della libreria da usare in altre app (es. Edenna OS).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/lib',
    emptyOutDir: true,
    lib: {
      entry: {
        'edenna-puzzle': resolve(__dirname, 'src/index.ts'),
        engine: resolve(__dirname, 'src/engine/index.ts'),
      },
      formats: ['es'],
      cssFileName: 'edenna-puzzle',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
});
