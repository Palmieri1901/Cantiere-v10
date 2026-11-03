import { api } from "@/lib/api";

const PREFIX = "backup_geb_completo_";
const MAX_COPIE = 3;

const fetchBackup = async () => {
  const res = await api.get("/backup", { responseType: "blob", timeout: 0 });
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

export async function salvaBackupInCartella() {
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
  const { blob, filename } = await fetchBackup();
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
