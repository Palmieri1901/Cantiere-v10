import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Hash, Plus, Upload, Pencil, Trash2, Search, ListPlus } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

const VUOTO = { marca: "", modello: "", codice: "", descrizione: "", cause: "", controlli: "" };
const Campo = ({ label, children }) => (<div><label className="text-xs text-muted-foreground">{label}</label>{children}</div>);

export default function CodiciTab() {
  const [list, setList] = useState([]);
  const [marche, setMarche] = useState([]);
  const [marcaSel, setMarcaSel] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const [imp, setImp] = useState({ marca: "", modello: "", testo: "" });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => Promise.all([api.get("/officina/codici", { params: { marca: marcaSel } }), api.get("/officina/codici/marche")]).then(([a, b]) => { setList(a.data); setMarche(b.data); }).catch(() => {});
  useEffect(() => { load(); }, [marcaSel]); // eslint-disable-line react-hooks/exhaustive-deps

  const importa = async () => {
    if (!imp.marca.trim() || !imp.testo.trim()) return toast.error("Indica la marca e incolla l'elenco dei codici");
    setBusy(true);
    try { const r = await api.post("/officina/codici/import", imp); toast.success(`${r.data.righe} righe lette: ${r.data.nuovi} nuovi, ${r.data.aggiornati} aggiornati`); setImp((s) => ({ ...s, testo: "" })); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore importazione"); } finally { setBusy(false); }
  };
  const importaFile = async (file) => {
    if (!file) return;
    if (!imp.marca.trim()) { toast.error("Indica prima la marca"); if (fileRef.current) fileRef.current.value = ""; return; }
    setBusy(true);
    const fd = new FormData(); fd.append("file", file); fd.append("marca", imp.marca); fd.append("modello", imp.modello);
    try { const r = await api.post("/officina/codici/import-file", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 180000 }); toast.success(`${r.data.righe} codici letti dal file: ${r.data.nuovi} nuovi, ${r.data.aggiornati} aggiornati`); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore file"); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const del = async (c) => {
    if (!(await confirmDialog(`Eliminare il codice ${c.marca} ${c.codice}?`, { okLabel: "Elimina" }))) return;
    await api.delete(`/officina/codici/${c.id}`); load();
  };
  const delMarca = async (m) => {
    if (!(await confirmDialog(`Eliminare TUTTI i codici ${m.marca} (${m.n})?`, { okLabel: "Elimina tutti" }))) return;
    await api.delete("/officina/codici", { params: { marca: m.marca } }); setMarcaSel(""); load();
  };
  const ql = q.trim().toLowerCase();
  const vis = list.filter((c) => !ql || `${c.codice} ${c.descrizione} ${c.cause} ${c.controlli} ${c.modello}`.toLowerCase().includes(ql) || c.codice_norm.includes(ql.replace(/[^a-z0-9]/g, "").toUpperCase()));

  return (
    <div className="space-y-6" data-testid="codici-tab">
      <Card className="p-5 space-y-3">
        <div className="label-mini flex items-center gap-1.5"><ListPlus className="w-3.5 h-3.5" /> Carica una tabella di codici errore</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <Input value={imp.marca} onChange={(e) => setImp((s) => ({ ...s, marca: e.target.value }))} placeholder="Marca * (es. Suzuki, Mercury, MFG)" list="marche-codici" data-testid="import-marca" />
          <datalist id="marche-codici">{marche.map((m) => <option key={m.marca} value={m.marca} />)}</datalist>
          <Input value={imp.modello} onChange={(e) => setImp((s) => ({ ...s, modello: e.target.value }))} placeholder="Modello (opzionale, es. DF140A)" data-testid="import-modello" />
        </div>
        <Textarea value={imp.testo} onChange={(e) => setImp((s) => ({ ...s, testo: e.target.value }))} rows={5} className="font-mono-num text-xs" placeholder={"Una riga per codice. Formati accettati:\nC-04 | Sensore temperatura acqua (CTS) | Connettore ossidato, sensore guasto | Misurare 2.45 kΩ a 20°C\nC-14 Sensore pressione atmosferica\n13;Sensore MAP;tubo depressione;verificare 3.9 V"} data-testid="import-testo" />
        <div className="flex flex-wrap gap-2">
          <Button onClick={importa} disabled={busy} className="bg-primary hover:bg-primary/90" data-testid="btn-importa-codici"><Upload className="w-4 h-4 mr-1" /> Importa elenco</Button>
          <label className="inline-flex"><Button asChild variant="outline" disabled={busy}><span className="cursor-pointer"><Upload className="w-4 h-4 mr-1" /> Da file (TXT/CSV/PDF/foto)</span></Button><input ref={fileRef} type="file" accept=".txt,.csv,.pdf,image/*" className="hidden" onChange={(e) => importaFile(e.target.files?.[0])} data-testid="import-file" /></label>
          <Button variant="outline" onClick={() => setEdit({ ...VUOTO, marca: imp.marca, modello: imp.modello })} data-testid="btn-nuovo-codice"><Plus className="w-4 h-4 mr-1" /> Singolo codice</Button>
        </div>
        {busy && <div className="text-xs text-primary animate-pulse">Importazione in corso…</div>}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca codice o descrizione…" className="pl-9" data-testid="codici-cerca" /></div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setMarcaSel("")} className={`text-xs rounded-full border px-3 py-1 ${!marcaSel ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`} data-testid="codici-marca-tutte">Tutte</button>
          {marche.map((m) => <button key={m.marca} onClick={() => setMarcaSel(m.marca === marcaSel ? "" : m.marca)} className={`text-xs rounded-full border px-3 py-1 ${marcaSel === m.marca ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`} data-testid={`codici-marca-${m.marca}`}>{m.marca} ({m.n})</button>)}
        </div>
        <div className="text-xs text-muted-foreground ml-auto" data-testid="codici-conteggio">{vis.length} codici</div>
        {marcaSel && <Button size="sm" variant="ghost" className="text-destructive text-xs" onClick={() => delMarca(marche.find((m) => m.marca === marcaSel))} data-testid="btn-elimina-marca">Elimina tutti {marcaSel}</Button>}
      </div>

      <Card className="overflow-hidden">
        <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/50"><div className="col-span-2">Codice</div><div className="col-span-4">Descrizione</div><div className="col-span-5">Cause / controlli</div><div></div></div>
        <div className="divide-y divide-border">
          {vis.map((c) => (
            <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-start" data-testid={`codice-row-${c.id}`}>
              <div className="col-span-12 sm:col-span-2"><span className="font-mono-num font-semibold">{c.codice}</span><div className="text-[11px] text-muted-foreground">{c.marca}{c.modello ? ` · ${c.modello}` : ""}</div></div>
              <div className="col-span-12 sm:col-span-4">{c.descrizione}</div>
              <div className="col-span-10 sm:col-span-5 text-xs text-muted-foreground">{c.cause && <div><b>Cause:</b> {c.cause}</div>}{c.controlli && <div><b>Controlli:</b> {c.controlli}</div>}</div>
              <div className="col-span-2 sm:col-span-1 flex justify-end gap-0.5"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(c)} data-testid={`btn-edit-codice-${c.id}`}><Pencil className="w-3.5 h-3.5" /></Button><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => del(c)} data-testid={`btn-del-codice-${c.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></div>
            </div>
          ))}
          {!vis.length && <div className="p-8 text-center text-sm text-muted-foreground" data-testid="codici-vuoti"><Hash className="w-5 h-5 mx-auto mb-2 text-muted-foreground/60" />Nessun codice. Incolla una tabella (es. codici Suzuki, Mercury/MFG) oppure caricala da file.</div>}
        </div>
      </Card>

      <CodiceDialog voce={edit} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  );
}

function CodiceDialog({ voce, onClose, onSaved }) {
  const [f, setF] = useState(VUOTO);
  useEffect(() => { if (voce) setF({ ...VUOTO, ...voce }); }, [voce]);
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const salva = async () => {
    if (!f.marca.trim() || !f.codice.trim() || !f.descrizione.trim()) return toast.error("Marca, codice e descrizione obbligatori");
    try { await api[voce?.id ? "put" : "post"](`/officina/codici${voce?.id ? `/${voce.id}` : ""}`, f); toast.success("Codice salvato"); onSaved(); onClose(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
  };
  return (
    <Dialog open={!!voce} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg" data-testid="codice-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl">{voce?.id ? "Modifica codice" : "Nuovo codice errore"}</DialogTitle><DialogDescription>Significato, cause probabili e controlli consigliati.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Marca *"><Input value={f.marca} onChange={(e) => upd("marca", e.target.value)} data-testid="codice-marca" /></Campo>
          <Campo label="Modello"><Input value={f.modello} onChange={(e) => upd("modello", e.target.value)} data-testid="codice-modello" /></Campo>
          <Campo label="Codice *"><Input value={f.codice} onChange={(e) => upd("codice", e.target.value.toUpperCase())} className="font-mono-num" data-testid="codice-codice" /></Campo>
          <div className="col-span-2"><Campo label="Descrizione *"><Input value={f.descrizione} onChange={(e) => upd("descrizione", e.target.value)} data-testid="codice-descrizione" /></Campo></div>
          <div className="col-span-2"><Campo label="Cause probabili"><Textarea rows={2} value={f.cause} onChange={(e) => upd("cause", e.target.value)} data-testid="codice-cause" /></Campo></div>
          <div className="col-span-2"><Campo label="Controlli da fare"><Textarea rows={2} value={f.controlli} onChange={(e) => upd("controlli", e.target.value)} data-testid="codice-controlli" /></Campo></div>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose} data-testid="codice-annulla">Annulla</Button><Button onClick={salva} className="bg-primary hover:bg-primary/90" data-testid="codice-salva">Salva</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
