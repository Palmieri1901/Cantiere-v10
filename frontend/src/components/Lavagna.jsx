import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { ClipboardList, Pencil, Trash2, Check, Undo2, Plus, X, PackageSearch, Footprints, AlertTriangle, StickyNote, RefreshCw } from "lucide-react";

export const TIPI_LAVAGNA = {
  memo: { label: "Memo", icon: StickyNote, cls: "bg-amber-100 text-amber-900 border-amber-300" },
  manca: { label: "Manca articolo", icon: PackageSearch, cls: "bg-sky-100 text-sky-900 border-sky-300" },
  commissione: { label: "Commissione", icon: Footprints, cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  urgente: { label: "Urgente", icon: AlertTriangle, cls: "bg-rose-100 text-rose-900 border-rose-300" },
};

const quando = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`; };

// Lavagna condivisa: tutti leggono, scrivono, modificano e cancellano. `client` = axios (api o mobileApi), `basePath` = "/lavagna"
export function Lavagna({ client, basePath = "/lavagna", compact = false }) {
  const [lista, setLista] = useState([]);
  const [testo, setTesto] = useState("");
  const [tipo, setTipo] = useState("memo");
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => client.get(basePath).then((r) => setLista(r.data || [])).catch(() => toast.error("Impossibile caricare la lavagna: sei online?"));
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const scrivi = async () => {
    if (!testo.trim()) return;
    setBusy(true);
    try { await client.post(basePath, { testo, tipo }); setTesto(""); setTipo("memo"); await load(); toast.success("Scritto sulla lavagna"); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore"); } finally { setBusy(false); }
  };
  const salvaEdit = async () => {
    if (!edit.testo.trim()) return;
    setBusy(true);
    try { await client.put(`${basePath}/${edit.id}`, { testo: edit.testo, tipo: edit.tipo }); setEdit(null); await load(); toast.success("Messaggio aggiornato"); }
    catch (e) { toast.error(e.response?.data?.detail || "Errore"); } finally { setBusy(false); }
  };
  const toggleFatto = async (m) => { try { await client.put(`${basePath}/${m.id}`, { fatto: !m.fatto }); await load(); } catch { toast.error("Errore"); } };
  const elimina = async (m) => {
    if (!(await confirmDialog(`Cancellare il messaggio di ${m.autore}?`, { title: "Cancella dalla lavagna", okLabel: "Cancella" }))) return;
    try { await client.delete(`${basePath}/${m.id}`); await load(); toast.success("Cancellato"); } catch { toast.error("Errore"); }
  };

  const aperti = lista.filter((m) => !m.fatto), fatti = lista.filter((m) => m.fatto);

  return (
    <div className="space-y-4" data-testid="lavagna">
      <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-3 space-y-2" data-testid="lavagna-nuovo">
        <Textarea value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Scrivi per tutti: manca questo articolo, fare questa commissione…" rows={compact ? 2 : 3} className="bg-card" data-testid="lavagna-testo" />
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.entries(TIPI_LAVAGNA).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setTipo(k)} className={`text-[11px] px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${tipo === k ? t.cls + " font-semibold" : "bg-card text-muted-foreground border-border"}`} data-testid={`lavagna-tipo-${k}`}><t.icon className="w-3 h-3" /> {t.label}</button>
          ))}
          <Button size="sm" className="ml-auto" onClick={scrivi} disabled={busy || !testo.trim()} data-testid="lavagna-scrivi"><Plus className="w-4 h-4 mr-1" /> Scrivi</Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="label-mini">{aperti.length} {aperti.length === 1 ? "messaggio" : "messaggi"} sulla lavagna</div>
        <Button size="sm" variant="ghost" onClick={load} data-testid="lavagna-aggiorna"><RefreshCw className="w-3.5 h-3.5 mr-1" /> Aggiorna</Button>
      </div>
      {aperti.length === 0 && <div className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-md" data-testid="lavagna-vuota">Lavagna pulita: nessun messaggio</div>}
      <div className={compact ? "space-y-2" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
        {aperti.map((m) => <Post key={m.id} m={m} edit={edit} setEdit={setEdit} salvaEdit={salvaEdit} toggleFatto={toggleFatto} elimina={elimina} busy={busy} />)}
      </div>
      {fatti.length > 0 && (
        <details className="pt-2" data-testid="lavagna-fatti">
          <summary className="label-mini cursor-pointer">{fatti.length} {fatti.length === 1 ? "fatto" : "fatti"} · tocca per vedere</summary>
          <div className={`mt-2 ${compact ? "space-y-2" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"}`}>
            {fatti.map((m) => <Post key={m.id} m={m} edit={edit} setEdit={setEdit} salvaEdit={salvaEdit} toggleFatto={toggleFatto} elimina={elimina} busy={busy} />)}
          </div>
        </details>
      )}
    </div>
  );
}

