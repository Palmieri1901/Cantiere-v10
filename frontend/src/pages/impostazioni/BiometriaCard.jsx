import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fingerprint, Trash2 } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";

export default function BiometriaCard() {
  const [lista, setLista] = useState([]);
  const load = () => api.get("/webauthn/dispositivi").then((r) => setLista(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const elimina = async (d) => {
    if (!(await confirmDialog(`Rimuovere lo sblocco biometrico di "${d.device_nome || "dispositivo"}"? Alla prossima apertura su quel telefono verrà richiesto di riattivarlo dopo la password.`, { title: "Rimuovi dispositivo" }))) return;
    await api.delete(`/webauthn/dispositivi/${d.id}`); toast.success("Dispositivo rimosso"); load();
  };
  return (
    <Card className="p-6 mt-6" data-testid="biometria-card">
      <div className="flex items-center gap-1.5 label-mini mb-2"><Fingerprint className="w-3.5 h-3.5" /> Sblocco biometrico</div>
      <h3 className="font-display text-xl font-semibold">Telefoni autorizzati</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xl">Su telefono il gestionale chiede sempre impronta o volto all'apertura; su PC la password a ogni accesso. Qui vedi i telefoni registrati e puoi revocarli.</p>
      <div className="mt-4 space-y-2">
        {lista.length === 0 && <p className="text-xs text-muted-foreground" data-testid="biometria-vuoto">Nessun telefono registrato: lo sblocco viene attivato al primo accesso da telefono.</p>}
        {lista.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-md border p-2.5 text-sm" data-testid={`biometria-dev-${d.id}`}>
            <Fingerprint className="w-4 h-4 text-primary" />
            <div className="flex-1 min-w-0"><div className="font-medium">{d.device_nome || "Dispositivo"}</div><div className="text-xs text-muted-foreground">Registrato il {new Date(d.created_at).toLocaleDateString("it-IT")}{d.ultimo_uso ? ` · ultimo uso ${new Date(d.ultimo_uso).toLocaleDateString("it-IT")}` : ""}</div></div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => elimina(d)} data-testid={`biometria-del-${d.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
