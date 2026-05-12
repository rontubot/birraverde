import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        booking: resolve(__dirname, 'booking/index.html'),
        servicios: resolve(__dirname, 'servicios/index.html'),
        sello: resolve(__dirname, 'sello/index.html'),
      },
    },
  },
});
