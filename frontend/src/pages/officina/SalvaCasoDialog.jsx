import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const VUOTO = { motore: "", codici: "", sintomo: "", diagnosi: "", soluzione: "", note: "" };
const Campo = ({ label, children }) => (<div><label className="text-xs text-muted-foreground">{label}</label>{children}</div>);

export default function SalvaCasoDialog({ dati, onClose, client, basePath = "/officina", autore = "", onSaved }) {
  const [f, setF] = useState(VUOTO);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (dati) setF({ ...VUOTO, ...dati }); }, [dati]);
  const upd = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const salva = async () => {
    if (!f.sintomo.trim() || !f.soluzione.trim()) return toast.error("Indica sintomo e soluzione");
    setBusy(true);
    try { await client[dati?.id ? "put" : "post"](`${basePath}/casi${dati?.id ? `/${dati.id}` : ""}`, { ...f, autore }); toast.success("Caso salvato nella memoria dell'officina"); onSaved?.(); onClose(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={!!dati} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="salva-caso-dialog">
        <DialogHeader><DialogTitle className="font-display text-2xl">{dati?.id ? "Modifica caso" : "Salva come caso risolto"}</DialogTitle><DialogDescription>Diventa esperienza dell'officina: l'assistente lo userà nelle prossime diagnosi.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Motore / mezzo"><Input value={f.motore} onChange={(e) => upd("motore", e.target.value)} placeholder="Es. Suzuki DF140 2019" data-testid="caso-motore" /></Campo>
            <Campo label="Codici errore"><Input value={f.codici} onChange={(e) => upd("codici", e.target.value)} placeholder="Es. C-04" className="font-mono-num" data-testid="caso-codici" /></Campo>
          </div>
          <Campo label="Sintomo *"><Textarea value={f.sintomo} onChange={(e) => upd("sintomo", e.target.value)} rows={2} data-testid="caso-sintomo" /></Campo>
          <Campo label="Diagnosi"><Textarea value={f.diagnosi} onChange={(e) => upd("diagnosi", e.target.value)} rows={3} data-testid="caso-diagnosi" /></Campo>
          <Campo label="Soluzione adottata *"><Textarea value={f.soluzione} onChange={(e) => upd("soluzione", e.target.value)} rows={2} placeholder="Cosa ha risolto il problema" data-testid="caso-soluzione" /></Campo>
          <Campo label="Note"><Input value={f.note} onChange={(e) => upd("note", e.target.value)} data-testid="caso-note" /></Campo>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose} data-testid="caso-annulla">Annulla</Button><Button onClick={salva} disabled={busy} className="bg-primary hover:bg-primary/90" data-testid="caso-salva">Salva</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
