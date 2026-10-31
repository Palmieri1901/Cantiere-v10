import { useEffect, useState } from "react";
import { mobileApi } from "@/lib/mobileStore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppPdfButton } from "@/components/WhatsAppPdfButton";
import { Truck, FileText, Loader2, Search } from "lucide-react";
import DestinatarioFields from "@/pages/ddt/DestinatarioFields";

const vuoto = { nome: "", indirizzo: "", cap: "", citta: "", provincia: "", telefono: "" };

// Foglio di destinazione (etichetta/accompagnamento) dall'app dipendenti: scegli dalla rubrica o compila, PDF e WhatsApp
export default function DdtDestinazioneMobile() {
  const api = mobileApi();
  const [rubrica, setRubrica] = useState([]);
  const [q, setQ] = useState("");
  const [dest, setDest] = useState(vuoto);
  const [righe, setRighe] = useState("");
  const [note, setNote] = useState("");
  const [colli, setColli] = useState(1);
  const [busy, setBusy] = useState(false);
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => { mobileApi().get("/ddt/indirizzi").then((r) => setRubrica(r.data || [])).catch(() => {}); }, []);
  const trovati = q.trim().length >= 2 ? rubrica.filter((r) => `${r.nome} ${r.citta}`.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const scegli = (r) => { setDest({ nome: r.nome, indirizzo: r.indirizzo || "", cap: r.cap || "", citta: r.citta || "", provincia: r.provincia || "", telefono: r.telefono || "" }); setQ(""); setBlobUrl(""); };

  const payload = () => ({
    cessionario: dest, destinazione_idem: true, destinazione: dest, colli: Number(colli) || 1, note_destinazione: note,
    righe: righe.split("\n").map((s) => s.trim()).filter(Boolean).map((descrizione) => ({ quantita: 1, descrizione, prezzo_unitario: 0 })),
  });
  const genera = async () => {
    if (!dest.nome.trim()) { toast.error("Indica il destinatario"); return; }
    setBusy(true);
    try {
      const r = await api.post("/ddt/foglio-destinazione.pdf", payload(), { responseType: "blob", timeout: 60000 });
      const u = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      setBlobUrl(u); window.open(u, "_blank");
    } catch (e) { toast.error("Impossibile generare il foglio: sei online?"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="ddt-mobile">
      <div>
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2"><Truck className="w-6 h-6 text-primary" /> Foglio destinazione</h2>
        <p className="text-xs text-muted-foreground">Etichetta di destinazione per spedizioni e consegne. Niente prezzi.</p>
      </div>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca in rubrica (nome o città)…" className="pl-9 h-11" data-testid="ddt-mobile-cerca" />
        {trovati.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border bg-card shadow divide-y" data-testid="ddt-mobile-risultati">
            {trovati.map((r) => <button key={r.id} onClick={() => scegli(r)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted" data-testid={`ddt-mobile-rubrica-${r.id}`}>{r.nome}<span className="text-xs text-muted-foreground"> · {[r.citta, r.provincia].filter(Boolean).join(" ")}</span></button>)}
          </div>
        )}
      </div>
      <DestinatarioFields value={dest} onChange={(v) => { setDest(v); setBlobUrl(""); }} prefix="ddt-mobile-dest" />
      <div className="grid grid-cols-3 gap-2 items-end">
        <div className="col-span-2 space-y-1"><div className="label-mini">Contenuto (una riga per articolo)</div><Textarea value={righe} onChange={(e) => setRighe(e.target.value)} rows={3} placeholder="es. Motore DF40 in riparazione" data-testid="ddt-mobile-righe" /></div>
        <div className="space-y-1"><div className="label-mini">Colli</div><Input type="number" min="1" value={colli} onChange={(e) => setColli(e.target.value)} className="font-mono-num" data-testid="ddt-mobile-colli" /></div>
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note per la destinazione (orari, referente…)" data-testid="ddt-mobile-note" />
      <div className="flex gap-2">
        <Button className="flex-1 h-11" onClick={genera} disabled={busy} data-testid="ddt-mobile-genera">{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} Genera PDF</Button>
        {blobUrl && <WhatsAppPdfButton url={blobUrl} filename={`Foglio_destinazione_${dest.nome.replace(/\s+/g, "_")}.pdf`} testo={`Foglio destinazione ${dest.nome} – Cantiere GEB nautica`} client={api} uploadPath="/condividi/pdf" className="h-11" testId="ddt-mobile-wa" />}
      </div>
    </div>
  );
}
