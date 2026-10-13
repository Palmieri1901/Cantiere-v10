import { mobileStore } from "@/lib/mobileStore";
import { ClipboardPlus, Package, Send, ChevronRight } from "lucide-react";

const saluto = () => { const h = new Date().getHours(); return h < 13 ? "Buongiorno" : h < 18 ? "Buon pomeriggio" : "Buonasera"; };

export default function HomeDipendente({ pendenti, onScegli }) {
  const nome = (mobileStore.getNome() || "").split(" ")[0];
  const voci = [
    { id: "nuovo", icon: ClipboardPlus, titolo: "Aggiungi lavoro", desc: "Registra un lavoro fatto a un cliente", testId: "home-aggiungi-lavoro" },
    { id: "listino", icon: Package, titolo: "Listino magazzino", desc: "Cerca articoli per nome o codice, prezzi e giacenze", testId: "home-listino" },
    { id: "coda", icon: Send, titolo: "Da inviare", desc: pendenti > 0 ? `${pendenti} ${pendenti === 1 ? "lavoro" : "lavori"} da inviare al cantiere` : "Nessun lavoro in attesa", badge: pendenti, testId: "home-coda" },
  ];
  return (
    <div className="space-y-6" data-testid="home-dipendente">
      <div>
        <div className="label-mini">{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</div>
        <h1 className="font-display text-3xl font-semibold mt-1" data-testid="home-saluto">{saluto()}, {nome}!</h1>
        <p className="text-sm text-muted-foreground mt-1">Cosa vuoi fare?</p>
      </div>
      <div className="space-y-3">
        {voci.map(({ id, icon: Icon, titolo, desc, badge, testId }) => (
          <button key={id} onClick={() => onScegli(id)} className="w-full text-left flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm active:scale-[0.99] hover:border-primary/50 transition-[transform,border-color]" data-testid={testId}>
            <span className="w-12 h-12 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0 relative">
              <Icon className="w-6 h-6" />
              {badge > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] grid place-items-center">{badge}</span>}
            </span>
            <span className="flex-1 min-w-0"><span className="block font-semibold text-base">{titolo}</span><span className="block text-xs text-muted-foreground mt-0.5">{desc}</span></span>
            <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
