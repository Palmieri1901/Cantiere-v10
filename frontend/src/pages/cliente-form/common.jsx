import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const MAX_EXTRA = 20;

export const EMPTY_CLIENTE = {
  nome: "", cognome: "", tipo_barca: "", lunghezza: "",
  tipo_sosta: "dentro",
  giorni_sosta_temporanea: 0, posto_barca: "",
  telefono: "", email: "",
  codice_fiscale: "", indirizzo: "", cellulare: "",
  pagato: false,
  potenza_motore: 0, litri_olio_motore: 3, litri_olio_piede: 1, numero_candele: 4, numero_termostati: 1,
  tipo_motore: "fuoribordo",
  filtro_olio_attivo: true, anodi_interni_attivo: true, anodi_esterni_attivo: true, olio_piede_attivo: true, ingrassaggio_attivo: true,
  primo_motore_attivo: true,
  secondo_motore: false,
  potenza_motore_2: 0, litri_olio_motore_2: 3, litri_olio_piede_2: 1, numero_candele_2: 4, numero_termostati_2: 1,
  tipo_motore_2: "fuoribordo",
  filtro_olio_2_attivo: true, anodi_interni_2_attivo: true, anodi_esterni_2_attivo: true, olio_piede_2_attivo: true, ingrassaggio_2_attivo: true,
  girante_2_attivo: true,
  antivegetativa_attiva: true, girante_attivo: true,
  scafo_sporco_attivo: false,
  copertura_attiva: false,
  lavaggio_inizio_attivo: true, lavaggio_fine_attivo: true,
  override_costi: false,
  alaggio_varo_attivo: false,
  numero_movimenti: 1,
  destinazione_alaggio_varo: "marina_di_campo",
  larghezza_personalizzata: "",
  destinazione_altra_nome: "",
  costo_sosta: 0, costo_copertura: 0, costo_alaggio: 0,
  costo_varo: 0, costo_antivegetativa: 0, costo_manutenzione_motore: 0,
  costo_ricambi_totale: 0, costo_manodopera_motore: 0,
  costo_ricambi_motore_2_totale: 0, costo_manodopera_motore_2: 0,
  costo_lavaggio_inizio: 0, costo_lavaggio_fine: 0, costo_scafo_sporco: 0,
  lavorazioni_extra: [],
  note_lavori: "",
  scadenza_antivegetativa: "", scadenza_manutenzione: "",
};

export function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function CostField({ label, value, onChange, disabled, testId }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">€</span>
        <Input
          type="number" step="0.01" min="0"
          disabled={disabled}
          value={value ?? 0}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10 font-mono-num"
          data-testid={`input-${testId}`}
        />
      </div>
    </div>
  );
}

export function BreakdownRow({ label, value }) {
  if (!(Number(value) > 0)) return null;
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-num">{new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value) || 0)}</span>
    </div>
  );
}

export function ToggleRow({ label, description, checked, onChange, testId, disabled }) {
  return (
    <div className={`flex items-center justify-between gap-2 p-3 rounded-md border border-border bg-muted/30 ${disabled ? "opacity-50" : ""}`}>
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} data-testid={testId} />
    </div>
  );
}
