// Elaborazione immagini per lo scanner: ridimensiona, ruota, filtro «documento», timbro con sfondo trasparente
const MAX = 1800;

export const leggiFile = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});

const carica = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// Allunga i livelli tra il 2° e il 98° percentile (schiarisce lo sfondo, scurisce il testo)
function livelli(d, grigio) {
  const hist = new Array(256).fill(0);
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0]++;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255 && (acc += hist[lo]) < n * 0.02; lo++);
  acc = 0;
  for (; hi > 0 && (acc += hist[hi]) < n * (grigio ? 0.3 : 0.02); hi--);
  const k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    if (grigio) {
      const v = Math.max(0, Math.min(255, ((d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) - lo) * k));
      d[i] = d[i + 1] = d[i + 2] = v;
    } else {
      for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] - lo) * k));
    }
  }
}

// Omografia che porta il rettangolo (0,0)-(w,h) sul quadrilatero q [[x,y]x4: alto-sx, alto-dx, basso-dx, basso-sx]
function omografia(w, h, q) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = q[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

// Raddrizza il foglio: angoli relativi (0-1) sull'immagine già ruotata
function raddrizza(cv, angoli) {
  const q = angoli.map(([x, y]) => [x * cv.width, y * cv.height]);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let w = Math.max(d(q[0], q[1]), d(q[3], q[2])), h = Math.max(d(q[0], q[3]), d(q[1], q[2]));
  const s = Math.min(1, MAX / Math.max(w, h));
  w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s));
  const [a, b, c, e, f, g, i, j] = omografia(w, h, q);
  const sd = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const oc = out.getContext("2d");
  const od = oc.createImageData(w, h);
  const W = cv.width, H = cv.height;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const z = i * x + j * y + 1;
      const sx = Math.min(W - 1, Math.max(0, ((a * x + b * y + c) / z) | 0));
      const sy = Math.min(H - 1, Math.max(0, ((e * x + f * y + g) / z) | 0));
      const si = (sy * W + sx) * 4, oi = (y * w + x) * 4;
      od.data[oi] = sd[si]; od.data[oi + 1] = sd[si + 1]; od.data[oi + 2] = sd[si + 2]; od.data[oi + 3] = 255;
    }
  }
  oc.putImageData(od, 0, 0);
  return out;
}

// Trova da solo i 4 angoli del foglio (chiaro su fondo più scuro); null se non lo riconosce
export async function trovaBordi(src, rot = 0) {
  const img = await carica(src);
  const s = 256 / Math.max(img.width, img.height);
  const w0 = Math.max(1, Math.round(img.width * s)), h0 = Math.max(1, Math.round(img.height * s));
  const ruota = rot % 180 !== 0;
  const cv = document.createElement("canvas");
  cv.width = ruota ? h0 : w0; cv.height = ruota ? w0 : h0;
  const ctx = cv.getContext("2d");
  ctx.filter = "blur(2px)";
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -w0 / 2, -h0 / 2, w0, h0);
  const W = cv.width, H = cv.height, N = W * H;
  const d = ctx.getImageData(0, 0, W, H).data;
  const g = new Uint8Array(N), hist = new Array(256).fill(0);
  for (let p = 0; p < N; p++) { g[p] = (d[p * 4] * 0.299 + d[p * 4 + 1] * 0.587 + d[p * 4 + 2] * 0.114) | 0; hist[g[p]]++; }
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sB = 0, wB = 0, best = 0, soglia = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = N - wB; if (!wF) break;
    sB += t * hist[t];
    const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (v > best) { best = v; soglia = t; }
  }
  const lab = new Int32Array(N).fill(-1), coda = new Int32Array(N);
  let maxN = 0, maxL = -1;
  for (let p0 = 0, l = 0; p0 < N; p0++) {
    if (g[p0] <= soglia || lab[p0] !== -1) continue;
    let a = 0, b = 0; coda[b++] = p0; lab[p0] = l;
    while (a < b) {
      const p = coda[a++], x = p % W, y = (p / W) | 0;
      const v = [x > 0 && p - 1, x < W - 1 && p + 1, y > 0 && p - W, y < H - 1 && p + W];
      for (const q of v) if (q !== false && g[q] > soglia && lab[q] === -1) { lab[q] = l; coda[b++] = q; }
    }
    if (b > maxN) { maxN = b; maxL = l; }
    l++;
  }
  if (maxN < N * 0.15 || maxN > N * 0.97) return null;
  const c = [[0, 0, Infinity], [0, 0, -Infinity], [0, 0, -Infinity], [0, 0, Infinity]];
  for (let p = 0; p < N; p++) {
    if (lab[p] !== maxL) continue;
    const x = p % W, y = (p / W) | 0, sp = x + y, df = x - y;
    if (sp < c[0][2]) c[0] = [x, y, sp];
    if (df > c[1][2]) c[1] = [x, y, df];
    if (sp > c[2][2]) c[2] = [x, y, sp];
    if (df < c[3][2]) c[3] = [x, y, df];
  }
  const q = c.map(([x, y]) => [x / (W - 1), y / (H - 1)]);
  let area = 0;
  for (let i = 0; i < 4; i++) { const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 4]; area += x1 * y2 - x2 * y1; }
  if (Math.abs(area) / 2 < 0.12) return null;
  const tutto = q.every(([x, y], i) => Math.abs(x - [0, 1, 1, 0][i]) < 0.02 && Math.abs(y - [0, 0, 1, 1][i]) < 0.02);
  return tutto ? null : q;
}

