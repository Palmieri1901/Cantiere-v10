import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Package, Plus, Wrench, X } from "lucide-react";
import { fmtEuro } from "@/lib/api";
import { MAX_EXTRA } from "./common";

export default function LavorazioniExtraSection({ f, update, onOpenMagPicker }) {
  const tutte = Array.isArray(f.lavorazioni_extra) ? f.lavorazioni_extra : [];
  const speciali = tutte.filter((it) => it?.tipo); // ritiro/consegna: gestite nella loro sezione
  const extras = tutte.filter((it) => !it?.tipo);
  const totaleExtra = extras.reduce((s, it) => s + (Number(it?.prezzo) || 0), 0);
  const commit = (list) => update("lavorazioni_extra", [...speciali, ...list]);

  const addExtra = () => {
    if (extras.length >= MAX_EXTRA) return;
    commit([...extras, { descrizione: "", prezzo: 0 }]);
  };
  const removeExtra = (idx) => {
    const list = [...extras];
    list.splice(idx, 1);
    commit(list);
  };
  const updateExtra = (idx, key, value) => {
    const list = [...extras];
    list[idx] = { ...list[idx], [key]: key === "prezzo" ? value : String(value ?? "") };
    commit(list);
  };

  return (
    <section data-testid="section-lavorazioni-extra">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-1.5 label-mini mb-0.5">
            <Wrench className="w-3 h-3" /> Lavorazioni extra
          </div>
          <p className="text-xs text-muted-foreground">
            Aggiungi lavorazioni personalizzate con prezzo (max {MAX_EXTRA}). Sono incluse nel totale e nel PDF preventivo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onOpenMagPicker} disabled={extras.length >= MAX_EXTRA} data-testid="btn-add-from-magazzino">
            <Package className="w-4 h-4 mr-1 text-primary" /> Da magazzino
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={addExtra} disabled={extras.length >= MAX_EXTRA} data-testid="btn-add-extra">
            <Plus className="w-4 h-4 mr-1" /> Aggiungi voce
          </Button>
        </div>
      </div>

      {extras.length === 0 ? (
        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3 border border-dashed border-border text-center" data-testid="extra-empty">
          Nessuna lavorazione extra. Clicca su "Aggiungi voce" per crearne una.
        </div>
      ) : (
        <div className="space-y-2" data-testid="extra-list">
          {extras.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center" data-testid={`extra-row-${idx}`}>
              <div className="col-span-7">
                <Input placeholder="Descrizione (es. Riparazione elica)" value={it?.descrizione ?? ""} onChange={(e) => updateExtra(idx, "descrizione", e.target.value)} data-testid={`extra-desc-${idx}`} />
              </div>
              <div className="col-span-4 relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                <Input type="number" step="0.01" min="0" placeholder="0,00" value={it?.prezzo ?? ""} onChange={(e) => updateExtra(idx, "prezzo", e.target.value)} className="pl-10 font-mono-num" data-testid={`extra-prezzo-${idx}`} />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button type="button" size="icon" variant="ghost" onClick={() => removeExtra(idx)} data-testid={`extra-remove-${idx}`} title="Rimuovi voce">
                  <X className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm bg-muted/40 border border-border rounded-md px-3 py-2">
          <span className="text-muted-foreground">{extras.length} / {MAX_EXTRA} voci</span>
          <span className="font-semibold" data-testid="extra-totale">
            Subtotale extra: <span className="font-mono-num text-primary">{fmtEuro(totaleExtra)}</span>
          </span>
        </div>
      )}
    </section>
  );
}
