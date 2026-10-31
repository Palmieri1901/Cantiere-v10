import { useEffect, useState } from "react";
import { mobileApi } from "@/lib/mobileStore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import ElencoEventi from "@/pages/calendario/ElencoEventi";

const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const oggi = new Date();

// Calendario del cantiere per l'app dipendenti: consultazione per mese + aggiunta appuntamento
export default function CalendarioMobile() {
  const api = mobileApi();
  const [anno, setAnno] = useState(oggi.getFullYear());
  const [mese, setMese] = useState(oggi.getMonth() + 1);
  const [tipi, setTipi] = useState([]);
  const [eventi, setEventi] = useState([]);
  const [nuovo, setNuovo] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/calendario/eventi", { params: { anno, mese } }).then((r) => setEventi(r.data || [])).catch(() => toast.error("Calendario non disponibile: sei online?"));
  useEffect(() => { mobileApi().get("/calendario/tipi").then((r) => setTipi(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [anno, mese]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambia = (d) => { let m = mese + d, a = anno; if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; } setMese(m); setAnno(a); };
  const apriNuovo = (data) => setNuovo({ data: data || `${anno}-${String(mese).padStart(2, "0")}-${String(Math.min(oggi.getDate(), 28)).padStart(2, "0")}`, ora: "", titolo: "", tipo_id: tipi[0]?.id || "altro", note: "" });
  const salva = async () => {
    if (!nuovo.titolo.trim()) { toast.error("Inserisci un titolo"); return; }
    setBusy(true);
    try { await api.post("/calendario/eventi", nuovo); toast.success("Appuntamento aggiunto"); setNuovo(null); load(); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setNuovo((s) => ({ ...s, [k]: e.target.value }));

  return (
    <div className="space-y-3" data-testid="calendario-mobile">
      <h2 className="font-display text-2xl font-semibold flex items-center gap-2"><CalendarDays className="w-6 h-6 text-primary" /> Calendario</h2>
      <div className="flex items-center justify-between rounded-lg border bg-card px-2 py-1.5">
        <Button size="icon" variant="ghost" onClick={() => cambia(-1)} data-testid="cal-mobile-prev"><ChevronLeft className="w-5 h-5" /></Button>
        <div className="font-semibold" data-testid="cal-mobile-mese">{MESI[mese - 1]} {anno}</div>
        <Button size="icon" variant="ghost" onClick={() => cambia(1)} data-testid="cal-mobile-next"><ChevronRight className="w-5 h-5" /></Button>
      </div>
      <Button className="w-full" onClick={() => apriNuovo()} data-testid="cal-mobile-nuovo"><Plus className="w-4 h-4 mr-2" /> Nuovo appuntamento</Button>
      {nuovo && (
        <div className="rounded-lg border bg-card p-3 space-y-2" data-testid="cal-mobile-form">
          <Input value={nuovo.titolo} onChange={set("titolo")} placeholder="Titolo (es. Alaggio Rossi)" data-testid="cal-mobile-titolo" />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={nuovo.data} onChange={set("data")} data-testid="cal-mobile-data" />
            <Input type="time" value={nuovo.ora} onChange={set("ora")} data-testid="cal-mobile-ora" />
          </div>
          <Select value={nuovo.tipo_id} onValueChange={(v) => setNuovo((s) => ({ ...s, tipo_id: v }))}>
            <SelectTrigger data-testid="cal-mobile-tipo"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>{tipi.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea value={nuovo.note} onChange={set("note")} placeholder="Note" rows={2} data-testid="cal-mobile-note" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setNuovo(null)}>Annulla</Button>
            <Button onClick={salva} disabled={busy} data-testid="cal-mobile-salva">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salva"}</Button>
          </div>
        </div>
      )}
      <ElencoEventi eventi={eventi} tipi={tipi} onEvento={() => {}} onGiorno={(d) => apriNuovo(d)} />
    </div>
  );
}
