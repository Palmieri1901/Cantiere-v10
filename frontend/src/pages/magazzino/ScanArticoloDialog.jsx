import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Camera, X, Upload } from "lucide-react";
import { EMPTY_ART } from "./common";

export default function ScanArticoloDialog({ open, onOpenChange, fornitori, onDone }) {
  const [image, setImage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_ART);

  useEffect(() => {
    if (open) { setImage(""); setResult(null); setForm(EMPTY_ART); }
  }, [open]);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { toast.error("Foto max 4MB"); return; }
    const r = new FileReader();
    r.onload = () => setImage(r.result);
    r.readAsDataURL(file);
  };

  const scan = async () => {
    if (!image) return;
    setScanning(true);
    try {
      const { data } = await api.post("/magazzino/scan-articolo", { image_base64: image }, { timeout: 120000 });
      setResult(data);
      setForm({ ...EMPTY_ART, ...data, immagine_base64: image, quantita: 1 });
      toast.success("Dati estratti dalla foto");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossibile analizzare la foto");
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!form.nome.trim()) { toast.error("Nome obbligatorio"); return; }
    setSaving(true);
    try {
      await api.post("/magazzino/articoli", {
        ...form,
        prezzo_acquisto: Number(form.prezzo_acquisto || 0),
        prezzo_listino: Number(form.prezzo_listino || 0),
        quantita: Number(form.quantita || 0),
        scorta_minima: Number(form.scorta_minima || 0),
      });
      toast.success("Articolo salvato");
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" data-testid="dialog-scan-articolo">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Scan articolo con AI
          </DialogTitle>
          <DialogDescription>
            Carica una foto dell'articolo o della sua etichetta: l'AI estrae codice, nome, descrizione e prezzo. Poi rivedi e salva.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-1">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Foto articolo</Label>
            <div className="mt-2">
              {image ? (
                <div className="relative">
                  <img src={image} alt="" className="w-full rounded-md border max-h-64 object-contain bg-muted/20" />
                  <button type="button" onClick={() => { setImage(""); setResult(null); }} className="absolute top-2 right-2 bg-destructive text-white rounded-full p-1" data-testid="btn-scan-remove-img">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block cursor-pointer border-2 border-dashed border-border rounded-md p-6 text-center hover:bg-muted/30 transition">
                    <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <div className="text-sm font-semibold">Da file</div>
                    <div className="text-xs text-muted-foreground mt-1">JPG/PNG · max 4MB</div>
                    <input type="file" accept="image/*" hidden onChange={onFile} data-testid="input-scan-file" />
                  </label>
                  <label className="block cursor-pointer border-2 border-dashed border-border rounded-md p-6 text-center hover:bg-muted/30 transition">
                    <Camera className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                    <div className="text-sm font-semibold">Scatta foto</div>
                    <div className="text-xs text-muted-foreground mt-1">Fotocamera del dispositivo</div>
                    <input type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid="input-scan-camera" />
                  </label>
                </div>
              )}
            </div>
            <Button
              onClick={scan}
              disabled={!image || scanning}
              className="w-full mt-3 bg-primary hover:bg-primary/90"
              data-testid="btn-scan-run"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {scanning ? "Analisi in corso…" : "Analizza con AI"}
            </Button>
          </div>

          <div className={result ? "" : "opacity-50 pointer-events-none"}>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Dati estratti (modificabili)</Label>
            <div className="space-y-2 mt-2">
              <Input value={form.codice} onChange={(e) => set("codice", e.target.value)} placeholder="Codice" data-testid="scan-input-codice" />
              <Input value={form.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Nome *" data-testid="scan-input-nome" />
              <Textarea rows={2} value={form.descrizione} onChange={(e) => set("descrizione", e.target.value)} placeholder="Descrizione" data-testid="scan-input-desc" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={form.categoria} onChange={(e) => set("categoria", e.target.value)} placeholder="Categoria" />
                <Select value={form.fornitore_id || "none"} onValueChange={(v) => set("fornitore_id", v === "none" ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Fornitore" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Nessuno —</SelectItem>
                    {fornitori.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Input type="number" step="0.01" value={form.prezzo_listino} onChange={(e) => set("prezzo_listino", e.target.value)} placeholder="Prezzo €" />
                <Input type="number" step="0.01" value={form.quantita} onChange={(e) => set("quantita", e.target.value)} placeholder="Q.tà" />
                <Input type="number" step="0.01" value={form.scorta_minima} onChange={(e) => set("scorta_minima", e.target.value)} placeholder="Scorta" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
          <Button
            onClick={save}
            disabled={!result || saving || !form.nome.trim()}
            className="bg-primary hover:bg-primary/90"
            data-testid="btn-scan-save"
          >
            {saving ? "Salvataggio…" : "Salva articolo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
