import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Mic, MicOff, Send, Sparkles, Check, X, Volume2, VolumeX, Loader2, Ear, ExternalLink } from "lucide-react";
import { useVoce } from "./useVoce";

const ESEMPI = ["Scarica 2 filtri olio per Rossi", "Quanti filtri olio ho in magazzino?", "Nuovo lavoro antivegetativa 3 ore a Bianchi", "Appuntamento alaggio Verdi venerdì alle 9", "Che appuntamenti ho domani?"];
const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();

// Hall: assistente vocale. `interpreta(testo, storia)` → risposta; `esegui(azione, parametri)` → risultato; `onCompila(parametri)` per l'app dipendenti.
export default function HallWidget({ interpreta, esegui, onCompila, esempi = ESEMPI, className = "" }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [testo, setTesto] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendente, setPendente] = useState(null);
  const [voceOn, setVoceOn] = useState(() => localStorage.getItem("hall_voce") !== "off");
  const endRef = useRef(null);

  const invia = useCallback(async (t) => {
    const txt = (t ?? testo).trim();
    if (!txt || busy) return;
    setTesto(""); setPendente(null);
    const storia = msgs.slice(-6).map((m) => ({ ruolo: m.ruolo, testo: m.testo }));
    setMsgs((m) => [...m, { ruolo: "utente", testo: txt }]);
    setBusy(true);
    try {
      const r = await interpreta(txt, storia);
      setMsgs((m) => [...m, { ruolo: "hall", testo: r.risposta || r.riepilogo || "Fatto.", dati: r }]);
      if (r.richiede_conferma && r.azione !== "non_capito") setPendente(r);
      if (voceOn) parla(r.risposta || r.riepilogo);
    } catch (e) {
      const err = e.response?.data?.detail || "GEB non è raggiungibile al momento";
      setMsgs((m) => [...m, { ruolo: "hall", testo: err, errore: true }]);
    } finally { setBusy(false); }
  }, [testo, busy, msgs, interpreta, voceOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const onErrore = useCallback((msg) => { toast.error(msg, { duration: 8000 }); setMsgs((m) => [...m, { ruolo: "hall", testo: msg, errore: true }]); }, []);
  const { supportato, ascolto, parziale, avvia, stop, parla, sbloccaAudio, wakeAttivo, avviaWake, stopWake } = useVoce({ onFinal: invia, onErrore });
  const [wakeOn, setWakeOn] = useState(() => localStorage.getItem("hall_wake") === "on");
  const inviaRef = useRef(invia); inviaRef.current = invia;
  const avviaRef = useRef(avvia); avviaRef.current = avvia;

  const onWake = useCallback((resto) => {
    setOpen(true);
    if (navigator.vibrate) navigator.vibrate(40);
    if (resto && resto.split(" ").length >= 2) inviaRef.current(resto);
    else { parla("Dimmi"); setTimeout(() => avviaRef.current(), 700); }
  }, [parla]);

  // Riattiva l'ascolto della parola "Hall" quando il pannello è chiuso e non si sta già ascoltando
  useEffect(() => {
    if (!wakeOn || !supportato) { stopWake(); return; }
    if (open || ascolto) { stopWake(); return; }
    avviaWake(onWake);
    return stopWake;
  }, [wakeOn, open, ascolto, supportato, avviaWake, stopWake, onWake]);

  const toggleWake = () => {
    const n = !wakeOn; setWakeOn(n); localStorage.setItem("hall_wake", n ? "on" : "off");
    toast[n ? "success" : "info"](n ? "Ascolto attivo: di' «GEB» seguito dal comando" : "Ascolto della parola «GEB» disattivato");
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, pendente, parziale]);
  useEffect(() => { localStorage.setItem("hall_voce", voceOn ? "on" : "off"); if (!voceOn) window.speechSynthesis?.cancel(); }, [voceOn]);

  const conferma = async () => {
    const p = pendente; setPendente(null); setBusy(true);
    try {
      if (p.azione === "compila_lavoro" && onCompila) { onCompila(p.parametri); setMsgs((m) => [...m, { ruolo: "hall", testo: "Ho compilato il modulo: controlla e salva." }]); if (voceOn) parla("Ho compilato il modulo, controlla e salva."); setOpen(false); return; }
      const r = await esegui(p.azione, p.parametri);
      setMsgs((m) => [...m, { ruolo: "hall", testo: r.messaggio || "Fatto." }]);
      if (voceOn) parla(r.messaggio || "Fatto.");
      window.dispatchEvent(new Event("hall-eseguito"));
    } catch (e) { const err = e.response?.data?.detail || "Operazione non riuscita"; toast.error(err); setMsgs((m) => [...m, { ruolo: "hall", testo: err, errore: true }]); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => { sbloccaAudio(); setOpen(true); }} className={`fixed right-4 bottom-24 md:bottom-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 grid place-items-center hover:scale-105 active:scale-95 transition-transform ${className}`} title={wakeAttivo ? "GEB in ascolto: di' «GEB»" : "GEB, assistente vocale"} data-testid="hall-fab">
        {wakeAttivo && <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-60" data-testid="hall-wake-indicator" />}
        <Mic className="w-6 h-6" />
      </button>
      <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) stop(); }}>
        <SheetContent side="bottom" className="h-[85vh] sm:h-[80vh] rounded-t-2xl p-0 flex flex-col max-w-2xl mx-auto" data-testid="hall-sheet">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border text-left">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle className="font-display flex items-center gap-2"><span className="w-8 h-8 rounded-full bg-primary/10 grid place-items-center"><Sparkles className="w-4 h-4 text-primary" /></span> GEB</SheetTitle>
              <div className="flex items-center gap-1">
                {supportato && <Button variant={wakeOn ? "default" : "ghost"} size="sm" onClick={toggleWake} className={wakeOn ? "bg-primary hover:bg-primary/90" : ""} data-testid="hall-toggle-wake"><Ear className="w-4 h-4 mr-1.5" />{wakeOn ? "«GEB» attivo" : "Di' «GEB»"}</Button>}
                <Button variant="ghost" size="sm" onClick={() => { const n = !voceOn; setVoceOn(n); if (n) { sbloccaAudio(); parla("Audio attivo"); } }} data-testid="hall-toggle-voce">{voceOn ? <Volume2 className="w-4 h-4 mr-1.5" /> : <VolumeX className="w-4 h-4 mr-1.5" />}{voceOn ? "Voce on" : "Voce off"}</Button>
              </div>
            </div>
            <SheetDescription>Premi il microfono e detta il comando (oppure scrivi). Con «Di' GEB» attivo basta dire "GEB" seguito dal comando, senza toccare lo schermo. Le modifiche vengono eseguite solo dopo la tua conferma.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" data-testid="hall-messaggi">
            {inIframe && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3 text-xs space-y-2" data-testid="hall-avviso-iframe">
                <div className="font-semibold">Audio e microfono bloccati nell'anteprima</div>
                <div>Stai usando il gestionale dentro il riquadro di Emergent: il browser non permette voce e microfono in questa modalità. Apri l'app in una scheda a parte per usare GEB a voce.</div>
                <Button size="sm" variant="outline" className="border-amber-400 bg-white" onClick={() => window.open(window.location.href, "_blank", "noopener")} data-testid="hall-apri-scheda"><ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Apri in una nuova scheda</Button>
              </div>
            )}
            {msgs.length === 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Prova a dire:</div>
                <div className="flex flex-wrap gap-1.5">{esempi.map((e) => <button key={e} onClick={() => { sbloccaAudio(); invia(e); }} className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-muted" data-testid="hall-esempio">{e}</button>)}</div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex ${m.ruolo === "utente" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.ruolo === "utente" ? "bg-primary text-primary-foreground rounded-br-sm" : m.errore ? "bg-destructive/10 text-destructive rounded-bl-sm" : "bg-muted rounded-bl-sm"}`} data-testid={`hall-msg-${m.ruolo}`}>{m.testo}</div>
              </div>
            ))}
            {pendente && (
              <div className="rounded-xl border-2 border-primary/40 bg-card p-4 space-y-3" data-testid="hall-conferma">
                <div className="label-mini">Confermi?</div>
                <div className="text-sm font-medium">{pendente.riepilogo}</div>
                {pendente.azione === "compila_lavoro" && pendente.parametri.articoli_dettaglio?.length > 0 && <div className="text-xs text-muted-foreground">Articoli: {pendente.parametri.articoli_dettaglio.map((a) => `${a.quantita}× ${a.nome}`).join(", ")}</div>}
                <div className="flex gap-2">
                  <Button onClick={() => { sbloccaAudio(); conferma(); }} disabled={busy} className="flex-1 bg-primary hover:bg-primary/90" data-testid="hall-conferma-si"><Check className="w-4 h-4 mr-1.5" /> Conferma</Button>
                  <Button variant="outline" onClick={() => setPendente(null)} data-testid="hall-conferma-no"><X className="w-4 h-4 mr-1.5" /> Annulla</Button>
                </div>
              </div>
            )}
            {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> GEB sta pensando…</div>}
            {ascolto && <div className="text-sm italic text-muted-foreground" data-testid="hall-parziale">{parziale || "Ti ascolto…"}</div>}
            <div ref={endRef} />
          </div>

          <div className="px-4 py-3 border-t border-border bg-card flex items-center gap-2">
            {supportato ? (
              <Button size="icon" onClick={() => { sbloccaAudio(); ascolto ? stop() : avvia(); }} className={`h-12 w-12 rounded-full shrink-0 ${ascolto ? "bg-destructive hover:bg-destructive/90 animate-pulse" : "bg-primary hover:bg-primary/90"}`} data-testid="hall-mic">{ascolto ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}</Button>
            ) : <span className="text-[11px] text-muted-foreground w-24">Dettatura non supportata: scrivi</span>}
            <form className="flex-1 flex gap-2" onSubmit={(e) => { e.preventDefault(); sbloccaAudio(); invia(); }}>
              <Input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Oppure scrivi qui…" className="h-12" data-testid="hall-input" />
              <Button type="submit" size="icon" variant="outline" disabled={busy || !testo.trim()} className="h-12 w-12 shrink-0" data-testid="hall-invia"><Send className="w-4 h-4" /></Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
