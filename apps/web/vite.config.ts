import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * One id per build: the commit on Render, else the build time. It's baked into the bundle and
 * written to dist/version.json, which the server reads and sends in `server:status`, so a page
 * left open across a deploy can tell it's out of date.
 */
const buildId = process.env.RENDER_GIT_COMMIT?.slice(0, 12) || Date.now().toString(36);

function versionFile(): Plugin {
  return {
    name: 'party-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: buildId }) });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), versionFile()],
  define: {
    // 'dev' never matches: the dev server sends a null version, so no prompt.
    __BUILD_ID__: JSON.stringify(command === 'build' ? buildId : 'dev'),
  },
  server: {
    // Reachable from phones on the same Wi-Fi.
    host: true,
    port: 5173,
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/admin/api': { target: 'http://localhost:3001' },
    },
  },
}));
