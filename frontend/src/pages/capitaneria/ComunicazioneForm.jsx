import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PORTI = {
  marina_di_campo: { nome: "Marina di Campo", ufficio_locale_marittimo: "", delegazione_spiaggia: "Campo nell'Elba" },
  marciana_marina: { nome: "Marciana Marina", ufficio_locale_marittimo: "Marciana Marina", delegazione_spiaggia: "" },
};

const today = () => new Date().toISOString().slice(0, 10);

export const nuovaComunicazione = (porto, s) => ({
  porto,
  ordinanza: s?.ordinanza || "",
  ufficio_locale_marittimo: s?.porti?.[porto]?.ufficio_locale_marittimo ?? PORTI[porto].ufficio_locale_marittimo,
  delegazione_spiaggia: s?.porti?.[porto]?.delegazione_spiaggia ?? PORTI[porto].delegazione_spiaggia,
  porto_nome: PORTI[porto].nome,
  dichiarante: s?.dichiarante || "", ditta: s?.ditta || "", ditta_sede: s?.ditta_sede || "", ditta_via: s?.ditta_via || "",
  data_operazione: today(), ora_operazione: "", alaggio: false, varo: false,
  uso: "diporto", tipo_unita: "natante",
  unita_nome: "", unita_iscrizione: "", unita_nominativo: "", unita_lunghezza: "", unita_pescaggio: "", unita_larghezza: "",
  resp_nome: s?.resp_nome || "", resp_cognome: s?.resp_cognome || "", resp_nato_a: s?.resp_nato_a || "", resp_nato_il: s?.resp_nato_il || "",
  resp_qualifica: s?.resp_qualifica || "", resp_cellulare: s?.resp_cellulare || "",
  firma_localita: s?.firma_localita || "", firma_data: today(), note: "",
});

function F({ label, children, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Txt({ f, k, set, type = "text", placeholder = "", suffix = "" }) {
  const input = <Input type={type} inputMode={suffix ? "decimal" : undefined} step={type === "number" ? "0.01" : undefined} value={f[k] ?? ""} placeholder={placeholder} onChange={(e) => set(k, e.target.value)} data-testid={`cap-${k.replace(/_/g, "-")}`} className={suffix ? "pr-10" : ""} />;
  if (!suffix) return input;
  return <div className="relative">{input}<span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground">{suffix}</span></div>;
}

function Sw({ label, checked, onChange, testId }) {
  return (
    <label className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-muted/20 cursor-pointer">
      <span className="text-sm font-medium">{label}</span>
      <Switch checked={!!checked} onCheckedChange={onChange} data-testid={testId} />
    </label>
  );
}

function Sec({ lett, title, children }) {
  return (
    <section className="space-y-3">
      <div className="label-mini flex items-center gap-2"><span className="w-6 h-6 rounded bg-primary text-primary-foreground grid place-items-center text-xs font-bold">{lett}</span>{title}</div>
      {children}
    </section>
  );
}

export default function ComunicazioneForm({ f, set }) {
  return (
    <div className="space-y-7">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <F label="Porto" className="md:col-span-1">
          <Select value={f.porto} onValueChange={(v) => { set("porto", v); set("porto_nome", PORTI[v].nome); set("ufficio_locale_marittimo", PORTI[v].ufficio_locale_marittimo); set("delegazione_spiaggia", PORTI[v].delegazione_spiaggia); }}>
            <SelectTrigger data-testid="cap-porto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PORTI).map(([k, p]) => <SelectItem key={k} value={k}>{p.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        <F label="Ufficio Locale Marittimo di"><Txt f={f} k="ufficio_locale_marittimo" set={set} /></F>
        <F label="Delegazione di Spiaggia"><Txt f={f} k="delegazione_spiaggia" set={set} /></F>
        <F label="Riferimento ordinanza" className="md:col-span-3"><Txt f={f} k="ordinanza" set={set} /></F>
      </section>

      <Sec lett="A" title="Dichiarante">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <F label="Il sottoscritto"><Txt f={f} k="dichiarante" set={set} /></F>
          <F label="Rappresentante legale della"><Txt f={f} k="ditta" set={set} /></F>
          <F label="Con sede in"><Txt f={f} k="ditta_sede" set={set} /></F>
          <F label="Alla via"><Txt f={f} k="ditta_via" set={set} /></F>
        </div>
      </Sec>

      <Sec lett="B" title="Operazione">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <F label="Giorno"><Txt f={f} k="data_operazione" set={set} type="date" /></F>
          <F label="Ore"><Txt f={f} k="ora_operazione" set={set} type="time" /></F>
          <Sw label="Alaggio" checked={f.alaggio} onChange={(v) => set("alaggio", v)} testId="cap-switch-alaggio" />
          <Sw label="Varo" checked={f.varo} onChange={(v) => set("varo", v)} testId="cap-switch-varo" />
        </div>
      </Sec>

      <Sec lett="C" title="Tipo unità">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <F label="Uso">
            <Select value={f.uso} onValueChange={(v) => set("uso", v)}>
              <SelectTrigger data-testid="cap-uso"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="diporto">Diporto</SelectItem><SelectItem value="pesca">Pesca professionale</SelectItem></SelectContent>
            </Select>
          </F>
          <F label="Categoria">
            <Select value={f.tipo_unita} onValueChange={(v) => set("tipo_unita", v)}>
              <SelectTrigger data-testid="cap-tipo-unita"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="natante">Natante</SelectItem><SelectItem value="imbarcazione">Imbarcazione</SelectItem></SelectContent>
            </Select>
          </F>
        </div>
      </Sec>

      <Sec lett="D" title="Unità navale">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <F label="Nome"><Txt f={f} k="unita_nome" set={set} /></F>
          <F label="N° d'iscrizione"><Txt f={f} k="unita_iscrizione" set={set} /></F>
          <F label="Nominativo internazionale"><Txt f={f} k="unita_nominativo" set={set} /></F>
          <F label="Lunghezza"><Txt f={f} k="unita_lunghezza" set={set} type="number" placeholder="es. 7.50" suffix="mt" /></F>
          <F label="Pescaggio"><Txt f={f} k="unita_pescaggio" set={set} type="number" placeholder="es. 0.60" suffix="mt" /></F>
          <F label="Larghezza"><Txt f={f} k="unita_larghezza" set={set} type="number" placeholder="es. 2.50" suffix="mt" /></F>
        </div>
      </Sec>

      <Sec lett="E" title="Responsabile delle operazioni sul posto">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <F label="Nome"><Txt f={f} k="resp_nome" set={set} /></F>
          <F label="Cognome"><Txt f={f} k="resp_cognome" set={set} /></F>
          <F label="Nato/a a"><Txt f={f} k="resp_nato_a" set={set} /></F>
          <F label="Il"><Txt f={f} k="resp_nato_il" set={set} type="date" /></F>
          <F label="Qualifica"><Txt f={f} k="resp_qualifica" set={set} /></F>
          <F label="N° cellulare"><Txt f={f} k="resp_cellulare" set={set} /></F>
        </div>
      </Sec>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <F label="Località firma"><Txt f={f} k="firma_localita" set={set} /></F>
        <F label="Data firma"><Txt f={f} k="firma_data" set={set} type="date" /></F>
        <F label="Note interne (non stampate)"><Textarea rows={1} value={f.note ?? ""} onChange={(e) => set("note", e.target.value)} data-testid="cap-note" /></F>
      </section>
    </div>
  );
}
