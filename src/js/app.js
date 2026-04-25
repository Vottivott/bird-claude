import { registerView, initRouter } from './router.js';
import * as store from './store.js';
import { mount as mountHome } from './views/home.js';
import { mount as mountLogRun } from './views/log-run.js';
import { mount as mountRecords } from './views/records.js';
import { mount as mountStreaks } from './views/streaks.js';
import { mount as mountHexGame } from './views/hex-game.js';
import { mount as mountNest } from './views/nest-view.js';
import { mount as mountWeight } from './views/weight.js';

function applyHexEditorUrlFlags() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('hexEditor') ?? params.get('editor');
  if (!raw) return;

  const value = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'hex'].includes(value)) {
    localStorage.setItem('crowrun_hex_editor', '1');
    if (!window.location.hash) {
      window.location.hash = 'hex';
    }
    return;
  }

  if (['0', 'false', 'no', 'off'].includes(value)) {
    localStorage.removeItem('crowrun_hex_editor');
  }
}

registerView('home', mountHome);
registerView('log', mountLogRun);
registerView('records', mountRecords);
registerView('streaks', mountStreaks);
registerView('hex', mountHexGame);
registerView('nest', mountNest);
registerView('weight', mountWeight);

function updateStatusBar() {
  const econ = store.getEconomy();
  document.getElementById('seeds-count').textContent = econ.seeds;
  document.getElementById('sticks-count').textContent = econ.sticks;
  const board = store.getHexBoard();
  document.getElementById('steps-count').textContent = board ? board.pendingSteps : 0;
}

store.subscribe('economy:changed', updateStatusBar);
store.subscribe('hexboard:changed', updateStatusBar);
updateStatusBar();

applyHexEditorUrlFlags();

const container = document.getElementById('view-container');
initRouter(container);

(() => {
  const nestTab = document.querySelector('[data-view="nest"]');
  if (!nestTab) return;
  let pressTimer = null;
  nestTab.addEventListener('contextmenu', (e) => e.preventDefault());
  nestTab.addEventListener('touchstart', (e) => {
    pressTimer = setTimeout(() => showSecretMenu(), 800);
  }, { passive: true });
  nestTab.addEventListener('touchend', () => clearTimeout(pressTimer));
  nestTab.addEventListener('touchmove', () => clearTimeout(pressTimer));

  function showSecretMenu() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    const panel = document.createElement('div');
    panel.style.cssText = 'background:white;border-radius:16px;padding:24px;width:280px;text-align:center';
    panel.innerHTML = `
      <div style="font-weight:700;font-size:18px;margin-bottom:4px">Secret Menu</div>
      <div style="font-size:12px;color:#999;margin-bottom:16px">v${__APP_ASSET_VERSION__}</div>
      <button id="secret-update" style="width:100%;padding:14px;border:none;border-radius:10px;background:#3182CE;color:white;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:10px">Check for Updates</button>
      <div id="secret-assets" style="margin-bottom:10px"><div style="font-size:13px;color:#999">Checking assets...</div></div>
      <button id="secret-clear" style="width:100%;padding:14px;border:none;border-radius:10px;background:#E53E3E;color:white;font-weight:700;font-size:16px;cursor:pointer;margin-bottom:10px">Clear All Data</button>
      <button id="secret-close" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:10px;background:white;font-size:14px;cursor:pointer">Cancel</button>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    panel.querySelector('#secret-close').addEventListener('click', () => overlay.remove());
    panel.querySelector('#secret-update').addEventListener('click', async () => {
      const btn = panel.querySelector('#secret-update');
      btn.textContent = 'Updating...';
      btn.disabled = true;
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg) {
          reg.update().catch(() => {});
          if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      } catch {}
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch {}
      window.location.reload();
    });
    (async () => {
      const section = panel.querySelector('#secret-assets');
      try {
        const res = await fetch('/asset-manifest.json');
        const allAssets = await res.json();
        const total = allAssets.length;

        let cached = 0;
        for (const url of allAssets) {
          const match = await caches.match(url, { ignoreSearch: true });
          if (match) cached++;
        }

        function renderProgress(done, total, downloading) {
          const pct = Math.round(done / total * 100);
          section.innerHTML = `
            <div style="font-size:13px;color:#666;margin-bottom:6px">${done} / ${total} assets cached (${pct}%)</div>
            <div style="height:6px;background:#EEE;border-radius:3px;overflow:hidden;margin-bottom:8px">
              <div id="asset-bar" style="height:100%;background:#48BB78;border-radius:3px;width:${pct}%;transition:width 0.3s"></div>
            </div>
            ${downloading
              ? '<div style="font-size:13px;color:#3182CE;font-weight:600">Downloading...</div>'
              : done < total
                ? '<button id="secret-download" style="width:100%;padding:14px;border:none;border-radius:10px;background:#48BB78;color:white;font-weight:700;font-size:16px;cursor:pointer">Download All Assets</button>'
                : '<div style="font-size:13px;color:#48BB78;font-weight:600">All assets cached!</div>'
            }
          `;
        }

        renderProgress(cached, total, false);

        section.addEventListener('click', async (e) => {
          if (e.target.id !== 'secret-download') return;
          renderProgress(cached, total, true);

          const uncached = allAssets.filter(url => !cachedPaths.has(url));
          const BATCH = 4;
          for (let i = 0; i < uncached.length; i += BATCH) {
            const batch = uncached.slice(i, i + BATCH);
            await Promise.all(batch.map(async (url) => {
              try {
                const r = await fetch(url);
                await r.blob();
                cached++;
                cachedPaths.add(url);
              } catch {}
              renderProgress(cached, total, cached < total);
            }));
          }
          renderProgress(cached, total, false);
        });
      } catch {
        section.innerHTML = '<div style="font-size:13px;color:#E53E3E">Failed to check assets</div>';
      }
    })();

    panel.querySelector('#secret-clear').addEventListener('click', () => {
      if (confirm('This will delete all your runs, seeds, plants, and progress. Are you sure?')) {
        localStorage.clear();
        if ('caches' in window) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
        window.location.reload();
      }
    });
  }
})();
