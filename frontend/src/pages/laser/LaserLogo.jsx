import { useEffect, useMemo, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom as createZoom, zoomIdentity } from "d3-zoom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check as CheckIcon, Minus, PenLine, Plus, Redo2, RotateCcw, RotateCw, Scan, Undo2, X, Crosshair, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { fileToCanvases, deletePhoto, loadPhotos, savePhotos, urlToCanvas, download } from "@/lib/laser/files";
import { trace, toDXF, toSVG, sogliaAutomatica } from "@/lib/laser/vectorize";
import { appendContour, insertNearestPoint, boxBounds, isInsideBox, movePoint, rotateShapes, refineContours, countPointsInBox, deletePointsInBox, snapToPoint, pointInBox } from "@/lib/laser/contourEdit";
import { Panel, Slider, Check, Foto, Dimensione, BarraArea } from "./LaserPannelli";
import { RaddrizzaDialog } from "./RaddrizzaDialog";

export default function LaserLogo() {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [opts, setOpts] = useState({ threshold: 128, invert: false, tolerance: 1.5, minArea: 30, blur: 1, saturazione: 0, locale: 0 });
  const [paths, setPaths] = useState([]);
  const [photoOpacity, setPhotoOpacity] = useState(0.6);
  const [showPhoto, setShowPhoto] = useState(true);
  const [widthMm, setWidthMm] = useState(300);
  const [sel, setSel] = useState(null);
  const [zoom, setZoom] = useState(1);
  const svgRef = useRef(null), contentRef = useRef(null), zoomBehavior = useRef(null);
  const pointers = useRef(new Set()), drag = useRef(null), dragBase = useRef(null);
  const past = useRef([]), future = useRef([]);
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const tracedId = useRef(null);
  const [areaMode, setAreaMode] = useState(false);
  const areaModeRef = useRef(false);
  const [area, setArea] = useState(null);
  const areaDrag = useRef(null);
  const [selectedShapes, setSelectedShapes] = useState([]);
  const [rotationDegrees, setRotationDegrees] = useState(1);
  const [refineScope, setRefineScope] = useState("selected");
  const [refineStrength, setRefineStrength] = useState(2);
  const [drawingMode, setDrawingMode] = useState(null);
  const drawingModeRef = useRef(null);
  const [draft, setDraft] = useState([]);
  const drawingTap = useRef(null);
  const [notice, setNotice] = useState(null);
  const [raddrizza, setRaddrizza] = useState(false);

  function aggiungiCanvas(canvas, name) {
    const nuovo = { id: crypto.randomUUID(), name, canvas, url: canvas.toDataURL("image/jpeg", 0.85) };
    setItems((p) => [...p, nuovo]);
    savePhotos([{ id: nuovo.id, name: nuovo.name, url: nuovo.url }]).catch(() => toast.error("Foto non salvata sul server (resta solo qui)"));
    setActive(nuovo.id);
    toast.success("Foto raddrizzata creata: ora «Ricava contorno»");
  }

  const item = items.find((i) => i.id === active) ?? null;

  function clearDrawing() { drawingModeRef.current = null; setDrawingMode(null); setDraft([]); drawingTap.current = null; }
  function clearArea() { setSelectedShapes([]); areaModeRef.current = false; setAreaMode(false); setArea(null); areaDrag.current = null; }
  function toggleDrawing(mode) {
    const next = drawingMode === mode ? null : mode;
    clearArea(); clearDrawing(); setSel(null); drag.current = null; dragBase.current = null;
    drawingModeRef.current = next; setDrawingMode(next);
  }
  function finishContour() {
    const result = appendContour(paths, draft);
    if (result === paths) return;
    snapshot(paths); setPaths(result); setSel({ p: paths.length, i: 0 }); clearDrawing();
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadPhotos();
      if (cancelled || !saved.length) return;
      const restored = [];
      for (const s of saved) { try { restored.push({ ...s, canvas: await urlToCanvas(s.url) }); } catch { /* skip */ } }
      if (cancelled || !restored.length) return;
      setItems((p) => (p.length ? p : restored));
      setActive((a) => a ?? restored.at(-1)?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  async function onFiles(files) {
    if (!files?.length) return;
    setLoading(true);
    const added = [];
    for (const f of Array.from(files)) {
      try {
        const cs = await fileToCanvases(f);
        cs.forEach((c, k) => added.push({ id: crypto.randomUUID(), name: cs.length > 1 ? `${f.name} p.${k + 1}` : f.name, canvas: c, url: c.toDataURL("image/jpeg", 0.85) }));
      } catch (e) { toast.error(`Impossibile leggere ${f.name}`); console.error(e); }
    }
    setItems((p) => [...p, ...added]);
    savePhotos(added.map(({ id, name, url }) => ({ id, name, url }))).then(() => toast.success("Foto salvata: la trovi anche dagli altri dispositivi")).catch((e) => toast.error(e.response?.data?.detail || "Foto non salvata sul server (resta solo qui)"));
    if (added[0]) { setShowPhoto(true); setPhotoOpacity(0.6); setZoom(1); setActive(added[0].id); }
    setLoading(false);
  }

  async function removeItem(id) {
    if (!await confirmDialog("Eliminare questa foto? Verrà rimossa anche dagli altri dispositivi.", { okLabel: "Elimina" })) return;
    deletePhoto(id);
    setItems((p) => { const rest = p.filter((i) => i.id !== id); if (active === id) setActive(rest[0]?.id ?? null); return rest; });
    if (active === id) setPaths([]);
  }

  function snapshot(prev) { past.current = [...past.current.slice(-49), prev.map((p) => p.slice())]; future.current = []; setHist({ u: past.current.length, r: 0 }); }
  function commit(update) { snapshot(paths); setPaths(update(paths)); }
  function undo() {
    if (draft.length) { setDraft((p) => p.slice(0, -1)); return; }
    clearDrawing();
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [paths.map((p) => p.slice()), ...future.current].slice(0, 50);
    setPaths(prev); setHist({ u: past.current.length, r: future.current.length }); setSel(null); clearArea();
  }
  function redo() {
    clearDrawing();
    const next = future.current.shift();
    if (!next) return;
    past.current = [...past.current, paths.map((p) => p.slice())].slice(-50);
    setPaths(next); setHist({ u: past.current.length, r: future.current.length }); setSel(null); clearArea();
  }

  function retrace(soloArea = false) {
    clearDrawing();
    if (!item) return;
    const box = soloArea && area ? boxBounds(area) : null;
    if (!soloArea) clearArea();
    const switched = tracedId.current !== item.id;
    tracedId.current = item.id;
    if (switched) { past.current = []; future.current = []; setHist({ u: 0, r: 0 }); } else if (paths.length) snapshot(paths);
    try {
      const nuovi = trace(item.canvas, { ...opts, area: box });
      // Nell'area delimitata: sostituisce solo le forme interne, il resto resta
      const result = box ? [...paths.filter((p) => !isInsideBox(p, area)), ...nuovi] : nuovi;
      setPaths(result);
      setNotice(nuovi.truncated ? "Foto molto dettagliata: mostro solo le forme più grandi. Alza «Ignora macchie piccole» o cambia la soglia per pulire il contorno." : (box && !nuovi.length ? "Nessun contorno trovato nell'area: prova ad abbassare/alzare la soglia o attiva «Rileva colori»." : null));
    } catch (error) {
      setPaths([]); console.error(error);
      setNotice("Non riesco a ricavare il contorno di questa foto. La foto resta disponibile: prova a cambiare la soglia.");
    }
    setSel(null);
    if (box) clearArea();
  }
  function sogliaAuto() {
    if (!item) return;
    const t = sogliaAutomatica(item.canvas);
    setOpts((o) => ({ ...o, threshold: t }));
    setNotice(`Soglia automatica impostata a ${t}: premi «Ricava contorno».`);
  }
  useEffect(() => { retrace(); }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  const pointCount = useMemo(() => paths.reduce((s, p) => s + p.length, 0), [paths]);
  const w = item?.canvas.width ?? 1, h = item?.canvas.height ?? 1;
  const r = Math.max(w, h) / 220 / zoom;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !item) return;
    const behavior = createZoom().extent([[0, 0], [w, h]]).scaleExtent([0.5, 20])
      .filter((event) => {
        if (event.type === "wheel") return true;
        if (event.touches?.length > 1) return true;
        if (areaModeRef.current || drawingModeRef.current) return false;
        return !event.button && !(event.target instanceof Element && event.target.closest("circle"));
      })
      .on("zoom", (event) => { contentRef.current?.setAttribute("transform", event.transform.toString()); setZoom(event.transform.k); });
    zoomBehavior.current = behavior;
    select(svg).call(behavior).on("dblclick.zoom", null).call(behavior.transform, zoomIdentity);
    return () => { select(svg).on(".zoom", null); zoomBehavior.current = null; pointers.current.clear(); };
  }, [item, w, h]);

  function changeZoom(value) { const svg = svgRef.current, b = zoomBehavior.current; if (svg && b) select(svg).call(b.scaleTo, Math.min(20, Math.max(0.5, value)), [w / 2, h / 2]); }
  function resetView() { const svg = svgRef.current, b = zoomBehavior.current; if (svg && b) select(svg).call(b.transform, zoomIdentity); }

  function toLocal(e) {
    const svg = svgRef.current, matrix = contentRef.current?.getScreenCTM();
    if (!svg || !matrix) return null;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }

  function onMove(e) {
    const tap = drawingTap.current;
    if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) drawingTap.current = null;
    if (areaDrag.current === e.pointerId) { const q = toLocal(e); if (q) setArea((prev) => (prev ? { ...prev, end: q } : prev)); return; }
    const d = drag.current;
    if (!d) return;
    const q = toLocal(e);
    if (!q) return;
    if (dragBase.current) { snapshot(dragBase.current); dragBase.current = null; }
    setPaths((ps) => ps.map((p, pi) => (pi !== d.p ? p : p.map((pt, i) => (i === d.i ? q : pt)))));
  }

  function insertPoint(pi, i, e) {
    e.stopPropagation();
    const q = toLocal(e);
    if (!q) return;
    commit((ps) => ps.map((p, k) => (k !== pi ? p : [...p.slice(0, i + 1), q, ...p.slice(i + 1)])));
    setSel({ p: pi, i: i + 1 });
  }
  function deleteSel() { if (!sel) return; setSelectedShapes([]); commit((ps) => ps.map((p, k) => (k !== sel.p ? p : p.filter((_, i) => i !== sel.i))).filter((p) => p.length >= 3)); setSel(null); }
  function deleteShape() { if (!sel) return; setSelectedShapes([]); commit((ps) => ps.filter((_, k) => k !== sel.p)); setSel(null); }

  const enclosedCount = area ? countPointsInBox(paths, area) : 0;
  const bounds = area ? boxBounds(area) : null;
  const rotationSelection = area ? paths.flatMap((p, i) => (isInsideBox(p, area) ? [i] : [])) : sel ? [sel.p] : selectedShapes;
  const refineSelection = refineScope === "all" ? paths.map((_, i) => i) : rotationSelection;

  function refineSelectionContours(mode) {
    if (!refineSelection.length) return;
    const result = refineContours(paths, refineSelection, mode, refineStrength);
    if (result === paths) { setNotice("Troppi punti per smussare ancora: usa prima Raddrizza linee oppure seleziona meno forme."); return; }
    snapshot(paths); setPaths(result);
    const selected = refineSelection.slice();
    clearDrawing(); clearArea(); setSel(null); setSelectedShapes(selected); setNotice(null);
  }
  function rotateSelection(direction) {
    if (!rotationSelection.length) return;
    const selected = rotationSelection.slice();
    commit((ps) => rotateShapes(ps, selected, direction * rotationDegrees));
    clearArea(); setSel(null); setSelectedShapes(selected);
  }
  function deleteArea() { if (!area || !enclosedCount) return; commit((ps) => deletePointsInBox(ps, area)); setSel(null); clearArea(); }
  function nudge(dx, dy) { if (!sel || !paths[sel.p]?.[sel.i]) return; commit((ps) => movePoint(ps, sel, dx, dy)); }

  useEffect(() => {
    const k = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") { clearDrawing(); clearArea(); return; }
      if (e.key === "Enter" && drawingMode === "manual") { e.preventDefault(); finishContour(); return; }
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) deleteSel();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const base = item?.name.replace(/\.[^.]+$/, "") ?? "logo";
  const ib = "h-9 w-9 p-0";

  return (
    <div className="space-y-4" data-testid="pagina-laser">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="label-mini">Officina</div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold flex items-center gap-3"><Crosshair className="w-8 h-8 text-primary" /> LaserLogo</h1>
          <p className="text-sm text-muted-foreground mt-1">Da foto o PDF del logo del gommone al vettoriale (SVG/DXF) per la taglierina laser.</p>
        </div>
        <div className="flex gap-2">
          <Button disabled={!paths.length} onClick={() => download(`${base}.svg`, toSVG(paths, w, h, widthMm), "image/svg+xml")} data-testid="laser-export-svg"><Download className="w-4 h-4 mr-1" /> Esporta SVG</Button>
          <Button variant="outline" disabled={!paths.length} onClick={() => download(`${base}.dxf`, toDXF(paths, w, h, widthMm), "application/dxf")} data-testid="laser-export-dxf"><Download className="w-4 h-4 mr-1" /> Esporta DXF</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <Foto items={items} active={active} loading={loading} onFiles={onFiles} onPick={setActive} onRemove={removeItem} />
          <Button variant="outline" className="w-full" disabled={!item} onClick={() => setRaddrizza(true)} data-testid="laser-raddrizza-apri">Raddrizza foto (prospettiva / tubolare)</Button>
          {raddrizza && item && <RaddrizzaDialog key={item.id} item={item} open={raddrizza} onClose={() => setRaddrizza(false)} onResult={aggiungiCanvas} />}
          <Panel title="Contorno" testId="laser-panel-contorno">
            <Slider label="Soglia" v={opts.threshold} min={1} max={254} on={(v) => setOpts({ ...opts, threshold: v })} testId="laser-soglia" />
            <Button variant="outline" size="sm" disabled={!item} onClick={sogliaAuto} className="w-full" data-testid="laser-soglia-auto">Soglia automatica</Button>
            <Slider label="Contrasto locale (scritte chiare o riflessi)" v={opts.locale} min={0} max={80} step={5} on={(v) => setOpts({ ...opts, locale: v })} testId="laser-locale" />
            <p className="text-[11px] text-muted-foreground -mt-1">0 = spento. Prende ciò che è più scuro dello sfondo intorno, anche se chiaro: utile per numeri grigi su fondo lucido (es. "747"). Prova 20–40.</p>
            <Slider label="Rileva colori (bandiere, loghi colorati)" v={opts.saturazione} min={0} max={100} step={5} on={(v) => setOpts({ ...opts, saturazione: v })} testId="laser-saturazione" />
            <p className="text-[11px] text-muted-foreground -mt-1">0 = spento. Più alto = prende solo colori molto accesi; 30–50 va bene per rosso/verde su fondo bianco.</p>
            <Slider label="Ammorbidisci foto" v={opts.blur} min={0} max={6} step={0.5} on={(v) => setOpts({ ...opts, blur: v })} testId="laser-blur" />
            <Slider label="Semplifica (meno punti)" v={opts.tolerance} min={0.3} max={8} step={0.1} on={(v) => setOpts({ ...opts, tolerance: v })} testId="laser-tolleranza" />
            <Slider label="Ignora macchie piccole" v={opts.minArea} min={0} max={2000} step={10} on={(v) => setOpts({ ...opts, minArea: v })} testId="laser-min-area" />
            <Check label="Inverti (logo chiaro su fondo scuro)" checked={opts.invert} on={(v) => setOpts({ ...opts, invert: v })} testId="laser-inverti" />
            <Button disabled={!item} onClick={() => retrace(false)} className="w-full" data-testid="laser-ricava">Ricava contorno</Button>
            <p className="text-xs text-muted-foreground">Dopo «Ricava contorno» puoi tornare ai punti di prima con «Annulla». Scritte grigio chiaro su scafo bianco: alza la soglia (170–210) o usa «Soglia automatica»; con «Delimita area» puoi ricavare il contorno solo dentro l'area scelta.</p>
          </Panel>
          <Panel title="Sovrapposizione" testId="laser-panel-foto">
            <Check label="Mostra foto sotto" checked={showPhoto} on={setShowPhoto} testId="laser-mostra-foto" />
            <Slider label="Trasparenza foto" v={Math.round(photoOpacity * 100)} min={0} max={100} on={(v) => setPhotoOpacity(v / 100)} testId="laser-opacita" />
            <Slider label="Zoom" v={Math.round(zoom * 100) / 100} min={0.5} max={20} step={0.1} on={changeZoom} testId="laser-zoom-slider" />
          </Panel>
          <Dimensione widthMm={widthMm} setWidthMm={setWidthMm} w={w} h={h} forme={paths.length} punti={pointCount} />
        </aside>

        <main className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Trascina i puntini · Doppio clic su una linea per aggiungere un punto · Seleziona un punto e premi Canc</span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Button variant="ghost" size="sm" disabled={!hist.u && !draft.length} onClick={undo} title="Annulla (Ctrl+Z)" data-testid="laser-undo"><Undo2 className="w-4 h-4 mr-1" /> Annulla</Button>
              <Button variant="ghost" size="sm" disabled={!hist.r || drawingMode === "manual"} onClick={redo} title="Ripeti (Ctrl+Shift+Z)" data-testid="laser-redo"><Redo2 className="w-4 h-4 mr-1" /> Ripeti</Button>
              <Button variant="ghost" size="sm" disabled={!sel} onClick={deleteSel} data-testid="laser-elimina-punto">Elimina punto</Button>
              <Button variant="ghost" size="sm" disabled={!sel} onClick={deleteShape} data-testid="laser-elimina-forma">Elimina forma</Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
            <Button variant="outline" className={ib} title="Rimpicciolisci" disabled={!item || zoom <= 0.5} onClick={() => changeZoom(zoom / 1.4)} data-testid="laser-zoom-out"><Minus className="w-4 h-4" /></Button>
            <output className="w-16 text-center text-sm font-mono-num" data-testid="laser-zoom">{Math.round(zoom * 100)}%</output>
            <Button variant="outline" className={ib} title="Ingrandisci" disabled={!item || zoom >= 20} onClick={() => changeZoom(zoom * 1.4)} data-testid="laser-zoom-in"><Plus className="w-4 h-4" /></Button>
            <Button variant="outline" className={ib} title="Mostra tutto" disabled={!item} onClick={resetView} data-testid="laser-zoom-reset"><Scan className="w-4 h-4" /></Button>
            <span className="mx-1 h-6 w-px bg-border" />
            <Button variant={drawingMode === "add" ? "default" : "outline"} size="sm" disabled={!paths.length} onClick={() => toggleDrawing("add")} data-testid="laser-aggiungi-punti"><Plus className="w-4 h-4 mr-1" /> Aggiungi punti</Button>
            <Button variant={drawingMode === "manual" ? "default" : "outline"} size="sm" disabled={!item} onClick={() => toggleDrawing("manual")} data-testid="laser-contorno-manuale"><PenLine className="w-4 h-4 mr-1" /> Contorno manuale</Button>
            {drawingMode === "manual" && <>
              <Button size="sm" disabled={appendContour(paths, draft) === paths} onClick={finishContour} data-testid="laser-chiudi-contorno"><CheckIcon className="w-4 h-4 mr-1" /> Chiudi contorno</Button>
              <output className="text-xs text-muted-foreground" data-testid="laser-draft-punti">{draft.length} punti</output>
            </>}
            {drawingMode && <Button variant="outline" className={ib} title="Annulla disegno" onClick={clearDrawing} data-testid="laser-annulla-disegno"><X className="w-4 h-4" /></Button>}
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
            <BarraArea areaMode={areaMode} enclosedCount={enclosedCount} onDelete={deleteArea} onClear={clearArea} hasArea={!!bounds && bounds.width > 2 && bounds.height > 2} onRicavaArea={() => retrace(true)}
              onToggle={() => { clearDrawing(); if (areaMode) { clearArea(); return; } areaModeRef.current = true; setAreaMode(true); setArea(null); setSel(null); setSelectedShapes([]); }} />
            <div className="ml-auto flex gap-1" title="Sposta punto selezionato">
              <Button variant="outline" className={ib} disabled={!sel || areaMode} onClick={() => nudge(-1, 0)} data-testid="laser-nudge-sx"><ArrowLeft className="w-4 h-4" /></Button>
              <Button variant="outline" className={ib} disabled={!sel || areaMode} onClick={() => nudge(0, -1)} data-testid="laser-nudge-su"><ArrowUp className="w-4 h-4" /></Button>
              <Button variant="outline" className={ib} disabled={!sel || areaMode} onClick={() => nudge(0, 1)} data-testid="laser-nudge-giu"><ArrowDown className="w-4 h-4" /></Button>
              <Button variant="outline" className={ib} disabled={!sel || areaMode} onClick={() => nudge(1, 0)} data-testid="laser-nudge-dx"><ArrowRight className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
            <Button variant="outline" className={ib} disabled={!rotationSelection.length} onClick={() => rotateSelection(-1)} title="Ruota a sinistra" data-testid="laser-ruota-sx"><RotateCcw className="w-4 h-4" /></Button>
            <Button variant="outline" className={ib} disabled={!rotationSelection.length} onClick={() => rotateSelection(1)} title="Ruota a destra" data-testid="laser-ruota-dx"><RotateCw className="w-4 h-4" /></Button>
            <label className="flex items-center gap-1 text-sm">
              <input type="number" min={1} max={180} step={1} value={rotationDegrees} onChange={(e) => setRotationDegrees(Math.min(180, Math.max(1, Math.round(Number(e.target.value) || 1))))} className="w-16 rounded-md border border-input bg-background px-2 py-1 text-right font-mono-num" data-testid="laser-gradi" />°
            </label>
            <output className="text-xs text-muted-foreground" data-testid="laser-selezionate">{rotationSelection.length} selezionate</output>
            <span className="mx-1 h-6 w-px bg-border" />
            <select value={refineScope} onChange={(e) => setRefineScope(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm" data-testid="laser-refine-scope">
              <option value="selected">Forme selezionate</option>
              <option value="all">Tutte le forme</option>
            </select>
            <Button variant="outline" size="sm" disabled={!refineSelection.length || Boolean(drawingMode)} onClick={() => refineSelectionContours("smooth")} data-testid="laser-smussa">Smussa angoli</Button>
            <Button variant="outline" size="sm" disabled={!refineSelection.length || Boolean(drawingMode)} onClick={() => refineSelectionContours("straighten")} data-testid="laser-raddrizza">Raddrizza linee</Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">Intensità
              <input type="range" min={1} max={10} step={1} value={refineStrength} onChange={(e) => setRefineStrength(Number(e.target.value))} className="w-24 accent-[hsl(var(--primary))]" data-testid="laser-intensita" />
              <output className="w-4 text-right font-mono-num">{refineStrength}</output>
            </label>
          </div>
          {notice && <p role="status" className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground" data-testid="laser-notice">{notice}</p>}
          <div className="laser-checker h-[70vh] overflow-hidden rounded-lg border border-border" data-testid="laser-canvas">
            {item ? (
              <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="block h-full w-full touch-none select-none" onPointerMove={onMove}
                onPointerDownCapture={(e) => {
                  pointers.current.add(e.pointerId);
                  if (pointers.current.size > 1) { drawingTap.current = null; drag.current = null; dragBase.current = null; areaDrag.current = null; setArea(null); return; }
                  if (drawingModeRef.current) {
                    if (e.button !== 0) return;
                    const target = e.target instanceof Element ? e.target.closest("[data-path-index]") : null;
                    drawingTap.current = { id: e.pointerId, x: e.clientX, y: e.clientY, path: target ? Number(target.getAttribute("data-path-index")) : null };
                    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); return;
                  }
                  if (areaModeRef.current) {
                    const q = toLocal(e);
                    if (!q) return;
                    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
                    areaDrag.current = e.pointerId; setArea({ start: q, end: q });
                  }
                }}
                onPointerUp={(e) => {
                  const tap = drawingTap.current;
                  drawingTap.current = null;
                  if (tap?.id === e.pointerId && pointers.current.size === 1) {
                    const q = toLocal(e);
                    if (q && q.x >= 0 && q.y >= 0 && q.x <= w && q.y <= h) {
                      if (drawingModeRef.current === "manual") setDraft((p) => [...p, snapToPoint(paths, p, q, r * 3)]);
                      else if (drawingModeRef.current === "add" && tap.path !== null) { commit((ps) => insertNearestPoint(ps, tap.path, q)); setSel(null); setSelectedShapes([tap.path]); }
                    }
                  }
                  pointers.current.delete(e.pointerId); drag.current = null; dragBase.current = null; if (areaDrag.current === e.pointerId) areaDrag.current = null;
                }}
                onPointerCancel={(e) => { drawingTap.current = null; pointers.current.delete(e.pointerId); drag.current = null; dragBase.current = null; if (areaDrag.current === e.pointerId) { areaDrag.current = null; setArea(null); } }}
                onPointerLeave={(e) => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) { pointers.current.delete(e.pointerId); drag.current = null; dragBase.current = null; } }}
                onPointerDown={() => { setSel(null); setSelectedShapes([]); }}>
                <g ref={contentRef}>
                  {showPhoto && <image href={item.url} width={w} height={h} opacity={photoOpacity} />}
                  {paths.map((p, pi) => {
                    const editable = pointCount <= 1500 || sel?.p === pi;
                    return (
                      <g key={pi} data-path-index={pi}>
                        <polygon points={p.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" fillRule="evenodd"
                          stroke={area && isInsideBox(p, area) ? "hsl(var(--destructive))" : "hsl(var(--primary))"} strokeWidth={r * (rotationSelection.includes(pi) ? 0.9 : 0.45)}
                          onPointerDown={(e) => { e.stopPropagation(); setSelectedShapes([]); setSel({ p: pi, i: 0 }); }} />
                        {editable && p.map((q, i) => {
                          const n = p[(i + 1) % p.length];
                          return <line key={"l" + i} x1={q.x} y1={q.y} x2={n.x} y2={n.y} stroke="transparent" strokeWidth={r * 2.5} style={{ cursor: "copy" }}
                            onPointerDown={(e) => { e.stopPropagation(); setSelectedShapes([]); setSel({ p: pi, i }); }} onDoubleClick={(e) => insertPoint(pi, i, e)} />;
                        })}
                        {editable && p.map((q, i) => {
                          const on = sel?.p === pi && sel.i === i;
                          return <circle key={"c" + i} cx={q.x} cy={q.y} r={on ? r * 1.4 : r} fill={on ? "hsl(var(--primary))" : area && pointInBox(q, area) ? "hsl(var(--destructive))" : "hsl(var(--background))"} stroke="hsl(var(--primary))" strokeWidth={r * 0.35} style={{ cursor: "grab" }}
                            onPointerDown={(e) => {
                              e.stopPropagation(); setSelectedShapes([]);
                              e.target.setPointerCapture?.(e.pointerId);
                              const multi = pointers.current.size > 1;
                              drag.current = multi ? null : { p: pi, i };
                              dragBase.current = multi ? null : paths.map((pp) => pp.slice());
                              setSel({ p: pi, i });
                            }} />;
                        })}
                      </g>
                    );
                  })}
                  {drawingMode === "manual" && <g pointerEvents="none">
                    <polyline points={draft.map((q) => `${q.x},${q.y}`).join(" ")} fill="none" stroke="hsl(var(--primary))" strokeWidth={r * 0.6} />
                    {draft.length >= 3 && <line x1={draft.at(-1)?.x} y1={draft.at(-1)?.y} x2={draft[0]?.x} y2={draft[0]?.y} stroke="hsl(var(--primary))" strokeWidth={r * 0.45} strokeDasharray={`${r * 3} ${r * 2}`} />}
                    {draft.map((q, i) => <circle key={i} cx={q.x} cy={q.y} r={r} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth={r * 0.35} />)}
                  </g>}
                  {bounds && <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="hsl(var(--primary))" fillOpacity={0.12} stroke="hsl(var(--primary))" strokeWidth={r * 0.6} strokeDasharray={`${r * 3} ${r * 2}`} pointerEvents="none" />}
                </g>
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center text-muted-foreground" data-testid="laser-vuoto">
                Carica una o più foto del logo del gommone per iniziare.<br />Consiglio: foto frontale, ben illuminata, logo su fondo uniforme.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
