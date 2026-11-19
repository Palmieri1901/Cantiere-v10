import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fingerprint, Trash2, Plus } from "lucide-react";
import { confirmDialog } from "@/components/ConfirmDialog";
import { registraImpronta, supportaBiometria } from "@/lib/passkey";

const MAX = 4;

export default function BiometriaCard() {
  const [lista, setLista] = useState([]);
  const [nome, setNome] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/webauthn/dispositivi").then((r) => setLista(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const elimina = async (d) => {
    if (!(await confirmDialog(`Rimuovere l'impronta "${d.device_nome || "dispositivo"}"? Non potrà più essere usata per sbloccare o recuperare la password.`, { title: "Rimuovi impronta" }))) return;
    await api.delete(`/webauthn/dispositivi/${d.id}`); toast.success("Impronta rimossa"); load();
  };
  const registra = async () => {
    setBusy(true);
    try {
      await registraImpronta(api, nome.trim() || undefined);
      toast.success("Impronta registrata"); setNome(""); load();
    } catch (e) {
      toast.error(e.response?.data?.detail || (e.name === "NotAllowedError" ? "Registrazione annullata" : "Registrazione non riuscita: usa un dispositivo con impronta/volto"));
    } finally { setBusy(false); }
  };

  return (
    <Card className="p-6 mt-6" data-testid="biometria-card">
      <div className="flex items-center gap-1.5 label-mini mb-2"><Fingerprint className="w-3.5 h-3.5" /> Impronte digitali</div>
      <h3 className="font-display text-xl font-semibold">Impronte registrate <span className="text-muted-foreground text-base font-normal" data-testid="biometria-conteggio">({lista.length}/{MAX})</span></h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xl">Fino a {MAX} impronte (o volto) su telefoni e PC con lettore. Servono per lo sblocco rapido e per <b>recuperare la password</b> dalla pagina «Password dimenticata» → «Impronta digitale».</p>
      <div className="mt-4 space-y-2">
        {lista.length === 0 && <p className="text-xs text-muted-foreground" data-testid="biometria-vuoto">Nessuna impronta registrata.</p>}
        {lista.map((d) => (
          <div key={d.id} className="flex items-center gap-3 rounded-md border p-2.5 text-sm" data-testid={`biometria-dev-${d.id}`}>
            <Fingerprint className="w-4 h-4 text-primary" />
            <div className="flex-1 min-w-0"><div className="font-medium">{d.device_nome || "Dispositivo"}</div><div className="text-xs text-muted-foreground">Registrata il {new Date(d.created_at).toLocaleDateString("it-IT")}{d.ultimo_uso ? ` · ultimo uso ${new Date(d.ultimo_uso).toLocaleDateString("it-IT")}` : ""}</div></div>
            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => elimina(d)} data-testid={`biometria-del-${d.id}`}><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
      {lista.length < MAX ? (
        <div className="mt-4 flex flex-col sm:flex-row gap-2 max-w-xl">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (es. Telefono Marco, PC ufficio)" maxLength={40} data-testid="input-impronta-nome" />
          <Button onClick={registra} disabled={busy || !supportaBiometria()} data-testid="btn-registra-impronta"><Plus className="w-4 h-4 mr-1.5" />{busy ? "Attendi…" : "Registra impronta"}</Button>
        </div>
      ) : <p className="text-xs text-muted-foreground mt-3" data-testid="biometria-max">Limite raggiunto: rimuovi un'impronta per registrarne un'altra.</p>}
      {!supportaBiometria() && <p className="text-xs text-amber-700 mt-2">Questo dispositivo/browser non supporta la registrazione biometrica: usa il telefono.</p>}
    </Card>
  );
}
