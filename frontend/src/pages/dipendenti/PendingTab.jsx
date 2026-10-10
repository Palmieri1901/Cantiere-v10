import { useEffect, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { QrCode, Check, X, Clock, User, Package } from "lucide-react";
import QrImportDialog from "@/pages/dipendenti/QrImportDialog";
import ApprovaDialog from "@/pages/dipendenti/ApprovaDialog";

export default function PendingTab({ onChange }) {
  const [items, setItems] = useState([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [approving, setApproving] = useState(null);

  const load = () => api.get("/lavori-pending").then((r) => { setItems(r.data); onChange?.(); });
  useEffect(() => { load(); }, []);

  const rifiuta = async (p) => {
    if (!await confirmDialog(`Rifiutare il lavoro "${p.descrizione || p.tipo}" di ${p.dipendente_nome}?`)) return;
    await api.post(`/lavori-pending/${p.id}/rifiuta`); toast.success("Lavoro rifiutato"); load();
  };

  return (
    <div data-testid="pending-tab">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-muted-foreground">{items.length} lavori in attesa di approvazione</div>
        <Button variant="outline" onClick={() => setQrOpen(true)} data-testid="btn-importa-qr"><QrCode className="w-4 h-4 mr-1.5" /> Importa da QR</Button>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center border border-dashed rounded-md">Nessun lavoro da approvare. Quando un dipendente sincronizza l'app, i lavori compaiono qui.</div>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border">
          {items.map((p) => (
            <div key={p.id} className="p-3 flex items-start gap-3 hover:bg-muted/40" data-testid={`pending-row-${p.id}`}>
              <div className="w-24 shrink-0">
                <div className="font-mono-num text-xs text-muted-foreground">{p.data}</div>
                <Badge variant="outline" className="text-[9px] mt-1">{p.origine === "qr" ? "QR" : "App"}</Badge>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">
                  {p.cliente_trovato ? p.cliente_nome : <span className="text-destructive">Cliente da associare{p.cliente_nome ? ` (${p.cliente_nome})` : ""}</span>}
                  {p.tipo_barca && <span className="text-muted-foreground font-normal"> · {p.tipo_barca}</span>}
                </div>
                <div className="text-xs mt-0.5"><span className="font-medium">{p.tipo}</span>{p.descrizione && <span className="text-muted-foreground"> — {p.descrizione}</span>}</div>
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> {p.dipendente_nome}</span>
                  <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {p.ore} h</span>
                  {((p.articoli_magazzino?.length || 0) + (p.articoli_liberi?.length || 0)) > 0 && <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" /> {(p.articoli_magazzino?.length || 0) + (p.articoli_liberi?.length || 0)} articoli</span>}
                  {p.materiali && <span className="italic">Mat.: {p.materiali}</span>}
                  {p.costo > 0 && <span>{fmtEuro(p.costo)}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" onClick={() => setApproving(p)} className="bg-primary hover:bg-primary/90" data-testid={`btn-approva-${p.id}`}><Check className="w-3.5 h-3.5 mr-1" /> Approva</Button>
                <Button size="sm" variant="ghost" onClick={() => rifiuta(p)} data-testid={`btn-rifiuta-${p.id}`}><X className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <QrImportDialog open={qrOpen} onOpenChange={setQrOpen} onImported={load} />
      <ApprovaDialog item={approving} onClose={() => setApproving(null)} onDone={load} />
    </div>
  );
}
