import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";

// Posiziona timbro/firma sulla pagina: trascina per spostare, cursore per la dimensione
export function TimbroEditor({ pagina, timbro, onChange, onClose }) {
  const box = useRef(null);
  const t = pagina?.timbri?.[0];
  const set = (patch) => onChange([{ ...(t || { x: 0.6, y: 0.78, w: 0.3 }), ...patch }]);
  const drag = (e) => {
    if (!box.current || !t) return;
    e.preventDefault();
    const r = box.current.getBoundingClientRect();
    const start = { cx: e.clientX, cy: e.clientY, x: t.x, y: t.y };
    const move = (ev) => set({
      x: Math.max(0, Math.min(1 - t.w, start.x + (ev.clientX - start.cx) / r.width)),
      y: Math.max(0, Math.min(0.97, start.y + (ev.clientY - start.cy) / r.height)),
    });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <Dialog open={!!pagina} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-xl max-h-[94vh] overflow-y-auto" data-testid="timbro-editor">
        <DialogHeader>
          <DialogTitle>Timbro e firma</DialogTitle>
          <DialogDescription>Trascina il timbro dove serve e regola la dimensione.</DialogDescription>
        </DialogHeader>
        {pagina && (
          <div ref={box} className="relative mx-auto w-full select-none touch-none border rounded" data-testid="timbro-pagina">
            <img src={pagina.img} alt="Pagina" className="w-full block" draggable={false} />
            {t && <img src={timbro} alt="Timbro" onPointerDown={drag} draggable={false}
              className="absolute cursor-move outline outline-1 outline-dashed outline-primary/70"
              style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, width: `${t.w * 100}%` }} data-testid="timbro-overlay" />}
          </div>
        )}
        {t ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground shrink-0">Dimensione</span>
            <Slider value={[t.w * 100]} min={8} max={70} step={1} onValueChange={([v]) => set({ w: v / 100, x: Math.min(t.x, 1 - v / 100) })} data-testid="timbro-dimensione" />
            <Button size="sm" variant="ghost" className="text-destructive shrink-0" onClick={() => onChange([])} data-testid="timbro-rimuovi"><Trash2 className="w-4 h-4 mr-1" /> Togli</Button>
          </div>
        ) : (
          <Button onClick={() => set({})} data-testid="timbro-aggiungi">Metti timbro e firma su questa pagina</Button>
        )}
        <Button variant="outline" onClick={onClose} data-testid="timbro-fatto">Fatto</Button>
      </DialogContent>
    </Dialog>
  );
}
