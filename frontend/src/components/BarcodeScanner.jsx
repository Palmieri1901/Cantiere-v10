import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ScanBarcode } from "lucide-react";

// Lettore codici a barre/QR dalla fotocamera (EAN, UPC, Code128/39, QR). Ignora letture ripetute entro 2,5 s.
export function BarcodeScanner({ onResult, active = true }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const last = useRef({ code: "", t: 0 });

  useEffect(() => {
    if (!active) return;
    let controls, stopped = false;
    const reader = new BrowserMultiFormatReader();
    reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
      if (stopped || !result) return;
      const code = result.getText();
      const now = Date.now();
      if (code === last.current.code && now - last.current.t < 2500) return;
      last.current = { code, t: now };
      if (navigator.vibrate) navigator.vibrate(60);
      onResult(code);
    }).then((c) => { controls = c; setReady(true); })
      .catch(() => setError("Fotocamera non disponibile: consenti l'accesso (serve HTTPS) oppure inserisci il codice a mano."));
    return () => { stopped = true; controls?.stop(); };
  }, [active, onResult]);

  return (
    <div className="relative" data-testid="barcode-scanner">
      <video ref={videoRef} muted playsInline className="w-full rounded-md bg-black aspect-[4/3] object-cover" />
      {ready && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="w-[70%] h-[38%] border-2 border-white/80 rounded-lg shadow-[0_0_0_200vmax_rgba(0,0,0,0.35)]" />
          <div className="absolute bottom-2 left-0 right-0 text-center text-[11px] text-white/90 flex items-center justify-center gap-1"><ScanBarcode className="w-3.5 h-3.5" /> Inquadra il codice a barre</div>
        </div>
      )}
      {error && <div className="text-xs text-destructive mt-2" data-testid="barcode-scanner-error">{error}</div>}
    </div>
  );
}
