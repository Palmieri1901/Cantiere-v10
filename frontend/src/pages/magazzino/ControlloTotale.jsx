import { fmtEuro } from "@/lib/api";
import { CheckCircle2, AlertTriangle } from "lucide-react";

// Confronta la somma delle righe lette (articoli + spese, IVA esclusa) con il totale del documento
export function ControlloTotale({ result, rows, spese }) {
  const iva = Number(result?.iva_percent) || 22;
  const righe = rows.reduce((s, r) => s + (Number(r.quantita) || 0) * (Number(r.importo_netto) || 0), 0);
  const sp = (spese || []).reduce((s, x) => s + (Number(x.importo) || 0), 0);
  const imponibile = +(righe + sp).toFixed(2);
  const docImp = Number(result?.totale_imponibile) || 0;
  const docTot = Number(result?.totale_documento) || 0;
  const atteso = docImp || (docTot ? +(docTot / (1 + iva / 100)).toFixed(2) : 0);
  if (!atteso) {
    return (
      <div className="mb-3 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground" data-testid="ddt-controllo-totale">
        Somma righe lette: <b className="font-mono-num">{fmtEuro(imponibile)}</b> IVA esclusa (articoli {fmtEuro(righe)}{sp ? ` + spese ${fmtEuro(sp)}` : ""}). Totale del documento non letto: controlla a mano.
      </div>
    );
  }
  const diff = +(imponibile - atteso).toFixed(2);
  const ok = Math.abs(diff) <= Math.max(0.05, atteso * 0.002);
  return (
    <div className={`mb-3 rounded-md border p-3 text-xs flex items-start gap-2 ${ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-400 bg-amber-50 text-amber-900"}`} data-testid="ddt-controllo-totale">
      {ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
      <div>
        <b>{ok ? "Totale verificato" : "Il totale non torna"}</b> — righe lette <span className="font-mono-num">{fmtEuro(imponibile)}</span> vs documento <span className="font-mono-num">{fmtEuro(atteso)}</span> (IVA esclusa)
        {!ok && <span data-testid="ddt-controllo-diff">, differenza <b className="font-mono-num">{diff > 0 ? "+" : ""}{fmtEuro(diff)}</b>. Controlla quantità, prezzi, sconti o righe mancanti prima di importare.</span>}
        {docTot > 0 && <span className="block text-[11px] opacity-80">Totale documento IVA inclusa: {fmtEuro(docTot)}</span>}
      </div>
    </div>
  );
}
