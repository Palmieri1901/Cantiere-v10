import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ControlloTotale } from "./ControlloTotale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, ScanLine, X, FileDown, AlertTriangle, Percent, Camera } from "lucide-react";
import { TIPI_SPESA } from "./common";
import { conversione, UNITA_SCELTA, normalizzaUm } from "@/lib/confezioni";

export default function ScanDDTDialog({ open, onOpenChange, fornitori, onDone, onFornitoreCreato }) {
  const [image, setImage] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileB64, setFileB64] = useState("");
  const [fileMime, setFileMime] = useState("");
  const [isPdf, setIsPdf] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState([]);
  const [spese, setSpese] = useState([]);
  const [fornitoreId, setFornitoreId] = useState("none");
  const [nuovoFornitore, setNuovoFornitore] = useState("");
  const [creando, setCreando] = useState(false);
  const creaFornitore = async () => {
    if (!nuovoFornitore.trim()) return;
    setCreando(true);
    try { const r = await api.post("/magazzino/fornitori", { nome: nuovoFornitore.trim() }); onFornitoreCreato?.(r.data); setFornitoreId(r.data.id); setNuovoFornitore(""); toast.success(`Fornitore "${r.data.nome}" creato`); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore creazione fornitore"); } finally { setCreando(false); }
  };
  const fornitoreMancante = fornitoreId === "none";
  const [saving, setSaving] = useState(false);
  const [aggiornaPrezzi, setAggiornaPrezzi] = useState(true);
  const [mantieniRicarico, setMantieniRicarico] = useState(true);

  useEffect(() => {
    if (open) {
      setImage(""); setFileName(""); setFileB64(""); setFileMime(""); setIsPdf(false);
      setResult(null); setRows([]); setSpese([]); setFornitoreId("none"); setNuovoFornitore("");
      setAggiornaPrezzi(true); setMantieniRicarico(true);
    }
  }, [open]);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("File max 8MB"); return; }
    const isPdfFile = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const r = new FileReader();
    r.onload = () => {
      const b64 = String(r.result);
      setFileB64(b64);
      setFileMime(file.type || (isPdfFile ? "application/pdf" : "image/jpeg"));
      setFileName(file.name);
      setIsPdf(isPdfFile);
      if (!isPdfFile) setImage(b64);
      else setImage("");
    };
    r.readAsDataURL(file);
  };

  const scan = async () => {
    if (!fileB64) return;
    setScanning(true);
    try {
      const payload = isPdf
        ? { file_base64: fileB64, mime_type: fileMime }
        : { image_base64: fileB64 };
      const { data } = await api.post("/magazzino/scan-ddt", payload);
      setResult(data);
      if (data.fornitore && fornitoreId === "none") {
        const n = data.fornitore.toLowerCase().replace(/[^a-z0-9]/g, "");
        const hit = fornitori.find((f) => { const fn = f.nome.toLowerCase().replace(/[^a-z0-9]/g, ""); return fn && (n.includes(fn) || fn.includes(n)); });
        if (hit) setFornitoreId(hit.id); else setNuovoFornitore(data.fornitore);
      }
      setRows((data.articoli || []).map((a, i) => ({
        ...a,
        unita_misura: normalizzaUm(a.unita_misura),
        pezzi_confezione: Number(a.pezzi_confezione) > 0 ? Number(a.pezzi_confezione) : "",
        categoria: a.categoria || "",
        categoria_confidenza: a.categoria_confidenza || "media",
        prezzo_listino_ivato: a.prezzo_listino_ivato ?? 0,
        sconto_percent: a.sconto_percent ?? 0,
        importo_netto: a.importo_netto ?? a.prezzo_unitario ?? 0,
        _sel: true,
        _i: i,
      })));
      setSpese((data.spese_accessorie || []).map((s, i) => ({
        ...s, _sel: true, _i: i,
      })));
      toast.success(`Trovati ${data.articoli?.length || 0} articoli e ${data.spese_accessorie?.length || 0} spese`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossibile analizzare il DDT");
    } finally {
      setScanning(false);
    }
  };

  const updateRow = (i, k, v) => setRows((rr) => rr.map((r) => r._i === i ? { ...r, [k]: v } : r));

  const IVA = 1.22;
  const conv = (um) => conversione(um);
  const updateRowDDT = (i, k, v) => setRows((rr) => rr.map((r) => {
    if (r._i !== i) return r;
    const nr = { ...r, [k]: v };
    const listino = Number(nr.prezzo_listino_ivato) || 0;
    const sconto = Number(nr.sconto_percent) || 0;
    const netto = Number(nr.importo_netto) || 0;
    if (k === "prezzo_listino_ivato" || k === "sconto_percent") {
      const listinoNoIva = listino / IVA;
      nr.importo_netto = +(listinoNoIva * (1 - sconto / 100)).toFixed(4);
      nr.prezzo_unitario = nr.importo_netto;
    } else if (k === "importo_netto") {
      const listinoNoIva = listino / IVA;
      if (listinoNoIva > 0) {
        const calc = (1 - netto / listinoNoIva) * 100;
        if (Number.isFinite(calc) && calc >= -0.5 && calc <= 99.5) {
          nr.sconto_percent = +calc.toFixed(2);
        }
      }
      nr.prezzo_unitario = netto;
    }
    return nr;
  }));

  const importa = async () => {
    const sel = rows.filter((r) => r._sel && (r.nome || r.codice));
    const speseSel = spese.filter((s) => s._sel && Number(s.importo) > 0);
    if (sel.length === 0 && speseSel.length === 0) { toast.error("Nessuna riga selezionata"); return; }
    if (fornitoreMancante) { toast.error("Seleziona o crea il fornitore prima di importare"); return; }
    setSaving(true);
    try {
      const r = await api.post("/magazzino/importa-articoli", {
        fornitore_id: fornitoreId,
        articoli: sel.map((a) => ({
          ...a,
          prezzo_unitario: Number(a.importo_netto ?? a.prezzo_unitario ?? 0),
        })),
        spese_accessorie: speseSel.map((s) => ({
          tipo: s.tipo, descrizione: s.descrizione, importo: Number(s.importo),
        })),
        documento_ref: result?.numero_ddt || "",
        data_documento: result?.data || null,
        aggiorna_prezzi: aggiornaPrezzi,
        mantieni_ricarico: mantieniRicarico,
      });
      const pa = r.data.prezzi_aggiornati || 0;
      const sp = r.data.spese_salvate || 0;
      toast.success(
        `Import: ${r.data.created} nuovi, ${r.data.updated} ricaricati${pa > 0 ? `, ${pa} prezzi aggiornati` : ""}${sp > 0 ? `, ${sp} spese` : ""}`
      );
      onDone();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore importazione");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" data-testid="dialog-scan-ddt">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-primary" /> Scan DDT con AI
          </DialogTitle>
          <DialogDescription>
            Carica una foto <b>oppure un file PDF</b> del DDT del fornitore: l'AI estrae tutte le righe articolo. Rivedi, deseleziona le righe da scartare e importa.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">DDT (foto o PDF)</Label>
              <div className="mt-2">
                {image ? (
                  <div className="relative">
                    <img src={image} alt="" className="w-full rounded-md border max-h-48 object-contain bg-muted/20" />
                    <button type="button" onClick={() => { setImage(""); setFileB64(""); setFileName(""); setResult(null); setRows([]); }} className="absolute top-2 right-2 bg-destructive text-white rounded-full p-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : fileB64 && isPdf ? (
                  <div className="relative border rounded-md p-4 bg-muted/20 flex items-center gap-3">
                    <div className="w-12 h-14 bg-destructive/10 text-destructive rounded flex items-center justify-center border border-destructive/30 shrink-0">
                      <FileDown className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{fileName}</div>
                      <div className="text-xs text-muted-foreground">PDF · verrà convertita la prima pagina prima dell'analisi</div>
                    </div>
                    <button type="button" onClick={() => { setFileB64(""); setFileName(""); setIsPdf(false); setResult(null); setRows([]); }} className="bg-destructive text-white rounded-full p-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block cursor-pointer border-2 border-dashed border-border rounded-md p-6 text-center hover:bg-muted/30">
                      <ScanLine className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <div className="text-sm font-semibold">Foto o PDF da file</div>
                      <div className="text-xs text-muted-foreground mt-1">JPG / PNG / PDF · max 8MB</div>
                      <input type="file" accept="image/*,application/pdf" hidden onChange={onFile} data-testid="input-ddt-file" />
                    </label>
                    <label className="block cursor-pointer border-2 border-dashed border-border rounded-md p-6 text-center hover:bg-muted/30">
                      <Camera className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <div className="text-sm font-semibold">Scatta foto</div>
                      <div className="text-xs text-muted-foreground mt-1">l'AI gestisce anche foto storte</div>
                      <input type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid="input-ddt-camera" />
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Fornitore <span className="text-destructive">*</span> (obbligatorio)</Label>
              <Select value={fornitoreId} onValueChange={setFornitoreId}>
                <SelectTrigger className={`mt-2 ${fornitoreMancante && rows.length > 0 ? "border-destructive" : ""}`} data-testid="ddt-select-fornitore"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seleziona fornitore —</SelectItem>
                  {fornitori.map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {result?.fornitore && (
                <p className="text-xs text-muted-foreground mt-2">AI ha letto: <b>{result.fornitore}</b>{!fornitoreMancante && " · associato"}</p>
              )}
              {fornitoreMancante && (
                <div className="mt-2 flex gap-1.5" data-testid="ddt-nuovo-fornitore">
                  <Input value={nuovoFornitore} onChange={(e) => setNuovoFornitore(e.target.value)} placeholder="Oppure crea nuovo fornitore…" className="h-9" data-testid="input-ddt-nuovo-fornitore" />
                  <Button variant="outline" className="h-9 shrink-0" onClick={creaFornitore} disabled={!nuovoFornitore.trim() || creando} data-testid="btn-ddt-crea-fornitore">{creando ? "…" : "Crea"}</Button>
                </div>
              )}
              <Button
                onClick={scan}
                disabled={!fileB64 || scanning}
                className="w-full mt-3 bg-primary hover:bg-primary/90"
                data-testid="btn-ddt-scan"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {scanning ? "Analisi…" : "Analizza DDT"}
              </Button>
            </div>
          </div>

          {rows.length > 0 && <ControlloTotale result={result} rows={rows} spese={spese} />}
          {rows.length > 0 && (
            <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="ddt-price-options">
              <div className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5" /> Gestione prezzi articoli esistenti
              </div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={aggiornaPrezzi}
                  onChange={(e) => setAggiornaPrezzi(e.target.checked)}
                  data-testid="ddt-check-aggiorna"
                />
                <span>
                  <b>Aggiorna prezzo di acquisto</b>
                  <span className="block text-xs text-muted-foreground">Se l'articolo è già a listino, sostituisci il prezzo con quello nuovo del DDT.</span>
                </span>
              </label>
              <label className={`flex items-start gap-2 text-sm cursor-pointer ${!aggiornaPrezzi ? "opacity-40" : ""}`}>
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={!aggiornaPrezzi}
                  checked={mantieniRicarico}
                  onChange={(e) => setMantieniRicarico(e.target.checked)}
                  data-testid="ddt-check-mantieni-ricarico"
                />
                <span>
                  <b>Mantieni il ricarico corrente</b>
                  <span className="block text-xs text-muted-foreground">Ricalcola automaticamente il prezzo di vendita conservando la percentuale di ricarico attuale (se non presente usa il default della categoria).</span>
                </span>
              </label>
            </div>
          )}
          {rows.length > 0 && (
            <datalist id="ddt-categorie-suggerite">
              {["Motore","Ferramenta","Elettrica","Nautica","Vernici","Coperture","Idraulica","Carburante","Consumabili","Altro"].map((c) => <option key={c} value={c} />)}
            </datalist>
          )}
          {rows.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="min-w-[80px]">Codice</TableHead>
                    <TableHead className="min-w-[180px]">Nome</TableHead>
                    <TableHead className="min-w-[110px]" title="Categoria dedotta automaticamente dalla AI (modificabile)">Categoria</TableHead>
                    <TableHead className="text-center w-20">U.M.</TableHead>
                    <TableHead className="text-right w-20">Q.tà</TableHead>
                    <TableHead className="text-right w-20" title="Contenuto per confezione (facoltativo): compila solo se il prezzo è della confezione intera">Contenuto</TableHead>
                    <TableHead className="text-right w-28" title="Prezzo unitario IVA compresa">Listino IVA €</TableHead>
                    <TableHead className="text-right w-20" title="Sconto in percentuale">Sconto %</TableHead>
                    <TableHead className="text-right w-32" title="Prezzo di acquisto: netto scontato IVA esclusa">Netto acquisto €</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r._i} data-testid={`ddt-row-${r._i}`}>
                      <TableCell>
                        <input type="checkbox" checked={r._sel} onChange={(e) => updateRow(r._i, "_sel", e.target.checked)} data-testid={`ddt-check-${r._i}`} />
                      </TableCell>
                      <TableCell><Input value={r.codice} onChange={(e) => updateRow(r._i, "codice", e.target.value)} className="h-8" /></TableCell>
                      <TableCell><Input value={r.nome} onChange={(e) => updateRow(r._i, "nome", e.target.value)} className="h-8" /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Input
                            value={r.categoria || ""}
                            onChange={(e) => updateRow(r._i, "categoria", e.target.value)}
                            list="ddt-categorie-suggerite"
                            placeholder="AI…"
                            className={`h-8 ${r.categoria ? "border-primary/40 text-primary font-medium" : ""}`}
                            data-testid={`ddt-cat-${r._i}`}
                          />
                          {r.categoria && r.categoria_confidenza && r.categoria_confidenza !== "alta" && (
                            <span
                              title={r.categoria_confidenza === "bassa"
                                ? "AI poco sicura — controlla e conferma"
                                : "AI incerta — verifica la categoria"}
                              className={r.categoria_confidenza === "bassa" ? "text-destructive" : "text-amber-500"}
                              data-testid={`ddt-cat-warn-${r._i}`}
                            >
                              <AlertTriangle className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select value={UNITA_SCELTA.includes(r.unita_misura) ? r.unita_misura : "pz"} onValueChange={(v) => updateRow(r._i, "unita_misura", v)}>
                          <SelectTrigger className="h-8 text-xs px-2" data-testid={`ddt-um-${r._i}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {UNITA_SCELTA.map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input type="number" step="0.01" value={r.quantita} onChange={(e) => updateRow(r._i, "quantita", Number(e.target.value))} className="h-8 text-right" /></TableCell>
                      <TableCell>
                        {conv(r.unita_misura) ? (
                          <Input type="number" min="0" step="any" value={r.pezzi_confezione || ""} onChange={(e) => updateRow(r._i, "pezzi_confezione", e.target.value === "" ? "" : Number(e.target.value))} placeholder="facolt." className="h-8 text-right" title={`${conv(r.unita_misura).etichetta} contenuti in 1 ${r.unita_misura}: compila solo se il prezzo del DDT è della confezione intera; prezzo e giacenza verranno convertiti a ${conv(r.unita_misura).finale}. Lascia vuoto se il prezzo è già al pezzo.`} data-testid={`ddt-pzcf-${r._i}`} />
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01"
                          value={r.prezzo_listino_ivato ?? 0}
                          onChange={(e) => updateRowDDT(r._i, "prezzo_listino_ivato", Number(e.target.value))}
                          className="h-8 text-right font-mono-num"
                          data-testid={`ddt-listino-${r._i}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.1"
                          value={r.sconto_percent ?? 0}
                          onChange={(e) => updateRowDDT(r._i, "sconto_percent", Number(e.target.value))}
                          className="h-8 text-right font-mono-num"
                          data-testid={`ddt-sconto-${r._i}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number" step="0.01"
                          value={r.importo_netto ?? r.prezzo_unitario ?? 0}
                          onChange={(e) => updateRowDDT(r._i, "importo_netto", Number(e.target.value))}
                          className="h-8 text-right font-mono-num bg-primary/5 border-primary/30 font-semibold"
                          data-testid={`ddt-netto-${r._i}`}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-2 text-[11px] text-muted-foreground bg-muted/20 border-t border-border">
                Modifica <b>Listino IVA</b> o <b>Sconto</b> per ricalcolare il <b>Netto</b>. Modifica direttamente il <b>Netto</b> per ricalcolare lo sconto. IVA assunta al 22%. Colonna <b>Contenuto</b> (facoltativa): compilala solo se il prezzo del DDT è della confezione/latta/rotolo intero, indicando pezzi/litri/metri/kg contenuti; prezzo e giacenza verranno convertiti all'unità base. Se il prezzo è già al pezzo lasciala vuota.
              </div>
            </div>
          )}

          {spese.length > 0 && (
            <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 overflow-hidden" data-testid="ddt-spese-preview">
              <div className="px-3 py-2 border-b border-primary/20 flex items-center gap-2">
                <Percent className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">Spese accessorie rilevate</span>
                <span className="text-[11px] text-muted-foreground ml-auto">Verranno salvate nel report Spese, non nel magazzino</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-primary/5">
                    <TableHead className="w-10"></TableHead>
                    <TableHead className="w-32">Tipo</TableHead>
                    <TableHead>Descrizione</TableHead>
                    <TableHead className="text-right w-32">Importo €</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spese.map((s) => (
                    <TableRow key={s._i} data-testid={`ddt-spesa-${s._i}`}>
                      <TableCell>
                        <input type="checkbox" checked={s._sel} onChange={(e) => setSpese((sp) => sp.map((x) => x._i === s._i ? { ...x, _sel: e.target.checked } : x))} />
                      </TableCell>
                      <TableCell>
                        <Select value={s.tipo} onValueChange={(v) => setSpese((sp) => sp.map((x) => x._i === s._i ? { ...x, tipo: v } : x))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIPI_SPESA.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input value={s.descrizione} onChange={(e) => setSpese((sp) => sp.map((x) => x._i === s._i ? { ...x, descrizione: e.target.value } : x))} className="h-8" /></TableCell>
                      <TableCell><Input type="number" step="0.01" value={s.importo} onChange={(e) => setSpese((sp) => sp.map((x) => x._i === s._i ? { ...x, importo: Number(e.target.value) } : x))} className="h-8 text-right font-mono-num" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
          {rows.length > 0 && fornitoreMancante && <span className="text-xs text-destructive self-center mr-auto" data-testid="ddt-avviso-fornitore">Seleziona o crea il fornitore per importare</span>}
          <Button
            onClick={importa}
            disabled={saving || rows.length === 0 || fornitoreMancante}
            className="bg-primary hover:bg-primary/90"
            data-testid="btn-ddt-import"
          >
            {saving ? "Importazione…" : `Importa ${rows.filter((r) => r._sel).length} articoli`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
