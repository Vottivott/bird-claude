import * as store from '../store.js';
import { getBoard, movePlayer, getConnectedHexes } from '../models/hexboard.js';
import { getPlantAtHex, waterPlant, collectPlant, plantSeed, neglectPlant } from '../models/plant.js';
import { SHOP_ITEMS, PLANT_OPTIONS, WATER_OPTIONS, canAfford, buyShopItem, buyWater } from '../models/economy.js';
import { showModal } from '../ui/modal.js';
import { showRewardPopup } from '../ui/toast.js';
import { navigate } from '../router.js';
import { namedAsset, plantAsset, hexAsset } from '../utils/assets.js';
import { getPlantOption } from '../models/economy.js';

const HEX_SIZE = 40;
const grownPlantHexes = new Set();
const pendingPlantTiles = new Map();
const plantImageCache = new Map();
const plantSilhouetteCache = new Map();

function loadPlantOverlayImage(imageFile) {
  if (plantImageCache.has(imageFile)) return plantImageCache.get(imageFile);
  const img = new Image();
  img.src = plantAsset(imageFile);
  plantImageCache.set(imageFile, img);
  img.addEventListener('load', () => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    cx.globalCompositeOperation = 'source-atop';
    cx.fillStyle = '#000000';
    cx.fillRect(0, 0, c.width, c.height);
    plantSilhouetteCache.set(imageFile, c);
  }, { once: true });
  return img;
}

