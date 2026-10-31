import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/lib/api";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { appDipendentiUrl } from "@/lib/appHost";
import { Plus, KeyRound, Trash2, Power, Copy, ExternalLink, SlidersHorizontal } from "lucide-react";
import { FunzioniDialog, FUNZIONI_APP } from "@/pages/dipendenti/FunzioniDialog";

const APP_URL = appDipendentiUrl();

export default function DipendentiTab() {
  const [list, setList] = useState([]);
  const [nome, setNome] = useState("");
  const [chiave, setChiave] = useState(null); // {nome, chiave}

  const load = () => api.get("/dipendenti").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!nome.trim()) return toast.error("Inserisci il nome");
    const r = await api.post("/dipendenti", { nome });
    setNome(""); load();
    setChiave({ nome: r.data.nome, chiave: r.data.chiave });
  };
  const rigenera = async (d) => {
    if (!await confirmDialog(`Rigenerare la chiave di ${d.nome}? Quella attuale smetterà di funzionare.`)) return;
    const r = await api.post(`/dipendenti/${d.id}/rigenera-chiave`);
    load(); setChiave({ nome: d.nome, chiave: r.data.chiave });
  };
  const toggle = async (d) => { await api.put(`/dipendenti/${d.id}`, { nome: d.nome, attivo: !d.attivo }); load(); };
  const [funzDip, setFunzDip] = useState(null);
  const del = async (d) => {
    if (!await confirmDialog(`Eliminare il dipendente ${d.nome}?`)) return;
    await api.delete(`/dipendenti/${d.id}`); load();
  };

  return (
    <div className="space-y-6" data-testid="dipendenti-tab">
      <Card className="p-5">
        <div className="label-mini mb-2">Nuovo dipendente</div>
        <div className="flex gap-2 max-w-md">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome e cognome" onKeyDown={(e) => e.key === "Enter" && add()} data-testid="input-dip-nome" />
          <Button onClick={add} className="bg-primary hover:bg-primary/90" data-testid="btn-add-dipendente"><Plus className="w-4 h-4 mr-1" /> Aggiungi</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Ogni dipendente riceve una chiave personale: la inserisce (o scansiona il QR) nell'app all'indirizzo{" "}
          <a href={APP_URL} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1" data-testid="link-app-dipendente">{APP_URL} <ExternalLink className="w-3 h-3" /></a>
        </p>
      </Card>

      {list.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">Nessun dipendente registrato.</div>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border">
          {list.map((d) => (
            <div key={d.id} className="p-3 flex items-center gap-3 hover:bg-muted/40" data-testid={`dip-row-${d.id}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm flex items-center gap-2">{d.nome}
                  <Badge variant="outline" className={`text-[10px] ${d.attivo ? "text-emerald-700 border-emerald-300" : "text-muted-foreground"}`}>{d.attivo ? "Attivo" : "Disattivato"}</Badge>
                </div>
                <div className="text-xs text-muted-foreground font-mono">Chiave ····{d.key_hint} {d.ultimo_accesso ? `· ultimo accesso ${new Date(d.ultimo_accesso).toLocaleString("it-IT")}` : "· mai connesso"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5" data-testid={`dip-funzioni-${d.id}`}>
                  {d.funzioni == null || d.funzioni.length === FUNZIONI_APP.length ? "Tutte le funzioni" : d.funzioni.length === 0 ? "Nessuna funzione (solo invio)" : `Funzioni: ${FUNZIONI_APP.filter(([id]) => d.funzioni.includes(id)).map(([, t]) => t).join(", ")}`}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setFunzDip(d)} data-testid={`btn-funzioni-${d.id}`}><SlidersHorizontal className="w-3.5 h-3.5 mr-1" /> Funzioni</Button>
              <Button size="sm" variant="outline" onClick={() => rigenera(d)} data-testid={`btn-rigenera-${d.id}`}><KeyRound className="w-3.5 h-3.5 mr-1" /> Nuova chiave</Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggle(d)} title={d.attivo ? "Disattiva" : "Attiva"} data-testid={`btn-toggle-${d.id}`}><Power className="w-3.5 h-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => del(d)} data-testid={`btn-del-dip-${d.id}`}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}

      {funzDip && <FunzioniDialog dip={funzDip} onClose={() => setFunzDip(null)} onSaved={() => { setFunzDip(null); load(); }} />}
      <Dialog open={!!chiave} onOpenChange={(o) => !o && setChiave(null)}>
        <DialogContent className="max-w-md" data-testid="chiave-dialog">
          <DialogHeader>
            <DialogTitle>Chiave per {chiave?.nome}</DialogTitle>
            <DialogDescription>Mostrala una sola volta: il dipendente scansiona il QR dall'app oppure digita il codice.</DialogDescription>
          </DialogHeader>
          {chiave && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="p-3 bg-white rounded-md border">
                <QRCodeSVG value={JSON.stringify({ t: "pm-key", u: process.env.REACT_APP_APP_DIPENDENTI_HOST ? `https://${process.env.REACT_APP_APP_DIPENDENTI_HOST}` : process.env.REACT_APP_BACKEND_URL, k: chiave.chiave, n: chiave.nome })} size={200} />
              </div>
              <div className="font-mono text-xl tracking-wider font-semibold" data-testid="chiave-testo">{chiave.chiave}</div>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(chiave.chiave); toast.success("Chiave copiata"); }} data-testid="btn-copia-chiave"><Copy className="w-3.5 h-3.5 mr-1" /> Copia</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
