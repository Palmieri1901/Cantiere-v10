import { useRef, useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileCheck2, Upload, Trash2, BookOpen, PlayCircle } from "lucide-react";

const TIPI = {
  omologazione: { label: "Omologazione", icon: FileCheck2, cls: "border-emerald-500 text-emerald-700 hover:bg-emerald-50" },
  presentazione: { label: "Presentazione", icon: BookOpen, cls: "border-sky-500 text-sky-700 hover:bg-sky-50" },
};

// Pulsante upload/apri/rimuovi per un documento del modello. La Presentazione accetta PDF o breve video.
export default function DocumentoButton({ modello, tipo, onChanged }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const cfg = TIPI[tipo];
  const Icon = cfg.icon;
  const has = !!modello[`${tipo}_file_id`];
  const isVideo = (modello[`${tipo}_mime`] || "").startsWith("video/");
  const accettaVideo = tipo === "presentazione";

  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const pdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const video = f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
    if (!pdf && !(accettaVideo && video)) { toast.error(accettaVideo ? "Carica un PDF o un breve video (MP4/MOV)" : "Carica un file PDF"); return; }
    if (video && f.size > 120 * 1024 * 1024) { toast.error("Video troppo grande (max 120 MB): accorcialo o comprimilo"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      await api.post(`/gommoni/modelli/${modello.id}/doc/${tipo}`, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 600000 });
      toast.success(`${cfg.label} caricata`);
      onChanged?.();
    } catch (err) { toast.error(err.response?.data?.detail || "Errore upload"); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!await confirmDialog(`Rimuovere ${isVideo ? "il video" : "il PDF"} di ${cfg.label.toLowerCase()}?`)) return;
    await api.delete(`/gommoni/modelli/${modello.id}/doc/${tipo}`);
    toast.success(`${cfg.label} rimossa`); onChanged?.();
  };

  const apri = () => {
    if (isVideo) setVideoOpen(true);
    else window.open(`${API}/gommoni/modelli/${modello.id}/doc/${tipo}.pdf?_t=${Date.now()}`, "_blank");
  };

  return (
    <div className="flex items-center gap-1">
      <input ref={inputRef} type="file" accept={accettaVideo ? "application/pdf,.pdf,video/*,.mp4,.mov,.m4v,.webm" : "application/pdf,.pdf"} className="hidden" onChange={upload} data-testid={`in-${tipo}-${modello.id}`} />
      {videoOpen && (
        <Dialog open onOpenChange={(o) => !o && setVideoOpen(false)}>
          <DialogContent className="max-w-3xl p-2 sm:p-4" data-testid={`video-${tipo}-${modello.id}`}>
            <DialogHeader><DialogTitle className="text-base">{cfg.label} — {modello.modello}</DialogTitle></DialogHeader>
            <video src={`${API}/gommoni/modelli/${modello.id}/doc/${tipo}/file`} controls autoPlay playsInline className="w-full max-h-[75vh] rounded-md bg-black" data-testid={`video-player-${modello.id}`} />
          </DialogContent>
        </Dialog>
      )}
      {has ? (
        <>
          <Button variant="outline" size="sm" className={`h-7 px-2 text-xs ${cfg.cls}`} title={modello[`${tipo}_nome`]} onClick={apri} data-testid={`btn-${tipo}-view-${modello.id}`}>
            {isVideo ? <PlayCircle className="w-3.5 h-3.5 mr-1" /> : <Icon className="w-3.5 h-3.5 mr-1" />} {cfg.label}{isVideo ? " (video)" : ""}
          </Button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="text-muted-foreground hover:text-foreground" title={accettaVideo ? "Sostituisci (PDF o video)" : "Sostituisci PDF"} data-testid={`btn-${tipo}-replace-${modello.id}`}><Upload className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={remove} className="text-muted-foreground hover:text-destructive" title="Rimuovi" data-testid={`btn-${tipo}-del-${modello.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => inputRef.current?.click()} disabled={busy} title={accettaVideo ? "Carica PDF o breve video" : "Carica PDF"} data-testid={`btn-${tipo}-upload-${modello.id}`}>
          <Upload className="w-3.5 h-3.5 mr-1" /> {busy ? "Caricamento…" : `${cfg.label}${accettaVideo ? " (PDF/video)" : ""}`}
        </Button>
      )}
    </div>
  );
}
