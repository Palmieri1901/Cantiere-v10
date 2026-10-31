import { useEffect, useState } from "react";
import { mobileStore, mobileApi } from "@/lib/mobileStore";
import LoginKey from "@/pages/app-dipendente/LoginKey";
import NuovoLavoro from "@/pages/app-dipendente/NuovoLavoro";
import Coda from "@/pages/app-dipendente/Coda";
import HomeDipendente from "@/pages/app-dipendente/HomeDipendente";
import Listino from "@/pages/app-dipendente/Listino";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { RefreshCw, LogOut, Wifi, WifiOff, Sailboat, Home, ClipboardPlus, Package, Send, Wrench, Anchor, ClipboardList } from "lucide-react";
import ChatOfficina from "@/pages/officina/ChatOfficina";
import CapitaneriaMobile from "@/pages/app-dipendente/CapitaneriaMobile";
import ValutazioniUsato from "@/pages/ValutazioniUsato";
import CalendarioMobile from "@/pages/app-dipendente/CalendarioMobile";
import DdtDestinazioneMobile from "@/pages/app-dipendente/DdtDestinazioneMobile";
import { Lavagna } from "@/components/Lavagna";
import AppLock from "@/components/AppLock";
import { resetSblocco } from "@/lib/passkey";

export default function AppDipendente() {
  const [logged, setLogged] = useState(!!mobileStore.getKey());
  const [online, setOnline] = useState(navigator.onLine);
  const [coda, setCoda] = useState(mobileStore.coda());
  const [inModifica, setInModifica] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [view, setView] = useState("home");
  const [nuoviLavagna, setNuoviLavagna] = useState(0);

  const controllaLavagna = async () => {
    try {
      const r = await mobileApi().get("/lavagna");
      const ultima = localStorage.getItem("geb_lavagna_vista") || "";
      setNuoviLavagna((r.data || []).filter((m) => !m.fatto && m.created_at > ultima).length);
    } catch { /* offline */ }
  };
  useEffect(() => {
    if (!logged) return;
    controllaLavagna();
    const t = setInterval(controllaLavagna, 60000);
    return () => clearInterval(t);
  }, [logged]);
  useEffect(() => {
    if (view === "lavagna") { localStorage.setItem("geb_lavagna_vista", new Date().toISOString()); setNuoviLavagna(0); }
  }, [view]);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const [funzioni, setFunzioni] = useState(() => mobileStore.getFunzioni());
  const aggiornaDati = async (silent) => {
    try {
      const a = mobileApi();
      const [c, ar, me] = await Promise.all([a.get("/clienti"), a.get("/articoli"), a.get("/me")]);
      mobileStore.setClienti(c.data); mobileStore.setArticoli(ar.data);
      mobileStore.setFunzioni(me.data.funzioni ?? null); setFunzioni(me.data.funzioni ?? null);
      if (!silent) toast.success(`Aggiornati ${c.data.length} clienti e ${ar.data.length} articoli`);
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
    mobileStore.logout(); resetSblocco(); setLogged(false);
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
    <AppLock client={mobileApi()} base="/webauthn" onPassword={() => { mobileStore.logout(); resetSblocco(); setLogged(false); }} passwordLabel="Esci e reinserisci la chiave">
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto" data-testid="app-dipendente">
      <header className="px-4 py-3 border-b border-border/60 bg-card flex items-center gap-3 sticky top-0 z-10">
        <div className="w-9 h-9 rounded-md bg-primary text-primary-foreground grid place-items-center"><Sailboat className="w-5 h-5" /></div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-semibold leading-none truncate">{mobileStore.getNome()}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1" data-testid="stato-rete">
            {online ? <><Wifi className="w-3 h-3 text-emerald-600" /> Online</> : <><WifiOff className="w-3 h-3 text-amber-600" /> Offline · i lavori restano sul telefono</>}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={() => aggiornaDati(false)} title="Aggiorna clienti e listino" data-testid="btn-aggiorna-dati"><RefreshCw className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" onClick={esci} title="Esci" data-testid="btn-mobile-logout"><LogOut className="w-4 h-4" /></Button>
      </header>

      <main className="flex-1 p-4 pb-24">
        {view === "home" && <HomeDipendente pendenti={pendenti} nuoviLavagna={nuoviLavagna} onScegli={setView} />}
        {view === "nuovo" && <NuovoLavoro key={inModifica?.client_uid || "nuovo"} iniziale={inModifica} onAnnulla={() => { setInModifica(null); setView("coda"); }}
          onSaved={(l) => { const esiste = coda.some((x) => x.client_uid === l.client_uid); salvaCoda(esiste ? coda.map((x) => x.client_uid === l.client_uid ? l : x) : [l, ...coda]); toast.success(esiste ? "Lavoro aggiornato" : "Lavoro salvato sul telefono"); setInModifica(null); setView("coda"); }} />}
        {view === "listino" && <Listino />}
        {view === "officina" && <ChatOfficina client={mobileApi()} basePath="/officina" compact autore={mobileStore.getNome()} />}
        {view === "capitaneria" && <CapitaneriaMobile />}
        {view === "quotazione" && <ValutazioniUsato client={mobileApi()} mobile />}
        {view === "calendario" && <CalendarioMobile />}
        {view === "ddt" && <DdtDestinazioneMobile />}
        {view === "lavagna" && <div className="space-y-3" data-testid="lavagna-mobile"><h2 className="font-display text-2xl font-semibold flex items-center gap-2"><ClipboardList className="w-6 h-6 text-primary" /> Lavagna</h2><Lavagna client={mobileApi()} basePath="/lavagna" compact /></div>}
        {view === "coda" && <Coda coda={coda} setCoda={salvaCoda} onSync={sincronizza} syncing={syncing} online={online} onModifica={(x) => { setInModifica(x); setView("nuovo"); }} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto flex border-t border-border/60 bg-card">
        {[["home", Home, "Home"], ["nuovo", ClipboardPlus, "Lavoro"], ["listino", Package, "Listino"], ["officina", Wrench, "Officina"], ["lavagna", ClipboardList, "Lavagna"], ["capitaneria", Anchor, "Capitan."], ["coda", Send, "Invia"]].filter(([id]) => id === "home" || id === "coda" || funzioni === null || funzioni.includes(id)).map(([id, Icon, label]) => (
          <button key={id} onClick={() => setView(id)} className={`flex-1 py-2 flex flex-col items-center gap-0.5 text-[10px] font-medium relative ${view === id ? "text-primary" : "text-muted-foreground"}`} data-testid={`tab-${id === "nuovo" ? "nuovo-lavoro" : id}`}>
            <Icon className="w-5 h-5" />{label}
            {id === "coda" && pendenti > 0 && <span className="absolute top-1 right-1/4 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] grid place-items-center" data-testid="coda-badge">{pendenti}</span>}
            {id === "lavagna" && nuoviLavagna > 0 && <span className="absolute top-1 right-1/4 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] grid place-items-center animate-pulse" data-testid="lavagna-badge">{nuoviLavagna}</span>}
          </button>
        ))}
      </nav>
    </div>
    </AppLock>
  );
}
