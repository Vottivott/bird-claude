import * as store from '../store.js';
import { getBoard, movePlayer, getConnectedHexes } from '../models/hexboard.js';
import { getPlantAtHex, waterPlant, collectPlant, plantSeed } from '../models/plant.js';
import { SHOP_ITEMS, PLANT_OPTIONS, WATER_OPTIONS, canAfford, buyShopItem, buyWater } from '../models/economy.js';
import { showModal } from '../ui/modal.js';
import { showRewardPopup } from '../ui/toast.js';
import { namedAsset } from '../utils/assets.js';

const HEX_SIZE = 40;
const SQRT3 = Math.sqrt(3);

function hexToPixel(q, r) {
  const x = HEX_SIZE * (3 / 2 * q);
  const y = HEX_SIZE * (SQRT3 / 2 * q + SQRT3 * r) * 0.85;
  return { x, y };
}

function drawHex(ctx, cx, cy, size, state, type) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    const x = cx + size * Math.cos(angle);
    const y = cy + size * Math.sin(angle) * 0.85;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();

  if (state === 'hidden') {
    ctx.fillStyle = '#E0DCD0';
    ctx.fill();
    ctx.strokeStyle = '#C8C4B8';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Draw ?
    ctx.fillStyle = '#AAA';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', cx, cy);
  } else if (state === 'revealed') {
    let fillColor = '#F0F1F4';
    if (type === 'shop') fillColor = '#FFE4C4';
    else if (type === 'soil') fillColor = '#D4E8C4';
    else if (type === 'plant') fillColor = '#E4F0D4';
    else if (type === 'start') fillColor = '#E8E4FF';

    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = '#C8C4B8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (type === 'shop') {
      ctx.fillStyle = '#A0785A';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SHOP', cx, cy);
    } else if (type === 'soil') {
      ctx.fillStyle = '#6FB870';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PLANT', cx, cy);
    } else if (type === 'plant') {
      ctx.fillStyle = '#4A8A4A';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u{1F331}', cx, cy);
    }
  } else if (state === 'current') {
    ctx.fillStyle = '#8A9AAD';
    ctx.fill();
    ctx.strokeStyle = '#5E6B7A';
    ctx.lineWidth = 3;
    ctx.stroke();
  } else if (state === 'reachable') {
    ctx.fillStyle = '#F0F1F4';
    ctx.fill();
    ctx.strokeStyle = '#D4A830';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    let label = '?';
    if (type === 'shop') label = 'SHOP';
    else if (type === 'soil') label = 'PLANT';
    else if (type === 'plant') label = '\u{1F331}';

    ctx.fillStyle = type === 'shop' ? '#A0785A' : type === 'soil' ? '#6FB870' : '#AAA';
    ctx.font = type === 'plant' ? '18px sans-serif' : 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
  }
}

