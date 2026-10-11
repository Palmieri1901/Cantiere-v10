import { useCallback, useState } from "react";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScanBarcode } from "lucide-react";

// Pulsante + finestra per leggere un codice a barre e restituirlo (campo articolo, app dipendenti).
export function BarcodeButton({ onCode, label = "Scansiona", className = "", variant = "outline", size = "default", testId = "btn-barcode" }) {
  const [open, setOpen] = useState(false);
  const onResult = useCallback((code) => { onCode(code); setOpen(false); }, [onCode]);
  return (
    <>
      <Button type="button" variant={variant} size={size} onClick={() => setOpen(true)} className={className} data-testid={testId} title="Leggi codice a barre">
        <ScanBarcode className={`w-4 h-4 ${label ? "mr-1.5" : ""}`} />{label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md" data-testid={`${testId}-dialog`}>
          <DialogHeader><DialogTitle className="font-display">Leggi codice a barre</DialogTitle><DialogDescription>Inquadra il codice con la fotocamera.</DialogDescription></DialogHeader>
          {open && <BarcodeScanner onResult={onResult} active={open} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
