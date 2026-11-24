import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Loader2 } from "lucide-react";

// Chiave Gemini inserita dall'app (es. sul PC, dove il .env non ha chiavi AI)
export default function AiChiaveGemini({ cfg, onSaved }) {
  const [k, setK] = useState("");
  const [busy, setBusy] = useState(false);
  const salva = async (val) => {
    setBusy(true);
    try { const r = await api.put("/ai/chiave", { gemini_api_key: val }); onSaved(r.data); setK(""); toast.success(val ? "Chiave Gemini salvata e verificata" : "Chiave rimossa"); }
    catch (e) { toast.error(e.response?.data?.detail || "Salvataggio non riuscito"); } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 max-w-3xl rounded-md border p-3 space-y-2" data-testid="ai-chiave-gemini">
      <Label htmlFor="ai-chiave-input" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5" /> Chiave Gemini di questa installazione</Label>
      <p className="text-[11px] text-muted-foreground">
        {cfg.gemini_key_da_app ? "Chiave inserita dall'app: attiva. Puoi sostituirla o rimuoverla." : cfg.gemini_key_presente ? "Chiave gi\u00e0 impostata nel file di configurazione del server." : "Ottienila gratis su aistudio.google.com \u2192 Get API key, poi incollala qui. Resta solo su questa installazione e non viene mai mostrata."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Input id="ai-chiave-input" type="password" autoComplete="off" value={k} onChange={(e) => setK(e.target.value)} placeholder="Incolla la chiave (inizia con AIza…)" className="flex-1 min-w-[200px] font-mono text-xs" data-testid="ai-chiave-input" />
        <Button size="sm" onClick={() => salva(k)} disabled={busy || !k.trim()} data-testid="ai-chiave-salva">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Salva chiave</Button>
        {cfg.gemini_key_da_app && <Button size="sm" variant="outline" onClick={() => salva("")} disabled={busy} data-testid="ai-chiave-rimuovi">Rimuovi</Button>}
      </div>
    </div>
  );
}
