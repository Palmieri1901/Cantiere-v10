import { useEffect, useState } from "react";
import { mobileApi } from "@/lib/mobileStore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { WhatsAppPdfButton } from "@/components/WhatsAppPdfButton";
import { FileText, Loader2 } from "lucide-react";

// Listini pubblici in PDF (gommoni, accessori, Suzuki, magazzino) per l'app dipendenti: sola lettura
export default function ListiniPdfMobile() {
  const [lista, setLista] = useState([]);
  const [busy, setBusy] = useState("");
  const api = mobileApi();
  useEffect(() => { mobileApi().get("/listini").then((r) => setLista(r.data || [])).catch(() => {}); }, []);
  const apri = async (l) => {
    setBusy(l.tipo);
    try {
      const r = await api.get(`/listini/${l.tipo}.pdf`, { responseType: "blob", timeout: 60000 });
      window.open(URL.createObjectURL(new Blob([r.data], { type: "application/pdf" })), "_blank");
    } catch { toast.error("Listino non disponibile: sei online?"); } finally { setBusy(""); }
  };
  if (!lista.length) return null;
  return (
    <div className="space-y-2" data-testid="listini-pdf-mobile">
      <div className="label-mini">Listini al pubblico (PDF)</div>
      <div className="grid grid-cols-1 gap-2">
        {lista.map((l) => (
          <div key={l.tipo} className="rounded-lg border border-border bg-card p-3 flex items-center gap-3" data-testid={`listino-pdf-${l.tipo}`}>
            <div className="flex-1 min-w-0"><div className="font-medium text-sm">{l.titolo}</div><div className="text-xs text-muted-foreground">{l.desc}</div></div>
            <Button size="sm" variant="outline" onClick={() => apri(l)} disabled={busy === l.tipo} data-testid={`listino-pdf-apri-${l.tipo}`}>
              {busy === l.tipo ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            </Button>
            <WhatsAppPdfButton size="icon" url={`/listini/${l.tipo}.pdf`} filename={`Listino_${l.tipo}.pdf`} testo={`Listino ${l.titolo} – Cantiere GEB nautica`} client={api} uploadPath="/condividi/pdf" testId={`listino-pdf-wa-${l.tipo}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
