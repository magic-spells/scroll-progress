import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default {
  build: {
    lib: {
      entry: resolve(__dirname, 'src/scroll-progress.js'),
      name: 'ScrollProgress',
      formats: ['umd', 'es'],
      fileName: (format) => format === 'es' ? 'scroll-progress.esm.js' : 'scroll-progress.min.js',
    },
    outDir: 'dist',
    esbuild: {
      keepNames: true,
    },
    copyPublicDir: false,
  },
  server: {
    port: 3001,
    open: '/demo/index.html',
  },
};
