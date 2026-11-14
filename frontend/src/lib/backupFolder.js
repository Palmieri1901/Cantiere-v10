import { api } from "@/lib/api";

const PREFIX = "backup_geb_completo_";
const MAX_COPIE = 3;

const fmtMB = (b) => `${(b / 1048576).toFixed(1).replace(".", ",")} MB`;

const fetchBackup = async (onProgress) => {
  const res = await api.get("/backup", { responseType: "blob", timeout: 0, onDownloadProgress: (e) => onProgress?.(`Preparazione backup… ${fmtMB(e.loaded)} ricevuti`) });
  onProgress?.("Salvataggio del file…");
  const cd = res.headers?.["content-disposition"] || "";
  const m = cd.match(/filename=([^;]+)/);
  const filename = (m ? m[1].trim().replace(/"/g, "") : `${PREFIX}${Date.now()}.json`);
  return { blob: res.data, filename };
};

const pruneOld = async (dir) => {
  const files = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "file" && name.startsWith(PREFIX) && name.endsWith(".json")) files.push(name);
  }
  files.sort();
  const toDelete = files.slice(0, Math.max(0, files.length - MAX_COPIE));
  for (const name of toDelete) await dir.removeEntry(name);
  return { kept: files.length - toDelete.length, deleted: toDelete.length };
};

export async function salvaBackupInCartella(onProgress) {
  onProgress?.("Preparazione backup…");
  // Sul PC (installazione locale) il backend scrive direttamente nella cartella scelta: funziona con qualunque browser
  const info = (await api.get("/backup/cartella")).data;
  if (info.su_pc && info.cartella) {
    const t0 = Date.now();
    const timer = setInterval(() => onProgress?.(`Preparazione backup sul PC… ${Math.round((Date.now() - t0) / 1000)} s`), 1000);
    let r;
    try { r = (await api.post("/backup/su-disco", null, { timeout: 0 })).data; } finally { clearInterval(timer); }
    return { mode: "pc", filename: r.file, folder: r.cartella, kept: r.copie, deleted: r.eliminati };
  }
  if (info.su_pc) { const e = new Error("Scegli prima la cartella dei backup in Impostazioni → Backup (cartella sul PC)."); e.name = "NoFolder"; throw e; }
  // La scelta della cartella/file va fatta SUBITO (serve il gesto dell'utente), prima del download che può durare minuti
  let dir = null;
  let fileHandle = null;
  try {
    if (typeof window.showDirectoryPicker === "function") {
      dir = await window.showDirectoryPicker({ mode: "readwrite", id: "geb-backup", startIn: "documents" });
    } else if (typeof window.showSaveFilePicker === "function") {
      fileHandle = await window.showSaveFilePicker({ suggestedName: `${PREFIX}${new Date().toISOString().slice(0, 10)}.json`, types: [{ description: "Backup JSON", accept: { "application/json": [".json"] } }] });
    }
  } catch (e) {
    if (e?.name === "AbortError") throw e; // l'utente ha annullato
    // picker non disponibile su questo browser/dispositivo: si usa il download normale
  }
  const { blob, filename } = await fetchBackup(onProgress);
  if (dir) {
    const fh = await dir.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    const { kept, deleted } = await pruneOld(dir);
    return { mode: "folder", filename, folder: dir.name, kept, deleted };
  }
  if (fileHandle) {
    const w = await fileHandle.createWritable();
    await w.write(blob);
    await w.close();
    return { mode: "file", filename: fileHandle.name };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { mode: "download", filename };
}
