import { useEffect, useState } from "react";
import { mobileApi } from "@/lib/mobileStore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Anchor, Plus, FileText, Send, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import ComunicazioneForm, { PORTI, nuovaComunicazione } from "@/pages/capitaneria/ComunicazioneForm";

const dataIt = (d) => (d || "").split("-").reverse().join("/");

// Comunicazione preventiva alaggio/varo alla Capitaneria, dall'app dipendenti
export default function CapitaneriaMobile() {
  const [settings, setSettings] = useState(null);
  const [lista, setLista] = useState([]);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const api = mobileApi();
  const load = () => api.get("/capitaneria/comunicazioni").then((r) => setLista(r.data || [])).catch(() => {});
  useEffect(() => { api.get("/capitaneria/impostazioni").then((r) => setSettings(r.data)).catch(() => toast.error("Impossibile caricare le impostazioni: sei online?")); load(); }, []);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const salva = async () => {
    if (!f.alaggio && !f.varo) { toast.error("Seleziona alaggio e/o varo"); return null; }
    setBusy(true);
    try { const r = await api.post("/capitaneria/comunicazioni", f); await load(); return r.data; }
    catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); return null; }
    finally { setBusy(false); }
  };
  const pdf = async (c) => {
    try {
      const r = await api.get(`/capitaneria/comunicazioni/${c.id}/pdf`, { responseType: "blob" });
      window.open(URL.createObjectURL(new Blob([r.data], { type: "application/pdf" })), "_blank");
    } catch { toast.error("Errore PDF"); }
  };
  const invia = async (c) => {
    const porto = PORTI[c.porto]?.nome || c.porto;
    if (!settings?.porti?.[c.porto]?.email_impostata) { toast.error(`Email dell'ufficio di ${porto} non impostata: avvisa il cantiere`); return; }
    if (!(await confirmDialog(`Inviare via email la comunicazione del ${dataIt(c.data_operazione)} all'ufficio di ${porto}?`, { title: "Invia alla Capitaneria", okLabel: "Invia", danger: false }))) return;
    setBusy(true);
    const t = toast.loading("Invio email in corso…");
    try { const r = await api.post(`/capitaneria/comunicazioni/${c.id}/invia-email`, null, { timeout: 90000 }); toast.success(`Inviata a ${r.data?.inviata_a}`, { id: t }); }
    catch (e) { toast.error(`Errore invio: ${e.response?.data?.detail || e.message}`, { id: t, duration: 8000 }); }
    finally { setBusy(false); load(); }
  };
  const salvaEInvia = async () => { const d = await salva(); if (d) { setF(null); toast.success("Comunicazione salvata"); invia(d); } };
  const salvaSolo = async () => { const d = await salva(); if (d) { setF(null); toast.success("Salvata: il cantiere può inviarla dal gestionale"); } };

  if (f) {
    return (
      <div className="space-y-4" data-testid="cap-mobile-form">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => setF(null)} data-testid="cap-mobile-indietro"><ArrowLeft className="w-5 h-5" /></Button>
          <h2 className="font-display text-xl font-semibold">Nuova comunicazione</h2>
        </div>
        <ComunicazioneForm f={f} set={set} />
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="outline" onClick={salvaSolo} disabled={busy} data-testid="cap-mobile-salva">Salva</Button>
          <Button onClick={salvaEInvia} disabled={busy} data-testid="cap-mobile-salva-invia"><Send className="w-4 h-4 mr-1.5" /> Salva e invia</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="cap-mobile">
      <div>
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2"><Anchor className="w-6 h-6 text-primary" /> Capitaneria</h2>
        <p className="text-xs text-muted-foreground">Comunicazione preventiva di alaggio/varo con autogrù</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(PORTI).map(([k, p]) => (
          <Button key={k} className="h-14 flex-col gap-0.5" disabled={!settings} onClick={() => setF(nuovaComunicazione(k, settings))} data-testid={`cap-mobile-nuova-${k}`}>
            <span className="flex items-center gap-1 text-xs opacity-80"><Plus className="w-3.5 h-3.5" /> Nuova</span><span className="font-semibold">{p.nome}</span>
          </Button>
        ))}
      </div>
      <div className="label-mini pt-2">Ultime comunicazioni</div>
      {lista.length === 0 && <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md">Nessuna comunicazione</div>}
      <div className="space-y-2">
        {lista.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-card p-3" data-testid={`cap-mobile-item-${c.id}`}>
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{dataIt(c.data_operazione)}{c.ora_operazione ? ` · ore ${c.ora_operazione}` : ""} · {[c.alaggio && "Alaggio", c.varo && "Varo"].filter(Boolean).join(" + ")}</div>
                <div className="text-xs text-muted-foreground truncate">{PORTI[c.porto]?.nome} · {c.unita_nome || "unità senza nome"}{c.creata_da ? ` · ${c.creata_da}` : ""}</div>
                <div className={`text-[11px] mt-1 inline-flex items-center gap-1 ${c.inviata_at ? "text-emerald-700" : "text-amber-700"}`}>
                  {c.inviata_at ? <><CheckCircle2 className="w-3 h-3" /> Inviata il {new Date(c.inviata_at).toLocaleDateString("it-IT")}</> : <><Clock className="w-3 h-3" /> Da inviare</>}
                </div>
              </div>
              <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => pdf(c)} title="PDF" data-testid={`cap-mobile-pdf-${c.id}`}><FileText className="w-4 h-4" /></Button>
              {!c.inviata_at && <Button size="icon" variant="ghost" className="h-9 w-9 text-primary" onClick={() => invia(c)} disabled={busy} title="Invia email" data-testid={`cap-mobile-invia-${c.id}`}><Send className="w-4 h-4" /></Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
