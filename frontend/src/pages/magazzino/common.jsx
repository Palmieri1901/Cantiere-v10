import { useState } from "react";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Copy } from "lucide-react";

export const EMPTY_ART = {
  codice: "", barcode: "", nome: "", descrizione: "", categoria: "",
  fornitore_id: null, prezzo_acquisto: 0, prezzo_listino: 0,
  quantita: 0, scorta_minima: 0, unita_misura: "pz",
  immagine_base64: "", note: "",
};

export const TIPI_SPESA = [
  { value: "bancarie", label: "Bancarie" },
  { value: "trasporto", label: "Trasporto" },
  { value: "spedizione", label: "Spedizione" },
  { value: "imballo", label: "Imballo" },
  { value: "assicurazione", label: "Assicurazione" },
  { value: "carburante", label: "Carburante" },
  { value: "cou", label: "COU – Contributo olii usati" },
  { value: "altro", label: "Altro" },
];

export function labelTipo(t) {
  const found = TIPI_SPESA.find((x) => x.value === t);
  return found ? found.label : (t || "Altro");
}

export function FormField({ label, children, full }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function PasswordCell({ value, testId }) {
  const [show, setShow] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  const copy = async (e) => {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(value); toast.success("Password copiata"); }
    catch { toast.error("Copia non riuscita"); }
  };
  return (
    <div className="flex items-center gap-1" data-testid={testId}>
      <span className="font-mono text-xs">{show ? value : "•".repeat(Math.min(value.length, 10))}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }} className="text-muted-foreground hover:text-foreground p-0.5" title={show ? "Nascondi" : "Mostra"}>
        {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button type="button" onClick={copy} className="text-muted-foreground hover:text-foreground p-0.5" title="Copia">
        <Copy className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
