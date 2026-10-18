import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Plus, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

// Siti di riferimento: indicizzati come schede (sfogliabili offline) e prioritari nella ricerca web
export default function SitiCard() {
  const [siti, setSiti] = useState([]);
  const [url, setUrl] = useState("");
  const [nome, setNome] = useState("");
  const load = () => api.get("/officina/siti").then((r) => setSiti(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!siti.some((s) => s.in_corso)) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [siti]);
  const aggiungi = async () => {
    if (!url.trim()) return;
    try {
      const r = await api.post("/officina/siti", { url: url.trim(), nome: nome.trim(), priorita: siti.length + 1 });
      setUrl(""); setNome(""); toast.success(`Sito aggiunto: ${r.data.dominio}`); await load();
      await api.post(`/officina/siti/${r.data.id}/indicizza`); load();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore"); }
  };
  const indicizza = async (s) => { try { await api.post(`/officina/siti/${s.id}/indicizza`); toast.success("Indicizzazione avviata"); load(); } catch (e) { toast.error(e.response?.data?.detail || "Errore"); } };
  const elimina = async (s) => {
    if (!(await confirmDialog(`Rimuovere ${s.nome} e le ${s.pagine} pagine indicizzate?`, { title: "Rimuovi sito" }))) return;
    await api.delete(`/officina/siti/${s.id}`); load();
  };
  const sposta = async (i, dir) => {
    const arr = [...siti]; const j = i + dir; if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    await Promise.all(arr.map((s, k) => api.put(`/officina/siti/${s.id}`, { url: s.url, nome: s.nome, priorita: k + 1, max_pagine: s.max_pagine })));
    load();
  };
  return (
    <Card className="p-5 space-y-3" data-testid="siti-card">
      <div className="flex items-center gap-2 font-medium"><Link2 className="w-4 h-4 text-primary" /> Siti di riferimento</div>
      <p className="text-sm text-muted-foreground">Le pagine dei siti che aggiungi vengono lette e indicizzate: l'assistente le consulta come schede (anche senza ricerca web) e, quando il web è attivo, le cerca per prime in ordine di priorità.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="www.mistermarine.it" className="flex-1" data-testid="input-sito-url" />
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (facoltativo)" className="sm:w-48" data-testid="input-sito-nome" />
        <Button onClick={aggiungi} disabled={!url.trim()} data-testid="btn-aggiungi-sito"><Plus className="w-4 h-4 mr-1" /> Aggiungi e indicizza</Button>
      </div>
      <div className="space-y-2">
        {siti.map((s, i) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm" data-testid={`sito-${s.id}`}>
            <Badge variant="outline" className="font-mono-num">#{i + 1}</Badge>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{s.nome} <a href={s.url} target="_blank" rel="noreferrer" className="text-muted-foreground font-normal inline-flex items-center gap-0.5 ml-1">{s.dominio} <ExternalLink className="w-3 h-3" /></a></div>
              <div className={`text-xs ${s.in_corso ? "text-amber-700" : s.stato?.startsWith("errore") ? "text-destructive" : "text-muted-foreground"}`} data-testid={`sito-stato-${s.id}`}>{s.stato}{s.in_corso ? ` · ${s.pagine} pagine finora` : ""}{s.ultimo_indicizzato ? ` · ${new Date(s.ultimo_indicizzato).toLocaleDateString("it-IT")}` : ""}</div>
            </div>
            <div className="flex items-center gap-0.5">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => sposta(i, -1)} disabled={i === 0} data-testid={`sito-su-${s.id}`} title="Priorità più alta">↑</Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => sposta(i, 1)} disabled={i === siti.length - 1} data-testid={`sito-giu-${s.id}`} title="Priorità più bassa">↓</Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => indicizza(s)} disabled={s.in_corso} data-testid={`sito-indicizza-${s.id}`} title="Rileggi il sito"><RefreshCw className={`w-4 h-4 ${s.in_corso ? "animate-spin" : ""}`} /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => elimina(s)} data-testid={`sito-elimina-${s.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
        {siti.length === 0 && <p className="text-xs text-muted-foreground">Nessun sito: aggiungi ad esempio www.mistermarine.it</p>}
      </div>
    </Card>
  );
}
