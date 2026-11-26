import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Maximize } from "lucide-react";
import { elabora } from "@/lib/scanImage";

const TUTTO = [[0, 0], [1, 0], [1, 1], [0, 1]];
const NOMI = ["alto-sx", "alto-dx", "basso-dx", "basso-sx"];

// Ritaglio a 4 angoli: trascina i punti sui bordi del foglio, la pagina viene raddrizzata
export function RitaglioEditor({ pagina, onApply, onClose }) {
  const box = useRef(null);
  const [img, setImg] = useState(null);
  const [pt, setPt] = useState(TUTTO);
  useEffect(() => {
    setImg(null);
    if (!pagina) return;
    setPt(pagina.angoli || [[0.04, 0.04], [0.96, 0.04], [0.96, 0.96], [0.04, 0.96]]);
    elabora(pagina.src, "originale", pagina.rot).then(setImg);
  }, [pagina]);
  const drag = (k) => (e) => {
    e.preventDefault();
    const r = box.current.getBoundingClientRect();
    const move = (ev) => setPt((p) => p.map((q, i) => (i === k
      ? [Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))] : q)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <Dialog open={!!pagina} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-xl max-h-[94vh] overflow-y-auto" data-testid="ritaglio-editor">
        <DialogHeader>
          <DialogTitle>Ritaglia e raddrizza</DialogTitle>
          <DialogDescription>Trascina i quattro punti sugli angoli del foglio.</DialogDescription>
        </DialogHeader>
        {!img ? <Loader2 className="w-6 h-6 animate-spin mx-auto my-10" /> : (
          <div ref={box} className="relative w-full select-none touch-none" data-testid="ritaglio-area">
            <img src={img} alt="Pagina" className="w-full block rounded" draggable={false} />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon points={pt.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")} fill="hsl(var(--primary) / 0.15)" stroke="hsl(var(--primary))" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
            </svg>
            {pt.map(([x, y], k) => (
              <button key={k} type="button" onPointerDown={drag(k)} aria-label={`Angolo ${NOMI[k]}`} data-testid={`ritaglio-angolo-${k}`}
                className="absolute w-8 h-8 -ml-4 -mt-4 rounded-full border-2 border-white bg-primary/80 shadow-lg cursor-grab touch-none"
                style={{ left: `${x * 100}%`, top: `${y * 100}%` }} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setPt(TUTTO)} data-testid="ritaglio-tutto"><Maximize className="w-4 h-4 mr-1" /> Tutta la foto</Button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="ritaglio-annulla">Annulla</Button>
          <Button size="sm" onClick={() => onApply(pt === TUTTO || pt.every((q, i) => q[0] === TUTTO[i][0] && q[1] === TUTTO[i][1]) ? null : pt)} disabled={!img} data-testid="ritaglio-applica">Applica</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