const OFFSETS_KEY = 'crowrun_hex_offsets';
const DEFAULT_OFFSETS = {
  stepX: 51.5,
  stepY: 45.5,
  rowHeight: 92.5,
  tileW: 96,
  tileH: 90.2,
  hexW: 51.5,
  hexH: 41.5,
  hexMid: -9,
  hexOfsY: 0,
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
  chest: '07_grass_hex_chest.png',
  wizened: '11_wizened.png',
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

function typeToTileKey(type) {
  if (type === 'flowers') return 'grass_flowers';
  if (type === 'soil') return 'dirt_empty';
  return 'grass_empty';
}

function getTileKey(hex, state) {
  if (pendingPlantTiles.has(hex.id)) return pendingPlantTiles.get(hex.id);
  const type = hex.type;
  if (state === 'hidden') {
    if (type === 'shop') {
      const tier = hex.shopTier || 0;
      return ['shop_blue', 'shop_copper', 'shop_gold'][tier];
    }
    if (type === 'chest') return 'chest';
    if (type === 'flowers') return 'grass_flowers';
    if (type === 'wizened') return 'wizened';
    if (type === 'soil') return 'dirt_empty';
    if (type === 'plant') {
      if (grownPlantHexes.has(hex.id)) {
        const plant = getPlantAtHex(hex.id);
        if (plant && plant.ready) return 'dirt_empty';
        if (plant) return 'dirt_sprout';
      }
      return 'dirt_seed';
    }
    return 'grass_empty';
  }

  if (type === 'shop') {
    const tier = hex.shopTier || 0;
    return ['shop_blue', 'shop_copper', 'shop_gold'][tier];
  }
  if (type === 'chest') return 'chest';
  if (type === 'flowers') return 'grass_flowers';
  if (type === 'wizened') return 'wizened';
  if (type === 'soil') return 'dirt_empty';
  if (type === 'plant') {
    const plant = getPlantAtHex(hex.id);
    if (plant && plant.ready) return 'dirt_empty';
    if (plant) return 'dirt_sprout';
    return 'dirt_seed';
  }
  return 'grass_empty';
}

const _tintCanvas = document.createElement('canvas');
const _tintCtx = _tintCanvas.getContext('2d');

function addHexPath(ctx, cx, cy) {
  const o = getOffsets();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + o.hexW * Math.cos(angle);
    const baseY = o.hexH * Math.sin(angle);
    const y = cy + (o.hexOfsY || 0) + baseY + Math.sign(baseY) * (o.hexMid || 0);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawTile(ctx, cx, cy, img, tinted) {
  const o = getOffsets();
  if (tinted) {
    const dpr = window.devicePixelRatio || 1;
    const tw = Math.ceil(o.tileW * dpr), th = Math.ceil(o.tileH * dpr);
    if (_tintCanvas.width !== tw || _tintCanvas.height !== th) {
      _tintCanvas.width = tw;
      _tintCanvas.height = th;
    }
    _tintCtx.globalCompositeOperation = 'source-over';
    _tintCtx.clearRect(0, 0, tw, th);
    _tintCtx.drawImage(img, 0, 0, tw, th);
    _tintCtx.globalCompositeOperation = 'source-atop';
    _tintCtx.fillStyle = 'rgba(255,255,255,0.45)';
    _tintCtx.fillRect(0, 0, tw, th);
    ctx.drawImage(_tintCanvas, 0, 0, tw, th, cx - o.tileW / 2, cy - o.tileH / 2, o.tileW, o.tileH);
  } else {
    ctx.drawImage(img, cx - o.tileW / 2, cy - o.tileH / 2, o.tileW, o.tileH);
  }
}

function drawHex(ctx, cx, cy, images, hex, state) {
  const o = getOffsets();
  const tileKey = getTileKey(hex, state);
  const img = images[tileKey];
  const hasImg = img && img.complete && img.naturalWidth > 0;
  const tinted = state === 'hidden' || state === 'reachable';

  if (state === 'reachable' && hasImg) {
    const sideBaseY = o.hexH * Math.sin(-Math.PI / 6);
    const splitY = cy + (o.hexOfsY || 0) + sideBaseY + Math.sign(sideBaseY) * (o.hexMid || 0);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - o.tileW, splitY, o.tileW * 2, o.tileH * 2);
    ctx.clip();
    drawTile(ctx, cx, cy, img, tinted);
    ctx.restore();

    ctx.beginPath();
    addHexPath(ctx, cx, cy);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - o.tileW, cy - o.tileH, o.tileW * 2, splitY - (cy - o.tileH));
    ctx.clip();
    drawTile(ctx, cx, cy, img, tinted);
    ctx.restore();
  } else {
    if (hasImg) drawTile(ctx, cx, cy, img, tinted);
  }

  if (state === 'hidden' && hex.type === 'normal') {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy);
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
    { key: 'hexW', label: 'Hex Overlay W', min: 10, max: 80, step: 0.5 },
    { key: 'hexH', label: 'Hex Overlay H', min: 10, max: 80, step: 0.5 },
    { key: 'hexMid', label: 'Hex Mid Stretch', min: -30, max: 40, step: 0.5 },
    { key: 'hexOfsY', label: 'Hex Overlay Y Ofs', min: -30, max: 30, step: 0.5 },
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
      <div id="hex-water-bar" class="hex-game__steps" style="background:var(--accent);color:var(--text);display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600">
      </div>
    </div>
    <div class="hex-game__canvas-container" style="position:relative">
      <canvas id="hex-canvas"></canvas>
      <div id="crow-wrapper" style="position:absolute;pointer-events:none;transform:translate(-50%,-85%);z-index:10">
        <canvas id="crow-display" style="height:50px"></canvas>
      </div>
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

  const crowWrapper = div.querySelector('#crow-wrapper');
  const crowDisplay = div.querySelector('#crow-display');
  const crowDisplayCtx = crowDisplay.getContext('2d');
  let crowWorldPos = null;
  let animating = false;
  let crowAnimLoop = null;

  let crowFrames = [];
  let crowFrameIdx = 0;
  let crowFrameTime = 0;
  let crowLastTs = 0;
  let crowW = 0, crowH = 0;

  function parseApngFrames(buf) {
    const bytes = new Uint8Array(buf);
    const dv = new DataView(buf);
    const PNG_SIG = bytes.slice(0, 8);
    const frames = [];
    let ihdrChunk = null;
    let pos = 8;
    let currentFctl = null;
    let currentDataChunks = [];
    let firstFrame = true;

    function readChunk() {
      if (pos + 8 > bytes.length) return null;
      const len = dv.getUint32(pos);
      const type = String.fromCharCode(bytes[pos+4], bytes[pos+5], bytes[pos+6], bytes[pos+7]);
      const data = bytes.slice(pos+8, pos+8+len);
      const totalLen = 12 + len;
      pos += totalLen;
      return { type, data, raw: bytes.slice(pos - totalLen, pos) };
    }

    function buildPng(ihdr, idatDataArrays) {
      function chunk(type, data) {
        const buf = new Uint8Array(12 + data.length);
        const dv = new DataView(buf.buffer);
        dv.setUint32(0, data.length);
        buf[4] = type.charCodeAt(0); buf[5] = type.charCodeAt(1);
        buf[6] = type.charCodeAt(2); buf[7] = type.charCodeAt(3);
        buf.set(data, 8);
        let crc = crc32(buf.slice(4, 8 + data.length));
        dv.setUint32(8 + data.length, crc);
        return buf;
      }
      const parts = [PNG_SIG, ihdr, ...idatDataArrays.map(d => chunk('IDAT', d))];
      const iend = new Uint8Array([0,0,0,0, 0x49,0x45,0x4E,0x44, 0xAE,0x42,0x60,0x82]);
      parts.push(iend);
      const total = parts.reduce((s, p) => s + p.length, 0);
      const result = new Uint8Array(total);
      let off = 0;
      for (const p of parts) { result.set(p, off); off += p.length; }
      return result;
    }

    function crc32(data) {
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < data.length; i++) {
        crc ^= data[i];
        for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
      return (crc ^ 0xFFFFFFFF) >>> 0;
    }

    function flushFrame() {
      if (!currentFctl || currentDataChunks.length === 0) return;
      const fctl = currentFctl;
      const delayNum = (fctl[20] << 8) | fctl[21];
      const delayDen = (fctl[22] << 8) | fctl[23];
      const delay = (delayNum / (delayDen || 100)) * 1000;
      const fw = (fctl[4] << 24 | fctl[5] << 16 | fctl[6] << 8 | fctl[7]) >>> 0;
      const fh = (fctl[8] << 24 | fctl[9] << 16 | fctl[10] << 8 | fctl[11]) >>> 0;

      const ihdrData = new Uint8Array(ihdrChunk.data);
      const frameIhdr = new Uint8Array(ihdrData.length);
      frameIhdr.set(ihdrData);
      const fihdr = new DataView(frameIhdr.buffer);
      fihdr.setUint32(0, fw);
      fihdr.setUint32(4, fh);

      const ihdrFull = new Uint8Array(12 + frameIhdr.length);
      const ihdrDv = new DataView(ihdrFull.buffer);
      ihdrDv.setUint32(0, frameIhdr.length);
      ihdrFull[4] = 0x49; ihdrFull[5] = 0x48; ihdrFull[6] = 0x44; ihdrFull[7] = 0x52;
      ihdrFull.set(frameIhdr, 8);
      const ihdrCrc = crc32(ihdrFull.slice(4, 8 + frameIhdr.length));
      ihdrDv.setUint32(8 + frameIhdr.length, ihdrCrc);

      frames.push({ pngData: buildPng(ihdrFull, currentDataChunks), delay });
      currentFctl = null;
      currentDataChunks = [];
    }

    let c;
    while ((c = readChunk())) {
      if (c.type === 'IHDR') {
        ihdrChunk = c;
        crowW = dv.getUint32(16);
        crowH = dv.getUint32(20);
      } else if (c.type === 'fcTL') {
        if (currentFctl) flushFrame();
        currentFctl = c.data;
        firstFrame = false;
      } else if (c.type === 'IDAT') {
        if (currentFctl) currentDataChunks.push(c.data);
        else {
          if (!currentFctl && frames.length === 0) {
            currentFctl = null;
          }
          currentDataChunks.push(c.data);
        }
      } else if (c.type === 'fdAT') {
        currentDataChunks.push(c.data.slice(4));
      }
    }
    flushFrame();
    return frames;
  }

  (async function loadCrowFrames() {
    const src = namedAsset('walking_hex.png');
    try {
      const res = await fetch(src);
      const buf = await res.arrayBuffer();
      const frames = parseApngFrames(buf);
      const loaded = await Promise.all(frames.map(f => {
        const blob = new Blob([f.pngData], { type: 'image/png' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        return new Promise(resolve => {
          img.onload = () => resolve({ img, delay: f.delay });
          img.onerror = () => resolve(null);
          img.src = url;
        });
      }));
      crowFrames = loaded.filter(Boolean);
    } catch (e) {
      console.warn('APNG parse failed:', e);
    }
    if (!crowFrames.length) {
      const img = new Image();
      img.src = src;
      await new Promise(r => { img.onload = r; img.onerror = r; });
      if (img.naturalWidth) {
        crowW = img.naturalWidth;
        crowH = img.naturalHeight;
        crowFrames = [{ img, delay: 100 }];
      }
    }
    if (crowFrames.length) freezeCrow();
  })();

  const waterTypes = [
    { key: 'Blue Watering Can', icon: 'watering_can_blue.png' },
    { key: 'Copper Watering Can', icon: 'watering_can_copper.png' },
    { key: 'Gold Watering Can', icon: 'watering_can_gold.png' },
  ];

  function updateWaterBar(econ) {
    const bar = div.querySelector('#hex-water-bar');
    if (!bar) return;
    let html = '';
    for (const { key, icon } of waterTypes) {
      const count = econ.waterInventory.filter(w => w.size === key).reduce((s, w) => s + w.usesLeft, 0);
      if (count > 0) {
        html += `<img src="${namedAsset(icon)}" style="width:20px;height:20px;object-fit:contain">${count}`;
      }
    }
    bar.innerHTML = html;
    bar.style.display = html ? '' : 'none';
  }

  updateWaterBar(econ);

  let unsub = store.subscribe('economy:changed', (econ) => {
    updateWaterBar(econ);
  });

  function renderCrowFrame(timestamp) {
    if (!crowFrames.length) return;
    if (timestamp && crowLastTs) {
      crowFrameTime += timestamp - crowLastTs;
      const frame = crowFrames[crowFrameIdx];
      while (frame && crowFrameTime >= frame.delay) {
        crowFrameTime -= frame.delay;
        crowFrameIdx = (crowFrameIdx + 1) % crowFrames.length;
      }
    }
    crowLastTs = timestamp || 0;

    if (crowDisplay.width !== crowW || crowDisplay.height !== crowH) {
      crowDisplay.width = crowW;
      crowDisplay.height = crowH;
      crowDisplay.style.width = (50 * crowW / crowH) + 'px';
    }
    const f = crowFrames[crowFrameIdx];
    crowDisplayCtx.clearRect(0, 0, crowW, crowH);
    crowDisplayCtx.drawImage(f.img, 0, 0, crowW, crowH);
    const imageData = crowDisplayCtx.getImageData(0, 0, crowW, crowH);
    const d = imageData.data;
    const halfY = Math.floor(crowH / 2);
    for (let i = 0; i < d.length; i += 4) {
      const px = (i / 4);
      const y = Math.floor(px / crowW);
      if (y < halfY) continue;
      const a = d[i + 3];
      if (a === 0) continue;
      const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (a < 150 && lum > 160) { d[i + 3] = Math.round(a * 0.3); continue; }
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      if (lum > 200 && sat < 0.15) d[i + 3] = Math.round(a * 0.3);
    }
    crowDisplayCtx.putImageData(imageData, 0, 0);
  }

  function freezeCrow() {
    if (crowAnimLoop) {
      cancelAnimationFrame(crowAnimLoop);
      crowAnimLoop = null;
    }
    renderCrowFrame();
  }

  function unfreezeCrow() {
    crowLastTs = 0;
    crowFrameTime = 0;
    if (crowAnimLoop) cancelAnimationFrame(crowAnimLoop);
    function loop(ts) {
      renderCrowFrame(ts);
      crowAnimLoop = requestAnimationFrame(loop);
    }
    crowAnimLoop = requestAnimationFrame(loop);
  }

  function positionCrow(worldX, worldY) {
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;
    const camX = crowWorldPos ? crowWorldPos.x : worldX;
    const camY = crowWorldPos ? crowWorldPos.y : worldY;
    const screenX = worldX - camX + w / 2;
    const screenY = worldY - camY + h / 2;
    crowWrapper.style.left = screenX + 'px';
    crowWrapper.style.top = screenY + 'px';
  }

  function renderAt(camPos) {
    const board = getBoard();
    const currentHex = board.hexes.find(h => h.id === board.playerPosition);
    const reachable = board.pendingSteps > 0 ? new Set(currentHex.connections) : new Set();

    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;

    ctx.clearRect(0, 0, w, h);

    const offsetX = w / 2 - camPos.x;
    const offsetY = h / 2 - camPos.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    const visible = [];
    for (const hex of board.hexes) {
      const pos = hexToPixel(hex.q, hex.r);
      if (Math.abs(pos.x - camPos.x) > w && Math.abs(pos.y - camPos.y) > h) continue;

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

    const allPlants = store.getPlants();
    const collectedTypes = new Set(allPlants.filter(p => p.collected && !p.dead).map(p => p.plantType));
    const ofsPlant = getOffsets();
    for (const { hex, pos, state } of visible) {
      if (hex.type !== 'plant') continue;
      const plant = getPlantAtHex(hex.id);
      if (!plant || !plant.ready) continue;
      if (state === 'hidden' && !grownPlantHexes.has(hex.id)) continue;

      const img = loadPlantOverlayImage(plant.image);
      if (!img.complete || !img.naturalWidth) continue;

      const revealed = collectedTypes.has(plant.plantType);
      const source = revealed ? img : plantSilhouetteCache.get(plant.image);
      if (!source) continue;

      const srcW = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
      const srcH = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
      const aspect = srcW / srcH;
      const drawH = ofsPlant.tileH * 0.6;
      const drawW = drawH * aspect;
      const baseY = pos.y + ofsPlant.tileH * 0.05;

      if (state === 'hidden' || state === 'reachable') ctx.globalAlpha = 0.7;
      ctx.drawImage(source, pos.x - drawW / 2, baseY - drawH, drawW, drawH);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    div.querySelector('#steps-left').textContent = board.pendingSteps;
  }

  function crowYOffset(hex) {
    if (!hex) return 0;
    if (hex.type === 'shop') return 22;
    if (hex.type === 'chest') return 22;
    if (getPlantAtHex(hex.id)) return 22;
    return 0;
  }

  function render() {
    const board = getBoard();
    const currentHex = board.hexes.find(h => h.id === board.playerPosition);
    crowWorldPos = hexToPixel(currentHex.q, currentHex.r);
    renderAt(crowWorldPos);
    positionCrow(crowWorldPos.x, crowWorldPos.y + crowYOffset(currentHex));
  }

  function animateMove(fromPos, toPos, ofsFrom, ofsTo, duration) {
    return new Promise(resolve => {
      animating = true;
      unfreezeCrow();
      const start = performance.now();

      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const cx = fromPos.x + (toPos.x - fromPos.x) * ease;
        const cy = fromPos.y + (toPos.y - fromPos.y) * ease;
        crowWorldPos = { x: cx, y: cy };
        renderAt(crowWorldPos);
        const crowOfs = ofsFrom + (ofsTo - ofsFrom) * ease;
        positionCrow(cx, cy + crowOfs);

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          animating = false;
          freezeCrow();
          resolve();
        }
      }

      requestAnimationFrame(tick);
    });
  }

  tilesReady.then(() => {
    render();
  });

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
    if (animating) return;
    const board = getBoard();
    if (board.pendingSteps <= 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const currentHex = board.hexes.find(h => h.id === board.playerPosition);
    const camPos = crowWorldPos || hexToPixel(currentHex.q, currentHex.r);
    const w = rect.width;
    const h = rect.height;
    const offsetX = w / 2 - camPos.x;
    const offsetY = h / 2 - camPos.y;

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

    const fromPos = hexToPixel(currentHex.q, currentHex.r);
    const toPos = hexToPixel(clickedHex.q, clickedHex.r);

    const result = movePlayer(clickedHex.id);
    if (!result) return;

    const dist = Math.hypot(toPos.x - fromPos.x, toPos.y - fromPos.y);
    const duration = Math.max(400, Math.min(900, dist * 8));
    await animateMove(fromPos, toPos, crowYOffset(currentHex), crowYOffset(clickedHex), duration);

    render();

    const { hex, content } = result;

    if (content && (content.seeds > 0 || content.sticks > 0) && !content.chest) {
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

    if (hex.type === 'chest' && content && content.chest) {
      await showRewardPopup({
        crowSprite: '54_very_happy.png',
        title: 'Treasure Chest!',
        seedsAmount: content.seeds,
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

  async function animateSoilPlacement(fromHexId, toHexId, originalTargetType) {
    if (originalTargetType) {
      pendingPlantTiles.set(toHexId, typeToTileKey(originalTargetType));
    }
    const board = getBoard();
    const fromHex = board.hexes.find(h => h.id === fromHexId);
    const toHex = board.hexes.find(h => h.id === toHexId);
    if (!fromHex || !toHex) return;

    const fromPos = hexToPixel(fromHex.q, fromHex.r);
    const toPos = hexToPixel(toHex.q, toHex.r);
    const seedImg = images['dirt_seed'];
    if (!seedImg || !seedImg.complete) return;

    animating = true;

    await new Promise(resolve => {
      const duration = 1200;
      const start = performance.now();

      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const camX = fromPos.x + (toPos.x - fromPos.x) * ease;
        const camY = fromPos.y + (toPos.y - fromPos.y) * ease;
        crowWorldPos = { x: camX, y: camY };
        renderAt(crowWorldPos);
        positionCrow(fromPos.x, fromPos.y + crowYOffset(fromHex));

        const w = canvas.width / window.devicePixelRatio;
        const h = canvas.height / window.devicePixelRatio;
        const seedScreenX = toPos.x + (w / 2 - camX);
        const seedScreenY = toPos.y + (h / 2 - camY);
        const seedT = Math.min(1, t / 0.6);
        const seedEase = seedT < 0.5 ? 2 * seedT * seedT : 1 - Math.pow(-2 * seedT + 2, 2) / 2;
        const fromScreenX = fromPos.x + (w / 2 - camX);
        const fromScreenY = fromPos.y + (h / 2 - camY);
        const sx = fromScreenX + (seedScreenX - fromScreenX) * seedEase;
        const sy = fromScreenY + (seedScreenY - fromScreenY) * seedEase;
        const arcOffset = -Math.sin(seedT * Math.PI) * 20;
        drawTile(ctx, sx, sy + arcOffset, seedImg, false);

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(tick);
    });

    pendingPlantTiles.delete(toHexId);
    crowWorldPos = { x: toPos.x, y: toPos.y };
    renderAt(crowWorldPos);
    positionCrow(fromPos.x, fromPos.y + crowYOffset(fromHex));
    await new Promise(r => setTimeout(r, 800));

    await new Promise(resolve => {
      const duration = 600;
      const start = performance.now();
      const playerPos = hexToPixel(fromHex.q, fromHex.r);

      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const camX = toPos.x + (playerPos.x - toPos.x) * ease;
        const camY = toPos.y + (playerPos.y - toPos.y) * ease;
        crowWorldPos = { x: camX, y: camY };
        renderAt(crowWorldPos);
        positionCrow(playerPos.x, playerPos.y + crowYOffset(fromHex));

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(tick);
    });

    animating = false;

    setTimeout(() => {
      if (!div.isConnected) return;
      grownPlantHexes.add(toHexId);
      render();
    }, 500);
  }

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
        btn.addEventListener('click', async () => {
          const idx = parseInt(btn.dataset.waterIdx);
          const option = availableWater[idx];
          if (option && buyWater(option)) {
            await showRewardPopup({
              crowSprite: '54_very_happy.png',
              title: 'Purchased!',
              details: `${option.name} — ${option.uses} use${option.uses > 1 ? 's' : ''}`,
            });
            modal.close();
            resolve();
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
    const collectedTypes = new Set(plants.filter(p => p.collected && !p.dead).map(p => p.plantType));
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
    const seenTypes = new Set(plants.map(p => p.plantType));
    const unseenAffordable = pool.filter(p => !seenTypes.has(p.id) && p.cost <= seeds);
    const shuffledUnseen = seededShuffle(unseenAffordable, hexId * 3 + 17);
    if (shuffledUnseen.length > 0) picks.push(shuffledUnseen[0]);

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
          const planted = plantSeed(option, hexId);

          await showRewardPopup({
            crowSprite: '35_planting_2.png',
            title: 'Planted!',
            details: 'Find it further on the path!',
            extraImage: plantAsset(option.image),
            extraImageStyle: 'filter:brightness(0)',
          });

          modal.close();
          await animateSoilPlacement(hexId, planted.hexId, planted.originalTargetType);
          resolve();
        });
      });

      modal.sheet.querySelector('#soil-close').addEventListener('click', () => {
        modal.close();
        resolve();
      });
    });
  }

  function showWaterChoiceModal(plant, remaining) {
    return new Promise((resolve) => {
      const econ = store.getEconomy();
      const waterByType = {};
      for (const w of econ.waterInventory) {
        if (w.usesLeft > 0) {
          waterByType[w.size] = (waterByType[w.size] || 0) + w.usesLeft;
        }
      }

      const canTypes = [
        { size: 'Blue Watering Can', icon: 'watering_can_blue.png', label: 'Blue Can' },
        { size: 'Copper Watering Can', icon: 'watering_can_copper.png', label: 'Copper Can' },
        { size: 'Gold Watering Can', icon: 'watering_can_gold.png', label: 'Gold Can' },
      ];
      const available = canTypes.filter(c => waterByType[c.size] > 0);

      const plantImg = plant.image ? plantAsset(plant.image) : null;
      const html = `
        <h3 style="font-size:18px;font-weight:700;margin-bottom:16px;text-align:center">
          ${plantImg ? `<img src="${plantImg}" style="max-height:60px;display:block;margin:0 auto 8px;${plant.ready ? '' : 'filter:brightness(0)'}">` : ''}
          Water Your Plant
        </h3>
        <p style="text-align:center;color:var(--text-light);margin-bottom:16px">Needs ${remaining} more watering${remaining > 1 ? 's' : ''}</p>

        ${available.length > 0 ? available.map(c => `
          <div style="display:flex;align-items:center;padding:12px;background:var(--bg);border-radius:var(--radius-xs);margin-bottom:8px;gap:12px">
            <img src="${namedAsset(c.icon)}" style="width:36px;height:36px;object-fit:contain;flex-shrink:0">
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px">${c.label}</div>
              <div style="font-size:12px;color:var(--text-light)">${waterByType[c.size]} use${waterByType[c.size] > 1 ? 's' : ''} left</div>
            </div>
            <button class="btn btn--primary water-choice-btn" data-size="${c.size}" style="padding:8px 16px;font-size:14px;flex-shrink:0">Use</button>
          </div>
        `).join('') : '<p style="text-align:center;color:var(--text-light);margin-bottom:8px">No watering cans in inventory</p>'}

        <button class="btn btn--ghost" style="width:100%;margin-top:12px" id="water-skip">Don't Water</button>
      `;

      const modal = showModal(html, () => resolve(null));

      modal.sheet.querySelectorAll('.water-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          resolve(btn.dataset.size);
          modal.overlay.remove();
        });
      });

      modal.sheet.querySelector('#water-skip').addEventListener('click', () => {
        resolve(null);
        modal.overlay.remove();
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
        render();
        navigate('nest');
        return;
      }
    } else {
      const remaining = plant.wateringsNeeded - plant.wateringsGiven;
      const chosenWater = await showWaterChoiceModal(plant, remaining);

      if (chosenWater) {
        const oldHexId = plant.hexId;
        const watered = waterPlant(plant.id, chosenWater);
        if (watered) {
          const crowSprite = remaining > 2 ? '48_watering_large.png' : '37_watering_small.png';
          const left = watered.wateringsNeeded - watered.wateringsGiven;
          await showRewardPopup({
            crowSprite,
            title: 'Watered!',
            details: watered.ready
              ? 'Your plant is growing! Find it further ahead to collect it.'
              : `Your plant needs ${left} more watering${left > 1 ? 's' : ''}. Find it further ahead!`,
          });
          if (watered.hexId !== oldHexId) {
            await animateSoilPlacement(hexId, watered.hexId, watered.originalTargetType);
          }
        }
      } else {
        const result = neglectPlant(plant.id);
        if (result && result.died) {
          await showRewardPopup({
            crowSprite: '37_watering_small.png',
            title: 'Plant Died!',
            details: 'You had no water and the plant withered away...',
          });
        } else if (result) {
          const left = result.plant.wateringsNeeded - result.plant.wateringsGiven;
          await showRewardPopup({
            crowSprite: '37_watering_small.png',
            title: 'No Water!',
            details: `The plant lost some growth. It needs ${left} watering${left > 1 ? 's' : ''} now. Find it further ahead!`,
          });
          if (result.fromHexId && result.toHexId) {
            await animateSoilPlacement(hexId, result.toHexId, result.originalTargetType);
          }
        }
      }
    }
  }

  window.addEventListener('resize', () => { resize(); render(); });

  return () => {
    if (unsub) unsub();
    if (crowAnimLoop) cancelAnimationFrame(crowAnimLoop);
    if (editorPanel) editorPanel.remove();
    removeReopenButton();
  };
}
