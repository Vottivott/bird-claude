const PREFIX = 'crowrun_';
const listeners = new Map();

export function subscribe(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event).delete(cb);
}

export function emit(event, data) {
  const cbs = listeners.get(event);
  if (cbs) cbs.forEach(cb => cb(data));
}

function get(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function set(key, value) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

// Runs
export function getRuns() {
  return get('runs', []);
}

export function addRun(run) {
  const runs = getRuns();
  runs.push(run);
  set('runs', runs);
  emit('runs:changed', runs);
  return run;
}

// Weight
export function getWeightEntries() {
  return get('weight', []);
}

export function addWeightEntry(entry) {
  const entries = getWeightEntries();
  entries.push(entry);
  set('weight', entries);
  emit('weight:changed', entries);
  return entry;
}

// Economy
const DEFAULT_ECONOMY = {
  seeds: 0,
  sticks: 0,
  totalSeedsEarned: 0,
  totalSticksEarned: 0,
  waterInventory: [],
  transactions: [],
};

export function getEconomy() {
  return get('economy', { ...DEFAULT_ECONOMY });
}

export function addSeeds(amount, reason) {
  const econ = getEconomy();
  econ.seeds += amount;
  if (amount > 0) econ.totalSeedsEarned += amount;
  econ.transactions.push({ date: new Date().toISOString(), type: reason, amount, currency: 'seeds' });
  if (econ.transactions.length > 200) econ.transactions = econ.transactions.slice(-200);
  set('economy', econ);
  emit('economy:changed', econ);
  return econ;
}

export function spendSeeds(amount, reason) {
  const econ = getEconomy();
  if (econ.seeds < amount) return null;
  econ.seeds -= amount;
  econ.transactions.push({ date: new Date().toISOString(), type: reason, amount: -amount, currency: 'seeds' });
  set('economy', econ);
  emit('economy:changed', econ);
  return econ;
}

export function addSticks(amount, reason) {
  const econ = getEconomy();
  econ.sticks += amount;
  if (amount > 0) econ.totalSticksEarned += amount;
  econ.transactions.push({ date: new Date().toISOString(), type: reason, amount, currency: 'sticks' });
  if (econ.transactions.length > 200) econ.transactions = econ.transactions.slice(-200);
  set('economy', econ);
  emit('economy:changed', econ);
  return econ;
}

export function addWater(size, uses) {
  const econ = getEconomy();
  econ.waterInventory.push({ size, usesLeft: uses });
  set('economy', econ);
  emit('economy:changed', econ);
  return econ;
}

export function useWater() {
  const econ = getEconomy();
  const idx = econ.waterInventory.findIndex(w => w.usesLeft > 0);
  if (idx === -1) return null;
  econ.waterInventory[idx].usesLeft--;
  if (econ.waterInventory[idx].usesLeft <= 0) econ.waterInventory.splice(idx, 1);
  set('economy', econ);
  emit('economy:changed', econ);
  return econ;
}

export function getWaterCount() {
  const econ = getEconomy();
  return econ.waterInventory.reduce((sum, w) => sum + w.usesLeft, 0);
}

// Streaks
const DEFAULT_STREAKS = {
  daily: { current: 0, best: 0 },
  everyOther: { current: 0, best: 0 },
  everyThird: { current: 0, best: 0 },
  weekly: { current: 0, best: 0 },
  lastMilestonesAwarded: { daily: 0, everyOther: 0, everyThird: 0, weekly: 0 },
};

export function getStreaks() {
  return get('streaks', { ...DEFAULT_STREAKS });
}

export function setStreaks(streaks) {
  set('streaks', streaks);
  emit('streaks:changed', streaks);
}

// Hex Board
export function getHexBoard() {
  return get('hexboard', null);
}

export function setHexBoard(board) {
  set('hexboard', board);
  emit('hexboard:changed', board);
}

// Nest
const DEFAULT_NEST = {
  level: 0,
  chosenLevel: 0,
  furniture: [],
  inventory: [],
};

export function getNest() {
  return get('nest', { ...DEFAULT_NEST });
}

export function setNest(nest) {
  set('nest', nest);
  emit('nest:changed', nest);
}

// Plants
export function getPlants() {
  return get('plants', []);
}

export function setPlants(plants) {
  set('plants', plants);
  emit('plants:changed', plants);
}

export function addPlant(plant) {
  const plants = getPlants();
  plants.push(plant);
  set('plants', plants);
  emit('plants:changed', plants);
  return plant;
}

// Settings
export function getSettings() {
  return get('settings', { firstLaunch: true, dataVersion: 1 });
}

export function setSettings(settings) {
  set('settings', settings);
}
