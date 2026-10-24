import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Receipt, ExternalLink, CheckCircle2 } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";
import CompletaDatiFiscaliDialog from "@/components/CompletaDatiFiscaliDialog";

// Tasto "Invia a fatturazione" + stato proforma emessa su Fatture in Cloud (la fattura definitiva si crea poi da Fatture in Cloud)
export function InviaFatturazioneButton({ tipo, id, anno, nome, size = "sm", variant = "outline", className = "", testId }) {
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState(null);
  const [verifica, setVerifica] = useState(null);
  useEffect(() => {
    let on = true;
    api.get("/fatturazione/stato-documento", { params: { tipo, rif_id: id, anno: anno || undefined } })
      .then((r) => { if (on) setEsito(r.data.emessa ? r.data : null); }).catch(() => {});
    return () => { on = false; };
  }, [tipo, id, anno]);
  const invia = async (e) => {
    e?.stopPropagation?.();
    let v;
    try { v = (await api.post("/fatturazione/verifica", { tipo, id, anno: anno || null })).data; }
    catch (err) { toast.error(err.response?.data?.detail || "Verifica dati non riuscita"); return; }
    if (!v.ok || !v.in_anagrafica) { setVerifica(v); return; }
    await conferma();
  };
  const conferma = async () => {
    const gia = esito ? "\nATTENZIONE: una proforma risulta già emessa; verrà creata una nuova proforma." : "";
    if (!(await confirmDialog(`Creare su Fatture in Cloud una fattura proforma per "${nome}"${anno ? ` (anno ${anno})` : ""}?\nIl cliente verrà creato o aggiornato; la fattura resterà in bozza da controllare.${gia}`, { title: "Invia a fatturazione", okLabel: "Invia", danger: false }))) return;
    setBusy(true);
    try {
      const r = await api.post("/fatturazione/invia", { tipo, id, anno: anno || null });
      setEsito(r.data);
      toast.success(`Proforma creata su Fatture in Cloud: ${r.data.righe} righe · ${r.data.totale.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}`);
    } catch (err) { toast.error(err.response?.data?.detail || "Invio non riuscito"); } finally { setBusy(false); }
  };
  const data = esito?.ts ? new Date(esito.ts).toLocaleDateString("it-IT") : "";
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} data-testid={`fattura-wrap-${tipo}-${id}`}>
      {esito && (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5" data-testid={`stato-fattura-${tipo}-${id}`}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Proforma emessa{data ? ` · ${data}` : ""}
          {esito.url && <a href={esito.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline inline-flex items-center gap-0.5 ml-1" data-testid={`link-fic-${tipo}-${id}`}>apri <ExternalLink className="w-3 h-3" /></a>}
        </span>
      )}
      <Button size={size} variant={variant} onClick={invia} disabled={busy} className={className} data-testid={testId || `btn-fattura-${tipo}-${id}`}><Receipt className="w-3.5 h-3.5 mr-1" /> {busy ? "Invio…" : esito ? "Reinvia a fatturazione" : "Invia a fatturazione"}</Button>
      {verifica && <CompletaDatiFiscaliDialog open onOpenChange={(o) => { if (!o) setVerifica(null); }} tipo={tipo} id={id} anno={anno || null} verifica={verifica} onCompletato={() => { setVerifica(null); conferma(); }} />}
    </span>
  );
}
