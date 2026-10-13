import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { StickyNote, Save, Trash2 } from "lucide-react";

// Inserimento rapido del memo di un cliente in rimessaggio (senza aprire la scheda completa)
export function MemoDialog({ cliente, onClose, onSaved }) {
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMemo(cliente?.memo || ""); }, [cliente]);

  const salva = async (valore) => {
    setBusy(true);
    try {
      await api.patch(`/clienti/${cliente.id}/memo`, { memo: valore });
      toast.success(valore.trim() ? "Memo salvato" : "Memo rimosso");
      onSaved(cliente.id, valore.trim()); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore nel salvataggio"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={!!cliente} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="memo-dialog">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><StickyNote className="w-5 h-5 text-amber-600" /> Memo · {cliente?.cognome} {cliente?.nome}</DialogTitle>
          <DialogDescription>Promemoria che compare quando il cliente viene richiamato in calendario e nell'app dei dipendenti.</DialogDescription>
        </DialogHeader>
        <Textarea rows={4} autoFocus value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Es. Chiedere conferma antivegetativa · Chiavi nel cassetto 3 · Pagamento in sospeso…" className="border-amber-300 bg-amber-50/60 focus-visible:ring-amber-400" data-testid="memo-testo" />
        <DialogFooter className="flex-row gap-2 sm:justify-between">
          {cliente?.memo ? <Button variant="ghost" onClick={() => salva("")} disabled={busy} className="text-destructive hover:text-destructive" data-testid="memo-rimuovi"><Trash2 className="w-4 h-4 mr-1.5" /> Rimuovi</Button> : <span />}
          <Button onClick={() => salva(memo)} disabled={busy} className="bg-primary hover:bg-primary/90" data-testid="memo-salva"><Save className="w-4 h-4 mr-1.5" /> Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
