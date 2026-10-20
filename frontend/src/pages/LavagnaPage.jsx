import { api } from "@/lib/api";
import { Lavagna } from "@/components/Lavagna";
import { ClipboardList } from "lucide-react";

export default function LavagnaPage() {
  return (
    <div className="space-y-6" data-testid="pagina-lavagna">
      <div>
        <div className="label-mini">Cantiere</div>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold flex items-center gap-3"><ClipboardList className="w-8 h-8 text-primary" /> Lavagna</h1>
        <p className="text-sm text-muted-foreground mt-1">Messaggi condivisi tra dipendenti e amministrazione: articoli mancanti, commissioni, memo. Tutti possono scrivere, modificare e cancellare.</p>
      </div>
      <Lavagna client={api} basePath="/lavagna" />
    </div>
  );
}
