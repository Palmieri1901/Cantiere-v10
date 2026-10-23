import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function Panel({ title, children, testId }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4" data-testid={testId}>
      <h2 className="label-mini">{title}</h2>
      {children}
    </section>
  );
}

export function Slider({ label, v, min, max, step = 1, on, testId }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 flex justify-between"><span>{label}</span><span className="font-mono-num text-muted-foreground">{v}</span></div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="w-full accent-[hsl(var(--primary))]" data-testid={testId} />
    </label>
  );
}

export function Check({ label, checked, on, testId }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => on(e.target.checked)} className="accent-[hsl(var(--primary))]" data-testid={testId} /> {label}
    </label>
  );
}

export function Foto({ items, active, loading, onFiles, onPick, onRemove }) {
  return (
    <>
      <label className="block cursor-pointer rounded-lg border-2 border-dashed border-border p-5 text-center transition-colors hover:border-primary" data-testid="laser-upload">
        <input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => onFiles(e.target.files)} data-testid="laser-file-input" />
        <div className="font-display font-semibold">{loading ? "Caricamento…" : "Carica foto o PDF"}</div>
        <div className="mt-1 text-xs text-muted-foreground">JPEG, PNG, WEBP, PDF — anche più file. Le foto restano salvate e si vedono da telefono e PC.</div>
      </label>
      {items.length > 0 && (
        <div className="grid grid-cols-4 gap-2" data-testid="laser-foto-lista">
          {items.map((it) => (
            <div key={it.id} className="relative">
              <button type="button" onClick={() => onPick(it.id)} title={it.name} className={`block aspect-square w-full overflow-hidden rounded-md border-2 bg-card ${it.id === active ? "border-primary" : "border-border"}`} data-testid={`laser-foto-${it.id}`}>
                <img src={it.url} alt={it.name} className="h-full w-full object-cover" />
              </button>
              <button type="button" onClick={() => onRemove(it.id)} title="Rimuovi foto" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full border border-border bg-background text-xs" data-testid={`laser-foto-rimuovi-${it.id}`}>×</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function Dimensione({ widthMm, setWidthMm, w, h, forme, punti }) {
  return (
    <Panel title="Dimensione taglio" testId="laser-panel-dimensione">
      <label className="flex items-center justify-between gap-2 text-sm">Larghezza (mm)
        <Input type="number" value={widthMm} min={1} onChange={(e) => setWidthMm(Number(e.target.value) || 1)} className="w-24 text-right font-mono-num" data-testid="laser-larghezza-mm" />
      </label>
      <div className="text-xs text-muted-foreground" data-testid="laser-info-dimensione">Altezza: {((h / w) * widthMm).toFixed(1)} mm · {forme} forme · {punti} punti</div>
    </Panel>
  );
}

export function BarraArea({ areaMode, enclosedCount, onToggle, onDelete, onClear, onRicavaArea, hasArea }) {
  return (
    <>
      <Button variant={areaMode ? "default" : "outline"} size="sm" onClick={onToggle} data-testid="laser-area-toggle">Delimita area</Button>
      {areaMode && <>
        <Button size="sm" disabled={!hasArea} onClick={onRicavaArea} title="Ricava il contorno solo dentro l'area disegnata" data-testid="laser-area-ricava">Ricava nell'area</Button>
        <Button variant="destructive" size="sm" disabled={!enclosedCount} onClick={onDelete} title="Elimina solo le forme completamente interne" data-testid="laser-area-elimina"><Trash2 className="w-4 h-4 mr-1" /> Elimina ({enclosedCount})</Button>
        <Button variant="outline" size="sm" onClick={onClear} data-testid="laser-area-annulla">Annulla area</Button>
      </>}
    </>
  );
}
