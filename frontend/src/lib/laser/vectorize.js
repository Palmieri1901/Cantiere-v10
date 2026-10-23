import { contours } from "d3-contour";
import simplify from "simplify-js";

export function imageToGrid(canvas, opts) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  if (opts.blur > 0) {
    const tmp = document.createElement("canvas");
    tmp.width = w; tmp.height = h;
    const t = tmp.getContext("2d");
    t.filter = `blur(${opts.blur}px)`;
    t.drawImage(canvas, 0, 0);
    return gridFrom(t.getImageData(0, 0, w, h), opts);
  }
  return gridFrom(ctx.getImageData(0, 0, w, h), opts);
}

function gridFrom(img, opts) {
  const { width: w, height: h, data } = img;
  const W = w + 2, H = h + 2;
  const vals = new Float64Array(W * H);
  const sat = opts.saturazione > 0 ? opts.saturazione / 100 : 0;
  const box = opts.area; // {x,y,width,height} in pixel: fuori dall'area tutto spento
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (box && (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height)) continue;
      const i = (y * w + x) * 4;
      const a = data[i + 3] / 255;
      const R = data[i], G = data[i + 1], B = data[i + 2];
      const lum = (0.299 * R + 0.587 * G + 0.114 * B) * a + 255 * (1 - a);
      let on = lum < opts.threshold ? 1 : 0;
      if (sat && !on) {
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx > 0 && (mx - mn) / mx >= sat && a > 0.5) on = 1; // colore acceso (bandiera, loghi colorati)
      }
      if (opts.invert) on = 1 - on;
      vals[(y + 1) * W + (x + 1)] = on;
    }
  }
  return { vals, W, H };
}

// Soglia automatica (metodo di Otsu) sulla luminosità dell'immagine
export function sogliaAutomatica(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) hist[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])]++;
  const total = w * h;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, best = 128, max = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) ** 2;
    if (v > max) { max = v; best = t; }
  }
  return best;
}

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j].x + r[i].x) * (r[j].y - r[i].y);
  return Math.abs(a / 2);
}

// Limite punti totali: foto molto dettagliate altrimenti bloccano i browser mobili
export const MAX_POINTS = 8000;

export function trace(canvas, opts) {
  const { vals, W, H } = imageToGrid(canvas, opts);
  const geo = contours().size([W, H]).smooth(true).thresholds([0.5])(vals)[0];
  const found = [];
  for (const poly of geo.coordinates) {
    for (const ring of poly) {
      const pts = ring.map(([x, y]) => ({ x: x - 1, y: y - 1 }));
      const area = ringArea(pts);
      if (area < opts.minArea) continue;
      let s = simplify(pts, opts.tolerance, true);
      if (s.length > 1 && s[0].x === s[s.length - 1].x && s[0].y === s[s.length - 1].y) s = s.slice(0, -1);
      if (s.length >= 3) found.push({ s, area });
    }
  }
  found.sort((a, b) => b.area - a.area);
  const out = [];
  let total = 0;
  for (const f of found) {
    if (total + f.s.length > MAX_POINTS) continue;
    out.push(f.s);
    total += f.s.length;
  }
  out.truncated = out.length < found.length;
  return out;
}

export function toSVG(paths, w, h, widthMm) {
  const k = widthMm / w;
  const hMm = h * k;
  const d = paths.map((p) => "M" + p.map((q) => `${(q.x * k).toFixed(3)},${(q.y * k).toFixed(3)}`).join(" L") + " Z").join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm.toFixed(2)}mm" height="${hMm.toFixed(2)}mm" viewBox="0 0 ${widthMm.toFixed(3)} ${hMm.toFixed(3)}">
<path d="${d}" fill="none" stroke="#ff0000" stroke-width="0.1" fill-rule="evenodd"/>
</svg>`;
}

export function toDXF(paths, w, h, widthMm) {
  const k = widthMm / w;
  const hMm = h * k;
  const L = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  for (const p of paths) {
    L.push("0", "LWPOLYLINE", "8", "TAGLIO", "90", String(p.length), "70", "1");
    for (const q of p) L.push("10", (q.x * k).toFixed(3), "20", (hMm - q.y * k).toFixed(3));
  }
  L.push("0", "ENDSEC", "0", "EOF");
  return L.join("\n");
}
