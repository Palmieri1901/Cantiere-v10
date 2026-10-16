import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Receipt, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

export default function FatturazioneCard() {
  const [cfg, setCfg] = useState(null);
  const [token, setToken] = useState("");
  const [comps, setComps] = useState([]);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/fatturazione/config").then((r) => setCfg(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => { if (cfg?.configurato) api.get("/fatturazione/companies").then((r) => setComps(r.data)).catch(() => {}); }, [cfg?.configurato]);

  const salvaToken = async () => {
    if (!token.trim()) return;
    setBusy(true);
    try { await api.put("/fatturazione/config", { token }); setToken(""); toast.success("Token verificato e salvato"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Token non valido"); } finally { setBusy(false); }
  };
  const scegliAzienda = async (id) => {
    try { await api.put("/fatturazione/config", { company_id: Number(id) }); toast.success("Azienda collegata"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
  };
  const scollega = async () => {
    if (!(await confirmDialog("Rimuovere il collegamento a Fatture in Cloud? Il token verrà cancellato.", { okLabel: "Scollega" }))) return;
    await api.delete("/fatturazione/config"); load();
  };
  if (!cfg) return null;
  return (
    <Card className="p-5 space-y-3" data-testid="fatturazione-card">
      <div className="flex items-center gap-2 font-medium"><Receipt className="w-4 h-4 text-primary" /> Fatturazione · Fatture in Cloud</div>
      <p className="text-sm text-muted-foreground">Con il tasto <b>"Invia a fatturazione"</b> su conti e preventivi, il cliente viene creato/aggiornato su Fatture in Cloud e il documento diventa una <b>bozza di fattura</b> con tutte le righe, da controllare ed emettere lì.</p>
      <div className="text-sm flex items-center gap-2" data-testid="fatturazione-stato">
        {cfg.configurato ? <><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Collegato ({cfg.token_mascherato}{cfg.utente ? ` · ${cfg.utente}` : ""})</> : <><AlertCircle className="w-4 h-4 text-amber-600" /> Non collegato: inserisci il token</>}
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1"><KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={cfg.configurato ? "Nuovo token (per sostituire quello attuale)" : "Incolla il token di accesso manuale"} className="pl-9 font-mono-num" data-testid="input-fic-token" /></div>
        <Button onClick={salvaToken} disabled={busy || !token.trim()} data-testid="btn-salva-fic-token">{busy ? "Verifica…" : "Verifica e salva"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">Il token si crea su Fatture in Cloud → Impostazioni → <i>Applicazioni e integrazioni</i> → <i>Autenticazione manuale</i>, con permessi su Clienti e Fatture. Non viene mai mostrato né inviato al browser.</p>
      {cfg.configurato && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="text-xs text-muted-foreground">Azienda su Fatture in Cloud</label>
            <select value={cfg.company_id || ""} onChange={(e) => scegliAzienda(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" data-testid="select-fic-company">
              <option value="">— scegli —</option>
              {comps.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
            </select>
          </div>
          <div className="text-sm self-end" data-testid="fatturazione-iva">
            {cfg.company_id ? (cfg.vat_id ? <span className="text-emerald-700">IVA 22% rilevata (id {cfg.vat_id}) · pronto</span> : <span className="text-amber-700">Aliquota 22% non trovata nell'azienda</span>) : <span className="text-muted-foreground">Scegli l'azienda per completare</span>}
          </div>
        </div>
      )}
      {cfg.configurato && <Button variant="ghost" size="sm" className="text-destructive text-xs" onClick={scollega} data-testid="btn-scollega-fic">Scollega</Button>}
    </Card>
  );
}
