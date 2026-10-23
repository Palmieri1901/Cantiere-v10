import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validaCap, validaProvincia, isEstero } from "@/lib/fiscale";

const WrapDefault = ({ label, children, labelClass }) => <div className="space-y-1"><Label className={labelClass}>{label}</Label>{children}</div>;

export const INDIRIZZO_VUOTO = { indirizzo: "", via: "", cap: "", citta: "", provincia: "", nazione: "" };

export const componiIndirizzo = (f) => {
  const loc = [f.cap, f.citta].filter(Boolean).join(" ") + (f.provincia ? ` (${f.provincia})` : "");
  return [f.via, loc, isEstero(f) ? f.nazione.trim() : ""].filter((x) => x && x.trim()).join(", ");
};
const separa = (ind) => {
  const m = /^(.*?)[,\s]+(\d{5})\s+(.+?)(?:\s*\(?\b([A-Za-z]{2})\)?)?\s*$/.exec((ind || "").trim());
  return m ? { via: m[1].replace(/[, ]+$/, ""), cap: m[2], citta: m[3].replace(/[, ]+$/, ""), provincia: (m[4] || "").toUpperCase() } : { via: (ind || "").trim(), cap: "", citta: "", provincia: "" };
};

// Via / CAP / Città / Provincia separati; mantiene aggiornato anche il campo "indirizzo" composto (usato da PDF e contratti)
export function IndirizzoFields({ f, update, prefix = "ind", labelClass = "text-[11px] uppercase tracking-wider text-muted-foreground", Field }) {
  useEffect(() => {
    if (!f.via && !f.cap && !f.citta && f.indirizzo) { const p = separa(f.indirizzo); Object.entries(p).forEach(([k, v]) => v && update(k, v)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (k, v) => { update(k, v); update("indirizzo", componiIndirizzo({ ...f, [k]: v })); };
  const estero = isEstero(f);
  const errCap = estero ? "" : validaCap(f.cap), errProv = estero ? "" : validaProvincia(f.provincia);
  const Wrap = Field || WrapDefault;
  return (
    <>
      <div className="space-y-2">
      <Wrap labelClass={labelClass} label="Via e numero civico"><Input value={f.via || ""} onChange={(e) => set("via", e.target.value)} placeholder="es. Via Roma 1" data-testid={`${prefix}-via`} /></Wrap>
      <div className="grid grid-cols-[86px_1fr_60px] gap-2">
        <Wrap labelClass={labelClass} label={estero ? "Cod. postale" : "CAP"}><Input value={f.cap || ""} onChange={(e) => set("cap", estero ? e.target.value.slice(0, 10) : e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode={estero ? "text" : "numeric"} className={`font-mono-num ${errCap ? "border-destructive" : ""}`} data-testid={`${prefix}-cap`} /></Wrap>
        <Wrap labelClass={labelClass} label="Città"><Input value={f.citta || ""} onChange={(e) => set("citta", e.target.value)} data-testid={`${prefix}-citta`} /></Wrap>
        <Wrap labelClass={labelClass} label={estero ? "Regione" : "Prov."}><Input value={f.provincia || ""} onChange={(e) => set("provincia", estero ? e.target.value.slice(0, 20) : e.target.value.toUpperCase().slice(0, 2))} className={estero ? "" : `uppercase text-center ${errProv ? "border-destructive" : ""}`} placeholder={estero ? "" : "es. LI"} data-testid={`${prefix}-provincia`} /></Wrap>
      </div>
      <Wrap labelClass={labelClass} label="Nazione (vuoto = Italia)"><Input value={f.nazione || ""} onChange={(e) => set("nazione", e.target.value)} placeholder="Italia" data-testid={`${prefix}-nazione`} /></Wrap>
      {estero && <p className="text-[11px] text-muted-foreground" data-testid={`${prefix}-estero-nota`}>Cliente estero: codice fiscale, P.IVA, CAP e provincia non vengono controllati e possono restare vuoti.</p>}
      </div>
    </>
  );
}
