const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const pad = (n) => String(n).padStart(2, "0");

export default function MeseGriglia({ anno, mese, eventi, tipi, onGiorno, onEvento }) {
  const primo = new Date(anno, mese - 1, 1);
  const nGiorni = new Date(anno, mese, 0).getDate();
  const offset = (primo.getDay() + 6) % 7;
  const oggi = new Date();
  const isOggi = (g) => oggi.getFullYear() === anno && oggi.getMonth() + 1 === mese && oggi.getDate() === g;
  const colore = (id) => tipi.find((t) => t.id === id)?.colore || "#6b7280";
  const perGiorno = {};
  eventi.forEach((e) => { const g = +e.data.slice(8, 10); (perGiorno[g] ||= []).push(e); });
  const celle = [...Array(offset).fill(null), ...Array.from({ length: nGiorni }, (_, i) => i + 1)];
  while (celle.length % 7) celle.push(null);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card" data-testid="mese-griglia">
      <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
        {GIORNI.map((g, i) => <div key={g} className={`py-2 text-center text-[11px] font-semibold uppercase tracking-wide ${i >= 5 ? "text-primary/80" : "text-muted-foreground"}`}>{g}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {celle.map((g, i) => (
          <div key={i} className={`min-h-[56px] sm:min-h-[96px] border-b border-r border-border/60 p-1 sm:p-1.5 ${g ? "cursor-pointer hover:bg-muted/40" : "bg-muted/20"} ${i % 7 === 6 ? "border-r-0" : ""}`}
            onClick={() => g && onGiorno(`${anno}-${pad(mese)}-${pad(g)}`)} data-testid={g ? `giorno-${g}` : undefined}>
            {g && (
              <>
                <div className={`text-xs font-mono-num w-6 h-6 grid place-items-center rounded-full ${isOggi(g) ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground"}`}>{g}</div>
                <div className="hidden sm:flex flex-col gap-0.5 mt-1">
                  {(perGiorno[g] || []).slice(0, 3).map((e) => (
                    <button key={e.id} onClick={(ev) => { ev.stopPropagation(); onEvento(e); }} className="text-left text-[11px] leading-tight truncate rounded px-1.5 py-0.5 text-white hover:opacity-85" style={{ background: colore(e.tipo_id) }} data-testid={`evento-chip-${e.id}`}>
                      {e.ora && <span className="font-mono-num opacity-90 mr-1">{e.ora}</span>}{e.titolo}
                    </button>
                  ))}
                  {(perGiorno[g]?.length || 0) > 3 && <div className="text-[10px] text-muted-foreground pl-1">+{perGiorno[g].length - 3} altri</div>}
                </div>
                <div className="flex sm:hidden gap-0.5 mt-1 flex-wrap">
                  {(perGiorno[g] || []).slice(0, 4).map((e) => <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: colore(e.tipo_id) }} />)}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
