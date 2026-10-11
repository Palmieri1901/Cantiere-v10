import { useState } from "react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { EMPTY_INDIRIZZO, Field } from "./common";
import DestinatarioFields from "./DestinatarioFields";

function IndirizzoDialog({ value, onClose, onSaved }) {
  const [form, setForm] = useState(value);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!form.nome?.trim()) { toast.error("Nome obbligatorio"); return; }
    setSaving(true);
    try {
      if (form.id) await api.put(`/ddt/indirizzi/${form.id}`, form);
      else await api.post("/ddt/indirizzi", form);
      toast.success("Indirizzo salvato"); onSaved(); onClose();
    } catch (e) { toast.error(e.response?.data?.detail || "Errore salvataggio"); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-full" data-testid="dialog-indirizzo">
        <DialogHeader><DialogTitle>{form.id ? "Modifica indirizzo" : "Nuovo indirizzo"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <DestinatarioFields value={form} onChange={(v) => setForm((f) => ({ ...f, ...v }))} prefix="rub" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Codice cliente"><Input value={form.codice_cliente || ""} onChange={(e) => setForm((f) => ({ ...f, codice_cliente: e.target.value }))} /></Field>
            <Field label="Note"><Input value={form.note || ""} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} /></Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={save} disabled={saving} className="bg-primary" data-testid="btn-save-indirizzo"><Save className="w-4 h-4 mr-2" /> Salva</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RubricaTab({ indirizzi, onReload }) {
  const [editing, setEditing] = useState(null);
  const remove = async (id) => {
    if (!await confirmDialog("Eliminare questo indirizzo?")) return;
    await api.delete(`/ddt/indirizzi/${id}`); toast.success("Indirizzo eliminato"); onReload();
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ ...EMPTY_INDIRIZZO })} className="bg-primary" data-testid="btn-new-indirizzo"><Plus className="w-4 h-4 mr-2" /> Nuovo indirizzo</Button>
      </div>
      <div className="md:hidden space-y-2" data-testid="indirizzi-cards-mobile">
        {indirizzi.length === 0 && <Card className="p-8 text-center text-muted-foreground">Rubrica vuota.</Card>}
        {indirizzi.map((a) => (
          <Card key={a.id} className="p-3 flex items-start justify-between gap-2" data-testid={`card-indirizzo-${a.id}`}>
            <div className="min-w-0">
              <div className="font-semibold leading-tight">{a.nome}</div>
              <div className="text-xs text-muted-foreground">{[a.indirizzo, [a.cap, a.citta, a.provincia && `(${a.provincia})`].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "—"}</div>
              <div className="text-xs text-muted-foreground">{[a.telefono, a.codice_cliente && `cod. ${a.codice_cliente}`].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...a })} data-testid={`m-edit-indirizzo-${a.id}`}><Pencil className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(a.id)} data-testid={`m-del-indirizzo-${a.id}`}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </Card>
        ))}
      </div>
      <Card className="overflow-hidden hidden md:block">
        <table className="w-full text-sm" data-testid="table-indirizzi">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Indirizzo</th><th className="text-left px-4 py-3">Città</th><th className="text-left px-4 py-3">Telefono</th><th className="text-left px-4 py-3">Cod. cliente</th><th className="w-24"></th></tr>
          </thead>
          <tbody>
            {indirizzi.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">Rubrica vuota. Gli indirizzi si possono salvare anche direttamente dal DDT.</td></tr>
            ) : indirizzi.map((a) => (
              <tr key={a.id} className="border-t border-border/60 hover:bg-muted/30" data-testid={`row-indirizzo-${a.id}`}>
                <td className="px-4 py-2.5 font-semibold">{a.nome}</td>
                <td className="px-4 py-2.5">{a.indirizzo || "—"}</td>
                <td className="px-4 py-2.5">{[a.cap, a.citta, a.provincia && `(${a.provincia})`].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-4 py-2.5">{a.telefono || "—"}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{a.codice_cliente || "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing({ ...a })} data-testid={`btn-edit-indirizzo-${a.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove(a.id)} data-testid={`btn-del-indirizzo-${a.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editing && <IndirizzoDialog value={editing} onClose={() => setEditing(null)} onSaved={onReload} />}
    </div>
  );
}
