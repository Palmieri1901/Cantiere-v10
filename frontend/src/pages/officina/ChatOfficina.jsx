import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Mic, MicOff, Send, Wrench, Globe, BookmarkPlus, Trash2, FileText, Lightbulb, Volume2, Hash } from "lucide-react";
import { useVoce } from "@/components/hall/useVoce";
import { uid } from "@/lib/mobileStore";
import SalvaCasoDialog from "@/pages/officina/SalvaCasoDialog";

const SESSION_KEY = "officina_session";
const getSession = () => { let s = localStorage.getItem(SESSION_KEY); if (!s) { s = uid(); localStorage.setItem(SESSION_KEY, s); } return s; };

// Chat dell'assistente officina. `client` è un'istanza axios (api o mobileApi) con base già puntata al prefisso giusto.
export default function ChatOfficina({ client, basePath = "/officina", compact = false, autore = "" }) {
  const [msgs, setMsgs] = useState([]);
  const [testo, setTesto] = useState("");
  const [busy, setBusy] = useState(false);
  const [web, setWeb] = useState(false);
  const [webOk, setWebOk] = useState(false);
  const [voceRisposta, setVoceRisposta] = useState(false);
  const [salva, setSalva] = useState(null);
  const [session, setSession] = useState(getSession);
  const [modelli, setModelli] = useState([]);
  const [filtro, setFiltro] = useState(""); // "marca|modello"
  const fine = useRef(null);

  useEffect(() => {
    client.get(`${basePath}/chat/${session}`).then((r) => setMsgs(r.data || [])).catch(() => {});
    client.get(`${basePath}/config`).then((r) => { setWebOk(!!r.data.tavily_configurata); setWeb(!!r.data.web_default && !!r.data.tavily_configurata); }).catch(() => {});
    client.get(`${basePath}/modelli`).then((r) => setModelli(r.data || [])).catch(() => {});
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fine.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const invia = async (t) => {
    const m = (t ?? testo).trim();
    if (!m || busy) return;
    setTesto(""); setBusy(true);
    setMsgs((s) => [...s, { id: uid(), ruolo: "utente", testo: m }]);
    try {
      const [marca, modello] = filtro ? filtro.split("|") : ["", ""];
      const r = await client.post(`${basePath}/chat`, { messaggio: m, session_id: session, web, marca, modello });
      setMsgs((s) => [...s, { id: uid(), ruolo: "assistente", testo: r.data.risposta, fonti: r.data.fonti, web_usato: r.data.web_usato, domanda: m }]);
      if (voceRisposta) parla(r.data.risposta.replace(/[*#\[\]]/g, "").slice(0, 600));
    } catch (e) {
      toast.error(e.response?.data?.detail || "Risposta non disponibile");
    } finally { setBusy(false); }
  };
  const { supportato, ascolto, parziale, avvia, stop, parla, sbloccaAudio } = useVoce({ onFinal: (t) => invia(t), onErrore: (m) => toast.error(m) });

  const nuova = () => { const s = uid(); localStorage.setItem(SESSION_KEY, s); setSession(s); setMsgs([]); };

  return (
    <div className={`flex flex-col ${compact ? "h-[calc(100vh-11rem)]" : "h-[calc(100vh-14rem)] min-h-[480px]"}`} data-testid="chat-officina">
      <div className="flex flex-wrap items-center gap-3 pb-3 border-b border-border/60">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-xs max-w-[220px]" title="Limita le risposte alle schede di un modello" data-testid="select-modello">
          <option value="">Tutti i modelli ({modelli.reduce((s, m) => s + m.n, 0)} schede)</option>
          {[...new Set(modelli.map((m) => m.marca).filter(Boolean))].map((ma) => <option key={`m|${ma}`} value={`${ma}|`}>{ma} · tutti</option>)}
          {modelli.filter((m) => m.modello).map((m) => <option key={`${m.marca}|${m.modello}`} value={`${m.marca}|${m.modello}`}>{[m.marca, m.modello].filter(Boolean).join(" ")} ({m.n})</option>)}
        </select>
        <label className={`flex items-center gap-2 text-xs ${webOk ? "" : "opacity-50"}`} title={webOk ? "" : "Imposta la chiave Tavily nelle impostazioni"}>
          <Switch checked={web} onCheckedChange={setWeb} disabled={!webOk} data-testid="switch-web" /> <Globe className="w-3.5 h-3.5" /> Consulta anche il web
        </label>
        <label className="flex items-center gap-2 text-xs"><Switch checked={voceRisposta} onCheckedChange={(v) => { if (v) sbloccaAudio(); setVoceRisposta(v); }} data-testid="switch-voce" /> <Volume2 className="w-3.5 h-3.5" /> Leggi le risposte</label>
        <Button size="sm" variant="ghost" onClick={nuova} className="ml-auto text-xs" data-testid="btn-nuova-conversazione"><Trash2 className="w-3.5 h-3.5 mr-1" /> Nuova conversazione</Button>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {!msgs.length && (
          <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground" data-testid="chat-vuota">
            <div className="flex items-center gap-2 font-medium text-foreground mb-2"><Wrench className="w-4 h-4 text-primary" /> Chiedi all'assistente officina</div>
            Scrivi o detta un codice errore (es. <b>"Suzuki DF140 codice C-04"</b>), un sintomo (<b>"motore perde giri a caldo"</b>) o un valore tecnico. Risponde solo in base alle schede caricate e ai casi risolti.
            <div className="flex flex-wrap gap-1.5 mt-3">
              {["Cosa significa il codice C-04?", "Fuoribordo non va in moto ma gira: cause?", "Coppia di serraggio candele"].map((e) => <button key={e} onClick={() => invia(e)} className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-muted" data-testid="chat-esempio">{e}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={m.id || i} className={`flex ${m.ruolo === "utente" ? "justify-end" : "justify-start"}`} data-testid={`chat-msg-${m.ruolo}`}>
            <div className={`max-w-[92%] sm:max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${m.ruolo === "utente" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"}`}>
              {m.ruolo === "assistente" ? <Markdownish text={m.testo} /> : m.testo}
              {m.ruolo === "assistente" && (
                <div className="mt-3 pt-2 border-t border-border/60 flex flex-wrap items-center gap-1.5">
                  {(m.fonti || []).slice(0, 6).map((f, j) => (
                    <span key={j} className="inline-flex items-center gap-1 text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground" data-testid="chat-fonte">
                      {f.tipo === "scheda" ? <FileText className="w-3 h-3" /> : f.tipo === "caso" ? <Lightbulb className="w-3 h-3" /> : f.tipo === "codice" ? <Hash className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                      {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="underline">{f.titolo}</a> : f.titolo}
                    </span>
                  ))}
                  <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => setSalva({ sintomo: m.domanda || "", diagnosi: m.testo.slice(0, 1500) })} data-testid="btn-salva-caso"><BookmarkPlus className="w-3.5 h-3.5 mr-1" /> Salva come caso risolto</Button>
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-muted-foreground animate-pulse pl-1" data-testid="chat-attesa">L'assistente sta consultando le schede…</div>}
        <div ref={fine} />
      </div>

      <div className="pt-3 border-t border-border/60">
        {ascolto && <div className="text-xs text-primary mb-1 animate-pulse" data-testid="chat-ascolto">Sto ascoltando… {parziale}</div>}
        <div className="flex items-end gap-2">
          <Textarea value={testo} onChange={(e) => setTesto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); invia(); } }} placeholder="Scrivi la domanda o il codice errore…" rows={compact ? 2 : 2} className="resize-none" data-testid="chat-input" />
          {supportato && <Button size="icon" variant={ascolto ? "default" : "outline"} onClick={() => { sbloccaAudio(); ascolto ? stop() : avvia(); }} className="h-11 w-11 shrink-0" title="Detta la domanda" data-testid="btn-microfono">{ascolto ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}</Button>}
          <Button onClick={() => invia()} disabled={busy || !testo.trim()} className="h-11 shrink-0 bg-primary hover:bg-primary/90" data-testid="btn-invia"><Send className="w-4 h-4" /></Button>
        </div>
      </div>

      <SalvaCasoDialog dati={salva} onClose={() => setSalva(null)} client={client} basePath={basePath} autore={autore} />
    </div>
  );
}

function Markdownish({ text }) {
  const righe = String(text || "").split("\n");
  return (
    <div className="space-y-1">
      {righe.map((r, i) => {
        const bold = r.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/^#+\s*/, "");
        const li = /^\s*[-*•]\s+/.test(r);
        return <div key={i} className={li ? "pl-4 relative before:content-['•'] before:absolute before:left-0" : ""} dangerouslySetInnerHTML={{ __html: li ? bold.replace(/^\s*[-*•]\s+/, "") : bold }} />;
      })}
    </div>
  );
}
