import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stamp, Loader2, Trash2 } from "lucide-react";
import { leggiFile, preparaTimbro } from "@/lib/scanImage";
import { confirmDialog } from "@/components/ConfirmDialog";

// Timbro e firma prescansionati: si caricano una volta, lo sfondo bianco diventa trasparente
export function TimbroCard({ timbro, setTimbro }) {
  const inp = useRef(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/scanner/timbro").then((r) => setTimbro(r.data.immagine)).catch(() => {}); }, [setTimbro]);
  const salva = async (img) => {
    setBusy(true);
    try { const r = await api.put("/scanner/timbro", { immagine: img }); setTimbro(r.data.immagine); toast.success(img ? "Timbro e firma salvati" : "Timbro rimosso"); }
    catch (e) { toast.error(e.response?.data?.detail || "Salvataggio non riuscito"); } finally { setBusy(false); }
  };
  const carica = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) salva(await preparaTimbro(await leggiFile(f)));
  };
  const togli = async () => { if (await confirmDialog("Rimuovere il timbro e firma salvato?", { okLabel: "Rimuovi" })) salva(""); };
  return (
    <Card className="p-4 flex items-center gap-4 flex-wrap" data-testid="timbro-card">
      <div className="w-28 h-16 rounded border bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px] grid place-items-center overflow-hidden shrink-0">
        {timbro ? <img src={timbro} alt="Timbro e firma" className="max-w-full max-h-full" data-testid="timbro-anteprima" /> : <Stamp className="w-6 h-6 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-[180px]">
        <div className="font-semibold text-sm">Timbro e firma</div>
        <p className="text-xs text-muted-foreground">Fotografa timbro e firma su un foglio bianco: lo sfondo viene tolto da solo. Resta salvato per i prossimi documenti.</p>
      </div>
      <input ref={inp} type="file" accept="image/*" className="hidden" onChange={carica} data-testid="timbro-file" />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => inp.current?.click()} disabled={busy} data-testid="timbro-carica">
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Stamp className="w-4 h-4 mr-1" />} {timbro ? "Sostituisci" : "Carica"}
        </Button>
        {timbro && <Button size="icon" variant="ghost" className="text-destructive" onClick={togli} data-testid="timbro-elimina"><Trash2 className="w-4 h-4" /></Button>}
      </div>
    </Card>
  );
}
