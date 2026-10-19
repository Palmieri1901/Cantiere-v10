import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { POLICY, POLICY_MSG } from "@/lib/passwordPolicy";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import PasswordInput from "@/components/PasswordInput";
import AggiornamentiCard from "@/pages/impostazioni/AggiornamentiCard";
import FatturazioneCard from "@/pages/impostazioni/FatturazioneCard";
import ManualeCard from "@/pages/impostazioni/ManualeCard";
import BiometriaCard from "@/pages/impostazioni/BiometriaCard";
import { toast } from "sonner";
import { Building2, Upload, Save, RefreshCw, Trash2, ImageIcon, Download, Database, AlertTriangle, FileText, FileSignature, KeyRound, Lock } from "lucide-react";
import { API } from "@/lib/api";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

const FIELDS = [
  { key: "nome", label: "Nome cantiere *", placeholder: "Es. GEB Nautica" },
  { key: "slogan", label: "Slogan", placeholder: "Es. Cantiere nautico dal 1985" },
  { key: "indirizzo", label: "Indirizzo", placeholder: "Via Marina, 42" },
  { key: "citta", label: "Città", placeholder: "Genova" },
  { key: "cap", label: "CAP", placeholder: "16128" },
  { key: "provincia", label: "Provincia", placeholder: "GE" },
  { key: "telefono", label: "Telefono", placeholder: "+39 010 123 4567" },
  { key: "email", label: "Email", placeholder: "info@cantiere.it" },
  { key: "sito_web", label: "Sito web", placeholder: "www.cantiere.it" },
  { key: "piva", label: "Partita IVA", placeholder: "01234567890" },
];

