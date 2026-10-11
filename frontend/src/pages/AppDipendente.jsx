import { useEffect, useState } from "react";
import { mobileStore, mobileApi } from "@/lib/mobileStore";
import LoginKey from "@/pages/app-dipendente/LoginKey";
import NuovoLavoro from "@/pages/app-dipendente/NuovoLavoro";
import Coda from "@/pages/app-dipendente/Coda";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { RefreshCw, LogOut, Wifi, WifiOff, Sailboat } from "lucide-react";

export default function AppDipendente() {
  const [logged, setLogged] = useState(!!mobileStore.getKey());
  const [online, setOnline] = useState(navigator.onLine);
  const [coda, setCoda] = useState(mobileStore.coda());
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("nuovo");

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const aggiornaDati = async (silent) => {
    try {
      const a = mobileApi();
      const [c, ar] = await Promise.all([a.get("/clienti"), a.get("/articoli")]);
      mobileStore.setClienti(c.data); mobileStore.setArticoli(ar.data);
      if (!silent) toast.success(`Aggiornati ${c.data.length} clienti`);
    } catch (e) {
      if (e.response?.status === 401) { mobileStore.logout(); setLogged(false); toast.error("Chiave non più valida"); }
      else if (!silent) toast.error("Impossibile aggiornare: sei offline?");
    }
  };

  useEffect(() => { if (logged && online) aggiornaDati(true); }, [logged]);

  const salvaCoda = (c) => { mobileStore.setCoda(c); setCoda(c); };

  const pendenti = coda.filter((x) => !x.inviato).length;

  useEffect(() => {
    if (!logged) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [logged]);

  const esci = async () => {
    const msg = pendenti > 0
      ? `Hai ${pendenti} ${pendenti === 1 ? "lavoro non ancora inviato" : "lavori non ancora inviati"} al cantiere. Uscendo dovrai reinserire la chiave: i lavori restano salvati sul telefono. Vuoi uscire?`
      : "Vuoi uscire dall'app? Per rientrare dovrai reinserire la chiave.";
    if (!await confirmDialog(msg, { title: "Esci dall'app", okLabel: "Esci" })) return;
    mobileStore.logout(); setLogged(false);
  };

  const sincronizza = async () => {
    const daInviare = coda.filter((x) => !x.inviato);
    if (daInviare.length === 0) return toast.info("Niente da inviare");
    setSyncing(true);
    try {
      const r = await mobileApi().post("/lavori", { lavori: daInviare });
      salvaCoda(coda.map((x) => daInviare.includes(x) ? { ...x, inviato: true, inviato_at: new Date().toISOString() } : x));
      toast.success(`Inviati ${r.data.ricevuti} lavori al cantiere`);
    } catch (e) {
      toast.error(e.response?.status === 401 ? "Chiave non valida" : "Invio fallito: controlla la connessione");
    } finally { setSyncing(false); }
  };

  if (!logged) return <LoginKey onLogged={() => setLogged(true)} />;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto" data-testid="app-dipendente">
      <header className="px-4 py-3 border-b border-border/60 bg-card flex items-center gap-3 sticky top-0 z-10">
        <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground grid place-items-center"><Sailboat className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold leading-none truncate">{mobileStore.getNome()}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1" data-testid="stato-rete">
            {online ? <><Wifi className="w-3 h-3 text-emerald-600" /> Online</> : <><WifiOff className="w-3 h-3 text-amber-600" /> Offline · i lavori restano sul telefono</>}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => aggiornaDati(false)} title="Aggiorna clienti" data-testid="btn-aggiorna-dati"><RefreshCw className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" onClick={esci} title="Esci" data-testid="btn-mobile-logout"><LogOut className="w-4 h-4" /></Button>
      </header>

      <main className="flex-1 p-4 pb-24">
        {view === "nuovo"
          ? <NuovoLavoro onSaved={(l) => { salvaCoda([l, ...coda]); toast.success("Lavoro salvato sul telefono"); setView("coda"); }} />
          : <Coda coda={coda} setCoda={salvaCoda} onSync={sincronizza} syncing={syncing} online={online} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto grid grid-cols-2 border-t border-border/60 bg-card">
        <button onClick={() => setView("nuovo")} className={`py-3 text-sm font-medium ${view === "nuovo" ? "text-primary" : "text-muted-foreground"}`} data-testid="tab-nuovo-lavoro">+ Nuovo lavoro</button>
        <button onClick={() => setView("coda")} className={`py-3 text-sm font-medium ${view === "coda" ? "text-primary" : "text-muted-foreground"}`} data-testid="tab-coda">
          Da inviare {pendenti > 0 && <span className="ml-1 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px]" data-testid="coda-badge">{pendenti}</span>}
        </button>
      </nav>
    </div>
  );
}
