import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookUser, Building2, User } from "lucide-react";

const CAMPI = ["nome", "cognome", "tipo_soggetto", "ragione_sociale", "partita_iva", "codice_sdi", "pec", "codice_fiscale", "indirizzo", "telefono", "cellulare", "email"];

// Tasto "Da anagrafica": sceglie una voce e precompila i dati anagrafici del form
export function AnagraficaPicker({ onPick, testId = "btn-da-anagrafica" }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { if (open && !list) api.get("/anagrafica").then((r) => setList(r.data)).catch(() => setList([])); }, [open, list]);
  const ql = q.trim().toLowerCase();
  const vis = (list || []).filter((a) => !ql || `${a.cognome} ${a.nome} ${a.ragione_sociale} ${a.partita_iva} ${a.telefono}`.toLowerCase().includes(ql)).slice(0, 50);
  const scegli = (a) => { onPick(Object.fromEntries(CAMPI.map((k) => [k, a[k] || (k === "tipo_soggetto" ? "privato" : "")]))); setOpen(false); };
  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => { setOpen(true); setQ(""); }} data-testid={testId}><BookUser className="w-3.5 h-3.5 mr-1" /> Da anagrafica</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-md" data-testid="anagrafica-picker">
          <DialogHeader><DialogTitle>Scegli dall'anagrafica</DialogTitle><DialogDescription>I dati anagrafici e fiscali verranno copiati nel modulo.</DialogDescription></DialogHeader>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca…" autoFocus data-testid="anagrafica-picker-cerca" />
          <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border divide-y divide-border">
            {vis.map((a) => (
              <button key={a.id} type="button" onClick={() => scegli(a)} className="w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 hover:bg-muted/50" data-testid={`anagrafica-pick-${a.id}`}>
                {a.tipo_soggetto === "azienda" ? <Building2 className="w-4 h-4 text-amber-700 shrink-0" /> : <User className="w-4 h-4 text-primary shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="font-medium">{a.tipo_soggetto === "azienda" && a.ragione_sociale ? a.ragione_sociale : `${a.cognome} ${a.nome}`.trim()}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{[a.partita_iva && `P.IVA ${a.partita_iva}`, a.telefono, a.email].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            ))}
            {list && !vis.length && <div className="p-3 text-xs text-muted-foreground">Nessuna voce trovata.</div>}
            {!list && <div className="p-3 text-xs text-muted-foreground">Caricamento…</div>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
