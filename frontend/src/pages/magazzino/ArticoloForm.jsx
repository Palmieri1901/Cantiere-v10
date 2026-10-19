import { useEffect, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Camera, X, Image as ImageIcon, Package } from "lucide-react";
import { EMPTY_ART, FormField } from "./common";
import { BarcodeButton } from "@/components/BarcodeButton";

export default function ArticoloForm({ open, onOpenChange, value, fornitori, onSaved }) {
  const [form, setForm] = useState(EMPTY_ART);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(value ? { ...EMPTY_ART, ...value, fornitore_id: value.fornitore_id || null } : { ...EMPTY_ART });
  }, [open, value]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Immagine max 2MB"); return; }
    const r = new FileReader();
    r.onload = () => set("immagine_base64", r.result);
    r.readAsDataURL(file);
  };

  const isCf = ["cf", "conf", "confezione", "pacco", "scatola"].includes((form.unita_misura || "").toLowerCase());
  const save = async () => {
    if (!form.nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    if (isCf && !(Number(form.pezzi_confezione) >= 1)) { toast.error("Indica quanti pezzi contiene la confezione"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        fornitore_id: form.fornitore_id || null,
        prezzo_acquisto: Number(form.prezzo_acquisto || 0),
        prezzo_listino: Number(form.prezzo_listino || 0),
        quantita: Number(form.quantita || 0),
        scorta_minima: Number(form.scorta_minima || 0),
        pezzi_confezione: Number(form.pezzi_confezione || 0),
      };
      if (form.id) {
        await api.put(`/magazzino/articoli/${form.id}`, payload);
        toast.success("Articolo aggiornato");
      } else {
        await api.post("/magazzino/articoli", payload);
        toast.success("Articolo creato");
      }
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-articolo">
        <DialogHeader>
          <DialogTitle>{form.id ? "Modifica articolo" : "Nuovo articolo"}</DialogTitle>
          <DialogDescription>Compila i dettagli dell'accessorio.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          <FormField label="Codice">
            <Input value={form.codice} onChange={(e) => set("codice", e.target.value)} data-testid="input-codice" />
          </FormField>
          <FormField label="Codice a barre (EAN)">
            <div className="flex gap-2">
              <Input value={form.barcode || ""} onChange={(e) => set("barcode", e.target.value)} placeholder="Scansiona o digita" className="font-mono-num" data-testid="input-barcode" />
              <BarcodeButton label="" size="icon" onCode={(c) => set("barcode", c)} testId="btn-barcode-articolo" />
            </div>
          </FormField>
          <FormField label="Fornitore">
            <Select value={form.fornitore_id || "none"} onValueChange={(v) => set("fornitore_id", v === "none" ? null : v)}>
              <SelectTrigger data-testid="input-fornitore"><SelectValue placeholder="Nessuno" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nessuno —</SelectItem>
                {fornitori.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Nome articolo *" full>
            <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} data-testid="input-nome" />
          </FormField>
          <FormField label="Descrizione" full>
            <Textarea rows={2} value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} data-testid="input-descrizione" />
          </FormField>
          <FormField label="Categoria">
            <Input value={form.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="es. Ferramenta" data-testid="input-categoria" />
          </FormField>
          <FormField label="Unità di misura *" full>
            <div className="flex flex-wrap gap-1.5" data-testid="um-selector">
              {[
                { v: "pz", l: "Pezzi (pz)" },
                { v: "lt", l: "Litri (lt)" },
                { v: "kg", l: "Chilogrammi (kg)" },
                { v: "mt", l: "Metri (mt)" },
                { v: "mq", l: "Metri quadri (mq)" },
                { v: "rotolo", l: "Rotolo" },
                { v: "cf", l: "Confezione (cf)" },
                { v: "cad", l: "Cadauno (cad)" },
                { v: "set", l: "Set" },
                { v: "paio", l: "Paio" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => set("unita_misura", o.v)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    form.unita_misura === o.v
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-border"
                  }`}
                  data-testid={`um-btn-${o.v}`}
                >
                  {o.l}
                </button>
              ))}
              <Input
                value={form.unita_misura || ""}
                onChange={(e) => set("unita_misura", e.target.value)}
                placeholder="Altro…"
                className="h-8 w-24 text-xs"
                data-testid="input-um"
              />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5">
              Seleziona a cosa si riferisce il prezzo. Verrà mostrato ovunque accanto ai valori (es. €/{form.unita_misura || "pz"}).
            </div>
          </FormField>
          <FormField label={`Prezzo acquisto € / ${form.unita_misura || "pz"}`}>
            <Input type="number" step="0.01" value={form.prezzo_acquisto} onChange={(e) => set("prezzo_acquisto", e.target.value)} data-testid="input-prezzo-acquisto" />
          </FormField>
          {isCf && (
            <FormField label="Pezzi per confezione *" full>
              <Input type="number" min="1" step="1" value={form.pezzi_confezione || ""} onChange={(e) => set("pezzi_confezione", e.target.value)} placeholder="es. 12" data-testid="input-pezzi-confezione" />
              <div className="text-[11px] text-muted-foreground mt-1.5" data-testid="hint-pezzi-confezione">
                Il prezzo indicato è a confezione: al salvataggio verrà convertito a pezzo (÷ {Number(form.pezzi_confezione) || "…"}) e la giacenza in pezzi (× {Number(form.pezzi_confezione) || "…"}).
                {Number(form.pezzi_confezione) > 0 && <> Acquisto {(Number(form.prezzo_acquisto || 0) / Number(form.pezzi_confezione)).toFixed(3)} €/pz · vendita {(Number(form.prezzo_listino || 0) / Number(form.pezzi_confezione)).toFixed(2)} €/pz.</>}
              </div>
            </FormField>
          )}
          <FormField label={`Prezzo vendita € / ${form.unita_misura || "pz"}`}>
            <Input type="number" step="0.01" value={form.prezzo_listino} onChange={(e) => set("prezzo_listino", e.target.value)} data-testid="input-prezzo-listino" />
          </FormField>
          <FormField label={`Prezzo vendita IVA inc. (22%) € / ${form.unita_misura || "pz"}`} full>
            <Input
              type="text"
              readOnly
              tabIndex={-1}
              value={(Number(form.prezzo_listino || 0) * 1.22).toFixed(2)}
              className="bg-muted/40 font-mono-num text-primary font-semibold cursor-not-allowed"
              data-testid="input-prezzo-listino-iva"
            />
          </FormField>
          <FormField label="Ricarico % (modificabile)" full>
            {(() => {
              const pa = Number(form.prezzo_acquisto || 0);
              const pv = Number(form.prezzo_listino || 0);
              const calcolato = pa > 0 && pv > 0 ? ((pv - pa) / pa) * 100 : null;
              const displayed = calcolato !== null ? calcolato.toFixed(1) : "";
              const onRicaricoChange = (val) => {
                const num = parseFloat(val);
                if (Number.isNaN(num)) return;
                if (pa > 0) {
                  const nuovoPv = +(pa * (1 + num / 100)).toFixed(2);
                  set("prezzo_listino", nuovoPv);
                } else {
                  set("_ricarico_atteso", num);
                  toast.info("Imposta prima il prezzo di acquisto per calcolare la vendita");
                }
              };
              return (
                <div className="relative">
                  <Input
                    type="number"
                    step="0.1"
                    placeholder={pa > 0 ? "es. 30" : "Inserisci prezzo acquisto per calcolare"}
                    value={displayed || form._ricarico_atteso || ""}
                    onChange={(e) => onRicaricoChange(e.target.value)}
                    className="pr-8 font-mono-num"
                    data-testid="input-ricarico"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              );
            })()}
          </FormField>
          {(() => {
            const pa = Number(form.prezzo_acquisto || 0);
            const pv = Number(form.prezzo_listino || 0);
            if (pa <= 0 || pv <= 0) return null;
            const rk = ((pv - pa) / pa) * 100;
            const marg = pv - pa;
            return (
              <div className="md:col-span-2 flex items-center justify-between rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Ricarico calcolato</span>
                <span className="font-mono-num font-semibold text-primary">
                  {rk >= 0 ? "+" : ""}{rk.toFixed(1)}% · margine {fmtEuro(marg)}
                </span>
              </div>
            );
          })()}
          <FormField label="Foto articolo" full>
            <div className="flex items-center gap-3">
              {form.immagine_base64 ? (
                <div className="relative">
                  <img src={form.immagine_base64} alt="" className="w-20 h-20 rounded object-cover border" />
                  <button type="button" onClick={() => set("immagine_base64", "")} className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-0.5" data-testid="btn-remove-img">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-20 h-20 rounded border border-dashed border-border grid place-items-center text-muted-foreground">
                  <ImageIcon className="w-6 h-6 opacity-40" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" hidden onChange={onImage} data-testid="input-image" />
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 border border-input rounded-md text-sm hover:bg-muted">
                    <ImageIcon className="w-3.5 h-3.5" /> Da file
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" capture="environment" hidden onChange={onImage} data-testid="input-image-camera" />
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 border border-input rounded-md text-sm hover:bg-muted">
                    <Camera className="w-3.5 h-3.5" /> Scatta foto
                  </span>
                </label>
              </div>
            </div>
          </FormField>
          <FormField label="Note" full>
            <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} data-testid="input-note" />
          </FormField>

          <div className="md:col-span-2 border-t border-border/60 pt-3 mt-1">
            <button
              type="button"
              onClick={() => set("_showInv", !form._showInv)}
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              data-testid="btn-toggle-inv"
            >
              <Package className="w-3.5 h-3.5" />
              Inventario (opzionale) {form._showInv ? "▾" : "▸"}
              {(Number(form.quantita) > 0 || Number(form.scorta_minima) > 0) && (
                <Badge variant="secondary" className="text-[10px] ml-1">
                  {Number(form.quantita) || 0} {form.unita_misura || "pz"}
                </Badge>
              )}
            </button>
            {form._showInv && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <FormField label="Quantità in giacenza">
                  <Input type="number" step="0.01" value={form.quantita} onChange={(e) => set("quantita", e.target.value)} data-testid="input-quantita" />
                </FormField>
                <FormField label="Scorta minima (alert)">
                  <Input type="number" step="0.01" value={form.scorta_minima} onChange={(e) => set("scorta_minima", e.target.value)} data-testid="input-scorta" />
                </FormField>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90" data-testid="btn-save-articolo">
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
