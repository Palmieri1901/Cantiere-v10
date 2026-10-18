import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Camera, ImageIcon, Loader2 } from "lucide-react";

// Riduce la foto (max 1600px) e la converte in JPEG base64 per l'invio
const comprimi = (file) => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL("image/jpeg", 0.85));
  };
  img.onerror = reject;
  img.src = url;
});

// Tasto "Foto targhetta": scatta/importa una foto della matricola del motore, l'AI legge marca/modello/matricola
export default function FotoTarghetta({ client, basePath, sessionId, onLetto, disabled }) {
  const camRef = useRef(null);
  const galRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const b64 = await comprimi(f);
      const r = await client.post(`${basePath}/targhetta`, { immagine: b64, session_id: sessionId });
      onLetto(r.data, b64);
      toast.success(`Targhetta letta: ${r.data.riga}`);
    } catch (err) { toast.error(err.response?.data?.detail || "Lettura foto non riuscita"); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid="input-foto-camera" />
      <input ref={galRef} type="file" accept="image/*" hidden onChange={onFile} data-testid="input-foto-galleria" />
      <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={busy || disabled} onClick={() => camRef.current?.click()} title="Scatta una foto della targhetta/matricola del motore" data-testid="btn-foto-camera">
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin sm:mr-1" /> : <Camera className="w-3.5 h-3.5 sm:mr-1" />}<span className="hidden sm:inline">{busy ? "Leggo…" : "Foto targhetta"}</span>
      </Button>
      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={busy || disabled} onClick={() => galRef.current?.click()} title="Importa una foto dalla galleria" data-testid="btn-foto-galleria"><ImageIcon className="w-3.5 h-3.5" /></Button>
    </span>
  );
}
