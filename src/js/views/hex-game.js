import * as store from '../store.js';
import { getBoard, movePlayer, getConnectedHexes } from '../models/hexboard.js';
import { getPlantAtHex, waterPlant, collectPlant, plantSeed } from '../models/plant.js';
import { SHOP_ITEMS, PLANT_OPTIONS, WATER_OPTIONS, canAfford, buyShopItem, buyWater } from '../models/economy.js';
import { showModal } from '../ui/modal.js';
import { showRewardPopup } from '../ui/toast.js';
import { namedAsset, plantAsset, hexAsset } from '../utils/assets.js';
import { getPlantOption } from '../models/economy.js';

const HEX_SIZE = 40;

const OFFSETS_KEY = 'crowrun_hex_offsets';
const DEFAULT_OFFSETS = {
  stepX: 60,
  stepY: 29.4,
  rowHeight: 58.8,
  tileW: 96,
  tileH: 90.2,
};

function isHexEditorUrlEnabled() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('hexEditor') ?? params.get('editor');
  if (!raw) return false;
  return ['1', 'true', 'yes', 'on', 'hex'].includes(raw.trim().toLowerCase());
}

function isHexEditorEnabled() {
  return isHexEditorUrlEnabled() || !!localStorage.getItem('crowrun_hex_editor');
}

