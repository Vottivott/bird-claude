const SPRITES = {
  neutral: '1_neutral_pose_towards_right.png',
  looking_right: '16_looking_right_away_from_user.png',
  looking_at_user: '19_looking_at_user.png',
  find_seed: '31_find_seed.png',
  find_seeds: '33_find_seeds.png',
  planting_1: '34_planting_1.png',
  planting_2: '35_planting_2.png',
  watering_small: '37_watering_small.png',
  pointing_right: '38_pointing_to_the_right.png',
  find_stick: '40_find_stick.png',
  find_sticks: '41_find_sticks.png',
  planting_3: '45_planting_3.png',
  planting_4: '46_planting_4.png',
  watering_medium: '47_watering_medium.png',
  watering_large: '48_watering_large.png',
  at_shop: '50_at_shop.png',
  speaking: '51_speaking.png',
  happy1: '52_happy1.png',
  happy2: '53_happy2.png',
  very_happy: '54_very_happy.png',
  new_record: '55_new_record.png',
  streak_bonus: '56_streak_bonus.png',
  log_run: '57_log_run.png',
  log_weight: '58_log_weight.png',
};

const ANIMATIONS = {
  running: 'running_transparent_loop.png',
  walking: 'walking_transparent_loop.png',
};

const BASE_PATH = '/assets/named_selection_borderless_8x_cleaned/';

export function getCrowSpriteSrc(name) {
  const file = SPRITES[name] || SPRITES.neutral;
  return BASE_PATH + file;
}

export function getCrowAnimationSrc(name) {
  const file = ANIMATIONS[name];
  return file ? BASE_PATH + file : null;
}

export function createCrowImage(spriteName, className = '') {
  const img = document.createElement('img');
  img.src = getCrowSpriteSrc(spriteName);
  img.alt = 'Crow';
  img.draggable = false;
  if (className) img.className = className;
  return img;
}

export function createCrowAnimation(animName, className = '') {
  const src = getCrowAnimationSrc(animName);
  if (!src) return null;
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Crow animation';
  img.draggable = false;
  if (className) img.className = className;
  return img;
}

export const SPRITE_NAMES = Object.keys(SPRITES);
export const ANIMATION_NAMES = Object.keys(ANIMATIONS);
