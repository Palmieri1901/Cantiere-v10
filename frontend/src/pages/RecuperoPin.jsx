import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { recuperaConImpronta, supportaBiometria } from "@/lib/passkey";
import { POLICY, POLICY_MSG } from "@/lib/passwordPolicy";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import { Sailboat, KeyRound, ArrowLeft, CheckCircle2, AlertCircle, Mail, Fingerprint } from "lucide-react";

function formatError(detail) {
  if (!detail) return "Errore imprevisto";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" · ");
  return String(detail);
}

export default function RecuperoPin() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [pin, setPin] = useState("");
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [modo, setModo] = useState("pin");
  const [emailStato, setEmailStato] = useState(null);
  const [improntaStato, setImprontaStato] = useState(null);
  const [codiceInviato, setCodiceInviato] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/auth/codice-email/stato").then((r) => setEmailStato(r.data)).catch(() => setEmailStato({ disponibile: false }));
    api.get("/webauthn/recupero/stato").then((r) => setImprontaStato(r.data)).catch(() => setImprontaStato({ disponibile: false }));
  }, []);

  const inviaCodice = async () => {
    setErr(""); setSending(true);
    try {
      const r = await api.post("/auth/codice-email");
      setCodiceInviato(`Codice inviato a ${r.data.email_mascherata}: vale ${r.data.minuti} minuti. Controlla anche la posta indesiderata.`);
    } catch (e) {
      setErr(formatError(e.response?.data?.detail) || "Invio del codice non riuscito");
    } finally { setSending(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (modo !== "impronta" && !pin.trim()) { setErr(modo === "email" ? "Inserisci il codice ricevuto via email" : "Inserisci il PIN di recupero"); return; }
    if (!POLICY.test(pw1)) { setErr(POLICY_MSG); return; }
    if (pw1 !== pw2) { setErr("Le due password non coincidono"); return; }
    setLoading(true);
    try {
      if (modo === "impronta") await recuperaConImpronta(api, pw1);
      else if (modo === "email") await api.post("/auth/codice-reset", { codice: pin.trim(), new_password: pw1 });
      else await api.post("/auth/pin-reset", { pin: pin.trim(), new_password: pw1 });
      setDone(true);
      await refresh();
      setTimeout(() => nav("/", { replace: true }), 1500);
    } catch (e) {
      setErr(formatError(e.response?.data?.detail) || (e.name === "NotAllowedError" ? "Verifica dell'impronta annullata" : "Impossibile aggiornare la password"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background grid place-items-center px-4" data-testid="recupero-pin-page">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-lg bg-primary text-primary-foreground grid place-items-center mb-4">
            <Sailboat className="w-8 h-8" strokeWidth={1.8} />
          </div>
          <div className="label-mini mb-1">Gestione Cantiere</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Gestionale GEBnautica</h1>
        </div>

        <Card className="p-8">
          <h2 className="font-display text-2xl font-semibold mb-1">Recupero password</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Usa il PIN di recupero, un codice ricevuto via email oppure l'impronta digitale e imposta una nuova password.
          </p>

          {done ? (
            <div className="space-y-4" data-testid="recupero-done">
              <div className="flex items-start gap-3 p-4 rounded-md bg-primary/5 border border-primary/20">
                <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold text-foreground">Password aggiornata</div>
                  <p className="text-muted-foreground mt-1 leading-relaxed">
                    Accesso automatico in corso…
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2 text-xs mb-1">
                  <button type="button" onClick={() => { setModo("pin"); setPin(""); }} className={`px-2.5 py-1.5 rounded-md border ${modo === "pin" ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`} data-testid="btn-modo-pin">PIN di recupero</button>
                  <button type="button" onClick={() => { setModo("email"); setPin(""); }} className={`px-2.5 py-1.5 rounded-md border ${modo === "email" ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`} data-testid="btn-modo-email">Codice via email</button>
                  <button type="button" onClick={() => { setModo("impronta"); setPin(""); }} className={`px-2.5 py-1.5 rounded-md border ${modo === "impronta" ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`} data-testid="btn-modo-impronta"><Fingerprint className="w-3.5 h-3.5 inline mr-1" />Impronta digitale</button>
                </div>
                {modo === "impronta" && (
                  <div className="rounded-md border border-border bg-muted/30 p-3" data-testid="box-impronta">
                    {improntaStato?.disponibile
                      ? <p className="text-xs text-muted-foreground">Scegli la nuova password e premi «Reimposta password»: ti verrà chiesta l'impronta (o il volto) registrata in Impostazioni su questo dispositivo.{!supportaBiometria() && " Questo browser non supporta la verifica biometrica."}</p>
                      : <p className="text-xs text-destructive" data-testid="impronta-non-disponibile">Nessuna impronta registrata: il titolare può registrarle in Impostazioni → Impronte digitali.</p>}
                  </div>
                )}
                {modo === "email" && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2" data-testid="box-codice-email">
                    {emailStato?.disponibile ? (
                      <>
                        <p className="text-xs text-muted-foreground">Ti inviamo un codice di 6 cifre all'email dell'amministratore ({emailStato.email_mascherata}).</p>
                        <Button type="button" variant="outline" size="sm" onClick={inviaCodice} disabled={sending} data-testid="btn-invia-codice-email"><Mail className="w-3.5 h-3.5 mr-1.5" />{sending ? "Invio…" : codiceInviato ? "Invia di nuovo" : "Invia codice via email"}</Button>
                        {codiceInviato && <p className="text-xs text-emerald-700" data-testid="codice-inviato-msg">{codiceInviato}</p>}
                      </>
                    ) : (
                      <p className="text-xs text-destructive" data-testid="codice-email-non-disponibile">Email amministratore non impostata: il titolare può configurarla in Impostazioni → Dati cantiere.</p>
                    )}
                  </div>
                )}
                {modo !== "impronta" && <><Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{modo === "email" ? "Codice ricevuto via email" : "PIN di recupero"}</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={modo === "email" ? "codice a 6 cifre" : "es. 347260"}
                  required
                  autoFocus
                  autoComplete="off"
                  data-testid="input-recupero-pin"
                /></>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nuova password</Label>
                <PasswordInput
                  value={pw1}
                  onChange={(e) => setPw1(e.target.value)}
                  required
                  data-testid="input-recupero-pw1"
                />
                <div className="text-[11px] text-muted-foreground" data-testid="policy-hint">{POLICY_MSG}</div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ripeti la password</Label>
                <PasswordInput
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                  required
                  data-testid="input-recupero-pw2"
                />
              </div>

              {err && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm" data-testid="recupero-error">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{err}</span>
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90" data-testid="btn-recupero-submit">
                <KeyRound className="w-4 h-4 mr-2" />
                {loading ? "Aggiornamento…" : "Reimposta password"}
              </Button>

              <Link to="/login" className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 pt-2" data-testid="link-back-login-recupero">
                <ArrowLeft className="w-3 h-3" />
                Torna al login
              </Link>
            </form>
          )}
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Gestionale GEBnautica · Cantiere Nautico
        </p>
      </div>
    </div>
  );
}
