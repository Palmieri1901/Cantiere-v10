import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BookUser, Save } from "lucide-react";
import { destToText } from "./common";

export default function RubricaPicker({ indirizzi, value, onPick, onSaved, prefix }) {
  const [saving, setSaving] = useState(false);

  const salvaInRubrica = async () => {
    if (!value?.nome?.trim()) { toast.error("Inserisci almeno il nome"); return; }
    setSaving(true);
    try {
      const exist = indirizzi.find((a) => a.nome.trim().toLowerCase() === value.nome.trim().toLowerCase());
      const body = { nome: value.nome, indirizzo: value.indirizzo, cap: value.cap, citta: value.citta, provincia: value.provincia, telefono: value.telefono };
      if (exist) await api.put(`/ddt/indirizzi/${exist.id}`, { ...exist, ...body });
      else await api.post("/ddt/indirizzi", body);
      toast.success(exist ? "Indirizzo aggiornato in rubrica" : "Indirizzo salvato in rubrica");
      onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore rubrica"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <BookUser className="w-4 h-4 text-muted-foreground" />
      <select className="h-8 rounded-md border border-input bg-background px-2 text-sm flex-1 min-w-0 w-full sm:w-auto sm:min-w-[220px]" value="" onChange={(e) => { const a = indirizzi.find((x) => x.id === e.target.value); if (a) onPick(a); }} data-testid={`${prefix}-rubrica`}>
        <option value="">Richiama dalla rubrica…</option>
        {indirizzi.map((a) => <option key={a.id} value={a.id}>{destToText(a)}</option>)}
      </select>
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={salvaInRubrica} disabled={saving} data-testid={`${prefix}-salva-rubrica`}>
        <Save className="w-3.5 h-3.5 mr-1.5" /> Salva in rubrica
      </Button>
    </div>
  );
}
