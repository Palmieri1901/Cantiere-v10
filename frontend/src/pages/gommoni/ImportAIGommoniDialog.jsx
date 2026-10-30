import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Save, Trash2 } from "lucide-react";
import { gommonePayload } from "./common";

const COLS = [
  ["modello", "Modello", "text"], ["lunghezza_m", "Lungh. m", "number"], ["larghezza_m", "Largh. m", "number"],
  ["diametro_tubolare_cm", "Ø cm", "number"], ["compartimenti", "Comp.", "number"], ["portata_persone", "Pers.", "number"], ["potenza_max_hp", "HP max", "number"],
  ["peso_kg", "Peso kg", "number"], ["carena", "Carena", "text"], ["tessuto", "Tessuto", "text"], ["dotazioni", "Accessori optional", "text"], ["prezzo_pubblico", "Prezzo €", "number"],
];

export default function ImportAIGommoniDialog({ open, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const reset = () => { setFile(null); setRows([]); };

  const scan = async () => {
    if (!file) { toast.error("Seleziona un file (PDF o immagine)"); return; }
    setScanning(true);
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
      const r = await api.post("/gommoni/import-ai", { file_base64: b64, file_name: file.name });
      setRows(r.data.modelli || []);
      if (!r.data.modelli?.length) toast.warning("Nessun gommone trovato nel file");
      else toast.success(`${r.data.modelli.length} gommoni trovati — controlla e conferma`);
    } catch (e) { toast.error(e.response?.data?.detail || "Errore scansione AI"); }
    finally { setScanning(false); }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await api.post("/gommoni/modelli/bulk", { modelli: rows.map(gommonePayload) });
      toast.success(`${rows.length} gommoni importati`);
      onSaved(); reset(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); }
    finally { setSaving(false); }
  };

  const updateRow = (i, k, v) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-[95vw] xl:max-w-7xl" data-testid="dialog-import-gommoni">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" /> Rilevamento listino gommoni con AI</DialogTitle>
          <DialogDescription>Carica listino o schede tecniche (PDF o immagine). L'AI estrae modelli, caratteristiche e prezzi: rivedi e conferma prima di salvare.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">File</Label>
              <Input type="file" accept=".pdf,image/*" onChange={(e) => { setRows([]); setFile(e.target.files?.[0] || null); }} className="mt-1.5" data-testid="input-import-gommoni-file" />
            </div>
            <Button onClick={scan} disabled={!file || scanning} className="bg-primary" data-testid="btn-scan-gommoni">
              <Sparkles className="w-4 h-4 mr-2" /> {scanning ? "Analisi in corso…" : "Analizza con AI"}
            </Button>
          </div>
          {rows.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[45vh] overflow-auto">
                <table className="w-full text-xs" data-testid="table-import-gommoni">
                  <thead className="bg-muted/30 sticky top-0"><tr>{COLS.map(([k, l]) => <th key={k} className="text-left p-2">{l}</th>)}<th className="w-8"></th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        {COLS.map(([k, , type]) => (
                          <td key={k} className="p-1"><Input className={`h-7 text-xs ${type === "number" ? "text-right font-mono w-16" : k === "dotazioni" ? "min-w-[220px]" : "min-w-[110px]"}`} type={type} step="0.01" value={r[k] ?? ""} onChange={(e) => updateRow(i, k, e.target.value)} /></td>
                        ))}
                        <td className="p-1 text-center"><button onClick={async () => { if (await confirmDialog("Escludere questa riga dall'importazione?", { okLabel: "Escludi" })) setRows((rs) => rs.filter((_, idx) => idx !== i)); }} data-testid={`import-ai-del-${i}`} className="text-destructive hover:opacity-70"><Trash2 className="w-3.5 h-3.5" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Annulla</Button>
          {rows.length > 0 && (
            <Button onClick={saveAll} disabled={saving} className="bg-primary" data-testid="btn-import-gommoni-save">
              <Save className="w-4 h-4 mr-2" /> {saving ? "Salvataggio…" : `Salva ${rows.length} gommoni`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
