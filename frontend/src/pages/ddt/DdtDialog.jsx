import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileText, Save, Tag } from "lucide-react";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { Field, EMPTY_DEST, ddtPayload, openBlob } from "./common";
import DestinatarioFields from "./DestinatarioFields";
import RubricaPicker from "./RubricaPicker";
import RigheEditor from "./RigheEditor";

export default function DdtDialog({ value, indirizzi, onReloadRubrica, onClose, onSaved }) {
  const [form, setForm] = useState(value);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState("ddt.pdf");
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickCes = (a) => setForm((f) => ({ ...f, cessionario: { nome: a.nome, indirizzo: a.indirizzo, cap: a.cap, citta: a.citta, provincia: a.provincia, telefono: a.telefono }, codice_cliente: f.codice_cliente || a.codice_cliente || "" }));
  const pickDest = (a) => set("destinazione", { nome: a.nome, indirizzo: a.indirizzo, cap: a.cap, citta: a.citta, provincia: a.provincia, telefono: a.telefono });

  const valid = () => { if (!form.cessionario?.nome?.trim()) { toast.error("Inserisci il cessionario"); return false; } return true; };

  const preview = async (kind) => {
    if (!valid()) return;
    try {
      const url = kind === "ddt" ? "/ddt/preview-pdf" : "/ddt/preview-foglio-destinazione";
      setPreviewName(kind === "ddt" ? `DDT_${form.numero || "nuovo"}_${form.anno}.pdf` : `Foglio_destinazione_${(form.cessionario.nome || "").replace(/[^a-zA-Z0-9]+/g, "_")}.pdf`);
      await openBlob(api, "post", url, ddtPayload(form), setPreviewUrl, setPreviewOpen);
    } catch (e) { toast.error(e.response?.data?.detail || "Errore anteprima"); }
  };

  const save = async () => {
    if (!valid()) return;
    setSaving(true);
    try {
      if (form.id) await api.put(`/ddt/${form.id}`, ddtPayload(form));
      else await api.post("/ddt", ddtPayload(form));
      toast.success("DDT salvato"); onSaved(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] xl:max-w-6xl" data-testid="dialog-ddt">
        <DialogHeader>
          <DialogTitle>{form.id ? `DDT n. ${form.numero}/${form.anno}` : "Nuovo DDT"}</DialogTitle>
          <DialogDescription>Compila il documento di trasporto; il foglio di destinazione si genera automaticamente dai dati del destinatario.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 md:max-h-[70vh] md:overflow-y-auto md:pr-2">
          <Card className="p-4">
            <div className="label-mini mb-2">Documento</div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
              <Field label="Numero"><Input type="number" value={form.numero ?? ""} onChange={(e) => set("numero", e.target.value)} placeholder="auto" data-testid="ddt-numero" /></Field>
              <Field label="Anno"><Input type="number" value={form.anno || ""} onChange={(e) => set("anno", e.target.value)} data-testid="ddt-anno" /></Field>
              <Field label="Data"><Input type="date" value={form.data || ""} onChange={(e) => set("data", e.target.value)} data-testid="ddt-data" /></Field>
              <Field label="Codice cliente"><Input value={form.codice_cliente || ""} onChange={(e) => set("codice_cliente", e.target.value)} /></Field>
              <Field label="Rif. ordine"><Input value={form.rif_ordine || ""} onChange={(e) => set("rif_ordine", e.target.value)} /></Field>
              <Field label="Cond. pagamento"><Input value={form.condizioni_pagamento || ""} onChange={(e) => set("condizioni_pagamento", e.target.value)} /></Field>
            </div>
          </Card>

          <Card className="p-4 space-y-3">
            <div className="label-mini">Cessionario</div>
            <RubricaPicker indirizzi={indirizzi} value={form.cessionario} onPick={pickCes} onSaved={onReloadRubrica} prefix="ces" />
            <DestinatarioFields value={form.cessionario || EMPTY_DEST} onChange={(v) => set("cessionario", v)} prefix="ces" />
          </Card>

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="label-mini">Destinazione merce</div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!form.destinazione_idem} onCheckedChange={(v) => set("destinazione_idem", !!v)} data-testid="ddt-idem" /> Idem (stessa del cessionario)</label>
            </div>
            {!form.destinazione_idem && (
              <>
                <RubricaPicker indirizzi={indirizzi} value={form.destinazione} onPick={pickDest} onSaved={onReloadRubrica} prefix="dest" />
                <DestinatarioFields value={form.destinazione || EMPTY_DEST} onChange={(v) => set("destinazione", v)} prefix="dest" />
              </>
            )}
          </Card>

          <Card className="p-4">
            <div className="label-mini mb-2">Merce</div>
            <RigheEditor righe={form.righe || []} onChange={(r) => set("righe", r)} />
          </Card>

          <Card className="p-4">
            <div className="label-mini mb-2">Trasporto</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Causale"><Input value={form.causale || ""} onChange={(e) => set("causale", e.target.value)} data-testid="ddt-causale" /></Field>
              <Field label="Porto"><Input value={form.porto || ""} onChange={(e) => set("porto", e.target.value)} /></Field>
              <Field label="Colli"><Input type="number" value={form.colli ?? ""} onChange={(e) => set("colli", e.target.value)} /></Field>
              <Field label="Peso"><Input value={form.peso || ""} onChange={(e) => set("peso", e.target.value)} placeholder="es. 10 kg" /></Field>
              <Field label="Data / ora inizio trasporto"><Input value={form.data_ora_trasporto || ""} onChange={(e) => set("data_ora_trasporto", e.target.value)} /></Field>
              <Field label="Vettore"><Input value={form.vettore || ""} onChange={(e) => set("vettore", e.target.value)} /></Field>
              <Field label="Aspetto beni"><Input value={form.aspetto_beni || ""} onChange={(e) => set("aspetto_beni", e.target.value)} /></Field>
              <Field label="Note DDT"><Input value={form.note || ""} onChange={(e) => set("note", e.target.value)} /></Field>
            </div>
          </Card>

          <Card className="p-4 border-primary/30 bg-primary/5">
            <div className="label-mini mb-2 flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Foglio di destinazione — note aggiuntive</div>
            <Textarea rows={3} value={form.note_destinazione || ""} onChange={(e) => set("note_destinazione", e.target.value)} placeholder="Es. Fragile · Consegnare al piano · Chiamare prima della consegna" data-testid="ddt-note-dest" />
          </Card>
        </div>

        <PdfPreviewOverlay open={previewOpen} onClose={() => setPreviewOpen(false)} url={previewUrl} filename={previewName} />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => preview("ddt")} data-testid="btn-preview-ddt"><FileText className="w-4 h-4 mr-2" /> Anteprima DDT</Button>
          <Button variant="outline" onClick={() => preview("foglio")} data-testid="btn-preview-foglio"><Tag className="w-4 h-4 mr-2" /> Foglio di destinazione</Button>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary" data-testid="btn-save-ddt"><Save className="w-4 h-4 mr-2" /> {saving ? "Salvataggio…" : "Salva DDT"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
