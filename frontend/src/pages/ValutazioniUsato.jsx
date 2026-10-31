import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BadgeEuro, FileText, Trash2, Loader2, Sparkles } from "lucide-react";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { WhatsAppPdfButton } from "@/components/WhatsAppPdfButton";
import { confirmDialog } from "@/components/ConfirmDialog";
import { openBlob } from "@/pages/ddt/common";
import { ValutazioneCard } from "@/pages/valutazioni/ValutazioneCard";
import { FotoPicker } from "@/pages/valutazioni/FotoPicker";

const L = ({ children }) => <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{children}</label>;
const STATI = [["ottimo", "Ottimo"], ["buono", "Buono"], ["usurato", "Usurato"], ["pessimo", "Pessimo"]];
const StatoSelect = ({ value, onChange, testId }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger data-testid={testId}><SelectValue /></SelectTrigger>
    <SelectContent>{STATI.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
  </Select>
);

export default function ValutazioniUsato({ client = api, mobile = false }) {
  const anno = new Date().getFullYear();
  const [conMotore, setConMotore] = useState(true);
  const [conGommone, setConGommone] = useState(true);
  const [cliente, setCliente] = useState({ cliente: "", telefono: "", note: "" });
  const [motore, setMotore] = useState({ modello: "", anno: anno - 5, ore: "", stato: "buono", numero: 1 });
  const [gommone, setGommone] = useState({ modello: "", anno: anno - 5, stato: "buono", tipo: "gommone", tubolari_nuovi: false, tubolari_anni: "" });
  const [fotoMotore, setFotoMotore] = useState([]);
  const [fotoGommone, setFotoGommone] = useState([]);
  const [busy, setBusy] = useState(false);
  const [lista, setLista] = useState([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState("");

  const load = () => client.get("/valutazioni").then((r) => setLista(r.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const attendi = async (id) => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const d = (await client.get(`/valutazioni/${id}`)).data;
      if (d.stato === "pronta") return d;
      if (d.stato === "errore") throw new Error(d.errore || "Errore AI");
    }
    throw new Error("Tempo scaduto: riprova tra poco dall'elenco");
  };

  const valuta = async () => {
    if (!conMotore && !conGommone) { toast.error("Seleziona motore e/o imbarcazione"); return; }
    if (conMotore && !motore.modello.trim()) { toast.error("Indica il modello del motore"); return; }
    if (conGommone && !gommone.modello.trim()) { toast.error("Indica il modello dell'imbarcazione"); return; }
    setBusy(true);
    try {
      const body = {
        ...cliente,
        motore: conMotore ? { ...motore, anno: Number(motore.anno), ore: Number(motore.ore) || 0, numero: Math.max(1, Number(motore.numero) || 1) } : null,
        gommone: conGommone ? { ...gommone, anno: Number(gommone.anno), tubolari_nuovi: gommone.tipo === "gommone" && gommone.tubolari_nuovi, tubolari_anni: gommone.tipo === "gommone" && gommone.tubolari_nuovi && gommone.tubolari_anni !== "" ? Number(gommone.tubolari_anni) : null } : null,
        foto_motore: conMotore ? fotoMotore : [],
        foto_gommone: conGommone ? fotoGommone : [],
      };
      const r = await client.post("/valutazioni", body, { timeout: 120000 });
      setLista((l) => [r.data, ...l]);
      const pronta = await attendi(r.data.id);
      setLista((l) => l.map((x) => (x.id === pronta.id ? pronta : x)));
      toast.success("Valutazione pronta");
      await apriPdf(pronta);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Valutazione non riuscita");
      load();
    } finally { setBusy(false); }
  };

  const riprova = async (v) => {
    try {
      await client.post(`/valutazioni/${v.id}/riprova`);
      setLista((l) => l.map((x) => (x.id === v.id ? { ...x, stato: "in_corso", errore: "" } : x)));
      const pronta = await attendi(v.id);
      setLista((l) => l.map((x) => (x.id === pronta.id ? pronta : x)));
      toast.success("Valutazione pronta");
    } catch (e) { toast.error(e.response?.data?.detail || e.message || "Riprova non riuscita"); load(); }
  };

  const nomeFile = (v) => `Valutazione_${(v.cliente || v.gommone?.modello || v.motore?.modello || "usato").replace(/\s+/g, "_")}.pdf`;
  const apriPdf = async (v) => {
    try {
      if (mobile) { const r = await client.get(`/valutazioni/${v.id}/pdf`, { responseType: "blob" }); window.open(URL.createObjectURL(new Blob([r.data], { type: "application/pdf" })), "_blank"); return; }
      setPreviewName(nomeFile(v)); await openBlob(client, "get", `/valutazioni/${v.id}/pdf`, null, setPreviewUrl, setPreviewOpen);
    }
    catch (e) { toast.error(e.response?.data?.detail || "Errore PDF"); }
  };
  const elimina = async (v) => {
    if (!await confirmDialog("Eliminare questa valutazione?", { okLabel: "Elimina" })) return;
    try { await client.delete(`/valutazioni/${v.id}`); setLista((l) => l.filter((x) => x.id !== v.id)); toast.success("Eliminata"); } catch { toast.error("Errore"); }
  };

  return (
    <div className="space-y-6" data-testid="valutazioni-page">
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><BadgeEuro className="w-4 h-4" /> Valutazioni usato</div>
        <h1 className={`font-serif mt-1 ${mobile ? "text-2xl" : "text-3xl sm:text-4xl"}`}>Quotazione usato AI</h1>
        <p className="text-muted-foreground text-sm mt-1">Valore di mercato stile Eurotax di imbarcazione (gommone o barca) e/o motori fuoribordo. Report PDF su carta intestata, inviabile su WhatsApp.</p>
      </div>

      <Card className="p-4 sm:p-6 space-y-5">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5"><L>Cliente (facoltativo)</L><Input value={cliente.cliente} onChange={(e) => setCliente({ ...cliente, cliente: e.target.value })} placeholder="Nome e cognome" data-testid="val-cliente" /></div>
          <div className="space-y-1.5"><L>Telefono WhatsApp</L><Input value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} placeholder="es. 347…" data-testid="val-telefono" /></div>
          <div className="space-y-1.5"><L>Note</L><Input value={cliente.note} onChange={(e) => setCliente({ ...cliente, note: e.target.value })} placeholder="Accessori, difetti, tagliandi…" data-testid="val-note" /></div>
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`rounded-lg border p-4 space-y-3 ${conMotore ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between"><div className="font-semibold">Motore fuoribordo</div><Switch checked={conMotore} onCheckedChange={setConMotore} data-testid="val-switch-motore" /></div>
            {conMotore && <>
              <div className="space-y-1.5"><L>Modello</L><Input value={motore.modello} onChange={(e) => setMotore({ ...motore, modello: e.target.value })} placeholder="es. Suzuki DF140A" data-testid="val-motore-modello" /></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1.5"><L>N° motori</L><Input type="number" min="1" max="4" value={motore.numero} onChange={(e) => setMotore({ ...motore, numero: e.target.value })} className="font-mono-num" data-testid="val-motore-numero" /></div>
                <div className="space-y-1.5"><L>Anno</L><Input type="number" value={motore.anno} onChange={(e) => setMotore({ ...motore, anno: e.target.value })} className="font-mono-num" data-testid="val-motore-anno" /></div>
                <div className="space-y-1.5"><L>Ore moto</L><Input type="number" value={motore.ore} onChange={(e) => setMotore({ ...motore, ore: e.target.value })} className="font-mono-num" placeholder="es. 350" data-testid="val-motore-ore" /></div>
                <div className="space-y-1.5"><L>Stato</L><StatoSelect value={motore.stato} onChange={(v) => setMotore({ ...motore, stato: v })} testId="val-motore-stato" /></div>
              </div>
              <FotoPicker foto={fotoMotore} onChange={setFotoMotore} testId="val-foto-motore" />
            </>}
          </div>
          <div className={`rounded-lg border p-4 space-y-3 ${conGommone ? "" : "opacity-60"}`}>
            <div className="flex items-center justify-between"><div className="font-semibold">Imbarcazione</div><Switch checked={conGommone} onCheckedChange={setConGommone} data-testid="val-switch-gommone" /></div>
            {conGommone && <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><L>Tipo</L>
                  <Select value={gommone.tipo} onValueChange={(v) => setGommone({ ...gommone, tipo: v })}>
                    <SelectTrigger data-testid="val-gommone-tipo"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="gommone">Gommone</SelectItem><SelectItem value="barca">Barca</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5"><L>Modello</L><Input value={gommone.modello} onChange={(e) => setGommone({ ...gommone, modello: e.target.value })} placeholder={gommone.tipo === "barca" ? "es. Saver 690 Cabin" : "es. GEB 780 Tsunami"} data-testid="val-gommone-modello" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><L>Anno</L><Input type="number" value={gommone.anno} onChange={(e) => setGommone({ ...gommone, anno: e.target.value })} className="font-mono-num" data-testid="val-gommone-anno" /></div>
                <div className="space-y-1.5"><L>Stato</L><StatoSelect value={gommone.stato} onChange={(v) => setGommone({ ...gommone, stato: v })} testId="val-gommone-stato" /></div>
              </div>
              {gommone.tipo === "gommone" && <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="flex items-center gap-2 text-sm"><Switch checked={gommone.tubolari_nuovi} onCheckedChange={(v) => setGommone({ ...gommone, tubolari_nuovi: v })} data-testid="val-gommone-tubolari" /> Tubolari rifatti / nuovi</div>
                {gommone.tubolari_nuovi && <div className="flex items-center gap-2 text-sm">da <Input type="number" min="0" value={gommone.tubolari_anni} onChange={(e) => setGommone({ ...gommone, tubolari_anni: e.target.value })} className="w-20 h-8 font-mono-num" placeholder="0" data-testid="val-gommone-tubolari-anni" /> anni</div>}
              </div>}
              <FotoPicker foto={fotoGommone} onChange={setFotoGommone} testId="val-foto-gommone" />
            </>}
          </div>
        </div>

        <Button onClick={valuta} disabled={busy} className="w-full sm:w-auto" data-testid="val-calcola">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />} {busy ? "Valuto con AI…" : "Calcola valutazione"}
        </Button>
      </Card>

      <div className="space-y-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Valutazioni recenti ({lista.length})</div>
        {lista.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center" data-testid="val-vuoto">Nessuna valutazione ancora.</Card>}
        {lista.map((v) => (
          <ValutazioneCard key={v.id} v={v} actions={
            <>
              {v.stato === "in_corso" && <span className="text-xs text-muted-foreground inline-flex items-center gap-1" data-testid={`val-stato-${v.id}`}><Loader2 className="w-3.5 h-3.5 animate-spin" /> Valutazione in corso…</span>}
              {v.stato === "errore" && <><span className="text-xs text-destructive" data-testid={`val-errore-${v.id}`}>{v.errore || "Errore AI"}</span><Button variant="outline" size="sm" onClick={() => riprova(v)} data-testid={`val-riprova-${v.id}`}>Riprova</Button></>}
              {v.risultato && <>
                <Button variant="outline" size="sm" onClick={() => apriPdf(v)} data-testid={`val-pdf-${v.id}`}><FileText className="w-4 h-4 mr-1.5" /> PDF</Button>
                <WhatsAppPdfButton url={`/valutazioni/${v.id}/pdf`} filename={nomeFile(v)} testo={`Valutazione usato${v.cliente ? ` per ${v.cliente}` : ""} – Cantiere GEB nautica`} testId={`val-wa-${v.id}`} client={mobile ? client : undefined} uploadPath={mobile ? "/condividi/pdf" : undefined} />
              </>}
              {!mobile && <Button variant="ghost" size="icon" className="text-destructive" onClick={() => elimina(v)} data-testid={`val-del-${v.id}`}><Trash2 className="w-4 h-4" /></Button>}
            </>
          } />
        ))}
      </div>
      {!mobile && <PdfPreviewOverlay open={previewOpen} onClose={() => setPreviewOpen(false)} url={previewUrl} filename={previewName} />}
    </div>
  );
}
