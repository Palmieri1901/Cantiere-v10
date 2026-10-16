import { useEffect, useMemo, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListChecks, Check } from "lucide-react";
import { normUnita } from "@/lib/unita";

// Voci del listino (Tariffe) con unità e domanda da porre per calcolare il totale
const fmtQ = (n) => Number(n).toLocaleString("it-IT", { maximumFractionDigits: 2 });
const sogliaCalc = (fisso, perMetro) => (m) => (m <= 5 ? fisso : +(m * perMetro).toFixed(2));

// Larghezza standard a scaglioni (come nel calcolo rimessaggio)
export const larghezzaStd = (L) => (L <= 6.5 ? 2.5 : L <= 9 ? 3 : 4);
const perMq = (id, nome, prezzo) => ({ id, nome, cat: "Rimessaggio", unita: "mq", mq: true, domanda: "Lunghezza barca (m)", domanda2: "Larghezza barca (m)", prezzo, calc: (L, W) => +(L * W * prezzo).toFixed(2), label: (L, W) => `${nome} ${fmtQ(L)} × ${fmtQ(W)} m = ${fmtQ(+(L * W).toFixed(2))} mq` });
const perM = (id, nome, prezzo, cat) => ({ id, nome, cat, unita: "m", domanda: "Metri barca", prezzo, calc: (m) => +(m * prezzo).toFixed(2), label: (m) => `${nome} barca ${fmtQ(m)} m` });
const fisso = (id, nome, prezzo, cat) => ({ id, nome, cat, unita: "", prezzo, calc: () => +Number(prezzo || 0).toFixed(2), label: () => nome });
const perPz = (id, nome, prezzo, cat, unita = "pz", domanda = "Quantità") => ({ id, nome, cat, unita, domanda, prezzo, calc: (q) => +(q * prezzo).toFixed(2), label: (q) => `${nome} × ${fmtQ(q)} ${unita}` });

export const CATEGORIE = ["Rimessaggio", "Alaggio e varo", "Lavaggi e manodopera", "Manodopera motore", "Ricambi motore", "Altri servizi"];

