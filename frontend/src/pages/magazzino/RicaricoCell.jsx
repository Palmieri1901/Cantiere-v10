import { useState } from "react";
import { api, fmtEuro } from "@/lib/api";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Percent, Lock, Unlock } from "lucide-react";

// Modifica rapida del ricarico di un singolo articolo (clic sulla % nella tabella)
export function RicaricoCell({ a, onSaved }) {
  const pa = Number(a.prezzo_acquisto || 0), pv = Number(a.prezzo_listino || 0);
  const rk = pa > 0 && pv > 0 ? ((pv - pa) / pa) * 100 : null;
  const [open, setOpen] = useState(false);
  const [perc, setPerc] = useState("");
  const [prezzo, setPrezzo] = useState("");
  const [saving, setSaving] = useState(false);

  const apri = (o) => { setOpen(o); if (o) { setPerc(rk !== null ? rk.toFixed(0) : ""); setPrezzo(pv ? pv.toFixed(2) : ""); } };
  const anteprima = perc !== "" && pa > 0 ? pa * (1 + Number(perc) / 100) : null;
  const salva = async (body) => {
    setSaving(true);
    try {
      const r = await api.put(`/magazzino/articoli/${a.id}/ricarico`, body);
      toast.success(body.manuale === false ? "Ricarico sbloccato: seguirà fornitore" : `Listino ${fmtEuro(r.data.prezzo_listino)} (${r.data.ricarico_percent ?? "—"}%)`);
      setOpen(false); onSaved?.();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore"); } finally { setSaving(false); }
  };

  return (
    <Popover open={open} onOpenChange={apri}>
      <PopoverTrigger asChild>
        <button type="button" className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted font-mono-num text-xs ${rk === null ? "text-muted-foreground" : rk < 0 ? "text-destructive" : rk >= 20 ? "text-primary" : "text-muted-foreground"}`} title="Modifica ricarico di questo articolo" data-testid={`btn-ricarico-${a.id}`}>
          {rk !== null ? `${rk >= 0 ? "+" : ""}${rk.toFixed(0)}%` : "—"}
          {a.ricarico_manuale && <Lock className="w-3 h-3 text-amber-600" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3" data-testid={`ricarico-pop-${a.id}`}>
        <div>
          <div className="font-medium text-sm truncate">{a.nome}</div>
          <div className="text-xs text-muted-foreground">Acquisto {fmtEuro(pa)} · listino attuale {fmtEuro(pv)}</div>
        </div>
        <label className="block text-xs text-muted-foreground">Ricarico %
          <div className="relative mt-1"><Input type="number" step="1" value={perc} onChange={(e) => { setPerc(e.target.value); setPrezzo(""); }} className="pr-7 font-mono-num" disabled={pa <= 0} data-testid={`ricarico-perc-${a.id}`} /><Percent className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /></div>
          {anteprima !== null && <div className="text-[11px] mt-1">→ listino {fmtEuro(anteprima)} · IVA incl. {fmtEuro(anteprima * 1.22)}</div>}
        </label>
        <label className="block text-xs text-muted-foreground">oppure prezzo di listino (IVA esclusa)
          <Input type="number" step="0.01" value={prezzo} onChange={(e) => { setPrezzo(e.target.value); setPerc(""); }} className="mt-1 font-mono-num" data-testid={`ricarico-prezzo-${a.id}`} />
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" className="flex-1" disabled={saving || (perc === "" && prezzo === "")} onClick={() => salva(prezzo !== "" ? { prezzo_listino: Number(prezzo), manuale: true } : { ricarico_percent: Number(perc), manuale: true })} data-testid={`ricarico-salva-${a.id}`}><Lock className="w-3.5 h-3.5 mr-1" /> Salva e blocca</Button>
          {a.ricarico_manuale && <Button size="sm" variant="outline" disabled={saving} title="Torna a seguire il ricarico di fornitore" onClick={() => salva({ prezzo_listino: pv, manuale: false })} data-testid={`ricarico-sblocca-${a.id}`}><Unlock className="w-3.5 h-3.5" /></Button>}
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">Bloccato = il ricalcolo massivo di fornitore non modifica questo articolo.</p>
      </PopoverContent>
    </Popover>
  );
}
