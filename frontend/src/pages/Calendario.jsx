import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Palette } from "lucide-react";
import MeseGriglia from "@/pages/calendario/MeseGriglia";
import ElencoEventi from "@/pages/calendario/ElencoEventi";
import EventoDialog from "@/pages/calendario/EventoDialog";
import TipiDialog from "@/pages/calendario/TipiDialog";

export const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const oggi = new Date();

export default function Calendario() {
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [eventi, setEventi] = useState([]);
  const [tipi, setTipi] = useState([]);
  const [conteggi, setConteggi] = useState({});
  const [editing, setEditing] = useState(null);
  const [tipiOpen, setTipiOpen] = useState(false);

  const loadTipi = () => api.get("/calendario/tipi").then((r) => setTipi(r.data));
  const load = () => Promise.all([
    api.get("/calendario/eventi", { params: { anno, mese } }).then((r) => setEventi(r.data)),
    api.get("/calendario/conteggio-mesi", { params: { anno } }).then((r) => setConteggi(r.data)),
  ]).catch(() => toast.error("Errore nel caricamento del calendario"));

  useEffect(() => { loadTipi(); }, []);
  useEffect(() => { load(); }, [anno, mese]);

  const sposta = (d) => {
    let m = mese + d, a = anno;
    if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; }
    setMese(m); setAnno(a);
  };

  const nuovo = (data) => setEditing({ data: data || `${anno}-${String(mese).padStart(2, "0")}-${String(oggi.getDate()).padStart(2, "0")}`, ora: "", titolo: "", tipo_id: tipi[0]?.id || "altro", note: "" });

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl" data-testid="calendario-page">
      <div className="label-mini flex items-center gap-1.5 mb-2"><CalendarDays className="w-3.5 h-3.5" /> Agenda del cantiere</div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
        <h1 className="font-display text-3xl sm:text-5xl font-semibold">Calendario</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTipiOpen(true)} data-testid="btn-tipi"><Palette className="w-4 h-4 mr-1.5" /> Tipi</Button>
          <Button onClick={() => nuovo()} className="bg-primary hover:bg-primary/90" data-testid="btn-nuovo-evento"><Plus className="w-4 h-4 mr-1.5" /> Nuovo appuntamento</Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        <Button variant="outline" size="icon" onClick={() => sposta(-1)} data-testid="btn-mese-prec"><ChevronLeft className="w-4 h-4" /></Button>
        <div className="flex items-center gap-2">
          <select value={mese} onChange={(e) => setMese(+e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-display font-semibold" data-testid="select-mese">
            {MESI.map((m, i) => <option key={m} value={i + 1}>{m}{conteggi[i + 1] ? ` (${conteggi[i + 1]})` : ""}</option>)}
          </select>
          <select value={anno} onChange={(e) => setAnno(+e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm font-mono-num" data-testid="select-anno">
            {Array.from({ length: 7 }, (_, i) => oggi.getFullYear() - 2 + i).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={() => { setAnno(oggi.getFullYear()); setMese(oggi.getMonth() + 1); }} className="hidden sm:inline-flex" data-testid="btn-oggi">Oggi</Button>
        </div>
        <Button variant="outline" size="icon" onClick={() => sposta(1)} data-testid="btn-mese-succ"><ChevronRight className="w-4 h-4" /></Button>
      </div>

      <div className="flex gap-2 flex-wrap mb-4" data-testid="legenda-tipi">
        {tipi.map((t) => <span key={t.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-2.5 h-2.5 rounded-full" style={{ background: t.colore }} /> {t.nome}</span>)}
      </div>

      <MeseGriglia anno={anno} mese={mese} eventi={eventi} tipi={tipi} onGiorno={nuovo} onEvento={setEditing} />
      <ElencoEventi eventi={eventi} tipi={tipi} onEvento={setEditing} />

      <EventoDialog evento={editing} tipi={tipi} onClose={() => setEditing(null)} onSaved={load} />
      <TipiDialog open={tipiOpen} onOpenChange={setTipiOpen} tipi={tipi} onSaved={(t) => { setTipi(t); load(); }} />
    </div>
  );
}