function getOffsets() {
  try {
    const stored = localStorage.getItem(OFFSETS_KEY);
    if (stored) return { ...DEFAULT_OFFSETS, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_OFFSETS };
}

function saveOffsets(o) {
  localStorage.setItem(OFFSETS_KEY, JSON.stringify(o));
}

const HEX_TILES = {
  grass_empty: '01_grass_hex_empty.png',
  dirt_empty: '02_dirt_hex_empty.png',
  dirt_seed: '03_dirt_hex_seed.png',
  dirt_sprout: '04_dirt_hex_sprout.png',
  dirt_plant: '05_dirt_hex_plant.png',
  grass_flowers: '06_grass_hex_flowers.png',
  shop_blue: '08_grass_hex_shop_blue_can.png',
  shop_copper: '09_grass_hex_shop_copper_can.png',
  shop_gold: '10_grass_hex_shop_gold_can.png',
};

function loadTileImages() {
  const images = {};
  const promises = [];
  for (const [key, file] of Object.entries(HEX_TILES)) {
    const img = new Image();
    img.src = hexAsset(file);
    images[key] = img;
    promises.push(new Promise(resolve => { img.onload = resolve; img.onerror = resolve; }));
  }
  return { images, ready: Promise.all(promises) };
}

function hexToPixel(q, r) {
  const o = getOffsets();
  return {
    x: q * o.stepX,
    y: q * o.stepY + r * o.rowHeight,
  };
}

function getTileKey(hex, state) {
  if (state === 'hidden') return 'grass_empty';

  const type = hex.type;
  if (type === 'shop') {
    const tier = hex.shopTier || 0;
    return ['shop_blue', 'shop_copper', 'shop_gold'][tier];
  }
  if (type === 'soil') return 'dirt_empty';
  if (type === 'plant') {
    const plant = getPlantAtHex(hex.id);
    if (plant && plant.ready) return 'dirt_plant';
    if (plant) return 'dirt_sprout';
    return 'dirt_seed';
  }
  if (hex.revealed) return 'grass_flowers';
  return 'grass_empty';
}

function drawHex(ctx, cx, cy, images, hex, state) {
  const o = getOffsets();
  const tileKey = getTileKey(hex, state);
  const img = images[tileKey];

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, cx - o.tileW / 2, cy - o.tileH / 2, o.tileW, o.tileH);
  }

  if (state === 'hidden') {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy);
  } else if (state === 'current') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + HEX_SIZE * 1.05 * Math.cos(angle);
      const y = cy + HEX_SIZE * 1.05 * Math.sin(angle) * 0.85;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#5E6B7A';
    ctx.lineWidth = 3;
    ctx.stroke();
  } else if (state === 'reachable') {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const x = cx + HEX_SIZE * 1.05 * Math.cos(angle);
      const y = cy + HEX_SIZE * 1.05 * Math.sin(angle) * 0.85;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#D4A830';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function createEditor(renderFn, { onClose } = {}) {
  const panel = document.createElement('div');
  panel.id = 'hex-editor';
  panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:white;z-index:9999;padding:10px 12px;box-shadow:0 -2px 12px rgba(0,0,0,0.25);font-size:12px;max-height:50vh;overflow-y:auto';

  const o = getOffsets();

  const params = [
    { key: 'stepX', label: 'Step X (right dx)', min: 20, max: 140, step: 0.5 },
    { key: 'stepY', label: 'Step Y (right dy)', min: -60, max: 80, step: 0.5 },
    { key: 'rowHeight', label: 'Row Height (r dy)', min: 10, max: 120, step: 0.5 },
    { key: 'tileW', label: 'Tile Width', min: 40, max: 220, step: 1 },
    { key: 'tileH', label: 'Tile Height', min: 40, max: 220, step: 1 },
  ];

  let html = '<div style="font-weight:700;margin-bottom:6px">Hex Placement Editor</div>';
  html += '<div style="display:grid;grid-template-columns:110px 1fr 50px;gap:4px 8px;align-items:center">';
  for (const p of params) {
    html += `<label>${p.label}</label>`;
    html += `<input type="range" id="hex-ed-${p.key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${o[p.key]}">`;
    html += `<span id="hex-ed-val-${p.key}" style="text-align:right;font-family:monospace">${o[p.key]}</span>`;
  }
  html += '</div>';

  html += '<div style="margin-top:6px;font-size:11px;color:#666">';
  html += '<span id="hex-ed-dirs"></span>';
  html += '</div>';

  html += '<div style="margin-top:8px;display:flex;gap:8px">';
  html += '<button id="hex-ed-reset" style="padding:4px 12px;font-size:12px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer">Reset</button>';
  html += '<button id="hex-ed-copy" style="padding:4px 12px;font-size:12px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer">Copy JSON</button>';
  html += '<button id="hex-ed-close" style="padding:4px 12px;font-size:12px;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;cursor:pointer;margin-left:auto">Close</button>';
  html += '</div>';

  panel.innerHTML = html;
  document.body.appendChild(panel);

  function updateDirs() {
    const cur = getOffsets();
    const el = panel.querySelector('#hex-ed-dirs');
    el.textContent = `Right: (${cur.stepX}, ${cur.stepY})  Right-Up: (${cur.stepX}, ${(cur.stepY - cur.rowHeight).toFixed(1)})  Right-Down: (${cur.stepX}, ${(cur.stepY + cur.rowHeight).toFixed(1)})`;
  }
  updateDirs();

  for (const p of params) {
    const input = panel.querySelector(`#hex-ed-${p.key}`);
    const valSpan = panel.querySelector(`#hex-ed-val-${p.key}`);
    input.addEventListener('input', () => {
      const cur = getOffsets();
      cur[p.key] = parseFloat(input.value);
      saveOffsets(cur);
      valSpan.textContent = input.value;
      updateDirs();
      renderFn();
    });
  }

  panel.querySelector('#hex-ed-reset').addEventListener('click', () => {
    localStorage.removeItem(OFFSETS_KEY);
    for (const p of params) {
      const input = panel.querySelector(`#hex-ed-${p.key}`);
      const valSpan = panel.querySelector(`#hex-ed-val-${p.key}`);
      input.value = DEFAULT_OFFSETS[p.key];
      valSpan.textContent = DEFAULT_OFFSETS[p.key];
    }
    updateDirs();
    renderFn();
  });

  panel.querySelector('#hex-ed-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(getOffsets(), null, 2));
  });

  panel.querySelector('#hex-ed-close').addEventListener('click', () => {
    panel.remove();
    if (typeof onClose === 'function') {
      onClose();
      return;
    }
    localStorage.removeItem('crowrun_hex_editor');
  });

  return panel;
}

