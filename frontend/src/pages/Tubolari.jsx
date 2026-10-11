import { useEffect, useMemo, useState } from "react";
import { api, API, fmtEuro } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Ship, Save, Settings2, AlertTriangle, Copy, FileText,
} from "lucide-react";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";

const STATO_LABELS = {
  bozza: { label: "Bozza", cls: "bg-muted text-muted-foreground" },
  inviato: { label: "Inviato", cls: "bg-blue-500/15 text-blue-700" },
  accettato: { label: "Accettato", cls: "bg-emerald-500/15 text-emerald-700" },
  rifiutato: { label: "Rifiutato", cls: "bg-destructive/15 text-destructive" },
};

const EMPTY_PREV = {
  cliente_nome: "", cliente_telefono: "", cliente_email: "",
  marca_gommone: "", modello_gommone: "", metri: 0,
  tessuto: "hypalon",
  prezzo_al_metro: 1250, supplemento_orca: 357,
  include_rifinitura_strisciato: false, prezzo_rifinitura_strisciato: 382.5,
  include_bottazzo_doppio: false, prezzo_bottazzo_doppio: 357,
  include_pezze_velocita: false, prezzo_pezze_velocita: 0,
  maniglioni_aggiuntivi: 0, prezzo_maniglione: 50,
  scritte_loghi_laser: false, prezzo_scritte_loghi: 0,
  colori_tubo_differenti: false, prezzo_colori_tubo_differenti: 0,
  grafiche_particolari: false, prezzo_grafiche_particolari: 0,
  rinforzi_diving: false, prezzo_rinforzi_diving: 0,
  note: "", stato: "bozza",
  data: new Date().toISOString().slice(0, 10),
};

