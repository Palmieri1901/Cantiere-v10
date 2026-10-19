import { Input } from "@/components/ui/input";
import { Building2, User } from "lucide-react";
import { IndirizzoFields } from "@/components/IndirizzoFields";
import { isEstero } from "@/lib/fiscale";

// Privato / Azienda + dati fiscali richiesti per l'azienda
export function SoggettoFiscale({ f, update, compact = false }) {
  const azienda = f.tipo_soggetto === "azienda";
  const estero = isEstero(f);
  const ob = estero ? "" : " *";
  const Btn = ({ v, icon: Icon, label }) => (
    <button type="button" onClick={() => update("tipo_soggetto", v)} data-testid={`soggetto-${v}`}
      className={`flex-1 h-10 rounded-md border text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${f.tipo_soggetto === v || (!f.tipo_soggetto && v === "privato") ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-muted"}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
  return (
    <div className="space-y-3" data-testid="soggetto-fiscale">
      <div className="flex gap-2">
        <Btn v="privato" icon={User} label="Privato" />
        <Btn v="azienda" icon={Building2} label="Azienda" />
      </div>
      <div className={compact ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
        <div className={compact ? "" : "sm:col-span-2"}><IndirizzoFields f={f} update={update} prefix="input-ind" labelClass="text-xs text-muted-foreground" /></div>
      </div>
      {azienda && (
        <div className={compact ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 gap-3"}>
          <div className={compact ? "" : "sm:col-span-2"}>
            <label className="text-xs text-muted-foreground">Intestazione (ragione sociale){ob}</label>
            <Input value={f.ragione_sociale || ""} onChange={(e) => update("ragione_sociale", e.target.value)} placeholder="Es. Nautica Rossi S.r.l." data-testid="input-ragione-sociale" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Partita IVA{ob}</label>
            <Input value={f.partita_iva || ""} onChange={(e) => update("partita_iva", estero ? e.target.value.toUpperCase().slice(0, 20) : e.target.value.replace(/\D/g, "").slice(0, 11))} inputMode={estero ? "text" : "numeric"} placeholder={estero ? "VAT number" : "11 cifre"} className="font-mono-num" data-testid="input-partita-iva" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Codice SDI{ob}</label>
            <Input value={f.codice_sdi || ""} onChange={(e) => update("codice_sdi", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7))} placeholder="7 caratteri (o 0000000)" className="uppercase font-mono-num" data-testid="input-codice-sdi" />
          </div>
          <div className={compact ? "" : "sm:col-span-2"}>
            <label className="text-xs text-muted-foreground">PEC</label>
            <Input value={f.pec || ""} onChange={(e) => update("pec", e.target.value.trim())} type="email" placeholder="fatture@pec.it" data-testid="input-pec" />
          </div>
        </div>
      )}
    </div>
  );
}

export function erroreSoggetto(f) {
  if (f.tipo_soggetto !== "azienda" || isEstero(f)) return null;
  if (!(f.ragione_sociale || "").trim()) return "Inserisci l'intestazione (ragione sociale) dell'azienda";
  if (!/^\d{11}$/.test(f.partita_iva || "")) return "La Partita IVA deve avere 11 cifre";
  if (!/^[A-Z0-9]{6,7}$/.test(f.codice_sdi || "")) return "Il codice SDI deve avere 7 caratteri (oppure 0000000)";
  return null;
}
