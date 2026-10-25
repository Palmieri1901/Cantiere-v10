import simplify from "simplify-js";
import { MAX_POINTS } from "./vectorize";

export function insertNearestPoint(paths, index, point) {
  const path = paths[index];
  if (!path?.length) return paths;
  let nearest = 0, distance = Infinity;
  path.forEach((a, i) => {
    const b = path[(i + 1) % path.length];
    if (!b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    const d = (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
    if (d < distance) { distance = d; nearest = i; }
  });
  return paths.map((p, i) => (i === index ? [...p.slice(0, nearest + 1), { ...point }, ...p.slice(nearest + 1)] : p));
}

export function appendContour(paths, draft) {
  const unique = new Set(draft.map((p) => `${p.x},${p.y}`));
  if (unique.size < 3 || draft.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return paths;
  return [...paths, draft.map((p) => ({ ...p }))];
}

export function boxBounds(box) {
  return { x: Math.min(box.start.x, box.end.x), y: Math.min(box.start.y, box.end.y), width: Math.abs(box.end.x - box.start.x), height: Math.abs(box.end.y - box.start.y) };
}

export function isInsideBox(path, box) {
  const { x, y, width, height } = boxBounds(box);
  return width > 0 && height > 0 && path.length > 0 && path.every((pt) => pt.x >= x && pt.x <= x + width && pt.y >= y && pt.y <= y + height);
}

export function pointInBox(pt, box) {
  const { x, y, width, height } = boxBounds(box);
  return pt.x >= x && pt.x <= x + width && pt.y >= y && pt.y <= y + height;
}

export function countPointsInBox(paths, box) {
  return paths.reduce((n, p) => n + p.filter((pt) => pointInBox(pt, box)).length, 0);
}

// Elimina i punti dentro l'area; le forme rimaste con meno di 3 punti spariscono
export function deletePointsInBox(paths, box) {
  return paths.map((p) => p.filter((pt) => !pointInBox(pt, box))).filter((p) => p.length >= 3);
}

// Punto esistente più vicino entro `radius` (aggancio nel contorno manuale)
export function snapToPoint(paths, draft, q, radius) {
  let best = null, bd = radius * radius;
  const test = (pt) => { const d = (pt.x - q.x) ** 2 + (pt.y - q.y) ** 2; if (d < bd) { bd = d; best = pt; } };
  for (const p of paths) for (const pt of p) test(pt);
  for (const pt of draft) test(pt);
  return best ? { x: best.x, y: best.y } : q;
}

export function movePoint(paths, selected, dx, dy) {
  return paths.map((path, p) => (p !== selected.p ? path : path.map((pt, i) => (i !== selected.i ? pt : { x: pt.x + dx, y: pt.y + dy }))));
}

export function rotateShapes(paths, selected, degrees) {
  const indices = new Set(selected);
  const points = paths.flatMap((path, i) => (indices.has(i) ? path : []));
  if (!points.length || !Number.isFinite(degrees)) return paths;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pt of points) { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y); }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return paths.map((path, i) => (!indices.has(i) ? path : path.map((pt) => ({ x: cx + (pt.x - cx) * cos - (pt.y - cy) * sin, y: cy + (pt.x - cx) * sin + (pt.y - cy) * cos }))));
}

function straighten(path, tolerance) {
  const first = path[0];
  if (!first || path.length < 4) return path;
  let split = 1, farthest = 0;
  path.forEach((p, i) => { const d = (p.x - first.x) ** 2 + (p.y - first.y) ** 2; if (d > farthest) { farthest = d; split = i; } });
  const a = simplify(path.slice(0, split + 1), tolerance, true);
  const b = simplify([...path.slice(split), first], tolerance, true);
  const result = [...a.slice(0, -1), ...b.slice(0, -1)];
  return result.length >= 3 ? result : path;
}

function roundCorners(path, strength) {
  const fraction = Math.min(0.25, strength / 40);
  return path.flatMap((a, i) => {
    const b = path[(i + 1) % path.length];
    if (!b) return [];
    return [{ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction }, { x: b.x + (a.x - b.x) * fraction, y: b.y + (a.y - b.y) * fraction }];
  });
}

export function refineContours(paths, selected, mode, strength) {
  if (!Number.isFinite(strength) || strength <= 0 || !selected.length) return paths;
  const indices = new Set(selected);
  const result = paths.map((path, i) => (indices.has(i) ? (mode === "smooth" ? roundCorners(path, Math.min(10, strength)) : straighten(path, strength)) : path));
  return result.reduce((n, p) => n + p.length, 0) <= MAX_POINTS ? result : paths;
}
