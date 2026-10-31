import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Percent, ShoppingCart } from "lucide-react";
import { PasswordCell } from "./common";
import FornitoreForm from "./FornitoreForm";

export default function FornitoriTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [applyMarkup, setApplyMarkup] = useState(null);
  const [applying, setApplying] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/magazzino/fornitori");
      setItems(r.data);
    } catch { toast.error("Errore caricamento fornitori"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/magazzino/fornitori/${confirmDelete.id}`);
      toast.success("Fornitore eliminato");
      setConfirmDelete(null);
      load();
    } catch { toast.error("Errore"); }
  };

  const applicaRicarico = async () => {
    if (!applyMarkup?.fornitore?.id) return;
    setApplying(true);
    try {
      const r = await api.post(`/magazzino/fornitori/${applyMarkup.fornitore.id}/applica-ricarico`);
      const d = r.data || {};
      toast.success(`Aggiornati ${d.articoli_aggiornati} articoli (${d.ricarico_percent}%)` + (d.articoli_manuali_saltati ? ` — ${d.articoli_manuali_saltati} bloccati a mano non toccati` : "") + (d.articoli_saltati ? ` — ${d.articoli_saltati} senza prezzo acquisto` : ""));
      setApplyMarkup(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore aggiornamento prezzi");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <Button onClick={() => { setEditing({ nome: "", user: "", password: "", note: "" }); setFormOpen(true); }} className="bg-primary hover:bg-primary/90" data-testid="btn-nuovo-fornitore">
          <Plus className="w-4 h-4 mr-1.5" /> Nuovo fornitore
        </Button>
      </div>

      <div className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Nome</TableHead>
              <TableHead>Sigla</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Password</TableHead>
              <TableHead className="text-right" title="Ricarico % predefinito applicato agli articoli di questo fornitore">Ricarico %</TableHead>
              <TableHead className="text-right" title="Aliquota IVA applicata ai prezzi di vendita di questo fornitore">IVA %</TableHead>
              <TableHead className="text-right" title="Ricarico totale dal prezzo netto di acquisto al prezzo finito IVA inclusa">Totale (ric.+IVA)</TableHead>
              <TableHead className="text-right w-[140px]">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Caricamento…</TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground" data-testid="empty-fornitori">Nessun fornitore</TableCell></TableRow>}
            {items.map((f) => (
              <TableRow key={f.id} data-testid={`row-fornitore-${f.id}`}>
                <TableCell className="font-medium">{f.nome}</TableCell>
                <TableCell><Badge variant="secondary" className="font-mono">{f.abbreviazione || "—"}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{f.user || "—"}</TableCell>
                <TableCell><PasswordCell value={f.password} testId={`pwd-forn-${f.id}`} /></TableCell>
                <TableCell className="text-right font-mono-num text-sm">
                  {f.ricarico_default_percent != null
                    ? <span className="text-primary font-semibold">+{Number(f.ricarico_default_percent).toFixed(1)}%</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right font-mono-num text-sm" data-testid={`forn-iva-${f.id}`}>{Number(f.iva_percent ?? 22).toFixed(0)}%</TableCell>
                <TableCell className="text-right font-mono-num text-sm" data-testid={`forn-ricarico-tot-${f.id}`}>
                  {f.ricarico_default_percent != null
                    ? <span className="font-semibold">+{(((1 + Number(f.ricarico_default_percent) / 100) * (1 + Number(f.iva_percent ?? 22) / 100) - 1) * 100).toFixed(1)}%</span>
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => setApplyMarkup({ fornitore: f, reason: "manual" })} disabled={f.ricarico_default_percent == null} title={f.ricarico_default_percent == null ? "Imposta prima un ricarico %" : `Applica +${Number(f.ricarico_default_percent).toFixed(1)}% a tutti gli articoli`} data-testid={`btn-applica-ricarico-${f.id}`}>
                    <Percent className="w-3.5 h-3.5 text-primary" />
                  </Button>
                  <Button asChild variant="ghost" size="icon" title="Ordine PDF sotto scorta" data-testid={`btn-ordine-forn-${f.id}`}>
                    <a href={`${API}/magazzino/ordine-fornitore.pdf?fornitore_id=${f.id}`} download>
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(f); setFormOpen(true); }} data-testid={`btn-edit-forn-${f.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(f)} data-testid={`btn-del-forn-${f.id}`}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FornitoreForm open={formOpen} onOpenChange={setFormOpen} value={editing} onSaved={(saved, ricaricoChanged) => {
        setFormOpen(false);
        load();
        if (ricaricoChanged && saved?.ricarico_default_percent != null) {
          setApplyMarkup({ fornitore: saved, reason: "changed" });
        }
      }} />

      <AlertDialog open={!!applyMarkup} onOpenChange={(o) => !o && !applying && setApplyMarkup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aggiornare i prezzi degli articoli?</AlertDialogTitle>
            <AlertDialogDescription>
              {applyMarkup?.reason === "changed"
                ? <>Hai modificato il ricarico di <b>{applyMarkup?.fornitore?.nome}</b> a <b>+{Number(applyMarkup?.fornitore?.ricarico_default_percent ?? 0).toFixed(1)}%</b>. Vuoi ricalcolare il <b>prezzo di listino</b> di TUTTI gli articoli di questo fornitore usando il nuovo ricarico?</>
                : <>Ricalcolare il <b>prezzo di listino</b> di TUTTI gli articoli di <b>{applyMarkup?.fornitore?.nome}</b> applicando il ricarico corrente <b>+{Number(applyMarkup?.fornitore?.ricarico_default_percent ?? 0).toFixed(1)}%</b> al prezzo di acquisto?</>}
              <br/><br/>
              <span className="text-xs text-muted-foreground">Formula: vendita netto = acquisto netto × (1 + ricarico%) · prezzo finito = vendita netto × (1 + IVA {Number(applyMarkup?.fornitore?.iva_percent ?? 22)}%). Gli articoli senza prezzo di acquisto verranno saltati.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying} data-testid="btn-annulla-applica-ricarico">Non ora</AlertDialogCancel>
            <AlertDialogAction onClick={applicaRicarico} disabled={applying} className="bg-primary hover:bg-primary/90" data-testid="btn-conferma-applica-ricarico">
              {applying ? "Aggiornamento…" : "Sì, aggiorna prezzi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina fornitore</AlertDialogTitle>
            <AlertDialogDescription>Vuoi eliminare <b>{confirmDelete?.nome}</b>? Gli articoli collegati verranno mantenuti senza fornitore.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
