import * as store from '../store.js';
import { NEST_LEVELS, getMaxAffordableLevel, getNextUnlock, getCurrentNestInfo, setNestLevel, placeFurniture } from '../models/nest.js';
import { namedAsset } from '../utils/assets.js';

const NEST_SCENES = [
  { bg: 'linear-gradient(180deg, #87CEEB 0%, #98D8A0 50%, #7BC47E 100%)', ground: '#7BC47E', label: 'Ground Nest' },
  { bg: 'linear-gradient(180deg, #87CEEB 0%, #6BB5D4 40%, #A0785A 70%, #7BC47E 100%)', ground: '#7BC47E', label: 'Tree Nest' },
  { bg: 'linear-gradient(180deg, #87CEEB 0%, #6BB5D4 30%, #A0785A 65%, #7BC47E 100%)', ground: '#7BC47E', label: 'Large Tree Nest' },
  { bg: 'linear-gradient(180deg, #6BAACC 0%, #87CEEB 30%, #A0785A 60%, #7BC47E 100%)', ground: '#7BC47E', label: 'Grand Nest' },
];

const FURNITURE_DISPLAY = {
  swimming_pool: { label: 'Swimming Pool', color: '#5BC0DE', w: 50, h: 30 },
  sunchair: { label: 'Sunchair', color: '#D4A830', w: 30, h: 30 },
  daisy: { label: 'Daisy', color: '#FFE066', w: 20, h: 30 },
  tulip: { label: 'Tulip', color: '#FF6B8A', w: 20, h: 30 },
  sunflower: { label: 'Sunflower', color: '#FFD700', w: 25, h: 35 },
  rose: { label: 'Rose', color: '#FF4444', w: 20, h: 30 },
  orchid: { label: 'Orchid', color: '#DA70D6', w: 25, h: 30 },
  bonsai: { label: 'Bonsai', color: '#228B22', w: 30, h: 35 },
};

export function mount(container) {
  const nestInfo = getCurrentNestInfo();
  const econ = store.getEconomy();
  const maxLevel = getMaxAffordableLevel();
  const nextUnlock = getNextUnlock();
  const scene = NEST_SCENES[nestInfo.level] || NEST_SCENES[0];
  const nest = store.getNest();

  const div = document.createElement('div');
  div.className = 'view';

  div.innerHTML = `
    <div class="nest-scene" id="nest-scene" style="background:${scene.bg};border:2px solid #ddd">
      <div style="position:relative;height:250px;overflow:hidden" id="nest-inner">
        <!-- Nest platform -->
        <div style="position:absolute;bottom:${nestInfo.level > 0 ? '40%' : '10%'};left:50%;transform:translateX(-50%);width:120px;height:40px;background:#8B6F47;border-radius:50%;border:3px solid #6B5230"></div>
        <!-- Crow -->
        <div style="position:absolute;bottom:${nestInfo.level > 0 ? 'calc(40% + 25px)' : 'calc(10% + 25px)'};left:50%;transform:translateX(-50%)">
          <img src="${namedAsset('52_happy1.png')}" style="height:80px;object-fit:contain" alt="Crow in nest">
        </div>
        <!-- Furniture -->
        <div id="furniture-display"></div>
        ${nestInfo.level > 0 ? `
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:20px;background:#8B6F47;height:${nestInfo.level > 0 ? '40%' : '0'};border-radius:4px"></div>
          <div style="position:absolute;bottom:0;left:0;right:0;height:30px;background:${scene.ground};border-radius:0"></div>
        ` : `
          <div style="position:absolute;bottom:0;left:0;right:0;height:30px;background:${scene.ground};border-radius:0"></div>
        `}
      </div>
    </div>

    <div class="nest-info">
      <div class="nest-level">
        <div class="nest-level__current">${scene.label}</div>
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
          <div style="width:50px;height:50px;border-radius:var(--radius-xs);background:#F0EDE4;display:flex;align-items:center;justify-content:center;font-size:24px">
            ${maxLevel >= nextUnlock.level ? '' : '?'}
          </div>
          <div>
            <div style="font-weight:600">${nextUnlock.name}</div>
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
        <div class="card__title">Inventory (tap to place)</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px" id="inventory-list">
          ${nest.inventory.map((item, idx) => `
            <button class="btn btn--ghost inventory-item" data-idx="${idx}" style="padding:8px 12px;font-size:13px">
              ${item.name}
            </button>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${NEST_LEVELS.filter(nl => nl.level > maxLevel + 1).length > 0 ? `
      <div class="card" style="text-align:center;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:4px">?</div>
        <div style="font-size:13px">${NEST_LEVELS.filter(nl => nl.level > maxLevel + 1).length} more nest${NEST_LEVELS.filter(nl => nl.level > maxLevel + 1).length > 1 ? 's' : ''} to discover</div>
      </div>
    ` : ''}
  `;

  container.appendChild(div);

  // Render placed furniture
  const furnitureDisplay = div.querySelector('#furniture-display');
  if (furnitureDisplay && nest.furniture) {
    nest.furniture.forEach(item => {
      const info = FURNITURE_DISPLAY[item.itemId] || { label: item.name, color: '#999', w: 25, h: 25 };
      const el = document.createElement('div');
      el.style.cssText = `
        position:absolute;
        left:${item.position.x * 100}%;
        bottom:${(nestInfo.level > 0 ? 40 : 10) + 5 + item.position.y * 20}%;
        width:${info.w}px;
        height:${info.h}px;
        background:${info.color};
        border-radius:4px;
        transform:translateX(-50%);
        box-shadow:0 2px 4px rgba(0,0,0,0.2);
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:10px;
        color:white;
        font-weight:600;
      `;
      el.title = info.label;
      furnitureDisplay.appendChild(el);
    });
  }

  // Upgrade button
  const upgradeBtn = div.querySelector('#btn-upgrade');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', () => {
      setNestLevel(maxLevel);
      mount(container);
    });
  }

  // Inventory placement
  div.querySelectorAll('.inventory-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const item = nest.inventory[idx];
      if (!item) return;
      const x = 0.2 + Math.random() * 0.6;
      const y = Math.random() * 0.8;
      placeFurniture(item.itemId, x, y);
      container.innerHTML = '';
      mount(container);
    });
  });
}
