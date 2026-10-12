import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Sailboat, UserRound, Check } from "lucide-react";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Elenco unico (clienti rimessaggio + clienti esterni) con ricerca e suggerimenti in base al nome dettato dal dipendente
export function ClientePicker({ clienti, esterni, value, onChange, suggerimento }) {
  const [q, setQ] = useState("");
  const tutti = useMemo(() => [
    ...clienti.map((c) => ({ id: c.id, label: `${c.cognome} ${c.nome}`.trim(), sub: `${c.tipo_barca || ""}${c.lunghezza ? ` ${c.lunghezza} m` : ""} · ${c.anno}`, tipo: "rimessaggio", chiave: norm(`${c.cognome} ${c.nome}`) })),
    ...esterni.map((e) => ({ id: e.id, label: e.nome, sub: `Cliente esterno${e.n ? ` · ${e.n} lavori · ${Number(e.totale || 0).toFixed(2)} €` : ""}`, tipo: "esterno", chiave: norm(e.nome) })),
  ], [clienti, esterni]);

  const suggeriti = useMemo(() => {
    const parole = norm(suggerimento).split(" ").filter((p) => p.length >= 3);
    if (!parole.length) return [];
    return tutti.filter((t) => parole.some((p) => t.chiave.includes(p))).slice(0, 6);
  }, [tutti, suggerimento]);

  const filtrati = useMemo(() => {
    const s = norm(q);
    if (!s) return suggeriti.length ? suggeriti : tutti.slice(0, 8);
    return tutti.filter((t) => t.chiave.includes(s)).slice(0, 12);
  }, [q, tutti, suggeriti]);

  const sel = tutti.find((t) => t.id === value);

  return (
    <div className="space-y-2" data-testid="cliente-picker">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per cognome o nome…" data-testid="cliente-picker-cerca" />
      {!q && suggeriti.length > 0 && <div className="text-[11px] text-muted-foreground">Corrispondenze con «{suggerimento}»:</div>}
      <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border bg-card" data-testid="cliente-picker-lista">
        {filtrati.length === 0 && <div className="text-xs text-muted-foreground p-3 text-center">Nessun cliente trovato</div>}
        {filtrati.map((t) => (
          <button key={t.id} type="button" onClick={() => onChange(t.id)} className={`w-full text-left flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 ${t.id === value ? "bg-primary/10" : ""}`} data-testid={`cliente-opt-${t.id}`}>
            {t.tipo === "rimessaggio" ? <Sailboat className="w-4 h-4 text-primary shrink-0" /> : <UserRound className="w-4 h-4 text-amber-600 shrink-0" />}
            <span className="flex-1 min-w-0"><span className="font-medium">{t.label}</span><span className="block text-[11px] text-muted-foreground truncate">{t.sub}</span></span>
            {t.id === value && <Check className="w-4 h-4 text-primary shrink-0" />}
          </button>
        ))}
      </div>
      {sel && <div className="text-xs" data-testid="cliente-picker-selezionato">Il lavoro verrà sommato al conto di <b>{sel.label}</b> ({sel.tipo === "rimessaggio" ? "scheda rimessaggio" : "cliente esterno"}).</div>}
    </div>
  );
}
