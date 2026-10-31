import { useMemo, useState } from "react";
import { mobileStore } from "@/lib/mobileStore";
import { fmtEuro } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import ListiniPdfMobile from "@/pages/app-dipendente/ListiniPdfMobile";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Listino per i dipendenti: solo codice, descrizione e prezzo al pubblico IVA inclusa
export default function Listino() {
  const [q, setQ] = useState("");
  const [forn, setForn] = useState("tutti");
  const [cat, setCat] = useState("tutte");
  const articoli = mobileStore.articoli();
  const fornitori = useMemo(() => [...new Set(articoli.map((a) => a.fornitore).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [articoli]);
  const categorie = useMemo(() => [...new Set(articoli.map((a) => a.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [articoli]);
  const lista = useMemo(() => {
    const s = norm(q.trim());
    let base = articoli;
    if (forn !== "tutti") base = base.filter((a) => a.fornitore === forn);
    if (cat !== "tutte") base = base.filter((a) => a.categoria === cat);
    if (!s) return base.slice(0, forn !== "tutti" || cat !== "tutte" ? 300 : 60);
    return base.filter((a) => norm(`${a.nome} ${a.codice}`).includes(s)).slice(0, 100);
  }, [q, forn, cat, articoli]);
  const filtrato = forn !== "tutti" || cat !== "tutte";

  return (
    <div className="space-y-3" data-testid="listino-mobile">
      <div>
        <h2 className="font-display text-2xl font-semibold">Listini</h2>
        <p className="text-xs text-muted-foreground">Prezzi al pubblico IVA inclusa · sola consultazione</p>
      </div>
      <ListiniPdfMobile />
      <div className="label-mini pt-2">Cerca articolo in magazzino ({articoli.length})</div>
      <div className="bg-background py-1 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per codice o descrizione…" className="pl-9 h-11" data-testid="listino-cerca" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={forn} onValueChange={setForn}>
            <SelectTrigger className="h-10" data-testid="listino-filtro-fornitore"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="tutti">Tutti i fornitori</SelectItem>{fornitori.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="h-10" data-testid="listino-filtro-categoria"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="tutte">Tutte le tipologie</SelectItem>{categorie.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {lista.length === 0 && <div className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-md">Nessun articolo trovato{articoli.length === 0 && ": premi Aggiorna in alto per scaricare il listino"}</div>}
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {lista.map((a) => (
          <div key={a.id} className="p-3 flex items-center gap-3" data-testid={`listino-art-${a.id}`}>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted-foreground font-mono-num" data-testid={`listino-codice-${a.id}`}>{a.codice || "—"}{a.fornitore && !filtrato ? <span className="font-sans"> · {a.fornitore}</span> : null}</div>
              <div className="font-medium text-sm leading-snug" data-testid={`listino-nome-${a.id}`}>{a.nome}</div>
            </div>
            <div className="font-mono-num font-semibold text-primary shrink-0" data-testid={`listino-prezzo-${a.id}`}>{fmtEuro(a.prezzo_pubblico || 0)}</div>
          </div>
        ))}
      </div>
      {!q && !filtrato && articoli.length > 60 && <div className="text-xs text-muted-foreground text-center">Mostrati i primi 60: cerca o filtra per trovare gli altri</div>}
    </div>
  );
}
