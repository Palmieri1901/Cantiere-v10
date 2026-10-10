import { useState } from "react";
import { useNavigate, useLocation, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PasswordInput from "@/components/PasswordInput";
import { Sailboat, LogIn, AlertCircle, KeyRound } from "lucide-react";

function formatError(detail) {
  if (!detail) return "Errore imprevisto";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => e?.msg || JSON.stringify(e)).join(" · ");
  return String(detail);
}

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (user && user !== false) return <Navigate to={loc.state?.from || "/"} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(password);
      nav(loc.state?.from || "/", { replace: true });
    } catch (e) {
      setErr(formatError(e.response?.data?.detail) || "Impossibile accedere");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/40 to-background grid place-items-center px-4" data-testid="login-page">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-lg bg-primary text-primary-foreground grid place-items-center mb-4">
            <Sailboat className="w-8 h-8" strokeWidth={1.8} />
          </div>
          <div className="label-mini mb-1">Gestione Cantiere</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Gestionale GEBnautica</h1>
        </div>

        <Card className="p-8">
          <h2 className="font-display text-2xl font-semibold mb-1">Accedi</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Inserisci la password per entrare nel gestionale.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password</Label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                data-testid="input-login-password"
              />
            </div>

            {err && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm" data-testid="login-error">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary/90"
              data-testid="btn-login"
            >
              <LogIn className="w-4 h-4 mr-2" />
              {loading ? "Accesso…" : "Accedi"}
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/recupero-pin"
                className="text-xs text-muted-foreground hover:text-primary underline-offset-4 hover:underline inline-flex items-center gap-1"
                data-testid="link-forgot-password"
              >
                <KeyRound className="w-3 h-3" />
                Password dimenticata? Usa il PIN di recupero
              </Link>
            </div>
          </form>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Gestionale GEBnautica · Cantiere Nautico
        </p>
      </div>
    </div>
  );
}
