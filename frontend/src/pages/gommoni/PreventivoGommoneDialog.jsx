import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { FileText, Save, Plus, Trash2 } from "lucide-react";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { CATEGORIE, Field, fmt, numOrZero, parseModello, prezzoAccessorio } from "./common";

const Select = ({ value, onChange, children, testid }) => (
  <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={onChange} data-testid={testid}>{children}</select>
);

export default function PreventivoGommoneDialog({ value, gommoni, accessori, motori, sconti, iva = 22, onClose, onSaved }) {
  const [form, setForm] = useState(value);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const pickGommone = (gid) => {
    const g = gommoni.find((x) => x.id === gid);
    if (!g) { set("gommone_id", ""); return; }
    setForm((f) => ({
      ...f, gommone_id: gid, modello: g.modello, lunghezza_m: g.lunghezza_m, larghezza_m: g.larghezza_m,
      diametro_tubolare_cm: g.diametro_tubolare_cm, compartimenti: g.compartimenti, portata_persone: g.portata_persone,
      potenza_max_hp: g.potenza_max_hp, peso_kg: g.peso_kg, carena: g.carena, tessuto: g.tessuto, dotazioni: g.dotazioni, lunghezza_interna_cm: g.lunghezza_interna_cm, categoria_ce: g.categoria_ce, potenza_min_hp: g.potenza_min_hp, specchio: g.specchio,
      prezzo_gommone: g.prezzo_pubblico || 0,
      accessori_serie: [...(g.accessori_serie || [])],
    }));
  };
  const pickTipo = (t) => setForm((f) => ({ ...f, tipo_cliente: t, sconto_perc: Number(sconti?.[t]) || 0 }));
  const pickMotore = (mid) => {
    const m = motori.find((x) => x.id === mid);
    if (!m) { setForm((f) => ({ ...f, motore_modello: "", motore_prezzo: 0 })); return; }
    setForm((f) => ({ ...f, motore_modello: `Suzuki ${m.modello}`, motore_prezzo: m.prezzo_offerta || m.prezzo_pubblico || 0 }));
  };
  const { taglia, serie } = parseModello(form.modello || "");
  const accessoriDisponibili = accessori.filter((a) => (!a.serie || !serie || a.serie === serie) && !(form.accessori_serie || []).includes(a.nome));
  const addAccessorio = (aid) => {
    const a = accessori.find((x) => x.id === aid);
    if (!a) return;
    const netto = taglia ? (prezzoAccessorio(a, taglia) ?? 0) : (a.prezzo || 0);
    const diSerie = netto === 0 && (a.di_serie || []).includes(taglia);
    const prezzoIncl = diSerie ? 0 : Math.round((netto || 0) * (1 + iva / 100) * 100) / 100;
    setForm((f) => ({ ...f, accessori: [...(f.accessori || []), { accessorio_id: a.id, nome: diSerie ? `${a.nome} (di serie)` : a.nome, prezzo: prezzoIncl, quantita: 1 }] }));
  };
  const updAcc = (i, k, v) => setForm((f) => ({ ...f, accessori: f.accessori.map((a, idx) => idx === i ? { ...a, [k]: v } : a) }));
  const delAcc = (i) => setForm((f) => ({ ...f, accessori: f.accessori.filter((_, idx) => idx !== i) }));

  const calc = useMemo(() => {
    const pub = numOrZero(form.prezzo_gommone);
    const sconto = pub * numOrZero(form.sconto_perc) / 100;
    const acc = (form.accessori || []).reduce((s, a) => s + numOrZero(a.prezzo) * (numOrZero(a.quantita) || 1), 0);
    const motore = numOrZero(form.motore_prezzo) * (1 - numOrZero(form.motore_sconto_perc) / 100);
    const montaggio = numOrZero(form.montaggio);
    const cavetteria = numOrZero(form.cavetteria);
    const batteria = numOrZero(form.batteria);
    return { pub, sconto, netto: pub - sconto, acc, motore, montaggio, cavetteria, batteria, totale: pub - sconto + acc + motore + montaggio + cavetteria + batteria };
  }, [form]);

  const payload = () => ({
    ...form, prezzo_gommone: numOrZero(form.prezzo_gommone), sconto_perc: numOrZero(form.sconto_perc),
    motore_prezzo: numOrZero(form.motore_prezzo), motore_sconto_perc: numOrZero(form.motore_sconto_perc), montaggio: numOrZero(form.montaggio), cavetteria: numOrZero(form.cavetteria), batteria: numOrZero(form.batteria),
    lunghezza_m: numOrZero(form.lunghezza_m), larghezza_m: numOrZero(form.larghezza_m), diametro_tubolare_cm: numOrZero(form.diametro_tubolare_cm),
    compartimenti: Math.round(numOrZero(form.compartimenti)), portata_persone: Math.round(numOrZero(form.portata_persone)),
    potenza_max_hp: numOrZero(form.potenza_max_hp), peso_kg: numOrZero(form.peso_kg), lunghezza_interna_cm: numOrZero(form.lunghezza_interna_cm), potenza_min_hp: numOrZero(form.potenza_min_hp),
    accessori: (form.accessori || []).map((a) => ({ ...a, prezzo: numOrZero(a.prezzo), quantita: Math.max(1, Math.round(numOrZero(a.quantita) || 1)) })),
  });
  const valid = () => { if (!form.cliente_nome?.trim() || !form.modello?.trim()) { toast.error("Cliente e modello obbligatori"); return false; } return true; };

  const anteprima = async () => {
    if (!valid()) return;
    try {
      const res = await api.post("/gommoni/preventivi/preview-pdf", payload(), { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      setPreviewOpen(true);
    } catch (e) { toast.error(e.response?.data?.detail || "Errore anteprima"); }
  };
  const save = async () => {
    if (!valid()) return;
    setSaving(true);
    try {
      if (form.id) await api.put(`/gommoni/preventivi/${form.id}`, payload());
      else await api.post("/gommoni/preventivi", payload());
      toast.success("Preventivo salvato"); onSaved(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] xl:max-w-6xl" data-testid="dialog-preventivo-gommone">
        <DialogHeader>
          <DialogTitle>{form.id ? `Preventivo ${form.numero || ""}` : "Nuovo preventivo gommone GEB"}</DialogTitle>
          <DialogDescription>Gommone + accessori optional + motore Suzuki opzionale.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <Card className="p-4">
            <div className="label-mini mb-2">Cliente</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Nome e cognome *"><Input value={form.cliente_nome || ""} onChange={(e) => set("cliente_nome", e.target.value)} data-testid="pg-nome" /></Field>
              <Field label="Telefono"><Input value={form.cliente_telefono || ""} onChange={(e) => set("cliente_telefono", e.target.value)} /></Field>
              <Field label="Email"><Input value={form.cliente_email || ""} onChange={(e) => set("cliente_email", e.target.value)} /></Field>
              <Field label="Tipologia cliente">
                <Select value={form.tipo_cliente || "privati"} onChange={(e) => pickTipo(e.target.value)} testid="pg-tipo">
                  {CATEGORIE.map((c) => <option key={c.key} value={c.key}>{c.label} ({Number(sconti?.[c.key]) || 0}%)</option>)}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="p-4">
            <div className="label-mini mb-2">Gommone</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Seleziona dal catalogo">
                <Select value={form.gommone_id || ""} onChange={(e) => pickGommone(e.target.value)} testid="pg-select-gommone">
                  <option value="">— seleziona —</option>
                  {gommoni.map((g) => <option key={g.id} value={g.id}>{g.modello}{g.lunghezza_m ? ` · ${g.lunghezza_m} m` : ""}</option>)}
                </Select>
              </Field>
              <Field label="Modello *"><Input value={form.modello || ""} onChange={(e) => set("modello", e.target.value)} data-testid="pg-modello" /></Field>
              <Field label="Prezzo pubblico € (IVA incl.)"><Input type="number" step="0.01" value={form.prezzo_gommone || ""} onChange={(e) => set("prezzo_gommone", e.target.value)} data-testid="pg-prezzo" /></Field>
              <Field label="Sconto (%)"><Input type="number" step="0.5" value={form.sconto_perc || ""} onChange={(e) => set("sconto_perc", e.target.value)} data-testid="pg-sconto" /></Field>
              <Field label="Lunghezza (m)"><Input type="number" step="0.01" value={form.lunghezza_m || ""} onChange={(e) => set("lunghezza_m", e.target.value)} /></Field>
              <Field label="Larghezza (m)"><Input type="number" step="0.01" value={form.larghezza_m || ""} onChange={(e) => set("larghezza_m", e.target.value)} /></Field>
              <Field label="Ø tubolare (cm)"><Input type="number" value={form.diametro_tubolare_cm || ""} onChange={(e) => set("diametro_tubolare_cm", e.target.value)} /></Field>
              <Field label="Compartimenti"><Input type="number" value={form.compartimenti || ""} onChange={(e) => set("compartimenti", e.target.value)} /></Field>
              <Field label="Portata persone"><Input type="number" value={form.portata_persone || ""} onChange={(e) => set("portata_persone", e.target.value)} /></Field>
              <Field label="Potenza max (HP)"><Input type="number" value={form.potenza_max_hp || ""} onChange={(e) => set("potenza_max_hp", e.target.value)} /></Field>
              <Field label="Potenza min (HP)"><Input type="number" value={form.potenza_min_hp || ""} onChange={(e) => set("potenza_min_hp", e.target.value)} /></Field>
              <Field label="Misura interna (cm)"><Input type="number" value={form.lunghezza_interna_cm || ""} onChange={(e) => set("lunghezza_interna_cm", e.target.value)} /></Field>
              <Field label="Categoria CE"><Input value={form.categoria_ce || ""} onChange={(e) => set("categoria_ce", e.target.value)} /></Field>
              <Field label="Specchio"><Input value={form.specchio || ""} onChange={(e) => set("specchio", e.target.value)} /></Field>
              <Field label="Peso (kg)"><Input type="number" value={form.peso_kg || ""} onChange={(e) => set("peso_kg", e.target.value)} /></Field>
              <Field label="Carena"><Input value={form.carena || ""} onChange={(e) => set("carena", e.target.value)} /></Field>
              <div className="col-span-2"><Field label="Tessuto"><Input value={form.tessuto || ""} onChange={(e) => set("tessuto", e.target.value)} /></Field></div>
              <div className="col-span-2 md:col-span-4"><Field label="Dotazioni di serie"><Textarea rows={2} value={form.dotazioni || ""} onChange={(e) => set("dotazioni", e.target.value)} /></Field></div>
              {(form.accessori_serie || []).length > 0 && (
                <div className="col-span-2 md:col-span-4 text-xs rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2" data-testid="pg-accessori-serie">
                  <b className="text-emerald-800">Accessori di serie inclusi:</b> {form.accessori_serie.join(", ")}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="label-mini">Accessori optional</div>
              <Select value="" onChange={(e) => addAccessorio(e.target.value)} testid="pg-add-accessorio">
                <option value="">+ Aggiungi accessorio{serie ? ` (serie ${serie}${taglia ? ` · ${taglia}` : ""})` : ""}…</option>
                {accessoriDisponibili.map((a) => {
                  const n = taglia ? prezzoAccessorio(a, taglia) : a.prezzo;
                  const diSerie = taglia && (a.di_serie || []).includes(taglia);
                  return <option key={a.id} value={a.id}>{a.nome} — {diSerie ? "di serie" : n ? `${fmt(n * (1 + iva / 100))} IVA incl.` : "prezzo da inserire"}</option>;
                })}
              </Select>
            </div>
            {(form.accessori || []).length === 0 ? <div className="text-xs text-muted-foreground">Nessun accessorio aggiunto.</div> : (
              <table className="w-full text-sm">
                <tbody>
                  {form.accessori.map((a, i) => (
                    <tr key={i} className="border-t border-border/50" data-testid={`pg-acc-row-${i}`}>
                      <td className="py-1.5 pr-2"><Input className="h-8" value={a.nome} onChange={(e) => updAcc(i, "nome", e.target.value)} /></td>
                      <td className="py-1.5 pr-2 w-20"><Input className="h-8 text-right" type="number" min="1" value={a.quantita} onChange={(e) => updAcc(i, "quantita", e.target.value)} /></td>
                      <td className="py-1.5 pr-2 w-32"><Input className="h-8 text-right" type="number" step="0.01" value={a.prezzo} onChange={(e) => updAcc(i, "prezzo", e.target.value)} /></td>
                      <td className="py-1.5 w-28 text-right font-mono-num">{fmt(numOrZero(a.prezzo) * (numOrZero(a.quantita) || 1))}</td>
                      <td className="py-1.5 w-8 text-right"><button onClick={() => delAcc(i)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-4">
            <div className="label-mini mb-2">Motore Suzuki (opzionale)</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Dal catalogo Suzuki">
                <Select value="" onChange={(e) => pickMotore(e.target.value)} testid="pg-select-motore">
                  <option value="">— seleziona —</option>
                  {motori.map((m) => <option key={m.id} value={m.id}>{m.modello} · {m.potenza_hp} HP</option>)}
                </Select>
              </Field>
              <Field label="Motore"><Input value={form.motore_modello || ""} onChange={(e) => set("motore_modello", e.target.value)} data-testid="pg-motore" /></Field>
              <Field label="Prezzo € (IVA incl.)"><Input type="number" step="0.01" value={form.motore_prezzo || ""} onChange={(e) => set("motore_prezzo", e.target.value)} /></Field>
              <Field label="Sconto motore (%)"><Input type="number" step="0.5" value={form.motore_sconto_perc || ""} onChange={(e) => set("motore_sconto_perc", e.target.value)} /></Field>
              <Field label="Montaggio e collaudo € (IVA incl.)"><Input type="number" step="0.01" value={form.montaggio || ""} onChange={(e) => set("montaggio", e.target.value)} data-testid="pg-montaggio" /></Field>
              <Field label="Cavetterie e comandi € (IVA incl.)"><Input type="number" step="0.01" value={form.cavetteria || ""} onChange={(e) => set("cavetteria", e.target.value)} data-testid="pg-cavetteria" /></Field>
              <Field label="Batteria € (IVA incl.)"><Input type="number" step="0.01" value={form.batteria || ""} onChange={(e) => set("batteria", e.target.value)} data-testid="pg-batteria" /></Field>
            </div>
          </Card>

          <div className="text-sm space-y-1 bg-muted/40 rounded-md p-3">
            <div className="flex justify-between"><span>Prezzo pubblico gommone</span><span className="font-mono-num">{fmt(calc.pub)}</span></div>
            {calc.sconto > 0 && <div className="flex justify-between text-muted-foreground"><span>Sconto ({form.sconto_perc}%)</span><span className="font-mono-num">− {fmt(calc.sconto)}</span></div>}
            <div className="flex justify-between font-semibold border-t pt-1"><span>Netto gommone</span><span className="font-mono-num">{fmt(calc.netto)}</span></div>
            {calc.acc > 0 && <div className="flex justify-between"><span>Accessori</span><span className="font-mono-num">+ {fmt(calc.acc)}</span></div>}
            {calc.motore > 0 && <div className="flex justify-between"><span>Motore</span><span className="font-mono-num">+ {fmt(calc.motore)}</span></div>}
            {calc.montaggio > 0 && <div className="flex justify-between"><span>Montaggio e collaudo</span><span className="font-mono-num">+ {fmt(calc.montaggio)}</span></div>}
            {calc.cavetteria > 0 && <div className="flex justify-between"><span>Cavetterie e comandi</span><span className="font-mono-num">+ {fmt(calc.cavetteria)}</span></div>}
            {calc.batteria > 0 && <div className="flex justify-between"><span>Batteria</span><span className="font-mono-num">+ {fmt(calc.batteria)}</span></div>}
            <div className="flex justify-between font-bold text-primary text-base border-t pt-1"><span>Totale IVA inclusa</span><span className="font-mono-num" data-testid="pg-totale">{fmt(calc.totale)}</span></div>
          </div>
          <Field label="Note"><Textarea value={form.note || ""} onChange={(e) => set("note", e.target.value)} rows={2} /></Field>
        </div>

        <PdfPreviewOverlay open={previewOpen} onClose={() => setPreviewOpen(false)} url={previewUrl}
          filename={`preventivo_gommone_${(form.cliente_nome || "cliente").replace(/[^a-zA-Z0-9]+/g, "_")}_${form.numero || "bozza"}.pdf`} />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={anteprima} data-testid="btn-preview-gommone"><FileText className="w-4 h-4 mr-2" /> Anteprima PDF</Button>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary" data-testid="btn-save-prev-gommone"><Save className="w-4 h-4 mr-2" /> {saving ? "Salvataggio…" : "Salva preventivo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
