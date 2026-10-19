import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { fmtEuro } from "@/lib/api";
import { Search, Package } from "lucide-react";

// Ricerca articolo per codice/nome con elenco risultati: sostituisce le tendine ovunque si richiama il magazzino.
export function ArticoloPicker({ articoli = [], onSelect, placeholder = "Cerca articolo per codice o nome…", showPrezzo = true, exclude = [], testId = "articolo-picker", extra }) {
  const [q, setQ] = useState("");
  const trovati = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1) return [];
    return articoli
      .filter((a) => !exclude.includes(a.id) && `${a.codice || ""} ${a.barcode || ""} ${a.nome || ""} ${a.categoria || ""}`.toLowerCase().includes(s))
      .slice(0, 12);
  }, [q, articoli, exclude]);

  return (
    <div className="relative" data-testid={testId}>
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9 h-10" data-testid={`${testId}-input`} />
      {q.trim() && (
        <div className="absolute z-40 left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg divide-y divide-border max-h-72 overflow-y-auto">
          {trovati.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nessun articolo trovato</div>}
          {trovati.map((a) => (
            <button key={a.id} type="button" onClick={() => { onSelect(a); setQ(""); }} className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex items-center justify-between gap-3" data-testid={`${testId}-opt-${a.id}`}>
              <span className="font-medium text-base leading-tight whitespace-normal"><Package className="w-3.5 h-3.5 inline mr-1.5 text-primary" />{a.nome}</span>
              {showPrezzo && <span className="font-mono-num text-xs shrink-0 text-muted-foreground">{fmtEuro(a.prezzo_pubblico ?? a.prezzo_listino ?? 0)}</span>}
            </button>
          ))}
          {extra && extra(q.trim(), () => setQ(""))}
        </div>
      )}
    </div>
  );
}
