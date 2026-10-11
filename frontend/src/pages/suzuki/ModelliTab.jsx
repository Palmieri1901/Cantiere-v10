import { useEffect, useMemo, useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, FileText, Sparkles, Search, Download, Tag } from "lucide-react";
import { EMPTY_MODEL, fmt } from "./common";
import ModelloDialog from "./ModelloDialog";
import OfferteDialog from "./OfferteDialog";
import ImportAIDialog from "./ImportAIDialog";
import LogoPdfButton from "./LogoPdfButton";
import ListinoConcessionarioButton from "./ListinoConcessionarioButton";

export default function ModelliTab() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [offerteOpen, setOfferteOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/suzuki/modelli", { params: q ? { q } : {} });
      setItems(r.data);
    } catch {
      toast.error("Errore caricamento modelli");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    if (!q) return items;
    const rx = q.toLowerCase();
    return items.filter((m) =>
      (m.modello || "").toLowerCase().includes(rx) ||
      (m.codice || "").toLowerCase().includes(rx) ||
      (m.categoria || "").toLowerCase().includes(rx)
    );
  }, [items, q]);

  const remove = async (id) => {
    if (!await confirmDialog("Eliminare questo modello?")) return;
    await api.delete(`/suzuki/modelli/${id}`);
    toast.success("Modello eliminato");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex-1 min-w-[220px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cerca per modello, codice, categoria…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="input-search-modelli" />
        </div>
        <Button variant="outline" onClick={async () => {
          try {
            const r = await api.post("/suzuki/seed-listino-2025-2026");
            toast.success(`Listino 2025-2026 popolato · ${r.data.created} nuovi, ${r.data.updated} aggiornati`);
            load();
          } catch (e) { toast.error(e.response?.data?.detail || "Errore seed listino"); }
        }} data-testid="btn-seed-listino">
          <Download className="w-4 h-4 mr-2" /> Popola listino 2025-2026
        </Button>
        <Button variant="outline" onClick={() => window.open(`${API}/suzuki/listino.pdf`, "_blank")} data-testid="btn-pdf-listino">
          <FileText className="w-4 h-4 mr-2" /> Listino pubblico
        </Button>
        <ListinoConcessionarioButton />
        <Button variant="outline" onClick={() => setOfferteOpen(true)} className="border-orange-500 text-orange-700 hover:bg-orange-50 hover:text-orange-800" data-testid="btn-offerte">
          <Tag className="w-4 h-4 mr-2" /> Motori in offerta
        </Button>
        <Button variant="outline" onClick={() => window.open(`${API}/suzuki/caratteristiche.pdf`, "_blank")} data-testid="btn-pdf-caratt">
          <FileText className="w-4 h-4 mr-2" /> PDF Caratteristiche
        </Button>
        <LogoPdfButton />
        <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="btn-import-ai">
          <Sparkles className="w-4 h-4 mr-2" /> Importa listino con AI
        </Button>
        <Button onClick={() => setEditing({ ...EMPTY_MODEL })} className="bg-primary" data-testid="btn-new-modello">
          <Plus className="w-4 h-4 mr-2" /> Nuovo modello
        </Button>
      </div>

      {/* Schede compatte per telefono */}
      <div className="md:hidden space-y-2" data-testid="modelli-cards-mobile">
        {!loading && filtered.map((m) => {
          const netto = m.prezzo_listino * (1 - (m.sconto_perc_1 || 0) / 100) * (1 - (m.sconto_perc_2 || 0) / 100);
          return (
            <Card key={m.id} className="p-3" data-testid={`card-modello-${m.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold leading-tight">{m.modello} <span className="font-mono-num text-muted-foreground font-normal">{m.potenza_hp ? `${m.potenza_hp} HP` : ""}</span></div>
                  <div className="text-xs text-muted-foreground">{[m.codice, m.categoria].filter(Boolean).join(" · ") || "—"}</div>
                  {Number(m.prezzo_offerta) > 0 && <span className="mt-1 inline-flex items-center rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 uppercase">Offerta {fmt(m.prezzo_offerta)}</span>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono-num font-semibold text-primary">{fmt(netto)}</div>
                  <div className="text-[11px] text-muted-foreground font-mono-num">listino {fmt(m.prezzo_listino)}{m.sconto_perc_1 ? ` · −${m.sconto_perc_1}%` : ""}{m.sconto_perc_2 ? ` −${m.sconto_perc_2}%` : ""}</div>
                </div>
              </div>
              <div className="flex justify-end gap-1 mt-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...m })} data-testid={`m-edit-${m.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(m.id)} data-testid={`m-del-${m.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </Card>
          );
        })}
        {!loading && filtered.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nessun modello.</Card>}
      </div>

      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-modelli">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Codice</th>
                <th className="text-left px-4 py-3">Modello</th>
                <th className="text-right px-4 py-3">HP</th>
                <th className="text-left px-4 py-3">Categoria</th>
                <th className="text-right px-4 py-3">Listino</th>
                <th className="text-right px-4 py-3">Sconto</th>
                <th className="text-right px-4 py-3">Netto</th>
                <th className="text-right px-4 py-3 w-24">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Caricamento…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">
                  Nessun modello. Aggiungi manualmente oppure importa il listino Suzuki con l'AI.
                </td></tr>
              ) : filtered.map((m) => {
                const netto = m.prezzo_listino * (1 - (m.sconto_perc_1 || 0) / 100) * (1 - (m.sconto_perc_2 || 0) / 100);
                return (
                  <tr key={m.id} className="border-t border-border/60 hover:bg-muted/30">
                    <td className="px-4 py-2.5 font-mono text-xs">{m.codice || "—"}</td>
                    <td className="px-4 py-2.5 font-semibold">
                      {m.modello}
                      {Number(m.prezzo_offerta) > 0 && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold px-2 py-0.5 uppercase" data-testid={`badge-offerta-${m.id}`}>
                          Offerta {fmt(m.prezzo_offerta)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{m.potenza_hp || "—"}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.categoria || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono-num">{fmt(m.prezzo_listino)}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {m.sconto_perc_1 ? `${m.sconto_perc_1}%` : "—"}
                      {m.sconto_perc_2 ? ` + ${m.sconto_perc_2}%` : ""}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-primary">{fmt(netto)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...m })} data-testid={`btn-edit-${m.id}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(m.id)} data-testid={`btn-del-${m.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <ModelloDialog value={editing} onClose={() => setEditing(null)} onSaved={load} />}
      <ImportAIDialog open={importOpen} onClose={() => setImportOpen(false)} onSaved={load} />
      <OfferteDialog open={offerteOpen} onClose={() => setOfferteOpen(false)} onSaved={load} />
    </div>
  );
}
