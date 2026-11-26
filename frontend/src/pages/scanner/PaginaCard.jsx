import { Button } from "@/components/ui/button";
import { ArrowDown, ArrowUp, RotateCw, Stamp, Trash2 } from "lucide-react";

const FILTRI = [["documento", "B/N"], ["colore", "Colore"], ["originale", "Foto"]];

// Miniatura di una pagina con i comandi: filtro, ruota, ordine, timbro, elimina
export function PaginaCard({ p, i, tot, onFiltro, onRuota, onSposta, onTimbro, onElimina }) {
  return (
    <div className="rounded-lg border bg-card p-2 space-y-2" data-testid={`scan-pagina-${i}`}>
      <div className="relative bg-muted/40 rounded overflow-hidden aspect-[3/4] grid place-items-center">
        <img src={p.img} alt={`Pagina ${i + 1}`} className="max-w-full max-h-full object-contain" />
        <span className="absolute top-1 left-1 text-[11px] font-semibold bg-background/90 rounded px-1.5">{i + 1}</span>
        {p.timbri.length > 0 && <Stamp className="absolute top-1 right-1 w-4 h-4 text-primary bg-background/90 rounded p-0.5" />}
      </div>
      <div className="flex gap-1">
        {FILTRI.map(([k, l]) => (
          <button key={k} type="button" onClick={() => onFiltro(k)} data-testid={`scan-filtro-${k}-${i}`}
            className={`flex-1 text-[11px] rounded px-1 py-1 border transition-colors ${p.filtro === k ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>{l}</button>
        ))}
      </div>
      <div className="flex justify-between">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRuota} title="Ruota" data-testid={`scan-ruota-${i}`}><RotateCw className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onSposta(-1)} disabled={i === 0} title="Prima" data-testid={`scan-su-${i}`}><ArrowUp className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onSposta(1)} disabled={i === tot - 1} title="Dopo" data-testid={`scan-giu-${i}`}><ArrowDown className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onTimbro} title="Timbro e firma" data-testid={`scan-timbro-${i}`}><Stamp className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={onElimina} title="Elimina" data-testid={`scan-elimina-${i}`}><Trash2 className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}
