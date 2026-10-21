import { useEffect, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { QrCode, Check, X, Clock, User, Package, AlertCircle } from "lucide-react";
import QrImportDialog from "@/pages/dipendenti/QrImportDialog";
import ApprovaDialog from "@/pages/dipendenti/ApprovaDialog";

const Chip = ({ icon: Icon, children }) => (
  <span className="inline-flex items-center gap-1.5 text-xs text-foreground/80 bg-muted rounded-full px-2.5 py-1"><Icon className="w-3.5 h-3.5 text-muted-foreground" /> {children}</span>
);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? "lavoro" : "lavori"} in attesa di approvazione</div>
        <Button variant="outline" onClick={() => setQrOpen(true)} className="w-full sm:w-auto" data-testid="btn-importa-qr"><QrCode className="w-4 h-4 mr-1.5" /> Importa da QR</Button>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center border border-dashed rounded-md">Nessun lavoro da approvare. Quando un dipendente sincronizza l'app, i lavori compaiono qui.</div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => {
            const nArt = (p.articoli_magazzino?.length || 0) + (p.articoli_liberi?.length || 0);
            return (
              <div key={p.id} className="border border-border rounded-lg bg-card overflow-hidden" data-testid={`pending-row-${p.id}`}>
                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-muted/40 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-num text-xs text-muted-foreground">{p.data}</span>
                    <Badge variant="outline" className="text-[10px]">{p.origine === "qr" ? "QR" : "App"}</Badge>
                  </div>
                  {p.costo > 0 && <span className="font-mono-num text-sm font-semibold">{fmtEuro(p.costo)}</span>}
                </div>
                <div className="px-4 py-3">
                  <div className="font-medium text-base leading-snug">
                    {p.cliente_trovato ? p.cliente_nome : (
                      <span className="inline-flex items-center gap-1.5 text-destructive"><AlertCircle className="w-4 h-4 shrink-0" /> Cliente da associare{p.cliente_nome ? ` (${p.cliente_nome})` : ""}</span>
                    )}
                    {p.tipo_barca && <span className="text-muted-foreground font-normal text-sm"> · {p.tipo_barca}</span>}
                  </div>
                  <div className="text-sm mt-1.5 [overflow-wrap:anywhere]"><span className="font-medium">{p.tipo}</span>{p.descrizione && <span className="text-muted-foreground"> — {p.descrizione}</span>}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Chip icon={User}>{p.dipendente_nome}</Chip>
                    <Chip icon={Clock}>{p.ore} h</Chip>
                    {nArt > 0 && <Chip icon={Package}>{nArt} {nArt === 1 ? "articolo" : "articoli"}</Chip>}
                  </div>
                  {p.materiali && <div className="text-xs text-muted-foreground italic mt-2">Materiali: {p.materiali}</div>}
                </div>
                <div className="flex gap-2 px-4 py-3 border-t border-border">
                  <Button onClick={() => setApproving(p)} className="flex-1 bg-primary hover:bg-primary/90" data-testid={`btn-approva-${p.id}`}><Check className="w-4 h-4 mr-1.5" /> Approva</Button>
                  <Button variant="outline" onClick={() => rifiuta(p)} className="text-destructive hover:text-destructive" data-testid={`btn-rifiuta-${p.id}`}><X className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Rifiuta</span></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <QrImportDialog open={qrOpen} onOpenChange={setQrOpen} onImported={load} />
      <ApprovaDialog item={approving} onClose={() => setApproving(null)} onDone={load} />
    </div>
  );
}
