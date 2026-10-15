import { Input } from "@/components/ui/input";
import { Truck } from "lucide-react";
import { fmtEuro } from "@/lib/api";

const VOCI = [
  { tipo: "ritiro", label: "Ritiro", prefisso: "Ritiro da", placeholder: "Luogo di ritiro (es. Porto Azzurro, molo 3)" },
  { tipo: "consegna", label: "Consegna", prefisso: "Consegna a", placeholder: "Luogo di consegna (es. Marina di Campo)" },
];

export const descrRitiroConsegna = (it) => `${VOCI.find((v) => v.tipo === it.tipo)?.prefisso || it.tipo} ${String(it.luogo || "").trim()}`.trim();

// Fuori sede: due voci di prezzo (ritiro e consegna) con luogo; salvate in lavorazioni_extra con tipo
export default function RitiroConsegnaSection({ f, update }) {
  const extras = Array.isArray(f.lavorazioni_extra) ? f.lavorazioni_extra : [];
  const get = (tipo) => extras.find((it) => it?.tipo === tipo) || { tipo, luogo: "", prezzo: "" };
  const set = (tipo, key, value) => {
    const cur = { ...get(tipo), [key]: value };
    cur.descrizione = descrRitiroConsegna(cur);
    update("lavorazioni_extra", [...extras.filter((it) => it?.tipo !== tipo), cur]);
  };
  const totale = VOCI.reduce((s, v) => s + (Number(get(v.tipo).prezzo) || 0), 0);

  return (
    <section data-testid="section-ritiro-consegna">
      <div className="flex items-center gap-1.5 label-mini mb-0.5"><Truck className="w-3 h-3" /> Ritiro e consegna (fuori sede)</div>
      <p className="text-xs text-muted-foreground mb-3">Indica dove viene ritirata e riconsegnata la barca e il prezzo di ogni tratta. Le voci entrano nel totale e nel PDF.</p>
      <div className="space-y-2">
        {VOCI.map((v) => {
          const it = get(v.tipo);
          return (
            <div key={v.tipo} className="grid grid-cols-12 gap-2 items-center" data-testid={`rc-row-${v.tipo}`}>
              <div className="col-span-12 sm:col-span-2 text-sm font-medium">{v.label}</div>
              <div className="col-span-8 sm:col-span-7">
                <Input placeholder={v.placeholder} value={it.luogo ?? ""} onChange={(e) => set(v.tipo, "luogo", e.target.value)} data-testid={`rc-luogo-${v.tipo}`} />
              </div>
              <div className="col-span-4 sm:col-span-3 relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
                <Input type="number" step="0.01" min="0" placeholder="0,00" value={it.prezzo ?? ""} onChange={(e) => set(v.tipo, "prezzo", e.target.value)} className="pl-10 font-mono-num" data-testid={`rc-prezzo-${v.tipo}`} />
              </div>
            </div>
          );
        })}
      </div>
      {totale > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm bg-muted/40 border border-border rounded-md px-3 py-2">
          <span className="text-muted-foreground">Ritiro + consegna</span>
          <span className="font-mono-num font-semibold text-primary" data-testid="rc-totale">{fmtEuro(totale)}</span>
        </div>
      )}
    </section>
  );
}
