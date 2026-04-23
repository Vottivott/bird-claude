import * as store from '../store.js';
import { checkFrontierPush } from './frontier.js';

export function createRun(durationMinutes, distanceKm) {
  const speedKmh = (distanceKm / durationMinutes) * 60;
  const existingRuns = store.getRuns();
  const newPoint = { x: distanceKm, y: speedKmh };
  const isFrontierPush = checkFrontierPush(newPoint, existingRuns);

  let seedsEarned = 10;
  if (isFrontierPush) seedsEarned += 5;

  const run = {
    id: 'r_' + Date.now(),
    date: new Date().toISOString(),
    durationMinutes,
    distanceKm,
    speedKmh,
    isFrontierPush,
    seedsEarned,
  };

  store.addRun(run);
  store.addSeeds(seedsEarned, isFrontierPush ? 'run_frontier' : 'run_base');

  return run;
}

export function getRunDates() {
  return store.getRuns().map(r => r.date);
}

export function getTotalDistance() {
  return store.getRuns().reduce((sum, r) => sum + r.distanceKm, 0);
}

export function getTotalRuns() {
  return store.getRuns().length;
}
