import { useRef, useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileCheck2, Upload, Trash2, BookOpen, PlayCircle, Clapperboard } from "lucide-react";

const TIPI = {
  presentazione: { label: "Real", hint: "breve video di presentazione", icon: Clapperboard, video: true, cls: "border-rose-500 text-rose-700 hover:bg-rose-50" },
  catalogo: { label: "Catalogo", hint: "PDF", icon: BookOpen, video: false, cls: "border-sky-500 text-sky-700 hover:bg-sky-50" },
  omologazione: { label: "Omologazione", hint: "PDF", icon: FileCheck2, video: false, cls: "border-emerald-500 text-emerald-700 hover:bg-emerald-50" },
};

// Pulsante upload/apri/rimuovi per un documento del modello: Real = video, Catalogo/Omologazione = PDF.
export default function DocumentoButton({ modello, tipo, onChanged }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const cfg = TIPI[tipo];
  const Icon = cfg.icon;
  const has = !!modello[`${tipo}_file_id`];
  const isVideo = cfg.video || (modello[`${tipo}_mime`] || "").startsWith("video/");

  const upload = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const pdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    const video = f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
    if (cfg.video ? !video : !pdf) { toast.error(cfg.video ? "Il Real deve essere un breve video (MP4/MOV)" : `${cfg.label}: carica un file PDF`); return; }
    if (video && f.size > 120 * 1024 * 1024) { toast.error("Video troppo grande (max 120 MB): accorcialo o comprimilo"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      await api.post(`/gommoni/modelli/${modello.id}/doc/${tipo}`, fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 600000 });
      toast.success(`${cfg.label} caricato`);
      onChanged?.();
    } catch (err) { toast.error(err.response?.data?.detail || "Errore upload"); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!await confirmDialog(`Rimuovere ${isVideo ? "il video" : "il PDF"} "${cfg.label}"?`)) return;
    await api.delete(`/gommoni/modelli/${modello.id}/doc/${tipo}`);
    toast.success(`${cfg.label} rimosso`); onChanged?.();
  };

  const apri = () => {
    if (isVideo) setVideoOpen(true);
    else window.open(`${API}/gommoni/modelli/${modello.id}/doc/${tipo}.pdf?_t=${Date.now()}`, "_blank");
  };

  return (
    <div className="flex items-center gap-1">
      <input ref={inputRef} type="file" accept={cfg.video ? "video/*,.mp4,.mov,.m4v,.webm" : "application/pdf,.pdf"} className="hidden" onChange={upload} data-testid={`in-${tipo}-${modello.id}`} />
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
            {isVideo ? <PlayCircle className="w-3.5 h-3.5 mr-1" /> : <Icon className="w-3.5 h-3.5 mr-1" />} {cfg.label}
          </Button>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="text-muted-foreground hover:text-foreground" title={`Sostituisci (${cfg.hint})`} data-testid={`btn-${tipo}-replace-${modello.id}`}><Upload className="w-3.5 h-3.5" /></button>
          <button type="button" onClick={remove} className="text-muted-foreground hover:text-destructive" title="Rimuovi" data-testid={`btn-${tipo}-del-${modello.id}`}><Trash2 className="w-3.5 h-3.5" /></button>
        </>
      ) : (
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => inputRef.current?.click()} disabled={busy} title={`Carica ${cfg.hint}`} data-testid={`btn-${tipo}-upload-${modello.id}`}>
          <Upload className="w-3.5 h-3.5 mr-1" /> {busy ? "Caricamento…" : `${cfg.label} (${cfg.video ? "video" : "PDF"})`}
        </Button>
      )}
    </div>
  );
}
