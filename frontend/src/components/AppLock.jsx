import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Fingerprint, ScanFace, KeyRound, Loader2, AlertCircle } from "lucide-react";
import { isMobile, supportaBiometria, statoBiometria, registraBiometria, sbloccaBiometria, isSbloccato, segnaSbloccato } from "@/lib/passkey";

// Blocco biometrico all'apertura su telefono. Su PC passa oltre (lì vale la password a ogni accesso).
export default function AppLock({ client, base = "/webauthn", onPassword, passwordLabel = "Usa la password", children }) {
  const mobile = isMobile() && supportaBiometria();
  const [stato, setStato] = useState(mobile && !isSbloccato() ? "check" : "ok"); // check | enroll | lock | busy | ok
  const [err, setErr] = useState("");

  const sblocca = async () => {
    setStato("busy"); setErr("");
    try { await sbloccaBiometria(client, base); segnaSbloccato(); setStato("ok"); }
    catch (e) { setErr(e.response?.data?.detail || (e.name === "NotAllowedError" ? "Riconoscimento annullato o non riuscito" : "Sblocco non riuscito")); setStato("lock"); }
  };
  const registra = async () => {
    setStato("busy"); setErr("");
    try { await registraBiometria(client, base); segnaSbloccato(); setStato("ok"); }
    catch (e) { setErr(e.response?.data?.detail || (e.name === "NotAllowedError" ? "Attivazione annullata" : "Attivazione non riuscita")); setStato("enroll"); }
  };

  const avviato = useRef(false);
  useEffect(() => {
    if (stato !== "check" || avviato.current) return;
    avviato.current = true;
    statoBiometria(client, base).then((s) => { if (s.enrolled) sblocca(); else setStato("enroll"); }).catch(() => setStato("enroll"));
  }, []);

  if (stato === "ok") return children;
  const enroll = stato === "enroll";
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto" data-testid="app-lock">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 text-primary grid place-items-center mb-6">
        {stato === "busy" || stato === "check" ? <Loader2 className="w-10 h-10 animate-spin" /> : /iPhone|iPad/.test(navigator.userAgent) ? <ScanFace className="w-10 h-10" /> : <Fingerprint className="w-10 h-10" />}
      </div>
      <h1 className="font-display text-2xl font-semibold" data-testid="app-lock-titolo">{enroll ? "Attiva lo sblocco biometrico" : "Gestionale bloccato"}</h1>
      <p className="text-sm text-muted-foreground mt-2 mb-8">
        {enroll ? "Su telefono l'accesso richiede sempre impronta, volto o codice del dispositivo. Attivalo ora: da domani basterà un tocco." : "Conferma con impronta, volto o codice del dispositivo per continuare."}
      </p>
      {err && <div className="flex items-center gap-2 text-sm text-destructive mb-4" data-testid="app-lock-errore"><AlertCircle className="w-4 h-4" /> {err}</div>}
      <div className="w-full space-y-2">
        {enroll
          ? <Button className="w-full h-12" onClick={registra} disabled={stato === "busy"} data-testid="btn-attiva-biometria"><Fingerprint className="w-4 h-4 mr-2" /> Attiva ora</Button>
          : <Button className="w-full h-12" onClick={sblocca} disabled={stato === "busy" || stato === "check"} data-testid="btn-sblocca-biometria"><Fingerprint className="w-4 h-4 mr-2" /> Sblocca</Button>}
        {onPassword && <Button variant="ghost" className="w-full" onClick={onPassword} data-testid="btn-lock-password"><KeyRound className="w-4 h-4 mr-2" /> {passwordLabel}</Button>}
      </div>
    </div>
  );
}
