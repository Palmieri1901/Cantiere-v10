import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, MessageCircle, Mail, FileText } from "lucide-react";
import { AnagraficaSuggerimenti } from "@/components/AnagraficaSuggerimenti";

export default function InviaDocumentazioneDialog({ open, onClose, modelli, modelloIniziale }) {
  const [mid, setMid] = useState(modelloIniziale || "");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [nome, setNome] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setMid(modelloIniziale || modelli[0]?.id || ""); setEmail(""); setTelefono(""); setNome(""); setMessaggio(""); } }, [open, modelloIniziale, modelli]);
  useEffect(() => {
    if (!open || !mid) { setInfo(null); return; }
    api.get(`/gommoni/modelli/${mid}/documentazione`).then((r) => setInfo(r.data)).catch(() => setInfo(null));
  }, [open, mid]);

  const daAnagrafica = (a) => {
    setNome(a.ragione_sociale || `${a.cognome || ""} ${a.nome || ""}`.trim());
    if (a.email) setEmail(a.email);
    if (a.cellulare || a.telefono) setTelefono(a.cellulare || a.telefono);
  };

  const condividiFile = async (links, testo) => {
    if (!navigator.share || !navigator.canShare) return false;
    const files = [];
    for (const l of links) {
      const blob = await fetch(l.url).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      if (blob) files.push(new File([blob], l.url.split("/").pop(), { type: blob.type || (l.video ? "video/mp4" : "application/pdf") }));
    }
    if (!files.length || !navigator.canShare({ files })) return false;
    try { await navigator.share({ files, text: testo }); return true; } catch (e) { return e?.name === "AbortError"; }
  };

  const invia = async (canale) => {
    if (!mid) return;
    const body = { messaggio, email: canale !== "whatsapp" ? email : "", telefono: canale !== "email" ? telefono : "" };
    if (canale !== "whatsapp" && !email.trim()) { toast.error("Inserisci l'email del destinatario"); return; }
    if (canale !== "email" && !telefono.trim()) { toast.error("Inserisci il numero WhatsApp"); return; }
    setBusy(true);
    try {
      const r = await api.post(`/gommoni/modelli/${mid}/invia-documentazione`, body);
      if (r.data.email_inviata) toast.success(`Email inviata a ${email} con PDF e video in allegato`);
      if (r.data.whatsapp_url) {
        toast.info("Preparo i file da condividere…");
        const ok = await condividiFile(r.data.links, r.data.testo);
        if (!ok) { toast.warning("Condivisione file non disponibile su questo dispositivo: invio i link"); window.open(r.data.whatsapp_url, "_blank"); }
      }
      if (canale === "email") onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Invio non riuscito"); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" data-testid="dialog-invia-doc">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><Send className="w-5 h-5 text-primary" /> Invia documentazione</DialogTitle>
          <DialogDescription>Scheda tecnica, listino prezzi pubblico, lista accessori, catalogo, Real (video) e omologazione del modello inviati come file (PDF e video) via email o WhatsApp.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modello</Label>
            <Select value={mid} onValueChange={setMid}>
              <SelectTrigger data-testid="invia-doc-modello"><SelectValue placeholder="Scegli il modello" /></SelectTrigger>
              <SelectContent>{modelli.map((m) => <SelectItem key={m.id} value={m.id}>{m.modello}</SelectItem>)}</SelectContent>
            </Select>
            {info && (
              <div className="flex flex-wrap gap-1.5 pt-1" data-testid="invia-doc-links">
                {info.links.map((l) => <a key={l.tipo} href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border border-border hover:bg-muted"><FileText className="w-3 h-3" /> {l.label}</a>)}
                {!info.links.some((l) => l.tipo === "presentazione" || l.tipo === "catalogo") && <span className="text-[11px] text-muted-foreground">Carica Real, Catalogo o Omologazione dal catalogo per includerli.</span>}
              </div>
            )}
          </div>
          <div className="space-y-1.5 relative">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destinatario (cerca in anagrafica)</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome cliente…" data-testid="invia-doc-nome" />
            <AnagraficaSuggerimenti query={nome} onPick={daAnagrafica} testId="ana-sugg-invia-doc" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@email.it" data-testid="invia-doc-email" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">WhatsApp</Label><Input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+39 333 1234567" data-testid="invia-doc-telefono" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Messaggio (facoltativo)</Label><Textarea rows={2} value={messaggio} onChange={(e) => setMessaggio(e.target.value)} placeholder="Buongiorno, in allegato la documentazione del gommone…" data-testid="invia-doc-messaggio" /></div>
        </div>
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
          <Button variant="outline" className="border-emerald-500 text-emerald-700 hover:bg-emerald-50" disabled={busy || !mid} onClick={() => invia("whatsapp")} data-testid="invia-doc-whatsapp"><MessageCircle className="w-4 h-4 mr-1" /> WhatsApp</Button>
          <Button className="bg-primary hover:bg-primary/90" disabled={busy || !mid} onClick={() => invia("email")} data-testid="invia-doc-email-btn"><Mail className="w-4 h-4 mr-1" /> {busy ? "Invio…" : "Invia email"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
