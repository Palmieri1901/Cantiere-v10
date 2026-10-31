import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const FUNZIONI_APP = [
  ["nuovo", "Aggiungi lavoro", "Registrazione lavori e articoli dal magazzino"],
  ["listino", "Listino magazzino", "Ricerca articoli e prezzo al pubblico"],
  ["officina", "Assistente officina", "Codici errore, schede tecniche, chat AI"],
  ["capitaneria", "Comunicazione Capitaneria", "Avvisi alaggio/varo con PDF ed email"],
  ["quotazione", "Quotazione usato", "Valutazione AI di gommoni e motori con PDF"],
  ["lavagna", "Lavagna", "Messaggi e promemoria dal cantiere"],
];

export function FunzioniDialog({ dip, onClose, onSaved }) {
  const tutte = FUNZIONI_APP.map(([id]) => id);
  const [sel, setSel] = useState(dip.funzioni ?? tutte);
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const salva = async () => {
    setBusy(true);
    try {
      await api.put(`/dipendenti/${dip.id}`, { nome: dip.nome, attivo: dip.attivo, funzioni: sel });
      toast.success("Funzioni aggiornate");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="dialog-funzioni-dip">
        <DialogHeader>
          <DialogTitle>Funzioni app di {dip.nome}</DialogTitle>
          <DialogDescription>Scegli cosa può usare questo dipendente nell'app. "Da inviare" è sempre disponibile.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {FUNZIONI_APP.map(([id, titolo, desc]) => (
            <label key={id} className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40" data-testid={`funz-${id}`}>
              <Checkbox checked={sel.includes(id)} onCheckedChange={() => toggle(id)} data-testid={`funz-check-${id}`} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-medium">{titolo}</span><span className="block text-xs text-muted-foreground">{desc}</span></span>
            </label>
          ))}
        </div>
        <div className="flex justify-between items-center pt-2">
          <Button variant="ghost" size="sm" onClick={() => setSel(sel.length === tutte.length ? [] : tutte)} data-testid="funz-tutte">{sel.length === tutte.length ? "Nessuna" : "Tutte"}</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={salva} disabled={busy} data-testid="funz-salva">Salva</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
