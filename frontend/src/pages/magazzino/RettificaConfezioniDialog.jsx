import { useEffect, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Boxes } from "lucide-react";

// Rettifica articoli con prezzo a confezione: chiede i pezzi per confezione e converte prezzi (÷) e giacenza (×) in pezzi
export default function RettificaConfezioniDialog({ open, onOpenChange, onDone }) {
  const [items, setItems] = useState([]);
  const [pezzi, setPezzi] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) api.get("/magazzino/articoli-confezione").then((r) => { setItems(r.data); setPezzi({}); }).catch(() => {}); }, [open]);
  const pronti = items.filter((a) => Number(pezzi[a.id]) >= 1);
  const applica = async () => {
    setSaving(true);
    try {
      const r = await api.post("/magazzino/rettifica-confezione", { items: pronti.map((a) => ({ id: a.id, pezzi: Number(pezzi[a.id]) })) });
      toast.success(`${r.data.rettificati} articoli convertiti a pezzo`); onDone?.(); onOpenChange(false);
    } catch (e) { toast.error(e.response?.data?.detail || "Errore rettifica"); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[90vh] flex flex-col" data-testid="rettifica-cf-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Boxes className="w-5 h-5 text-primary" /> Rettifica articoli a confezione</DialogTitle>
          <DialogDescription>Per ogni articolo con prezzo a confezione indica quanti pezzi contiene: il prezzo di acquisto e di vendita verranno divisi per i pezzi, la giacenza moltiplicata, e l'unità diventerà "pz".</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-2">
          {items.length === 0 && <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md" data-testid="rettifica-cf-vuoto">Nessun articolo con prezzo a confezione: è tutto a posto.</div>}
          {items.map((a) => {
            const p = Number(pezzi[a.id]) || 0;
            return (
              <div key={a.id} className="rounded-md border p-3 flex flex-wrap items-center gap-3 text-sm" data-testid={`rettifica-cf-${a.id}`}>
                <div className="flex-1 min-w-[180px]">
                  <div className="font-medium">{a.nome}</div>
                  <div className="text-xs text-muted-foreground font-mono-num">{a.codice || "—"} · {fmtEuro(a.prezzo_acquisto || 0)}/cf acquisto · {fmtEuro(a.prezzo_listino || 0)}/cf vendita · giacenza {a.quantita} cf</div>
                  {p >= 1 && <div className="text-xs text-primary mt-0.5" data-testid={`rettifica-cf-anteprima-${a.id}`}>→ {fmtEuro((a.prezzo_acquisto || 0) / p)}/pz acquisto · {fmtEuro((a.prezzo_listino || 0) / p)}/pz vendita · giacenza {+(a.quantita * p).toFixed(2)} pz</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Pezzi per confezione</span>
                  <Input type="number" min="1" step="1" value={pezzi[a.id] || ""} onChange={(e) => setPezzi((s) => ({ ...s, [a.id]: e.target.value }))} className="h-9 w-24 text-right" placeholder="es. 12" data-testid={`rettifica-cf-pezzi-${a.id}`} />
                </div>
              </div>
            );
          })}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
          <Button onClick={applica} disabled={saving || pronti.length === 0} data-testid="btn-rettifica-cf-applica">{saving ? "Rettifica…" : `Rettifica ${pronti.length} articoli`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
