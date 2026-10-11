import { useCallback, useEffect, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Pencil, Plus, ScanBarcode, Search, Package } from "lucide-react";

export default function ScanBarcodeDialog({ open, onOpenChange, onEdit, onNuovo, onChanged }) {
  const [codice, setCodice] = useState("");
  const [manuale, setManuale] = useState("");
  const [art, setArt] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [qta, setQta] = useState("1");
  const [clienteId, setClienteId] = useState("none");
  const [clienti, setClienti] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setCodice(""); setArt(null); setNotFound(false); setQta("1"); setClienteId("none"); setManuale(""); return; }
    api.get("/clienti", { params: { anno: new Date().getFullYear() } }).then((r) => setClienti(r.data)).catch(() => {});
  }, [open]);

  const cerca = useCallback(async (code) => {
    setCodice(code); setBusy(true);
    try {
      const r = await api.get(`/magazzino/articoli/barcode/${encodeURIComponent(code)}`);
      if (r.data.trovato) { setArt(r.data.articolo); setNotFound(false); }
      else { setArt(null); setNotFound(true); }
    } catch { toast.error("Errore nella ricerca"); }
    finally { setBusy(false); }
  }, []);

  const reset = () => { setCodice(""); setArt(null); setNotFound(false); setQta("1"); };

  const movimento = async (tipo) => {
    const q = parseFloat(String(qta).replace(",", "."));
    if (!q || q <= 0) return toast.error("Inserisci una quantità positiva");
    const cl = clienti.find((c) => c.id === clienteId);
    setBusy(true);
    try {
      await api.post("/magazzino/movimenti", {
        articolo_id: art.id, tipo, quantita: q, motivo: `${tipo === "carico" ? "Carico" : "Scarico"} da scansione`,
        cliente_id: cl?.id || null, cliente_nome: cl ? `${cl.cognome} ${cl.nome}`.trim() : "",
      });
      const nuova = tipo === "carico" ? Number(art.quantita) + q : Number(art.quantita) - q;
      toast[nuova < 0 ? "warning" : "success"](`${tipo === "carico" ? "Caricato" : "Scaricato"} ${q} ${art.unita_misura || "pz"} · ${art.nome} — giacenza ${nuova}${nuova < 0 ? " (NEGATIVA)" : ""}`);
      onChanged?.(); reset();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore movimento"); }
    finally { setBusy(false); }
  };

  const scanning = open && !art && !notFound;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-md p-0 overflow-hidden" data-testid="scan-barcode-dialog">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="font-display flex items-center gap-2"><ScanBarcode className="w-5 h-5 text-primary" /> Scansiona codice a barre</DialogTitle>
          <DialogDescription>Inquadra il codice: carica, scarica o modifica l'articolo. La fotocamera resta attiva per il codice successivo.</DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 space-y-3">
          {scanning && (
            <>
              <BarcodeScanner onResult={cerca} active={scanning} />
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manuale.trim()) cerca(manuale.trim()); }}>
                <Input value={manuale} onChange={(e) => setManuale(e.target.value)} placeholder="…oppure digita il codice" className="font-mono-num" data-testid="scan-codice-manuale" />
                <Button type="submit" variant="outline" size="icon" disabled={busy} data-testid="scan-cerca-manuale"><Search className="w-4 h-4" /></Button>
              </form>
            </>
          )}

          {notFound && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-3" data-testid="scan-non-trovato">
              <div className="text-sm">Nessun articolo con codice <span className="font-mono-num font-semibold">{codice}</span></div>
              <Button onClick={() => { onNuovo(codice); onOpenChange(false); }} className="w-full bg-primary hover:bg-primary/90" data-testid="scan-nuovo-articolo"><Plus className="w-4 h-4 mr-1.5" /> Nuovo articolo con questo codice</Button>
              <Button variant="ghost" onClick={reset} className="w-full" data-testid="scan-riprova">Scansiona di nuovo</Button>
            </div>
          )}

          {art && (
            <div className="space-y-3" data-testid="scan-articolo-trovato">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  {art.immagine_base64 ? <img src={art.immagine_base64} alt="" className="w-14 h-14 rounded object-cover shrink-0" /> : <div className="w-14 h-14 rounded bg-primary/10 grid place-items-center shrink-0"><Package className="w-6 h-6 text-primary" /></div>}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-base leading-snug" data-testid="scan-art-nome">{art.nome}</div>
                    <div className="text-xs text-muted-foreground font-mono-num mt-0.5">{art.codice || "—"}{art.barcode && art.barcode !== art.codice ? ` · ${art.barcode}` : ""}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="rounded-md bg-card border border-border p-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Giacenza</div><div className={`font-mono-num text-lg font-semibold ${Number(art.quantita) <= Number(art.scorta_minima) ? "text-destructive" : ""}`} data-testid="scan-art-giacenza">{Number(art.quantita)} <span className="text-xs font-normal">{art.unita_misura || "pz"}</span></div></div>
                  <div className="rounded-md bg-card border border-border p-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Acquisto</div><div className="font-mono-num text-lg">{fmtEuro(art.prezzo_acquisto || 0)}</div></div>
                  <div className="rounded-md bg-card border border-border p-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Vendita</div><div className="font-mono-num text-lg font-semibold text-primary" data-testid="scan-art-prezzo">{fmtEuro(art.prezzo_listino || 0)}</div><div className="text-[10px] text-muted-foreground">{fmtEuro((art.prezzo_listino || 0) * 1.22)} IVA incl.</div></div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Quantità</Label><Input type="number" inputMode="decimal" min="0" step="0.5" value={qta} onChange={(e) => setQta(e.target.value)} className="h-11 text-lg font-mono-num" data-testid="scan-qta" /></div>
                <div>
                  <Label className="text-xs">Cliente / lavoro <span className="text-muted-foreground font-normal">(opz.)</span></Label>
                  <Select value={clienteId} onValueChange={setClienteId}>
                    <SelectTrigger className="h-11" data-testid="scan-cliente"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nessuno —</SelectItem>
                      {clienti.map((c) => <SelectItem key={c.id} value={c.id}>{c.cognome} {c.nome}{c.tipo_barca ? ` · ${c.tipo_barca}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => movimento("carico")} disabled={busy} className="h-12 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="scan-carica"><ArrowUpCircle className="w-5 h-5 mr-1.5" /> Carica</Button>
                <Button onClick={() => movimento("scarico")} disabled={busy} className="h-12 bg-primary hover:bg-primary/90" data-testid="scan-scarica"><ArrowDownCircle className="w-5 h-5 mr-1.5" /> Scarica</Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => { onEdit(art); onOpenChange(false); }} data-testid="scan-modifica"><Pencil className="w-4 h-4 mr-1.5" /> Modifica articolo</Button>
                <Button variant="ghost" onClick={reset} data-testid="scan-prossimo"><ScanBarcode className="w-4 h-4 mr-1.5" /> Prossimo codice</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
