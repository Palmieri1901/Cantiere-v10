import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Cloud, CloudOff, Loader2 } from "lucide-react";

const quando = (ts) => (ts ? new Date(ts * 1000).toLocaleString("it-IT") : "mai");

// Stato della sincronizzazione tra questa installazione e il peer (PC locale ↔ online)
export default function SyncCard() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/sync/stato").then((r) => setS(r.data)).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  const ora = async () => {
    setBusy(true);
    try { const r = await api.post("/sync/ora"); setS((p) => ({ ...p, ...r.data })); toast[r.data.ultimo_errore ? "error" : "success"](r.data.ultimo_errore ? `Sync non riuscita: ${r.data.ultimo_errore}` : "Sincronizzazione completata"); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore"); } finally { setBusy(false); }
  };
  if (!s) return null;
  const online = !s.ultimo_errore && s.ultimo_ok;
  return (
    <Card className="p-5 space-y-3" data-testid="sync-card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold flex items-center gap-2">{s.configurato ? (online ? <Cloud className="w-4 h-4 text-emerald-600" /> : <CloudOff className="w-4 h-4 text-amber-600" />) : <Cloud className="w-4 h-4 text-muted-foreground" />} Sincronizzazione PC ↔ online</div>
          <div className="text-xs text-muted-foreground mt-0.5">Le modifiche fatte da una parte arrivano all'altra; in caso di conflitto vince l'ultima modifica.</div>
        </div>
        {s.peer && <Button size="sm" variant="outline" onClick={ora} disabled={busy || s.in_corso} data-testid="sync-ora">{busy || s.in_corso ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Sincronizza ora</Button>}
      </div>
      {s.peer ? (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm" data-testid="sync-dettagli">
          <div><span className="text-muted-foreground">Collegato a:</span> <span className="font-mono text-xs break-all">{s.peer}</span></div>
          <div><span className="text-muted-foreground">Ultima sync riuscita:</span> {quando(s.ultimo_ok)}</div>
          <div><span className="text-muted-foreground">In attesa di invio:</span> <b data-testid="sync-pendenti">{s.in_attesa_di_invio}</b> modifiche</div>
          <div><span className="text-muted-foreground">Inviate / ricevute:</span> {s.inviati} / {s.ricevuti}</div>
          {s.ultimo_errore && <div className="sm:col-span-2 text-amber-700 text-xs" data-testid="sync-errore">Offline o peer non raggiungibile: {s.ultimo_errore}. Le modifiche restano in coda e partiranno al ritorno della connessione.</div>}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground" data-testid="sync-non-configurato">
          Questa è l'installazione <b>{s.token_presente ? "online (riceve e invia su richiesta del PC)" : "senza token di sincronizzazione"}</b>.
          {!s.token_presente && " Imposta SYNC_TOKEN (uguale sui due lati) per abilitare la sincronizzazione."}
          {" "}Sul PC locale imposta nel file backend/.env: <code className="text-xs">SYNC_PEER_URL=https://indirizzo-online</code> e <code className="text-xs">SYNC_TOKEN=…</code>, poi riavvia il backend.
        </div>
      )}
    </Card>
  );
}
