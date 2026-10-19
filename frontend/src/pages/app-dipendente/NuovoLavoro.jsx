import { useCallback, useMemo, useState } from "react";
import { mobileStore, mobileApi, uid } from "@/lib/mobileStore";
import { fmtEuro } from "@/lib/api";
import HallWidget from "@/components/hall/HallWidget";
import { Button } from "@/components/ui/button";
import { ArticoloPicker } from "@/components/ArticoloPicker";
import { ListinoPicker } from "@/components/ListinoPicker";
import { BarcodeButton } from "@/components/BarcodeButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, Search, X, Plus, StickyNote } from "lucide-react";

const TIPI = ["Riparazione", "Manutenzione motore", "Antivegetativa", "Pulizia", "Elettrico", "Altro"];
const L = ({ children }) => <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</Label>;
const empty = () => ({ cliente_id: "", cliente_nuovo: "", data: new Date().toISOString().slice(0, 10), tipo: "Riparazione", descrizione: "", ore: "", materiali: "", articoli: [], articoli_liberi: [] });
// Ricostruisce il form da un lavoro salvato in coda (per la modifica)
const daLavoro = (l) => ({ cliente_id: l.cliente_id || "", cliente_nuovo: l.cliente_id ? "" : (l.cliente_nome || ""), data: l.data, tipo: l.tipo, descrizione: l.descrizione || "", ore: l.ore ? String(l.ore) : "", materiali: l.materiali || "",
  articoli: (l.articoli_magazzino || []).map((a) => ({ articolo_id: a.articolo_id, quantita: a.quantita })),
  articoli_liberi: (l.articoli_liberi || []).map((a) => ({ descrizione: a.descrizione, quantita: a.quantita, prezzo_unitario: a.prezzo_unitario || "", unita: a.unita || "" })) });

