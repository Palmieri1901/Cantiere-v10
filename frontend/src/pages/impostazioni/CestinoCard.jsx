import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw, Loader2 } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

const quando = (ts) => new Date(ts * 1000).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

// Eliminazioni degli ultimi 7 giorni, ripristinabili
export default function CestinoCard() {
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () => api.get("/cestino").then((r) => setList(r.data)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const ripristina = async (e) => {
    if (!await confirmDialog(`Ripristinare ${e.tipo.toLowerCase()} «${e.nome || "senza nome"}»${e.collegati ? ` e ${e.collegati} elementi collegati` : ""}?`, { title: "Ripristina eliminazione", okLabel: "Ripristina", danger: false })) return;
    setBusy(e.batch);
    try {
      const r = await api.post(`/cestino/${e.batch}/ripristina`);
      toast.success(`Ripristinato (${r.data.ripristinati} elementi)`);
      if (r.data.non_riportati) toast.warning(`${r.data.non_riportati} dati modificati dopo l'eliminazione sono stati lasciati come sono ora (es. giacenze di magazzino): controllali.`);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Ripristino non riuscito"); } finally { setBusy(""); }
  };
  return (
    <Card className="p-5 space-y-3" data-testid="cestino-card">
      <div className="flex items-center gap-2"><Trash2 className="w-4 h-4 text-muted-foreground" /><h3 className="font-semibold">Cestino – eliminazioni recenti</h3></div>
      <p className="text-xs text-muted-foreground">Le eliminazioni degli ultimi 7 giorni su questa installazione. Ripristina riporta l'elemento e quelli cancellati insieme a lui. Le foto e i file caricati non tornano.</p>
      {list === null ? <Loader2 className="w-4 h-4 animate-spin" /> : !list.length ? (
        <div className="text-sm text-muted-foreground" data-testid="cestino-vuoto">Nessuna eliminazione negli ultimi 7 giorni.</div>
      ) : (
        <div className="border rounded-md divide-y max-h-[420px] overflow-y-auto">
          {list.map((e) => (
            <div key={e.batch} className="p-3 flex items-center gap-3 flex-wrap" data-testid={`cestino-row-${e.batch}`}>
              <div className="flex-1 min-w-[160px]">
                <div className="text-sm font-medium [overflow-wrap:anywhere]">{e.nome || "(senza nome)"}</div>
                <div className="text-[11px] text-muted-foreground">{e.tipo}{e.collegati ? ` · + ${e.collegati} collegati` : ""} · {quando(e.ts)}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => ripristina(e)} disabled={!!busy} data-testid={`cestino-ripristina-${e.batch}`}>
                {busy === e.batch ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1.5" />} Ripristina
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
