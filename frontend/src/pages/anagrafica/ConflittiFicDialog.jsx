import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { api } from "@/lib/api";

export function ConflittiFicDialog({ conflitti, onClose, onApplied }) {
  const [sel, setSel] = useState(() => new Set((conflitti || []).map((c) => c.anagrafica_id)));
  const [busy, setBusy] = useState(false);
  if (!conflitti?.length) return null;
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const applica = async () => {
    setBusy(true);
    try {
      const voci = conflitti.filter((c) => sel.has(c.anagrafica_id)).map((c) => ({ anagrafica_id: c.anagrafica_id, dati_fic: c.dati_fic }));
      const r = await api.post("/fatturazione/importa-clienti/applica", voci);
      toast.success(`${r.data.aggiornati} voci aggiornate con i dati di Fatture in Cloud`);
      onApplied?.(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore aggiornamento"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-conflitti-fic">
        <DialogHeader>
          <DialogTitle>Dati diversi tra gestionale e Fatture in Cloud</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{conflitti.length} nominativi già presenti hanno valori diversi. Spunta quelli da aggiornare con i dati di Fatture in Cloud (i campi vuoti su Fatture in Cloud non cancellano nulla).</p>
        <div className="space-y-2">
          {conflitti.map((c) => (
            <label key={c.anagrafica_id} className="flex gap-3 items-start border border-border/60 rounded-md p-3 cursor-pointer" data-testid={`conflitto-${c.anagrafica_id}`}>
              <Checkbox checked={sel.has(c.anagrafica_id)} onCheckedChange={() => toggle(c.anagrafica_id)} className="mt-0.5" data-testid={`conflitto-check-${c.anagrafica_id}`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm break-words">{c.nome}</div>
                <div className="text-xs mt-1 space-y-0.5">
                  {c.differenze.map((d) => (
                    <div key={d.campo} className="flex flex-wrap gap-x-2">
                      <span className="text-muted-foreground w-28 shrink-0">{d.etichetta}</span>
                      <span className="line-through text-muted-foreground break-all">{d.attuale}</span>
                      <span className="font-medium break-all">→ {d.fic}</span>
                    </div>
                  ))}
                </div>
              </div>
            </label>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="conflitti-ignora">Lascia come sono</Button>
          <Button onClick={applica} disabled={busy || !sel.size} data-testid="conflitti-applica">{busy ? "Aggiorno…" : `Aggiorna ${sel.size} con Fatture in Cloud`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
