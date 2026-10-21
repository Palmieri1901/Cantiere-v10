import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Clock, User, Archive, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import LavoriSection from "@/pages/LavoriSection";

const STATO = {
  in_attesa: { label: "In attesa", cls: "text-amber-700 border-amber-300" },
  approvato: { label: "Approvato", cls: "text-emerald-700 border-emerald-300" },
  rifiutato: { label: "Rifiutato", cls: "text-destructive border-destructive/40" },
};

export default function ArchivioTab({ onChange }) {
  const [items, setItems] = useState([]);
  const [dip, setDip] = useState("tutti");
  const [stato, setStato] = useState("tutti");
  const [sel, setSel] = useState([]);
  const [modifica, setModifica] = useState(null); // report approvato di cui modificare il lavoro

  const load = () => api.get("/lavori-pending?stato=tutti").then((r) => { setItems(r.data); setSel([]); onChange?.(); });
  useEffect(() => { load(); }, []);

  const dipendenti = useMemo(() => [...new Set(items.map((x) => x.dipendente_nome).filter(Boolean))].sort(), [items]);
  const visibili = items.filter((x) => (dip === "tutti" || x.dipendente_nome === dip) && (stato === "tutti" || x.stato === stato));

  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const toggleAll = () => setSel(sel.length === visibili.length ? [] : visibili.map((x) => x.id));

  const elimina = async (ids) => {
    if (!await confirmDialog(`Eliminare ${ids.length === 1 ? "questo report" : `${ids.length} report`}? I lavori già approvati restano nella scheda cliente.`)) return;
    const r = await api.post("/lavori-pending/elimina", { ids });
    toast.success(`Eliminati ${r.data.eliminati} report`); load();
  };

  return (
    <div data-testid="archivio-tab">
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <Select value={dip} onValueChange={setDip}>
          <SelectTrigger className="w-52" data-testid="filtro-dipendente"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="tutti">Tutti i dipendenti</SelectItem>{dipendenti.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={stato} onValueChange={setStato}>
          <SelectTrigger className="w-44" data-testid="filtro-stato"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="tutti">Tutti gli stati</SelectItem>{Object.entries(STATO).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground flex-1">{visibili.length} report</div>
        {sel.length > 0 && (
          <Button variant="destructive" size="sm" onClick={() => elimina(sel)} data-testid="btn-elimina-selezionati"><Trash2 className="w-3.5 h-3.5 mr-1.5" /> Elimina {sel.length} selezionati</Button>
        )}
      </div>

      {visibili.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center border border-dashed rounded-md flex flex-col items-center gap-2"><Archive className="w-6 h-6 opacity-40" /> Nessun report salvato.</div>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border">
          <div className="p-2 px-3 flex items-center gap-3 bg-muted/40 text-xs text-muted-foreground">
            <Checkbox checked={sel.length === visibili.length && visibili.length > 0} onCheckedChange={toggleAll} data-testid="check-tutti" />
            <span>Seleziona tutti</span>
          </div>
          {visibili.map((p) => {
            const s = STATO[p.stato] || STATO.in_attesa;
            return (
              <div key={p.id} className="p-3 flex items-start gap-3 hover:bg-muted/40" data-testid={`archivio-row-${p.id}`}>
                <Checkbox checked={sel.includes(p.id)} onCheckedChange={() => toggle(p.id)} className="mt-1" data-testid={`check-${p.id}`} />
                <div className="w-28 shrink-0">
                  <div className="font-mono-num text-xs">{p.data}</div>
                  <div className="text-[10px] text-muted-foreground">ricevuto {new Date(p.created_at).toLocaleDateString("it-IT")}</div>
                  <Badge variant="outline" className={`text-[9px] mt-1 ${s.cls}`}>{s.label}</Badge>
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="font-medium text-sm flex items-center gap-1.5"><User className="w-3.5 h-3.5 text-primary" /> {p.dipendente_nome || "—"}<span className="text-muted-foreground font-normal"> · {p.cliente_nome || "cliente non associato"}</span></div>
                  <div className="text-xs mt-0.5 [overflow-wrap:anywhere] line-clamp-3"><span className="font-medium">{p.tipo}</span>{p.descrizione && <span className="text-muted-foreground"> — {p.descrizione}</span>}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 inline-flex items-center gap-1 [overflow-wrap:anywhere]"><Clock className="w-3 h-3 shrink-0" /> {p.ore} h{p.materiali ? ` · Mat.: ${p.materiali}` : ""}</div>
                </div>
                {p.stato === "approvato" && p.lavoro_id && p.cliente_id && (
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => setModifica(p)} title="Modifica il lavoro approvato nella scheda cliente" data-testid={`btn-modifica-lavoro-${p.id}`}><Pencil className="w-3.5 h-3.5 mr-1" /> Modifica lavoro</Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => elimina([p.id])} data-testid={`btn-elimina-${p.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!modifica} onOpenChange={(o) => !o && setModifica(null)}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto" data-testid="archivio-modifica-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Lavori di {modifica?.cliente_nome}</DialogTitle>
            <DialogDescription>Il lavoro approvato si apre già in modifica: correggi ore, voci, articoli o descrizione e salva.</DialogDescription>
          </DialogHeader>
          {modifica && <LavoriSection clienteId={modifica.cliente_id} editLavoroId={modifica.lavoro_id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
