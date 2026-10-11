import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Save } from "lucide-react";

export default function EventoDialog({ evento, tipi, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setF(evento ? { ...evento } : null); }, [evento]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const salva = async () => {
    if (!f.titolo?.trim()) return toast.error("Inserisci un titolo");
    if (!f.data) return toast.error("Inserisci la data");
    setSaving(true);
    try {
      const body = { data: f.data, ora: f.ora || "", titolo: f.titolo, tipo_id: f.tipo_id, note: f.note || "" };
      if (f.id) await api.put(`/calendario/eventi/${f.id}`, body); else await api.post("/calendario/eventi", body);
      toast.success(f.id ? "Appuntamento aggiornato" : "Appuntamento aggiunto"); onSaved(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore nel salvataggio"); }
    finally { setSaving(false); }
  };

  const elimina = async () => {
    if (!await confirmDialog(`Eliminare "${f.titolo}"?`, { okLabel: "Elimina" })) return;
    await api.delete(`/calendario/eventi/${f.id}`); toast.success("Appuntamento eliminato"); onSaved(); onClose();
  };

  return (
    <Dialog open={!!evento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="evento-dialog">
        <DialogHeader><DialogTitle className="font-display">{f?.id ? "Modifica appuntamento" : "Nuovo appuntamento"}</DialogTitle></DialogHeader>
        {f && (
          <div className="space-y-3">
            <div>
              <Label>Titolo</Label>
              <Input value={f.titolo} onChange={set("titolo")} placeholder="Es. Alaggio Rossi — Gommone 7m" autoFocus data-testid="evento-titolo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data</Label><Input type="date" value={f.data} onChange={set("data")} data-testid="evento-data" /></div>
              <div><Label>Ora <span className="text-muted-foreground font-normal">(opz.)</span></Label><Input type="time" value={f.ora || ""} onChange={set("ora")} data-testid="evento-ora" /></div>
            </div>
            <div>
              <Label>Tipo</Label>
              <div className="flex flex-wrap gap-1.5 mt-1" data-testid="evento-tipi">
                {tipi.map((t) => (
                  <button key={t.id} type="button" onClick={() => setF((s) => ({ ...s, tipo_id: t.id }))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${f.tipo_id === t.id ? "text-white border-transparent" : "border-border text-foreground hover:bg-muted"}`}
                    style={f.tipo_id === t.id ? { background: t.colore } : {}} data-testid={`evento-tipo-${t.id}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: f.tipo_id === t.id ? "#fff" : t.colore }} /> {t.nome}
                  </button>
                ))}
              </div>
            </div>
            <div><Label>Note</Label><Textarea rows={3} value={f.note || ""} onChange={set("note")} placeholder="Dettagli, telefono, barca…" data-testid="evento-note" /></div>
          </div>
        )}
        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {f?.id ? <Button variant="ghost" onClick={elimina} className="text-destructive hover:text-destructive" data-testid="evento-elimina"><Trash2 className="w-4 h-4 mr-1.5" /> Elimina</Button> : <span />}
          <Button onClick={salva} disabled={saving} className="bg-primary hover:bg-primary/90" data-testid="evento-salva"><Save className="w-4 h-4 mr-1.5" /> {saving ? "Salvataggio…" : "Salva"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
