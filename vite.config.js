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

      // Remove unused duplicate asset directory
      const uncleaned = path.resolve(__dirname, 'dist/assets/named_selection_borderless_8x_cleaned');
      if (fs.existsSync(uncleaned)) {
        fs.rmSync(uncleaned, { recursive: true });
      }

      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (fs.existsSync(swPath)) {
        const distDir = path.resolve(__dirname, 'dist');
        const skip = [
          'walking_transparent_loop.png',
          'running_transparent_loop.png',
          'hex_sprites_aligned_collage.png',
          'hex_sprites_aligned_manifest.txt',
          'retint_manifest.json',
        ];
        const skipDirs = ['named_selection_borderless_8x_cleaned/'];
        const precacheList = ['/'];
        function walk(dir) {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            const rel = '/' + path.relative(distDir, full);
            if (entry.isDirectory()) {
              if (rel === '/assets/named_selection_borderless_8x_cleaned') continue;
              walk(full);
            } else {
              if (skip.some(s => entry.name === s)) continue;
              if (entry.name === 'sw.js') continue;
              precacheList.push(rel);
            }
          }
        }
        walk(distDir);
        let sw = fs.readFileSync(swPath, 'utf8');
        sw = sw.replaceAll('__SW_VERSION__', assetVersion);
        sw = sw.replaceAll('__PRECACHE_LIST__', JSON.stringify(precacheList, null, 2));
        fs.writeFileSync(swPath, sw);
      }

      const distRoot = path.resolve(__dirname, 'dist');
      const allAssets = ['/'];
      function walkAll(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          const rel = '/' + path.relative(distRoot, full);
          if (entry.isDirectory()) {
            if (rel === '/assets/named_selection_borderless_8x_cleaned') continue;
            walkAll(full);
          } else {
            if (entry.name === 'sw.js' || entry.name === 'asset-manifest.json') continue;
            allAssets.push(rel);
          }
        }
      }
      walkAll(distRoot);
      fs.writeFileSync(path.join(distRoot, 'asset-manifest.json'), JSON.stringify(allAssets));
    },
  };
}

const base = process.env.GITHUB_PAGES ? '/bird-claude/' : '/';

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  base,
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
