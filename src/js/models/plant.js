import * as store from '../store.js';
import { createRNG, randomInt } from '../utils/random.js';

export function plantSeed(plantOption, currentHexId) {
  const board = store.getHexBoard();
  const offset = randomInt(createRNG(Date.now()), 2, 8);

  let targetHexId = currentHexId;
  let visited = new Set([currentHexId]);
  let current = board.hexes.find(h => h.id === currentHexId);

  for (let i = 0; i < offset && current; i++) {
    const next = current.connections.find(id => !visited.has(id));
    if (next === undefined) break;
    visited.add(next);
    current = board.hexes.find(h => h.id === next);
    if (['normal', 'start', 'flowers'].includes(current.type)) targetHexId = next;
  }

  const plant = {
    id: 'p_' + Date.now(),
    plantType: plantOption.id,
    name: plantOption.name,
    cost: plantOption.cost,
    image: plantOption.image,
    wateringsNeeded: plantOption.wateringsNeeded,
    wateringsGiven: 0,
    hexId: targetHexId,
    ready: false,
    collected: false,
  };

  store.addPlant(plant);

  const targetHex = board.hexes.find(h => h.id === targetHexId);
  if (targetHex) {
    plant.originalTargetType = targetHex.type;
    targetHex.type = 'plant';
    targetHex.plantData = { plantId: plant.id };
    store.setHexBoard(board);
  }

  return plant;
}

export function waterPlant(plantId, waterSize) {
  const plants = store.getPlants();
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return null;

  const waterResult = store.useWater(waterSize);
  if (!waterResult) return null;

  plant.wateringsGiven++;

  const board = store.getHexBoard();
  const currentHex = board.hexes.find(h => h.id === plant.hexId);
  if (currentHex) {
    const rng = createRNG(Date.now());
    const offset = randomInt(rng, 3, 6);
    let walker = currentHex;
    let target = currentHex;
    let visited = new Set([plant.hexId]);
    for (let i = 0; i < offset && walker; i++) {
      const next = walker.connections.find(id => !visited.has(id));
      if (next === undefined) break;
      visited.add(next);
      walker = board.hexes.find(h => h.id === next);
      if (['normal', 'start', 'flowers'].includes(walker.type)) target = walker;
    }
    plant.originalTargetType = target.type;
    currentHex.type = 'normal';
    delete currentHex.plantData;
    plant.hexId = target.id;
    target.type = 'plant';
    target.plantData = { plantId: plant.id };
    store.setHexBoard(board);
  }

  if (plant.wateringsGiven >= plant.wateringsNeeded) {
    plant.ready = true;
  }

  store.setPlants(plants);
  return plant;
}

export function neglectPlant(plantId) {
  const plants = store.getPlants();
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return null;

  if (plant.wateringsGiven === 0) {
    plant.collected = true;
    plant.dead = true;
    const board = store.getHexBoard();
    const hex = board.hexes.find(h => h.id === plant.hexId);
    if (hex) {
      hex.type = 'wizened';
      delete hex.plantData;
      store.setHexBoard(board);
    }
    store.setPlants(plants);
    return { plant, died: true };
  }

  plant.wateringsGiven--;
  plant.ready = false;

  const board = store.getHexBoard();
  const currentHex = board.hexes.find(h => h.id === plant.hexId);
  if (currentHex) {
    const rng = createRNG(Date.now());
    const offset = randomInt(rng, 3, 6);
    let walker = currentHex;
    let target = currentHex;
    let visited = new Set([plant.hexId]);
    for (let i = 0; i < offset && walker; i++) {
      const next = walker.connections.find(id => !visited.has(id));
      if (next === undefined) break;
      visited.add(next);
      walker = board.hexes.find(h => h.id === next);
      if (['normal', 'start', 'flowers'].includes(walker.type)) target = walker;
    }
    const oldHexId = plant.hexId;
    const originalTargetType = target.type;
    currentHex.type = 'normal';
    delete currentHex.plantData;
    plant.hexId = target.id;
    target.type = 'plant';
    target.plantData = { plantId: plant.id };
    store.setHexBoard(board);
    store.setPlants(plants);
    return { plant, died: false, fromHexId: oldHexId, toHexId: target.id, originalTargetType };
  }

  store.setPlants(plants);
  return { plant, died: false };
}

export function collectPlant(plantId) {
  const plants = store.getPlants();
  const plant = plants.find(p => p.id === plantId);
  if (!plant || !plant.ready) return null;

  plant.collected = true;

  const nest = store.getNest();
  nest.inventory.push({
    itemId: plant.plantType,
    name: plant.name,
    type: 'plant',
    image: plant.image,
  });
  store.setNest(nest);

  const board = store.getHexBoard();
  const hex = board.hexes.find(h => h.id === plant.hexId);
  if (hex) {
    hex.type = 'soil';
    delete hex.plantData;
    store.setHexBoard(board);
  }

  store.setPlants(plants);
  return plant;
}

export function getPlantAtHex(hexId) {
  const plants = store.getPlants();
  return plants.find(p => p.hexId === hexId && !p.collected);
}