export function mount(container) {
  const board = getBoard();
  const econ = store.getEconomy();

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

    // Camera offset: center on player
    const playerPos = hexToPixel(currentHex.q, currentHex.r);
    const offsetX = w / 2 - playerPos.x;
    const offsetY = h / 2 - playerPos.y;

    ctx.save();
    ctx.translate(offsetX, offsetY);

    // Draw connections
    for (const hex of board.hexes) {
      const pos = hexToPixel(hex.q, hex.r);
      for (const connId of hex.connections) {
        const connHex = board.hexes.find(h => h.id === connId);
        if (connHex) {
          const connPos = hexToPixel(connHex.q, connHex.r);
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y);
          ctx.lineTo(connPos.x, connPos.y);
          ctx.strokeStyle = '#DDD';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    // Draw hexes
    for (const hex of board.hexes) {
      const pos = hexToPixel(hex.q, hex.r);

      if (Math.abs(pos.x - playerPos.x) > w && Math.abs(pos.y - playerPos.y) > h) continue;

      let state = 'hidden';
      if (hex.id === board.playerPosition) state = 'current';
      else if (reachable.has(hex.id)) state = 'reachable';
      else if (hex.revealed) state = 'revealed';

      drawHex(ctx, pos.x, pos.y, HEX_SIZE, state, hex.type);
    }

    // Draw crow on current hex
    const crowPos = hexToPixel(currentHex.q, currentHex.r);
    ctx.fillStyle = '#3A3A3A';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('\u{1F426}\u{200D}\u{2B1B}', crowPos.x, crowPos.y);

    ctx.restore();

    div.querySelector('#steps-left').textContent = board.pendingSteps;
  }

  render();

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

    // Find which reachable hex was clicked
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

    // Show what was found
    if (content && (content.seeds > 0 || content.sticks > 0)) {
      let crowSprite = '52_happy1.png';
      let details = [];

      if (content.seeds > 0) {
        crowSprite = content.seeds > 1 ? '33_find_seeds.png' : '31_find_seed.png';
        details.push(`+${content.seeds} seed${content.seeds > 1 ? 's' : ''}`);
      }
      if (content.sticks > 0) {
        crowSprite = content.sticks > 1 ? '41_find_sticks.png' : '40_find_stick.png';
        details.push(`+${content.sticks} stick${content.sticks > 1 ? 's' : ''}`);
      }

      await showRewardPopup({
        crowSprite,
        title: content.sticks > 0 ? 'Found sticks!' : 'Found seeds!',
        details,
        seedsAmount: content.seeds > 0 ? content.seeds : undefined,
        sticksAmount: content.sticks > 0 ? content.sticks : undefined,
      });
    }

    // Handle special hex types
    if (hex.type === 'shop') {
      await handleShop();
    } else if (hex.type === 'soil') {
      await handleSoil(hex.id);
    } else if (hex.type === 'plant') {
      await handlePlantEncounter(hex.id);
    }

    render();
  });

  async function handleShop() {
    return new Promise((resolve) => {
      const econ = store.getEconomy();
      const waterCount = store.getWaterCount();
      const rng = Math.random();
      const availableWater = [WATER_OPTIONS[0]];
      if (rng > 0.5) availableWater.push(WATER_OPTIONS[1]);
      if (rng > 0.8) availableWater.push(WATER_OPTIONS[2]);

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

  async function handleSoil(hexId) {
    return new Promise((resolve) => {
      const econ = store.getEconomy();

      const html = `
        <h3 style="font-size:18px;font-weight:700;margin-bottom:16px;text-align:center">
          <img src="${namedAsset('34_planting_1.png')}" style="max-height:80px;display:block;margin:0 auto 8px">
          Plant a Seed
        </h3>
        <p style="text-align:center;color:var(--text-light);margin-bottom:16px">You have <strong>${econ.seeds}</strong> seeds</p>

        ${PLANT_OPTIONS.map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;background:var(--bg);border-radius:var(--radius-xs);margin-bottom:8px">
            <div>
              <div style="font-weight:600">${p.name}</div>
              <div style="font-size:12px;color:var(--text-light)">Needs ${p.wateringsNeeded} watering${p.wateringsNeeded > 1 ? 's' : ''}</div>
            </div>
            <button class="btn btn--accent plant-btn" data-plant-id="${p.id}" ${!canAfford(p.cost) ? 'disabled style="opacity:0.5"' : ''} style="padding:8px 16px;font-size:14px">${p.cost} seeds</button>
          </div>
        `).join('')}

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
            details: `${option.name} planted! Find it further on the path.`,
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

    if (plant.ready) {
      const collected = collectPlant(plant.id);
      if (collected) {
        await showRewardPopup({
          crowSprite: '54_very_happy.png',
          title: 'Plant Ready!',
          details: `Collected ${collected.name}! Check your nest inventory.`,
        });
      }
    } else {
      const waterCount = store.getWaterCount();
      const watered = waterCount > 0 ? waterPlant(plant.id) : null;

      if (watered) {
        const crowSprite = plant.wateringsNeeded > 2 ? '48_watering_large.png' : '37_watering_small.png';
        await showRewardPopup({
          crowSprite,
          title: 'Watered!',
          details: watered.ready
            ? `${watered.name} is now ready to collect!`
            : `${watered.name} needs ${watered.wateringsNeeded - watered.wateringsGiven} more watering${watered.wateringsNeeded - watered.wateringsGiven > 1 ? 's' : ''}. Find it further ahead!`,
        });
      } else {
        await showRewardPopup({
          crowSprite: '37_watering_small.png',
          title: 'Needs Water!',
          details: waterCount === 0
            ? `This ${plant.name} needs water! Buy some at a shop.`
            : `This ${plant.name} needs ${plant.wateringsNeeded - plant.wateringsGiven} more watering${plant.wateringsNeeded - plant.wateringsGiven > 1 ? 's' : ''}.`,
        });
      }
    }
  }

  window.addEventListener('resize', () => { resize(); render(); });

  return () => {
    if (unsub) unsub();
  };
}
