import { useEffect, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { confirmDialog } from "@/components/ConfirmDialog";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { openBlob } from "@/pages/ddt/common";
import { toast } from "sonner";
import { Truck, Plus, Pencil, Trash2, FileText } from "lucide-react";
import TabellaAnno from "@/pages/mezzi/TabellaAnno";
import { MezzoDialog, MovimentoDialog, CATEGORIE } from "@/pages/mezzi/MezziDialogs";

const label = (k) => (CATEGORIE.find(([c]) => c === k) || [])[1] || k;
const fmt = (s) => (s ? s.split("-").reverse().join("/") : "");

export default function Mezzi() {
  const [mezzi, setMezzi] = useState([]);
  const [anni, setAnni] = useState([new Date().getFullYear()]);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [mezzoId, setMezzoId] = useState("");
  const [mese, setMese] = useState(null);
  const [riep, setRiep] = useState(null);
  const [movs, setMovs] = useState([]);
  const [dlgMezzo, setDlgMezzo] = useState({ open: false, mezzo: null });
  const [dlgMov, setDlgMov] = useState({ open: false, movimento: null });
  const [preview, setPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  const loadMezzi = () => api.get("/mezzi").then((r) => setMezzi(r.data));
  const loadDati = () => {
    const q = `anno=${anno}${mezzoId ? `&mezzo_id=${mezzoId}` : ""}`;
    api.get(`/mezzi/riepilogo?${q}`).then((r) => setRiep(r.data));
    api.get(`/mezzi/movimenti?${q}${mese ? `&mese=${mese}` : ""}`).then((r) => setMovs(r.data));
    api.get("/mezzi/anni").then((r) => setAnni(r.data));
  };
  useEffect(() => { loadMezzi(); }, []);
  useEffect(() => { loadDati(); }, [anno, mezzoId, mese]); // eslint-disable-line

  const eliminaMov = async (m) => {
    if (!await confirmDialog(`Eliminare ${label(m.categoria).toLowerCase()} di ${fmtEuro(m.importo)} del ${fmt(m.data)}?`, { title: "Elimina movimento", okLabel: "Elimina" })) return;
    try { await api.delete(`/mezzi/movimenti/${m.id}`); toast.success("Eliminato"); loadDati(); } catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
  };
  const eliminaMezzo = async (m) => {
    if (!await confirmDialog(`Eliminare il mezzo "${m.nome}"?`, { title: "Elimina mezzo", okLabel: "Elimina" })) return;
    try { await api.delete(`/mezzi/${m.id}`); toast.success("Mezzo eliminato"); if (mezzoId === m.id) setMezzoId(""); loadMezzi(); } catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
  };
  const pdf = () => openBlob(api, "get", `/mezzi/riepilogo.pdf?anno=${anno}${mezzoId ? `&mezzo_id=${mezzoId}` : ""}`, null, setPreviewUrl, setPreview).catch(() => toast.error("Errore PDF"));
  const nomeMezzo = (id) => mezzi.find((m) => m.id === id)?.nome || "—";

  return (
    <div className="p-6 md:p-10 max-w-7xl" data-testid="mezzi-page">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <div className="label-mini flex items-center gap-1.5 mb-2"><Truck className="w-3.5 h-3.5" /> Parco mezzi</div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold mb-2">Consumi e ricavi mezzi</h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl">Incassi e spese di gestione di camion e altri mezzi del cantiere, mese per mese, con parziali e totale dell'anno.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={pdf} data-testid="mezzi-pdf"><FileText className="w-4 h-4 mr-2" /> PDF anno</Button>
          <Button variant="outline" onClick={() => setDlgMezzo({ open: true, mezzo: null })} data-testid="mezzi-nuovo-mezzo"><Plus className="w-4 h-4 mr-2" /> Mezzo</Button>
          <Button onClick={() => { if (!mezzi.length) { toast.error("Aggiungi prima un mezzo"); return; } setDlgMov({ open: true, movimento: null }); }} data-testid="mezzi-nuovo-movimento"><Plus className="w-4 h-4 mr-2" /> Nuovo movimento</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center mb-5">
        <Select value={String(anno)} onValueChange={(v) => { setAnno(Number(v)); setMese(null); }}>
          <SelectTrigger className="w-28" data-testid="mezzi-anno"><SelectValue /></SelectTrigger>
          <SelectContent>{anni.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant={mezzoId === "" ? "default" : "outline"} onClick={() => setMezzoId("")} data-testid="mezzi-filtro-tutti">Tutti i mezzi</Button>
        {mezzi.map((m) => (
          <div key={m.id} className="flex items-center">
            <Button size="sm" variant={mezzoId === m.id ? "default" : "outline"} className="rounded-r-none" onClick={() => setMezzoId(m.id)} data-testid={`mezzi-filtro-${m.id}`}>{m.nome}{m.targa ? <span className="ml-1.5 opacity-70 text-xs">{m.targa}</span> : null}</Button>
            <Button size="sm" variant="outline" className="rounded-none border-l-0 px-2" onClick={() => setDlgMezzo({ open: true, mezzo: m })} title="Modifica" data-testid={`mezzo-edit-${m.id}`}><Pencil className="w-3 h-3" /></Button>
            <Button size="sm" variant="outline" className="rounded-l-none border-l-0 px-2 text-destructive" onClick={() => eliminaMezzo(m)} title="Elimina" data-testid={`mezzo-del-${m.id}`}><Trash2 className="w-3 h-3" /></Button>
          </div>
        ))}
        {mezzi.length === 0 && <span className="text-muted-foreground text-sm basis-full">Nessun mezzo: aggiungine uno con il pulsante "Mezzo".</span>}
      </div>

      <TabellaAnno r={riep} meseSel={mese} onMese={setMese} />

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="font-display text-xl font-semibold">Movimenti {mese ? `· ${riep?.mesi[mese - 1]?.nome} ${anno}` : `· ${anno}`} <span className="text-sm text-muted-foreground font-normal">({movs.length})</span></div>
          {mese && <Button size="sm" variant="ghost" onClick={() => setMese(null)} data-testid="mezzi-mese-reset">Mostra tutto l'anno</Button>}
        </div>
        {movs.length === 0 ? (
          <div className="p-6 rounded-md border border-dashed text-center text-sm text-muted-foreground">Nessun movimento.</div>
        ) : (
          <div className="rounded-md border border-border divide-y">
            {movs.map((m) => (
              <div key={m.id} className="px-3 py-2 text-sm hover:bg-muted/30" data-testid={`mov-riga-${m.id}`}>
                <div className="flex items-center gap-3">
                  <div className="font-mono-num text-muted-foreground w-24 shrink-0">{fmt(m.data)}</div>
                  <Badge variant={m.categoria === "incasso" ? "default" : "secondary"} className={m.categoria === "incasso" ? "bg-emerald-600 hover:bg-emerald-600" : ""}>{label(m.categoria)}</Badge>
                  <div className="flex-1 min-w-0 truncate hidden sm:block">{m.descrizione || <span className="text-muted-foreground">—</span>}{!mezzoId && <span className="text-muted-foreground"> · {nomeMezzo(m.mezzo_id)}</span>}</div>
                  <div className={`ml-auto font-mono-num font-semibold whitespace-nowrap ${m.categoria === "incasso" ? "text-emerald-700" : ""}`}>{m.categoria === "incasso" ? "+" : "−"} {fmtEuro(m.importo)}</div>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDlgMov({ open: true, movimento: m })} data-testid={`mov-edit-${m.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => eliminaMov(m)} data-testid={`mov-del-${m.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
                <div className="sm:hidden text-xs text-muted-foreground mt-1 pl-[6.75rem] [overflow-wrap:anywhere]" data-testid={`mov-desc-${m.id}`}>{m.descrizione || "—"}{!mezzoId && ` · ${nomeMezzo(m.mezzo_id)}`}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <MezzoDialog open={dlgMezzo.open} mezzo={dlgMezzo.mezzo} onClose={() => setDlgMezzo({ open: false, mezzo: null })} onSaved={() => loadMezzi()} />
      <MovimentoDialog open={dlgMov.open} movimento={dlgMov.movimento} mezzi={mezzi} mezzoDefault={mezzoId} onClose={() => setDlgMov({ open: false, movimento: null })} onSaved={loadDati} />
      <PdfPreviewOverlay open={preview} onClose={() => setPreview(false)} url={previewUrl} filename={`mezzi_${anno}.pdf`} />
    </div>
  );
}
