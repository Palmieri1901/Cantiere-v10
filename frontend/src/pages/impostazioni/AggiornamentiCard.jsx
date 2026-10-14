import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DownloadCloud, RefreshCw, CheckCircle2, AlertTriangle, Undo2, Loader2, GitCommitHorizontal } from "lucide-react";

const fmtData = (iso) => iso ? new Date(iso).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function AggiornamentiCard() {
  const [stato, setStato] = useState(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [fase, setFase] = useState("");
  const [offline, setOffline] = useState(false);
  const timer = useRef(null);

  const controlla = async (silent) => {
    setChecking(true);
    try {
      const r = await api.get("/aggiornamenti/stato");
      setStato(r.data);
      if (r.data.stato === "running") avviaPolling();
      if (!silent) toast[r.data.aggiornamenti > 0 ? "info" : "success"](r.data.aggiornamenti > 0 ? `${r.data.aggiornamenti} aggiornamenti disponibili` : "Il programma è aggiornato");
    } catch (e) {
      if (!silent) toast.error(e.response?.data?.detail || "Controllo non riuscito");
      setStato((s) => s || { disponibile: false, motivo: e.response?.data?.detail || "Servizio non raggiungibile" });
    } finally { setChecking(false); }
  };

  const avviaPolling = () => {
    setRunning(true);
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const r = await api.get("/aggiornamenti/progresso");
        setOffline(false);
        setFase(r.data.fase || "");
        if (r.data.stato === "done") { clearInterval(timer.current); toast.success("Aggiornamento completato, ricarico…"); setTimeout(() => window.location.reload(), 1500); }
        if (r.data.stato === "error") { clearInterval(timer.current); setRunning(false); toast.error(`Errore: ${r.data.errore}`); controlla(true); }
      } catch { setOffline(true); setFase("Riavvio dei servizi in corso…"); }
    }, 3000);
  };

  useEffect(() => { controlla(true); return () => clearInterval(timer.current); }, []);

  const aggiorna = async () => {
    const n = stato?.aggiornamenti || 0;
    if (!await confirmDialog(`Verrà fatta una copia di sicurezza completa del database, poi scaricate ${n} modifiche da GitHub${stato?.repo ? ` (${stato.repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "")})` : ""} e riavviato il programma (2-5 minuti). Nessuno potrà usare il gestionale durante l'aggiornamento. In caso di problemi potrai tornare indietro con "Ripristina versione precedente". Procedere?`, { title: "Aggiorna il programma", okLabel: "Aggiorna ora", danger: false })) return;
    try { await api.post("/aggiornamenti/avvia"); setFase("Avvio…"); avviaPolling(); }
    catch (e) { toast.error(e.response?.data?.detail || "Avvio non riuscito"); }
  };

  const ripristina = async () => {
    if (!await confirmDialog(`Tornare alla versione ${stato?.precedente?.hash} (${fmtData(stato?.precedente?.data)})? Verranno ripristinati sia il programma sia il database dalla copia di sicurezza "${stato?.backup_pre_update}" fatta prima dell'aggiornamento: le modifiche inserite dopo l'aggiornamento andranno perse.`, { title: "Ripristina versione precedente", okLabel: "Ripristina" })) return;
    try { await api.post("/aggiornamenti/ripristina"); setFase("Avvio ripristino…"); avviaPolling(); }
    catch (e) { toast.error(e.response?.data?.detail || "Ripristino non riuscito"); }
  };

  const head = (
    <div className="flex items-center gap-1.5 label-mini mb-2"><DownloadCloud className="w-3.5 h-3.5" /> Aggiornamenti</div>
  );

  if (stato && !stato.disponibile) {
    return (
      <Card className="p-6 mt-6" data-testid="aggiornamenti-card">
        {head}
        <h3 className="font-display text-xl font-semibold">Aggiornamento del programma</h3>
        <p className="text-sm text-muted-foreground mt-1" data-testid="aggiornamenti-non-disponibile">{stato.motivo}</p>
      </Card>
    );
  }

  if (running) {
    return (
      <Card className="p-6 mt-6" data-testid="aggiornamenti-card">
        {head}
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary shrink-0" />
          <div>
            <h3 className="font-display text-xl font-semibold">Aggiornamento in corso…</h3>
            <p className="text-sm text-muted-foreground mt-1" data-testid="aggiornamenti-fase">{fase || "Avvio…"}{offline && " (il server si sta riavviando, attendi)"}</p>
            <p className="text-xs text-muted-foreground mt-2">Non chiudere questa pagina: si ricaricherà da sola al termine.</p>
          </div>
        </div>
      </Card>
    );
  }

  const n = stato?.aggiornamenti || 0;
  return (
    <Card className="p-6 mt-6" data-testid="aggiornamenti-card">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0 flex-1">
          {head}
          <h3 className="font-display text-xl font-semibold flex items-center gap-2 flex-wrap">
            Aggiornamento del programma
            {stato && (n > 0
              ? <Badge className="bg-primary text-primary-foreground" data-testid="aggiornamenti-badge">{n} {n === 1 ? "novità" : "novità"}</Badge>
              : <Badge variant="outline" className="text-emerald-700 border-emerald-300 gap-1" data-testid="aggiornamenti-badge"><CheckCircle2 className="w-3 h-3" /> Aggiornato</Badge>)}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Versione installata: <span className="font-mono-num" data-testid="versione-corrente">{stato?.corrente?.hash || "—"}</span> · {fmtData(stato?.corrente?.data)}
            {stato?.corrente?.messaggio && <span className="block line-clamp-2">{stato.corrente.messaggio}</span>}
            {stato?.repo && <span className="block text-xs mt-0.5">Sorgente: {stato.repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "")} · ramo {stato.branch}{stato?.remoto?.hash ? ` · ultima su GitHub ${stato.remoto.hash}` : ""}</span>}
          </p>
          {stato?.errore_fetch && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> GitHub non raggiungibile: {stato.errore_fetch}</p>}
          {stato?.stato === "error" && <p className="text-xs text-destructive mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Ultimo aggiornamento fallito: {stato.errore}</p>}
          {n > 0 && (
            <ul className="mt-3 space-y-1.5 border-l-2 border-primary/40 pl-3" data-testid="lista-novita">
              {stato.novita.map((c) => (
                <li key={c.hash} className="text-sm flex items-start gap-2">
                  <GitCommitHorizontal className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="line-clamp-2"><span className="font-mono-num text-xs text-muted-foreground mr-1.5">{c.hash}</span>{c.messaggio}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col sm:flex-row md:flex-col gap-2 w-full md:w-auto shrink-0">
          <Button variant="outline" onClick={() => controlla(false)} disabled={checking} className="w-full sm:w-auto" data-testid="btn-controlla-aggiornamenti">
            <RefreshCw className={`w-4 h-4 mr-2 ${checking ? "animate-spin" : ""}`} /> Controlla aggiornamenti
          </Button>
          <Button onClick={aggiorna} disabled={!n || checking} className="w-full sm:w-auto bg-primary hover:bg-primary/90" data-testid="btn-aggiorna-ora">
            <DownloadCloud className="w-4 h-4 mr-2" /> Aggiorna ora
          </Button>
          {stato?.precedente && (
            <Button variant="ghost" onClick={ripristina} className="w-full sm:w-auto text-muted-foreground" data-testid="btn-ripristina-versione">
              <Undo2 className="w-4 h-4 mr-2" /> Ripristina {stato.precedente.hash}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
