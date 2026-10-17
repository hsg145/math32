import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // Student bundle stays tiny: the whole teacher console is a separate chunk
        // that is only fetched when /admin is opened.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'vendor-rt';
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('scheduler'))
              return 'vendor-react';
            return 'vendor';
          }
          if (id.includes('src/admin')) return 'admin';
          if (id.includes('src/data')) return 'bank';
          return undefined;
        },
      },
    },
  },
});