import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import AiChiaveGemini from "./AiChiaveGemini";

export default function AiModelloCard() {
  const [cfg, setCfg] = useState(null);
  const [modello, setModello] = useState("");
  const [preferisci, setPreferisci] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testRes, setTestRes] = useState(null);

  const load = () => api.get("/ai/config").then((r) => { setCfg(r.data); setModello(r.data.modello_gemini || ""); setPreferisci(!!r.data.preferisci_emergent); }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!cfg) return null;

  const salva = async () => {
    setBusy(true);
    try { const r = await api.put("/ai/config", { modello_gemini: modello, preferisci_emergent: preferisci }); setCfg(r.data); toast.success("Modello AI aggiornato"); }
    catch (e) { toast.error(e.response?.data?.detail || "Salvataggio non riuscito"); } finally { setBusy(false); }
  };
  const prova = async () => {
    setBusy(true); setTestRes(null);
    try { const r = await api.post("/ai/test", null, { timeout: 120000 }); setTestRes(r.data); load(); }
    catch (e) { setTestRes({ ok: false, errore: e.response?.data?.detail || "Test non riuscito" }); } finally { setBusy(false); }
  };
  const nessunaChiave = !cfg.gemini_key_presente && !cfg.emergent_key_presente;

  return (
    <Card className="p-6 mt-6" data-testid="ai-modello-card">
      <div className="flex items-center gap-1.5 label-mini mb-2"><Sparkles className="w-3.5 h-3.5" /> Intelligenza artificiale</div>
      <h3 className="font-display text-xl font-semibold">Modello AI attivo</h3>
      <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm" data-testid="ai-stato">
        {nessunaChiave ? <span className="text-destructive">Nessuna chiave AI configurata su questa installazione: inserisci la chiave Gemini qui sotto.</span> : (
          <>
            <div>In uso: <b data-testid="ai-modello-attivo">{cfg.modello_attivo}</b> <span className="text-muted-foreground">({cfg.provider_attivo === "emergent" ? "chiave Emergent" : "chiave Gemini diretta"})</span></div>
            <div className="text-xs text-muted-foreground mt-1">Chiavi presenti: Gemini {cfg.gemini_key_presente ? "sì" : "no"} · Emergent {cfg.emergent_key_presente ? "sì" : "no"}.{cfg.stato?.ultimo_modello ? ` Ultima chiamata: ${cfg.stato.ultimo_modello} (${cfg.stato.ultimo_provider}) il ${new Date(cfg.stato.ultimo_at).toLocaleString("it-IT")}.` : ""}</div>
            {cfg.stato?.ultimo_errore && <div className="text-xs text-destructive mt-1" data-testid="ai-ultimo-errore">Ultimo errore: {cfg.stato.ultimo_errore}</div>}
          </>
        )}
      </div>
      {!cfg.emergent_key_presente && <AiChiaveGemini cfg={cfg} onSaved={(d) => { setCfg(d); setModello(d.modello_gemini || ""); }} />}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 max-w-3xl">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modello Gemini (chiave diretta)</Label>
          <select value={modello} onChange={(e) => setModello(e.target.value)} className="mt-1.5 w-full h-10 rounded-md border border-input bg-background px-3 text-sm" disabled={!cfg.gemini_key_presente} data-testid="select-ai-modello">
            {!cfg.modelli_gemini.includes(modello) && modello && <option value={modello}>{modello}</option>}
            {cfg.modelli_gemini.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground mt-1">Se il modello scelto non risponde, il programma prova da solo gli altri e poi la chiave Emergent.</p>
        </div>
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priorità</Label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 accent-[hsl(var(--primary))]" checked={preferisci} onChange={(e) => setPreferisci(e.target.checked)} disabled={!cfg.emergent_key_presente} data-testid="chk-ai-preferisci-emergent" />
            <span>Usa prima la chiave Emergent ({cfg.modello_emergent}) e la chiave Gemini solo come riserva</span>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button onClick={salva} disabled={busy || nessunaChiave} data-testid="btn-ai-salva">Salva</Button>
        <Button variant="outline" onClick={prova} disabled={busy || nessunaChiave} data-testid="btn-ai-test">{busy ? "Attendi…" : "Prova il modello"}</Button>
        {testRes && (
          <span className={`flex items-center gap-1 text-sm ${testRes.ok ? "text-emerald-700" : "text-destructive"}`} data-testid="ai-test-risultato">
            {testRes.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {testRes.ok ? `Risponde: ${testRes.modello} (${testRes.provider})` : testRes.errore || "Risposta inattesa"}
          </span>
        )}
      </div>
    </Card>
  );
}
