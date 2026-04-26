import * as store from '../store.js';
import { NEST_LEVELS, getMaxAffordableLevel, getNextUnlock, getCurrentNestInfo, setNestLevel, placeFurniture } from '../models/nest.js';
import { getPlantOption } from '../models/economy.js';
import { namedAsset, plantAsset, nestAsset, scenePropAsset } from '../utils/assets.js';
import { SHOP_ITEMS } from '../models/economy.js';

function getItemImage(item) {
  if (item.type === 'plant' && item.image) return plantAsset(item.image);
  if (item.type === 'furniture' && item.image) return scenePropAsset(item.image);
  const option = getPlantOption(item.itemId);
  if (option) return plantAsset(option.image);
  const shopItem = SHOP_ITEMS.find(s => s.id === item.itemId);
  if (shopItem) return scenePropAsset(shopItem.image);
  return null;
}

function startSeedParticles(scene) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2';
  scene.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const seedImg = new Image();
  seedImg.src = plantAsset('dandelion_seed_detached_top_right.png');

  const particles = [];
  let animId = null;
  let lastTs = 0;
  let plantSpawnAcc = 0;
  let edgeSpawnAcc = 0;
  let W = 0, H = 0;
  let seeded = false;

  function syncSize() {
    const r = scene.getBoundingClientRect();
    if (r.height < 20) return false;
    const dpr = window.devicePixelRatio || 1;
    W = r.width;
    H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    return true;
  }

  function getSeedheadPositions() {
    const n = store.getNest();
    return n.furniture
      .filter(item => item.itemId === 'dandelion_seedhead')
      .map(item => item.position);
  }

  function plantOrigin(pos) {
    const px = pos.x * W;
    const py = (1 - pos.y) * H - 42;
    return { px, py };
  }

  function spawnFromPlant() {
    const positions = getSeedheadPositions();
    if (positions.length === 0) return;
    const pos = positions[Math.floor(Math.random() * positions.length)];
    const { px, py } = plantOrigin(pos);
    const r = 22;
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * r;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const speed = 8 + Math.random() * 12;
    particles.push({
      x: px + Math.cos(a) * d,
      y: py + Math.sin(a) * d,
      vx: Math.cos(angle) * speed + 10 + Math.random() * 8,
      vy: Math.sin(angle) * speed,
      rotation: 0,
      baseAngle: (Math.random() - 0.5) * 0.2,
      scale: 0.5,
      targetScale: 1.1 + Math.random() * 0.9,
      phase: Math.random() * Math.PI * 2,
      wobbleAmp: 8 + Math.random() * 12,
      opacity: 1.0,
      age: 0,
      maxAge: 5 + Math.random() * 7,
      fromPlant: true,
    });
  }

  function spawnFromEdge() {
    particles.push({
      x: -5,
      y: Math.random() * H,
      vx: 10 + Math.random() * 12,
      vy: -(1 + Math.random() * 3),
      rotation: 0,
      baseAngle: (Math.random() - 0.5) * 0.2,
      scale: 1.1 + Math.random() * 0.9,
      targetScale: 0,
      phase: Math.random() * Math.PI * 2,
      wobbleAmp: 6 + Math.random() * 10,
      opacity: 0,
      age: 0,
      maxAge: 8 + Math.random() * 10,
      fromPlant: false,
    });
  }

  function tick(ts) {
    if (!lastTs) { lastTs = ts; animId = requestAnimationFrame(tick); return; }
    const dt = Math.min((ts - lastTs) / 1000, 0.1);
    lastTs = ts;

    syncSize();
    if (H < 20) { animId = requestAnimationFrame(tick); return; }

    if (!seeded) {
      seeded = true;
      const seedPositions = getSeedheadPositions();
      for (let i = 0; i < 3 && seedPositions.length > 0; i++) {
        const pos = seedPositions[Math.floor(Math.random() * seedPositions.length)];
        const { px, py } = plantOrigin(pos);
        const drift = Math.random() * W * 0.5;
        particles.push({
          x: px + drift,
          y: py + (Math.random() - 0.4) * H * 0.2,
          vx: 10 + Math.random() * 12,
          vy: -(1 + Math.random() * 3),
          rotation: 0,
          baseAngle: (Math.random() - 0.5) * 0.2,
          scale: 1.1 + Math.random() * 0.9,
          phase: Math.random() * Math.PI * 2,
          wobbleAmp: 6 + Math.random() * 10,
          opacity: 0.7 + Math.random() * 0.3,
          age: 1 + Math.random() * 4,
          maxAge: 6 + Math.random() * 8,
          fromPlant: true,
        });
      }
    }

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (!seedImg.complete || !seedImg.naturalWidth) {
      animId = requestAnimationFrame(tick);
      return;
    }

    const windGust = Math.sin(ts * 0.00025) * 3;

    plantSpawnAcc += dt;
    if (plantSpawnAcc > 1.3 + Math.random() * 1.7) {
      plantSpawnAcc = 0;
      spawnFromPlant();
    }
    edgeSpawnAcc += dt;
    if (edgeSpawnAcc > 0.65 + Math.random() * 0.85) {
      edgeSpawnAcc = 0;
      spawnFromEdge();
    }

    const imgAspect = seedImg.naturalWidth / seedImg.naturalHeight;

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;

      if (p.targetScale && p.scale < p.targetScale) {
        p.scale = Math.min(p.scale + dt * 1.5, p.targetScale);
      }
      p.x += (p.vx + windGust) * dt;
      p.y += p.vy * dt + Math.sin(p.phase + p.age * 1.5) * p.wobbleAmp * dt;
      p.x += Math.cos(p.phase * 1.3 + p.age * 0.9) * p.wobbleAmp * 0.3 * dt;

      const lean = Math.atan2(p.vy, p.vx) * 0.15;
      const sway = Math.sin(p.phase + p.age * 1.2) * 0.12;
      p.rotation = p.baseAngle + lean + sway;

      if (p.fromPlant && p.age > 1) {
        p.vy += 2 * dt;
        if (p.vy > 3) p.vy = 3;
      }

      if (p.age < 0.15) {
        p.opacity = Math.max(p.opacity, (p.age / 0.15) * 1.0);
      } else {
        p.opacity = Math.min(p.opacity + dt * 2, 1.0);
      }

      if (p.x > W + 10 || p.x < -20 || p.y < -20 || p.y > H + 20) {
        particles.splice(i, 1);
        continue;
      }

      const drawH = 16 * p.scale;
      const drawW = drawH * imgAspect;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.drawImage(seedImg, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }

    animId = requestAnimationFrame(tick);
  }

  animId = requestAnimationFrame(tick);

  const onResize = () => syncSize();
  window.addEventListener('resize', onResize);

  return () => {
    if (animId) cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
  };
}

