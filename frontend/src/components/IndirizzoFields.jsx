import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validaCap, validaProvincia } from "@/lib/fiscale";

export const INDIRIZZO_VUOTO = { indirizzo: "", via: "", cap: "", citta: "", provincia: "" };

export const componiIndirizzo = (f) => {
  const loc = [f.cap, f.citta].filter(Boolean).join(" ") + (f.provincia ? ` (${f.provincia})` : "");
  return [f.via, loc].filter((x) => x && x.trim()).join(", ");
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
  const errCap = validaCap(f.cap), errProv = validaProvincia(f.provincia);
  const Wrap = Field || (({ label, children }) => <div className="space-y-1"><Label className={labelClass}>{label}</Label>{children}</div>);
  return (
    <>
      <div className="space-y-2">
      <Wrap label="Via e numero civico"><Input value={f.via || ""} onChange={(e) => set("via", e.target.value)} placeholder="Via Roma 1" data-testid={`${prefix}-via`} /></Wrap>
      <div className="grid grid-cols-[86px_1fr_60px] gap-2">
        <Wrap label="CAP"><Input value={f.cap || ""} onChange={(e) => set("cap", e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" className={`font-mono-num ${errCap ? "border-destructive" : ""}`} data-testid={`${prefix}-cap`} /></Wrap>
        <Wrap label="Città"><Input value={f.citta || ""} onChange={(e) => set("citta", e.target.value)} data-testid={`${prefix}-citta`} /></Wrap>
        <Wrap label="Prov."><Input value={f.provincia || ""} onChange={(e) => set("provincia", e.target.value.toUpperCase().slice(0, 2))} className={`uppercase text-center ${errProv ? "border-destructive" : ""}`} placeholder="LI" data-testid={`${prefix}-provincia`} /></Wrap>
      </div>
      </div>
    </>
  );
}
