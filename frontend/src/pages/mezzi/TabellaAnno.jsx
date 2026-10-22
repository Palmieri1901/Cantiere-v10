import { fmtEuro } from "@/lib/api";

const SPESE = ["carburante", "riparazione", "biglietti", "pedaggio", "assicurazione", "altro"];
const cls = (v) => (v < 0 ? "text-destructive" : v > 0 ? "text-emerald-700" : "text-muted-foreground");

export default function TabellaAnno({ r, meseSel, onMese }) {
  if (!r) return null;
  const et = r.etichette;
  return (
    <div className="rounded-md border border-border overflow-x-auto" data-testid="mezzi-tabella-anno">
      <table className="w-full text-sm min-w-[900px]">
        <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Mese</th>
            <th className="text-right px-3 py-2">Incassi</th>
            {SPESE.map((c) => <th key={c} className="text-right px-3 py-2">{et[c]}</th>)}
            <th className="text-right px-3 py-2">Tot. spese</th>
            <th className="text-right px-3 py-2">Parziale</th>
          </tr>
        </thead>
        <tbody>
          {r.mesi.map((m) => (
            <tr key={m.mese} onClick={() => onMese(meseSel === m.mese ? null : m.mese)} className={`border-t border-border cursor-pointer hover:bg-muted/30 ${meseSel === m.mese ? "bg-primary/5" : ""}`} data-testid={`mezzi-mese-${m.mese}`}>
              <td className="px-3 py-2 font-medium">{m.nome} <span className="text-[10px] text-muted-foreground">{m.n ? `(${m.n})` : ""}</span></td>
              <td className="px-3 py-2 text-right font-mono-num text-emerald-700">{m.incasso ? fmtEuro(m.incasso) : "—"}</td>
              {SPESE.map((c) => <td key={c} className="px-3 py-2 text-right font-mono-num">{m[c] ? fmtEuro(m[c]) : "—"}</td>)}
              <td className="px-3 py-2 text-right font-mono-num font-medium">{m.spese ? fmtEuro(m.spese) : "—"}</td>
              <td className={`px-3 py-2 text-right font-mono-num font-semibold ${cls(m.parziale)}`}>{m.n ? fmtEuro(m.parziale) : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-primary/40 bg-muted/40 font-semibold" data-testid="mezzi-totale-anno">
            <td className="px-3 py-2.5">TOTALE {r.anno}</td>
            <td className="px-3 py-2.5 text-right font-mono-num text-emerald-700">{fmtEuro(r.totale.incasso)}</td>
            {SPESE.map((c) => <td key={c} className="px-3 py-2.5 text-right font-mono-num">{fmtEuro(r.totale[c])}</td>)}
            <td className="px-3 py-2.5 text-right font-mono-num">{fmtEuro(r.totale.spese)}</td>
            <td className={`px-3 py-2.5 text-right font-mono-num text-base ${cls(r.totale.parziale)}`}>{fmtEuro(r.totale.parziale)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
