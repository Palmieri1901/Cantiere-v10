import { useMemo, useState } from "react";
import { mobileStore } from "@/lib/mobileStore";
import { fmtEuro } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { BarcodeButton } from "@/components/BarcodeButton";
import { Search, Package } from "lucide-react";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function Listino() {
  const [q, setQ] = useState("");
  const articoli = mobileStore.articoli();
  const lista = useMemo(() => {
    const s = norm(q.trim());
    if (!s) return articoli.slice(0, 60);
    return articoli.filter((a) => norm(`${a.nome} ${a.codice} ${a.barcode} ${a.categoria}`).includes(s)).slice(0, 100);
  }, [q, articoli]);

  return (
    <div className="space-y-3" data-testid="listino-mobile">
      <div>
        <h2 className="font-display text-2xl font-semibold">Listino magazzino</h2>
        <p className="text-xs text-muted-foreground">{articoli.length} articoli · aggiornati all'ultima sincronizzazione</p>
      </div>
      <div className="flex gap-2 sticky top-[57px] z-10 bg-background py-1">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per nome o codice…" className="pl-9 h-11" autoFocus data-testid="listino-cerca" />
        </div>
        <BarcodeButton label="" size="icon" className="h-11 w-11 shrink-0" onCode={setQ} testId="listino-barcode" />
      </div>
      {lista.length === 0 && <div className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-md">Nessun articolo trovato{articoli.length === 0 && ": premi Aggiorna in alto per scaricare il listino"}</div>}
      <div className="space-y-2">
        {lista.map((a) => (
          <div key={a.id} className="rounded-lg border border-border bg-card p-3 flex items-start gap-3" data-testid={`listino-art-${a.id}`}>
            <span className="w-9 h-9 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0"><Package className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm leading-snug">{a.nome}</div>
              <div className="text-[11px] text-muted-foreground font-mono-num mt-0.5">{a.codice || "—"}{a.barcode ? ` · ${a.barcode}` : ""}{a.categoria ? ` · ${a.categoria}` : ""}</div>
              <div className="flex items-center gap-3 mt-1.5 text-xs">
                <span className={`font-mono-num ${Number(a.quantita) <= 0 ? "text-destructive font-semibold" : ""}`}>Giacenza {Number(a.quantita)} {a.unita || "pz"}</span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono-num font-semibold text-primary">{fmtEuro(a.prezzo_listino || 0)}</div>
              <div className="text-[10px] text-muted-foreground">{fmtEuro((a.prezzo_listino || 0) * 1.22)} IVA incl.</div>
            </div>
          </div>
        ))}
      </div>
      {!q && articoli.length > 60 && <div className="text-xs text-muted-foreground text-center">Mostrati i primi 60: cerca per trovare gli altri</div>}
    </div>
  );
}
