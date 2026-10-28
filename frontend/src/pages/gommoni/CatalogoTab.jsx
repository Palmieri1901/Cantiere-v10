import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { api, API } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, FileText, Sparkles, Percent, ClipboardList } from "lucide-react";
import { EMPTY_GOMMONE, fmt } from "./common";
import GommoneDialog from "./GommoneDialog";
import ScontiDialog from "./ScontiDialog";
import ImportAIGommoniDialog from "./ImportAIGommoniDialog";
import DocumentoButton from "./DocumentoButton";
import InviaDocumentazioneDialog from "./InviaDocumentazioneDialog";
import { Send } from "lucide-react";
import { WhatsAppPdfButton } from "@/components/WhatsAppPdfButton";

export default function CatalogoTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [scontiOpen, setScontiOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [inviaDoc, setInviaDoc] = useState(null); // null | { modelloId }

  const load = async () => {
    setLoading(true);
    try { setItems((await api.get("/gommoni/modelli")).data); }
    catch { toast.error("Errore caricamento gommoni"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!await confirmDialog("Eliminare questo gommone?")) return;
    await api.delete(`/gommoni/modelli/${id}`);
    toast.success("Gommone eliminato"); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-end">
        <Button variant="outline" onClick={() => window.open(`${API}/gommoni/listino.pdf?_t=${Date.now()}`, "_blank")} data-testid="btn-pdf-listino-gommoni">
          <FileText className="w-4 h-4 mr-2" /> Listino pubblico
        </Button>
        <WhatsAppPdfButton url="/gommoni/listino.pdf" filename="listino_gommoni_GEB.pdf" size="icon" testId="wa-listino-gommoni" />
        <Button variant="outline" onClick={() => setScontiOpen(true)} className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700" data-testid="btn-listino-cantiere-gommoni">
          <Percent className="w-4 h-4 mr-2" /> Listino cantiere
        </Button>
        <Button variant="outline" onClick={() => window.open(`${API}/gommoni/caratteristiche.pdf?_t=${Date.now()}`, "_blank")} data-testid="btn-pdf-caratt-gommoni">
          <ClipboardList className="w-4 h-4 mr-2" /> PDF Caratteristiche
        </Button>
        <WhatsAppPdfButton url="/gommoni/caratteristiche.pdf" filename="caratteristiche_gommoni_GEB.pdf" size="icon" testId="wa-caratt-gommoni" />
        <Button variant="outline" onClick={() => setInviaDoc({ modelloId: "" })} className="border-emerald-500 text-emerald-700 hover:bg-emerald-50" data-testid="btn-invia-doc-gommoni">
          <Send className="w-4 h-4 mr-2" /> Invia documentazione
        </Button>
        <Button variant="outline" onClick={() => setImportOpen(true)} data-testid="btn-import-gommoni">
          <Sparkles className="w-4 h-4 mr-2" /> Rileva listino con AI
        </Button>
        <Button onClick={() => setEditing({ ...EMPTY_GOMMONE })} className="bg-primary" data-testid="btn-new-gommone">
          <Plus className="w-4 h-4 mr-2" /> Nuovo gommone
        </Button>
      </div>

      <div className="md:hidden space-y-2" data-testid="gommoni-cards-mobile">
        {!loading && items.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nessun gommone.</Card>}
        {!loading && items.map((m) => (
          <Card key={m.id} className="p-3" data-testid={`card-gommone-${m.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-base leading-tight">{m.modello}</div>
                <div className="text-xs text-muted-foreground font-mono-num mt-0.5">
                  {[m.lunghezza_m && `${m.lunghezza_m} m`, m.larghezza_m && `L ${m.larghezza_m} m`, m.diametro_tubolare_cm && `Ø ${m.diametro_tubolare_cm} cm`, m.portata_persone && `${m.portata_persone} pers.`, m.potenza_max_hp && `${m.potenza_max_hp} HP`].filter(Boolean).join(" · ") || "—"}
                </div>
                {m.tessuto && <div className="text-xs text-muted-foreground">{m.tessuto}</div>}
              </div>
              <div className="font-mono-num font-semibold text-primary shrink-0">{fmt(m.prezzo_pubblico)}</div>
            </div>
            <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
              <div className="flex flex-wrap gap-1"><DocumentoButton modello={m} tipo="presentazione" onChanged={load} /><DocumentoButton modello={m} tipo="omologazione" onChanged={load} /></div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(`${API}/gommoni/caratteristiche.pdf?modello_id=${m.id}&_t=${Date.now()}`, "_blank")} data-testid={`m-scheda-gommone-${m.id}`}><FileText className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-700" title="Invia documentazione" onClick={() => setInviaDoc({ modelloId: m.id })} data-testid={`m-invia-doc-${m.id}`}><Send className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...m })} data-testid={`m-edit-gommone-${m.id}`}><Pencil className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(m.id)} data-testid={`m-del-gommone-${m.id}`}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-gommoni">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Modello</th>
                <th className="text-right px-4 py-3">Lungh.</th>
                <th className="text-right px-4 py-3">Largh.</th>
                <th className="text-right px-4 py-3">Ø Tub.</th>
                <th className="text-right px-4 py-3">Persone</th>
                <th className="text-right px-4 py-3">HP max</th>
                <th className="text-left px-4 py-3">Tessuto</th>
                <th className="text-right px-4 py-3">Pubblico</th>
                <th className="text-left px-4 py-3">Documenti PDF</th>
                <th className="text-right px-4 py-3 w-32">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">Caricamento…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">Nessun gommone. Aggiungi manualmente oppure rileva il listino con l'AI.</td></tr>
              ) : items.map((m) => (
                <tr key={m.id} className="border-t border-border/60 hover:bg-muted/30" data-testid={`row-gommone-${m.id}`}>
                  <td className="px-4 py-2.5 font-semibold">{m.modello}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num">{m.lunghezza_m ? `${m.lunghezza_m} m` : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num">{m.larghezza_m ? `${m.larghezza_m} m` : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num">{m.diametro_tubolare_cm ? `${m.diametro_tubolare_cm} cm` : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num">{m.portata_persone || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num">{m.potenza_max_hp || "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{m.tessuto || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num font-semibold text-primary">{fmt(m.prezzo_pubblico)}</td>
                  <td className="px-4 py-2.5"><div className="flex flex-col gap-1"><DocumentoButton modello={m} tipo="presentazione" onChanged={load} /><DocumentoButton modello={m} tipo="omologazione" onChanged={load} /></div></td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Scheda tecnica PDF" onClick={() => window.open(`${API}/gommoni/caratteristiche.pdf?modello_id=${m.id}&_t=${Date.now()}`, "_blank")} data-testid={`btn-scheda-gommone-${m.id}`}><FileText className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-700" title="Invia documentazione" onClick={() => setInviaDoc({ modelloId: m.id })} data-testid={`btn-invia-doc-${m.id}`}><Send className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...m })} data-testid={`btn-edit-gommone-${m.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(m.id)} data-testid={`btn-del-gommone-${m.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <GommoneDialog value={editing} onClose={() => setEditing(null)} onSaved={load} />}
      <ScontiDialog open={scontiOpen} onClose={() => setScontiOpen(false)} />
      <ImportAIGommoniDialog open={importOpen} onClose={() => setImportOpen(false)} onSaved={load} />
      <InviaDocumentazioneDialog open={!!inviaDoc} onClose={() => setInviaDoc(null)} modelli={items} modelloIniziale={inviaDoc?.modelloId || ""} />
    </div>
  );
}
