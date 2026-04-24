import * as store from '../store.js';

export const NEST_LEVELS = [
  { level: 0, name: 'Forest Floor Nest', sticksRequired: 0, image: '01_forest_floor_nest_starter.png' },
  { level: 1, name: 'Branch Nest', sticksRequired: 10, image: '02_branch_nest_growth.png' },
  { level: 2, name: 'Mossy Canopy Nest', sticksRequired: 50, image: '03_mossy_canopy_nest.png' },
  { level: 3, name: 'Sunlit Tree Hollow', sticksRequired: 100, image: '04_sunlit_tree_hollow_nest.png' },
  { level: 4, name: 'Winter Snow Nest', sticksRequired: 1000, image: '05_winter_snow_nest.png' },
];

export function getMaxAffordableLevel() {
  const econ = store.getEconomy();
  let max = 0;
  for (const nl of NEST_LEVELS) {
    if (econ.totalSticksEarned >= nl.sticksRequired) max = nl.level;
  }
  return max;
}

export function getNextUnlock() {
  const maxLevel = getMaxAffordableLevel();
  const next = NEST_LEVELS.find(nl => nl.level === maxLevel + 1);
  return next || null;
}

export function getCurrentNestInfo() {
  const nest = store.getNest();
  const maxLevel = getMaxAffordableLevel();
  const currentLevel = Math.min(nest.chosenLevel || nest.level, maxLevel);
  return {
    ...NEST_LEVELS[currentLevel],
    maxAffordable: maxLevel,
    furniture: nest.furniture,
    inventory: nest.inventory,
  };
}

export function setNestLevel(level) {
  const nest = store.getNest();
  const max = getMaxAffordableLevel();
  if (level > max) return false;
  nest.level = level;
  nest.chosenLevel = level;
  store.setNest(nest);
  return true;
}

export function placeFurniture(itemId, x, y) {
  const nest = store.getNest();
  const invIdx = nest.inventory.findIndex(i => i.itemId === itemId);
  if (invIdx === -1) return false;
  const item = nest.inventory.splice(invIdx, 1)[0];
  nest.furniture.push({ ...item, position: { x, y } });
  store.setNest(nest);
  return true;
}
