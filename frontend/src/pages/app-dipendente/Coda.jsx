import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { mobileStore } from "@/lib/mobileStore";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Send, QrCode, Trash2, Check, ChevronLeft, ChevronRight, Pencil } from "lucide-react";

const CHUNK = 6;

export default function Coda({ coda, setCoda, onSync, syncing, online, onModifica }) {
  const [qr, setQr] = useState(false);
  const [page, setPage] = useState(0);
  const [scelti, setScelti] = useState([]); // client_uid dei lavori spuntati
  const daInviare = coda.filter((x) => !x.inviato);
  const selezionati = daInviare.filter((x) => scelti.includes(x.client_uid));
  const target = selezionati.length ? selezionati : daInviare; // niente spuntato = tutti

  const chunks = [];
  for (let i = 0; i < target.length; i += CHUNK) chunks.push(target.slice(i, i + CHUNK));
  const qrValue = chunks.length ? JSON.stringify({
    t: "pm-lavori", d: mobileStore.getNome(), p: page, n: chunks.length,
    items: chunks[page].map(({ client_uid, cliente_id, cliente_nome, data, tipo, descrizione, ore, materiali, articoli_magazzino, articoli_liberi }) => ({ client_uid, cliente_id, cliente_nome, data, tipo, descrizione, ore, materiali, articoli_magazzino, articoli_liberi })),
  }) : "";

  const toggle = (uid) => setScelti((s) => (s.includes(uid) ? s.filter((u) => u !== uid) : [...s, uid]));
  const inviaSelezionati = async () => { await onSync(selezionati.length ? selezionati : undefined); setScelti([]); };
  const inviaUno = async (x) => { await onSync([x]); setScelti((s) => s.filter((u) => u !== x.client_uid)); };

  const segnaInviati = async () => {
    if (!await confirmDialog(`Confermi che il cantiere ha letto tutti i QR? ${target.length === 1 ? "Il lavoro verrà segnato" : `I ${target.length} lavori verranno segnati`} come inviati.`)) return;
    const ids = new Set(target.map((x) => x.client_uid));
    setCoda(coda.map((x) => ids.has(x.client_uid) ? { ...x, inviato: true, inviato_at: new Date().toISOString(), via_qr: true } : x));
    setQr(false); setScelti([]);
  };
  const elimina = async (x) => {
    if (!await confirmDialog("Eliminare questo lavoro dal telefono?")) return;
    setCoda(coda.filter((y) => y.client_uid !== x.client_uid));
  };
  const pulisci = async () => {
    if (!await confirmDialog("Rimuovere dal telefono i lavori già inviati?")) return;
    setCoda(daInviare);
  };

  const labelInvia = selezionati.length ? `Invia selezionati (${selezionati.length})` : `Invia tutti (${daInviare.length})`;

  return (
    <div className="space-y-4" data-testid="coda-mobile">
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={inviaSelezionati} disabled={!online || syncing || daInviare.length === 0} className="h-12 bg-primary hover:bg-primary/90" data-testid="btn-mobile-sync"><Send className="w-4 h-4 mr-2" /> {labelInvia}</Button>
        <Button variant="outline" onClick={() => { setPage(0); setQr(true); }} disabled={daInviare.length === 0} className="h-12" data-testid="btn-mobile-qr"><QrCode className="w-4 h-4 mr-2" /> Mostra QR{selezionati.length ? ` (${selezionati.length})` : ""}</Button>
      </div>
      {daInviare.length > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground" data-testid="coda-selezione-hint">
          <span>{selezionati.length ? `${selezionati.length} su ${daInviare.length} selezionati` : "Spunta i lavori da inviare, oppure invia tutti"}</span>
          <button type="button" className="underline" onClick={() => setScelti(selezionati.length === daInviare.length ? [] : daInviare.map((x) => x.client_uid))} data-testid="btn-coda-seleziona-tutti">{selezionati.length === daInviare.length ? "Deseleziona" : "Seleziona tutti"}</button>
        </div>
      )}
      {!online && daInviare.length > 0 && <div className="text-xs text-amber-700">Sei offline: usa "Mostra QR" e fai leggere il codice dal programma del cantiere.</div>}

      {coda.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-10 border border-dashed rounded-md">Nessun lavoro salvato.</div>
      ) : (
        <div className="border rounded-md divide-y">
          {coda.map((x) => (
            <div key={x.client_uid} className="p-3 flex items-start gap-3" data-testid={`coda-row-${x.client_uid}`}>
              {!x.inviato && (
                <input type="checkbox" className="mt-1 h-5 w-5 accent-[hsl(var(--primary))] shrink-0" checked={scelti.includes(x.client_uid)} onChange={() => toggle(x.client_uid)} aria-label="Seleziona lavoro" data-testid={`chk-coda-${x.client_uid}`} />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{x.cliente_nome}</div>
                <div className="text-xs">{x.tipo} — {x.descrizione}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{x.data} · {x.ore} h {x.inviato ? <Badge variant="outline" className="ml-1 text-[9px] text-emerald-700 border-emerald-300"><Check className="w-2.5 h-2.5 mr-0.5" /> Inviato</Badge> : <Badge variant="outline" className="ml-1 text-[9px]">Da inviare{x.modificato_at ? " · modificato" : ""}</Badge>}</div>
              </div>
              {!x.inviato && (
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => inviaUno(x)} disabled={!online || syncing} className="p-1.5 rounded-md border border-border text-primary disabled:opacity-40" title="Invia solo questo lavoro" data-testid={`btn-coda-send-${x.client_uid}`}><Send className="w-4 h-4" /></button>
                  <button onClick={() => onModifica(x)} className="p-1.5 rounded-md border border-border text-primary" title="Modifica" data-testid={`btn-coda-edit-${x.client_uid}`}><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => elimina(x)} className="p-1.5" data-testid={`btn-coda-del-${x.client_uid}`}><Trash2 className="w-4 h-4 text-destructive" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {coda.some((x) => x.inviato) && <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={pulisci} data-testid="btn-pulisci-inviati">Rimuovi i lavori già inviati</Button>}

      <Dialog open={qr} onOpenChange={setQr}>
        <DialogContent className="max-w-sm" data-testid="qr-dialog-mobile">
          <DialogHeader>
            <DialogTitle>Trasferimento via QR</DialogTitle>
            <DialogDescription>{target.length === 1 ? "1 lavoro" : `${target.length} lavori`}. Fai inquadrare il codice dalla webcam del programma (Lavori dal cantiere → Importa da QR).{chunks.length > 1 ? ` Sono ${chunks.length} pagine: scorri e falle leggere tutte.` : ""}</DialogDescription>
          </DialogHeader>
          {qrValue && (
            <div className="flex flex-col items-center gap-3">
              <div className="p-3 bg-white rounded-md border"><QRCodeSVG value={qrValue} size={260} level="M" /></div>
              {chunks.length > 1 && (
                <div className="flex items-center gap-3">
                  <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}><ChevronLeft className="w-4 h-4" /></Button>
                  <span className="text-sm font-medium" data-testid="qr-page">Pagina {page + 1} / {chunks.length}</span>
                  <Button size="icon" variant="outline" onClick={() => setPage((p) => Math.min(chunks.length - 1, p + 1))} disabled={page === chunks.length - 1}><ChevronRight className="w-4 h-4" /></Button>
                </div>
              )}
              <Button className="w-full bg-primary hover:bg-primary/90" onClick={segnaInviati} data-testid="btn-qr-fatto"><Check className="w-4 h-4 mr-2" /> Fatto, segna come inviati</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
