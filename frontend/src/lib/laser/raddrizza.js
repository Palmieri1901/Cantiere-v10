// Raddrizza una porzione di foto: 4 angoli → rettangolo piatto (prospettiva) + correzione cilindro per i tubolari
function homography(src, dst) {
  // risolve H tale che dst = H·src (8 incognite) — eliminazione di Gauss
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i], { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++) {
      if (r === c || !A[c][c]) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j < n; j++) A[r][j] -= k * A[c][j];
      b[r] -= k * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [...h, 1];
}

const apply = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return { x: (H[0] * x + H[1] * y + H[2]) / w, y: (H[3] * x + H[4] * y + H[5]) / w }; };

/** corners: [TL, TR, BR, BL] in pixel sorgente. curvatura 0..1: 0 = piatto, 1 = tubolare pieno (il bordo alto/basso del riquadro coincide con il profilo del tubo). */
export function raddrizza(canvas, corners, { outWidth = 1200, curvatura = 0 } = {}) {
  const top = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const left = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  const W = Math.round(outWidth), H0 = Math.max(8, Math.round((left / Math.max(1, top)) * W));
  // sviluppo del cilindro: l'altezza reale è l'arco, maggiore di quella vista
  const theta = Math.max(0.0001, curvatura) * (Math.PI / 2);
  const stretch = curvatura > 0 ? theta / Math.sin(theta) : 1;
  const H = Math.round(H0 * stretch);
  const Hm = homography([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H0 }, { x: 0, y: H0 }], corners);
  const sctx = canvas.getContext("2d");
  const src = sctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const octx = out.getContext("2d");
  const img = octx.createImageData(W, H);
  const sw = canvas.width, sh = canvas.height, sd = src.data, od = img.data;
  const R = H / (2 * theta); // raggio del cilindro in pixel di uscita
  for (let v = 0; v < H; v++) {
    // da altezza "piatta" (arco) a quella vista nella foto (proiezione)
    let yv = v;
    if (curvatura > 0) {
      const arc = (v - H / 2) / R;             // angolo rispetto al centro del tubo
      const seen = R * Math.sin(arc);           // posizione proiettata
      yv = H0 / 2 + seen * (H0 / (2 * R * Math.sin(theta)));
    }
    for (let u = 0; u < W; u++) {
      const p = apply(Hm, u, yv);
      const x = Math.round(p.x), y = Math.round(p.y);
      const o = (v * W + u) * 4;
      if (x < 0 || y < 0 || x >= sw || y >= sh) { od[o] = od[o + 1] = od[o + 2] = 255; od[o + 3] = 255; continue; }
      const s = (y * sw + x) * 4;
      od[o] = sd[s]; od[o + 1] = sd[s + 1]; od[o + 2] = sd[s + 2]; od[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}
