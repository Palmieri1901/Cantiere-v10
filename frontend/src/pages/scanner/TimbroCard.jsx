import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Stamp, Loader2, Trash2, Check, X } from "lucide-react";
import { leggiFile, preparaTimbro } from "@/lib/scanImage";
import { confirmDialog } from "@/components/ConfirmDialog";

// Timbro e firma prescansionati: si caricano una volta, lo sfondo bianco diventa trasparente
export function TimbroCard({ timbro, setTimbro }) {
  const inp = useRef(null);
  const [busy, setBusy] = useState(false);
  const [grezzo, setGrezzo] = useState("");
  const [forza, setForza] = useState(50);
  const [prova, setProva] = useState("");
  useEffect(() => {
    if (!grezzo) return;
    const t = setTimeout(() => { preparaTimbro(grezzo, forza).then(setProva); }, 150);
    return () => clearTimeout(t);
  }, [grezzo, forza]);
  useEffect(() => { api.get("/scanner/timbro").then((r) => setTimbro(r.data.immagine)).catch(() => {}); }, [setTimbro]);
  const salva = async (img) => {
    setBusy(true);
    try { const r = await api.put("/scanner/timbro", { immagine: img }); setTimbro(r.data.immagine); toast.success(img ? "Timbro e firma salvati" : "Timbro rimosso"); }
    catch (e) { toast.error(e.response?.data?.detail || "Salvataggio non riuscito"); } finally { setBusy(false); }
  };
  const carica = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) { setProva(""); setForza(50); setGrezzo(await leggiFile(f)); }
  };
  const conferma = async () => { await salva(prova); setGrezzo(""); };
  const togli = async () => { if (await confirmDialog("Rimuovere il timbro e firma salvato?", { okLabel: "Rimuovi" })) salva(""); };
  return (
    <Card className="p-4 flex items-center gap-4 flex-wrap" data-testid="timbro-card">
      <div className={`${grezzo ? "w-full h-36" : "w-28 h-16"} rounded border bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:12px_12px] flex items-center justify-center overflow-hidden shrink-0`}>
        {grezzo ? (prova ? <img src={prova} alt="Anteprima timbro" className="w-full h-full object-contain" data-testid="timbro-prova" /> : <Loader2 className="w-5 h-5 animate-spin" />)
          : timbro ? <img src={timbro} alt="Timbro e firma" className="max-w-full max-h-full" data-testid="timbro-anteprima" /> : <Stamp className="w-6 h-6 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-[180px]">
        <div className="font-semibold text-sm">Timbro e firma</div>
        <p className="text-xs text-muted-foreground">Fotografa timbro e firma su un foglio: lo sfondo (anche beige o in ombra) diventa trasparente da solo. Resta salvato per i prossimi documenti.</p>
      </div>
      <input ref={inp} type="file" accept="image/*" className="hidden" onChange={carica} data-testid="timbro-file" />
      {grezzo ? (
        <div className="w-full space-y-3" data-testid="timbro-regola">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>Più chiaro</span>
            <Slider value={[forza]} min={0} max={100} step={5} onValueChange={([v]) => setForza(v)} className="flex-1" aria-label="Intensità timbro e firma" data-testid="timbro-cursore" />
            <span>Più scuro</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setGrezzo("")} disabled={busy} data-testid="timbro-annulla"><X className="w-4 h-4 mr-1" /> Annulla</Button>
            <Button size="sm" onClick={conferma} disabled={busy || !prova} data-testid="timbro-salva">
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />} Salva
            </Button>
          </div>
        </div>
      ) : (
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => inp.current?.click()} disabled={busy} data-testid="timbro-carica">
          {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Stamp className="w-4 h-4 mr-1" />} {timbro ? "Sostituisci" : "Carica"}
        </Button>
        {timbro && <Button size="icon" variant="ghost" className="text-destructive" onClick={togli} data-testid="timbro-elimina"><Trash2 className="w-4 h-4" /></Button>}
      </div>
      )}
    </Card>
  );
}
