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
        login: resolve(__dirname, 'login.html'),
        register: resolve(__dirname, 'register.html'),
        perfil: resolve(__dirname, 'perfil/index.html'),
        forgotPassword: resolve(__dirname, 'forgot-password.html'),
        resetPassword: resolve(__dirname, 'reset-password.html'),
        reunionInterna: resolve(__dirname, 'reunion-interna/index.html'),
        session: resolve(__dirname, 'session.html'),
      },
    },
  },
});
