import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen } from "lucide-react";

export function CartellaBackupPc() {
  const [info, setInfo] = useState(null);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/backup/cartella").then((r) => { setInfo(r.data); setVal(r.data.cartella || ""); }).catch(() => setInfo(null)); }, []);
  if (!info?.su_pc) return null;

  const salva = async () => {
    setSaving(true);
    try {
      const r = await api.put("/backup/cartella", { cartella: val });
      setInfo({ ...info, cartella: r.data.cartella, esiste: true }); setVal(r.data.cartella);
      toast.success(`Cartella backup impostata: ${r.data.cartella}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Cartella non valida"); } finally { setSaving(false); }
  };

  return (
    <div className="mt-4 rounded-md border border-border/70 bg-muted/30 p-4" data-testid="backup-cartella-pc">
      <div className="flex items-center gap-1.5 text-sm font-semibold"><FolderOpen className="w-4 h-4" /> Cartella dei backup su questo PC</div>
      <p className="text-xs text-muted-foreground mt-1">Il programma salva il file direttamente qui (anche su disco esterno o chiavetta), con qualsiasi browser. Vengono conservate le ultime 3 copie.</p>
      <div className="flex flex-col sm:flex-row gap-2 mt-3">
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="/home/utente/Backup GEB  oppure  /media/utente/CHIAVETTA/backup" data-testid="input-backup-cartella" />
        <Button onClick={salva} disabled={saving || !val.trim()} data-testid="btn-salva-cartella">Imposta cartella</Button>
      </div>
      {info.cartella && !info.esiste && <p className="text-xs text-destructive mt-2" data-testid="backup-cartella-mancante">La cartella impostata non è raggiungibile ora (disco scollegato?).</p>}
      {info.cartella && info.esiste && <p className="text-xs text-emerald-700 mt-2" data-testid="backup-cartella-ok">In uso: {info.cartella}</p>}
    </div>
  );
}
