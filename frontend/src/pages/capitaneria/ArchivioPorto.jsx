import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Pencil, Copy, Trash2, Send, Plus, CheckCircle2, Clock } from "lucide-react";

const fmt = (s) => (s ? s.split("-").reverse().join("/") : "—");

function StatoInvio({ c }) {
  return c.inviata_at
    ? <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1" data-testid={`cap-stato-${c.id}`}><CheckCircle2 className="w-3 h-3" /> Inviata {fmt(c.inviata_at.slice(0, 10))}</Badge>
    : <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50 gap-1" data-testid={`cap-stato-${c.id}`}><Clock className="w-3 h-3" /> Da inviare</Badge>;
}

function Azioni({ c, onPdf, onInvia, onApri, onDuplica, onElimina }) {
  return (
    <div className="flex justify-end gap-1 flex-wrap">
      <Button size="icon" variant="ghost" title="PDF" onClick={() => onPdf(c)} data-testid={`cap-pdf-${c.id}`}><FileText className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" title="Invia email" onClick={() => onInvia(c)} data-testid={`cap-invia-${c.id}`}><Send className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" title="Modifica" onClick={() => onApri(c)} data-testid={`cap-modifica-${c.id}`}><Pencil className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" title="Duplica" onClick={() => onDuplica(c)} data-testid={`cap-duplica-${c.id}`}><Copy className="w-4 h-4" /></Button>
      <Button size="icon" variant="ghost" title="Elimina" className="text-destructive" onClick={() => onElimina(c)} data-testid={`cap-elimina-${c.id}`}><Trash2 className="w-4 h-4" /></Button>
    </div>
  );
}

function CardMobile({ c, ...h }) {
  return (
    <div className={`rounded-md border p-3 space-y-2 ${c.inviata_at ? "border-emerald-200 bg-emerald-50/40" : "border-amber-300 bg-amber-50/40"}`} data-testid={`cap-card-${c.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold font-mono-num">{fmt(c.data_operazione)} <span className="text-muted-foreground font-normal">{c.ora_operazione || ""}</span></div>
          <div className="text-sm">{c.unita_nome || "—"} <span className="text-muted-foreground">· {c.unita_lunghezza ? `${String(c.unita_lunghezza).replace(".", ",")} mt` : ""}</span></div>
        </div>
        <StatoInvio c={c} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div>{c.alaggio && <Badge variant="secondary" className="mr-1">Alaggio</Badge>}{c.varo && <Badge variant="secondary">Varo</Badge>}</div>
        {!c.inviata_at && <Button size="sm" onClick={() => h.onInvia(c)} data-testid={`cap-invia-mobile-${c.id}`}><Send className="w-3.5 h-3.5 mr-1.5" /> Invia email</Button>}
      </div>
      <Azioni c={c} {...h} />
    </div>
  );
}

export default function ArchivioPorto({ porto, nome, lista, onNuova, onApri, onPdf, onDuplica, onElimina, onInvia }) {
  return (
    <div className="space-y-4" data-testid={`cap-archivio-${porto.replace(/_/g, "-")}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-display text-xl font-semibold">{nome}</div>
          <div className="text-sm text-muted-foreground">{lista.length} comunicazioni · {lista.filter((c) => !c.inviata_at).length} da inviare</div>
        </div>
        <Button onClick={() => onNuova(porto)} data-testid={`cap-nuova-${porto.replace(/_/g, "-")}`}><Plus className="w-4 h-4 mr-2" /> Nuova comunicazione</Button>
      </div>
      {lista.length === 0 ? (
        <div className="p-8 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">Nessuna comunicazione per questo porto.</div>
      ) : (
        <>
        <div className="md:hidden space-y-3">
          {lista.map((c) => <CardMobile key={c.id} c={c} onPdf={onPdf} onInvia={onInvia} onApri={onApri} onDuplica={onDuplica} onElimina={onElimina} />)}
        </div>
        <div className="hidden md:block rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Ora</th>
                <th className="text-left px-3 py-2">Operazione</th>
                <th className="text-left px-3 py-2">Unità</th>
                <th className="text-left px-3 py-2">Lungh.</th>
                <th className="text-left px-3 py-2">Invio</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30" data-testid={`cap-riga-${c.id}`}>
                  <td className="px-3 py-2 font-mono-num">{fmt(c.data_operazione)}</td>
                  <td className="px-3 py-2">{c.ora_operazione || "—"}</td>
                  <td className="px-3 py-2">
                    {c.alaggio && <Badge variant="secondary" className="mr-1">Alaggio</Badge>}
                    {c.varo && <Badge variant="secondary">Varo</Badge>}
                  </td>
                  <td className="px-3 py-2">{c.unita_nome || "—"}<span className="text-muted-foreground"> · {c.uso === "pesca" ? "pesca" : "diporto"} · {c.tipo_unita}</span></td>
                  <td className="px-3 py-2">{c.unita_lunghezza ? `${String(c.unita_lunghezza).replace(".", ",")} mt` : "—"}</td>
                  <td className="px-3 py-2"><StatoInvio c={c} /></td>
                  <td className="px-3 py-2"><Azioni c={c} onPdf={onPdf} onInvia={onInvia} onApri={onApri} onDuplica={onDuplica} onElimina={onElimina} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
