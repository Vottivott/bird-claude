import { upperConvexHull, isAboveFrontier } from '../utils/convex-hull.js';
import * as store from '../store.js';

export function computeFrontier(runs) {
  const points = runs.map(r => ({ x: r.distanceKm, y: r.speedKmh }));
  return upperConvexHull(points);
}

export function checkFrontierPush(newPoint, existingRuns) {
  const existingPoints = existingRuns.map(r => ({ x: r.distanceKm, y: r.speedKmh }));
  const hull = upperConvexHull(existingPoints);
  return isAboveFrontier(newPoint, hull);
}
