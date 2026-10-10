import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { confirmDialog } from "@/components/ConfirmDialog";
import { openBlob } from "@/pages/ddt/common";
import { toast } from "sonner";
import { Anchor, Settings, FileText, Send, Save } from "lucide-react";
import ComunicazioneForm, { PORTI, nuovaComunicazione } from "@/pages/capitaneria/ComunicazioneForm";
import ArchivioPorto from "@/pages/capitaneria/ArchivioPorto";
import ImpostazioniCapitaneria from "@/pages/capitaneria/ImpostazioniCapitaneria";

export default function Capitaneria() {
  const [settings, setSettings] = useState(null);
  const [lista, setLista] = useState([]);
  const [tab, setTab] = useState("marina_di_campo");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [preview, setPreview] = useState({ open: false, name: "comunicazione.pdf" });
  const [previewUrl, setPreviewUrl] = useState(null);

  const load = () => api.get("/capitaneria/comunicazioni").then((r) => setLista(r.data || []));
  useEffect(() => { api.get("/capitaneria/impostazioni").then((r) => setSettings(r.data)); load(); }, []);

  const set = (k, v) => setEditing((p) => ({ ...p, [k]: v }));
  const nuova = (porto) => setEditing(nuovaComunicazione(porto, settings));
  const duplica = (c) => { const { id, created_at, updated_at, inviata_at, inviata_a, ...rest } = c; setEditing({ ...rest, firma_data: new Date().toISOString().slice(0, 10) }); };

  const salva = async () => {
    if (!editing.alaggio && !editing.varo) { toast.error("Seleziona alaggio e/o varo"); return null; }
    setSaving(true);
    try {
      const r = editing.id ? await api.put(`/capitaneria/comunicazioni/${editing.id}`, editing) : await api.post("/capitaneria/comunicazioni", editing);
      toast.success("Comunicazione salvata"); await load(); setTab(editing.porto);
      return r.data;
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); return null; }
    finally { setSaving(false); }
  };
  const salvaEChiudi = async () => { if (await salva()) setEditing(null); };

  const anteprima = async () => {
    try {
      setPreview({ open: false, name: `comunicazione_${editing.porto}.pdf` });
      await openBlob(api, "post", "/capitaneria/pdf", editing, setPreviewUrl, (o) => setPreview((p) => ({ ...p, open: o })));
    } catch (e) { toast.error("Errore PDF"); }
  };
  const pdfSalvata = async (c) => {
    try {
      setPreview({ open: false, name: `comunicazione_${c.porto}_${c.data_operazione}.pdf` });
      await openBlob(api, "get", `/capitaneria/comunicazioni/${c.id}/pdf`, null, setPreviewUrl, (o) => setPreview((p) => ({ ...p, open: o })));
    } catch (e) { toast.error("Errore PDF"); }
  };

  const [sending, setSending] = useState(false);
  const invia = async (c) => {
    const to = settings?.porti?.[c.porto]?.email;
    if (!to) { toast.error("Imposta l'email dell'ufficio nelle impostazioni"); setSetOpen(true); return; }
    const ok = await confirmDialog(`Il PDF verrà inviato a ${to} (${PORTI[c.porto].nome}). Confermi?`, { title: "Invia comunicazione via email", okLabel: "Invia", danger: false });
    if (!ok || sending) return;
    setSending(true);
    const t = toast.loading("Invio email in corso…");
    try {
      const r = await api.post(`/capitaneria/comunicazioni/${c.id}/invia-email`, null, { timeout: 90000 });
      toast.success(`Email inviata a ${r.data?.inviata_a || to}`, { id: t });
    } catch (e) {
      const det = e.response?.data?.detail || (e.code === "ECONNABORTED" ? "tempo scaduto, verifica l'archivio" : e.message);
      toast.error(`Errore invio email: ${det}`, { id: t, duration: 8000 });
    } finally { setSending(false); load(); }
  };
  const salvaEInvia = async () => { const d = await salva(); if (d) { setEditing(null); invia(d); } };

  const elimina = async (c) => {
    const ok = await confirmDialog(`Eliminare la comunicazione del ${(c.data_operazione || "").split("-").reverse().join("/")}?`, { title: "Elimina comunicazione", okLabel: "Elimina" });
    if (!ok) return;
    try { await api.delete(`/capitaneria/comunicazioni/${c.id}`); toast.success("Eliminata"); load(); } catch { toast.error("Errore"); }
  };

  if (!settings) return <div className="p-8 text-muted-foreground">Caricamento…</div>;

  return (
    <div className="p-6 md:p-10 max-w-6xl" data-testid="capitaneria-page">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <div className="label-mini flex items-center gap-1.5 mb-2"><Anchor className="w-3.5 h-3.5" /> Autorità marittima</div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold mb-2">Comunicazione Capitaneria</h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl">Allegato 1 – comunicazione preventiva di alaggio/varo con mezzo autogrù. Compila, salva una copia per porto, stampa o invia via email all'ufficio.</p>
        </div>
        <Button variant="outline" onClick={() => setSetOpen(true)} data-testid="cap-impostazioni-btn"><Settings className="w-4 h-4 mr-2" /> Impostazioni</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          {Object.entries(PORTI).map(([k, p]) => (
            <TabsTrigger key={k} value={k} data-testid={`cap-tab-${k.replace(/_/g, "-")}`}>{p.nome} <span className="ml-2 text-xs text-muted-foreground">{lista.filter((c) => c.porto === k).length}</span></TabsTrigger>
          ))}
        </TabsList>
        {Object.entries(PORTI).map(([k, p]) => (
          <TabsContent key={k} value={k}>
            <ArchivioPorto porto={k} nome={p.nome} lista={lista.filter((c) => c.porto === k)} onNuova={nuova} onApri={setEditing} onPdf={pdfSalvata} onDuplica={duplica} onElimina={elimina} onInvia={invia} />
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" data-testid="cap-form-dialog">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Modifica comunicazione" : "Nuova comunicazione"} · {editing && PORTI[editing.porto]?.nome}</DialogTitle>
            <DialogDescription>Allegato 1 – Comunicazione preventiva di alaggio/varo con mezzo autogrù</DialogDescription>
          </DialogHeader>
          {editing && <ComunicazioneForm f={editing} set={set} />}
          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={anteprima} data-testid="cap-anteprima"><FileText className="w-4 h-4 mr-2" /> Anteprima PDF</Button>
            <Button variant="outline" onClick={salvaEChiudi} disabled={saving} data-testid="cap-salva"><Save className="w-4 h-4 mr-2" /> Salva</Button>
            <Button onClick={salvaEInvia} disabled={saving} data-testid="cap-salva-invia"><Send className="w-4 h-4 mr-2" /> Salva e invia email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImpostazioniCapitaneria open={setOpen} onClose={() => setSetOpen(false)} settings={settings} onSaved={setSettings} />
      <PdfPreviewOverlay open={preview.open} onClose={() => setPreview((p) => ({ ...p, open: false }))} url={previewUrl} filename={preview.name} />
    </div>
  );
}