export function mount(container) {
  const board = getBoard();
  const econ = store.getEconomy();
  const { images, ready: tilesReady } = loadTileImages();

  const div = document.createElement('div');
  div.className = 'view hex-game';

  div.innerHTML = `
    <div class="hex-game__info">
      <div class="hex-game__steps">
        Steps left: <span id="steps-left">${board.pendingSteps}</span>
      </div>
      <div class="hex-game__steps" style="background:var(--accent);color:var(--text)">
        <img src="${namedAsset('seeds.png')}" style="width:18px;height:18px;vertical-align:middle"> <span id="hex-seeds">${econ.seeds}</span>
      </div>
    </div>
    <div class="hex-game__canvas-container">
      <canvas id="hex-canvas"></canvas>
    </div>
    ${board.pendingSteps === 0 ? `
      <div style="text-align:center;margin-top:8px;color:var(--text-light);font-size:14px">
        Log a run to earn more steps!
      </div>
    ` : `
      <div style="text-align:center;margin-top:8px;color:var(--text-light);font-size:14px">
        Tap a highlighted hex to move
      </div>
    `}
  `;

  container.appendChild(div);

  const canvasContainer = div.querySelector('.hex-game__canvas-container');
  const canvas = div.querySelector('#hex-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    const rect = canvasContainer.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  resize();

  let unsub = store.subscribe('economy:changed', (econ) => {
    const el = div.querySelector('#hex-seeds');
    if (el) el.textContent = econ.seeds;
  });

  function render() {
    const board = getBoard();
    const currentHex = board.hexes.find(h => h.id === board.playerPosition);
    const reachable = board.pendingSteps > 0 ? new Set(currentHex.connections) : new Set();

    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, w, h);

    const playerPos = hexToPixel(currentHex.q, currentHex.r);
    const offsetX = w / 2 - playerPos.x;
    const offsetY = h / 2 - playerPos.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Compute positions and sort by Y for depth ordering (back-to-front)
    const visible = [];
    for (const hex of board.hexes) {
      const pos = hexToPixel(hex.q, hex.r);
      if (Math.abs(pos.x - playerPos.x) > w && Math.abs(pos.y - playerPos.y) > h) continue;

      let state = 'hidden';
      if (hex.id === board.playerPosition) state = 'current';
      else if (reachable.has(hex.id)) state = 'reachable';
      else if (hex.revealed) state = 'revealed';

      visible.push({ hex, pos, state });
    }

    visible.sort((a, b) => a.pos.y - b.pos.y);

    for (const { hex, pos, state } of visible) {
      drawHex(ctx, pos.x, pos.y, images, hex, state);
    }

    ctx.restore();

    div.querySelector('#steps-left').textContent = board.pendingSteps;
  }

  tilesReady.then(() => render());

  // Secret editor: enable via localStorage.setItem('crowrun_hex_editor', '1')
  let editorPanel = null;
  let reopenButton = null;

  function removeReopenButton() {
    if (reopenButton) {
      reopenButton.remove();
      reopenButton = null;
    }
  }

  function showReopenButton() {
    if (!isHexEditorEnabled() || editorPanel || reopenButton) return;
    reopenButton = document.createElement('button');
    reopenButton.type = 'button';
    reopenButton.textContent = 'Open editor';
    reopenButton.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9998;padding:8px 12px;border:1px solid #ccc;border-radius:999px;background:white;box-shadow:0 2px 10px rgba(0,0,0,0.18);font-size:12px;font-weight:600;cursor:pointer';
    reopenButton.addEventListener('click', () => {
      localStorage.setItem('crowrun_hex_editor', '1');
      removeReopenButton();
      openEditor();
    });
    document.body.appendChild(reopenButton);
  }

  function openEditor() {
    if (editorPanel) return;
    removeReopenButton();
    editorPanel = createEditor(render, {
      onClose: () => {
        editorPanel = null;
        if (!isHexEditorUrlEnabled()) {
          localStorage.removeItem('crowrun_hex_editor');
        }
        showReopenButton();
      },
    });
  }

  if (isHexEditorEnabled()) {
    openEditor();
  }

  canvas.addEventListener('click', async (e) => {
    const board = getBoard();
    if (board.pendingSteps <= 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const currentHex = board.hexes.find(h => h.id === board.playerPosition);
    const playerPos = hexToPixel(currentHex.q, currentHex.r);
    const w = rect.width;
    const h = rect.height;
    const offsetX = w / 2 - playerPos.x;
    const offsetY = h / 2 - playerPos.y;

    const worldX = x - offsetX;
    const worldY = y - offsetY;

    const reachable = currentHex.connections;
    let clickedHex = null;
    let minDist = Infinity;

    for (const hid of reachable) {
      const hex = board.hexes.find(h => h.id === hid);
      if (!hex) continue;
      const pos = hexToPixel(hex.q, hex.r);
      const dist = Math.hypot(pos.x - worldX, pos.y - worldY);
      if (dist < HEX_SIZE * 1.2 && dist < minDist) {
        minDist = dist;
        clickedHex = hex;
      }
    }

    if (!clickedHex) return;

    const result = movePlayer(clickedHex.id);
    if (!result) return;

    render();

    const { hex, content } = result;

    if (content && (content.seeds > 0 || content.sticks > 0)) {
      let crowSprite = '52_happy1.png';

      if (content.sticks > 0) {
        crowSprite = content.sticks > 1 ? '41_find_sticks.png' : '40_find_stick.png';
      } else if (content.seeds > 0) {
        crowSprite = content.seeds > 1 ? '33_find_seeds.png' : '31_find_seed.png';
      }

      let title;
      if (content.sticks > 0) {
        title = content.sticks === 1 ? 'Found a stick!' : 'Found sticks!';
      } else {
        title = content.seeds === 1 ? 'Found a seed!' : 'Found seeds!';
      }

      await showRewardPopup({
        crowSprite,
        title,
        seedsAmount: content.seeds > 0 ? content.seeds : undefined,
        sticksAmount: content.sticks > 0 ? content.sticks : undefined,
      });
    }

    if (hex.type === 'shop') {
      await handleShop(hex.shopTier || 0);
    } else if (hex.type === 'soil') {
      await handleSoil(hex.id);
    } else if (hex.type === 'plant') {
      await handlePlantEncounter(hex.id);
    }

    render();
  });

  async function handleShop(shopTier) {
    return new Promise((resolve) => {
      const econ = store.getEconomy();
      const availableWater = WATER_OPTIONS.slice(0, shopTier + 1);

      const html = `
        <h3 style="font-size:18px;font-weight:700;margin-bottom:16px;text-align:center">
          <img src="${namedAsset('50_at_shop.png')}" style="max-height:80px;display:block;margin:0 auto 8px">
          Shop
        </h3>
        <p style="text-align:center;color:var(--text-light);margin-bottom:16px">You have <strong>${econ.seeds}</strong> seeds</p>

        <div style="font-weight:600;margin-bottom:8px">Furniture</div>
        ${SHOP_ITEMS.map(item => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:var(--radius-xs);margin-bottom:8px">
            <div>
              <div style="font-weight:600">${item.name}</div>
              <div style="font-size:13px;color:var(--accent);font-weight:600">${item.cost} seeds</div>
            </div>
            <button class="btn btn--accent shop-buy-btn" data-item-id="${item.id}" ${!canAfford(item.cost) ? 'disabled style="opacity:0.5"' : ''} style="padding:8px 16px;font-size:14px">Buy</button>
          </div>
        `).join('')}

        <div style="font-weight:600;margin-top:16px;margin-bottom:8px">Water</div>
        ${availableWater.map((w, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:var(--radius-xs);margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <img src="${namedAsset(`${w.icon}.png`)}" style="width:32px;height:32px;object-fit:contain">
              <div>
                <div style="font-weight:600">${w.name}</div>
                <div style="font-size:12px;color:var(--text-light)">${w.uses} use${w.uses > 1 ? 's' : ''}</div>
              </div>
            </div>
            <button class="btn btn--primary water-buy-btn" data-water-idx="${i}" ${!canAfford(w.cost) ? 'disabled style="opacity:0.5"' : ''} style="padding:8px 16px;font-size:14px">${w.cost}</button>
          </div>
        `).join('')}

        <button class="btn btn--ghost" style="width:100%;margin-top:12px" id="shop-close">Leave Shop</button>
      `;

      const modal = showModal(html, resolve);

      modal.sheet.querySelectorAll('.shop-buy-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const itemId = btn.dataset.itemId;
          const item = SHOP_ITEMS.find(i => i.id === itemId);
          if (item && buyShopItem(item)) {
            await showRewardPopup({
              crowSprite: '54_very_happy.png',
              title: 'Purchased!',
              details: `${item.name} added to your nest inventory`,
            });
            modal.close();
            resolve();
          }
        });
      });

      modal.sheet.querySelectorAll('.water-buy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.waterIdx);
          const option = availableWater[idx];
          if (option && buyWater(option)) {
            btn.textContent = 'Bought!';
            btn.disabled = true;
          }
        });
      });

      modal.sheet.querySelector('#shop-close').addEventListener('click', () => {
        modal.close();
        resolve();
      });
    });
  }

  function pickSoilOptions(hexId) {
    const plants = store.getPlants();
    const collectedTypes = new Set(plants.filter(p => p.collected).map(p => p.plantType));
    const inProgressTypes = new Set(plants.filter(p => !p.collected).map(p => p.plantType));
    const econ = store.getEconomy();
    const seeds = econ.seeds;

    const available = PLANT_OPTIONS.filter(p => !inProgressTypes.has(p.id));
    const fallback = PLANT_OPTIONS;
    const pool = available.length >= 3 ? available : fallback;

    const affordable = pool.filter(p => p.cost <= seeds * 1.5);
    const expensive = pool.filter(p => p.cost > seeds * 1.5);

    function seededShuffle(arr, seed) {
      const copy = [...arr];
      let s = seed;
      for (let i = copy.length - 1; i > 0; i--) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const j = s % (i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }

    const picks = [];
    const shuffledAffordable = seededShuffle(affordable, hexId * 7 + 31);
    const shuffledExpensive = seededShuffle(expensive.length > 0 ? expensive : pool.slice(-3), hexId * 13 + 47);

    for (const p of shuffledAffordable) {
      if (picks.length >= 2) break;
      if (!picks.find(x => x.id === p.id)) picks.push(p);
    }
    if (picks.length < 2) {
      for (const p of seededShuffle(pool, hexId * 19 + 3)) {
        if (picks.length >= 2) break;
        if (!picks.find(x => x.id === p.id)) picks.push(p);
      }
    }
    for (const p of shuffledExpensive) {
      if (picks.length >= 3) break;
      if (!picks.find(x => x.id === p.id)) picks.push(p);
    }

    picks.sort((a, b) => a.cost - b.cost);

    return { picks, collectedTypes };
  }

  async function handleSoil(hexId) {
    return new Promise((resolve) => {
      const econ = store.getEconomy();
      const { picks, collectedTypes } = pickSoilOptions(hexId);

      const html = `
        <h3 style="font-size:18px;font-weight:700;margin-bottom:16px;text-align:center">
          <img src="${namedAsset('34_planting_1.png')}" style="max-height:80px;display:block;margin:0 auto 8px">
          Plant a Seed
        </h3>
        <p style="text-align:center;color:var(--text-light);margin-bottom:16px">You have <strong>${econ.seeds}</strong> seeds</p>

        ${picks.map(p => {
          const revealed = collectedTypes.has(p.id);
          const imgStyle = revealed
            ? 'width:56px;height:56px;object-fit:contain;flex-shrink:0'
            : 'width:56px;height:56px;object-fit:contain;flex-shrink:0;filter:brightness(0)';
          return `
          <div style="display:flex;align-items:center;padding:12px;background:var(--bg);border-radius:var(--radius-xs);margin-bottom:8px;gap:12px">
            <img src="${plantAsset(p.image)}" style="${imgStyle}">
            <div style="flex:1;min-width:0">
              ${revealed
                ? `<div style="font-weight:600;font-size:14px">${p.name}</div>`
                : `<div style="font-weight:600;font-size:14px;color:var(--text-muted)">???</div>`
              }
              <div style="font-size:12px;color:var(--text-light)">${p.wateringsNeeded} watering${p.wateringsNeeded > 1 ? 's' : ''}</div>
            </div>
            <button class="btn btn--accent plant-btn" data-plant-id="${p.id}" ${!canAfford(p.cost) ? 'disabled style="opacity:0.5"' : ''} style="padding:8px 14px;font-size:14px;flex-shrink:0">${p.cost}</button>
          </div>`;
        }).join('')}

        <button class="btn btn--ghost" style="width:100%;margin-top:12px" id="soil-close">Skip</button>
      `;

      const modal = showModal(html, resolve);

      modal.sheet.querySelectorAll('.plant-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const plantId = btn.dataset.plantId;
          const option = PLANT_OPTIONS.find(p => p.id === plantId);
          if (!option || !canAfford(option.cost)) return;

          store.spendSeeds(option.cost, 'plant_purchase');
          plantSeed(option, hexId);

          await showRewardPopup({
            crowSprite: '35_planting_2.png',
            title: 'Planted!',
            details: 'Find it further on the path!',
            extraImage: plantAsset(option.image),
          });

          modal.close();
          resolve();
        });
      });

      modal.sheet.querySelector('#soil-close').addEventListener('click', () => {
        modal.close();
        resolve();
      });
    });
  }

  async function handlePlantEncounter(hexId) {
    const plant = getPlantAtHex(hexId);
    if (!plant) return;

    const plantImg = plant.image ? plantAsset(plant.image) : null;

    if (plant.ready) {
      const collected = collectPlant(plant.id);
      if (collected) {
        await showRewardPopup({
          crowSprite: '54_very_happy.png',
          title: `${collected.name} Ready!`,
          details: 'Collected! Place it in your nest.',
          extraImage: plantImg,
        });
      }
    } else {
      const waterCount = store.getWaterCount();
      const remaining = plant.wateringsNeeded - plant.wateringsGiven;

      if (waterCount > 0) {
        const watered = waterPlant(plant.id);
        if (watered) {
          const crowSprite = remaining > 2 ? '48_watering_large.png' : '37_watering_small.png';
          const left = watered.wateringsNeeded - watered.wateringsGiven;
          await showRewardPopup({
            crowSprite,
            title: 'Watered!',
            details: watered.ready
              ? `${watered.name} is ready to collect!`
              : `${watered.name} needs ${left} more watering${left > 1 ? 's' : ''}. Find it further ahead!`,
            extraImage: plantImg,
          });
        }
      } else {
        await showRewardPopup({
          crowSprite: '37_watering_small.png',
          title: 'Needs Water!',
          details: `${plant.name} needs ${remaining} watering${remaining > 1 ? 's' : ''}. Buy water at a shop!`,
          extraImage: plantImg,
        });
      }
    }
  }

  window.addEventListener('resize', () => { resize(); render(); });

  return () => {
    if (unsub) unsub();
    if (editorPanel) editorPanel.remove();
    removeReopenButton();
  };
}