export default function Impostazioni() {
  const [c, setC] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);
  const restoreRef = useRef(null);
  const [restoreData, setRestoreData] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [pwOld, setPwOld] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  // PIN di recupero master
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNew, setPinNew] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  const changePassword = async () => {
    if (!POLICY.test(pwNew)) { toast.error(POLICY_MSG); return; }
    if (pwNew !== pwNew2) { toast.error("Le due password non coincidono"); return; }
    setPwSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: pwOld, new_password: pwNew });
      toast.success("Password aggiornata");
      setPwOld(""); setPwNew(""); setPwNew2("");
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Impossibile aggiornare la password");
    } finally {
      setPwSaving(false);
    }
  };

  const changePin = async () => {
    if (!pinCurrent.trim()) { toast.error("Inserisci il PIN attuale"); return; }
    if (pinNew.trim().length < 4) { toast.error("Il PIN deve avere almeno 4 caratteri"); return; }
    setPinSaving(true);
    try {
      await api.post("/auth/change-pin", { current_pin: pinCurrent.trim(), new_pin: pinNew.trim() });
      toast.success("PIN di recupero aggiornato — conservalo in un posto sicuro");
      setPinCurrent(""); setPinNew("");
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Impossibile aggiornare il PIN");
    } finally {
      setPinSaving(false);
    }
  };

  const load = () => api.get("/cantiere").then((r) => setC(r.data));
  useEffect(() => { load(); }, []);

  const update = (k, v) => setC((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!c.nome) {
      toast.error("Il nome del cantiere è obbligatorio");
      return;
    }
    setSaving(true);
    try {
      const payload = Object.fromEntries(FIELDS.map(f => [f.key, c[f.key] ?? ""]));
      payload.orari = c.orari ?? "";
      payload.logo_base64 = c.logo_base64 ?? "";
      payload.preventivo_interno_titolo = c.preventivo_interno_titolo ?? "";
      payload.preventivo_interno_testo = c.preventivo_interno_testo ?? "";
      payload.preventivo_piazzale_titolo = c.preventivo_piazzale_titolo ?? "";
      payload.preventivo_piazzale_testo = c.preventivo_piazzale_testo ?? "";
      payload.preventivo_esclusi_titolo = c.preventivo_esclusi_titolo ?? "";
      payload.preventivo_esclusi_testo = c.preventivo_esclusi_testo ?? "";
      payload.preventivo_condizioni_titolo = c.preventivo_condizioni_titolo ?? "";
      payload.preventivo_condizioni_testo = c.preventivo_condizioni_testo ?? "";
      payload.contratto_template = c.contratto_template ?? "";
      payload.iva_percentuale = Number(c.iva_percentuale ?? 22);
      await api.put("/cantiere", payload);
      toast.success("Informazioni salvate");
      load();
    } catch {
      toast.error("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const onLogoSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Seleziona un file immagine");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Immagine troppo grande (max 2MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update("logo_base64", reader.result);
    reader.readAsDataURL(file);
  };

  const onRestoreSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data.clienti && !data.tariffe && !data.cantiere) {
          toast.error("File di backup non valido");
          return;
        }
        setRestoreData(data);
      } catch {
        toast.error("File JSON non valido");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const doRestore = async () => {
    if (!restoreData) return;
    setRestoring(true);
    try {
      const r = await api.post("/restore", restoreData);
      const rst = r.data.restored;
      toast.success(`Ripristinati: ${rst.clienti} clienti, ${rst.lavori} lavori`);
      setRestoreData(null);
      load();
    } catch (e) {
      toast.error("Errore durante il ripristino");
    } finally {
      setRestoring(false);
    }
  };

  if (!c) return <div className="p-8 text-muted-foreground">Caricamento…</div>;

  return (
    <div className="p-6 md:p-10 max-w-5xl" data-testid="impostazioni-page">
      <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 label-mini mb-2">
            <Building2 className="w-3.5 h-3.5" /> Impostazioni cantiere
          </div>
          <h1 className="font-display text-4xl font-semibold tracking-tight">Informazioni & Logo</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Configura nome, indirizzo, contatti e logo del cantiere. Queste informazioni compaiono nella pagina iniziale e nei preventivi PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} data-testid="btn-reload">
            <RefreshCw className="w-4 h-4 mr-2" /> Ricarica
          </Button>
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90" data-testid="btn-save-cantiere">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Logo */}
        <Card className="p-6 h-fit" data-testid="logo-card">
          <div className="label-mini mb-3">Logo</div>
          <div className="aspect-square bg-muted/40 border border-dashed border-border rounded-md grid place-items-center overflow-hidden mb-3">
            {c.logo_base64 ? (
              <img src={c.logo_base64} alt="Logo" className="max-w-full max-h-full object-contain p-4" data-testid="logo-preview" />
            ) : (
              <div className="text-center text-muted-foreground p-6">
                <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <div className="text-xs">Nessun logo caricato</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogoSelected} data-testid="input-logo-file" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()} className="flex-1" data-testid="btn-upload-logo">
              <Upload className="w-4 h-4 mr-2" />
              Carica
            </Button>
            {c.logo_base64 && (
              <Button variant="outline" onClick={() => update("logo_base64", "")} data-testid="btn-remove-logo">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Formati: PNG, JPG, SVG. Max 2MB. Sfondo trasparente consigliato.
          </p>
        </Card>

        {/* Info */}
        <Card className="p-6 lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.key === "nome" || f.key === "slogan" || f.key === "indirizzo" ? "md:col-span-2" : ""}>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</Label>
                <Input
                  value={c[f.key] ?? ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="mt-1.5"
                  data-testid={`input-${f.key}`}
                />
              </div>
            ))}
          </div>
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Aliquota IVA (%)</Label>
              <Input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={c.iva_percentuale ?? 22}
                onChange={(e) => update("iva_percentuale", e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1.5"
                data-testid="input-iva-percentuale"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Aliquota unica applicata in tutta l'app (default 22%). Modifica il calcolo di margine e costi IVA inclusa in tutti i preventivi.
              </p>
            </div>
          </div>
          <Separator />
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Orari di apertura</Label>
            <Textarea
              value={c.orari ?? ""}
              onChange={(e) => update("orari", e.target.value)}
              placeholder="Lun-Ven 8:30-12:30 · 14:30-18:30&#10;Sabato 8:30-12:30&#10;Domenica chiuso"
              rows={3}
              className="mt-1.5"
              data-testid="input-orari"
            />
          </div>
        </Card>
      </div>

      {/* Sicurezza / Cambio password */}
      <Card className="p-6 mt-6" data-testid="security-card">
        <div className="label-mini mb-2 flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Sicurezza account
        </div>
        <h3 className="font-display text-xl font-semibold mb-1">Cambia password</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
          Aggiorna la password di accesso al gestionale. Se la dimentichi puoi
          reimpostarla dalla pagina di login usando il <b>PIN di recupero master</b>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Password attuale</Label>
            <PasswordInput
              value={pwOld}
              onChange={(e) => setPwOld(e.target.value)}
              className="mt-1.5"
              data-testid="input-pw-current"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nuova password</Label>
            <PasswordInput
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              className="mt-1.5"
              data-testid="input-pw-new"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ripeti nuova</Label>
            <PasswordInput
              value={pwNew2}
              onChange={(e) => setPwNew2(e.target.value)}
              className="mt-1.5"
              data-testid="input-pw-new2"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            onClick={changePassword}
            disabled={pwSaving || !pwOld || !pwNew || !pwNew2}
            className="bg-primary hover:bg-primary/90"
            data-testid="btn-change-password"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            {pwSaving ? "Aggiornamento…" : "Aggiorna password"}
          </Button>
        </div>
      </Card>

      {/* PIN di recupero master */}
      <Card className="p-6 mt-6" data-testid="pin-card">
        <div className="label-mini mb-2 flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5" /> PIN di recupero master
        </div>
        <h3 className="font-display text-xl font-semibold mb-1">Cambia il PIN di recupero</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
          Il PIN ti permette di reimpostare la password se la dimentichi.
          <b> Annotalo in un posto sicuro</b> (es. carta d'identità del cantiere,
          agenda cartacea). Consigliato: almeno 4-6 cifre facili da ricordare.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PIN attuale</Label>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={pinCurrent}
              onChange={(e) => setPinCurrent(e.target.value)}
              placeholder="PIN corrente"
              className="mt-1.5 font-mono tracking-widest text-lg"
              data-testid="input-pin-current"
            />
          </div>
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nuovo PIN</Label>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={pinNew}
              onChange={(e) => setPinNew(e.target.value)}
              placeholder="es. 347260"
              className="mt-1.5 font-mono tracking-widest text-lg"
              data-testid="input-pin-new"
            />
          </div>
        </div>
        <div className="mt-4">
          <Button
            onClick={changePin}
            disabled={pinSaving || !pinCurrent || !pinNew}
            className="bg-primary hover:bg-primary/90"
            data-testid="btn-change-pin"
          >
            <KeyRound className="w-4 h-4 mr-2" />
            {pinSaving ? "Aggiornamento…" : "Aggiorna PIN"}
          </Button>
        </div>
      </Card>

      {/* Backup & Restore */}
      <Card className="p-6 mt-6" data-testid="backup-card">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 label-mini mb-2">
              <Database className="w-3.5 h-3.5" /> Backup & Ripristino
            </div>
            <h3 className="font-display text-xl font-semibold">Salva tutti i dati del cantiere</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Scarica un file JSON con tutti i clienti, lavori, tariffe e informazioni cantiere.
              Puoi conservare il file come archivio o ripristinarlo su un altro dispositivo.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
            <Button asChild variant="outline" className="w-full sm:w-auto" data-testid="btn-backup-download">
              <a href={`${API}/backup`} download>
                <Download className="w-4 h-4 mr-2" />
                Scarica backup
              </a>
            </Button>
            <input ref={restoreRef} type="file" accept="application/json,.json" hidden onChange={onRestoreSelected} data-testid="input-restore-file" />
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => restoreRef.current?.click()} data-testid="btn-restore-open">
              <Upload className="w-4 h-4 mr-2" />
              Ripristina da file
            </Button>
          </div>
        </div>
      </Card>

      <BiometriaCard />
      <ManualeCard />
      <FatturazioneCard />
      <AggiornamentiCard />

      <AlertDialog open={!!restoreData} onOpenChange={(o) => !o && setRestoreData(null)}>
        <AlertDialogContent data-testid="restore-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Confermi il ripristino?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 mt-2">
                <div>Il backup contiene:</div>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  <li><b>{restoreData?.clienti?.length || 0}</b> clienti</li>
                  <li><b>{restoreData?.lavori?.length || 0}</b> lavori</li>
                  <li>Tariffe: <b>{restoreData?.tariffe ? "sì" : "no"}</b></li>
                  <li>Cantiere: <b>{restoreData?.cantiere ? "sì" : "no"}</b></li>
                </ul>
                <div className="text-destructive mt-3 text-sm font-medium">
                  ⚠️ Tutti i dati attuali verranno sovrascritti. L'operazione non è reversibile.
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="restore-cancel">Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={doRestore} disabled={restoring} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="restore-confirm">
              {restoring ? "Ripristino…" : "Sì, ripristina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