export default function NuovoLavoro({ onSaved, iniziale = null, onAnnulla }) {
  const clienti = mobileStore.clienti();
  const articoli = mobileStore.articoli();
  const [f, setF] = useState(iniziale ? daLavoro(iniziale) : empty());
  const [q, setQ] = useState("");
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  const filtrati = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return clienti.filter((c) => `${c.cognome} ${c.nome} ${c.tipo_barca || ""}`.toLowerCase().includes(s)).slice(0, 8);
  }, [q, clienti]);
  const cliente = clienti.find((c) => c.id === f.cliente_id) || (f.cliente_nuovo ? { id: "", cognome: f.cliente_nuovo, nome: "", tipo_barca: "Nuovo cliente (non in archivio)" } : null);

  const addArt = (id) => { if (!id || f.articoli.some((a) => a.articolo_id === id)) return; set("articoli", [...f.articoli, { articolo_id: id, quantita: 1 }]); };
  const scansiona = (code) => {
    const c = code.trim().toLowerCase();
    const art = articoli.find((a) => (a.barcode || "").toLowerCase() === c || (a.codice || "").toLowerCase() === c);
    if (!art) return toast.error(`Nessun articolo con codice ${code}: aggiorna i dati o cercalo per nome`);
    if (f.articoli.some((a) => a.articolo_id === art.id)) set("articoli", f.articoli.map((a) => a.articolo_id === art.id ? { ...a, quantita: (Number(a.quantita) || 0) + 1 } : a));
    else addArt(art.id);
    toast.success(`Aggiunto: ${art.nome}`);
  };
  const addLibero = () => set("articoli_liberi", [...f.articoli_liberi, { descrizione: "", quantita: 1, prezzo_unitario: "" }]);
  const addDaListino = (v) => set("articoli_liberi", [...f.articoli_liberi, { descrizione: v.descrizione, quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, unita: v.unita }]);
  const fetchTariffe = useCallback(() => mobileApi().get("/tariffe").then((r) => r.data), []);
  const compilaDaHall = useCallback((p) => {
    const clientiAgg = mobileStore.clienti(), articoliAgg = mobileStore.articoli();
    setF((s) => {
      const cl = p.cliente_id && clientiAgg.find((c) => c.id === p.cliente_id);
      const arts = (p.articoli || []).filter((a) => articoliAgg.some((x) => x.id === a.articolo_id)).map((a) => ({ articolo_id: a.articolo_id, quantita: Number(a.quantita) || 1 }));
      return { ...s, cliente_id: cl ? cl.id : s.cliente_id, cliente_nuovo: !cl && p.cliente_nome ? p.cliente_nome : (cl ? "" : s.cliente_nuovo),
        tipo: TIPI.includes(p.tipo) ? p.tipo : s.tipo, descrizione: p.descrizione || s.descrizione, ore: p.ore != null ? String(p.ore) : s.ore,
        articoli: arts.length ? arts : s.articoli };
    });
    setQ("");
  }, []);
  const hallInterpreta = useCallback((testo, storia) => mobileApi().post("/assistente", { testo, storia }, { timeout: 60000 }).then((r) => r.data), []);
  const setLibero = (i, k, v) => set("articoli_liberi", f.articoli_liberi.map((x, j) => j === i ? { ...x, [k]: v } : x));

  const salva = () => {
    if (!f.cliente_id && !f.cliente_nuovo) return toast.error("Scegli il cliente");
    if (!f.descrizione.trim()) return toast.error("Descrivi il lavoro eseguito");
    const c = cliente;
    onSaved({
      client_uid: iniziale?.client_uid || uid(), cliente_id: f.cliente_id || null, cliente_nome: `${c.cognome} ${c.nome}`.trim(), nuovo_cliente: !f.cliente_id, data: f.data, tipo: f.tipo,
      descrizione: f.descrizione.trim(), ore: Number(f.ore) || 0, materiali: f.materiali,
      articoli_magazzino: f.articoli.map((a) => ({ articolo_id: a.articolo_id, quantita: Number(a.quantita) || 1 })),
      articoli_liberi: f.articoli_liberi.filter((a) => a.descrizione.trim()).map((a) => ({ descrizione: a.descrizione.trim(), quantita: Number(a.quantita) || 1, prezzo_unitario: Number(a.prezzo_unitario) || 0, unita: a.unita || "" })),
      creato_at: iniziale?.creato_at || new Date().toISOString(), modificato_at: iniziale ? new Date().toISOString() : undefined, inviato: false,
    });
    setF(empty()); setQ("");
  };

  return (
    <div className="space-y-4" data-testid="nuovo-lavoro-mobile">
      {iniziale && (
        <div className="flex items-center justify-between rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm" data-testid="banner-modifica-lavoro">
          <span className="font-medium text-amber-900">Modifica lavoro salvato</span>
          <Button size="sm" variant="ghost" className="h-8" onClick={onAnnulla} data-testid="btn-annulla-modifica">Annulla</Button>
        </div>
      )}
      {navigator.onLine && <HallWidget interpreta={hallInterpreta} esegui={async () => ({})} onCompila={compilaDaHall} esempi={["Lavoro per Rossi, antivegetativa, 3 ore, usato 2 litri di antivegetativa", "Pulizia carena a Bianchi, 2 ore"]} />}
      <div className="space-y-1.5">
        <L>Cliente</L>
        {cliente ? (
          <>
          <div className="flex items-center gap-2 p-3 rounded-md border border-primary/40 bg-primary/5" data-testid="cliente-scelto">
            <div className="flex-1"><div className="font-semibold">{cliente.cognome} {cliente.nome}</div><div className="text-xs text-muted-foreground">{cliente.tipo_barca} {cliente.lunghezza ? `· ${cliente.lunghezza} m` : ""}</div></div>
            <button onClick={() => setF((s) => ({ ...s, cliente_id: "", cliente_nuovo: "" }))} data-testid="btn-cambia-cliente"><X className="w-4 h-4" /></button>
          </div>
          {cliente.memo && (
            <div className="flex gap-2 p-3 rounded-md border border-amber-300 bg-amber-50 text-amber-950" data-testid="cliente-memo">
              <StickyNote className="w-5 h-5 shrink-0 text-amber-700" />
              <div><div className="text-[11px] uppercase tracking-wide font-semibold text-amber-800">Memo del cantiere</div><div className="text-sm whitespace-pre-wrap mt-0.5">{cliente.memo}</div></div>
            </div>
          )}
          </>
        ) : (
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca cognome, nome o barca…" className="pl-9 h-12" data-testid="input-cerca-cliente" />
            {q.trim().length >= 3 && (
              <div className={`${filtrati.length > 0 ? "absolute z-20 left-0 right-0 mt-1 bg-card border rounded-md shadow-lg divide-y max-h-64 overflow-y-auto" : "mt-1"}`}>
                {filtrati.map((c) => (
                  <button key={c.id} onClick={() => { set("cliente_id", c.id); setQ(""); }} className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm" data-testid={`cliente-opt-${c.id}`}>
                    <div className="font-medium">{c.cognome} {c.nome}</div><div className="text-xs text-muted-foreground">{c.tipo_barca}</div>
                  </button>
                ))}
                <button onClick={() => { set("cliente_nuovo", q.trim()); setQ(""); }} className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm text-primary border border-dashed border-primary/40 rounded-md bg-primary/5" data-testid="btn-cliente-nuovo">
                  <div className="font-medium">+ Nuovo cliente: "{q.trim()}"</div><div className="text-xs text-muted-foreground">Non in archivio · verrà creato come cliente esterno</div>
                </button>
              </div>
            )}
            {clienti.length === 0 && <div className="text-xs text-amber-700 mt-1">Nessun cliente scaricato: premi l'icona aggiorna in alto quando sei online.</div>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><L>Data</L><Input type="date" value={f.data} onChange={(e) => set("data", e.target.value)} className="h-12" data-testid="input-mobile-data" /></div>
        <div className="space-y-1.5"><L>Ore lavoro</L><Input type="number" inputMode="decimal" step="0.5" min="0" value={f.ore} onChange={(e) => set("ore", e.target.value)} placeholder="es. 10" className="h-12 font-mono-num" data-testid="input-mobile-ore" /></div>
      </div>
      <div className="space-y-1.5"><L>Tipo</L>
        <Select value={f.tipo} onValueChange={(v) => set("tipo", v)}>
          <SelectTrigger className="h-12" data-testid="select-mobile-tipo"><SelectValue /></SelectTrigger>
          <SelectContent>{TIPI.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><L>Lavoro eseguito</L><Textarea rows={3} value={f.descrizione} onChange={(e) => set("descrizione", e.target.value)} placeholder="Es. Sostituita pompa sentina, riparazione motore" data-testid="input-mobile-descrizione" /></div>
      <div className="space-y-1.5"><L>Materiali (note)</L><Input value={f.materiali} onChange={(e) => set("materiali", e.target.value)} placeholder="Es. pompa 12V, 2 fascette" className="h-12" data-testid="input-mobile-materiali" /></div>

      {articoli.length > 0 && (
        <div className="space-y-1.5"><L>Articoli dal magazzino</L>
          {f.articoli.map((a, i) => {
            const art = articoli.find((x) => x.id === a.articolo_id);
            return (
              <div key={a.articolo_id} className="flex items-center gap-2 text-sm" data-testid={`mobile-art-${i}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-base leading-tight whitespace-normal">{art?.nome}</div>
                  <div className="text-xs text-muted-foreground font-mono-num" data-testid={`mobile-art-prezzo-${i}`}>{fmtEuro(art?.prezzo_pubblico || 0)} cad.{(Number(a.quantita) || 0) > 1 ? ` · tot. ${fmtEuro((art?.prezzo_pubblico || 0) * Number(a.quantita))}` : ""} <span className="font-sans">IVA incl.</span></div>
                </div>
                <Input type="number" inputMode="decimal" min="0.5" step="0.5" value={a.quantita} onChange={(e) => set("articoli", f.articoli.map((x, j) => j === i ? { ...x, quantita: e.target.value } : x))} className="w-20 h-10 text-right" />
                <button onClick={() => set("articoli", f.articoli.filter((_, j) => j !== i))}><X className="w-4 h-4 text-destructive" /></button>
              </div>
            );
          })}
          <div className="flex gap-2 items-end">
            <div className="flex-1"><ArticoloPicker articoli={articoli} exclude={f.articoli.map((a) => a.articolo_id)} onSelect={(a) => addArt(a.id)} showPrezzo filtri placeholder="+ Cerca articolo (codice o nome)…" testId="select-mobile-articolo" /></div>
            <BarcodeButton label="" size="icon" className="h-10 w-10 shrink-0" onCode={scansiona} testId="btn-mobile-barcode" />
          </div>
        </div>
      )}

      <div className="space-y-1.5" data-testid="mobile-articoli-liberi">
        <div className="flex items-center justify-between gap-2">
          <L>Altri articoli (non in magazzino)</L>
          <div className="flex items-center gap-1.5">
            <ListinoPicker onAdd={addDaListino} fetchTariffe={fetchTariffe} testId="btn-mobile-listino" />
            <Button size="sm" variant="outline" onClick={addLibero} data-testid="btn-mobile-aggiungi-articolo"><Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi</Button>
          </div>
        </div>
        {f.articoli_liberi.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-sm flex-wrap" data-testid={`mobile-art-lib-${i}`}>
            <Input value={a.descrizione} onChange={(e) => setLibero(i, "descrizione", e.target.value)} placeholder="Descrizione articolo" className="flex-1 min-w-[150px] h-10" data-testid={`mobile-art-lib-descr-${i}`} />
            <Input type="number" inputMode="decimal" min="0" step="0.5" value={a.quantita} onChange={(e) => setLibero(i, "quantita", e.target.value)} className="w-16 h-10 text-right" placeholder="Q.tà" data-testid={`mobile-art-lib-qty-${i}`} />
            {a.unita && <span className="text-xs text-muted-foreground" data-testid={`mobile-art-lib-unita-${i}`}>{a.unita}</span>}
            <div className="relative w-24"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">€</span><Input type="number" inputMode="decimal" min="0" step="0.01" value={a.prezzo_unitario} onChange={(e) => setLibero(i, "prezzo_unitario", e.target.value)} className="pl-6 h-10 text-right" placeholder="Prezzo" data-testid={`mobile-art-lib-price-${i}`} /></div>
            <button onClick={() => set("articoli_liberi", f.articoli_liberi.filter((_, j) => j !== i))} data-testid={`mobile-art-lib-del-${i}`}><X className="w-4 h-4 text-destructive" /></button>
          </div>
        ))}
      </div>

      <Button onClick={salva} className="w-full h-12 bg-primary hover:bg-primary/90 text-base" data-testid="btn-mobile-salva"><Save className="w-4 h-4 mr-2" /> {iniziale ? "Aggiorna lavoro" : "Salva lavoro"}</Button>
    </div>
  );
}
