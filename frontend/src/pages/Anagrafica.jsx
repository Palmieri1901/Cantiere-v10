import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Pencil, Trash2, BookUser, Building2, User, Download, CloudDownload } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";
import AnagraficaDialog from "@/pages/anagrafica/AnagraficaDialog";

const ORIGINE = { rimessaggio: "Rimessaggio", esterni: "Esterni", manuale: "Inserita a mano", fatture_in_cloud: "Fatture in Cloud", fatturazione: "Fatturazione" };

export default function Anagrafica() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null); // null | {} (nuovo) | voce
  const [importing, setImporting] = useState(false);
  const importa = async () => {
    const scelta = await confirmDialog("Importare in anagrafica tutti i clienti già presenti in Rimessaggio (tutti gli anni)?\nI nominativi già presenti vengono aggiornati, non duplicati.\n\nVuoi includere anche i clienti di Lavorazioni esterne?", { title: "Importa contatti", okLabel: "Sì, anche Esterni", cancelLabel: "Solo Rimessaggio", danger: false, terzo: true });
    if (scelta === null) return;
    setImporting(true);
    try {
      const r = await api.post(`/anagrafica/importa-rimessaggio?anche_esterni=${scelta === true}`);
      toast.success(`Importazione completata: ${r.data.nuovi} nuovi, ${r.data.aggiornati} aggiornati${r.data.saltati ? `, ${r.data.saltati} saltati` : ""}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore importazione"); } finally { setImporting(false); }
  };
  const importaFic = async () => {
    if (!(await confirmDialog("Importare in anagrafica tutti i clienti presenti su Fatture in Cloud?\nI nominativi già presenti (stessa P.IVA, CF o cognome+nome) vengono aggiornati, non duplicati.", { title: "Importa da Fatture in Cloud", okLabel: "Importa", danger: false }))) return;
    setImporting(true);
    try {
      const r = await api.post("/fatturazione/importa-clienti");
      toast.success(`Fatture in Cloud: ${r.data.nuovi} nuovi, ${r.data.aggiornati} aggiornati${r.data.saltati ? `, ${r.data.saltati} saltati` : ""}`);
      if (r.data.errori?.length) toast.warning(r.data.errori.join("\n"), { duration: 12000 });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore importazione"); } finally { setImporting(false); }
  };
  const load = () => api.get("/anagrafica").then((r) => setList(r.data)).catch(() => toast.error("Errore caricamento"));
  useEffect(() => { load(); }, []);

  const ql = q.trim().toLowerCase();
  const visibili = list.filter((a) => !ql || `${a.cognome} ${a.nome} ${a.ragione_sociale} ${a.partita_iva} ${a.codice_fiscale} ${a.telefono} ${a.cellulare} ${a.email} ${a.indirizzo}`.toLowerCase().includes(ql));

  const del = async (a) => {
    if (!(await confirmDialog(`Eliminare "${titolo(a)}" dall'anagrafica generale?\nI clienti in Rimessaggio o Esterni non vengono toccati.`, { okLabel: "Elimina" }))) return;
    await api.delete(`/anagrafica/${a.id}`); toast.success("Eliminata"); load();
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl" data-testid="anagrafica-page">
      <div className="label-mini flex items-center gap-1.5 mb-2"><BookUser className="w-3.5 h-3.5" /> Anagrafica</div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-semibold mb-2">Anagrafica generale</h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-2xl">Dati anagrafici e fiscali di tutti i clienti, caricati dal Rimessaggio, dalle Lavorazioni esterne o inseriti qui.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={importa} disabled={importing} data-testid="btn-importa-rimessaggio"><Download className="w-4 h-4 mr-1" /> {importing ? "Importazione…" : "Importa da Rimessaggio"}</Button>
          <Button variant="outline" onClick={importaFic} disabled={importing} data-testid="btn-importa-fic"><CloudDownload className="w-4 h-4 mr-1" /> Importa da Fatture in Cloud</Button>
          <Button onClick={() => setEdit({})} className="bg-primary hover:bg-primary/90" data-testid="btn-nuova-anagrafica"><Plus className="w-4 h-4 mr-1" /> Nuova anagrafica</Button>
        </div>
      </div>

      <div className="relative max-w-md mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome, azienda, P.IVA, telefono…" className="pl-9" data-testid="input-cerca-anagrafica" />
      </div>
      <div className="text-xs text-muted-foreground mb-3" data-testid="anagrafica-conteggio">{visibili.length} {visibili.length === 1 ? "voce" : "voci"}</div>

      <div className="space-y-2">
        {visibili.map((a) => (
          <Card key={a.id} className="p-4 flex flex-wrap items-start gap-3" data-testid={`anagrafica-row-${a.id}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${a.tipo_soggetto === "azienda" ? "bg-amber-100 text-amber-900" : "bg-primary/10 text-primary"}`}>
              {a.tipo_soggetto === "azienda" ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="font-medium">{titolo(a)}{a.tipo_soggetto === "azienda" && (a.cognome || a.nome) && <span className="text-muted-foreground font-normal text-sm"> · Rif. {a.cognome} {a.nome}</span>}</div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {a.partita_iva && <span>P.IVA {a.partita_iva}</span>}
                {a.codice_sdi && <span>SDI {a.codice_sdi}</span>}
                {a.codice_fiscale && <span>CF {a.codice_fiscale}</span>}
                {(a.telefono || a.cellulare) && <span>{[a.telefono, a.cellulare].filter(Boolean).join(" / ")}</span>}
                {a.email && <span>{a.email}</span>}
                {a.pec && <span>PEC {a.pec}</span>}
                {a.indirizzo && <span>{a.indirizzo}</span>}
              </div>
            </div>
            <Badge variant="secondary" className="text-[10px] font-normal shrink-0">{ORIGINE[a.origine] || a.origine}</Badge>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={() => setEdit(a)} data-testid={`btn-edit-anagrafica-${a.id}`}><Pencil className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => del(a)} data-testid={`btn-del-anagrafica-${a.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          </Card>
        ))}
        {!visibili.length && <Card className="p-8 text-center text-muted-foreground text-sm" data-testid="anagrafica-vuota">Nessuna voce. Aggiungi un'anagrafica o conferma l'inserimento quando crei un nuovo cliente.</Card>}
      </div>

      <AnagraficaDialog voce={edit} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  );
}

export const titolo = (a) => (a.tipo_soggetto === "azienda" && a.ragione_sociale ? a.ragione_sociale : `${a.cognome || ""} ${a.nome || ""}`.trim());
