import { useEffect, useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, FileText, Tag, Search } from "lucide-react";
import { PdfPreviewOverlay } from "@/components/PdfPreviewOverlay";
import { EMPTY_DDT, destToText, openBlob } from "./common";
import DdtDialog from "./DdtDialog";

export default function DdtTab({ indirizzi, onReloadRubrica }) {
  const [anni, setAnni] = useState([new Date().getFullYear()]);
  const [anno, setAnno] = useState(new Date().getFullYear());
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewName, setPreviewName] = useState("ddt.pdf");

  const load = async () => {
    try {
      const [ra, rd] = await Promise.all([api.get("/ddt/anni"), api.get("/ddt", { params: { anno, ...(q ? { q } : {}) } })]);
      setAnni(ra.data); setItems(rd.data);
    } catch { toast.error("Errore caricamento DDT"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [anno, q]);

  const open = async (d, kind) => {
    try {
      setPreviewName(kind === "ddt" ? `DDT_${d.numero}_${d.anno}.pdf` : `Foglio_destinazione_DDT_${d.numero}_${d.anno}.pdf`);
      await openBlob(api, "get", kind === "ddt" ? `/ddt/${d.id}/pdf` : `/ddt/${d.id}/foglio-destinazione.pdf`, null, setPreviewUrl, setPreviewOpen);
    } catch (e) { toast.error(e.response?.data?.detail || "Errore PDF"); }
  };
  const remove = async (id) => {
    if (!await confirmDialog("Eliminare questo DDT?")) return;
    await api.delete(`/ddt/${id}`); toast.success("DDT eliminato"); load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Anno</span>
          <select className="h-9 rounded-md border border-input bg-background px-3 text-sm font-mono-num" value={anno} onChange={(e) => setAnno(Number(e.target.value))} data-testid="ddt-anno-filter">
            {anni.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[220px] relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Cerca per cessionario…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="ddt-search" />
        </div>
        <Button onClick={() => setEditing({ ...EMPTY_DDT, anno, righe: [{ quantita: 1, descrizione: "", prezzo_unitario: 0 }] })} className="bg-primary" data-testid="btn-new-ddt"><Plus className="w-4 h-4 mr-2" /> Nuovo DDT</Button>
      </div>

      <div className="md:hidden space-y-2" data-testid="ddt-cards-mobile">
        {items.length === 0 && <Card className="p-8 text-center text-muted-foreground">Nessun DDT per il {anno}.</Card>}
        {items.map((d) => (
          <Card key={d.id} className="p-3" data-testid={`card-ddt-${d.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono font-semibold">DDT {d.numero}/{d.anno} <span className="text-muted-foreground font-sans font-normal text-xs">· {d.data}</span></div>
                <div className="font-semibold leading-tight mt-0.5">{d.cessionario?.nome}</div>
                <div className="text-xs text-muted-foreground">{destToText({ ...d.cessionario, nome: "" })}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Dest.: {d.destinazione_idem ? "Idem" : destToText(d.destinazione)}</div>
                <div className="text-xs mt-0.5">{d.causale || "—"} · {d.righe?.length || 0} righe</div>
              </div>
            </div>
            <div className="flex justify-end gap-1 mt-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => open(d, "ddt")} data-testid={`m-pdf-ddt-${d.id}`}><FileText className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => open(d, "foglio")} data-testid={`m-foglio-ddt-${d.id}`}><Tag className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...d })} data-testid={`m-edit-ddt-${d.id}`}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(d.id)} data-testid={`m-del-ddt-${d.id}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-ddt">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left px-4 py-3">N°</th><th className="text-left px-4 py-3">Data</th><th className="text-left px-4 py-3">Cessionario</th><th className="text-left px-4 py-3">Destinazione</th><th className="text-left px-4 py-3">Causale</th><th className="text-right px-4 py-3">Righe</th><th className="w-40"></th></tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Nessun DDT per il {anno}.</td></tr>
              ) : items.map((d) => (
                <tr key={d.id} className="border-t border-border/60 hover:bg-muted/30" data-testid={`row-ddt-${d.id}`}>
                  <td className="px-4 py-2.5 font-mono font-semibold">{d.numero}/{d.anno}</td>
                  <td className="px-4 py-2.5">{d.data}</td>
                  <td className="px-4 py-2.5"><div className="font-semibold">{d.cessionario?.nome}</div><div className="text-xs text-muted-foreground">{destToText({ ...d.cessionario, nome: "" })}</div></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{d.destinazione_idem ? "Idem" : destToText(d.destinazione)}</td>
                  <td className="px-4 py-2.5 text-xs">{d.causale || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono-num">{d.righe?.length || 0}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="PDF DDT" onClick={() => open(d, "ddt")} data-testid={`btn-pdf-ddt-${d.id}`}><FileText className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" title="Foglio di destinazione" onClick={() => open(d, "foglio")} data-testid={`btn-foglio-ddt-${d.id}`}><Tag className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...d })} data-testid={`btn-edit-ddt-${d.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(d.id)} data-testid={`btn-del-ddt-${d.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && <DdtDialog value={editing} indirizzi={indirizzi} onReloadRubrica={onReloadRubrica} onClose={() => setEditing(null)} onSaved={load} />}
      <PdfPreviewOverlay open={previewOpen} onClose={() => setPreviewOpen(false)} url={previewUrl} filename={previewName} />
    </div>
  );
}
