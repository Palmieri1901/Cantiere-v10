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

const TIPI = ["Antivegetativa", "Manutenzione motore", "Riparazione", "Pulizia", "Elettrico", "Altro"];
const L = ({ children }) => <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</Label>;

export default function ApprovaDialog({ item, onClose, onDone }) {
  const [f, setF] = useState(null);
  const [clienti, setClienti] = useState([]);
  const [esterni, setEsterni] = useState([]);
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
      setF({ cliente_id: item.cliente_id || "", esterno_nome: item.cliente_nome || "", data: item.data, tipo: TIPI.includes(item.tipo) ? item.tipo : "Altro", descrizione: item.descrizione, ore: item.ore, costo, materiali: item.materiali || "" });
    });
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
  const setOre = (v) => setF((s) => ({ ...s, ore: v, costo: tariffa > 0 ? +((Number(v) || 0) * tariffa).toFixed(2) : s.costo }));

  const approva = async () => {
    const usaEsterno = modo === "nuovo";
    if (usaEsterno && !f.esterno_nome.trim()) return toast.error("Inserisci il nominativo");
    if (!usaEsterno && !f.cliente_id) return toast.error("Seleziona il cliente a cui attribuire il lavoro");
    setSaving(true);
    try {
      const { esterno_nome, ...rest } = f;
      const body = { ...rest, ore: Number(f.ore) || 0, costo: Number(f.costo) || 0 };
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
      <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[92vh] overflow-y-auto" data-testid="approva-dialog">
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
            {item.articoli_magazzino?.length > 0 && (
              <div className="text-xs text-muted-foreground">Approvando verranno scaricati dal magazzino {item.articoli_magazzino.length} articoli indicati dal dipendente.</div>
            )}
            {item.articoli_liberi?.length > 0 && (
              <div className="text-xs rounded-md border border-border/60 p-2 space-y-0.5" data-testid="approva-articoli-liberi">
                <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Altri articoli (non in magazzino)</div>
                {item.articoli_liberi.map((a, i) => (
                  <div key={i} className="flex justify-between gap-2"><span>{a.descrizione} × {a.quantita}</span><span className="font-mono-num">{fmtEuro(Number(a.quantita || 0) * Number(a.prezzo_unitario || 0))}</span></div>
                ))}
                <div className="text-[11px] text-muted-foreground">Verranno aggiunti al costo del lavoro.</div>
              </div>
            )}
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
