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
    <div class="nest-scene" style="position:relative;border-radius:var(--radius);overflow:hidden;border:2px solid #ddd">
      <img src="${nestAsset(nestLevel.image)}" style="width:100%;display:block" alt="${nestLevel.name}">
      <div id="furniture-display" style="position:absolute;inset:0"></div>
    </div>

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

    ${nest.inventory.length > 0 ? `
      <div class="card">
        <div class="card__title">Inventory (tap to place in nest)</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px" id="inventory-list">
          ${nest.inventory.map((item, idx) => {
            const img = getItemImage(item);
            return `
              <button class="inventory-item" data-idx="${idx}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border:2px solid #e0e0e0;border-radius:var(--radius-xs);background:var(--bg);cursor:pointer;width:80px">
                ${img ? `<img src="${img}" style="width:48px;height:48px;object-fit:contain">` : `<div style="width:48px;height:48px;background:#ddd;border-radius:4px"></div>`}
                <span style="font-size:11px;text-align:center;line-height:1.2">${item.name}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    ${nest.furniture.length > 0 ? `
      <div class="card">
        <div class="card__title">Placed Items (tap to move)</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px" id="placed-list">
          ${nest.furniture.map((item, idx) => {
            const img = getItemImage(item);
            return `
              <button class="placed-item" data-idx="${idx}" style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;border:2px solid var(--green);border-radius:var(--radius-xs);background:var(--bg);cursor:pointer;width:80px">
                ${img ? `<img src="${img}" style="width:48px;height:48px;object-fit:contain">` : `<div style="width:48px;height:48px;background:#ddd;border-radius:4px"></div>`}
                <span style="font-size:11px;text-align:center;line-height:1.2">${item.name}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

  `;

  container.appendChild(div);

  const furnitureDisplay = div.querySelector('#furniture-display');
  if (furnitureDisplay && nest.furniture) {
    nest.furniture.forEach(item => {
      const img = getItemImage(item);
      if (!img) return;
      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute;
        left:${item.position.x * 100}%;
        bottom:${item.position.y * 100}%;
        transform:translate(-50%, 50%);
      `;
      el.innerHTML = `<img src="${img}" style="width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.3))">`;
      el.title = item.name;
      furnitureDisplay.appendChild(el);
    });
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
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const item = nest.inventory[idx];
      if (!item) return;
      const x = 0.15 + Math.random() * 0.7;
      const y = Math.random() * 0.8;
      placeFurniture(item.itemId, x, y);
      container.innerHTML = '';
      mount(container);
    });
  });

  div.querySelectorAll('.placed-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const nest = store.getNest();
      const item = nest.furniture[idx];
      if (!item) return;
      nest.furniture.splice(idx, 1);
      nest.inventory.push({ itemId: item.itemId, name: item.name, type: item.type, image: item.image });
      store.setNest(nest);
      container.innerHTML = '';
      mount(container);
    });
  });
}
