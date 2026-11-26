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

// filtro: "documento" | "colore" | "originale"; rot: 0/90/180/270
export async function elabora(src, filtro, rot) {
  const img = await carica(src);
  const s = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.round(img.width * s), h = Math.round(img.height * s);
  const ruota = rot % 180 !== 0;
  const cv = document.createElement("canvas");
  cv.width = ruota ? h : w; cv.height = ruota ? w : h;
  const ctx = cv.getContext("2d");
  ctx.translate(cv.width / 2, cv.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (filtro !== "originale") {
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    livelli(id.data, filtro === "documento");
    ctx.putImageData(id, 0, 0);
  }
  return cv.toDataURL("image/jpeg", 0.82);
}

// Timbro/firma: toglie lo sfondo chiaro (diventa trasparente) e ritaglia i bordi vuoti
export async function preparaTimbro(src) {
  const img = await carica(src);
  const s = Math.min(1, 900 / Math.max(img.width, img.height));
  const cv = document.createElement("canvas");
  cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const id = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = id.data;
  let x0 = cv.width, y0 = cv.height, x1 = 0, y1 = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i + 3] = l > 205 ? 0 : l > 160 ? Math.round(((205 - l) / 45) * 255) : 255;
    if (d[i + 3] > 40) { const p = i / 4, x = p % cv.width, y = (p / cv.width) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  ctx.putImageData(id, 0, 0);
  if (x1 <= x0 || y1 <= y0) return cv.toDataURL("image/png");
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext("2d").drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}
