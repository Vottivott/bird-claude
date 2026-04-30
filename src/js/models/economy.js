import * as store from '../store.js';

export const SHOP_ITEMS = [
  { id: 'swimming_pool', name: 'Swimming Pool', cost: 1000, image: 'swimming_pool.png' },
  { id: 'sunchair', name: 'Sunchair & Umbrella', cost: 500, image: 'sunchair_with_umbrella.png' },
];

export const PLANT_OPTIONS = [
  { id: 'dandelion_seedhead', name: 'Maskros-puff', cost: 50, wateringsNeeded: 1, image: 'dandelion_seedhead.png' },
  { id: 'dandelion_flower', name: 'Maskros', cost: 100, wateringsNeeded: 1, image: 'dandelion_flower.png' },
  { id: 'coltsfoot_flower', name: 'Tussilago', cost: 150, wateringsNeeded: 1, image: 'coltsfoot_flower.png' },
  { id: 'blue_violets', name: 'Blåsippa', cost: 200, wateringsNeeded: 2, image: 'blue_violets.png' },
  { id: 'white_anemone', name: 'Vitsippa', cost: 300, wateringsNeeded: 2, image: 'white_anemone.png' },
  { id: 'cornflower', name: 'Blåklint', cost: 500, wateringsNeeded: 2, image: 'cornflower.png' },
  { id: 'lily_of_the_valley', name: 'Liljekonvalj', cost: 700, wateringsNeeded: 2, image: 'lily_of_the_valley.png' },
  { id: 'wild_strawberry_single', name: 'Hallon', cost: 1000, wateringsNeeded: 3, image: 'wild_strawberry_single.png' },
  { id: 'strawberry', name: 'Jordgubbe', cost: 1200, wateringsNeeded: 3, image: 'strawberry.png' },
  { id: 'blackberry', name: 'Björnbär', cost: 1500, wateringsNeeded: 4, image: 'blackberry.png' },
  { id: 'wild_strawberry_cluster', name: 'Smultronställe', cost: 1800, wateringsNeeded: 4, image: 'wild_strawberry_cluster.png' },
  { id: 'raspberries', name: 'Litchi', cost: 2000, wateringsNeeded: 4, image: 'raspberries.png' },
  { id: 'iced_coffee_cup_plant', name: 'Brown Sugar Bubble Tea', cost: 5000, wateringsNeeded: 6, image: 'iced_coffee_cup_plant.png' },
];

export const WATER_OPTIONS = [
  { name: 'Blue Watering Can', cost: 30, uses: 1, icon: 'watering_can_blue' },
  { name: 'Copper Watering Can', cost: 45, uses: 2, icon: 'watering_can_copper' },
  { name: 'Gold Watering Can', cost: 60, uses: 3, icon: 'watering_can_gold' },
];

export function getPlantOption(id) {
  return PLANT_OPTIONS.find(p => p.id === id) || null;
}

export function canAfford(cost) {
  return store.getEconomy().seeds >= cost;
}

export function buyShopItem(item) {
  const result = store.spendSeeds(item.cost, 'shop_purchase');
  if (!result) return false;
  const nest = store.getNest();
  nest.inventory.push({ itemId: item.id, name: item.name, type: 'furniture', image: item.image });
  store.setNest(nest);
  return true;
}

export function buyWater(option) {
  const result = store.spendSeeds(option.cost, 'water_purchase');
  if (!result) return false;
  store.addWater(option.name, option.uses);
  return true;
}
