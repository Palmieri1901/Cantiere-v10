import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { BookUser, Building2, User, UserPlus } from "lucide-react";

let cache = null;
export const CAMPI_ANAGRAFICA = ["nome", "cognome", "tipo_soggetto", "ragione_sociale", "partita_iva", "codice_sdi", "pec", "codice_fiscale", "indirizzo", "via", "cap", "citta", "provincia", "nazione", "telefono", "cellulare", "email"];
export const daVoce = (a) => Object.fromEntries(CAMPI_ANAGRAFICA.map((k) => [k, a[k] || (k === "tipo_soggetto" ? "privato" : "")]));

export function useAnagrafica() {
  const [list, setList] = useState(cache || []);
  useEffect(() => {
    api.get("/anagrafica").then((r) => { cache = r.data; setList(r.data); }).catch(() => {});
    const inv = () => { cache = null; };
    window.addEventListener("anagrafica-changed", inv);
    return () => window.removeEventListener("anagrafica-changed", inv);
  }, []);
  return list;
}

export const cercaAnagrafica = (list, query, max = 5) => {
  const parole = (query || "").toLowerCase().split(/\s+/).filter((p) => p.length >= 2);
  if (!parole.length) return [];
  return list.filter((a) => { const k = `${a.cognome} ${a.nome} ${a.ragione_sociale}`.toLowerCase(); return parole.every((p) => k.includes(p)); }).slice(0, max);
};

// Mentre si scrive un nominativo mostra le voci dell'Anagrafica generale corrispondenti; se nessuna, avvisa che sarà un nuovo cliente
export function AnagraficaSuggerimenti({ query, onPick, attivo = true, testId = "ana-sugg" }) {
  const list = useAnagrafica();
  const hits = useMemo(() => cercaAnagrafica(list, query), [list, query]);
  const q = (query || "").trim();
  if (!attivo || q.length < 3) return null;
  if (!hits.length) return <div className="mt-1 text-[11px] text-muted-foreground inline-flex items-center gap-1" data-testid={`${testId}-nuovo`}><UserPlus className="w-3 h-3" /> Non presente in Anagrafica generale: verrà creato come nuovo cliente.</div>;
  return (
    <div className="mt-1 rounded-md border border-primary/30 bg-primary/5 overflow-hidden" data-testid={testId}>
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-primary font-semibold inline-flex items-center gap-1"><BookUser className="w-3 h-3" /> Già in Anagrafica generale</div>
      <div className="divide-y divide-border">
        {hits.map((a) => (
          <button key={a.id} type="button" onClick={() => onPick(daVoce(a), a)} className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-primary/10" data-testid={`${testId}-pick-${a.id}`}>
            {a.tipo_soggetto === "azienda" ? <Building2 className="w-4 h-4 text-amber-700 shrink-0" /> : <User className="w-4 h-4 text-primary shrink-0" />}
            <span className="flex-1 min-w-0">
              <span className="font-medium">{a.tipo_soggetto === "azienda" && a.ragione_sociale ? `${a.ragione_sociale} · ` : ""}{`${a.cognome} ${a.nome}`.trim()}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{[a.citta, a.telefono || a.cellulare, a.codice_fiscale].filter(Boolean).join(" · ") || "Usa questi dati"}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
