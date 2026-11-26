import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnagraficaPicker } from "@/components/AnagraficaPicker";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { openBlob } from "@/pages/ddt/common";
import { FileSignature, Loader2, RotateCcw, Save } from "lucide-react";

const oggi = () => new Date().toLocaleDateString("it-IT");
const VUOTO = { cliente: "", codice_fiscale: "", indirizzo: "", telefono: "", imbarcazione: "", motore: "", matricola: "", hp_da: "", hp_a: "", intervento: "", luogo: "", data: "" };
const CAMPI = [["cliente", "Cliente (nome e cognome)"], ["codice_fiscale", "Codice fiscale"], ["indirizzo", "Indirizzo"], ["telefono", "Telefono"],
  ["imbarcazione", "Imbarcazione"], ["motore", "Motore (modello)"], ["matricola", "Matricola motore"], ["hp_da", "HP originali"], ["hp_a", "HP dopo la modifica"],
  ["intervento", "Descrizione intervento"], ["luogo", "Luogo"], ["data", "Data"]];

const TIPI = {
  potenziamento: { label: "Liberatoria potenziamento", titolo: "Liberatoria potenziamento motore", file: "Liberatoria_potenziamento",
    desc: "Compila i dati, controlla il testo e genera il PDF da far firmare al cliente. I campi vuoti restano da compilare a mano.", campi: null },
  non_conformita: { label: "Segnalazione non conformità", titolo: "Segnalazione di non conformità del motore", file: "Segnalazione_non_conformita",
    desc: "Lettera di sola segnalazione al cliente: motore trovato potenziato rispetto all'omologazione originale.",
    campi: ["cliente", "indirizzo", "telefono", "imbarcazione", "motore", "matricola", "luogo", "data"] },
};

// Documenti per il cliente sul potenziamento di un fuoribordo: liberatoria da firmare o segnalazione di non conformità
export default function LiberatoriaButton({ modelli = [], tipo = "potenziamento" }) {
  const cfg = TIPI[tipo];
  const campi = CAMPI.filter(([k]) => !cfg.campi || cfg.campi.includes(k));
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(VUOTO);
  const [testo, setTesto] = useState("");
  const [predef, setPredef] = useState([]);
  const [busy, setBusy] = useState("");
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const apri = async () => {
    setF({ ...VUOTO, data: oggi() }); setOpen(true);
    try { const r = await api.get("/suzuki/liberatoria/testo", { params: { tipo } }); setTesto(r.data.paragrafi.join("\n\n")); setPredef(r.data.predefinito); } catch { toast.error("Testo non caricato"); }
  };
  const paragrafi = () => testo.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const daAnagrafica = (a) => setF((x) => ({ ...x, cliente: `${a.nome} ${a.cognome}`.trim() || a.ragione_sociale, codice_fiscale: a.codice_fiscale,
    indirizzo: [a.via || a.indirizzo, [a.cap, a.citta, a.provincia && `(${a.provincia})`].filter(Boolean).join(" ")].filter(Boolean).join(", "), telefono: a.cellulare || a.telefono }));
  const salvaTesto = async () => { setBusy("save"); try { await api.put("/suzuki/liberatoria/testo", { paragrafi: paragrafi() }, { params: { tipo } }); toast.success("Testo salvato come predefinito"); } catch { toast.error("Salvataggio non riuscito"); } finally { setBusy(""); } };
  const genera = async () => {
    setBusy("pdf");
    try { await openBlob(api, "post", "/suzuki/liberatoria/pdf", { ...f, tipo, paragrafi: paragrafi() }, setPdfUrl, setPdfOpen); } catch { toast.error("PDF non generato"); } finally { setBusy(""); }
  };
  return (
    <>
      <Button variant="outline" onClick={apri} data-testid={tipo === "potenziamento" ? "btn-liberatoria" : "btn-segnalazione-nc"}><FileSignature className="w-4 h-4 mr-2" /> {cfg.label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[92vh] overflow-y-auto" data-testid="liberatoria-dialog">
          <DialogHeader>
            <DialogTitle>{cfg.titolo}</DialogTitle>
            <DialogDescription>{cfg.desc}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end"><AnagraficaPicker onPick={daAnagrafica} testId="liberatoria-da-anagrafica" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {campi.map(([k, l]) => (
              <div key={k} className={k === "intervento" || k === "indirizzo" ? "sm:col-span-2 space-y-1" : "space-y-1"}>
                <Label htmlFor={`lib-${k}`} className="text-xs">{l}</Label>
                <Input id={`lib-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} list={k === "motore" ? "lib-modelli" : undefined}
                  placeholder={k === "intervento" ? "es. sostituzione centralina e kit potenziamento" : ""} data-testid={`liberatoria-${k}`} />
              </div>
            ))}
            <datalist id="lib-modelli">{modelli.map((m) => <option key={m.id} value={`Suzuki ${m.modello}`} />)}</datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lib-testo" className="text-xs">Testo (un paragrafo per blocco; {"{cliente} {motore} {matricola} {imbarcazione} {hp_da} {hp_a} {intervento} {cantiere}"} vengono sostituiti)</Label>
            <Textarea id="lib-testo" value={testo} onChange={(e) => setTesto(e.target.value)} rows={10} className="text-sm" data-testid="liberatoria-testo" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={salvaTesto} disabled={!!busy} data-testid="liberatoria-salva-testo"><Save className="w-3.5 h-3.5 mr-1" /> Salva come testo predefinito</Button>
              <Button size="sm" variant="ghost" onClick={() => setTesto(predef.join("\n\n"))} data-testid="liberatoria-ripristina-testo"><RotateCcw className="w-3.5 h-3.5 mr-1" /> Testo originale</Button>
            </div>
          </div>
          <Button onClick={genera} disabled={!!busy} className="w-full sm:w-auto" data-testid="liberatoria-genera">
            {busy === "pdf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSignature className="w-4 h-4 mr-2" />} Genera PDF
          </Button>
        </DialogContent>
      </Dialog>
      <PdfPreviewOverlay open={pdfOpen} onClose={() => setPdfOpen(false)} url={pdfUrl} filename={`${cfg.file}_${(f.cliente || "cliente").replace(/\s+/g, "_")}.pdf`} />
    </>
  );
}
