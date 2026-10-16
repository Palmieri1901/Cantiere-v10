import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Receipt, ExternalLink } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

// Tasto "Invia a fatturazione": crea cliente + bozza fattura su Fatture in Cloud
export function InviaFatturazioneButton({ tipo, id, anno, nome, size = "sm", variant = "outline", className = "", testId }) {
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState(null);
  const invia = async (e) => {
    e?.stopPropagation?.();
    if (!(await confirmDialog(`Creare su Fatture in Cloud una bozza di fattura per "${nome}"${anno ? ` (anno ${anno})` : ""}?\nIl cliente verrà creato o aggiornato; la fattura resterà in bozza da controllare.`, { title: "Invia a fatturazione", okLabel: "Invia", danger: false }))) return;
    setBusy(true);
    try {
      const r = await api.post("/fatturazione/invia", { tipo, id, anno: anno || null });
      setEsito(r.data);
      toast.success(`Bozza creata su Fatture in Cloud: ${r.data.righe} righe · ${r.data.totale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`);
    } catch (err) { toast.error(err.response?.data?.detail || "Invio non riuscito"); } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <Button size={size} variant={variant} onClick={invia} disabled={busy} className={className} data-testid={testId || `btn-fattura-${tipo}-${id}`}><Receipt className="w-3.5 h-3.5 mr-1" /> {busy ? "Invio…" : "Invia a fatturazione"}</Button>
      {esito?.url && <a href={esito.url} target="_blank" rel="noreferrer" className="text-xs underline inline-flex items-center gap-0.5" data-testid="link-fic">apri <ExternalLink className="w-3 h-3" /></a>}
    </span>
  );
}
