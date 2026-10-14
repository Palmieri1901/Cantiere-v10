import { useEffect, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ClientePicker } from "./ClientePicker";
import { ArticoloPicker } from "@/components/ArticoloPicker";
import { ListinoPicker } from "@/components/ListinoPicker";
import { X, Plus } from "lucide-react";

const TIPI = ["Antivegetativa", "Manutenzione motore", "Riparazione", "Pulizia", "Elettrico", "Altro"];
const L = ({ children }) => <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</Label>;

export default function ApprovaDialog({ item, onClose, onDone }) {
  const [f, setF] = useState(null);
  const [clienti, setClienti] = useState([]);
  const [esterni, setEsterni] = useState([]);
  const [articoli, setArticoli] = useState([]);
  const [saving, setSaving] = useState(false);
  const [tariffa, setTariffa] = useState(0);
  const [modo, setModo] = useState("esistente");

  useEffect(() => {
    if (!item) return;
    setModo(item.cliente_trovato ? "esistente" : "nuovo");
    setF(null);
    api.get("/tariffe").then((r) => Number(r.data.costo_orario_manodopera) || 0).catch(() => 0).then((rate) => {
      setTariffa(rate);
      const costo = item.costo || +(Number(item.ore || 0) * rate).toFixed(2);
      setF({ cliente_id: item.cliente_id || "", esterno_nome: item.cliente_nome || "", data: item.data, tipo: TIPI.includes(item.tipo) ? item.tipo : "Altro", descrizione: item.descrizione, ore: item.ore, costo, materiali: item.materiali || "",
        articoli_magazzino: (item.articoli_magazzino || []).map((a) => ({ articolo_id: a.articolo_id, quantita: a.quantita ?? 1, nome: a.nome })),
        articoli_liberi: (item.articoli_liberi || []).map((a) => ({ descrizione: a.descrizione || "", quantita: a.quantita ?? 1, prezzo_unitario: a.prezzo_unitario ?? "" })) });
    });
    api.get("/magazzino/articoli").then((r) => setArticoli(r.data)).catch(() => {});
    Promise.all([api.get("/clienti").catch(() => ({ data: [] })), api.get("/esterni").catch(() => ({ data: [] }))]).then(([c, e]) => {
      setClienti(c.data); setEsterni(e.data);
      if (item.cliente_trovato) return;
      const parole = (item.cliente_nome || "").toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
      const match = parole.length && [...c.data.map((x) => ({ id: x.id, k: `${x.cognome} ${x.nome}`.toLowerCase() })), ...e.data.map((x) => ({ id: x.id, k: x.nome.toLowerCase() }))]
        .find((t) => parole.every((p) => t.k.includes(p)));
      if (match) { setModo("esistente"); setF((s) => s ? { ...s, cliente_id: match.id } : s); }
    });
  }, [item]);

  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const setArt = (i, q) => setF((s) => ({ ...s, articoli_magazzino: s.articoli_magazzino.map((a, j) => (j === i ? { ...a, quantita: q } : a)) }));
  const setLibero = (i, k, v) => setF((s) => ({ ...s, articoli_liberi: s.articoli_liberi.map((a, j) => (j === i ? { ...a, [k]: v } : a)) }));
  const setOre = (v) => setF((s) => ({ ...s, ore: v, costo: tariffa > 0 ? +((Number(v) || 0) * tariffa).toFixed(2) : s.costo }));

  const approva = async () => {
    const usaEsterno = modo === "nuovo";
    if (usaEsterno && !f.esterno_nome.trim()) return toast.error("Inserisci il nominativo");
    if (!usaEsterno && !f.cliente_id) return toast.error("Seleziona il cliente a cui attribuire il lavoro");
    setSaving(true);
    try {
      const { esterno_nome, ...rest } = f;
      const body = { ...rest, ore: Number(f.ore) || 0, costo: Number(f.costo) || 0,
        articoli_magazzino: f.articoli_magazzino.map((a) => ({ articolo_id: a.articolo_id, quantita: Number(a.quantita) || 1 })),
        articoli_liberi: f.articoli_liberi.filter((a) => a.descrizione.trim()).map((a) => ({ descrizione: a.descrizione.trim(), quantita: Number(a.quantita) || 1, prezzo_unitario: Number(a.prezzo_unitario) || 0 })) };
      if (usaEsterno) { body.esterno_nome = esterno_nome.trim(); delete body.cliente_id; }
      await api.post(`/lavori-pending/${item.id}/approva`, body);
      toast.success(usaEsterno ? "Cliente esterno creato e lavoro salvato" : "Lavoro approvato e aggiunto alla scheda cliente");
      window.dispatchEvent(new Event("pending-changed"));
      onDone(); onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore approvazione");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[92vh] overflow-y-auto overflow-x-hidden" data-testid="approva-dialog">
        <DialogHeader>
          <DialogTitle>Approva lavoro di {item?.dipendente_nome}</DialogTitle>
          <DialogDescription>Controlla i dati e imposta il costo manodopera prima di salvarlo nella scheda cliente.</DialogDescription>
        </DialogHeader>
        {f && item && (
          <div className="space-y-3">
            <div className={`space-y-2 p-3 rounded-md border ${item.cliente_trovato ? "border-border bg-muted/30" : "border-amber-300 bg-amber-50"}`} data-testid="approva-cliente-box">
              <div className="text-xs">
                {item.cliente_trovato
                  ? <>Il dipendente ha indicato <b>{item.cliente_nome}</b>. Puoi confermarlo o attribuire il lavoro a un altro conto.</>
                  : <>Il dipendente ha indicato <b>{item.cliente_nome || "un cliente non in archivio"}</b>. Scegli a chi attribuire il conto:</>}
              </div>
              <div className="flex gap-2 text-xs flex-wrap">
                <button type="button" onClick={() => setModo("esistente")} className={`px-2.5 py-1.5 rounded-md border ${modo === "esistente" ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`} data-testid="btn-modo-archivio">Somma a cliente esistente</button>
                <button type="button" onClick={() => setModo("nuovo")} className={`px-2.5 py-1.5 rounded-md border ${modo === "nuovo" ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`} data-testid="btn-modo-esterno">Nuovo cliente esterno</button>
              </div>
              {modo === "nuovo" ? (
                <div className="space-y-1.5"><L>Nominativo</L><Input value={f.esterno_nome} onChange={(e) => set("esterno_nome", e.target.value)} placeholder="Es. Rossi Mario" data-testid="input-esterno-nome" /></div>
              ) : (
                <ClientePicker clienti={clienti} esterni={esterni} value={f.cliente_id} onChange={(v) => set("cliente_id", v)} suggerimento={item.cliente_nome} />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><L>Data</L><Input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} data-testid="input-approva-data" /></div>
              <div className="space-y-1.5"><L>Tipo</L>
                <Select value={f.tipo} onValueChange={(v) => set("tipo", v)}>
                  <SelectTrigger data-testid="select-approva-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPI.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><L>Descrizione</L><Input value={f.descrizione} onChange={(e) => set("descrizione", e.target.value)} data-testid="input-approva-descrizione" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><L>Ore lavoro</L><Input type="number" step="0.5" min="0" value={f.ore} onChange={(e) => setOre(e.target.value)} className="font-mono-num" data-testid="input-approva-ore" /></div>
              <div className="space-y-1.5"><L>Costo manodopera €</L><Input type="number" step="0.01" min="0" value={f.costo} onChange={(e) => set("costo", e.target.value)} className="font-mono-num" data-testid="input-approva-costo" />
                <div className="text-[11px] text-muted-foreground" data-testid="approva-tariffa-hint">{tariffa > 0 ? `Calcolato: ${f.ore || 0} h × ${tariffa} €/h (modificabile)` : "Imposta il costo orario in Tariffe per il calcolo automatico"}</div>
              </div>
            </div>
            <div className="space-y-1.5"><L>Materiali</L><Textarea rows={2} value={f.materiali} onChange={(e) => set("materiali", e.target.value)} data-testid="input-approva-materiali" /></div>

            <div className="space-y-1.5 rounded-md border border-border/60 p-3" data-testid="approva-articoli-magazzino">
              <L>Articoli dal magazzino <span className="text-muted-foreground font-normal normal-case">(scaricati all'approvazione)</span></L>
              {f.articoli_magazzino.length === 0 && <div className="text-xs text-muted-foreground">Nessun articolo indicato: puoi aggiungerli qui sotto.</div>}
              {f.articoli_magazzino.map((a, i) => {
                const art = articoli.find((x) => x.id === a.articolo_id);
                return (
                  <div key={a.articolo_id} className="flex items-center gap-2 text-sm" data-testid={`approva-art-${a.articolo_id}`}>
                    <span className="flex-1 min-w-0 truncate">{art?.nome || a.nome || a.articolo_id}{art && <span className="text-[11px] text-muted-foreground ml-1">· {fmtEuro(art.prezzo_listino || 0)} · giac. {Number(art.quantita)}</span>}</span>
                    <Input type="number" min="0" step="0.5" value={a.quantita} onChange={(e) => setArt(i, e.target.value)} className="w-16 h-8 font-mono-num shrink-0" data-testid={`approva-art-qta-${a.articolo_id}`} />
                    <button type="button" onClick={() => set("articoli_magazzino", f.articoli_magazzino.filter((_, j) => j !== i))} data-testid={`approva-art-rimuovi-${a.articolo_id}`}><X className="w-4 h-4 text-destructive" /></button>
                  </div>
                );
              })}
              <ArticoloPicker articoli={articoli} exclude={f.articoli_magazzino.map((a) => a.articolo_id)} onSelect={(a) => set("articoli_magazzino", [...f.articoli_magazzino, { articolo_id: a.id, quantita: 1 }])} placeholder="+ Aggiungi articolo dal magazzino…" testId="approva-add-articolo" />
            </div>

            <div className="space-y-1.5 rounded-md border border-border/60 p-3" data-testid="approva-articoli-liberi">
              <div className="flex items-center justify-between"><L>Altri articoli <span className="text-muted-foreground font-normal normal-case">(non in magazzino)</span></L>
                <div className="flex gap-1">
                  <ListinoPicker onAdd={(v) => set("articoli_liberi", [...f.articoli_liberi, { descrizione: v.descrizione, quantita: v.quantita, prezzo_unitario: v.prezzo_unitario }])} variant="ghost" testId="approva-listino" />
                  <Button type="button" size="sm" variant="ghost" onClick={() => set("articoli_liberi", [...f.articoli_liberi, { descrizione: "", quantita: 1, prezzo_unitario: "" }])} data-testid="approva-add-libero"><Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi</Button>
                </div></div>
              {f.articoli_liberi.map((a, i) => (
                <div key={i} className="grid grid-cols-[1fr_56px_72px_20px] gap-1.5 items-center" data-testid={`approva-libero-${i}`}>
                  <Input value={a.descrizione} onChange={(e) => setLibero(i, "descrizione", e.target.value)} placeholder="Descrizione" className="h-8" data-testid={`approva-libero-desc-${i}`} />
                  <Input type="number" min="0" step="0.5" value={a.quantita} onChange={(e) => setLibero(i, "quantita", e.target.value)} className="h-8 font-mono-num" data-testid={`approva-libero-qta-${i}`} />
                  <Input type="number" min="0" step="0.01" value={a.prezzo_unitario} onChange={(e) => setLibero(i, "prezzo_unitario", e.target.value)} placeholder="€ cad." className="h-8 font-mono-num" data-testid={`approva-libero-prezzo-${i}`} />
                  <button type="button" onClick={() => set("articoli_liberi", f.articoli_liberi.filter((_, j) => j !== i))} data-testid={`approva-libero-rimuovi-${i}`}><X className="w-4 h-4 text-destructive" /></button>
                </div>
              ))}
              {f.articoli_liberi.length > 0 && <div className="text-[11px] text-muted-foreground">Totale altri articoli: {fmtEuro(f.articoli_liberi.reduce((s, a) => s + Number(a.quantita || 0) * Number(a.prezzo_unitario || 0), 0))} — aggiunto al costo del lavoro.</div>}
            </div>
            <div className="text-[11px] text-muted-foreground">Dopo l'approvazione potrai ancora modificare ore e articoli dalla scheda del cliente (icona matita sul lavoro).</div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="btn-approva-annulla">Annulla</Button>
          <Button onClick={approva} disabled={saving} className="bg-primary hover:bg-primary/90" data-testid="btn-approva-conferma">Approva e salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
