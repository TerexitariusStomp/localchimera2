import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/main.jsx',
      name: 'SdkTest',
      fileName: 'sdk-test',
      formats: ['iife'],
    },
  },
  resolve: {
    alias: {
      '@localchimera/sdk': '../../../sdk/dist/index.js',
      '@localchimera/browser-sdk': '../../../browser-sdk/dist/index.js',
    },
  },
});
