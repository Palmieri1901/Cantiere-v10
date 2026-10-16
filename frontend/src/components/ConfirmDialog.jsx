import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

let _open = null;

// Sostituto di window.confirm (bloccato nelle preview in iframe): ritorna una Promise<boolean>.
export function confirmDialog(message, { title = "Conferma", okLabel = "Conferma", cancelLabel = "Annulla", danger = true, terzo = false } = {}) {
  if (!_open) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => _open({ message, title, okLabel, cancelLabel, danger, terzo, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  useEffect(() => { _open = setReq; return () => { _open = null; }; }, []);
  const close = (v) => { req?.resolve(v); setReq(null); };
  // Con `terzo`: chiusura/Annulla → null, cancelLabel → false, okLabel → true
  return (
    <AlertDialog open={!!req} onOpenChange={(o) => !o && close(req?.terzo ? null : false)}>
      <AlertDialogContent data-testid="confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{req?.title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-line">{req?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-wrap gap-2">
          {req?.terzo && <AlertDialogCancel onClick={() => close(null)} data-testid="confirm-annulla">Annulla</AlertDialogCancel>}
          <AlertDialogCancel onClick={() => close(false)} data-testid="confirm-cancel">{req?.cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={() => close(true)} className={req?.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} data-testid="confirm-ok">{req?.okLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
