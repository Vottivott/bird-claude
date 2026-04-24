import * as store from '../store.js';
import { createRNG, randomInt } from '../utils/random.js';

export function plantSeed(plantOption, currentHexId) {
  const board = store.getHexBoard();
  const offset = randomInt(createRNG(Date.now()), 5, 10);

  let targetHexId = currentHexId;
  let visited = new Set([currentHexId]);
  let current = board.hexes.find(h => h.id === currentHexId);

  for (let i = 0; i < offset && current; i++) {
    const next = current.connections.find(id => !visited.has(id));
    if (next === undefined) break;
    visited.add(next);
    current = board.hexes.find(h => h.id === next);
    targetHexId = next;
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
    targetHex.type = 'plant';
    targetHex.plantData = { plantId: plant.id };
    store.setHexBoard(board);
  }

  return plant;
}

export function waterPlant(plantId) {
  const plants = store.getPlants();
  const plant = plants.find(p => p.id === plantId);
  if (!plant) return null;

  const waterResult = store.useWater();
  if (!waterResult) return null;

  plant.wateringsGiven++;

  if (plant.wateringsGiven >= plant.wateringsNeeded) {
    plant.ready = true;
  } else {
    const board = store.getHexBoard();
    const currentHex = board.hexes.find(h => h.id === plant.hexId);
    if (currentHex) {
      const rng = createRNG(Date.now());
      const offset = randomInt(rng, 3, 6);
      let target = currentHex;
      let visited = new Set([plant.hexId]);
      for (let i = 0; i < offset && target; i++) {
        const next = target.connections.find(id => !visited.has(id));
        if (next === undefined) break;
        visited.add(next);
        target = board.hexes.find(h => h.id === next);
      }
      currentHex.type = 'normal';
      delete currentHex.plantData;
      plant.hexId = target.id;
      target.type = 'plant';
      target.plantData = { plantId: plant.id };
      store.setHexBoard(board);
    }
  }

  store.setPlants(plants);
  return plant;
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
    hex.type = 'normal';
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
