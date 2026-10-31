import { Card } from "@/components/ui/card";

const eur = (v) => (v == null ? "—" : `${Math.round(Number(v)).toLocaleString("it-IT")} €`);

function Quota({ label, r, testId }) {
  if (!r) return null;
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2" data-testid={testId}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono-num text-sm">{eur(r.valore_min)} – {eur(r.valore_max)}</div>
      <div className="font-mono-num font-semibold text-primary">{eur(r.valore_consigliato)}</div>
    </div>
  );
}

export function ValutazioneCard({ v, actions }) {
  const r = v.risultato || {};
  const data = v.created_at ? new Date(v.created_at).toLocaleDateString("it-IT") : "";
  const titolo = [v.gommone?.modello, v.motore?.modello].filter(Boolean).join(" + ");
  return (
    <Card className="p-4" data-testid={`val-card-${v.id}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold truncate">{titolo || "Valutazione"}</div>
          <div className="text-xs text-muted-foreground">{data}{v.cliente ? ` · ${v.cliente}` : ""}{v.telefono ? ` · ${v.telefono}` : ""}</div>
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
            {v.motore && <span>Motore{Number(v.motore.numero || 1) > 1 ? ` ×${v.motore.numero}` : ""} {v.motore.anno} · {Number(v.motore.ore || 0)} h · {v.motore.stato}</span>}
            {v.gommone && <span>{v.gommone.tipo === "barca" ? "Barca" : "Gommone"} {v.gommone.anno} · {v.gommone.stato}{v.gommone.tipo !== "barca" ? ` · tubolari ${v.gommone.tubolari_nuovi ? `rifatti${v.gommone.tubolari_anni != null ? ` da ${v.gommone.tubolari_anni} anni` : ""}` : "originali"}` : ""}</span>}
            {(v.n_foto || 0) > 0 && <span data-testid={`val-nfoto-${v.id}`}>{v.n_foto} foto analizzate</span>}
          </div>
          {r.commento && <p className="text-sm mt-2 leading-snug">{r.commento}</p>}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:w-[360px] shrink-0">
          <Quota label="Motore" r={r.motore} testId={`val-quota-motore-${v.id}`} />
          <Quota label={v.gommone?.tipo === "barca" ? "Barca" : "Gommone"} r={r.gommone} testId={`val-quota-gommone-${v.id}`} />
          <Quota label="Totale" r={v.motore && v.gommone ? r.totale : null} testId={`val-quota-totale-${v.id}`} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3 justify-end">{actions}</div>
    </Card>
  );
}
