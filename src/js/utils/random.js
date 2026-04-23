export function createRNG(seed) {
  let s = seed;
  return function next() {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

export function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randomChoice(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}
