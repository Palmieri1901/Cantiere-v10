import { useMemo, useState } from "react";
import { mobileStore } from "@/lib/mobileStore";
import { fmtEuro } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Listino per i dipendenti: solo codice, descrizione e prezzo al pubblico IVA inclusa
export default function Listino() {
  const [q, setQ] = useState("");
  const articoli = mobileStore.articoli();
  const lista = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return articoli.slice(0, 60);
    return articoli.filter((a) => norm(`${a.nome} ${a.codice}`).includes(s)).slice(0, 100);
  }, [q, articoli]);

  return (
    <div className="space-y-3" data-testid="listino-mobile">
      <div>
        <h2 className="font-display text-2xl font-semibold">Listino magazzino</h2>
        <p className="text-xs text-muted-foreground">{articoli.length} articoli · prezzi al pubblico IVA inclusa</p>
      </div>
      <div className="sticky top-[57px] z-10 bg-background py-1">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per codice o descrizione…" className="pl-9 h-11" autoFocus data-testid="listino-cerca" />
        </div>
      </div>
      {lista.length === 0 && <div className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-md">Nessun articolo trovato{articoli.length === 0 && ": premi Aggiorna in alto per scaricare il listino"}</div>}
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {lista.map((a) => (
          <div key={a.id} className="p-3 flex items-center gap-3" data-testid={`listino-art-${a.id}`}>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted-foreground font-mono-num" data-testid={`listino-codice-${a.id}`}>{a.codice || "—"}</div>
              <div className="font-medium text-sm leading-snug" data-testid={`listino-nome-${a.id}`}>{a.nome}</div>
            </div>
            <div className="font-mono-num font-semibold text-primary shrink-0" data-testid={`listino-prezzo-${a.id}`}>{fmtEuro(a.prezzo_pubblico || 0)}</div>
          </div>
        ))}
      </div>
      {!q && articoli.length > 60 && <div className="text-xs text-muted-foreground text-center">Mostrati i primi 60: cerca per trovare gli altri</div>}
    </div>
  );
}
