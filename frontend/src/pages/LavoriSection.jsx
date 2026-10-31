import { useEffect, useMemo, useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { api, fmtEuro, prezzoIvato } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ArticoloPicker } from "@/components/ArticoloPicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Wrench, Package, AlertTriangle } from "lucide-react";
import { ListinoPicker } from "@/components/ListinoPicker";
import { righeLavoro } from "@/lib/righeLavoro";

const TIPI_LAVORO = ["Antivegetativa", "Manutenzione motore", "Riparazione", "Pulizia", "Elettrico", "Altro"];
const STATI = [
  { value: "pianificato", label: "Pianificato" },
  { value: "in_corso", label: "In corso" },
  { value: "completato", label: "Completato" },
];

const emptyLavoro = (cliente_id) => ({
  cliente_id,
  data: new Date().toISOString().slice(0, 10),
  tipo: "Manutenzione motore",
  descrizione: "",
  costo: 0,
  materiali: "",
  stato: "completato",
  ore: 0,
});

export default function LavoriSection({ clienteId, editLavoroId }) {
  const [lavori, setLavori] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [tariffaOraria, setTariffaOraria] = useState(0);
  const [costoManuale, setCostoManuale] = useState(false);
  const [articoliMag, setArticoliMag] = useState([]);
  const [artSelezionati, setArtSelezionati] = useState([]); // [{articolo_id, codice, nome, quantita, prezzo_unitario, giacenza}]
  const [artLiberi, setArtLiberi] = useState([]); // articoli non in magazzino: [{descrizione, quantita, prezzo_unitario}]
  const addLibero = () => setArtLiberi((s) => [...s, { descrizione: "", quantita: 1, prezzo_unitario: "" }]);
  const updateLibero = (i, k, v) => setArtLiberi((s) => s.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const removeLibero = async (i) => { if (await confirmDialog("Rimuovere questo articolo dal lavoro?", { okLabel: "Rimuovi" })) setArtLiberi((s) => s.filter((_, idx) => idx !== i)); };
  const costoLiberi = artLiberi.reduce((s, a) => s + (Number(a.quantita || 0) * Number(a.prezzo_unitario || 0)), 0);

  const load = () => {
    if (!clienteId) return;
    setLoading(true);
    api.get(`/clienti/${clienteId}/lavori`).then((r) => {
      setLavori(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [clienteId]);
  const [autoEditDone, setAutoEditDone] = useState(false);
  useEffect(() => {
    if (autoEditDone || !editLavoroId || !lavori.length) return;
    const l = lavori.find((x) => x.id === editLavoroId);
    if (l) { setAutoEditDone(true); openEdit(l); }
  }, [lavori, editLavoroId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMagazzino = async () => {
    try {
      const [r, t] = await Promise.all([api.get("/magazzino/articoli"), api.get("/tariffe")]);
      setArticoliMag(r.data);
      setTariffaOraria(Number(t.data.costo_orario_manodopera) || 0);
    } catch { /* ignoro */ }
  };

  const openNew = async () => {
    setEditing(null);
    setForm(emptyLavoro(clienteId));
    setArtSelezionati([]);
    setArtLiberi([]);
    setCostoManuale(false);
    setDialogOpen(true);
    loadMagazzino();
  };

  const onOreChange = (v) => {
    setForm((f) => ({ ...f, ore: v, costo: !costoManuale && tariffaOraria > 0 ? +((Number(v) || 0) * tariffaOraria).toFixed(2) : f.costo }));
  };

  const openEdit = (l) => {
    setEditing(l);
    loadMagazzino();
    setForm({ ...l, costo: +(Number(l.costo || 0) - (l.articoli_liberi || []).reduce((s, x) => s + Number(x.totale || 0), 0) - (l.articoli_magazzino || []).reduce((s, x) => s + Number(x.totale || 0), 0)).toFixed(2) });
    setArtLiberi((l.articoli_liberi || []).map((x) => ({ descrizione: x.descrizione || "", quantita: x.quantita, prezzo_unitario: x.prezzo_unitario, unita: x.unita || "", listino_id: x.listino_id, listino_q: x.listino_q, listino_q2: x.listino_q2 })));
    setCostoManuale(true);
    api.get("/tariffe").then((t) => setTariffaOraria(Number(t.data.costo_orario_manodopera) || 0)).catch(() => {});
    // Ripopola gli articoli già scaricati sul lavoro così l'utente può aggiungerne/toglierne
    const preselezionati = Array.isArray(l?.articoli_magazzino) ? l.articoli_magazzino : [];
    setArtSelezionati(preselezionati.map((it) => {
      const art = articoliMag.find((x) => x.id === it.articolo_id);
      return {
        articolo_id: it.articolo_id,
        codice: it.codice || art?.codice || "",
        nome: it.nome || art?.nome || "",
        quantita: Number(it.quantita) || 0,
        prezzo_unitario: Number(it.prezzo_unitario) || 0,
        // Giacenza corrente + quantità già scaricata su questo lavoro = giacenza spendibile
        giacenza: (Number(art?.quantita) || 0) + (Number(it.quantita) || 0),
      };
    }));
    setDialogOpen(true);
  };

  const addArticolo = (articolo_id) => {
    if (!articolo_id) return;
    if (artSelezionati.some((x) => x.articolo_id === articolo_id)) {
      toast.info("Articolo già aggiunto");
      return;
    }
    const a = articoliMag.find((x) => x.id === articolo_id);
    if (!a) return;
    setArtSelezionati((s) => [...s, {
      articolo_id: a.id, codice: a.codice, nome: a.nome,
      quantita: 1, prezzo_unitario: prezzoIvato(a),
      giacenza: a.quantita,
    }]);
  };

  const updateArt = (i, k, v) => setArtSelezionati((s) => s.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const removeArt = (i) => setArtSelezionati((s) => s.filter((_, idx) => idx !== i));

  const costoArticoli = useMemo(
    () => artSelezionati.reduce((s, a) => s + (Number(a.quantita || 0) * Number(a.prezzo_unitario || 0)), 0),
    [artSelezionati]
  );

  const save = async () => {
    if (!form.tipo || !form.data) {
      toast.error("Data e tipo sono obbligatori");
      return;
    }
    // Quantità valida; se la giacenza non basta si procede comunque: il magazzino andrà in negativo
    for (const a of artSelezionati) {
      if (Number(a.quantita) <= 0) { toast.error(`Quantità non valida per ${a.nome}`); return; }
    }
    const inNegativo = artSelezionati.filter((a) => Number(a.quantita) > Number(a.giacenza));
    if (inNegativo.length > 0) toast.warning(`${inNegativo.map((a) => a.nome).join(", ")}: giacenza insufficiente, il magazzino andrà in negativo`);
    const payload = {
      ...form,
      costo: Number(form.costo) || 0,
      ore: Number(form.ore) || 0,
      // In modifica invio SEMPRE la lista aggiornata: il backend calcola il delta
      // rispetto a quella già salvata e scarica/ricarica il magazzino di conseguenza.
      articoli_magazzino: artSelezionati.map((a) => ({
        articolo_id: a.articolo_id, quantita: Number(a.quantita), prezzo_unitario: Number(a.prezzo_unitario),
      })),
      articoli_liberi: artLiberi.filter((a) => (a.descrizione || "").trim() || Number(a.prezzo_unitario) > 0).map((a) => ({
        descrizione: a.descrizione, quantita: Number(a.quantita) || 1, prezzo_unitario: Number(a.prezzo_unitario) || 0, unita: a.unita || "",
      })),
    };
    try {
      if (editing) {
        await api.put(`/lavori/${editing.id}`, payload);
        toast.success(artSelezionati.length > 0
          ? "Lavoro aggiornato · magazzino sincronizzato"
          : "Lavoro aggiornato");
      } else {
        await api.post("/lavori", payload);
        toast.success(artSelezionati.length > 0
          ? `Lavoro aggiunto · ${artSelezionati.length} articoli scaricati dal magazzino`
          : "Lavoro aggiunto");
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore salvataggio");
    }
  };

  const remove = async (id) => {
    const l = lavori.find((x) => x.id === id);
    const nArt = Array.isArray(l?.articoli_magazzino) ? l.articoli_magazzino.length : 0;
    const conferma = nArt > 0
      ? `Eliminare questo lavoro?\nVerranno ripristinate le giacenze di ${nArt} articoli in magazzino.`
      : "Eliminare questo lavoro?";
    if (!await confirmDialog(conferma)) return;
    try {
      const r = await api.delete(`/lavori/${id}`);
      const ripr = r.data?.giacenze_ripristinate || 0;
      toast.success(ripr > 0
        ? `Lavoro eliminato · ${ripr} giacenze ripristinate in magazzino`
        : "Lavoro eliminato");
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore eliminazione");
    }
  };

  const totale = lavori.reduce((s, l) => s + (l.costo || 0), 0);

  if (!clienteId) {
    return (
      <div className="text-sm text-muted-foreground p-4 bg-muted/40 rounded-md">
        Salva il cliente per poter aggiungere lo storico lavori.
      </div>
    );
  }

  const articoliDisponibili = articoliMag.filter((a) => !artSelezionati.some((s) => s.articolo_id === a.id));

  return (
    <div data-testid="lavori-section">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="label-mini flex items-center gap-1.5"><Wrench className="w-3 h-3" /> Storico lavori</div>
          <div className="text-xs text-muted-foreground mt-1">
            {lavori.length} interventi · totale {fmtEuro(totale)}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={openNew} data-testid="btn-nuovo-lavoro">
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Aggiungi lavoro
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-4">Caricamento…</div>
      ) : lavori.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center bg-muted/30 rounded-md border border-dashed border-border">
          Nessun lavoro registrato. Aggiungi il primo intervento.
        </div>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border">
          {lavori.map((l) => (
            <div key={l.id} className="p-3 flex items-start gap-3 hover:bg-muted/40" data-testid={`lavoro-row-${l.id}`}>
              <div className="w-20 shrink-0">
                <div className="font-mono-num text-xs text-muted-foreground">{l.data}</div>
                <StatusBadge stato={l.stato} />
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="font-medium text-sm [overflow-wrap:anywhere]">{l.tipo}</div>
                {l.descrizione && <div className="text-xs text-muted-foreground [overflow-wrap:anywhere] line-clamp-2" title={l.descrizione}>{l.descrizione}</div>}
                {(Number(l.ore) > 0 || l.dipendente) && (
                  <div className="text-[11px] text-muted-foreground mt-0.5" data-testid={`lavoro-ore-${l.id}`}>
                    {Number(l.ore) > 0 ? `${l.ore} h` : ""}{Number(l.ore) > 0 && l.dipendente ? " · " : ""}{l.dipendente ? `eseguito da ${l.dipendente}` : ""}
                  </div>
                )}
                {l.materiali && <div className="text-[11px] text-muted-foreground/80 italic mt-0.5 [overflow-wrap:anywhere] line-clamp-2">Mat.: {l.materiali}</div>}
                <div className="mt-1.5 text-[11px] space-y-0.5" data-testid={`lavoro-voci-${l.id}`}>
                  {righeLavoro(l).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-muted-foreground">
                      <span className="truncate flex-1">· {r.nome}{r.qta ? ` ${r.qta}` : ""}{r.prezzo ? ` × ${fmtEuro(r.prezzo)}` : ""}</span>
                      <span className="font-mono-num shrink-0">{fmtEuro(r.totale)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="font-mono-num text-sm font-semibold shrink-0">{fmtEuro(l.costo)}</div>
              <div className="flex gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(l)} data-testid={`btn-edit-lavoro-${l.id}`}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(l.id)} data-testid={`btn-delete-lavoro-${l.id}`}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto" data-testid="lavoro-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifica lavoro" : "Nuovo lavoro"}</DialogTitle>
            <DialogDescription>Registra un intervento eseguito o pianificato.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data</Label>
                  <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} data-testid="input-lavoro-data" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger data-testid="select-lavoro-tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPI_LAVORO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descrizione</Label>
                <Textarea rows={3} value={form.descrizione} onChange={(e) => setForm({ ...form, descrizione: e.target.value })} placeholder="Es. Cambio olio motore, revisione elica…" data-testid="input-lavoro-descrizione" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ore lavoro</Label>
                  <Input type="number" step="0.5" min="0" className="font-mono-num" value={form.ore ?? 0} onChange={(e) => onOreChange(e.target.value)} data-testid="input-lavoro-ore" />
                  {tariffaOraria > 0 && <div className="text-[11px] text-muted-foreground" data-testid="lavoro-tariffa-hint">{tariffaOraria} €/h da Tariffe{costoManuale ? " · costo modificato a mano" : ""}</div>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Costo manodopera</Label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                    <Input type="number" step="0.01" min="0" className="pl-10 font-mono-num" value={form.costo} onChange={(e) => { setCostoManuale(true); setForm({ ...form, costo: e.target.value }); }} data-testid="input-lavoro-costo" />
                  </div>
                  {(costoArticoli > 0 || costoLiberi > 0) && (
                    <div className="text-[11px] text-muted-foreground mt-1" data-testid="lavoro-costo-articoli-hint">
                      + {fmtEuro(costoArticoli + costoLiberi)} articoli · totale {fmtEuro(Number(form.costo || 0) + costoArticoli + costoLiberi)}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stato</Label>
                  <Select value={form.stato} onValueChange={(v) => setForm({ ...form, stato: v })}>
                    <SelectTrigger data-testid="select-lavoro-stato"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATI.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Materiali (note libere)</Label>
                <Textarea rows={3} value={form.materiali} onChange={(e) => setForm({ ...form, materiali: e.target.value })} placeholder="Es. 3L vernice antivegetativa, filtro olio…" data-testid="input-lavoro-materiali" />
              </div>

              {/* Articoli dal magazzino */}
              {(
                <div className="border border-border/60 rounded-md p-3 bg-muted/10" data-testid="lavoro-articoli-magazzino">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Package className="w-3 h-3" /> Articoli dal magazzino
                    </Label>
                    <span className="text-[11px] text-muted-foreground">{editing ? "Salvando il magazzino viene riallineato (scarico/ricarico della differenza)" : "Salvando verranno scaricati dalla giacenza (anche in negativo)"}</span>
                  </div>

                  {artSelezionati.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2">Nessun articolo aggiunto.</div>
                  ) : (
                    <div className="space-y-1.5 mb-2">
                      {artSelezionati.map((a, i) => {
                        const stockKO = Number(a.quantita) > Number(a.giacenza);
                        return (
                          <div key={a.articolo_id} className={`flex items-center gap-2 text-sm bg-card rounded-md p-2 border ${stockKO ? "border-amber-400/70 bg-amber-50/40" : "border-border/60"}`} data-testid={`art-mag-row-${i}`}>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-base leading-tight whitespace-normal" data-testid={`art-mag-nome-${i}`}>{a.nome}</div>
                              {stockKO && <div className="text-[10px] text-amber-700 font-medium">Giacenza insufficiente: il magazzino andrà in negativo</div>}
                            </div>
                            <Input
                              type="number" step="0.01" min="0.01"
                              value={a.quantita}
                              onChange={(e) => updateArt(i, "quantita", e.target.value)}
                              className="w-20 h-8 text-right font-mono-num"
                              data-testid={`art-mag-qty-${i}`}
                            />
                            <div className="relative w-24">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">€</span>
                              <Input
                                type="number" step="0.01" min="0"
                                value={a.prezzo_unitario}
                                onChange={(e) => updateArt(i, "prezzo_unitario", e.target.value)}
                                className="pl-6 h-8 text-right font-mono-num text-xs"
                                data-testid={`art-mag-price-${i}`}
                              />
                            </div>
                            <div className="w-20 text-right font-mono-num text-xs font-semibold">
                              {fmtEuro(Number(a.quantita || 0) * Number(a.prezzo_unitario || 0))}
                            </div>
                            {stockKO && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" title="Giacenza insufficiente: il magazzino andrà in negativo" />}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeArt(i)} data-testid={`art-mag-del-${i}`}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <ArticoloPicker articoli={articoliDisponibili} onSelect={(a) => addArticolo(a.id)} placeholder="+ Cerca e aggiungi articolo dal magazzino…" testId="select-add-articolo" />
                </div>
              )}

              {/* Articoli non in magazzino (descrizione libera + prezzo) */}
              <div className="border border-border/60 rounded-md p-3 bg-muted/10" data-testid="lavoro-articoli-liberi">
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Package className="w-3 h-3" /> Altri articoli (non in magazzino)
                  </Label>
                  <div className="flex gap-1.5">
                    <ListinoPicker onAdd={(v) => setArtLiberi((s) => [...s, { descrizione: v.descrizione, quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, unita: v.unita, listino_id: v.listino_id, listino_q: v.listino_q, listino_q2: v.listino_q2 }])} testId="btn-listino-lavoro" />
                    <Button size="sm" variant="outline" onClick={addLibero} data-testid="btn-aggiungi-articolo"><Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi articolo</Button>
                  </div>
                </div>
                {artLiberi.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-1">Nessun articolo: usa "Aggiungi articolo" per inserire descrizione, quantità e prezzo.</div>
                ) : (
                  <div className="space-y-1.5">
                    {artLiberi.map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-card rounded-md p-2 border border-border/60 flex-wrap sm:flex-nowrap" data-testid={`art-lib-row-${i}`}>
                        <Input value={a.descrizione} onChange={(e) => updateLibero(i, "descrizione", e.target.value)} placeholder="Descrizione articolo" className="flex-1 min-w-[140px] h-8" data-testid={`art-lib-descr-${i}`} />
                        <Input type="number" step="0.01" min="0" value={a.quantita} onChange={(e) => updateLibero(i, "quantita", e.target.value)} className="w-20 h-8 text-right font-mono-num" placeholder="Q.tà" data-testid={`art-lib-qty-${i}`} />
                        {a.unita && <span className="text-xs text-muted-foreground w-7" data-testid={`art-lib-unita-${i}`}>{a.unita}</span>}
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">€</span>
                          <Input type="number" step="0.01" min="0" value={a.prezzo_unitario} onChange={(e) => updateLibero(i, "prezzo_unitario", e.target.value)} className="pl-6 h-8 text-right font-mono-num text-xs" placeholder="Prezzo" data-testid={`art-lib-price-${i}`} />
                        </div>
                        <div className="w-20 text-right font-mono-num text-xs font-semibold">{fmtEuro(Number(a.quantita || 0) * Number(a.prezzo_unitario || 0))}</div>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeLibero(i)} data-testid={`art-lib-del-${i}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="btn-lavoro-annulla">Annulla</Button>
            <Button onClick={save} className="bg-primary hover:bg-primary/90" data-testid="btn-lavoro-salva">Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ stato }) {
  const map = {
    pianificato: { label: "Pianificato", cls: "bg-muted text-muted-foreground border-border" },
    in_corso: { label: "In corso", cls: "bg-chart-3/20 text-chart-3 border-chart-3/40" },
    completato: { label: "Completato", cls: "bg-primary/10 text-primary border-primary/30" },
  };
  const s = map[stato] || map.completato;
  return (
    <Badge variant="outline" className={`text-[9px] mt-1 ${s.cls}`}>{s.label}</Badge>
  );
}
