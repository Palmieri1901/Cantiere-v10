import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, KeyRound, Link2, Loader2, Eye, EyeOff } from "lucide-react";

const err = (e) => toast.error(e.response?.data?.detail || "Errore");

// Collegamento PC ↔ online: token generato dal programma, copiato e incollato sull'altra installazione
export default function SyncConfig({ onChange }) {
  const [token, setToken] = useState("");
  const [peer, setPeer] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => { api.get("/sync/config").then((r) => { setToken(r.data.token); setPeer(r.data.peer); }).catch(() => {}); }, []);
  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { err(e); } finally { setBusy(""); } };
  const genera = () => run("gen", async () => { const r = await api.post("/sync/genera-token"); setToken(r.data.token); setShow(true); toast.success("Nuovo token generato: copialo nell'altra installazione"); onChange(); });
  const salva = () => run("save", async () => { const r = await api.put("/sync/config", { token, peer }); setToken(r.data.token); setPeer(r.data.peer); toast.success("Collegamento salvato"); onChange(); });
  const prova = () => run("test", async () => { await api.post("/sync/prova"); toast.success("Collegamento riuscito: le due installazioni si riconoscono"); });
  const copia = async () => { try { await navigator.clipboard.writeText(token); toast.success("Token copiato"); } catch { toast.error("Copia non riuscita, selezionalo e copialo a mano"); } };
  return (
    <div className="border-t pt-3 space-y-3" data-testid="sync-config">
      <div className="text-xs text-muted-foreground">
        1) Sull'installazione <b>online</b> premi «Genera token» e copialo. 2) Sul <b>PC</b> incolla lo stesso token e l'indirizzo online, poi «Salva» e «Prova collegamento».
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sync-token">Chiave token di collegamento</Label>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input id="sync-token" type={show ? "text" : "password"} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Incolla qui il token dell'altra installazione" className="pr-9 font-mono text-xs" data-testid="sync-token-input" />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" data-testid="sync-token-toggle" aria-label="Mostra token">{show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={copia} disabled={!token} data-testid="sync-token-copia"><Copy className="w-4 h-4 mr-1.5" /> Copia</Button>
          <Button type="button" variant="outline" size="sm" onClick={genera} disabled={!!busy} data-testid="sync-token-genera">{busy === "gen" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1.5" />} Genera token</Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sync-peer">Indirizzo dell'altra installazione (solo sul PC)</Label>
        <Input id="sync-peer" value={peer} onChange={(e) => setPeer(e.target.value)} placeholder="https://indirizzo-online (lascia vuoto sulla versione online)" data-testid="sync-peer-input" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={salva} disabled={!!busy} data-testid="sync-config-salva">{busy === "save" && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />} Salva</Button>
        <Button size="sm" variant="outline" onClick={prova} disabled={!!busy || !peer} data-testid="sync-config-prova">{busy === "test" ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Link2 className="w-4 h-4 mr-1.5" />} Prova collegamento</Button>
      </div>
    </div>
  );
}
