import { useEffect, useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import LavoriSection from "@/pages/LavoriSection";
import { API } from "@/lib/api";
import { useYear } from "@/lib/year";
import { FileText, Zap } from "lucide-react";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { EMPTY_CLIENTE, MAX_EXTRA, Field, CostField, BreakdownRow } from "@/pages/cliente-form/common";
import MotoreSection from "@/pages/cliente-form/MotoreSection";
import LavorazioniExtraSection from "@/pages/cliente-form/LavorazioniExtraSection";
import RitiroConsegnaSection, { descrRitiroConsegna } from "@/pages/cliente-form/RitiroConsegnaSection";
import MagazzinoPickerDialog from "@/pages/cliente-form/MagazzinoPickerDialog";

export default function ClienteForm({ open, onOpenChange, cliente, onSaved, mode = "cliente" }) {
  const isPreventivo = mode === "preventivo";
  const [f, setF] = useState(EMPTY_CLIENTE);
  const [saving, setSaving] = useState(false);
  const [ricambiDettaglio, setRicambiDettaglio] = useState(null);
  const [ricambi2Dettaglio, setRicambi2Dettaglio] = useState(null);
  const [articoliMag, setArticoliMag] = useState([]);
  const [magPickerOpen, setMagPickerOpen] = useState(false);
  const [magPickerId, setMagPickerId] = useState("");
  const [magPickerQty, setMagPickerQty] = useState(1);
  const [magPickerQuery, setMagPickerQuery] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewName, setPreviewName] = useState("preventivo.pdf");
  const { year } = useYear();

  useEffect(() => {
    if (!open) return;
    api.get("/magazzino/articoli").then((r) => setArticoliMag(r.data || [])).catch(() => setArticoliMag([]));
  }, [open]);

  useEffect(() => {
    if (cliente) {
      setF({
        ...EMPTY_CLIENTE,
        ...cliente,
        posto_barca: cliente.posto_barca ?? "",
        scadenza_antivegetativa: cliente.scadenza_antivegetativa ?? "",
        scadenza_manutenzione: cliente.scadenza_manutenzione ?? "",
        lavorazioni_extra: Array.isArray(cliente.lavorazioni_extra) ? cliente.lavorazioni_extra : [],
      });
    } else {
      setF(EMPTY_CLIENTE);
    }
    setRicambiDettaglio(null);
    setRicambi2Dettaglio(null);
  }, [cliente, open]);

  // Ricalcolo automatico costi
  useEffect(() => {
    if (!open || f.override_costi) return;
    if (!f.lunghezza || f.lunghezza <= 0) return;
    // Se destinazione="altra" per suggerire tariffa iniziale, invia sempre marina_di_campo al calc
    const destPerCalc = f.alaggio_varo_attivo && f.destinazione_alaggio_varo === "altra"
      ? "marina_di_campo"
      : (f.destinazione_alaggio_varo || "marina_di_campo");
    const t = setTimeout(() => {
      const params = new URLSearchParams({
        lunghezza: f.lunghezza,
        tipo_sosta: f.tipo_sosta,
        potenza_motore: f.potenza_motore || 0,
        litri_olio_motore: f.litri_olio_motore || 0,
        numero_candele: f.numero_candele || 0,
        numero_termostati: f.numero_termostati || 0,
        tipo_motore: f.tipo_motore || "fuoribordo",
        filtro_olio_attivo: f.filtro_olio_attivo ? "true" : "false",
        anodi_interni_attivo: f.anodi_interni_attivo ? "true" : "false",
        anodi_esterni_attivo: f.anodi_esterni_attivo ? "true" : "false",
        olio_piede_attivo: f.olio_piede_attivo ? "true" : "false",
        ingrassaggio_attivo: f.ingrassaggio_attivo ? "true" : "false",
        antivegetativa_attiva: f.antivegetativa_attiva ? "true" : "false",
        girante_attivo: f.girante_attivo ? "true" : "false",
        lavaggio_inizio_attivo: f.lavaggio_inizio_attivo ? "true" : "false",
        lavaggio_fine_attivo: f.lavaggio_fine_attivo ? "true" : "false",
        secondo_motore: f.secondo_motore ? "true" : "false",
        primo_motore_attivo: f.primo_motore_attivo === false ? "false" : "true",
        potenza_motore_2: f.potenza_motore_2 || 0,
        litri_olio_motore_2: f.litri_olio_motore_2 || 0,
        numero_candele_2: f.numero_candele_2 || 0,
        numero_termostati_2: f.numero_termostati_2 || 0,
        tipo_motore_2: f.tipo_motore_2 || "fuoribordo",
        girante_2_attivo: f.girante_2_attivo ? "true" : "false",
        filtro_olio_2_attivo: f.filtro_olio_2_attivo ? "true" : "false",
        anodi_interni_2_attivo: f.anodi_interni_2_attivo ? "true" : "false",
        anodi_esterni_2_attivo: f.anodi_esterni_2_attivo ? "true" : "false",
        olio_piede_2_attivo: f.olio_piede_2_attivo ? "true" : "false",
        ingrassaggio_2_attivo: f.ingrassaggio_2_attivo ? "true" : "false",
        scafo_sporco_attivo: f.scafo_sporco_attivo ? "true" : "false",
        copertura_attiva: f.copertura_attiva ? "true" : "false",
        litri_olio_piede: f.litri_olio_piede || 0,
        litri_olio_piede_2: f.litri_olio_piede_2 || 0,
        giorni_sosta_temporanea: f.giorni_sosta_temporanea || 0,
        destinazione_alaggio_varo: destPerCalc,
        alaggio_varo_attivo: f.alaggio_varo_attivo ? "true" : "false",
        numero_movimenti: Number(f.numero_movimenti) || 1,
        larghezza_personalizzata: (f.larghezza_personalizzata !== "" && Number(f.larghezza_personalizzata) > 0) ? Number(f.larghezza_personalizzata) : 0,
      });
      api.get(`/calcola-costi?${params}`)
        .then((r) => {
          const { ricambi_dettaglio, ricambi_2_dettaglio, ...rest } = r.data;
          setRicambiDettaglio(ricambi_dettaglio || null);
          setRicambi2Dettaglio(ricambi_2_dettaglio || null);
          setF((prev) => {
            const merged = { ...prev, ...rest };
            // Se destinazione="altra" e spunta attiva: preserva i valori manuali (non azzerare)
            // Se il valore corrente era 0 (appena passato ad altra) → suggerisce la tariffa Marina come punto di partenza
            if (prev.alaggio_varo_attivo && prev.destinazione_alaggio_varo === "altra") {
              const prevA = Number(prev.costo_alaggio) || 0;
              const prevV = Number(prev.costo_varo) || 0;
              merged.costo_alaggio = prevA > 0 ? prev.costo_alaggio : (Number(rest.costo_alaggio) || 0);
              merged.costo_varo = prevV > 0 ? prev.costo_varo : (Number(rest.costo_varo) || 0);
            }
            return merged;
          });
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [f.lunghezza, f.tipo_sosta, f.giorni_sosta_temporanea, f.potenza_motore, f.litri_olio_motore, f.litri_olio_piede, f.numero_candele, f.numero_termostati, f.tipo_motore, f.filtro_olio_attivo, f.anodi_interni_attivo, f.anodi_esterni_attivo, f.olio_piede_attivo, f.ingrassaggio_attivo, f.antivegetativa_attiva, f.girante_attivo, f.lavaggio_inizio_attivo, f.lavaggio_fine_attivo, f.primo_motore_attivo, f.secondo_motore, f.potenza_motore_2, f.litri_olio_motore_2, f.litri_olio_piede_2, f.numero_candele_2, f.numero_termostati_2, f.tipo_motore_2, f.girante_2_attivo, f.filtro_olio_2_attivo, f.anodi_interni_2_attivo, f.anodi_esterni_2_attivo, f.olio_piede_2_attivo, f.ingrassaggio_2_attivo, f.scafo_sporco_attivo, f.copertura_attiva, f.alaggio_varo_attivo, f.destinazione_alaggio_varo, f.numero_movimenti, f.larghezza_personalizzata, f.override_costi, open]);

  // Sosta temporanea = sempre su piazzale (fuori) → attiva default alaggio/varo
  useEffect(() => {
    if (f.tipo_sosta === "temporanea" && !f.alaggio_varo_attivo) {
      update("alaggio_varo_attivo", true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.tipo_sosta]);

  const update = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const assegnaPostoAuto = async () => {
    try {
      const annoTarget = cliente?.anno || year;
      const params = new URLSearchParams({ anno: annoTarget });
      if (cliente?.id) params.set("escludi_cliente_id", cliente.id);
      const r = await api.get(`/posti-barca/next?${params}`);
      if (r.data?.posto) {
        update("posto_barca", r.data.posto);
        toast.success(`Posto #${String(r.data.posto).padStart(3, "0")} assegnato (${r.data.posti_liberi} posti liberi)`);
      } else {
        toast.error("Nessun posto libero disponibile per questo anno");
      }
    } catch {
      toast.error("Errore durante l'assegnazione automatica");
    }
  };

  // --- Lavorazioni extra helpers ---
  const totaleExtra = (Array.isArray(f.lavorazioni_extra) ? f.lavorazioni_extra : [])
    .reduce((s, it) => s + (Number(it?.prezzo) || 0), 0);

  const addExtraFromMagazzino = (articoloId, quantita = 1) => {
    if (!articoloId) return;
    if ((f.lavorazioni_extra || []).length >= MAX_EXTRA) {
      toast.error(`Massimo ${MAX_EXTRA} lavorazioni extra`);
      return;
    }
    const a = articoliMag.find((x) => x.id === articoloId);
    if (!a) return;
    const q = Math.max(Number(quantita) || 1, 0.01);
    const prezzoUnit = Number(a.prezzo_listino) || 0;
    const totale = +(q * prezzoUnit).toFixed(2);
    const qLabel = Number.isInteger(q) ? q : q.toString().replace(".", ",");
    const desc = `${a.codice ? `[${a.codice}] ` : ""}${a.nome} × ${qLabel} ${a.unita_misura || "pz"}`;
    update("lavorazioni_extra", [
      ...(f.lavorazioni_extra || []),
      { descrizione: desc, prezzo: totale },
    ]);
    toast.success(`Aggiunto: ${a.nome} × ${qLabel}`);
  };

  const totale =
    (Number(f.costo_sosta) || 0) + (Number(f.costo_copertura) || 0) +
    (Number(f.costo_alaggio) || 0) + (Number(f.costo_varo) || 0) +
    (Number(f.costo_antivegetativa) || 0) + (Number(f.costo_manutenzione_motore) || 0) +
    (Number(f.costo_lavaggio_inizio) || 0) + (Number(f.costo_lavaggio_fine) || 0) +
    (Number(f.costo_scafo_sporco) || 0) +
    (Number(f.costo_movimentazione) || 0) + (Number(f.costo_taccaggio) || 0) + totaleExtra;

  const save = async () => {
    // Preventivo veloce: solo nome+cognome obbligatori
    if (isPreventivo) {
      if (!f.nome?.trim() || !f.cognome?.trim()) {
        toast.error("Inserisci almeno cognome e nome");
        return;
      }
    } else if (!f.nome || !f.cognome || !f.tipo_barca || !f.lunghezza) {
      toast.error("Compila cognome, nome, tipo barca e lunghezza");
      return;
    }
    setSaving(true);
    const payload = {
      ...f,
      anno: cliente?.anno || year,
      lunghezza: Number(f.lunghezza) || 0,
      potenza_motore: Number(f.potenza_motore) || 0,
      litri_olio_motore: Number(f.litri_olio_motore) || 0,
      numero_candele: Number(f.numero_candele) || 0,
      numero_termostati: Number(f.numero_termostati) || 0,
      tipo_motore: f.tipo_motore || "fuoribordo",
      filtro_olio_attivo: !!f.filtro_olio_attivo,
      anodi_interni_attivo: !!f.anodi_interni_attivo,
      anodi_esterni_attivo: !!f.anodi_esterni_attivo,
      olio_piede_attivo: !!f.olio_piede_attivo,
      ingrassaggio_attivo: !!f.ingrassaggio_attivo,
      antivegetativa_attiva: !!f.antivegetativa_attiva,
      girante_attivo: !!f.girante_attivo,
      lavaggio_inizio_attivo: !!f.lavaggio_inizio_attivo,
      lavaggio_fine_attivo: !!f.lavaggio_fine_attivo,
      secondo_motore: !!f.secondo_motore,
      primo_motore_attivo: f.primo_motore_attivo !== false,
      potenza_motore_2: Number(f.potenza_motore_2) || 0,
      litri_olio_motore_2: Number(f.litri_olio_motore_2) || 0,
      numero_candele_2: Number(f.numero_candele_2) || 0,
      numero_termostati_2: Number(f.numero_termostati_2) || 0,
      tipo_motore_2: f.tipo_motore_2 || "fuoribordo",
      girante_2_attivo: !!f.girante_2_attivo,
      filtro_olio_2_attivo: !!f.filtro_olio_2_attivo,
      anodi_interni_2_attivo: !!f.anodi_interni_2_attivo,
      anodi_esterni_2_attivo: !!f.anodi_esterni_2_attivo,
      olio_piede_2_attivo: !!f.olio_piede_2_attivo,
      ingrassaggio_2_attivo: !!f.ingrassaggio_2_attivo,
      posto_barca: f.posto_barca === "" ? null : Number(f.posto_barca),
      costo_sosta: Number(f.costo_sosta) || 0,
      costo_copertura: Number(f.costo_copertura) || 0,
      costo_alaggio: Number(f.costo_alaggio) || 0,
      costo_varo: Number(f.costo_varo) || 0,
      costo_antivegetativa: Number(f.costo_antivegetativa) || 0,
      costo_manutenzione_motore: Number(f.costo_manutenzione_motore) || 0,
      costo_lavaggio_inizio: Number(f.costo_lavaggio_inizio) || 0,
      costo_lavaggio_fine: Number(f.costo_lavaggio_fine) || 0,
      costo_scafo_sporco: Number(f.costo_scafo_sporco) || 0,
      lavorazioni_extra: (Array.isArray(f.lavorazioni_extra) ? f.lavorazioni_extra : [])
        .filter((it) => !it?.tipo || f.tipo_sosta === "fuori_sede")
        .map((it) => ({
          descrizione: it?.tipo ? descrRitiroConsegna(it) : String(it?.descrizione ?? "").trim(),
          prezzo: Number(it?.prezzo) || 0,
          ...(it?.tipo ? { tipo: it.tipo, luogo: String(it.luogo ?? "").trim() } : {}),
        }))
        .filter((it) => (it.tipo ? it.luogo || it.prezzo > 0 : it.descrizione || it.prezzo > 0)),
      giorni_sosta_temporanea: Number(f.giorni_sosta_temporanea) || 0,
      litri_olio_piede: Number(f.litri_olio_piede) || 0,
      litri_olio_piede_2: Number(f.litri_olio_piede_2) || 0,
      scafo_sporco_attivo: !!f.scafo_sporco_attivo,
      copertura_attiva: !!f.copertura_attiva,
      alaggio_varo_attivo: !!f.alaggio_varo_attivo,
      numero_movimenti: Math.max(1, Number(f.numero_movimenti) || 1),
      destinazione_alaggio_varo: f.destinazione_alaggio_varo || "marina_di_campo",
      larghezza_personalizzata: (f.larghezza_personalizzata !== "" && Number(f.larghezza_personalizzata) > 0) ? Number(f.larghezza_personalizzata) : null,
      destinazione_altra_nome: (f.destinazione_altra_nome || "").trim(),
      scadenza_antivegetativa: f.scadenza_antivegetativa || null,
      scadenza_manutenzione: f.scadenza_manutenzione || null,
    };
    try {
      if (isPreventivo) {
        // Genera il PDF senza salvare e mostralo nell'anteprima
        const res = await api.post("/preventivo/pdf", payload, { responseType: "blob" });
        const blob = new Blob([res.data], { type: "application/pdf" });
        const url = window.URL.createObjectURL(blob);
        setPreviewUrl((old) => { if (old) window.URL.revokeObjectURL(old); return url; });
        setPreviewName(`preventivo_${(f.cognome || "").trim()}_${(f.nome || "").trim()}.pdf`.replace(/\s+/g, "_"));
        setPreviewOpen(true);
        toast.success("Preventivo PDF generato");
        setSaving(false);
        return;
      } else if (cliente?.id) {
        await api.put(`/clienti/${cliente.id}`, payload);
        toast.success("Cliente aggiornato");
      } else {
        await api.post("/clienti", payload);
        toast.success("Cliente creato");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const isFuori = f.tipo_sosta === "fuori";
  const isFuoriSede = f.tipo_sosta === "fuori_sede";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto" data-testid="cliente-form">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">
            {isPreventivo ? "Preventivo veloce" : (cliente ? "Modifica cliente" : "Nuovo cliente")}
          </SheetTitle>
          <SheetDescription>
            {isPreventivo
              ? "Compila almeno cognome e nome. Puoi aggiungere lunghezza, motore e servizi per un preventivo dettagliato. Il PDF viene generato senza salvare il cliente."
              : "Compila i dati del cliente. I costi vengono calcolati automaticamente in base alle tariffe."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Anagrafica */}
          <section>
            <div className="label-mini mb-3">Anagrafica</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cognome *">
                <Input value={f.cognome} onChange={(e) => update("cognome", e.target.value)} data-testid="input-cognome" />
              </Field>
              <Field label="Nome *">
                <Input value={f.nome} onChange={(e) => update("nome", e.target.value)} data-testid="input-nome" />
              </Field>
              <Field label="Codice fiscale">
                <Input value={f.codice_fiscale} onChange={(e) => update("codice_fiscale", e.target.value.toUpperCase())} maxLength={16} className="uppercase font-mono-num" data-testid="input-codice-fiscale" />
              </Field>
              <Field label="Indirizzo">
                <Input value={f.indirizzo} onChange={(e) => update("indirizzo", e.target.value)} placeholder="Via, città, CAP" data-testid="input-indirizzo" />
              </Field>
              <Field label="Telefono">
                <Input value={f.telefono} onChange={(e) => update("telefono", e.target.value)} data-testid="input-telefono" />
              </Field>
              <Field label="Cellulare">
                <Input value={f.cellulare} onChange={(e) => update("cellulare", e.target.value)} data-testid="input-cellulare" />
              </Field>
              <div className="col-span-2">
                <Field label="Email">
                  <Input type="email" value={f.email} onChange={(e) => update("email", e.target.value)} data-testid="input-email" />
                </Field>
              </div>
            </div>
          </section>

          <Separator />

          {/* Barca */}
          <section>
            <div className="label-mini mb-3">Imbarcazione</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tipo barca *">
                <Input placeholder="es. Cabinato, Gommone, Yacht…" value={f.tipo_barca} onChange={(e) => update("tipo_barca", e.target.value)} data-testid="input-tipo-barca" />
              </Field>
              <Field label="Lunghezza (metri) *">
                <Input type="number" step="0.1" min="0" value={f.lunghezza} onChange={(e) => update("lunghezza", e.target.value)} data-testid="input-lunghezza" />
                {Number(f.lunghezza) > 0 && (() => {
                  const L = Number(f.lunghezza);
                  const largOverride = Number(f.larghezza_personalizzata) > 0 ? Number(f.larghezza_personalizzata) : null;
                  const larg = largOverride || (L <= 6.5 ? 2.5 : L <= 9 ? 3 : 4);
                  const mq = (L * larg).toFixed(1).replace(/\.0$/, "");
                  return (
                    <div className="text-[11px] text-muted-foreground mt-1.5" data-testid="hint-mq">
                      Larghezza applicata: <b>{larg} m</b>{largOverride ? " (personalizzata)" : ""} · Superficie: <b>{mq} mq</b> (usata per sosta, copertura, antivegetativa)
                    </div>
                  );
                })()}
              </Field>
              <Field label="Larghezza personalizzata (m)">
                <Input
                  type="number" step="0.1" min="0"
                  placeholder="Auto (lascia vuoto)"
                  value={f.larghezza_personalizzata ?? ""}
                  onChange={(e) => update("larghezza_personalizzata", e.target.value)}
                  data-testid="input-larghezza-personalizzata"
                />
              </Field>
              <Field label="Tipo sosta *">
                <Select value={f.tipo_sosta} onValueChange={(v) => update("tipo_sosta", v)}>
                  <SelectTrigger data-testid="select-tipo-sosta"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dentro">Al coperto (dentro)</SelectItem>
                    <SelectItem value="fuori">Su piazzale (fuori)</SelectItem>
                    <SelectItem value="fuori_sede">Fuori sede</SelectItem>
                    <SelectItem value="temporanea">Temporanea (a giorni)</SelectItem>
                  </SelectContent>
                </Select>
                {f.tipo_sosta === "temporanea" && (
                  <div className="mt-2" data-testid="wrap-giorni-temporanea">
                    <Label className="text-xs text-muted-foreground">N° giorni</Label>
                    <Input
                      type="number" min="0" step="1"
                      placeholder="es. 15"
                      value={f.giorni_sosta_temporanea}
                      onChange={(e) => update("giorni_sosta_temporanea", e.target.value)}
                      className="mt-1 font-mono-num"
                      data-testid="input-giorni-temporanea"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Sosta temporanea = sempre su piazzale (fuori). Tariffa: € al mt / giorno.
                    </p>
                  </div>
                )}
              </Field>
              <Field label="Posto barca (1-200)">
                <div className="flex gap-2">
                  <Input type="number" min="1" max="200" placeholder="Assegna dopo…" value={f.posto_barca} onChange={(e) => update("posto_barca", e.target.value)} data-testid="input-posto-barca" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={assegnaPostoAuto}
                    className="shrink-0"
                    title="Assegna primo posto libero"
                    data-testid="btn-posto-auto"
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
                </div>
              </Field>
            </div>
          </section>

          <Separator />

          {/* Motore + servizi opzionali + secondo motore (component esterno) */}
          <MotoreSection f={f} update={update} />

          <Separator />

          {/* Costi */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="label-mini">Costi</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {f.override_costi ? "Modifica manuale attiva" : "Calcolati da lunghezza × tariffa"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="override" className="text-sm">Modifica manuale</Label>
                <Switch id="override" checked={f.override_costi} onCheckedChange={(v) => update("override_costi", v)} data-testid="switch-override" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!isFuoriSede && (
                <CostField label="Costo sosta" value={f.costo_sosta} onChange={(v) => update("costo_sosta", v)} disabled={!f.override_costi} testId="costo-sosta" />
              )}
              {isFuoriSede && (
                <>
                  <CostField label="Movimentazione" value={f.costo_movimentazione} onChange={(v) => update("costo_movimentazione", v)} disabled={!f.override_costi} testId="costo-movimentazione" />
                  <CostField label="Taccaggio" value={f.costo_taccaggio} onChange={(v) => update("costo_taccaggio", v)} disabled={!f.override_costi} testId="costo-taccaggio" />
                </>
              )}
              <CostField label="Antivegetativa" value={f.costo_antivegetativa} onChange={(v) => update("costo_antivegetativa", v)} disabled={!f.override_costi} testId="costo-antivegetativa" />
              {!f.antivegetativa_attiva && (
                <CostField label="Magg. scafo sporco" value={f.costo_scafo_sporco} onChange={(v) => update("costo_scafo_sporco", v)} disabled={!f.override_costi} testId="costo-scafo-sporco" />
              )}
              <CostField label="Lavaggio inizio stagione" value={f.costo_lavaggio_inizio} onChange={(v) => update("costo_lavaggio_inizio", v)} disabled={!f.override_costi} testId="costo-lavaggio-inizio" />
              <CostField label="Lavaggio fine stagione" value={f.costo_lavaggio_fine} onChange={(v) => update("costo_lavaggio_fine", v)} disabled={!f.override_costi} testId="costo-lavaggio-fine" />
              <CostField label="Manutenzione motore" value={f.costo_manutenzione_motore} onChange={(v) => update("costo_manutenzione_motore", v)} disabled={!f.override_costi} testId="costo-manutenzione" />
              {isFuori && <CostField label="Copertura" value={f.costo_copertura} onChange={(v) => update("costo_copertura", v)} disabled={!f.override_costi} testId="costo-copertura" />}
              {f.alaggio_varo_attivo && (
                <div className="col-span-2 p-3 rounded-md border border-border bg-muted/20" data-testid="wrap-destinazione-alaggio">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <Label className="text-sm font-medium">Destinazione alaggio / varo</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Marina di Campo = tariffa fissa a movimento. Altra destinazione = costo manuale.
                      </p>
                    </div>
                    <Select
                      value={f.destinazione_alaggio_varo || "marina_di_campo"}
                      onValueChange={(v) => update("destinazione_alaggio_varo", v)}
                    >
                      <SelectTrigger className="w-[220px]" data-testid="select-destinazione-alaggio">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="marina_di_campo">Marina di Campo</SelectItem>
                        <SelectItem value="altra">Altra destinazione</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 pt-3 border-t border-border/50">
                    <div>
                      <Label className="text-sm font-medium">Numero movimenti (alaggio + varo)</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Es. se il cliente chiede 2 alaggi e 2 vari inserisci "2". Il costo viene moltiplicato.
                      </p>
                    </div>
                    <Input
                      type="number" min="1" step="1"
                      value={f.numero_movimenti ?? 1}
                      onChange={(e) => update("numero_movimenti", e.target.value)}
                      className="w-[120px] font-mono-num text-right"
                      data-testid="input-numero-movimenti"
                    />
                  </div>
                  {f.destinazione_alaggio_varo === "altra" && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <Label className="text-xs text-muted-foreground">Nome destinazione</Label>
                      <Input
                        placeholder="es. Portoferraio, Piombino, ..."
                        value={f.destinazione_altra_nome || ""}
                        onChange={(e) => update("destinazione_altra_nome", e.target.value)}
                        className="mt-1"
                        data-testid="input-destinazione-altra-nome"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Modifica i costi qui sotto se il movimento verso questa destinazione ha un prezzo diverso dalla tariffa di Marina di Campo.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {f.alaggio_varo_attivo && <CostField label={f.destinazione_alaggio_varo === "altra" ? `Alaggio${f.destinazione_altra_nome ? ` (${f.destinazione_altra_nome})` : ""}` : "Alaggio"} value={f.costo_alaggio} onChange={(v) => update("costo_alaggio", v)} disabled={f.destinazione_alaggio_varo === "altra" ? false : !f.override_costi} testId="costo-alaggio" />}
              {f.alaggio_varo_attivo && <CostField label={f.destinazione_alaggio_varo === "altra" ? `Varo${f.destinazione_altra_nome ? ` (${f.destinazione_altra_nome})` : ""}` : "Varo"} value={f.costo_varo} onChange={(v) => update("costo_varo", v)} disabled={f.destinazione_alaggio_varo === "altra" ? false : !f.override_costi} testId="costo-varo" />}
            </div>

            {/* Dettaglio motore breakdown */}
            {!f.override_costi && ricambiDettaglio && Number(f.potenza_motore) > 0 && (
              <div className="mt-4 p-3 bg-muted/40 border border-border rounded-md" data-testid="ricambi-breakdown">
                <div className="label-mini mb-2">{f.secondo_motore ? "Dettaglio 1° motore" : "Dettaglio motore"}</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <BreakdownRow label="Manodopera" value={f.costo_manodopera_motore} />
                  <BreakdownRow label="Girante" value={ricambiDettaglio.girante} />
                  <BreakdownRow label={`Olio motore (${f.litri_olio_motore || 0}L)`} value={ricambiDettaglio.olio_motore} />
                  <BreakdownRow label="Filtro olio" value={ricambiDettaglio.filtro_olio} />
                  <BreakdownRow label={`Candele (${f.numero_candele || 0})`} value={ricambiDettaglio.candele} />
                  <BreakdownRow label={`Termostati (${f.numero_termostati || 0})`} value={ricambiDettaglio.termostati} />
                  <BreakdownRow label={`Olio piede (${f.litri_olio_piede || 0}L)`} value={ricambiDettaglio.olio_piede} />
                  <BreakdownRow label="Kit anodi interni" value={ricambiDettaglio.anodi_interni} />
                  <BreakdownRow label="Kit anodi esterni" value={ricambiDettaglio.anodi_esterni} />
                  <BreakdownRow label="Ingrassaggio" value={ricambiDettaglio.ingrassaggio} />
                </div>
                <div className="flex justify-between mt-2 pt-2 border-t border-border/60 text-xs">
                  <span className="font-semibold">Subtotale 1° motore</span>
                  <span className="font-mono-num font-semibold text-primary">
                    {fmtEuro((Number(f.costo_manodopera_motore) || 0) + (Number(f.costo_ricambi_totale) || 0))}
                  </span>
                </div>
              </div>
            )}

            {/* Dettaglio 2° motore */}
            {!f.override_costi && f.secondo_motore && ricambi2Dettaglio && Number(f.potenza_motore_2) > 0 && (
              <div className="mt-3 p-3 bg-muted/40 border border-border rounded-md" data-testid="ricambi-breakdown-2">
                <div className="label-mini mb-2">Dettaglio 2° motore</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <BreakdownRow label="Manodopera" value={f.costo_manodopera_motore_2} />
                  <BreakdownRow label="Girante" value={ricambi2Dettaglio.girante} />
                  <BreakdownRow label={`Olio motore (${f.litri_olio_motore_2 || 0}L)`} value={ricambi2Dettaglio.olio_motore} />
                  <BreakdownRow label="Filtro olio" value={ricambi2Dettaglio.filtro_olio} />
                  <BreakdownRow label={`Candele (${f.numero_candele_2 || 0})`} value={ricambi2Dettaglio.candele} />
                  <BreakdownRow label={`Termostati (${f.numero_termostati_2 || 0})`} value={ricambi2Dettaglio.termostati} />
                  <BreakdownRow label={`Olio piede (${f.litri_olio_piede_2 || 0}L)`} value={ricambi2Dettaglio.olio_piede} />
                  <BreakdownRow label="Anodi interni" value={ricambi2Dettaglio.anodi_interni} />
                  <BreakdownRow label="Anodi esterni" value={ricambi2Dettaglio.anodi_esterni} />
                  <BreakdownRow label="Ingrassaggio" value={ricambi2Dettaglio.ingrassaggio} />
                </div>
                <div className="flex justify-between mt-2 pt-2 border-t border-border/60 text-xs">
                  <span className="font-semibold">Subtotale 2° motore</span>
                  <span className="font-mono-num font-semibold text-primary">
                    {fmtEuro((Number(f.costo_manodopera_motore_2) || 0) + (Number(f.costo_ricambi_motore_2_totale) || 0))}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-4 p-4 bg-primary/5 border border-primary/20 rounded-md flex items-center justify-between">
              <div className="label-mini">Totale annuale stimato</div>
              <div className="font-display text-2xl font-semibold text-primary font-mono-num" data-testid="totale-costi">{fmtEuro(totale)}</div>
            </div>
          </section>

          <Separator />

          {isFuoriSede && (
            <>
              <RitiroConsegnaSection f={f} update={update} />
              <Separator />
            </>
          )}

          {/* Lavorazioni extra (component esterno) */}
          <LavorazioniExtraSection
            f={f}
            update={update}
            onOpenMagPicker={() => setMagPickerOpen(true)}
          />

          <Separator />

          {/* Lavori & scadenze */}
          <section>
            <div className="label-mini mb-3">Scadenze</div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Field label="Prossima antivegetativa">
                <Input type="date" value={f.scadenza_antivegetativa || ""} onChange={(e) => update("scadenza_antivegetativa", e.target.value)} data-testid="input-scadenza-antiveg" />
              </Field>
              <Field label="Prossima manutenzione motore">
                <Input type="date" value={f.scadenza_manutenzione || ""} onChange={(e) => update("scadenza_manutenzione", e.target.value)} data-testid="input-scadenza-motore" />
              </Field>
            </div>
            <Field label="Note generali">
              <Textarea rows={3} placeholder="Note generiche sul cliente o sulla barca…" value={f.note_lavori} onChange={(e) => update("note_lavori", e.target.value)} data-testid="input-note" />
            </Field>
            <Field label="Memo (promemoria che compare in calendario e nell'app dipendenti)">
              <Textarea rows={2} placeholder="Es. Chiedere conferma antivegetativa · Chiavi nel cassetto 3 · Pagamento in sospeso…" value={f.memo || ""} onChange={(e) => update("memo", e.target.value)} className="border-amber-300 bg-amber-50/60 focus-visible:ring-amber-400" data-testid="input-memo" />
            </Field>
          </section>

          <Separator />

          {/* Storico lavori strutturato */}
          <section>
            <LavoriSection clienteId={cliente?.id} />
          </section>

          {cliente?.id && (
            <>
              <Separator />
              <section>
                <div className="label-mini mb-3">Documenti</div>
                <Button variant="outline" asChild className="w-full" data-testid="btn-download-pdf">
                  <a href={`${API}/clienti/${cliente.id}/preventivo.pdf`} download target="_blank" rel="noreferrer">
                    <FileText className="w-4 h-4 mr-2" />
                    Scarica preventivo PDF
                  </a>
                </Button>
              </section>
            </>
          )}
        </div>

        <SheetFooter className="gap-2 sticky bottom-0 bg-background py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="btn-annulla">Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90" data-testid="btn-salva">
            {isPreventivo
              ? (saving ? "Generazione…" : (<><FileText className="w-4 h-4 mr-2" /> Scarica preventivo PDF</>))
              : (saving ? "Salvataggio…" : "Salva cliente")}
          </Button>
        </SheetFooter>
      </SheetContent>

      {/* Dialog: aggiungi articolo dal magazzino (component esterno) */}
      <MagazzinoPickerDialog
        open={magPickerOpen}
        onOpenChange={setMagPickerOpen}
        articoli={articoliMag}
        onConfirm={addExtraFromMagazzino}
      />

      <PdfPreviewOverlay
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        url={previewUrl}
        filename={previewName}
      />
    </Sheet>
  );
}


