import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";

const PALETTE = ["#2563eb", "#0d9488", "#b0543a", "#d97706", "#7c3aed", "#db2777", "#16a34a", "#6b7280"];

export default function TipiDialog({ open, onOpenChange, tipi, onSaved }) {
  const [lista, setLista] = useState([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setLista(tipi.map((t) => ({ ...t }))); }, [open, tipi]);

  const upd = (i, k, v) => setLista((l) => l.map((t, j) => j === i ? { ...t, [k]: v } : t));
  const aggiungi = () => setLista((l) => [...l, { id: null, nome: "", colore: PALETTE[l.length % PALETTE.length] }]);
  const rimuovi = (i) => setLista((l) => l.filter((_, j) => j !== i));

  const salva = async () => {
    if (lista.filter((t) => t.nome.trim()).length === 0) return toast.error("Serve almeno un tipo");
    setSaving(true);
    try { const r = await api.put("/calendario/tipi", lista); onSaved(r.data); toast.success("Tipi aggiornati"); onOpenChange(false); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore nel salvataggio"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="tipi-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Tipi di appuntamento</DialogTitle>
          <DialogDescription>Rinomina, cambia colore, aggiungi o elimina le voci. Gli appuntamenti già inseriti con un tipo eliminato restano, mostrati in grigio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {lista.map((t, i) => (
            <div key={i} className="flex items-center gap-2" data-testid={`tipo-riga-${i}`}>
              <input type="color" value={t.colore} onChange={(e) => upd(i, "colore", e.target.value)} className="w-9 h-9 rounded-md border border-input bg-background p-0.5 cursor-pointer shrink-0" data-testid={`tipo-colore-${i}`} />
              <Input value={t.nome} onChange={(e) => upd(i, "nome", e.target.value)} placeholder="Nome tipo" data-testid={`tipo-nome-${i}`} />
              <Button variant="ghost" size="icon" onClick={() => rimuovi(i)} className="shrink-0 text-destructive hover:text-destructive" data-testid={`tipo-rimuovi-${i}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          ))}
          <Button variant="outline" onClick={aggiungi} className="w-full" data-testid="tipo-aggiungi"><Plus className="w-4 h-4 mr-1.5" /> Aggiungi tipo</Button>
        </div>
        <DialogFooter>
          <Button onClick={salva} disabled={saving} className="bg-primary hover:bg-primary/90" data-testid="tipi-salva"><Save className="w-4 h-4 mr-1.5" /> {saving ? "Salvataggio…" : "Salva"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
