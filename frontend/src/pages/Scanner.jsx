import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Images, FileDown, Loader2, ScanLine } from "lucide-react";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { openBlob } from "@/pages/ddt/common";
import { elabora, leggiFile, trovaBordi } from "@/lib/scanImage";
import { TimbroCard } from "./scanner/TimbroCard";
import { PaginaCard } from "./scanner/PaginaCard";
import { TimbroEditor } from "./scanner/TimbroEditor";
import { RitaglioEditor } from "./scanner/RitaglioEditor";

export default function Scanner() {
  const cam = useRef(null);
  const gal = useRef(null);
  const [pagine, setPagine] = useState([]);
  const [timbro, setTimbro] = useState("");
  const [nome, setNome] = useState(`Scansione_${new Date().toLocaleDateString("it-IT").replace(/\//g, "-")}`);
  const [busy, setBusy] = useState("");
  const [edit, setEdit] = useState(null);
  const [crop, setCrop] = useState(null);
  const [pdf, setPdf] = useState({ url: null, open: false });

  const aggiungi = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy("add");
    try {
      const nuove = [];
      for (const f of files) {
        const src = await leggiFile(f);
        const angoli = await trovaBordi(src).catch(() => null);
        nuove.push({ id: crypto.randomUUID(), src, filtro: "documento", rot: 0, angoli, auto: !!angoli, img: await elabora(src, "documento", 0, angoli), timbri: [] });
      }
      setPagine((p) => [...p, ...nuove]);
      if (nuove.length === 1) setCrop(nuove[0].id);
      else if (nuove.some((p) => p.auto)) toast.success("Bordi dei fogli trovati in automatico: tocca Ritaglia per correggerli");
    } catch { toast.error("Immagine non leggibile"); } finally { setBusy(""); }
  };
  const aggiorna = async (id, patch) => {
    const p = { ...pagine.find((x) => x.id === id), ...patch };
    if (patch.rot !== undefined) p.angoli = await trovaBordi(p.src, p.rot).catch(() => null);
    if (patch.rot !== undefined || patch.angoli !== undefined) p.auto = patch.rot !== undefined && !!p.angoli;
    const img = await elabora(p.src, p.filtro, p.rot, p.angoli);
    const geom = patch.rot !== undefined || patch.angoli !== undefined;
    setPagine((l) => l.map((x) => (x.id === id ? { ...p, img, timbri: geom ? [] : p.timbri } : x)));
  };
  const sposta = (i, d) => setPagine((l) => { const c = [...l]; [c[i], c[i + d]] = [c[i + d], c[i]]; return c; });
  const genera = async () => {
    setBusy("pdf");
    try {
      await openBlob(api, "post", "/scanner/pdf", { nome, pagine: pagine.map((p) => ({ img: p.img, timbri: p.timbri })) },
        (u) => setPdf((s) => ({ ...s, url: typeof u === "function" ? u(s.url) : u })), (o) => setPdf((s) => ({ ...s, open: o })));
    } catch { toast.error("PDF non creato"); } finally { setBusy(""); }
  };
  const editIdx = pagine.findIndex((p) => p.id === edit);

  return (
    <div className="p-4 md:p-8 max-w-6xl space-y-5" data-testid="scanner-page">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold flex items-center gap-2"><ScanLine className="w-7 h-7 text-primary" /> Scanner</h1>
        <p className="text-sm text-muted-foreground mt-1">Fotografa una o più pagine, sistemale, aggiungi timbro e firma e crea il PDF da scaricare o inviare.</p>
      </div>
      <TimbroCard timbro={timbro} setTimbro={setTimbro} />
      <div className="flex flex-wrap gap-2">
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={aggiungi} data-testid="scan-file-camera" />
        <input ref={gal} type="file" accept="image/*" multiple className="hidden" onChange={aggiungi} data-testid="scan-file-galleria" />
        <Button onClick={() => cam.current?.click()} disabled={!!busy} data-testid="scan-fotografa">
          {busy === "add" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Camera className="w-4 h-4 mr-2" />} {pagine.length ? "Fotografa altra pagina" : "Fotografa pagina"}
        </Button>
        <Button variant="outline" onClick={() => gal.current?.click()} disabled={!!busy} data-testid="scan-galleria"><Images className="w-4 h-4 mr-2" /> Da galleria</Button>
      </div>
      {pagine.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground" data-testid="scan-vuoto">Nessuna pagina: premi «Fotografa pagina» e inquadra il documento su un piano scuro.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {pagine.map((p, i) => (
              <PaginaCard key={p.id} p={p} i={i} tot={pagine.length} onFiltro={(f) => aggiorna(p.id, { filtro: f })} onRuota={() => aggiorna(p.id, { rot: (p.rot + 90) % 360 })} onRitaglia={() => setCrop(p.id)}
                onSposta={(d) => sposta(i, d)} onElimina={() => setPagine((l) => l.filter((x) => x.id !== p.id))}
                onTimbro={() => (timbro ? setEdit(p.id) : toast.error("Carica prima timbro e firma qui sopra"))} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="max-w-xs" aria-label="Nome del file" data-testid="scan-nome" />
            <Button onClick={genera} disabled={!!busy} data-testid="scan-genera-pdf">
              {busy === "pdf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />} Crea PDF ({pagine.length} {pagine.length === 1 ? "pagina" : "pagine"})
            </Button>
          </div>
        </>
      )}
      <TimbroEditor pagina={editIdx >= 0 ? pagine[editIdx] : null} timbro={timbro} onClose={() => setEdit(null)}
        onChange={(timbri) => setPagine((l) => l.map((x) => (x.id === edit ? { ...x, timbri } : x)))} />
      <RitaglioEditor pagina={pagine.find((p) => p.id === crop) || null} onClose={() => setCrop(null)}
        onApply={(angoli) => { const id = crop; setCrop(null); aggiorna(id, { angoli }); }} />
      <PdfPreviewOverlay open={pdf.open} onClose={() => setPdf((s) => ({ ...s, open: false }))} url={pdf.url} filename={`${nome || "Scansione"}.pdf`} />
    </div>
  );
}
