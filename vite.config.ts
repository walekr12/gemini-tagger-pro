
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // 使用相对路径，Capacitor 需要这个
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
