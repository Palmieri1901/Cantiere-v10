import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Globe, KeyRound } from "lucide-react";
import SitiCard from "@/pages/officina/SitiCard";

export default function ImpostazioniTab() {
  const [cfg, setCfg] = useState(null);
  const [key, setKey] = useState("");
  const load = () => api.get("/officina/config").then((r) => setCfg(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const salvaKey = async () => { await api.put("/officina/config", { tavily_key: key.trim() }); setKey(""); toast.success(key.trim() ? "Chiave Tavily salvata" : "Ripristinata la chiave predefinita"); load(); };
  const setWeb = async (v) => { await api.put("/officina/config", { web_default: v }); load(); };
  if (!cfg) return null;
  return (
    <div className="space-y-4 max-w-2xl" data-testid="officina-impostazioni">
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 font-medium"><Globe className="w-4 h-4 text-primary" /> Ricerca web (Tavily)</div>
        <p className="text-sm text-muted-foreground">Quando è attiva, l'assistente può integrare le schede con risultati dal web, citandoli come fonte. Ottieni una chiave gratuita su <a href="https://app.tavily.com" target="_blank" rel="noreferrer" className="underline">app.tavily.com</a>.</p>
        <div className="text-sm" data-testid="tavily-stato">Stato: {cfg.tavily_configurata ? <span className="text-emerald-700">configurata ({cfg.tavily_mascherata}) · {cfg.chiave_personalizzata ? "chiave personalizzata" : "chiave predefinita"}</span> : <span className="text-amber-700">nessuna chiave</span>}</div>
        <div className="flex gap-2">
          <div className="relative flex-1"><KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="tvly-…  (lascia vuoto per usare la predefinita)" className="pl-9 font-mono-num" data-testid="input-tavily-key" /></div>
          <Button onClick={salvaKey} variant="outline" data-testid="btn-salva-tavily">Salva</Button>
        </div>
        <label className="flex items-center gap-2 text-sm pt-1"><Switch checked={cfg.web_default} onCheckedChange={setWeb} disabled={!cfg.tavily_configurata} data-testid="switch-web-default" /> Attiva "Consulta anche il web" per impostazione predefinita</label>
      </Card>
      <SitiCard />
    </div>
  );
}
