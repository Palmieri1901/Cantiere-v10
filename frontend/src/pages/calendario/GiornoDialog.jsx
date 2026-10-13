import { api } from "@/lib/api";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Clock, CalendarDays, StickyNote } from "lucide-react";

const fmtGiorno = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function GiornoDialog({ data, eventi, tipi, onClose, onNuovo, onModifica, onChanged }) {
  const lista = eventi.filter((e) => e.data === data).sort((a, b) => (a.ora || "99").localeCompare(b.ora || "99"));
  const tipo = (id) => tipi.find((t) => t.id === id) || { nome: "Altro", colore: "#6b7280" };

  const elimina = async (e) => {
    if (!await confirmDialog(`Eliminare "${e.titolo}"?`, { okLabel: "Elimina" })) return;
    await api.delete(`/calendario/eventi/${e.id}`); toast.success("Appuntamento eliminato"); onChanged();
  };

  return (
    <Dialog open={!!data} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg p-0 overflow-hidden" data-testid="giorno-dialog">
        <DialogHeader className="px-5 pt-5 pb-4 bg-muted/40 border-b border-border text-left">
          <div className="label-mini flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Agenda del giorno</div>
          <DialogTitle className="font-display text-2xl capitalize" data-testid="giorno-titolo">{data && fmtGiorno(data)}</DialogTitle>
          <DialogDescription data-testid="giorno-conteggio">{lista.length === 0 ? "Nessun appuntamento" : `${lista.length} ${lista.length === 1 ? "appuntamento" : "appuntamenti"}`}</DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4 max-h-[55vh] overflow-y-auto space-y-3">
          {lista.length === 0 && <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">Giornata libera. Aggiungi il primo appuntamento qui sotto.</div>}
          {lista.map((e) => {
            const t = tipo(e.tipo_id);
            return (
              <div key={e.id} className="flex gap-3 rounded-lg border border-border bg-card p-3" data-testid={`giorno-evento-${e.id}`}>
                <div className="w-1.5 rounded-full shrink-0" style={{ background: t.colore }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-white text-[10px] uppercase tracking-wide" style={{ background: t.colore }}>{t.nome}</span>
                    {e.ora ? <span className="inline-flex items-center gap-1 text-sm font-mono-num font-semibold"><Clock className="w-3.5 h-3.5 text-muted-foreground" /> {e.ora}</span> : <span className="text-xs text-muted-foreground">Tutto il giorno</span>}
                  </div>
                  <div className="font-medium text-base mt-1.5 leading-snug break-words">{e.titolo}</div>
                  {e.cliente_nome && <div className="text-xs text-muted-foreground mt-0.5">Cliente: {e.cliente_nome}{e.cliente_barca ? ` · ${e.cliente_barca}` : ""}</div>}
                  {e.cliente_memo && <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950 flex gap-2" data-testid={`giorno-memo-${e.id}`}><StickyNote className="w-4 h-4 shrink-0 text-amber-700" /><span className="whitespace-pre-wrap">{e.cliente_memo}</span></div>}
                  {e.note && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap break-words">{e.note}</div>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => onModifica(e)} title="Modifica" data-testid={`giorno-modifica-${e.id}`}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => elimina(e)} title="Elimina" className="text-destructive hover:text-destructive" data-testid={`giorno-elimina-${e.id}`}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-4 border-t border-border bg-card">
          <Button onClick={() => onNuovo(data)} className="w-full bg-primary hover:bg-primary/90" data-testid="giorno-aggiungi"><Plus className="w-4 h-4 mr-1.5" /> Aggiungi appuntamento</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