export function mount(container) {
  const nestInfo = getCurrentNestInfo();
  const econ = store.getEconomy();
  const maxLevel = getMaxAffordableLevel();
  const nextUnlock = getNextUnlock();
  const nestLevel = NEST_LEVELS[nestInfo.level] || NEST_LEVELS[0];
  const nest = store.getNest();

  const div = document.createElement('div');
  div.className = 'view';

  div.innerHTML = `
    <div class="nest-scene" id="nest-scene" style="position:relative;border-radius:var(--radius);overflow:hidden;border:2px solid #ddd;touch-action:none">
      <img src="${nestAsset(nestLevel.image)}" style="width:100%;display:block" alt="${nestLevel.name}">
      <div id="furniture-display" style="position:absolute;inset:0"></div>
    </div>
    ${nest.furniture.length > 0 ? '<div style="text-align:center;font-size:12px;color:var(--text-light);margin-top:4px">Drag to move, tap to return to inventory</div>' : ''}

    ${nest.inventory.length > 0 ? `
      <div class="card" style="margin-top:8px">
        <div class="card__title">Inventory (drag to nest or tap)</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px" id="inventory-list">
          ${nest.inventory.map((item, idx) => {
            const img = getItemImage(item);
            return `
              <button class="inventory-item" data-idx="${idx}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border:2px solid #e0e0e0;border-radius:var(--radius-xs);background:var(--bg);cursor:grab;width:80px;touch-action:none">
                ${img ? `<img src="${img}" style="width:48px;height:48px;object-fit:contain;pointer-events:none">` : `<div style="width:48px;height:48px;background:#ddd;border-radius:4px"></div>`}
                <span style="font-size:11px;text-align:center;line-height:1.2;pointer-events:none">${item.name}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    <div class="nest-info">
      <div class="nest-level">
        <div class="nest-level__current">${nestLevel.name}</div>
        <div class="nest-level__next">
          <img src="${namedAsset('stick_pile.png')}" style="width:20px;height:20px;vertical-align:middle">
          ${econ.totalSticksEarned} sticks total
        </div>
      </div>
    </div>

    ${nextUnlock ? `
      <div class="card">
        <div class="card__title">Next Nest</div>
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:60px;height:60px;border-radius:var(--radius-xs);overflow:hidden;flex-shrink:0">
            <img src="${nestAsset(nextUnlock.image)}" style="width:100%;height:100%;object-fit:cover;${maxLevel < nextUnlock.level ? 'filter:brightness(0.3) blur(2px)' : ''}" alt="">
          </div>
          <div style="flex:1">
            <div style="font-weight:600">${maxLevel >= nextUnlock.level ? nextUnlock.name : '???'}</div>
            <div style="font-size:13px;color:var(--text-light)">${nextUnlock.sticksRequired} sticks needed (${Math.max(0, nextUnlock.sticksRequired - econ.totalSticksEarned)} more)</div>
            <div style="height:6px;background:#EEE;border-radius:3px;margin-top:6px;overflow:hidden">
              <div style="height:100%;background:var(--brown);border-radius:3px;width:${Math.min(100, (econ.totalSticksEarned / nextUnlock.sticksRequired) * 100)}%"></div>
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    ${maxLevel > 0 && maxLevel > nestInfo.level ? `
      <div class="card" style="border:2px solid var(--accent)">
        <div style="text-align:center">
          <div style="font-weight:600;margin-bottom:8px">Nest Upgrade Available!</div>
          <button class="btn btn--accent" id="btn-upgrade">Upgrade to ${NEST_LEVELS[Math.min(maxLevel, NEST_LEVELS.length - 1)].name}</button>
        </div>
      </div>
    ` : ''}
  `;

  container.appendChild(div);

  const nestScene = div.querySelector('#nest-scene');
  const furnitureDisplay = div.querySelector('#furniture-display');
  let cleanupParticles = null;

  function renderPlacedItems() {
    furnitureDisplay.innerHTML = '';
    const currentNest = store.getNest();
    currentNest.furniture.forEach((item, idx) => {
      const imgSrc = getItemImage(item);
      if (!imgSrc) return;
      const el = document.createElement('div');
      el.dataset.idx = idx;
      el.style.cssText = `
        position:absolute;
        left:${item.position.x * 100}%;
        bottom:${item.position.y * 100}%;
        transform:translate(-50%, 50%);
        touch-action:none;
        cursor:grab;
        z-index:1;
      `;
      const useTopShadow = item.itemId !== 'swimming_pool';
      el.innerHTML = useTopShadow
        ? `<div style="position:relative;width:100px;height:100px">
            <div style="position:absolute;top:-10px;left:5px;right:5px;height:65%;background:radial-gradient(ellipse 90% 80% at 50% 40%, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 50%, transparent 75%);filter:blur(6px);pointer-events:none"></div>
            <img src="${imgSrc}" style="position:relative;width:100%;height:100%;object-fit:contain;pointer-events:none">
          </div>`
        : `<div style="width:100px;height:100px">
            <img src="${imgSrc}" style="width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));pointer-events:none">
          </div>`;

      let dragging = false;
      let startX, startY, origX, origY;

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragging = false;
        startX = e.clientX;
        startY = e.clientY;
        const current = store.getNest().furniture[idx];
        if (!current) return;
        origX = current.position.x;
        origY = current.position.y;
        el.setPointerCapture(e.pointerId);
        el.style.cursor = 'grabbing';
        el.style.zIndex = '10';
      });

      el.addEventListener('pointermove', (e) => {
        if (startX === undefined) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) dragging = true;
        if (!dragging) return;

        const rect = furnitureDisplay.getBoundingClientRect();
        const newX = Math.max(0, Math.min(1, origX + dx / rect.width));
        const newY = Math.max(0, Math.min(1, origY - dy / rect.height));
        el.style.left = `${newX * 100}%`;
        el.style.bottom = `${newY * 100}%`;
      });

      el.addEventListener('pointerup', (e) => {
        el.style.cursor = 'grab';
        el.style.zIndex = '1';

        if (!dragging) {
          const n = store.getNest();
          const removed = n.furniture[idx];
          if (!removed) return;
          n.furniture.splice(idx, 1);
          n.inventory.push({ itemId: removed.itemId, name: removed.name, type: removed.type, image: removed.image });
          store.setNest(n);
          container.innerHTML = '';
          mount(container);
          return;
        }

        const rect = furnitureDisplay.getBoundingClientRect();
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newX = Math.max(0, Math.min(1, origX + dx / rect.width));
        const newY = Math.max(0, Math.min(1, origY - dy / rect.height));

        const n = store.getNest();
        if (n.furniture[idx]) {
          n.furniture[idx].position.x = newX;
          n.furniture[idx].position.y = newY;
          store.setNest(n);
        }

        startX = undefined;
        dragging = false;
      });

      el.addEventListener('pointercancel', () => {
        el.style.cursor = 'grab';
        el.style.zIndex = '1';
        startX = undefined;
        dragging = false;
      });

      furnitureDisplay.appendChild(el);
    });
  }

  renderPlacedItems();

  const hasSeedheads = nest.furniture.some(item => item.itemId === 'dandelion_seedhead');
  if (hasSeedheads) {
    cleanupParticles = startSeedParticles(nestScene);
  }

  const upgradeBtn = div.querySelector('#btn-upgrade');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      setNestLevel(maxLevel);
      container.innerHTML = '';
      mount(container);
    });
  }

  div.querySelectorAll('.inventory-item').forEach(btn => {
    let ghost = null;
    let dragging = false;
    let startX, startY;

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = false;
      startX = e.clientX;
      startY = e.clientY;
      btn.setPointerCapture(e.pointerId);
    });

    btn.addEventListener('pointermove', (e) => {
      if (startX === undefined) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        dragging = true;
        const idx = parseInt(btn.dataset.idx);
        const item = nest.inventory[idx];
        const imgSrc = getItemImage(item);
        if (imgSrc) {
          ghost = document.createElement('div');
          ghost.style.cssText = 'position:fixed;pointer-events:none;z-index:100;transform:translate(-50%,-50%);opacity:0.85';
          ghost.innerHTML = `<img src="${imgSrc}" style="width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.3))">`;
          document.body.appendChild(ghost);
        }
        btn.style.opacity = '0.3';
      }
      if (!dragging) return;
      if (ghost) {
        ghost.style.left = e.clientX + 'px';
        ghost.style.top = e.clientY + 'px';
      }
    });

    btn.addEventListener('pointerup', (e) => {
      btn.style.opacity = '';
      if (ghost) { ghost.remove(); ghost = null; }

      if (!dragging) {
        const idx = parseInt(btn.dataset.idx);
        const item = nest.inventory[idx];
        if (!item) { startX = undefined; return; }
        placeFurniture(item.itemId, 0.5, 0.4);
        container.innerHTML = '';
        mount(container);
        return;
      }

      const sceneRect = nestScene.getBoundingClientRect();
      if (e.clientX >= sceneRect.left && e.clientX <= sceneRect.right &&
          e.clientY >= sceneRect.top && e.clientY <= sceneRect.bottom) {
        const x = (e.clientX - sceneRect.left) / sceneRect.width;
        const y = 1 - (e.clientY - sceneRect.top) / sceneRect.height;
        const idx = parseInt(btn.dataset.idx);
        const item = nest.inventory[idx];
        if (item) {
          placeFurniture(item.itemId, Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
          container.innerHTML = '';
          mount(container);
          return;
        }
      }

      startX = undefined;
      dragging = false;
    });

    btn.addEventListener('pointercancel', () => {
      btn.style.opacity = '';
      if (ghost) { ghost.remove(); ghost = null; }
      startX = undefined;
      dragging = false;
    });
  });

  return () => {
    if (cleanupParticles) cleanupParticles();
  };
}
