import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, FileText, Image as ImageIcon, Type, Trash2, Eye, Search, ChevronRight, FolderOpen, Pencil, Check, X } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

const ICONA = { pdf: FileText, immagine: ImageIcon, testo: Type };

export default function SchedeTab() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState("");
  const [meta, setMeta] = useState({ titolo: "", marca: "", modello: "" });
  const [testo, setTesto] = useState("");
  const [busy, setBusy] = useState(false);
  const [vedi, setVedi] = useState(null);
  const [marcaSel, setMarcaSel] = useState("");
  const [aperti, setAperti] = useState({});
  const [editMeta, setEditMeta] = useState(null); // {id, titolo, marca, modello}
  const salvaMeta = async () => {
    if (!editMeta?.titolo.trim()) return toast.error("Il titolo non può essere vuoto");
    try { await api.patch(`/officina/schede/${editMeta.id}`, { titolo: editMeta.titolo, marca: editMeta.marca, modello: editMeta.modello }); toast.success("Scheda aggiornata"); setEditMeta(null); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
  };
  const [progresso, setProgresso] = useState(null); // {fatti, totale, corrente, esiti:[]}
  const fileRef = useRef(null);
  const dirRef = useRef(null);
  const load = () => api.get("/officina/schede").then((r) => setList(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const upd = (k, v) => setMeta((s) => ({ ...s, [k]: v }));

  const OK = /\.(pdf|png|jpe?g|webp|heic|heif|txt)$/i;
  // Legge ricorsivamente cartelle trascinate (webkitGetAsEntry) → [{file, percorso}]
  const leggiEntries = async (items) => {
    const out = [];
    const walk = (entry, path) => new Promise((res) => {
      if (entry.isFile) entry.file((f) => { out.push({ file: f, percorso: `${path}${f.name}` }); res(); }, () => res());
      else if (entry.isDirectory) { const reader = entry.createReader(); const tutti = []; const leggi = () => reader.readEntries(async (es) => { if (!es.length) { for (const e of tutti) await walk(e, `${path}${entry.name}/`); res(); } else { tutti.push(...es); leggi(); } }, () => res()); leggi(); }
      else res();
    });
    for (const it of items) { const e = it.webkitGetAsEntry?.(); if (e) await walk(e, ""); else if (it.getAsFile?.()) out.push({ file: it.getAsFile(), percorso: it.getAsFile().name }); }
    return out;
  };

  const caricaMolti = async (voci) => {
    const validi = voci.filter((v) => OK.test(v.file.name));
    if (!validi.length) return toast.error("Nessun PDF/immagine/TXT trovato");
    const singolo = validi.length === 1;
    setBusy(true); setProgresso({ fatti: 0, totale: validi.length, corrente: validi[0].file.name, esiti: [] });
    for (const [i, v] of validi.entries()) {
      setProgresso((p) => ({ ...p, corrente: v.file.name }));
      const fd = new FormData();
      fd.append("file", v.file); fd.append("percorso", v.percorso || v.file.name);
      if (singolo) { fd.append("titolo", meta.titolo); fd.append("marca", meta.marca); fd.append("modello", meta.modello); } else fd.append("auto", "1");
      try {
        const r = await api.post("/officina/schede/upload", fd, { headers: { "Content-Type": "multipart/form-data" }, timeout: 300000 });
        setProgresso((p) => ({ ...p, fatti: i + 1, esiti: [...p.esiti, { nome: v.file.name, ok: true, marca: r.data.marca, modello: r.data.modello, caratteri: r.data.caratteri }] }));
      } catch (e) {
        setProgresso((p) => ({ ...p, fatti: i + 1, esiti: [...p.esiti, { nome: v.file.name, ok: false, errore: e.response?.data?.detail || "errore" }] }));
      }
    }
    setBusy(false); setMeta({ titolo: "", marca: "", modello: "" }); load();
    if (fileRef.current) fileRef.current.value = ""; if (dirRef.current) dirRef.current.value = "";
    toast.success(`Caricamento completato: ${validi.length} file`);
  };
  const caricaFile = (files, conPercorso = false) => caricaMolti(Array.from(files || []).map((f) => ({ file: f, percorso: conPercorso ? (f.webkitRelativePath || f.name) : f.name })));
  const salvaTesto = async () => {
    if (!meta.titolo.trim() || !testo.trim()) return toast.error("Titolo e testo obbligatori");
    setBusy(true);
    try { await api.post("/officina/schede/testo", { ...meta, testo }); toast.success("Nota tecnica salvata"); setTesto(""); setMeta({ titolo: "", marca: "", modello: "" }); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore"); } finally { setBusy(false); }
  };
  const del = async (s) => {
    if (!(await confirmDialog(`Eliminare la scheda "${s.titolo}"? L'assistente non la userà più.`, { okLabel: "Elimina" }))) return;
    await api.delete(`/officina/schede/${s.id}`); toast.success("Eliminata"); load();
  };
  const apri = async (s) => { const r = await api.get(`/officina/schede/${s.id}`); setVedi(r.data); };

  const ql = q.trim().toLowerCase();
  const vis = list.filter((s) => (!ql || `${s.titolo} ${s.marca} ${s.modello} ${s.nome_file}`.toLowerCase().includes(ql)) && (!marcaSel || (s.marca || "") === marcaSel));
  const marche = [...new Set(list.map((s) => s.marca || "").filter(Boolean))].sort();
  const gruppi = Object.entries(vis.reduce((acc, s) => { const k = [s.marca, s.modello].filter(Boolean).join(" ") || "Senza marca/modello"; (acc[k] = acc[k] || []).push(s); return acc; }, {})).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6" data-testid="schede-tab">
      <Card className="p-5 space-y-3">
        <div className="label-mini">Nuova scheda tecnica</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input value={meta.titolo} onChange={(e) => upd("titolo", e.target.value)} placeholder="Titolo (es. Manuale officina DF140)" data-testid="scheda-titolo" />
          <Input value={meta.marca} onChange={(e) => upd("marca", e.target.value)} placeholder="Marca (es. Suzuki)" data-testid="scheda-marca" />
          <Input value={meta.modello} onChange={(e) => upd("modello", e.target.value)} placeholder="Modello (es. DF140A)" data-testid="scheda-modello" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className={`rounded-xl border-2 border-dashed border-border p-5 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-colors ${busy ? "opacity-60 pointer-events-none" : ""}`} data-testid="scheda-dropzone"
            onDragOver={(e) => e.preventDefault()} onDrop={async (e) => { e.preventDefault(); const items = e.dataTransfer.items; caricaMolti(items?.length && items[0].webkitGetAsEntry ? await leggiEntries(Array.from(items)) : Array.from(e.dataTransfer.files).map((f) => ({ file: f, percorso: f.name }))); }}>
            <Upload className="w-6 h-6 mx-auto text-primary mb-2" />
            <div className="text-sm font-medium">Trascina qui PDF, foto o un'intera cartella di manuali</div>
            <div className="text-xs text-muted-foreground mt-1">Con più file, marca e modello vengono ricavati dal nome del file e dalle cartelle (es. <i>Suzuki/DF140A manuale.pdf</i>). I campi sopra valgono solo per un file singolo.</div>
            <input ref={fileRef} type="file" multiple accept=".pdf,image/*,.txt" className="hidden" onChange={(e) => caricaFile(e.target.files)} data-testid="scheda-file" />
            <div className="mt-3"><Button asChild size="sm" variant="outline" type="button"><span onClick={(e) => { e.preventDefault(); dirRef.current?.click(); }} data-testid="btn-scegli-cartella"><FolderOpen className="w-3.5 h-3.5 mr-1" /> Scegli una cartella</span></Button></div>
            <input ref={dirRef} type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={(e) => caricaFile(e.target.files, true)} data-testid="scheda-cartella" />
          </label>
          <div className="space-y-2">
            <Textarea value={testo} onChange={(e) => setTesto(e.target.value)} rows={4} placeholder="Oppure scrivi qui una nota tecnica (valori, procedure, codici…)" data-testid="scheda-testo" />
            <Button onClick={salvaTesto} disabled={busy} size="sm" variant="outline" data-testid="btn-salva-nota"><Type className="w-3.5 h-3.5 mr-1" /> Salva nota tecnica</Button>
          </div>
        </div>
        {progresso && (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-xs space-y-1.5" data-testid="scheda-progresso">
            <div className="flex items-center justify-between"><span className="font-medium">{busy ? `Caricamento ${progresso.fatti + 1 > progresso.totale ? progresso.totale : progresso.fatti + 1}/${progresso.totale}: ${progresso.corrente}` : `Completato: ${progresso.esiti.filter((e) => e.ok).length} ok, ${progresso.esiti.filter((e) => !e.ok).length} errori`}</span>{!busy && <button onClick={() => setProgresso(null)} className="underline" data-testid="btn-chiudi-progresso">chiudi</button>}</div>
            <div className="h-1.5 rounded bg-border overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(progresso.fatti / progresso.totale) * 100}%` }} /></div>
            <div className="max-h-32 overflow-y-auto space-y-0.5">
              {progresso.esiti.map((e, i) => <div key={i} className={e.ok ? "text-muted-foreground" : "text-destructive"} data-testid="scheda-esito">{e.ok ? "✓" : "✗"} {e.nome} {e.ok ? `→ ${[e.marca, e.modello].filter(Boolean).join(" ") || "marca/modello non riconosciuti"} · ${e.caratteri} caratteri` : `— ${e.errore}`}</div>)}
            </div>
          </div>
        )}
        {busy && !progresso && <div className="text-xs text-primary animate-pulse" data-testid="scheda-busy">Lettura e indicizzazione in corso…</div>}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca scheda…" className="pl-9" data-testid="schede-cerca" /></div>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setMarcaSel("")} className={`text-xs rounded-full border px-3 py-1 ${!marcaSel ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`} data-testid="filtro-marca-tutte">Tutte</button>
          {marche.map((m) => <button key={m} onClick={() => setMarcaSel(m === marcaSel ? "" : m)} className={`text-xs rounded-full border px-3 py-1 ${marcaSel === m ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`} data-testid={`filtro-marca-${m}`}>{m}</button>)}
        </div>
        <div className="text-xs text-muted-foreground ml-auto" data-testid="schede-conteggio">{vis.length} schede · {gruppi.length} modelli</div>
      </div>
      <datalist id="marche-schede">{marche.map((m) => <option key={m} value={m} />)}</datalist>
      <div className="space-y-2">
        {gruppi.map(([nome, items]) => {
          const open = aperti[nome] ?? (gruppi.length <= 3 || !!ql);
          return (
            <Card key={nome} className="overflow-hidden" data-testid={`gruppo-${nome.replace(/\W+/g, "-")}`}>
              <button onClick={() => setAperti((a) => ({ ...a, [nome]: !open }))} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
                <span className="font-medium flex-1">{nome}</span>
                <Badge variant="secondary" className="text-[10px] font-normal">{items.length} {items.length === 1 ? "scheda" : "schede"}</Badge>
              </button>
              {open && <div className="border-t border-border divide-y divide-border">
                {items.map((s) => { const I = ICONA[s.tipo] || FileText; const inEdit = editMeta?.id === s.id; return (
                  <div key={s.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap" data-testid={`scheda-row-${s.id}`}>
                    <I className="w-4 h-4 text-primary shrink-0" />
                    {inEdit ? (
                      <div className="flex-1 min-w-[240px] grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid={`scheda-edit-${s.id}`}>
                        <Input value={editMeta.titolo} onChange={(e) => setEditMeta((m) => ({ ...m, titolo: e.target.value }))} placeholder="Titolo" className="h-8 text-sm" data-testid="edit-titolo" />
                        <Input value={editMeta.marca} onChange={(e) => setEditMeta((m) => ({ ...m, marca: e.target.value }))} placeholder="Marca" className="h-8 text-sm" list="marche-schede" data-testid="edit-marca" />
                        <Input value={editMeta.modello} onChange={(e) => setEditMeta((m) => ({ ...m, modello: e.target.value }))} placeholder="Modello" className="h-8 text-sm" onKeyDown={(e) => e.key === "Enter" && salvaMeta()} data-testid="edit-modello" />
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.titolo}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{s.tipo}{s.nome_file ? ` · ${s.nome_file}` : ""} · {(s.caratteri || 0).toLocaleString("it-IT")} caratteri · {s.n_chunks} blocchi</div>
                      </div>
                    )}
                    {inEdit ? (<>
                      <Button size="sm" className="h-8 bg-primary hover:bg-primary/90" onClick={salvaMeta} data-testid="btn-salva-meta"><Check className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditMeta(null)} data-testid="btn-annulla-meta"><X className="w-4 h-4" /></Button>
                    </>) : (<>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Modifica titolo, marca e modello" onClick={() => setEditMeta({ id: s.id, titolo: s.titolo || "", marca: s.marca || "", modello: s.modello || "" })} data-testid={`btn-edit-scheda-${s.id}`}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => apri(s)} data-testid={`btn-vedi-scheda-${s.id}`}><Eye className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(s)} data-testid={`btn-del-scheda-${s.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </>)}
                  </div>
                ); })}
              </div>}
            </Card>
          );
        })}
        {!vis.length && <Card className="p-8 text-center text-sm text-muted-foreground" data-testid="schede-vuote">Nessuna scheda. Carica manuali, schede motore o note tecniche: l'assistente risponde solo in base a queste.</Card>}
      </div>

      <Dialog open={!!vedi} onOpenChange={(o) => !o && setVedi(null)}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="scheda-dettaglio">
          <DialogHeader><DialogTitle className="font-display text-2xl">{vedi?.titolo}</DialogTitle><DialogDescription>{[vedi?.marca, vedi?.modello].filter(Boolean).join(" ")} · testo estratto ({vedi?.caratteri} caratteri)</DialogDescription></DialogHeader>
          <pre className="text-xs whitespace-pre-wrap font-sans bg-muted/40 rounded-md p-3 max-h-[60vh] overflow-y-auto">{vedi?.testo}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
