import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SoggettoFiscale, erroreSoggetto } from "@/components/SoggettoFiscale";

export const VUOTA = { nome: "", cognome: "", tipo_soggetto: "privato", ragione_sociale: "", partita_iva: "", codice_sdi: "", pec: "", codice_fiscale: "", indirizzo: "", via: "", cap: "", citta: "", provincia: "", telefono: "", cellulare: "", email: "", note: "" };

const Campo = ({ label, children }) => (<div><label className="text-xs text-muted-foreground">{label}</label>{children}</div>);

export default function AnagraficaDialog({ voce, onClose, onSaved }) {
  const [f, setF] = useState(VUOTA);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (voce) setF({ ...VUOTA, ...voce }); }, [voce]);
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const azienda = f.tipo_soggetto === "azienda";

  const salva = async () => {
    const err = erroreSoggetto(f);
    if (err) return toast.error(err);
    if (!f.cognome.trim() && !f.ragione_sociale.trim()) return toast.error("Inserisci almeno il cognome o la ragione sociale");
    setBusy(true);
    try {
      if (voce?.id) await api.put(`/anagrafica/${voce.id}`, f);
      else {
        const r = await api.post("/anagrafica", f);
        if (!r.data.creato) toast.info("Voce già presente: dati aggiornati");
      }
      toast.success("Anagrafica salvata"); onSaved?.(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore"); } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!voce} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="anagrafica-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{voce?.id ? "Modifica anagrafica" : "Nuova anagrafica"}</DialogTitle>
          <DialogDescription>Dati anagrafici e fiscali del cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <SoggettoFiscale f={f} update={upd} />
          <div className="grid grid-cols-2 gap-3">
            <Campo label={azienda ? "Cognome referente" : "Cognome *"}><Input value={f.cognome} onChange={(e) => upd("cognome", e.target.value)} data-testid="ana-cognome" /></Campo>
            <Campo label={azienda ? "Nome referente" : "Nome"}><Input value={f.nome} onChange={(e) => upd("nome", e.target.value)} data-testid="ana-nome" /></Campo>
            <Campo label="Codice fiscale"><Input value={f.codice_fiscale} onChange={(e) => upd("codice_fiscale", e.target.value.toUpperCase())} maxLength={16} className="uppercase font-mono-num" data-testid="ana-cf" /></Campo>
            <Campo label="Telefono"><Input value={f.telefono} onChange={(e) => upd("telefono", e.target.value)} data-testid="ana-telefono" /></Campo>
            <Campo label="Cellulare"><Input value={f.cellulare} onChange={(e) => upd("cellulare", e.target.value)} data-testid="ana-cellulare" /></Campo>
            <div className="col-span-2"><Campo label="Email"><Input type="email" value={f.email} onChange={(e) => upd("email", e.target.value)} data-testid="ana-email" /></Campo></div>
            <div className="col-span-2"><Campo label="Note"><Input value={f.note} onChange={(e) => upd("note", e.target.value)} data-testid="ana-note" /></Campo></div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="ana-annulla">Annulla</Button>
          <Button onClick={salva} disabled={busy} className="bg-primary hover:bg-primary/90" data-testid="ana-salva">Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
