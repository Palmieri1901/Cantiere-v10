import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, X, Package } from "lucide-react";

// Lista di accessori (tag) con lista di scelta condivisa salvata in /gommoni/{endpoint}.
export default function ListaAccessori({ titolo, endpoint, valori, onChange, colore = "emerald", testId }) {
  const [voci, setVoci] = useState([]);
  const [nuovo, setNuovo] = useState("");
  const [gestione, setGestione] = useState(false);
  const lista = valori || [];
  useEffect(() => { api.get(`/gommoni/${endpoint}`).then((r) => setVoci(r.data.voci || [])).catch(() => {}); }, [endpoint]);
  const saveVoci = async (list) => {
    try { const r = await api.put(`/gommoni/${endpoint}`, { voci: list }); setVoci(r.data.voci); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore lista"); }
  };
  const add = async (val) => {
    const v = (val ?? nuovo).trim();
    if (!v) return;
    if (!lista.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...lista, v]);
    if (!voci.some((x) => x.toLowerCase() === v.toLowerCase())) await saveVoci([...voci, v]);
    setNuovo("");
  };
  const del = (i) => onChange(lista.filter((_, idx) => idx !== i));
  const delVoce = async (v) => { if (await confirmDialog(`Eliminare "${v}" dalla lista di scelta? I modelli che già lo hanno non vengono modificati.`)) await saveVoci(voci.filter((x) => x !== v)); };
  const chip = colore === "emerald" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-sky-50 border-sky-200 text-sky-800";
  return (
    <div className="col-span-2 md:col-span-4" data-testid={testId}>
      <div className="label-mini mb-1.5 flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> {titolo} — <span className="text-primary">{lista.length}</span>
        <button type="button" className="ml-auto text-[10px] underline text-muted-foreground hover:text-foreground normal-case tracking-normal" onClick={() => setGestione((g) => !g)} data-testid={`${testId}-gestione`}>{gestione ? "Chiudi gestione lista" : "Gestisci lista di scelta"}</button>
      </div>
      <div className="flex gap-2 mb-2">
        <select className="h-8 rounded-md border border-input bg-background px-2 text-sm flex-1 min-w-0" value="" onChange={(e) => e.target.value && add(e.target.value)} data-testid={`${testId}-select`}>
          <option value="">Scegli dalla lista…</option>
          {voci.filter((v) => !lista.some((x) => x.toLowerCase() === v.toLowerCase())).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <Input value={nuovo} onChange={(e) => setNuovo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="oppure nuova voce…" className="h-8 flex-1 min-w-0" data-testid={`${testId}-input`} />
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => add()} data-testid={`${testId}-add`}><Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi</Button>
      </div>
      {gestione && (
        <div className="mb-2 rounded-md border bg-muted/30 p-2 text-xs" data-testid={`${testId}-lista`}>
          <div className="text-muted-foreground mb-1">Voci nella lista di scelta ({voci.length}). La ✕ elimina solo dalla lista di scelta.</div>
          <div className="flex flex-wrap gap-1.5">
            {voci.map((v) => <span key={v} className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5">{v}<button type="button" onClick={() => delVoce(v)} className="hover:text-destructive" data-testid={`${testId}-voce-del-${v}`}><X className="w-3 h-3" /></button></span>)}
          </div>
        </div>
      )}
      {lista.length === 0 ? <div className="text-xs text-muted-foreground">Nessuna voce inserita.</div> : (
        <div className="flex flex-wrap gap-1.5">
          {lista.map((s, i) => (
            <span key={i} className={`inline-flex items-center gap-1 rounded-full border text-xs px-2.5 py-1 ${chip}`} data-testid={`${testId}-item-${i}`}>
              {s}
              <button type="button" onClick={() => del(i)} className="hover:text-destructive" title="Rimuovi da questa lista" data-testid={`${testId}-del-${i}`}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
