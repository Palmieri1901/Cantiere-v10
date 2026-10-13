import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Save, X, StickyNote } from "lucide-react";

export default function EventoDialog({ evento, tipi, onClose, onSaved }) {
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [clienti, setClienti] = useState([]);
  const [qc, setQc] = useState("");
  useEffect(() => { setF(evento ? { ...evento } : null); setQc(""); }, [evento]);
  useEffect(() => { if (evento && clienti.length === 0) api.get("/clienti").then((r) => setClienti(r.data)).catch(() => {}); }, [evento]); // eslint-disable-line react-hooks/exhaustive-deps
  const clienteSel = f?.cliente_id ? clienti.find((c) => c.id === f.cliente_id) : null;
  const clientiFiltrati = useMemo(() => {
    const s = qc.trim().toLowerCase();
    return s.length < 2 ? [] : clienti.filter((c) => `${c.cognome} ${c.nome}`.toLowerCase().includes(s)).slice(0, 8);
  }, [qc, clienti]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

    const salva = async () => {
    if (!f.titolo?.trim()) return toast.error("Inserisci un titolo");
    if (!f.data) return toast.error("Inserisci la data");
    setSaving(true);
    try {
      const body = { data: f.data, ora: f.ora || "", titolo: f.titolo, tipo_id: f.tipo_id, note: f.note || "", cliente_id: f.cliente_id || null };
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
            <div>
              <Label>Cliente <span className="text-muted-foreground font-normal">(opz. — richiama il memo)</span></Label>
              {clienteSel ? (
                <div className="mt-1 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm" data-testid="evento-cliente-scelto">
                  <span className="flex-1 min-w-0 truncate"><b>{clienteSel.cognome} {clienteSel.nome}</b> <span className="text-muted-foreground">· {clienteSel.tipo_barca}</span></span>
                  <button type="button" onClick={() => setF((s) => ({ ...s, cliente_id: null }))} data-testid="evento-cliente-rimuovi"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <Input value={qc} onChange={(e) => setQc(e.target.value)} placeholder="Cerca cognome o nome…" data-testid="evento-cliente-cerca" />
                  {qc.trim().length >= 2 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg divide-y max-h-44 overflow-y-auto">
                      {clientiFiltrati.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nessun cliente</div>}
                      {clientiFiltrati.map((c) => (
                        <button key={c.id} type="button" onClick={() => { setF((s) => ({ ...s, cliente_id: c.id, titolo: s.titolo || `${c.cognome} ${c.nome}`.trim() })); setQc(""); }} className="w-full text-left px-3 py-2 text-sm hover:bg-muted" data-testid={`evento-cliente-opt-${c.id}`}>
                          <span className="font-medium">{c.cognome} {c.nome}</span> <span className="text-xs text-muted-foreground">· {c.tipo_barca} · {c.anno}</span>{c.memo && <StickyNote className="w-3 h-3 inline ml-1.5 text-amber-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {clienteSel?.memo && (
                <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950 flex gap-2" data-testid="evento-memo"><StickyNote className="w-4 h-4 shrink-0 text-amber-700" /><span className="whitespace-pre-wrap">{clienteSel.memo}</span></div>
              )}
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
