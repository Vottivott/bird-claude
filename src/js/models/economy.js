import * as store from '../store.js';

export const SHOP_ITEMS = [
  { id: 'swimming_pool', name: 'Swimming Pool', cost: 1000, emoji: '' },
  { id: 'sunchair', name: 'Sunchair & Umbrella', cost: 500, emoji: '' },
];

export const PLANT_OPTIONS = [
  { id: 'daisy', name: 'Daisy', cost: 200, wateringsNeeded: 1 },
  { id: 'tulip', name: 'Tulip', cost: 400, wateringsNeeded: 1 },
  { id: 'sunflower', name: 'Sunflower', cost: 600, wateringsNeeded: 2 },
  { id: 'rose', name: 'Rose', cost: 800, wateringsNeeded: 2 },
  { id: 'orchid', name: 'Orchid', cost: 1000, wateringsNeeded: 3 },
  { id: 'bonsai', name: 'Bonsai Tree', cost: 1500, wateringsNeeded: 4 },
];

export const WATER_OPTIONS = [
  { name: 'Small Water Can', cost: 100, uses: 1, icon: 'watering_can_blue' },
  { name: 'Medium Water Can', cost: 150, uses: 2, icon: 'watering_can_copper' },
  { name: 'Large Water Can', cost: 200, uses: 3, icon: 'watering_can_gold' },
];

export function canAfford(cost) {
  return store.getEconomy().seeds >= cost;
}

export function buyShopItem(item) {
  const result = store.spendSeeds(item.cost, 'shop_purchase');
  if (!result) return false;
  const nest = store.getNest();
  nest.inventory.push({ itemId: item.id, name: item.name });
  store.setNest(nest);
  return true;
}

export function buyWater(option) {
  const result = store.spendSeeds(option.cost, 'water_purchase');
  if (!result) return false;
  store.addWater(option.name, option.uses);
  return true;
}
