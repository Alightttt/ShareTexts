import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'path';
import {defineConfig, type Connect, type ViteDevServer} from 'vite';

/** Serve the static guides hub at its canonical extensionless URL in dev.
 *  Production does the same (server.ts app.get('/guides'), vercel.json
 *  rewrite). Without this, Vite's SPA fallback returns the app shell for
 *  /guides and the client renders its 404 view on a 200 status. */
const guidesHub = () => ({
  name: 'guides-hub',
  configureServer(server: ViteDevServer) {
    server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
      const url = (req.url || '').split('?')[0];
      if (url === '/guides' || url === '/guides/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(fs.readFileSync(path.resolve(__dirname, 'public/guides/index.html')));
        return;
      }
      next();
    });
  },
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), guidesHub()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-motion': ['motion/react'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        // The signaling server writes runtime state into the project root
        // (.rooms-total.json — the lifetime rooms counter). Without this,
        // every room creation force-reloads every open page mid-session.
        ignored: ['**/.rooms-total.json'],
      },
    },
  };
});