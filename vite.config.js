import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

function buildAssetVersion() {
  if (process.env.APP_ASSET_VERSION) {
    return process.env.APP_ASSET_VERSION;
  }

  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('');
}

const assetVersion = buildAssetVersion();

function cacheBustPublicAssetsPlugin() {
  return {
    name: 'cache-bust-public-assets',
    transformIndexHtml(html) {
      return html.replaceAll('__APP_ASSET_VERSION__', assetVersion);
    },
    closeBundle() {
      const manifestPath = path.resolve(__dirname, 'dist/manifest.json');
      if (!fs.existsSync(manifestPath)) {
        return;
      }

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (Array.isArray(manifest.icons)) {
        manifest.icons = manifest.icons.map((icon) => ({
          ...icon,
          src: `${icon.src}${icon.src.includes('?') ? '&' : '?'}v=${assetVersion}`,
        }));
      }
      if (typeof manifest.start_url === 'string') {
        manifest.start_url = `${manifest.start_url}${manifest.start_url.includes('?') ? '&' : '?'}v=${assetVersion}`;
      }

      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  define: {
    __APP_ASSET_VERSION__: JSON.stringify(assetVersion),
  },
  plugins: [cacheBustPublicAssetsPlugin()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