// filtro: "documento" | "colore" | "originale"; rot: 0/90/180/270; angoli: 4 punti relativi o null
export async function elabora(src, filtro, rot, angoli = null) {
  const img = await carica(src);
  const s = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const ruota = rot % 180 !== 0;
  let cv = document.createElement("canvas");
  cv.width = ruota ? h : w; cv.height = ruota ? w : h;
  let ctx = cv.getContext("2d");
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (angoli) { cv = raddrizza(cv, angoli); ctx = cv.getContext("2d"); }
  if (filtro !== "originale") {
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    livelli(id.data, filtro === "documento");
    ctx.putImageData(id, 0, 0);
  }
  return cv.toDataURL("image/jpeg", 0.82);
}

// Timbro/firma: toglie lo sfondo chiaro (diventa trasparente) e ritaglia i bordi vuoti
// forza 0-100 (50 = normale): più alta = inchiostro più scuro e tratti sottili conservati
export async function preparaTimbro(src, forza = 50) {
  const soglia = 28 + (50 - forza) * 0.4, tono = 0.85 - (forza - 50) * 0.006;
  const img = await carica(src);
  const s = Math.min(1, 900 / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const W = cv.width, H = cv.height;
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const lum = (i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  // Colore della carta zona per zona (anche se beige o con ombre): media dei pixel più chiari di ogni blocco
  const B = 16, bw = Math.ceil(W / B), bh = Math.ceil(H / B);
  const sc = document.createElement("canvas");
  sc.width = B; sc.height = B;
  const sctx = sc.getContext("2d"), sd = sctx.createImageData(B, B);
  for (let by = 0; by < B; by++) {
    for (let bx = 0; bx < B; bx++) {
      const px = [];
      for (let y = by * bh; y < Math.min(H, (by + 1) * bh); y++) for (let x = bx * bw; x < Math.min(W, (bx + 1) * bw); x++) px.push((y * W + x) * 4);
      px.sort((a, b) => lum(b) - lum(a));
      const top = px.slice(0, Math.max(1, Math.round(px.length * 0.3)));
      const o = (by * B + bx) * 4;
      for (let c = 0; c < 3; c++) sd.data[o + c] = top.reduce((s, i) => s + d[i + c], 0) / top.length;
      sd.data[o + 3] = 255;
    }
  }
  sctx.putImageData(sd, 0, 0);
  const fc = document.createElement("canvas");
  fc.width = W; fc.height = H;
  const fctx = fc.getContext("2d");
  fctx.imageSmoothingEnabled = true;
  fctx.drawImage(sc, 0, 0, W, H);
  const bg = fctx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < d.length; i += 4) {
    const bl = bg[i] * 0.299 + bg[i + 1] * 0.587 + bg[i + 2] * 0.114;
    const scuro = bl - lum(i);
    const tinta = Math.hypot(d[i] - bg[i], d[i + 1] - bg[i + 1], d[i + 2] - bg[i + 2]);
    const a = Math.max(0, Math.min(1, (Math.max(scuro, tinta * 0.7) - soglia) / 40));
    // Bilancia il colore rispetto alla carta così l'inchiostro torna del suo colore vero
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(0, Math.min(255, (d[i + c] * 255) / Math.max(1, bg[i + c]) * tono));
    d[i + 3] = Math.round(a * 255);
    if (a > 0.3) { const p = i / 4, x = p % W, y = (p / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  ctx.putImageData(id, 0, 0);
  if (x1 <= x0 || y1 <= y0) return cv.toDataURL("image/png");
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
