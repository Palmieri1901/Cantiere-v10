import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { X, Save, Sparkles } from "lucide-react";
import { Field, gommonePayload } from "./common";
import ListaAccessori from "./ListaAccessori";

export default function GommoneDialog({ value, onClose, onSaved }) {
  const [form, setForm] = useState({ ...value, accessori_serie: value.accessori_serie || [], accessori_optional: value.accessori_optional?.length ? value.accessori_optional : (value.dotazioni ? value.dotazioni.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean) : []) });
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const fileRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !form.id;

  const scanScheda = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setScanning(true);
    try {
      const buf = await f.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
      const r = await api.post("/gommoni/import-ai-scheda", { file_base64: b64, file_name: f.name });
      const c = r.data.caratteristiche || {};
      setForm((prev) => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(c)) if (k in next && v !== "" && v !== 0 && v != null) next[k] = v;
        return next;
      });
      toast.success(`${Object.keys(c).length} caratteristiche rilevate — controlla e salva`);
    } catch (err) { toast.error(err.response?.data?.detail || "Errore rilevamento AI"); }
    finally { setScanning(false); }
  };

  const save = async () => {
    if (!form.modello?.trim()) { toast.error("Nome modello obbligatorio"); return; }
    setSaving(true);
    try {
      const payload = gommonePayload(form);
      if (isNew) await api.post("/gommoni/modelli", payload);
      else await api.put(`/gommoni/modelli/${form.id}`, payload);
      toast.success("Gommone salvato");
      onSaved(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore salvataggio");
    } finally { setSaving(false); }
  };

  const num = (k, label, step = "0.01", testid) => (
    <Field label={label}><Input type="number" step={step} value={form[k] || ""} onChange={(e) => set(k, e.target.value)} data-testid={testid} /></Field>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl" data-testid="dialog-gommone">
        <DialogHeader>
          <DialogTitle>{isNew ? "Nuovo gommone GEB" : "Modifica gommone"}</DialogTitle>
          <DialogDescription>Caratteristiche tecniche e prezzo pubblico (IVA inclusa).</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <div className="text-xs flex-1">Carica la <b>scheda tecnica</b> (PDF o foto): l'AI compila automaticamente le caratteristiche qui sotto.</div>
          <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={scanScheda} data-testid="in-scheda-ai" />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={scanning} data-testid="btn-scheda-ai">
            <Sparkles className="w-3.5 h-3.5 mr-1.5" /> {scanning ? "Analisi in corso…" : "Rileva caratteristiche con AI"}
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          <div className="col-span-2"><Field label="Modello *"><Input value={form.modello || ""} onChange={(e) => set("modello", e.target.value)} placeholder="GEB 620 Open" data-testid="g-modello" /></Field></div>
          {num("prezzo_pubblico", "Prezzo pubblico € (IVA incl.)", "0.01", "g-prezzo")}
          {num("ordine", "Ordine listino", "1")}
          {num("lunghezza_m", "Lunghezza (m)", "0.01", "g-lunghezza")}
          {num("larghezza_m", "Larghezza (m)", "0.01")}
          {num("diametro_tubolare_cm", "Ø tubolare (cm)", "1")}
          {num("compartimenti", "Compartimenti", "1")}
          {num("portata_persone", "Portata persone", "1")}
          {num("potenza_max_hp", "Potenza max (HP)", "1")}
          {num("peso_kg", "Peso (kg)", "1")}
          <Field label="Carena"><Input value={form.carena || ""} onChange={(e) => set("carena", e.target.value)} placeholder="VTR" /></Field>
          {num("lunghezza_interna_cm", "Misura interna (cm)", "1")}
          {num("potenza_min_hp", "Potenza min (HP)", "1")}
          <Field label="Categoria CE"><Input value={form.categoria_ce || ""} onChange={(e) => set("categoria_ce", e.target.value)} placeholder="C" /></Field>
          <Field label="Specchio di poppa"><Input value={form.specchio || ""} onChange={(e) => set("specchio", e.target.value)} placeholder="L / XL / XXL" /></Field>
          <div className="col-span-2 md:col-span-4"><Field label="Materiale / tessuto tubolare"><Input value={form.tessuto || ""} onChange={(e) => set("tessuto", e.target.value)} placeholder="H (Hypalon) / PVC" /></Field></div>
          <ListaAccessori titolo="Accessori di serie" endpoint="dotazioni-serie" valori={form.accessori_serie} onChange={(v) => set("accessori_serie", v)} colore="emerald" testId="g-serie" />
          <ListaAccessori titolo="Accessori optional" endpoint="accessori-optional-voci" valori={form.accessori_optional} onChange={(v) => set("accessori_optional", v)} colore="sky" testId="g-optional" />
          <div className="col-span-2 md:col-span-4"><Field label="Note"><Textarea value={form.note || ""} onChange={(e) => set("note", e.target.value)} rows={2} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="w-4 h-4 mr-2" /> Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary" data-testid="btn-save-gommone">
            <Save className="w-4 h-4 mr-2" /> {saving ? "Salvataggio…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
