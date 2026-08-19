import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the app from https://<user>.github.io/<repo>/, so every
// asset URL needs that repo prefix. Change this if you rename the repository.
export default defineConfig({
  base: '/iwi7-presentation-registration-app/',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
});
