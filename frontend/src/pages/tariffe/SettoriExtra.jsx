import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import { FolderPlus, Layers, Trash2 } from "lucide-react";
import { VociSettore } from "./VociSettore";

// Settori creati dall'utente (es. «Elettronica»), ognuno con le sue voci
export function SettoriExtra({ t, setT, riservati }) {
  const [nuovo, setNuovo] = useState("");
  const settori = t.settori_extra || [];
  const rinomina = (old, nome) => setT({
    ...t,
    settori_extra: settori.map((s) => (s === old ? nome : s)),
    servizi_extra: (t.servizi_extra || []).map((v) => ((v.settore || "") === old ? { ...v, settore: nome } : v)),
  });
  const elimina = async (s) => {
    const n = (t.servizi_extra || []).filter((v) => v.settore === s).length;
    if (!await confirmDialog(`Eliminare il settore «${s}»${n ? ` e le sue ${n} voci` : ""}?`, { title: "Elimina settore", okLabel: "Elimina" })) return;
    setT({ ...t, settori_extra: settori.filter((x) => x !== s), servizi_extra: (t.servizi_extra || []).filter((v) => v.settore !== s) });
  };
  const aggiungi = () => {
    const n = nuovo.trim();
    if (!n) return;
    if ([...settori, ...riservati].some((s) => s.toLowerCase() === n.toLowerCase())) return toast.error("Esiste già un settore con questo nome");
    setT({ ...t, settori_extra: [...settori, n] });
    setNuovo("");
  };
  return (
    <>
      {settori.map((s, i) => (
        <Card key={i} className="p-5" data-testid={`settore-extra-${i}`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0"><Layers className="w-4 h-4" /></div>
            <Input value={s} onChange={(e) => rinomina(s, e.target.value)} className="h-9 font-display font-semibold flex-1 min-w-0" data-testid={`settore-nome-${i}`} />
            <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => elimina(s)} data-testid={`settore-del-${i}`}><Trash2 className="w-4 h-4" /></Button>
          </div>
          <VociSettore t={t} setT={setT} settore={s} />
        </Card>
      ))}
      <Card className="p-5 border-dashed" data-testid="settore-nuovo">
        <div className="flex items-center gap-2 flex-wrap">
          <FolderPlus className="w-4 h-4 text-primary" />
          <Input value={nuovo} onChange={(e) => setNuovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && aggiungi()} placeholder="Nuovo settore (es. Elettronica, Carpenteria…)" className="flex-1 min-w-[200px] h-9" data-testid="settore-nuovo-input" />
          <Button size="sm" onClick={aggiungi} disabled={!nuovo.trim()} data-testid="btn-aggiungi-settore">Aggiungi settore</Button>
        </div>
      </Card>
    </>
  );
}
