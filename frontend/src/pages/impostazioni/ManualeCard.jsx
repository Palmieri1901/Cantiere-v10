import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Download, Printer } from "lucide-react";

export default function ManualeCard() {
  const [info, setInfo] = useState(null);
  const pdfUrl = `${API}/manuale.pdf?v=${encodeURIComponent(info ? `${info.versione}-${info.commit}-${info.data}` : Date.now())}&t=${Date.now()}`;
  useEffect(() => { api.get("/manuale/info").then((r) => setInfo(r.data)).catch(() => {}); }, []);
  return (
    <Card className="p-6 mt-6" data-testid="manuale-card">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 label-mini mb-2"><BookOpen className="w-3.5 h-3.5" /> Manuale d'uso</div>
          <h3 className="font-display text-xl font-semibold">Istruzioni del programma in PDF</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Guida stampabile a tutte le sezioni del gestionale e dell'app dipendenti. Viene aggiornata ad ogni nuova versione del programma.
          </p>
          {info && <p className="text-xs text-muted-foreground mt-2" data-testid="manuale-versione">Versione {info.versione}{info.commit ? ` · build ${info.commit}` : ""} · aggiornato al {info.data} · {info.sezioni} sezioni</p>}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
          <Button asChild variant="outline" className="w-full sm:w-auto" data-testid="btn-manuale-apri">
            <a href={pdfUrl} target="_blank" rel="noreferrer"><Printer className="w-4 h-4 mr-2" /> Apri e stampa</a>
          </Button>
          <Button asChild className="w-full sm:w-auto" data-testid="btn-manuale-scarica">
            <a href={pdfUrl} download="manuale_gestionale_gebnautica.pdf"><Download className="w-4 h-4 mr-2" /> Scarica PDF</a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
