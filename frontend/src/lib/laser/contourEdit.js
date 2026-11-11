import simplify from "simplify-js";
import { MAX_POINTS } from "./vectorize";

// Una forma "aperta" (linea non chiusa) porta il flag `open` sull'array: va conservato ad ogni copia
export const keepOpen = (src, arr) => (src?.open && arr !== src ? Object.assign(arr, { open: true }) : arr);
export const copyPaths = (paths) => paths.map((p) => keepOpen(p, p.slice()));

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
  return paths.map((p, i) => (i === index ? keepOpen(p, [...p.slice(0, nearest + 1), { ...point }, ...p.slice(nearest + 1)]) : p));
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
  return paths.map((p) => keepOpen(p, p.filter((pt) => !pointInBox(pt, box)))).filter((p) => p.length >= (p.open ? 2 : 3));
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
  return paths.map((path, p) => (p !== selected.p ? path : keepOpen(path, path.map((pt, i) => (i !== selected.i ? pt : { x: pt.x + dx, y: pt.y + dy })))));
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
  return paths.map((path, i) => (!indices.has(i) ? path : keepOpen(path, path.map((pt) => ({ x: cx + (pt.x - cx) * cos - (pt.y - cy) * sin, y: cy + (pt.x - cx) * sin + (pt.y - cy) * cos })))));
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
  const result = paths.map((path, i) => (indices.has(i) ? keepOpen(path, mode === "smooth" ? roundCorners(path, Math.min(10, strength)) : straighten(path, strength)) : path));
  return result.reduce((n, p) => n + p.length, 0) <= MAX_POINTS ? result : paths;
}

const same = (a, b, eps) => Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

export function snapExcluding(paths, sel, q, radius) {
  let best = null, bd = radius * radius;
  paths.forEach((p, pi) => p.forEach((pt, i) => {
    if (pi === sel.p && i === sel.i) return;
    const d = (pt.x - q.x) ** 2 + (pt.y - q.y) ** 2;
    if (d < bd) { bd = d; best = pt; }
  }));
  return best ? { x: best.x, y: best.y } : q;
}

export function coincidentPoints(paths, sel, eps = 0.01) {
  const pt = paths[sel.p]?.[sel.i];
  if (!pt) return [];
  const out = [];
  paths.forEach((p, pi) => p.forEach((q, i) => { if ((pi !== sel.p || i !== sel.i) && same(q, pt, eps)) out.push({ p: pi, i }); }));
  return out;
}

const rotate = (path, i) => [...path.slice(i), ...path.slice(0, i)];

export function mergeShapes(paths, a, b) {
  if (a.p === b.p) return paths;
  const merged = [...rotate(paths[a.p], a.i), ...rotate(paths[b.p], b.i)].map((q) => ({ ...q }));
  return paths.flatMap((p, i) => (i === a.p ? [merged] : i === b.p ? [] : [p]));
}

export function splitShape(paths, sel, eps = 0.01) {
  const path = paths[sel.p];
  if (!path) return paths;
  const j = path.findIndex((q, i) => i !== sel.i && same(q, path[sel.i], eps));
  if (j < 0) return paths;
  const lo = Math.min(sel.i, j), hi = Math.max(sel.i, j);
  const first = path.slice(lo, hi), second = [...path.slice(hi), ...path.slice(0, lo)];
  if (first.length < 3 || second.length < 3) return paths;
  return paths.flatMap((p, i) => (i === sel.p ? [first.map((q) => ({ ...q })), second.map((q) => ({ ...q }))] : [p]));
}

export function detachPoint(paths, sel, dist) {
  const path = paths[sel.p];
  const pt = path?.[sel.i];
  if (!pt) return paths;
  const prev = path[(sel.i - 1 + path.length) % path.length], next = path[(sel.i + 1) % path.length];
  const mx = (prev.x + next.x) / 2 - pt.x, my = (prev.y + next.y) / 2 - pt.y;
  const len = Math.hypot(mx, my) || 1;
  return movePoint(paths, sel, (mx / len) * dist, (my / len) * dist);
}

function segmentIntersection(a, b, c, d) {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  if (t <= 1e-6 || t >= 1 - 1e-6 || u <= 1e-6 || u >= 1 - 1e-6) return null;
  return { t, u, x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

export function addIntersections(paths, index) {
  const target = paths[index];
  if (!target) return { paths, count: 0 };
  const inserts = new Map(); // "p:i" -> [{t,x,y}]
  const push = (p, i, t, x, y) => { const k = `${p}:${i}`; if (!inserts.has(k)) inserts.set(k, []); inserts.get(k).push({ t, x, y }); };
  let count = 0;
  target.forEach((a, i) => {
    const b = target[(i + 1) % target.length];
    paths.forEach((other, pi) => {
      if (pi === index) return;
      other.forEach((c, j) => {
        const d = other[(j + 1) % other.length];
        const hit = segmentIntersection(a, b, c, d);
        if (!hit) return;
        push(index, i, hit.t, hit.x, hit.y); push(pi, j, hit.u, hit.x, hit.y); count++;
      });
    });
  });
  if (!count) return { paths, count: 0 };
  const out = paths.map((p, pi) => keepOpen(p, p.flatMap((q, i) => {
    const extra = (inserts.get(`${pi}:${i}`) || []).sort((m, n) => m.t - n.t).map(({ x, y }) => ({ x, y }));
    return [q, ...extra];
  })));
  return { paths: out, count };
}

export function deleteBetween(paths, a, b) {
  const path = paths[a.p];
  if (!path || a.p !== b.p || a.i === b.i) return paths;
  const n = path.length;
  const fwd = (b.i - a.i + n) % n - 1, back = (a.i - b.i + n) % n - 1; // punti interni ai due archi
  if (Math.min(fwd, back) <= 0 && !path.open) { // punti adiacenti: si toglie il segmento e la forma resta aperta
    const start = (b.i - a.i + n) % n === 1 ? b.i : a.i;
    return paths.map((p, i) => (i === a.p ? Object.assign([...p.slice(start), ...p.slice(0, start)], { open: true }) : p));
  }
  const useFwd = path.open ? a.i < b.i : fwd <= back;
  const start = useFwd ? a.i : b.i, count = path.open ? Math.abs(b.i - a.i) - 1 : useFwd ? fwd : back;
  if (count <= 0) return paths;
  const drop = new Set(Array.from({ length: count }, (_, k) => (start + 1 + k) % n));
  const kept = keepOpen(path, path.filter((_, i) => !drop.has(i)));
  if (kept.length < (path.open ? 2 : 3)) return paths;
  return paths.map((p, i) => (i === a.p ? kept : p));
}
