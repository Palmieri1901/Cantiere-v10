import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Lightbulb, Search } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";
import SalvaCasoDialog from "@/pages/officina/SalvaCasoDialog";

export default function CasiTab() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/officina/casi").then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const del = async (c) => {
    if (!(await confirmDialog("Eliminare questo caso dalla memoria dell'officina?", { okLabel: "Elimina" }))) return;
    await api.delete(`/officina/casi/${c.id}`); toast.success("Eliminato"); load();
  };
  const ql = q.trim().toLowerCase();
  const vis = list.filter((c) => !ql || `${c.motore} ${c.codici} ${c.sintomo} ${c.diagnosi} ${c.soluzione}`.toLowerCase().includes(ql));
  return (
    <div className="space-y-4" data-testid="casi-tab">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per motore, codice, sintomo…" className="pl-9" data-testid="casi-cerca" /></div>
        <div className="text-xs text-muted-foreground" data-testid="casi-conteggio">{vis.length} casi</div>
        <Button onClick={() => setEdit({})} className="ml-auto bg-primary hover:bg-primary/90" data-testid="btn-nuovo-caso"><Plus className="w-4 h-4 mr-1" /> Nuovo caso</Button>
      </div>
      <div className="space-y-2">
        {vis.map((c) => (
          <Card key={c.id} className="p-4 flex items-start gap-3" data-testid={`caso-row-${c.id}`}>
            <span className="w-9 h-9 rounded-md bg-amber-100 text-amber-900 grid place-items-center shrink-0"><Lightbulb className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0 text-sm">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{c.motore || "Motore non indicato"}</span>{c.codici && <Badge variant="outline" className="font-mono-num text-[10px]">{c.codici}</Badge>}<span className="text-xs text-muted-foreground ml-auto">{(c.created_at || "").slice(0, 10)}{c.autore ? ` · ${c.autore}` : ""}</span></div>
              <div className="mt-1"><span className="text-muted-foreground">Sintomo:</span> {c.sintomo}</div>
              {c.diagnosi && <div className="text-muted-foreground text-xs mt-0.5 line-clamp-2">Diagnosi: {c.diagnosi}</div>}
              <div className="mt-1"><span className="text-muted-foreground">Soluzione:</span> <b>{c.soluzione}</b></div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => setEdit(c)} data-testid={`btn-edit-caso-${c.id}`}><Pencil className="w-4 h-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => del(c)} data-testid={`btn-del-caso-${c.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </Card>
        ))}
        {!vis.length && <Card className="p-8 text-center text-sm text-muted-foreground" data-testid="casi-vuoti">Nessun caso memorizzato. Dopo una diagnosi premi "Salva come caso risolto" oppure aggiungine uno qui.</Card>}
      </div>
      <SalvaCasoDialog dati={edit} onClose={() => setEdit(null)} client={api} onSaved={load} />
    </div>
  );
}
