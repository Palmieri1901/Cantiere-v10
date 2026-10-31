import { useCallback, useEffect, useState } from "react";
import { mobileStore, mobileApi } from "@/lib/mobileStore";
import { QrScanner } from "@/components/QrScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sailboat, QrCode, KeyRound, Download } from "lucide-react";

export default function LoginKey({ onLogged }) {
  const [key, setKey] = useState("");
  const [scan, setScan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installEvt, setInstallEvt] = useState(null);
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches;

  const entra = async (k, url) => {
    setBusy(true);
    try {
      mobileStore.login(k.trim().toUpperCase(), "", url);
      const r = await mobileApi().get("/me");
      mobileStore.login(k.trim().toUpperCase(), r.data.nome, url);
      mobileStore.setFunzioni(r.data.funzioni ?? null);
      toast.success(`Benvenuto ${r.data.nome}`);
      onLogged();
    } catch (e) {
      mobileStore.logout();
      toast.error(e.response?.status === 401 ? "Chiave non valida" : "Connessione non riuscita: serve internet per il primo accesso");
    } finally { setBusy(false); }
  };

  const onQr = useCallback((raw) => {
    try {
      const d = JSON.parse(raw);
      if (d.t === "pm-key" && d.k) { setScan(false); entra(d.k, d.u); }
    } catch { /* non è il nostro QR */ }
  }, []);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 max-w-md mx-auto" data-testid="mobile-login">
      <div className="w-14 h-14 rounded-xl bg-primary text-primary-foreground grid place-items-center mb-4"><Sailboat className="w-7 h-7" /></div>
      <h1 className="font-display text-3xl font-semibold text-center">App dipendenti</h1>
      <p className="text-sm text-muted-foreground text-center mt-2 mb-8">Inserisci la chiave personale ricevuta dal cantiere oppure scansiona il QR.</p>

      {scan ? (
        <div className="w-full space-y-3">
          <QrScanner onResult={onQr} />
          <Button variant="outline" className="w-full" onClick={() => setScan(false)}>Annulla</Button>
        </div>
      ) : (
        <div className="w-full space-y-3">
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="PM-XXXX-XXXX-XXXX" className="text-center font-mono text-lg h-12 uppercase" data-testid="input-mobile-key" />
          <Button className="w-full h-12 bg-primary hover:bg-primary/90" disabled={!key || busy} onClick={() => entra(key)} data-testid="btn-mobile-entra"><KeyRound className="w-4 h-4 mr-2" /> Entra</Button>
          <Button variant="outline" className="w-full h-12" onClick={() => setScan(true)} data-testid="btn-mobile-scan-qr"><QrCode className="w-4 h-4 mr-2" /> Scansiona QR</Button>
          {!standalone && (
            <div className="mt-6 p-4 rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground space-y-2" data-testid="install-box">
              <div className="font-semibold text-foreground flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Installa sul telefono</div>
              {installEvt ? (
                <Button size="sm" className="w-full bg-primary hover:bg-primary/90" onClick={async () => { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); }} data-testid="btn-installa-app">Installa l'app</Button>
              ) : (
                <div>Android/Chrome: menu <b>⋮</b> → <b>Installa app</b> (o "Aggiungi a schermata Home").<br />iPhone/Safari: <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
