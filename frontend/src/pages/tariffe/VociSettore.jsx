import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Plus, Trash2 } from "lucide-react";
import { UNITA, normUnita } from "@/lib/unita";

const slug = (s) => (s || "altri").toLowerCase().replace(/[^a-z0-9]+/g, "-");

// Voci aggiunte dall'utente in un settore del listino (servizi_extra con campo settore)
export function VociSettore({ t, setT, settore = "" }) {
  const voci = (t.servizi_extra || []).map((s, i) => ({ s, i })).filter(({ s }) => (s.settore || "") === settore);
  const set = (i, patch) => setT({ ...t, servizi_extra: t.servizi_extra.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const del = async (i) => { if (await confirmDialog("Eliminare questa voce dal listino?", { okLabel: "Elimina" })) setT({ ...t, servizi_extra: t.servizi_extra.filter((_, j) => j !== i) }); };
  const add = () => setT({ ...t, servizi_extra: [...(t.servizi_extra || []), { nome: "", unita: "forfait", prezzo: "", settore }] });
  const k = slug(settore);
  return (
    <div className="space-y-2 mt-3" data-testid={`voci-settore-${k}`}>
      {voci.map(({ s, i }) => (
        <div key={i} className="flex items-center gap-2 flex-wrap sm:flex-nowrap" data-testid={`servizio-extra-${i}`}>
          <Input value={s.nome} placeholder="Nome voce" onChange={(e) => set(i, { nome: e.target.value })} className="flex-1 min-w-[160px] h-9" data-testid={`servizio-nome-${i}`} />
          <select value={normUnita(s.unita).id} onChange={(e) => set(i, { unita: e.target.value })} className="w-40 h-9 rounded-md border border-input bg-background px-2 text-sm" data-testid={`servizio-unita-${i}`}>
            {UNITA.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
          <div className="relative w-28 shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
            <Input type="number" step="0.01" min="0" value={s.prezzo} onChange={(e) => set(i, { prezzo: e.target.value })} className="pl-8 font-mono-num text-right h-9" data-testid={`servizio-prezzo-${i}`} />
          </div>
          <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => del(i)} data-testid={`servizio-del-${i}`}><Trash2 className="w-4 h-4" /></Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={add} data-testid={`btn-aggiungi-voce-${k}`}><Plus className="w-4 h-4 mr-1" /> Aggiungi voce</Button>
    </div>
  );
}
