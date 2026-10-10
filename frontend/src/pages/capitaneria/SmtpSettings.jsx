import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";

const Fld = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
    {children}
  </div>
);

export default function SmtpSettings({ onChanged }) {
  const [s, setS] = useState(null);
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/capitaneria/smtp").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));

  const salva = async () => {
    setBusy(true);
    try {
      const r = await api.put("/capitaneria/smtp", { ...s, password: pwd || null });
      setS(r.data); setPwd(""); toast.success("Casella di posta salvata"); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); }
    finally { setBusy(false); }
  };
  const prova = async () => {
    setBusy(true);
    const t = toast.loading("Invio email di prova…");
    try {
      await api.put("/capitaneria/smtp", { ...s, password: pwd || null });
      const r = await api.post("/capitaneria/smtp/test", null, { timeout: 60000 });
      toast.success(`Email di prova inviata a ${r.data.inviata_a}: controlla la casella`, { id: t });
      setPwd(""); const g = await api.get("/capitaneria/smtp"); setS(g.data); onChanged?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Invio di prova fallito", { id: t, duration: 9000 }); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-4 rounded-md border border-border bg-muted/20 space-y-4" data-testid="cap-smtp-box">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="label-mini flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Casella di posta per l'invio (SMTP)</div>
          <p className="text-xs text-muted-foreground mt-1">Con la tua casella attiva, la mail parte dal tuo indirizzo e il PDF viene allegato. Gmail: usa una "password per le app"; Aruba: smtps.aruba.it porta 465.</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={!!s.attivo} onCheckedChange={(v) => set("attivo", v)} data-testid="cap-smtp-attivo" /> Attiva
        </label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2"><Fld label="Server SMTP"><Input value={s.host} placeholder="es. smtp.gmail.com" onChange={(e) => set("host", e.target.value)} data-testid="cap-smtp-host" /></Fld></div>
        <Fld label="Porta"><Input type="number" value={s.port} onChange={(e) => set("port", Number(e.target.value))} data-testid="cap-smtp-port" /></Fld>
        <Fld label="Utente (login)"><Input value={s.user} placeholder="es. info@gebnautica.it" onChange={(e) => set("user", e.target.value)} data-testid="cap-smtp-user" /></Fld>
        <Fld label={s.password_impostata ? "Password (lascia vuoto per non cambiarla)" : "Password"}>
          <Input type="password" value={pwd} placeholder={s.password_impostata ? "••••••••" : ""} onChange={(e) => setPwd(e.target.value)} data-testid="cap-smtp-password" autoComplete="new-password" />
        </Fld>
        <Fld label="Indirizzo mittente"><Input type="email" value={s.from_email} placeholder="se diverso dall'utente" onChange={(e) => set("from_email", e.target.value)} data-testid="cap-smtp-from" /></Fld>
      </div>
      <div className="flex gap-2 flex-wrap justify-end">
        <Button variant="outline" onClick={prova} disabled={busy || !s.host} data-testid="cap-smtp-test"><Send className="w-4 h-4 mr-2" /> Salva e invia email di prova</Button>
        <Button onClick={salva} disabled={busy} data-testid="cap-smtp-salva">Salva casella</Button>
      </div>
    </div>
  );
}
