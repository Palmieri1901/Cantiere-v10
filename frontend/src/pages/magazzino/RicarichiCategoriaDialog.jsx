import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Percent, Plus, Save, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

function RicaricoRow({ item, onSave, onDelete, onApplica }) {
  const [val, setVal] = useState(item.ricarico_percent);
  const dirty = Number(val) !== Number(item.ricarico_percent);
  return (
    <TableRow data-testid={`row-ricarico-${item.id}`}>
      <TableCell className="font-medium">{item.categoria}</TableCell>
      <TableCell className="text-right">
        <div className="relative w-[110px] inline-block">
          <Input
            type="number" step="0.1"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            className="pr-8 h-8 text-right font-mono-num"
            data-testid={`input-ricarico-${item.id}`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        {dirty && (
          <Button size="icon" variant="ghost" onClick={() => onSave(item.categoria, val)} data-testid={`btn-save-ricarico-${item.id}`}>
            <Save className="w-3.5 h-3.5 text-primary" />
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={onApplica} title="Aggiorna il prezzo di vendita degli articoli di questa categoria" data-testid={`btn-applica-ricarico-${item.id}`}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} data-testid={`btn-del-ricarico-${item.id}`}>
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function RicarichiCategoriaDialog({ open, onOpenChange, categorie, onApplicato }) {
  const [items, setItems] = useState([]);
  const [applicando, setApplicando] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nuovaCat, setNuovaCat] = useState("");
  const [nuovoPercent, setNuovoPercent] = useState(30);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/magazzino/ricarichi-categoria");
      setItems(r.data);
    } catch {
      toast.error("Errore caricamento ricarichi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const saveOne = async (categoria, ricarico_percent) => {
    try {
      await api.post("/magazzino/ricarichi-categoria", {
        categoria, ricarico_percent: Number(ricarico_percent),
      });
      toast.success(`Ricarico salvato: ${categoria} → +${ricarico_percent}%`);
      load();
      if (await confirmDialog(`Aggiornare subito il prezzo di vendita di tutti gli articoli "${categoria}" con ricarico +${ricarico_percent}% sul prezzo di acquisto?`, { title: "Aggiorna listino", okLabel: "Aggiorna prezzi", danger: false })) {
        await applica(categoria);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore salvataggio");
    }
  };

  const applica = async (categoria = "") => {
    setApplicando(true);
    try {
      const r = await api.post(`/magazzino/ricarichi-categoria/applica${categoria ? `?categoria=${encodeURIComponent(categoria)}` : ""}`);
      toast.success(`Listino aggiornato: ${r.data.articoli_aggiornati} prezzi di vendita ricalcolati${r.data.articoli_saltati ? `, ${r.data.articoli_saltati} senza prezzo di acquisto saltati` : ""}`);
      onApplicato?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore aggiornamento listino");
    } finally { setApplicando(false); }
  };

  const applicaTutti = async () => {
    if (!(await confirmDialog("Ricalcolare il prezzo di vendita di TUTTI gli articoli delle categorie con ricarico impostato (prezzo acquisto × ricarico)? I prezzi modificati a mano verranno sovrascritti.", { title: "Aggiorna listino", okLabel: "Aggiorna tutto", danger: false }))) return;
    await applica("");
  };

  const remove = async (item) => {
    try {
      await api.delete(`/magazzino/ricarichi-categoria/${item.id}`);
      toast.success(`Rimosso ricarico ${item.categoria}`);
      setConfirmDelete(null);
      load();
    } catch {
      toast.error("Errore");
    }
  };

  const aggiungi = async () => {
    const cat = nuovaCat.trim();
    if (!cat) { toast.error("Inserisci la categoria"); return; }
    const p = Number(nuovoPercent);
    if (!Number.isFinite(p)) { toast.error("Ricarico non valido"); return; }
    setSaving(true);
    await saveOne(cat, p);
    setNuovaCat(""); setNuovoPercent(30);
    setSaving(false);
  };

  const categorieNonMappate = categorie.filter((c) => !items.some((i) => i.categoria === c));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="dialog-ricarichi">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-primary" /> Ricarichi predefiniti per categoria
          </DialogTitle>
          <DialogDescription>
            Imposta un ricarico % standard per ogni categoria. Salvandolo puoi aggiornare subito il prezzo di vendita degli articoli (prezzo acquisto × ricarico); viene inoltre applicato:
            <span className="block mt-1">• ai <b>nuovi articoli</b> importati dal DDT (calcolando il prezzo di vendita)</span>
            <span className="block">• agli articoli aggiornati dal DDT senza ricarico corrente</span>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto pr-1 space-y-3">
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">Aggiungi ricarico</div>
            <div className="flex flex-wrap gap-2">
              {categorieNonMappate.length > 0 ? (
                <Select value={nuovaCat} onValueChange={setNuovaCat}>
                  <SelectTrigger className="w-[220px]" data-testid="ricarichi-select-cat"><SelectValue placeholder="Categoria esistente" /></SelectTrigger>
                  <SelectContent>
                    {categorieNonMappate.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={nuovaCat}
                  onChange={(e) => setNuovaCat(e.target.value)}
                  placeholder="Nome categoria (es. Ferramenta)"
                  className="w-[220px]"
                />
              )}
              <Input
                value={nuovaCat}
                onChange={(e) => setNuovaCat(e.target.value)}
                placeholder="oppure digitala"
                className="w-[220px]"
                data-testid="ricarichi-input-cat"
              />
              <div className="relative w-[110px]">
                <Input
                  type="number" step="0.1"
                  value={nuovoPercent}
                  onChange={(e) => setNuovoPercent(e.target.value)}
                  className="pr-8 font-mono-num"
                  data-testid="ricarichi-input-perc"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
              <Button onClick={aggiungi} disabled={saving || !nuovaCat.trim()} className="bg-primary hover:bg-primary/90" data-testid="btn-ricarichi-add">
                <Plus className="w-4 h-4 mr-1" /> Aggiungi
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right w-[160px]">Ricarico %</TableHead>
                  <TableHead className="text-right w-[80px]">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground">Caricamento…</TableCell></TableRow>}
                {!loading && items.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground" data-testid="empty-ricarichi">Nessun ricarico impostato</TableCell></TableRow>
                )}
                {items.map((it) => (
                  <RicaricoRow key={it.id} item={it} onSave={saveOne} onDelete={() => setConfirmDelete(it)}
                    onApplica={async () => { if (await confirmDialog(`Aggiornare il prezzo di vendita degli articoli "${it.categoria}" con +${it.ricarico_percent}%?`, { title: "Aggiorna listino", okLabel: "Aggiorna", danger: false })) applica(it.categoria); }} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={applicaTutti} disabled={applicando || items.length === 0} data-testid="btn-aggiorna-listino">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${applicando ? "animate-spin" : ""}`} /> {applicando ? "Aggiornamento…" : "Aggiorna listino"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </DialogFooter>

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Rimuovi ricarico
              </AlertDialogTitle>
              <AlertDialogDescription>
                Vuoi rimuovere il ricarico predefinito per <b>{confirmDelete?.categoria}</b> (+{confirmDelete?.ricarico_percent}%)? I nuovi articoli di questa categoria non useranno più un ricarico automatico.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="ricarichi-del-cancel">Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={() => remove(confirmDelete)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="ricarichi-del-confirm">
                Rimuovi
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
