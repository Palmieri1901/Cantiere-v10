import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtEuro } from "@/lib/api";
import { Search, Package } from "lucide-react";

const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));

// Ricerca articolo per codice/nome con elenco risultati; con filtri=true aggiunge tendine Fornitore e Tipologia.
export function ArticoloPicker({ articoli = [], onSelect, placeholder = "Cerca articolo per codice o nome…", showPrezzo = true, exclude = [], testId = "articolo-picker", extra, filtri = false }) {
  const [q, setQ] = useState("");
  const [forn, setForn] = useState("tutti");
  const [cat, setCat] = useState("tutte");
  const fornitori = useMemo(() => uniq(articoli.map((a) => a.fornitore || a.fornitore_nome)), [articoli]);
  const categorie = useMemo(() => uniq(articoli.map((a) => a.categoria)), [articoli]);
  const filtrato = filtri && (forn !== "tutti" || cat !== "tutte");
  const trovati = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1 && !filtrato) return [];
    return articoli
      .filter((a) => !exclude.includes(a.id))
      .filter((a) => forn === "tutti" || (a.fornitore || a.fornitore_nome) === forn)
      .filter((a) => cat === "tutte" || a.categoria === cat)
      .filter((a) => !s || `${a.codice || ""} ${a.barcode || ""} ${a.nome || ""} ${a.categoria || ""}`.toLowerCase().includes(s))
      .slice(0, filtrato && !s ? 60 : 12);
  }, [q, articoli, exclude, forn, cat, filtrato]);
  const aperto = !!q.trim() || filtrato;

  return (
    <div className="space-y-2" data-testid={testId}>
      {filtri && (
        <div className="grid grid-cols-2 gap-2">
          <Select value={forn} onValueChange={setForn}>
            <SelectTrigger className="h-9 text-xs" data-testid={`${testId}-fornitore`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="tutti">Tutti i fornitori</SelectItem>{fornitori.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="h-9 text-xs" data-testid={`${testId}-categoria`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="tutte">Tutte le tipologie</SelectItem>{categorie.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-9 h-10" data-testid={`${testId}-input`} />
        {aperto && (
          <div className="absolute z-40 left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg divide-y divide-border max-h-72 overflow-y-auto">
            {trovati.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">Nessun articolo trovato</div>}
            {trovati.map((a) => (
              <button key={a.id} type="button" onClick={() => { onSelect(a); setQ(""); }} className="w-full text-left px-3 py-2.5 hover:bg-muted text-sm flex items-center justify-between gap-3" data-testid={`${testId}-opt-${a.id}`}>
                <span className="font-medium text-base leading-tight whitespace-normal"><Package className="w-3.5 h-3.5 inline mr-1.5 text-primary" />{a.nome}{filtri && !filtrato && (a.fornitore || a.fornitore_nome) ? <span className="block text-[11px] text-muted-foreground font-normal">{a.fornitore || a.fornitore_nome}{a.categoria ? ` · ${a.categoria}` : ""}</span> : null}</span>
                {showPrezzo && <span className="font-mono-num text-xs shrink-0 text-muted-foreground">{fmtEuro(a.prezzo_pubblico ?? a.prezzo_listino ?? 0)}</span>}
              </button>
            ))}
            {extra && extra(q.trim(), () => setQ(""))}
          </div>
        )}
      </div>
    </div>
  );
}
