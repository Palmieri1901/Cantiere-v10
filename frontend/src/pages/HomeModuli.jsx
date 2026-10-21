import { useEffect, useState } from "react";
import { ModuleTile } from "@/components/ModuleTile";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, GripVertical, Move, RotateCcw } from "lucide-react";

const KEY = "geb_home_ordine";
const leggi = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };

export const ordina = (tiles, ordine) => {
  const pos = new Map(ordine.map((k, i) => [k, i]));
  return [...tiles].sort((a, b) => (pos.has(a.key) ? pos.get(a.key) : 999 + tiles.indexOf(a)) - (pos.has(b.key) ? pos.get(b.key) : 999 + tiles.indexOf(b)));
};

// Griglia dei riquadri Home con riordino (trascina o frecce); ordine salvato nel cantiere (condiviso PC/telefono) con copia locale
export function HomeModuli({ tiles, ordineCantiere }) {
  const [ordine, setOrdine] = useState(leggi);
  const [edit, setEdit] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const lista = ordina(tiles, ordine);

  useEffect(() => {
    if (Array.isArray(ordineCantiere)) { setOrdine(ordineCantiere); localStorage.setItem(KEY, JSON.stringify(ordineCantiere)); }
  }, [ordineCantiere]);

  const salva = (keys) => {
    setOrdine(keys);
    localStorage.setItem(KEY, JSON.stringify(keys));
    api.put("/cantiere", { home_ordine: keys }).catch(() => toast.error("Ordine salvato solo su questo dispositivo: sei offline?"));
  };
  const sposta = (key, delta) => {
    const keys = lista.map((t) => t.key);
    const i = keys.indexOf(key), j = i + delta;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    salva(keys);
  };
  const drop = (targetKey) => {
    if (!dragKey || dragKey === targetKey) return;
    const keys = lista.map((t) => t.key).filter((k) => k !== dragKey);
    keys.splice(keys.indexOf(targetKey), 0, dragKey);
    salva(keys);
    setDragKey(null);
  };

  return (
    <div className="mt-12">
      <div className="flex items-center justify-end gap-2 mb-3">
        {edit && <Button variant="ghost" size="sm" onClick={() => salva([])} data-testid="home-ordine-reset"><RotateCcw className="w-4 h-4 mr-1" /> Ordine iniziale</Button>}
        <Button variant={edit ? "default" : "outline"} size="sm" onClick={() => setEdit((v) => !v)} data-testid="home-ordine-toggle">
          {edit ? <><Check className="w-4 h-4 mr-1" /> Fatto</> : <><Move className="w-4 h-4 mr-1" /> Sposta riquadri</>}
        </Button>
      </div>
      {edit && <p className="text-xs text-muted-foreground mb-3" data-testid="home-ordine-hint">Trascina un riquadro sopra un altro oppure usa le frecce. L'ordine viene salvato nel cantiere: lo ritrovi uguale su PC e telefono.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="home-moduli">
        {lista.map((t, i) => (
          <div key={t.key} className={`relative ${edit ? "cursor-grab" : ""} ${dragKey === t.key ? "opacity-40" : ""}`} draggable={edit}
            onDragStart={() => setDragKey(t.key)} onDragOver={(e) => edit && e.preventDefault()} onDrop={() => drop(t.key)} onDragEnd={() => setDragKey(null)}
            data-testid={`home-tile-${t.key}`}>
            {edit && (
              <div className="absolute inset-x-0 -top-3 z-10 flex justify-center gap-1" data-testid={`home-tile-ctrl-${t.key}`}>
                <button type="button" onClick={() => sposta(t.key, -1)} disabled={i === 0} className="h-7 w-7 grid place-items-center rounded-full bg-foreground text-background shadow disabled:opacity-30" title="Sposta indietro" data-testid={`home-tile-prev-${t.key}`}><ArrowLeft className="w-3.5 h-3.5" /></button>
                <span className="h-7 px-2 grid place-items-center rounded-full bg-foreground text-background shadow text-[11px] font-mono-num"><GripVertical className="w-3.5 h-3.5 inline" /> {i + 1}</span>
                <button type="button" onClick={() => sposta(t.key, 1)} disabled={i === lista.length - 1} className="h-7 w-7 grid place-items-center rounded-full bg-foreground text-background shadow disabled:opacity-30" title="Sposta avanti" data-testid={`home-tile-next-${t.key}`}><ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
            )}
            <div className={edit ? "pointer-events-none ring-2 ring-dashed ring-primary/40 rounded-xl" : ""}>
              <ModuleTile {...t} testId={`cta-${t.key}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
