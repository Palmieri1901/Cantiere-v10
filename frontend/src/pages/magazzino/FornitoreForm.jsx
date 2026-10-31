import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { FormField } from "./common";

export default function FornitoreForm({ open, onOpenChange, value, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [initialRicarico, setInitialRicarico] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (open) {
      const init = { nome: "", abbreviazione: "", user: "", password: "", note: "", ...value };
      setForm(init);
      setInitialRicarico(init.ricarico_default_percent ?? null);
      setShowPassword(false);
    }
  }, [open, value]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.nome?.trim()) { toast.error("Nome obbligatorio"); return; }
    setSaving(true);
    try {
      let saved;
      if (form.id) {
        const r = await api.put(`/magazzino/fornitori/${form.id}`, form);
        saved = r.data;
      } else {
        const r = await api.post("/magazzino/fornitori", form);
        saved = r.data;
      }
      toast.success("Fornitore salvato");
      const newRic = saved?.ricarico_default_percent ?? null;
      const ricaricoChanged = !!form.id && Number(newRic) !== Number(initialRicarico) && newRic != null;
      onSaved(saved, ricaricoChanged);
    } catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-fornitore">
        <DialogHeader><DialogTitle>{form.id ? "Modifica fornitore" : "Nuovo fornitore"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Nome *" full><Input value={form.nome || ""} onChange={(e) => set("nome", e.target.value)} data-testid="forn-input-nome" /></FormField>
          <FormField label="Sigla (min 3)">
            <Input maxLength={5} minLength={3} value={form.abbreviazione || ""} onChange={(e) => set("abbreviazione", e.target.value)} placeholder="es. Osc, Fni, MTM" data-testid="forn-input-sigla" />
          </FormField>
          <FormField label="User" full>
            <Input autoComplete="off" value={form.user || ""} onChange={(e) => set("user", e.target.value)} placeholder="Nome utente area riservata fornitore" data-testid="forn-input-user" />
          </FormField>
          <FormField label="Password" full>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password || ""}
                onChange={(e) => set("password", e.target.value)}
                placeholder="Password portale fornitore"
                className="pr-9 font-mono"
                data-testid="forn-input-password"
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1} aria-label={showPassword ? "Nascondi" : "Mostra"}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </FormField>
          <FormField label="Ricarico % predefinito">
            <div className="relative">
              <Input
                type="number" step="0.1"
                placeholder="es. 30"
                value={form.ricarico_default_percent ?? ""}
                onChange={(e) => set("ricarico_default_percent", e.target.value === "" ? null : Number(e.target.value))}
                className="pr-8 font-mono-num"
                data-testid="forn-input-ricarico"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
          </FormField>
          <FormField label="IVA %">
            <div className="relative">
              <Input
                type="number" step="1" min="0"
                value={form.iva_percent ?? 22}
                onChange={(e) => set("iva_percent", e.target.value === "" ? 22 : Number(e.target.value))}
                className="pr-8 font-mono-num"
                data-testid="forn-input-iva"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
          </FormField>
          <div className="text-[11px] text-muted-foreground col-span-2 -mt-1" data-testid="forn-hint-ricarico">
            Prezzo finito = acquisto netto × (1 + ricarico%) × (1 + IVA%). Il ricalcolo del listino e i nuovi articoli da DDT usano questi due valori; gli articoli con ricarico impostato a mano non vengono toccati.
            {form.ricarico_default_percent != null && (() => {
              const r = Number(form.ricarico_default_percent) || 0, i = Number(form.iva_percent ?? 22) || 0;
              const netto = 100 * (1 + r / 100), fin = netto * (1 + i / 100);
              return <div className="mt-1 font-mono-num text-foreground" data-testid="forn-esempio-ricarico">Esempio: acquisto 100,00 € → +{r}% = {netto.toFixed(2)} € → +IVA {i}% = <b>{fin.toFixed(2)} €</b> finito (ricarico totale +{(fin - 100).toFixed(1)}%)</div>;
            })()}
          </div>
          <FormField label="Note" full><Textarea rows={2} value={form.note || ""} onChange={(e) => set("note", e.target.value)} /></FormField>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90" data-testid="btn-save-fornitore">{saving ? "Salvataggio…" : "Salva"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
