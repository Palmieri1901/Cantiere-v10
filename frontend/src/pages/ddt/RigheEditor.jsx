import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { fmt } from "./common";
import { confirmDialog } from "@/components/ConfirmDialog";

export default function RigheEditor({ righe, onChange }) {
  const upd = (i, k, v) => onChange(righe.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const add = () => onChange([...righe, { quantita: 1, descrizione: "", prezzo_unitario: 0 }]);
  const del = async (i) => { if (await confirmDialog("Rimuovere questa riga?", { okLabel: "Rimuovi" })) onChange(righe.filter((_, idx) => idx !== i)); };
  const tot = righe.reduce((s, r) => s + (Number(r.quantita) || 0) * (Number(r.prezzo_unitario) || 0), 0);
  return (
    <div>
      <table className="w-full text-sm" data-testid="ddt-righe">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr><th className="text-left w-20 pb-1">Q.tà</th><th className="text-left pb-1">Descrizione</th><th className="text-right w-32 pb-1">Prezzo unit. €</th><th className="text-right w-28 pb-1">Totale</th><th className="w-8"></th></tr>
        </thead>
        <tbody>
          {righe.map((r, i) => (
            <tr key={i} data-testid={`ddt-riga-${i}`}>
              <td className="py-1 pr-2"><Input className="h-8 text-right" type="number" step="1" value={r.quantita} onChange={(e) => upd(i, "quantita", e.target.value)} data-testid={`ddt-riga-qta-${i}`} /></td>
              <td className="py-1 pr-2"><Input className="h-8" value={r.descrizione} onChange={(e) => upd(i, "descrizione", e.target.value)} placeholder="Descrizione merce" data-testid={`ddt-riga-desc-${i}`} /></td>
              <td className="py-1 pr-2"><Input className="h-8 text-right" type="number" step="0.01" value={r.prezzo_unitario || ""} onChange={(e) => upd(i, "prezzo_unitario", e.target.value)} placeholder="0" /></td>
              <td className="py-1 text-right font-mono-num text-muted-foreground">{(Number(r.quantita) || 0) * (Number(r.prezzo_unitario) || 0) ? fmt((Number(r.quantita) || 0) * (Number(r.prezzo_unitario) || 0)) : "—"}</td>
              <td className="py-1 text-right"><button type="button" onClick={() => del(i)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between mt-2">
        <Button type="button" variant="outline" size="sm" onClick={add} data-testid="ddt-add-riga"><Plus className="w-3.5 h-3.5 mr-1" /> Aggiungi riga</Button>
        {tot > 0 && <div className="text-sm font-semibold">Totale: <span className="font-mono-num">{fmt(tot)}</span></div>}
      </div>
    </div>
  );
}
