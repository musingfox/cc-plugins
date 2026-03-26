import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  root: './client',
  build: {
    target: 'esnext',
    outDir: '../dist/client',
    emptyOutDir: true,
  }
});
