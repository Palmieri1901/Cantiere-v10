import { pdfjs } from "react-pdf";
import { api } from "@/lib/api";

const MAX = 1400;

function fit(src, w, h) {
  const s = Math.min(1, MAX / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s);
  c.height = Math.round(h * s);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

export async function fileToCanvases(file) {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 2.5 });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp, canvas: c }).promise;
      out.push(fit(c, c.width, c.height));
    }
    return out;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return [fit(img, img.naturalWidth, img.naturalHeight)];
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Foto salvate sul server (condivise fra telefono e PC)
export const savePhotos = async (photos) => {
  for (const p of photos) await api.post("/laser/foto", p);
};
export const loadPhotos = () => api.get("/laser/foto").then((r) => r.data || []).catch(() => []);
export const deletePhoto = (id) => api.delete(`/laser/foto/${id}`).catch(() => {});

export async function urlToCanvas(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  return c;
}

export function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
}