export function vociListino(t) {
  if (!t) return [];
  const v = [
    perMq("copertura", "Copertura", t.copertura_per_metro),
    perMq("antivegetativa", "Antivegetativa", t.antivegetativa_per_metro),
    perM("movimentazione", "Movimentazione", t.costo_movimentazione_per_metro, "Rimessaggio"),
    perM("taccaggio", "Taccaggio", t.costo_taccaggio_per_metro, "Rimessaggio"),
    perM("scafo_sporco", "Maggiorazione scafo sporco", t.maggiorazione_scafo_sporco_per_metro, "Rimessaggio"),
    { id: "sosta_temp", cat: "Rimessaggio", nome: "Sosta temporanea", unita: "giorni", domanda: "Numero giorni", prezzo: t.sosta_temporanea_giornaliera, calc: (g) => +(g * t.sosta_temporanea_giornaliera).toFixed(2), label: (g) => `Sosta temporanea ${fmtQ(g)} giorni` },
    { id: "alaggio", cat: "Alaggio e varo", nome: "Alaggio", unita: "m", domanda: "Metri barca", prezzo: t.alaggio_oltre_5m_per_metro, nota: `fino a 5 m ${fmtEuro(t.alaggio_fino_5m)}, oltre ${fmtEuro(t.alaggio_oltre_5m_per_metro)}/m`, calc: sogliaCalc(t.alaggio_fino_5m, t.alaggio_oltre_5m_per_metro), label: (m) => `Alaggio barca ${fmtQ(m)} m` },
    { id: "varo", cat: "Alaggio e varo", nome: "Varo", unita: "m", domanda: "Metri barca", prezzo: t.varo_oltre_5m_per_metro, nota: `fino a 5 m ${fmtEuro(t.varo_fino_5m)}, oltre ${fmtEuro(t.varo_oltre_5m_per_metro)}/m`, calc: sogliaCalc(t.varo_fino_5m, t.varo_oltre_5m_per_metro), label: (m) => `Varo barca ${fmtQ(m)} m` },
    perM("lavaggio_inizio", "Lavaggio inizio stagione", t.costo_lavaggio_inizio_stagione, "Lavaggi e manodopera"),
    perM("lavaggio_fine", "Lavaggio fine stagione", t.costo_lavaggio_fine_stagione, "Lavaggi e manodopera"),
    { id: "manodopera", cat: "Lavaggi e manodopera", nome: "Manodopera", unita: "ore", domanda: "Ore di lavoro", prezzo: t.costo_orario_manodopera, calc: (h) => +(h * t.costo_orario_manodopera).toFixed(2), label: (h) => `Manodopera ${fmtQ(h)} h` },
    fisso("motore_2_15", "Manodopera fuoribordo 2-15 HP", t.motore_labor_2_15hp, "Manodopera motore"),
    fisso("motore_16_40", "Manodopera fuoribordo 16-40 HP", t.motore_labor_fino_40hp, "Manodopera motore"),
    fisso("motore_41_150", "Manodopera fuoribordo 41-150 HP", t.motore_labor_40_150hp, "Manodopera motore"),
    fisso("motore_oltre_150", "Manodopera fuoribordo oltre 150 HP", t.motore_labor_oltre_150hp, "Manodopera motore"),
    fisso("motore_entrobordo", "Manodopera entrobordo", t.motore_labor_entrobordo, "Manodopera motore"),
    perPz("girante", "Girante", t.costo_girante, "Ricambi motore"),
    perPz("olio_motore", "Olio motore", t.costo_olio_motore, "Ricambi motore", "lt", "Litri"),
    perPz("filtro_olio", "Filtro olio", t.costo_filtro_olio, "Ricambi motore"),
    perPz("candela", "Candele", t.costo_candela, "Ricambi motore", "pz", "Numero candele"),
    perPz("termostato", "Termostato", t.costo_termostato, "Ricambi motore"),
    perPz("olio_piede", "Olio piede", t.costo_olio_piede, "Ricambi motore", "lt", "Litri"),
    perPz("anodi_interni", "Kit anodi interni", t.costo_anodi_interni, "Ricambi motore"),
    perPz("anodi_esterni", "Kit anodi esterni", t.costo_anodi_esterni, "Ricambi motore"),
    perPz("ingrassaggio", "Ingrassaggio", t.costo_ingrassaggio, "Ricambi motore"),
  ];
  (t.servizi_extra || []).forEach((s, i) => {
    const u = normUnita(s.unita);
    const aQuantita = !!u.domanda;
    v.push({ id: `extra_${i}`, cat: "Altri servizi", nome: s.nome, unita: aQuantita ? u.breve : "", domanda: u.domanda, prezzo: s.prezzo, calc: (q) => +((aQuantita ? q : 1) * s.prezzo).toFixed(2), label: (q) => (aQuantita ? `${s.nome} · ${fmtQ(q)} ${u.breve}` : s.nome) });
  });
  return v.filter((x) => Number(x.prezzo) > 0 || x.nota);
}