export default function Tubolari() {
  const [preventivi, setPreventivi] = useState([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewName, setPreviewName] = useState("preventivo.pdf");
  const [previewLoadingId, setPreviewLoadingId] = useState(null);

  const openPreviewFromList = async (p) => {
    setPreviewLoadingId(p.id);
    try {
      const res = await api.get(`/tubolari/preventivi/${p.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      setPreviewName(`preventivo_tubolari_${(p.cliente_nome || "cliente").replace(/[^a-zA-Z0-9]+/g, "_")}_${p.numero || p.id.slice(0, 6)}.pdf`);
      setPreviewOpen(true);
    } catch {
      toast.error("Errore apertura PDF");
    } finally { setPreviewLoadingId(null); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.get("/tubolari/preventivi"),
        api.get("/tubolari/config"),
      ]);
      setPreventivi(pRes.data || []);
      setConfig(cRes.data);
    } catch (e) {
      toast.error("Errore caricamento tubolari");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const nuovo = () => {
    const base = {
      ...EMPTY_PREV,
      prezzo_al_metro: config?.prezzo_al_metro ?? 1250,
      supplemento_orca: config?.supplemento_orca ?? 357,
      prezzo_rifinitura_strisciato: config?.rifinitura_interna_strisciato ?? 382.5,
      prezzo_bottazzo_doppio: config?.bottazzo_doppio_90mm ?? 357,
      prezzo_pezze_velocita: config?.apposizione_pezze_velocita ?? 0,
      prezzo_scritte_loghi: config?.scritte_loghi_taglio_laser ?? 0,
      prezzo_colori_tubo_differenti: config?.colori_tubo_differenti ?? 0,
      prezzo_maniglione: config?.maniglione_aggiuntivo_cad ?? 50,
    };
    setEditing(base);
    setFormOpen(true);
  };

  const duplica = (p) => {
    const { id, numero, created_at, updated_at, totale, ...rest } = p;
    setEditing({ ...rest, stato: "bozza", data: new Date().toISOString().slice(0, 10) });
    setFormOpen(true);
  };

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/tubolari/preventivi/${confirmDelete.id}`);
      toast.success("Preventivo eliminato");
      setConfirmDelete(null);
      load();
    } catch {
      toast.error("Errore eliminazione");
    }
  };

  const stats = useMemo(() => {
    const n = preventivi.length;
    const val = preventivi.reduce((s, p) => s + Number(p.totale || 0), 0);
    const accettati = preventivi.filter((p) => p.stato === "accettato").length;
    return { n, val, accettati };
  }, [preventivi]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6" data-testid="page-tubolari">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-3">
            <Ship className="w-8 h-8 text-primary" />
            Rifacimento Tubolari
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Preventivi per sostituzione tubolari di gommoni con calcolo automatico e PDF.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setConfigOpen(true)} data-testid="btn-tubolari-config">
            <Settings2 className="w-4 h-4 mr-1.5" /> Prezzi & Impostazioni
          </Button>
          <Button onClick={nuovo} className="bg-primary hover:bg-primary/90" data-testid="btn-tubolari-nuovo">
            <Plus className="w-4 h-4 mr-1.5" /> Nuovo preventivo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Preventivi totali</div>
          <div className="text-2xl font-bold mt-1 font-mono-num" data-testid="stat-tot">{stats.n}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Accettati</div>
          <div className="text-2xl font-bold mt-1 font-mono-num text-emerald-600" data-testid="stat-acc">{stats.accettati}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-muted-foreground tracking-wider">Valore complessivo</div>
          <div className="text-2xl font-bold mt-1 font-mono-num text-primary" data-testid="stat-val">{fmtEuro(stats.val)}</div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead className="w-[110px]">N°</TableHead>
                <TableHead className="w-[110px]">Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Gommone</TableHead>
                <TableHead className="text-center">Metri</TableHead>
                <TableHead className="text-center">Tessuto</TableHead>
                <TableHead className="text-right">Totale € (+iva)</TableHead>
                <TableHead className="text-center">Stato</TableHead>
                <TableHead className="text-right w-[160px]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Caricamento…</TableCell></TableRow>}
              {!loading && preventivi.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground" data-testid="empty-tubolari">
                    Nessun preventivo. Clicca "Nuovo preventivo" per iniziare.
                  </TableCell>
                </TableRow>
              )}
              {preventivi.map((p) => {
                const s = STATO_LABELS[p.stato] || STATO_LABELS.bozza;
                return (
                  <TableRow key={p.id} data-testid={`row-prev-${p.id}`}>
                    <TableCell className="font-mono text-xs">{p.numero || "—"}</TableCell>
                    <TableCell className="text-sm">{formatData(p.data)}</TableCell>
                    <TableCell className="font-medium">
                      {p.cliente_nome || "—"}
                      {p.cliente_telefono && <div className="text-xs text-muted-foreground">{p.cliente_telefono}</div>}
                    </TableCell>
                    <TableCell>
                      {p.marca_gommone || "—"} {p.modello_gommone}
                    </TableCell>
                    <TableCell className="text-center font-mono-num">{Number(p.metri).toFixed(1)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={p.tessuto === "orca" ? "default" : "secondary"} className="uppercase text-xs">
                        {p.tessuto}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono-num font-semibold text-primary">{fmtEuro(p.totale)}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={`${s.cls} font-medium`}>{s.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Anteprima PDF" onClick={() => openPreviewFromList(p)} disabled={previewLoadingId === p.id} data-testid={`btn-pdf-${p.id}`}>
                        <FileText className="w-4 h-4 text-primary" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => duplica(p)} title="Duplica" data-testid={`btn-dup-${p.id}`}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setFormOpen(true); }} title="Modifica" data-testid={`btn-edit-${p.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(p)} title="Elimina" data-testid={`btn-del-${p.id}`}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <PreventivoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        value={editing}
        onSaved={() => { setFormOpen(false); load(); }}      />

      <TubolariConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        value={config}
        onSaved={() => { setConfigOpen(false); load(); }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Elimina preventivo
            </AlertDialogTitle>
            <AlertDialogDescription>
              Vuoi davvero eliminare il preventivo <b>{confirmDelete?.numero}</b> per{" "}
              <b>{confirmDelete?.cliente_nome || "cliente"}</b>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="btn-del-conferma">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PdfPreviewOverlay
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        url={previewUrl}
        filename={previewName}
      />
    </div>
  );
}

// ============================================================================
// FORM PREVENTIVO
// ============================================================================
function PreventivoForm({ open, onOpenChange, value, onSaved }) {
  const [form, setForm] = useState(EMPTY_PREV);
  const [initial, setInitial] = useState(EMPTY_PREV);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (open) {
      const init = { ...EMPTY_PREV, ...(value || {}) };
      setForm(init);
      setInitial(init);
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
      setPreviewOpen(false);
    }
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Rileva modifiche non salvate confrontando i valori significativi
  const isDirty = useMemo(() => {
    const keys = Object.keys(form || {});
    return keys.some((k) => {
      if (k === "totale" || k === "updated_at" || k === "created_at") return false;
      const a = form[k];
      const b = initial[k];
      if (typeof a === "number" || typeof b === "number") return Number(a || 0) !== Number(b || 0);
      return (a ?? "") !== (b ?? "");
    });
  }, [form, initial]);

  const attemptClose = () => {
    if (isDirty && !saving) {
      setConfirmClose(true);
    } else {
      onOpenChange(false);
    }
  };

  const totale = useMemo(() => {
    const metri = Number(form.metri || 0);
    let t = Number(form.prezzo_al_metro || 0) * metri;
    if (form.tessuto === "orca") t += Number(form.supplemento_orca || 0) * metri;
    if (form.include_rifinitura_strisciato) t += Number(form.prezzo_rifinitura_strisciato || 0) * metri;
    if (form.include_bottazzo_doppio) t += Number(form.prezzo_bottazzo_doppio || 0) * metri;
    if (form.include_pezze_velocita) t += Number(form.prezzo_pezze_velocita || 0);
    if (form.maniglioni_aggiuntivi > 0) t += Number(form.maniglioni_aggiuntivi) * Number(form.prezzo_maniglione || 0);
    if (form.scritte_loghi_laser) t += Number(form.prezzo_scritte_loghi || 0);
    if (form.colori_tubo_differenti) t += Number(form.prezzo_colori_tubo_differenti || 0);
    if (form.grafiche_particolari) t += Number(form.prezzo_grafiche_particolari || 0);
    if (form.rinforzi_diving) t += Number(form.prezzo_rinforzi_diving || 0);
    return t;
  }, [form]);

  const base = Number(form.prezzo_al_metro || 0) * Number(form.metri || 0);

  // Generazione anteprima PDF SOLO SU RICHIESTA (nessun auto-save/auto-preview)
  const generaAnteprima = async () => {
    if (!form.marca_gommone || !Number(form.metri)) {
      toast.error("Inserisci almeno marca gommone e metri");
      return;
    }
    setPreviewLoading(true);
    try {
      const payload = {
        ...form,
        metri: Number(form.metri),
        maniglioni_aggiuntivi: parseInt(form.maniglioni_aggiuntivi || 0, 10),
      };
      const res = await api.post("/tubolari/preview-pdf", payload, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      setPreviewOpen(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore generazione anteprima");
    } finally {
      setPreviewLoading(false);
    }
  };

  const save = async () => {
    if (!form.cliente_nome?.trim()) { toast.error("Nome cliente obbligatorio"); return; }
    if (!Number(form.metri) || Number(form.metri) <= 0) { toast.error("Metri obbligatori"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        metri: Number(form.metri),
        maniglioni_aggiuntivi: parseInt(form.maniglioni_aggiuntivi || 0, 10),
      };
      if (form.id) {
        await api.put(`/tubolari/preventivi/${form.id}`, payload);
        toast.success("Preventivo aggiornato");
      } else {
        await api.post("/tubolari/preventivi", payload);
        toast.success("Preventivo creato");
      }
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) attemptClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="dialog-prev-tubolari" onEscapeKeyDown={(e) => { if (isDirty) { e.preventDefault(); attemptClose(); } }} onPointerDownOutside={(e) => { if (isDirty) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2 flex-wrap">
              <Ship className="w-5 h-5 text-primary" />
              {form.id ? `Modifica preventivo ${form.numero || ""}` : "Nuovo preventivo tubolari"}
              {isDirty && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium" data-testid="badge-unsaved">● Modifiche non salvate</span>}
            </span>
            <div className="flex items-center gap-2 mr-8">
              <Button
                variant="outline"
                size="sm"
                onClick={generaAnteprima}
                disabled={previewLoading}
                data-testid="btn-genera-anteprima"
              >
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                {previewLoading ? "Generazione…" : "Anteprima PDF"}
              </Button>
            </div>
          </DialogTitle>
          <DialogDescription>
            Compila i dati: il totale si aggiorna in tempo reale.{" "}
            <b>Nulla viene salvato o esportato finché non premi "Salva preventivo" o "Anteprima PDF"</b>
            {form.id ? "" : "; il numero progressivo viene assegnato al salvataggio."}
          </DialogDescription>
        </DialogHeader>

        {/* Cliente */}
        <Section title="Cliente">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Nome / Ragione sociale *"><Input value={form.cliente_nome} onChange={(e) => set("cliente_nome", e.target.value)} data-testid="prev-nome" /></Field>
            <Field label="Telefono"><Input value={form.cliente_telefono} onChange={(e) => set("cliente_telefono", e.target.value)} data-testid="prev-tel" /></Field>
            <Field label="Email"><Input value={form.cliente_email} onChange={(e) => set("cliente_email", e.target.value)} data-testid="prev-email" /></Field>
          </div>
        </Section>

        {/* Gommone */}
        <Section title="Gommone">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Marca *"><Input value={form.marca_gommone} onChange={(e) => set("marca_gommone", e.target.value)} placeholder="es. BWA" data-testid="prev-marca" /></Field>
            <Field label="Modello"><Input value={form.modello_gommone} onChange={(e) => set("modello_gommone", e.target.value)} placeholder="es. 500 GT" data-testid="prev-modello" /></Field>
            <Field label="Metri *"><Input type="number" step="0.1" value={form.metri} onChange={(e) => set("metri", e.target.value)} data-testid="prev-metri" /></Field>
            <Field label="Data preventivo"><Input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} data-testid="prev-data" /></Field>
          </div>
        </Section>

        {/* Tessuto */}
        <Section title="Tessuto (materiale)">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <Field label="Tessuto">
              <Select value={form.tessuto} onValueChange={(v) => set("tessuto", v)}>
                <SelectTrigger data-testid="prev-tessuto"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hypalon">Neoprene Hypalon 1° scelta Novurania (incluso)</SelectItem>
                  <SelectItem value="orca">Tessuto ORCA (+ supplemento)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Prezzo €/Mt (Hypalon)"><Input type="number" step="0.01" value={form.prezzo_al_metro} onChange={(e) => set("prezzo_al_metro", Number(e.target.value))} data-testid="prev-pxm" /></Field>
            <Field label="Supplemento ORCA €/Mt"><Input type="number" step="0.01" value={form.supplemento_orca} onChange={(e) => set("supplemento_orca", Number(e.target.value))} disabled={form.tessuto !== "orca"} data-testid="prev-orca" /></Field>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            <b>Base:</b> {fmtEuro(form.prezzo_al_metro)}/Mt × {Number(form.metri || 0).toFixed(1)} Mt = <b>{fmtEuro(base)}</b>
            {form.tessuto === "orca" && <> + supplemento ORCA {fmtEuro(form.supplemento_orca)}/Mt × {Number(form.metri || 0).toFixed(1)} Mt = <b>{fmtEuro(Number(form.supplemento_orca || 0) * Number(form.metri || 0))}</b></>}
          </div>
        </Section>

        {/* Extra */}
        <Section title="Lavorazioni extra">
          <ExtraRow label="A) Rifinitura interna strisciato (al metro lineare)" flag={form.include_rifinitura_strisciato} setFlag={(v) => set("include_rifinitura_strisciato", v)} price={form.prezzo_rifinitura_strisciato} setPrice={(v) => set("prezzo_rifinitura_strisciato", v)} suffix="€/Mt" testId="extra-B" totalCalc={Number(form.prezzo_rifinitura_strisciato || 0) * Number(form.metri || 0)} />
          <ExtraRow label="B) Bottazzo doppio h 90 mm (al metro lineare)" flag={form.include_bottazzo_doppio} setFlag={(v) => set("include_bottazzo_doppio", v)} price={form.prezzo_bottazzo_doppio} setPrice={(v) => set("prezzo_bottazzo_doppio", v)} suffix="€/Mt" testId="extra-C" totalCalc={Number(form.prezzo_bottazzo_doppio || 0) * Number(form.metri || 0)} />
          <ExtraRow label="D) Apposizione pezze velocità coni dx-sx" flag={form.include_pezze_velocita} setFlag={(v) => set("include_pezze_velocita", v)} price={form.prezzo_pezze_velocita} setPrice={(v) => set("prezzo_pezze_velocita", v)} placeholder="da valutare" testId="extra-D" />

          <div className="flex items-center gap-3 py-2 border-t border-border/60">
            <div className="flex-1">E) Maniglioni aggiuntivi</div>
            <Input type="number" min="0" step="1" className="w-20 text-right" value={form.maniglioni_aggiuntivi} onChange={(e) => set("maniglioni_aggiuntivi", parseInt(e.target.value || "0", 10))} data-testid="extra-manig-qty" />
            <span className="text-xs text-muted-foreground">×</span>
            <Input type="number" step="0.01" className="w-24 text-right font-mono-num" value={form.prezzo_maniglione} onChange={(e) => set("prezzo_maniglione", Number(e.target.value))} data-testid="extra-manig-price" />
            <span className="text-xs text-muted-foreground">€/cad</span>
            <span className="w-24 text-right font-mono-num font-semibold text-primary">{fmtEuro((form.maniglioni_aggiuntivi || 0) * (form.prezzo_maniglione || 0))}</span>
          </div>

          <ExtraRow label="Scritte / Loghi con taglio laser" flag={form.scritte_loghi_laser} setFlag={(v) => set("scritte_loghi_laser", v)} price={form.prezzo_scritte_loghi} setPrice={(v) => set("prezzo_scritte_loghi", v)} placeholder="da valutare" testId="extra-scritte" />
          <ExtraRow label="Colori tubo differenti / graffiati (carbon, perlage…)" flag={form.colori_tubo_differenti} setFlag={(v) => set("colori_tubo_differenti", v)} price={form.prezzo_colori_tubo_differenti} setPrice={(v) => set("prezzo_colori_tubo_differenti", v)} placeholder="da valutare" testId="extra-colori" />
          <ExtraRow label="Grafiche particolari / repliche originali" flag={form.grafiche_particolari} setFlag={(v) => set("grafiche_particolari", v)} price={form.prezzo_grafiche_particolari} setPrice={(v) => set("prezzo_grafiche_particolari", v)} placeholder="da valutare" testId="extra-grafiche" />
          <ExtraRow label="Rinforzi per gommoni diving" flag={form.rinforzi_diving} setFlag={(v) => set("rinforzi_diving", v)} price={form.prezzo_rinforzi_diving} setPrice={(v) => set("prezzo_rinforzi_diving", v)} placeholder="da valutare" testId="extra-diving" />
        </Section>

        {/* Note + stato */}
        <Section title="Note & stato">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Stato">
              <Select value={form.stato} onValueChange={(v) => set("stato", v)}>
                <SelectTrigger data-testid="prev-stato"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bozza">Bozza</SelectItem>
                  <SelectItem value="inviato">Inviato</SelectItem>
                  <SelectItem value="accettato">Accettato</SelectItem>
                  <SelectItem value="rifiutato">Rifiutato</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Note aggiuntive" full>
              <Textarea rows={2} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Es. Cliente richiama a settembre…" data-testid="prev-note" />
            </Field>
          </div>
        </Section>

        {/* Totale */}
        <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border pt-3 -mx-6 px-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Totale preventivo (IVA esclusa)</div>
            <div className="text-3xl font-bold font-mono-num text-primary" data-testid="prev-totale">{fmtEuro(totale)}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={attemptClose} data-testid="prev-cancel">Annulla</Button>
          <Button onClick={save} disabled={saving || !isDirty} className="bg-primary hover:bg-primary/90" data-testid="prev-save">
            <Save className="w-4 h-4 mr-1.5" /> {saving ? "Salvataggio…" : (isDirty ? "Salva preventivo" : "Nessuna modifica")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <PdfPreviewOverlay
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        url={previewUrl}
        filename={`preventivo_tubolari_${(form.cliente_nome || "cliente").replace(/[^a-zA-Z0-9]+/g, "_")}_${form.numero || "bozza"}.pdf`}
      />

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" /> Modifiche non salvate
            </AlertDialogTitle>
            <AlertDialogDescription>
              Hai apportato modifiche a questo preventivo ma non hai ancora premuto <b>"Salva preventivo"</b>.
              Se chiudi ora, le modifiche andranno perse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-continue-editing">Continua modifica</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmClose(false); onOpenChange(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="btn-discard-changes"
            >
              Scarta modifiche
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div className="border border-border rounded-lg p-4 mt-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, full }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ExtraRow({ label, flag, setFlag, price, setPrice, placeholder = "0.00", testId, suffix = "€", totalCalc = null }) {
  return (
    <div className="flex items-center gap-3 py-2 border-t border-border/60 first:border-t-0">
      <label className="flex-1 flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={!!flag} onChange={(e) => setFlag(e.target.checked)} data-testid={`${testId}-check`} />
        <span className={flag ? "font-medium" : "text-muted-foreground"}>{label}</span>
      </label>
      <Input
        type="number" step="0.01"
        className="w-28 text-right font-mono-num"
        value={price ?? 0}
        placeholder={placeholder}
        onChange={(e) => setPrice(Number(e.target.value))}
        disabled={!flag}
        data-testid={`${testId}-price`}
      />
      <span className="text-xs text-muted-foreground w-10">{suffix}</span>
      {totalCalc !== null && flag && (
        <span className="text-xs text-primary font-mono-num font-semibold w-24 text-right" title="Totale al metro">
          = {(totalCalc).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// CONFIG DIALOG
// ============================================================================
function TubolariConfigDialog({ open, onOpenChange, value, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open && value) setForm({ ...value }); }, [open, value]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/tubolari/config", {
        prezzo_al_metro: Number(form.prezzo_al_metro),
        supplemento_orca: Number(form.supplemento_orca),
        rifinitura_interna_strisciato: Number(form.rifinitura_interna_strisciato),
        bottazzo_doppio_90mm: Number(form.bottazzo_doppio_90mm),
        apposizione_pezze_velocita: Number(form.apposizione_pezze_velocita || 0),
        scritte_loghi_taglio_laser: Number(form.scritte_loghi_taglio_laser || 0),
        colori_tubo_differenti: Number(form.colori_tubo_differenti || 0),
        maniglione_aggiuntivo_cad: Number(form.maniglione_aggiuntivo_cad),
        validita_giorni: parseInt(form.validita_giorni || 90, 10),
        tempi_esecuzione_giorni: parseInt(form.tempi_esecuzione_giorni || 90, 10),
        garanzia_mesi: parseInt(form.garanzia_mesi || 12, 10),
        note_standard: form.note_standard || "",
      });
      toast.success("Impostazioni salvate");
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-tubolari-config">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-primary" /> Prezzi & Impostazioni Tubolari
          </DialogTitle>
          <DialogDescription>
            Questi valori sono usati come default quando crei un nuovo preventivo. Puoi modificarli in ogni singolo preventivo.
          </DialogDescription>
        </DialogHeader>

        <Section title="Prezzo base sostituzione">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Prezzo €/metro (Hypalon 1670)">
              <Input type="number" step="0.01" value={form.prezzo_al_metro ?? ""} onChange={(e) => set("prezzo_al_metro", e.target.value)} data-testid="cfg-pxm" />
            </Field>
            <Field label="Supplemento tessuto ORCA €/metro">
              <Input type="number" step="0.01" value={form.supplemento_orca ?? ""} onChange={(e) => set("supplemento_orca", e.target.value)} data-testid="cfg-orca" />
            </Field>
          </div>
        </Section>

        <Section title="Prezzi extra">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="B) Rifinitura interna strisciato €/Mt">
              <Input type="number" step="0.01" value={form.rifinitura_interna_strisciato ?? ""} onChange={(e) => set("rifinitura_interna_strisciato", e.target.value)} data-testid="cfg-rif" />
            </Field>
            <Field label="C) Bottazzo doppio h 90mm €/Mt">
              <Input type="number" step="0.01" value={form.bottazzo_doppio_90mm ?? ""} onChange={(e) => set("bottazzo_doppio_90mm", e.target.value)} data-testid="cfg-bot" />
            </Field>
            <Field label="D) Apposizione pezze velocità € (0 = da valutare)">
              <Input type="number" step="0.01" value={form.apposizione_pezze_velocita ?? 0} onChange={(e) => set("apposizione_pezze_velocita", e.target.value)} data-testid="cfg-pezze" />
            </Field>
            <Field label="E) Maniglione aggiuntivo €/cad">
              <Input type="number" step="0.01" value={form.maniglione_aggiuntivo_cad ?? ""} onChange={(e) => set("maniglione_aggiuntivo_cad", e.target.value)} data-testid="cfg-man" />
            </Field>
            <Field label="Scritte / Loghi taglio laser € (0 = da valutare)">
              <Input type="number" step="0.01" value={form.scritte_loghi_taglio_laser ?? 0} onChange={(e) => set("scritte_loghi_taglio_laser", e.target.value)} data-testid="cfg-scritte" />
            </Field>
            <Field label="Colori tubo differenti / graffiati € (0 = da valutare)">
              <Input type="number" step="0.01" value={form.colori_tubo_differenti ?? 0} onChange={(e) => set("colori_tubo_differenti", e.target.value)} data-testid="cfg-colori" />
            </Field>
          </div>
        </Section>

        <Section title="Testi standard sul PDF">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <Field label="Validità (giorni)"><Input type="number" value={form.validita_giorni ?? 90} onChange={(e) => set("validita_giorni", e.target.value)} /></Field>
            <Field label="Tempi esecuzione (giorni)"><Input type="number" value={form.tempi_esecuzione_giorni ?? 90} onChange={(e) => set("tempi_esecuzione_giorni", e.target.value)} /></Field>
            <Field label="Garanzia (mesi)"><Input type="number" value={form.garanzia_mesi ?? 12} onChange={(e) => set("garanzia_mesi", e.target.value)} /></Field>
          </div>
          <Field label="Note piede pagina PDF" full>
            <Textarea rows={5} value={form.note_standard ?? ""} onChange={(e) => set("note_standard", e.target.value)} data-testid="cfg-note" />
          </Field>
        </Section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90" data-testid="cfg-save">
            <Save className="w-4 h-4 mr-1.5" /> {saving ? "Salvataggio…" : "Salva impostazioni"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatData(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("it-IT");
  } catch { return iso; }
}
