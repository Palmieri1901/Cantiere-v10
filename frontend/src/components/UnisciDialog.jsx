import { useEffect, useMemo, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Merge, ArrowRight, Check, AlertTriangle, Loader2 } from "lucide-react";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Unisce `sorgente` (che verrà eliminato) in un cliente principale scelto tra `candidati`.
export function UnisciDialog({ sorgente, candidati, endpoint, onClose, onDone }) {
  const [q, setQ] = useState("");
  const [principale, setPrincipale] = useState(null);
  const [anteprima, setAnteprima] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setQ(""); setPrincipale(null); setAnteprima(null); }, [sorgente]);

  const lista = useMemo(() => {
    const s = norm(q);
    const parole = norm(sorgente?.label).split(/\s+/).filter((p) => p.length >= 3);
    return candidati.filter((c) => c.id !== sorgente?.id && (!s || norm(c.label).includes(s)))
      .sort((a, b) => (parole.some((p) => norm(b.label).includes(p)) ? 1 : 0) - (parole.some((p) => norm(a.label).includes(p)) ? 1 : 0)).slice(0, 10);
  }, [q, candidati, sorgente]);

  useEffect(() => {
    if (!principale || !sorgente) return;
    setAnteprima(null);
    api.post(endpoint, { principale_id: principale.id, secondario_id: sorgente.id, anteprima: true }).then((r) => setAnteprima(r.data)).catch((e) => toast.error(e.response?.data?.detail || "Errore"));
  }, [principale, sorgente, endpoint]);

  const unisci = async () => {
    setBusy(true);
    try {
      const r = await api.post(endpoint, { principale_id: principale.id, secondario_id: sorgente.id });
      toast.success(`Uniti: ${r.data.lavori} lavori spostati su ${r.data.principale}`);
      onClose(); onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Unione non riuscita"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!sorgente} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="unisci-dialog">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Merge className="w-5 h-5 text-primary" /> Unisci cliente doppio</DialogTitle>
          <DialogDescription>Scegli il cliente <b>principale</b> che resta: <b>{sorgente?.label}</b> verrà eliminato e tutti i suoi lavori, movimenti e preventivi passeranno al principale.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca il cliente principale…" data-testid="unisci-cerca" />
          <div className="max-h-44 overflow-y-auto rounded-md border border-border divide-y divide-border" data-testid="unisci-lista">
            {lista.length === 0 && <div className="text-xs text-muted-foreground p-3 text-center">Nessun cliente trovato</div>}
            {lista.map((c) => (
              <button key={c.id} type="button" onClick={() => setPrincipale(c)} className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-muted/50 ${principale?.id === c.id ? "bg-primary/10" : ""}`} data-testid={`unisci-opt-${c.id}`}>
                <span className="flex-1 min-w-0"><span className="font-medium">{c.label}</span>{c.sub && <span className="block text-[11px] text-muted-foreground truncate">{c.sub}</span>}</span>
                {principale?.id === c.id && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
          {principale && sorgente && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs space-y-1.5" data-testid="unisci-anteprima">
              <div className="flex items-center gap-2 font-medium text-sm"><span className="line-through text-muted-foreground">{sorgente.label}</span><ArrowRight className="w-4 h-4" /><span>{principale.label}</span></div>
              {anteprima ? (
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>{anteprima.lavori} lavori ({fmtEuro(anteprima.totale_lavori)}) passano a {principale.label}</li>
                  {anteprima.da_approvare > 0 && <li>{anteprima.da_approvare} lavori da approvare riassegnati</li>}
                  {anteprima.movimenti > 0 && <li>{anteprima.movimenti} movimenti di magazzino riassegnati</li>}
                  {anteprima.preventivi > 0 && <li>{anteprima.preventivi} preventivi riassegnati</li>}
                  <li className="flex items-center gap-1 text-amber-900"><AlertTriangle className="w-3.5 h-3.5" /> La scheda "{sorgente.label}" viene eliminata. Operazione non annullabile.</li>
                </ul>
              ) : <div className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calcolo…</div>}
            </div>
          )}
        </div>
        <DialogFooter className="flex-row gap-2 justify-end">
          <Button variant="outline" onClick={onClose} data-testid="unisci-annulla">Annulla</Button>
          <Button onClick={unisci} disabled={!principale || !anteprima || busy} className="bg-primary hover:bg-primary/90" data-testid="unisci-conferma"><Merge className="w-4 h-4 mr-1.5" /> Unisci</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
