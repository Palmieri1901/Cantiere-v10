import { Clock, StickyNote } from "lucide-react";

const fmtGiorno = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

export default function ElencoEventi({ eventi, tipi, onEvento, onGiorno }) {
  const tipo = (id) => tipi.find((t) => t.id === id) || { nome: "Altro", colore: "#6b7280" };
  const gruppi = eventi.reduce((acc, e) => { (acc[e.data] ||= []).push(e); return acc; }, {});
  const giorni = Object.keys(gruppi).sort();

  return (
    <div className="mt-6" data-testid="elenco-eventi">
      <div className="label-mini mb-3">Appuntamenti del mese · {eventi.length}</div>
      {giorni.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-md">Nessun appuntamento in questo mese. Tocca un giorno nel calendario per aggiungerne uno.</div>
      ) : (
        <div className="space-y-4">
          {giorni.map((d) => (
            <div key={d}>
              <button onClick={() => onGiorno(d)} className="text-sm font-semibold capitalize mb-1.5 hover:text-primary" data-testid={`elenco-giorno-${d}`}>{fmtGiorno(d)}</button>
              <div className="space-y-1.5">
                {gruppi[d].map((e) => {
                  const t = tipo(e.tipo_id);
                  return (
                    <button key={e.id} onClick={() => onEvento(e)} className="w-full text-left flex items-start gap-3 border border-border rounded-md bg-card px-3 py-2.5 hover:bg-muted/40" data-testid={`evento-riga-${e.id}`}>
                      <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: t.colore }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{e.titolo}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white text-[10px]" style={{ background: t.colore }}>{t.nome}</span>
                          {e.ora && <span className="inline-flex items-center gap-1 font-mono-num"><Clock className="w-3 h-3" /> {e.ora}</span>}
                          {e.cliente_memo && <span className="inline-flex items-center gap-1 text-amber-700" title={e.cliente_memo}><StickyNote className="w-3 h-3" /> memo</span>}
                          {e.note && <span className="truncate">{e.note}</span>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
