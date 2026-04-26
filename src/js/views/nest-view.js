import * as store from '../store.js';
import { NEST_LEVELS, getMaxAffordableLevel, getNextUnlock, getCurrentNestInfo, setNestLevel, placeFurniture } from '../models/nest.js';
import { getPlantOption } from '../models/economy.js';
import { namedAsset, plantAsset, nestAsset } from '../utils/assets.js';

function getItemImage(item) {
  if (item.type === 'plant' && item.image) return plantAsset(item.image);
  const option = getPlantOption(item.itemId);
  if (option) return plantAsset(option.image);
  return null;
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
      el.innerHTML = `<img src="${imgSrc}" style="width:100px;height:100px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));pointer-events:none">`;

      let dragging = false;
      let startX, startY, origX, origY;

      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        dragging = false;
        startX = e.clientX;
        startY = e.clientY;
        origX = item.position.x;
        origY = item.position.y;
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
}
