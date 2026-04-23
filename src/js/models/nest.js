import * as store from '../store.js';

export const NEST_LEVELS = [
  { level: 0, name: 'Ground Nest', sticksRequired: 0, description: 'A cozy nest in the grass' },
  { level: 1, name: 'Tree Nest', sticksRequired: 10, description: 'A nest up in a tree' },
  { level: 2, name: 'Large Tree Nest', sticksRequired: 20, description: 'A spacious nest with a view' },
  { level: 3, name: 'Grand Nest', sticksRequired: 30, description: 'A grand nest fit for a king' },
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
