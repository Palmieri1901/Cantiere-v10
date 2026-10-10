import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { POLICY, POLICY_MSG } from "@/lib/passwordPolicy";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import { Sailboat, KeyRound, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";

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

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!pin.trim()) { setErr(modo === "super" ? "Inserisci la super password" : "Inserisci il PIN di recupero"); return; }
    if (!POLICY.test(pw1)) { setErr(POLICY_MSG); return; }
    if (pw1 !== pw2) { setErr("Le due password non coincidono"); return; }
    setLoading(true);
    try {
      if (modo === "super") await api.post("/auth/master-reset", { master_password: pin, new_password: pw1 });
      else await api.post("/auth/pin-reset", { pin: pin.trim(), new_password: pw1 });
      setDone(true);
      await refresh();
      setTimeout(() => nav("/", { replace: true }), 1500);
    } catch (e) {
      setErr(formatError(e.response?.data?.detail) || "Impossibile aggiornare la password");
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
            Inserisci il tuo PIN di recupero master e imposta una nuova password.
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
                <div className="flex gap-2 text-xs mb-1">
                  <button type="button" onClick={() => { setModo("pin"); setPin(""); }} className={`px-2.5 py-1.5 rounded-md border ${modo === "pin" ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`} data-testid="btn-modo-pin">PIN di recupero</button>
                  <button type="button" onClick={() => { setModo("super"); setPin(""); }} className={`px-2.5 py-1.5 rounded-md border ${modo === "super" ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`} data-testid="btn-modo-super">Super password</button>
                </div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{modo === "super" ? "Super password" : "PIN di recupero"}</Label>
                <Input
                  type={modo === "super" ? "password" : "text"}
                  inputMode={modo === "super" ? "text" : "numeric"}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder={modo === "super" ? "Super password del titolare" : "es. 347260"}
                  required
                  autoFocus
                  autoComplete="off"
                  data-testid="input-recupero-pin"
                />
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