function Post({ m, edit, setEdit, salvaEdit, toggleFatto, elimina, busy }) {
  const t = TIPI_LAVAGNA[m.tipo] || TIPI_LAVAGNA.memo;
  const inEdit = edit?.id === m.id;
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${t.cls} ${m.fatto ? "opacity-60" : ""}`} data-testid={`lavagna-post-${m.id}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"><t.icon className="w-3.5 h-3.5" /> {t.label}<span className="ml-auto font-normal normal-case tracking-normal opacity-80">{quando(m.created_at)}</span></div>
      {inEdit ? (
        <div className="mt-2 space-y-2">
          <Textarea value={edit.testo} onChange={(e) => setEdit({ ...edit, testo: e.target.value })} rows={3} className="bg-card text-foreground" data-testid="lavagna-edit-testo" />
          <div className="flex flex-wrap gap-1">
            {Object.entries(TIPI_LAVAGNA).map(([k, tt]) => <button key={k} type="button" onClick={() => setEdit({ ...edit, tipo: k })} className={`text-[10px] px-2 py-0.5 rounded-full border ${edit.tipo === k ? "bg-foreground text-background" : "bg-card text-foreground border-border"}`} data-testid={`lavagna-edit-tipo-${k}`}>{tt.label}</button>)}
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" onClick={() => setEdit(null)} data-testid="lavagna-edit-annulla"><X className="w-4 h-4" /></Button>
            <Button size="sm" onClick={salvaEdit} disabled={busy} data-testid="lavagna-edit-salva"><Check className="w-4 h-4 mr-1" /> Salva</Button>
          </div>
        </div>
      ) : (
        <p className={`mt-2 text-base whitespace-pre-wrap break-words leading-snug ${m.fatto ? "line-through" : ""}`} data-testid="lavagna-post-testo">{m.testo}</p>
      )}
      <div className="mt-2 flex items-center gap-1 text-[11px] opacity-80">
        <ClipboardList className="w-3 h-3" /> {m.autore}{m.modificato_da && m.modificato_da !== m.autore ? ` · mod. ${m.modificato_da}` : ""}{m.fatto && m.fatto_da ? ` · fatto da ${m.fatto_da}` : ""}
        <span className="ml-auto flex gap-0.5">
          <button type="button" onClick={() => toggleFatto(m)} className="p-1.5 rounded hover:bg-black/10" title={m.fatto ? "Rimetti sulla lavagna" : "Segna come fatto"} data-testid={`lavagna-fatto-${m.id}`}>{m.fatto ? <Undo2 className="w-4 h-4" /> : <Check className="w-4 h-4" />}</button>
          {!inEdit && <button type="button" onClick={() => setEdit({ id: m.id, testo: m.testo, tipo: m.tipo })} className="p-1.5 rounded hover:bg-black/10" title="Modifica" data-testid={`lavagna-modifica-${m.id}`}><Pencil className="w-4 h-4" /></button>}
          <button type="button" onClick={() => elimina(m)} className="p-1.5 rounded hover:bg-black/10" title="Cancella" data-testid={`lavagna-elimina-${m.id}`}><Trash2 className="w-4 h-4" /></button>
        </span>
      </div>
    </div>
  );
}
