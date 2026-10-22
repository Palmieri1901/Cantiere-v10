import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

export const CATEGORIE = [
  ["incasso", "Incasso"], ["carburante", "Carburante"], ["riparazione", "Riparazione"], ["biglietti", "Biglietti / traghetto"],
  ["pedaggio", "Pedaggio"], ["assicurazione", "Assicurazione / bollo"], ["altro", "Altro"],
];

const F = ({ label, children }) => (
  <div className="space-y-1.5"><Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>{children}</div>
);

export function MezzoDialog({ open, onClose, mezzo, onSaved }) {
  const [f, setF] = useState({ nome: "", targa: "", note: "", attivo: true });
  useEffect(() => { if (open) setF(mezzo ? { nome: mezzo.nome, targa: mezzo.targa || "", note: mezzo.note || "", attivo: mezzo.attivo !== false } : { nome: "", targa: "", note: "", attivo: true }); }, [open, mezzo]);
  const save = async () => {
    if (!f.nome.trim()) return toast.error("Inserisci il nome del mezzo");
    try {
      const r = mezzo ? await api.put(`/mezzi/${mezzo.id}`, f) : await api.post("/mezzi", f);
      toast.success(mezzo ? "Mezzo aggiornato" : "Mezzo aggiunto"); onSaved(r.data); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="mezzo-dialog">
        <DialogHeader><DialogTitle>{mezzo ? "Modifica mezzo" : "Nuovo mezzo"}</DialogTitle><DialogDescription>Camion, muletto, gru, furgone…</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <F label="Nome *"><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="es. Camion Iveco" data-testid="mezzo-nome" /></F>
          <F label="Targa"><Input value={f.targa} onChange={(e) => setF({ ...f, targa: e.target.value })} data-testid="mezzo-targa" /></F>
          <F label="Note"><Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="mezzo-note" /></F>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button onClick={save} data-testid="mezzo-salva">Salva</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MovimentoDialog({ open, onClose, mezzi, movimento, mezzoDefault, onSaved }) {
  const empty = () => ({ mezzo_id: mezzoDefault || mezzi[0]?.id || "", data: new Date().toISOString().slice(0, 10), categoria: "carburante", importo: "", descrizione: "" });
  const [f, setF] = useState(empty());
  useEffect(() => { if (open) setF(movimento ? { ...movimento, importo: movimento.importo } : empty()); }, [open, movimento]); // eslint-disable-line
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!f.mezzo_id) return toast.error("Scegli il mezzo");
    if (!(Number(f.importo) > 0)) return toast.error("Inserisci l'importo");
    const body = { mezzo_id: f.mezzo_id, data: f.data, categoria: f.categoria, importo: Number(f.importo), descrizione: f.descrizione || "", pagato: movimento?.pagato === false ? false : true };
    try {
      movimento ? await api.put(`/mezzi/movimenti/${movimento.id}`, body) : await api.post("/mezzi/movimenti", body);
      toast.success("Movimento salvato"); onSaved(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="movimento-dialog">
        <DialogHeader><DialogTitle>{movimento ? "Modifica movimento" : "Nuovo movimento"}</DialogTitle><DialogDescription>Incasso o spesa di gestione del mezzo.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <F label="Mezzo">
            <Select value={f.mezzo_id} onValueChange={(v) => set("mezzo_id", v)}>
              <SelectTrigger data-testid="mov-mezzo"><SelectValue placeholder="Scegli…" /></SelectTrigger>
              <SelectContent>{mezzi.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome}{m.targa ? ` · ${m.targa}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Data"><Input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} data-testid="mov-data" /></F>
          <F label="Tipo">
            <Select value={f.categoria} onValueChange={(v) => set("categoria", v)}>
              <SelectTrigger data-testid="mov-categoria"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIE.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <F label="Importo €"><Input type="number" inputMode="decimal" step="0.01" min="0" value={f.importo} onChange={(e) => set("importo", e.target.value)} className="font-mono-num" data-testid="mov-importo" /></F>
          <div className="sm:col-span-2"><F label="Descrizione"><Input value={f.descrizione} onChange={(e) => set("descrizione", e.target.value)} placeholder="es. Gasolio Q8 Portoferraio" data-testid="mov-descrizione" /></F></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Annulla</Button><Button onClick={save} data-testid="mov-salva">Salva</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
