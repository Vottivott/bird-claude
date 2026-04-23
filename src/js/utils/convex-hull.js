export function upperConvexHull(points) {
  if (points.length <= 1) return [...points];

  const sorted = [...points].sort((a, b) => a.x - b.x || b.y - a.y);
  const upper = [];

  for (const p of sorted) {
    while (upper.length >= 2) {
      const a = upper[upper.length - 2];
      const b = upper[upper.length - 1];
      const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
      if (cross >= 0) upper.pop();
      else break;
    }
    upper.push(p);
  }
  return upper;
}

export function isAboveFrontier(point, hull) {
  if (hull.length === 0) return true;
  if (hull.length === 1) {
    return point.y > hull[0].y || point.x > hull[0].x;
  }

  if (point.x <= hull[0].x) {
    return point.y > hull[0].y;
  }
  if (point.x >= hull[hull.length - 1].x) {
    return point.y > hull[hull.length - 1].y || point.x > hull[hull.length - 1].x;
  }

  for (let i = 0; i < hull.length - 1; i++) {
    if (point.x >= hull[i].x && point.x <= hull[i + 1].x) {
      const t = (point.x - hull[i].x) / (hull[i + 1].x - hull[i].x);
      const interpolatedY = hull[i].y + t * (hull[i + 1].y - hull[i].y);
      return point.y > interpolatedY;
    }
  }
  return true;
}
