import { api, API } from "@/lib/api";
import { toast } from "sonner";

const toAbs = (u) => (u.startsWith("http") || u.startsWith("blob:") ? u : `${API}${u.startsWith("/") ? "" : "/"}${u}`);

async function fetchPdf(url) {
  if (url.startsWith("blob:")) return (await fetch(url)).blob();
  const r = await api.get(toAbs(url), { responseType: "blob" });
  return r.data;
}

// Condivide un PDF su WhatsApp: su telefono usa la condivisione nativa (file allegato),
// altrimenti crea un link temporaneo (30 giorni) e apre WhatsApp con il messaggio.
export async function condividiPdfWhatsApp(url, filename = "documento.pdf", testo = "") {
  try {
    const blob = await fetchPdf(url);
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename, text: testo || `Documento: ${filename}` });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("filename", filename);
    const r = await api.post("/condividi/pdf", fd, { headers: { "Content-Type": "multipart/form-data" } });
    const msg = `${testo || `Ecco il documento ${filename.replace(/_/g, " ").replace(/\.pdf$/i, "")}`}\n${r.data.url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    toast.success("Link creato (valido 30 giorni): scegli il contatto su WhatsApp");
  } catch (e) {
    toast.error(e.response?.data?.detail || "Impossibile condividere il PDF");
  }
}