// Pulsante "Dal listino": scegli una voce, inserisci la misura richiesta e ottieni {descrizione, quantita, prezzo_unitario, totale}
export function ListinoPicker({ onAdd, metriDefault, label = "Dal listino", size = "sm", variant = "outline", testId = "btn-listino", fetchTariffe }) {
  const [open, setOpen] = useState(false);
  const [tariffe, setTariffe] = useState(null);
  const [voce, setVoce] = useState(null);
  const [q, setQ] = useState("");
  const [q2, setQ2] = useState("");
  const [q2Auto, setQ2Auto] = useState(true);
  const [cerca, setCerca] = useState("");
  useEffect(() => { if (open && !tariffe) (fetchTariffe ? fetchTariffe() : api.get("/tariffe").then((r) => r.data)).then(setTariffe).catch(() => {}); }, [open, tariffe, fetchTariffe]);
  const voci = useMemo(() => vociListino(tariffe), [tariffe]);
  const num = (s) => Number(String(s).replace(",", ".")) || 0;
  const scegli = (v) => {
    setVoce(v); setQ2Auto(true);
    const m = metriDefault && (v.unita === "m" || v.mq) ? String(metriDefault) : "";
    setQ(v.domanda ? m : "1");
    setQ2(v.mq && m ? String(larghezzaStd(num(m))) : "");
  };
  const cambiaLunghezza = (val) => { setQ(val); if (voce?.mq && q2Auto) setQ2(num(val) > 0 ? String(larghezzaStd(num(val))) : ""); };
  const qn = num(q), qn2 = num(q2);
  const totale = voce ? voce.calc(qn, qn2) : 0;
  const conferma = () => {
    const quantita = voce.mq ? +(qn * qn2).toFixed(2) : voce.domanda ? qn : 1;
    const totaleV = voce.calc(qn, qn2);
    onAdd({ descrizione: voce.label(qn, qn2), quantita, prezzo_unitario: quantita > 0 ? +(totaleV / quantita).toFixed(4) : totaleV, totale: totaleV, listino_id: voce.id, unita: voce.mq ? "mq" : voce.unita === "ore" ? "h" : voce.unita === "giorni" ? "gg" : voce.unita || "" });
    setOpen(false); setVoce(null);
  };
  return (
    <>
      <Button type="button" size={size} variant={variant} onClick={() => { setOpen(true); setVoce(null); setCerca(""); }} data-testid={testId}><ListChecks className="w-3.5 h-3.5 mr-1" /> {label}</Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setVoce(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid="listino-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Voce dal listino</DialogTitle>
            <DialogDescription>{voce ? `Prezzo di listino: ${voce.nota || (voce.unita ? `${fmtEuro(voce.prezzo)} / ${voce.unita}` : fmtEuro(voce.prezzo))}` : "Scegli il servizio: il prezzo viene preso dalle Tariffe e il totale calcolato in base alla misura richiesta."}</DialogDescription>
          </DialogHeader>
          {!voce ? (
            <div className="space-y-2">
              <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nel listino…" className="h-10" data-testid="listino-cerca" />
              <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border" data-testid="listino-voci">
                {CATEGORIE.map((cat) => {
                  const lista = voci.filter((v) => v.cat === cat && (!cerca.trim() || v.nome.toLowerCase().includes(cerca.trim().toLowerCase())));
                  if (!lista.length) return null;
                  return (
                    <div key={cat}>
                      <div className="label-mini px-3 py-1.5 bg-muted/60 sticky top-0" data-testid={`listino-cat-${cat.replace(/\W+/g, "-").toLowerCase()}`}>{cat}</div>
                      {lista.map((v) => (
                        <button key={v.id} type="button" onClick={() => scegli(v)} className="w-full text-left px-3 py-2.5 text-sm flex items-center justify-between gap-3 hover:bg-muted/50 border-t border-border" data-testid={`listino-voce-${v.id}`}>
                          <span className="font-medium">{v.nome}</span>
                          <span className="font-mono-num text-xs text-muted-foreground shrink-0">{v.nota ? "a scaglioni" : `${fmtEuro(v.prezzo)}${v.unita ? ` / ${v.unita}` : ""}`}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
                {!tariffe && <div className="p-3 text-xs text-muted-foreground">Caricamento listino…</div>}
              </div>
            </div>
          ) : (
            <div className="space-y-3" data-testid="listino-calcolo">
              <div className="font-medium">{voce.nome}</div>
              {voce.domanda && (
                <div className={voce.mq ? "grid grid-cols-2 gap-3" : ""}>
                  <div>
                    <label className="text-xs text-muted-foreground">{voce.domanda}</label>
                    <Input type="number" inputMode="decimal" min="0" step="0.1" value={q} onChange={(e) => cambiaLunghezza(e.target.value)} autoFocus className="h-11 text-lg font-mono-num" data-testid="listino-quantita" />
                  </div>
                  {voce.mq && (
                    <div>
                      <label className="text-xs text-muted-foreground">{voce.domanda2}{q2Auto && qn2 > 0 ? " · proposta" : ""}</label>
                      <Input type="number" inputMode="decimal" min="0" step="0.1" value={q2} onChange={(e) => { setQ2Auto(false); setQ2(e.target.value); }} className="h-11 text-lg font-mono-num" data-testid="listino-quantita-2" />
                    </div>
                  )}
                </div>
              )}
              <div className="rounded-md bg-muted/40 border border-border p-3 flex items-center justify-between gap-3">
                <span className="text-sm">{voce.label(qn, qn2)}</span>
                <span className="font-mono-num text-lg font-semibold text-primary" data-testid="listino-totale">{fmtEuro(totale)}</span>
              </div>
            </div>
          )}
          <DialogFooter className="flex-row gap-2 justify-end">
            {voce && <Button type="button" variant="ghost" onClick={() => { setVoce(null); setCerca(""); }} data-testid="listino-indietro">Indietro</Button>}
            {voce && <Button type="button" onClick={conferma} disabled={(voce.domanda && qn <= 0) || (voce.mq && qn2 <= 0)} className="bg-primary hover:bg-primary/90" data-testid="listino-aggiungi"><Check className="w-4 h-4 mr-1.5" /> Aggiungi {fmtEuro(totale)}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
