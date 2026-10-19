import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Building2, User, AlertTriangle, BookUser } from "lucide-react";

const Campo = ({ label, obbl, children }) => <div className="space-y-1"><Label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}{obbl && <span className="text-destructive"> *</span>}</Label>{children}</div>;

// Completamento dati fiscali obbligatori prima dell'invio a Fatture in Cloud + registrazione in Anagrafica generale
export default function CompletaDatiFiscaliDialog({ open, onOpenChange, tipo, id, anno, verifica, onCompletato }) {
  const [f, setF] = useState(verifica.soggetto);
  const [registra, setRegistra] = useState(true);
  const [saving, setSaving] = useState(false);
  const az = f.tipo_soggetto === "azienda";
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const manca = az ? [["ragione_sociale"], ["indirizzo"], ["partita_iva"], ["codice_sdi"]] : [["cognome"], ["nome"], ["indirizzo"], ["codice_fiscale"]];
  const incompleti = manca.filter(([k]) => !(f[k] || "").trim());
  const salva = async () => {
    setSaving(true);
    try {
      const r = await api.post("/fatturazione/completa-dati", { tipo, id, anno, dati: f, registra_anagrafica: registra });
      toast.success(r.data.anagrafica ? (r.data.anagrafica.creato ? "Dati salvati e registrati in Anagrafica" : "Dati salvati e aggiornati in Anagrafica") : "Dati salvati");
      onOpenChange(false); onCompletato();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[92vh] overflow-y-auto" data-testid="completa-dati-dialog">
        <DialogHeader>
          <DialogTitle>Dati per la fatturazione</DialogTitle>
          <DialogDescription>
            {verifica.mancanti?.length ? <span className="inline-flex items-start gap-1.5 text-amber-800"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Mancano: {verifica.mancanti.join(", ")}. Completa i dati per inviare il documento.</span>
              : "Controlla i dati del cliente prima dell'invio."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {[["privato", User, "Privato"], ["azienda", Building2, "Azienda"]].map(([v, Icon, l]) => (
              <button key={v} type="button" onClick={() => upd("tipo_soggetto", v)} data-testid={`cd-soggetto-${v}`} className={`flex-1 h-10 rounded-md border text-sm font-medium inline-flex items-center justify-center gap-1.5 ${f.tipo_soggetto === v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input"}`}><Icon className="w-4 h-4" /> {l}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {az && <div className="sm:col-span-2"><Campo label="Ragione sociale" obbl><Input value={f.ragione_sociale} onChange={(e) => upd("ragione_sociale", e.target.value)} data-testid="cd-ragione" /></Campo></div>}
            <Campo label={az ? "Cognome referente" : "Cognome"} obbl={!az}><Input value={f.cognome} onChange={(e) => upd("cognome", e.target.value)} data-testid="cd-cognome" /></Campo>
            <Campo label={az ? "Nome referente" : "Nome"} obbl={!az}><Input value={f.nome} onChange={(e) => upd("nome", e.target.value)} data-testid="cd-nome" /></Campo>
            <div className="sm:col-span-2"><Campo label="Indirizzo completo (via, CAP, città, provincia)" obbl><Input value={f.indirizzo} onChange={(e) => upd("indirizzo", e.target.value)} placeholder="Via Roma 1, 57037 Portoferraio (LI)" data-testid="cd-indirizzo" /></Campo></div>
            <Campo label="Codice fiscale" obbl={!az}><Input value={f.codice_fiscale} onChange={(e) => upd("codice_fiscale", e.target.value.toUpperCase())} maxLength={16} className="uppercase font-mono-num" data-testid="cd-cf" /></Campo>
            {az && <Campo label="Partita IVA" obbl><Input value={f.partita_iva} onChange={(e) => upd("partita_iva", e.target.value.replace(/\D/g, ""))} maxLength={11} className="font-mono-num" data-testid="cd-piva" /></Campo>}
            {az && <Campo label="Codice SDI" obbl><Input value={f.codice_sdi} onChange={(e) => upd("codice_sdi", e.target.value.toUpperCase())} maxLength={7} className="uppercase font-mono-num" data-testid="cd-sdi" /></Campo>}
            {az && <Campo label="PEC"><Input value={f.pec} onChange={(e) => upd("pec", e.target.value)} data-testid="cd-pec" /></Campo>}
            <Campo label="Email"><Input value={f.email} onChange={(e) => upd("email", e.target.value)} data-testid="cd-email" /></Campo>
            <Campo label="Telefono"><Input value={f.telefono || f.cellulare} onChange={(e) => upd("telefono", e.target.value)} data-testid="cd-telefono" /></Campo>
          </div>
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer" data-testid="cd-registra-label">
            <Checkbox checked={registra} onCheckedChange={(v) => setRegistra(!!v)} className="mt-0.5" data-testid="cd-registra" />
            <span><span className="font-medium inline-flex items-center gap-1"><BookUser className="w-4 h-4 text-primary" /> {verifica.in_anagrafica ? "Aggiorna la voce in Anagrafica generale" : "Registra in Anagrafica generale"}</span><br /><span className="text-xs text-muted-foreground">{verifica.in_anagrafica ? "Il contatto esiste già: i dati completati verranno aggiornati." : "Il contatto non è ancora in anagrafica: verrà creato con questi dati."}</span></span>
          </label>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={salva} disabled={saving || incompleti.length > 0} data-testid="cd-salva">{saving ? "Salvo…" : incompleti.length ? `Mancano ${incompleti.length} campi` : "Salva e continua"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
