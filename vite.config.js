import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sala: resolve(__dirname, 'sala/index.html'),
        servicios: resolve(__dirname, 'servicios/index.html'),
        sello: resolve(__dirname, 'sello/index.html'),
      },
    },
  },
});
