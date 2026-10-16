import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StickyNote, Trash2, Pencil, Plus } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

// Memo personali dell'operatore (codice operatore, promemoria…): elenco + nuovo/modifica. L'assistente li usa come fonte.
export default function MemoDialog({ open, onClose, client, basePath = "/officina", autore = "", soloNuovo = false }) {
  const [list, setList] = useState([]);
  const [edit, setEdit] = useState(soloNuovo ? { titolo: "", testo: "" } : null);
  const [busy, setBusy] = useState(false);
  const load = () => client.get(`${basePath}/memo`).then((r) => setList(r.data || [])).catch(() => {});
  useEffect(() => { if (open) { load(); setEdit(soloNuovo ? { titolo: "", testo: "" } : null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const puoModificare = basePath === "/officina";

  const salva = async () => {
    if (!edit.titolo.trim()) return toast.error("Scrivi un titolo (es. Codice operatore)");
    setBusy(true);
    try {
      await client[edit.id ? "put" : "post"](`${basePath}/memo${edit.id ? `/${edit.id}` : ""}`, { ...edit, autore });
      toast.success("Memo salvato"); setEdit(null); load();
      if (soloNuovo) onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore"); } finally { setBusy(false); }
  };
  const del = async (m) => {
    if (!(await confirmDialog(`Eliminare il memo "${m.titolo}"?`, { okLabel: "Elimina" }))) return;
    await client.delete(`${basePath}/memo/${m.id}`); load();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="memo-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl flex items-center gap-2"><StickyNote className="w-5 h-5 text-primary" /> I miei memo</DialogTitle><DialogDescription>Appunti personali dell'officina (codici operatore, promemoria, trucchi). L'assistente li tiene in considerazione nelle risposte.</DialogDescription></DialogHeader>
        {edit ? (
          <div className="space-y-3">
            <Input value={edit.titolo} onChange={(e) => setEdit((s) => ({ ...s, titolo: e.target.value }))} placeholder="Titolo (es. Codice operatore diagnosi Suzuki)" autoFocus data-testid="memo-titolo" />
            <Textarea value={edit.testo} onChange={(e) => setEdit((s) => ({ ...s, testo: e.target.value }))} rows={5} placeholder="Testo del memo…" data-testid="memo-testo" />
            <DialogFooter className="gap-2"><Button variant="outline" onClick={() => (soloNuovo ? onClose() : setEdit(null))} data-testid="memo-annulla">Annulla</Button><Button onClick={salva} disabled={busy} className="bg-primary hover:bg-primary/90" data-testid="memo-salva">Salva memo</Button></DialogFooter>
          </div>
        ) : (
          <div className="space-y-2">
            <Button size="sm" onClick={() => setEdit({ titolo: "", testo: "" })} className="bg-primary hover:bg-primary/90" data-testid="btn-nuovo-memo"><Plus className="w-4 h-4 mr-1" /> Nuovo memo</Button>
            <div className="divide-y divide-border rounded-md border border-border max-h-[55vh] overflow-y-auto">
              {list.map((m) => (
                <div key={m.id} className="p-3 flex items-start gap-2 text-sm" data-testid={`memo-row-${m.id}`}>
                  <div className="flex-1 min-w-0"><div className="font-medium">{m.titolo}</div>{m.testo && <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{m.testo}</div>}<div className="text-[10px] text-muted-foreground mt-1">{(m.updated_at || "").slice(0, 10)}{m.autore ? ` · ${m.autore}` : ""}</div></div>
                  {puoModificare && <><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(m)} data-testid={`btn-edit-memo-${m.id}`}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del(m)} data-testid={`btn-del-memo-${m.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></>}
                </div>
              ))}
              {!list.length && <div className="p-6 text-center text-xs text-muted-foreground" data-testid="memo-vuoti">Nessun memo. Scrivi il primo, ad esempio il tuo codice operatore.</div>}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
