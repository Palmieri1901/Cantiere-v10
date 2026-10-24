import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { raddrizza } from "@/lib/laser/raddrizza";
import { Slider } from "./LaserPannelli";

// Dialog: trascina i 4 angoli attorno alla scritta, regola curvatura del tubolare, ottieni una foto piatta
export function RaddrizzaDialog({ item, open, onClose, onResult }) {
  const w = item?.canvas.width ?? 1, h = item?.canvas.height ?? 1;
  const [corners, setCorners] = useState(() => [{ x: w * 0.2, y: h * 0.35 }, { x: w * 0.8, y: h * 0.35 }, { x: w * 0.8, y: h * 0.65 }, { x: w * 0.2, y: h * 0.65 }]);
  const [curvatura, setCurvatura] = useState(0);
  const [preview, setPreview] = useState(null);
  const drag = useRef(null);
  const svgRef = useRef(null);
  const r = Math.max(w, h) / 60;

  const toLocal = (e) => {
    const svg = svgRef.current; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.max(0, Math.min(w, p.x)), y: Math.max(0, Math.min(h, p.y)) };
  };
  const anteprima = () => { try { setPreview(raddrizza(item.canvas, corners, { outWidth: 600, curvatura }).toDataURL("image/jpeg", 0.8)); } catch (e) { console.error(e); } };
  const applica = () => {
    const c = raddrizza(item.canvas, corners, { outWidth: 1400, curvatura });
    onResult(c, `${item.name.replace(/\.[^.]+$/, "")} (raddrizzata)`);
    onClose();
  };
  const poly = useMemo(() => corners.map((c) => `${c.x},${c.y}`).join(" "), [corners]);
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-4xl max-h-[92vh] overflow-y-auto" data-testid="raddrizza-dialog">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Raddrizza foto</DialogTitle>
          <DialogDescription>Trascina i 4 angoli sui bordi della scritta (sopra, sotto, sinistra, destra). Se la scritta è su un tubolare tondo alza «Curvatura tubolare»: la parte alta e bassa verrà "srotolata".</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="laser-checker rounded-lg border border-border overflow-hidden">
            <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} className="block w-full touch-none select-none max-h-[55vh]" data-testid="raddrizza-svg"
              onPointerMove={(e) => { if (drag.current === null) return; const p = toLocal(e); setCorners((cs) => cs.map((c, i) => (i === drag.current ? p : c))); }}
              onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; }}>
              <image href={item.url} width={w} height={h} />
              <polygon points={poly} fill="hsl(var(--primary))" fillOpacity={0.12} stroke="hsl(var(--primary))" strokeWidth={r * 0.3} />
              <line x1={(corners[0].x + corners[3].x) / 2} y1={(corners[0].y + corners[3].y) / 2} x2={(corners[1].x + corners[2].x) / 2} y2={(corners[1].y + corners[2].y) / 2} stroke="hsl(var(--primary))" strokeWidth={r * 0.15} strokeDasharray={`${r} ${r}`} />
              {corners.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r={r} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeWidth={r * 0.35} style={{ cursor: "grab" }}
                  onPointerDown={(e) => { e.target.setPointerCapture?.(e.pointerId); drag.current = i; }} data-testid={`raddrizza-angolo-${i}`} />
              ))}
            </svg>
          </div>
          <div className="space-y-4">
            <Slider label="Curvatura tubolare" v={curvatura} min={0} max={1} step={0.05} on={setCurvatura} testId="raddrizza-curvatura" />
            <p className="text-[11px] text-muted-foreground -mt-2">0 = superficie piatta (scafo). 0,5–0,8 = scritta che occupa buona parte del tubo. 1 = dal bordo superiore a quello inferiore del tubo.</p>
            <Button variant="outline" className="w-full" onClick={anteprima} data-testid="raddrizza-anteprima">Anteprima</Button>
            {preview && <img src={preview} alt="Anteprima raddrizzata" className="w-full rounded border border-border bg-white" data-testid="raddrizza-anteprima-img" />}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="raddrizza-annulla">Annulla</Button>
          <Button onClick={applica} data-testid="raddrizza-applica">Crea foto raddrizzata</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
