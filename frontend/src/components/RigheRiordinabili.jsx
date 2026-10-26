import { useRef } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";

// Lista di righe riordinabili: tieni premuto sulla maniglia (o sulla riga su touch) e trascina su/giù.
export function RigheRiordinabili({ items, onReorder, keyOf, render, testId }) {
  const keys = items.map((it, i) => keyOf?.(it, i) ?? i);
  return (
    <Reorder.Group axis="y" values={keys} onReorder={(order) => onReorder(order.map((k) => items[keys.indexOf(k)]))} className="border rounded-md divide-y" data-testid={testId}>
      {items.map((it, i) => <Riga key={keys[i]} k={keys[i]} index={i}>{render(it, i)}</Riga>)}
    </Reorder.Group>
  );
}

function Riga({ k, index, children }) {
  const controls = useDragControls();
  const timer = useRef(null);
  const start = (e) => controls.start(e);
  const onTouchStart = (e) => { timer.current = setTimeout(() => { start(e); if (navigator.vibrate) navigator.vibrate(15); }, 350); };
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  return (
    <Reorder.Item value={k} dragListener={false} dragControls={controls} className="bg-background relative" whileDrag={{ scale: 1.01, boxShadow: "0 8px 24px rgba(0,0,0,.18)", zIndex: 30 }} data-testid={`riga-riordinabile-${index}`}>
      <div className="flex items-stretch">
        <button type="button" className="flex items-center px-1 text-muted-foreground/70 hover:text-foreground cursor-grab active:cursor-grabbing touch-none select-none" onPointerDown={start} aria-label="Sposta riga" title="Tieni premuto e trascina per spostare" data-testid={`riga-handle-${index}`}>
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0" onTouchStart={onTouchStart} onTouchEnd={cancel} onTouchMove={cancel} onTouchCancel={cancel}>{children}</div>
      </div>
    </Reorder.Item>
  );
}
