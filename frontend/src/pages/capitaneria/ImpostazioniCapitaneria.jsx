import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { PORTI } from "./ComunicazioneForm";

const CAMPI = [
  ["ordinanza", "Riferimento ordinanza (predefinito)"],
  ["dichiarante", "Dichiarante"], ["ditta", "Ditta"], ["ditta_sede", "Sede"], ["ditta_via", "Via"],
  ["resp_nome", "Responsabile: nome"], ["resp_cognome", "Responsabile: cognome"], ["resp_nato_a", "Nato/a a"], ["resp_nato_il", "Nato/a il"],
  ["resp_qualifica", "Qualifica"], ["resp_cellulare", "Cellulare"], ["firma_localita", "Località firma"],
  ["email_mittente", "Nome mittente email (intestazione)"],
];

export default function ImpostazioniCapitaneria({ open, onClose, settings, onSaved }) {
  const [s, setS] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setS(settings); }, [open, settings]);
  if (!s) return null;
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }));
  const setPorto = (p, k, v) => setS((prev) => ({ ...prev, porti: { ...prev.porti, [p]: { ...prev.porti[p], [k]: v } } }));
  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put("/capitaneria/impostazioni", s);
      onSaved(r.data); toast.success("Impostazioni salvate"); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="cap-impostazioni-dialog">
        <DialogHeader>
          <DialogTitle>Impostazioni comunicazioni Capitaneria</DialogTitle>
          <DialogDescription>Dati precompilati nei nuovi moduli e indirizzi email degli uffici per l'invio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {CAMPI.map(([k, label]) => (
              <div key={k} className={`space-y-1.5 ${k === "ordinanza" ? "md:col-span-2" : ""}`}>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
                <Input type={k === "resp_nato_il" ? "date" : "text"} value={s[k] ?? ""} onChange={(e) => set(k, e.target.value)} data-testid={`cap-set-${k.replace(/_/g, "-")}`} />
              </div>
            ))}
          </div>
          {Object.entries(PORTI).map(([p, info]) => (
            <div key={p} className="p-4 rounded-md border border-border bg-muted/20 space-y-3">
              <div className="label-mini">{info.nome}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email ufficio (destinatario)</Label>
                  <Input type="email" value={s.porti?.[p]?.email ?? ""} onChange={(e) => setPorto(p, "email", e.target.value)} data-testid={`cap-set-email-${p.replace(/_/g, "-")}`} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ufficio Locale Marittimo</Label>
                  <Input value={s.porti?.[p]?.ufficio_locale_marittimo ?? ""} onChange={(e) => setPorto(p, "ufficio_locale_marittimo", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delegazione di Spiaggia</Label>
                  <Input value={s.porti?.[p]?.delegazione_spiaggia ?? ""} onChange={(e) => setPorto(p, "delegazione_spiaggia", e.target.value)} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} data-testid="cap-set-salva">{saving ? "Salvataggio…" : "Salva"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
