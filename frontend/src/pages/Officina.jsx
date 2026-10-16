import { useState } from "react";
import { api } from "@/lib/api";
import { Wrench, MessageSquare, FileText, Lightbulb, Settings2, Hash } from "lucide-react";
import ChatOfficina from "@/pages/officina/ChatOfficina";
import CodiciTab from "@/pages/officina/CodiciTab";
import SchedeTab from "@/pages/officina/SchedeTab";
import CasiTab from "@/pages/officina/CasiTab";
import ImpostazioniTab from "@/pages/officina/ImpostazioniTab";

const TABS = [
  { id: "chat", label: "Assistente", icon: MessageSquare },
  { id: "schede", label: "Schede tecniche", icon: FileText },
  { id: "codici", label: "Codici errore", icon: Hash },
  { id: "casi", label: "Casi risolti", icon: Lightbulb },
  { id: "impostazioni", label: "Impostazioni", icon: Settings2 },
];

export default function Officina() {
  const [tab, setTab] = useState("chat");
  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-6xl" data-testid="officina-page">
      <div className="label-mini flex items-center gap-1.5 mb-2"><Wrench className="w-3.5 h-3.5" /> Officina</div>
      <h1 className="font-display text-3xl sm:text-5xl font-semibold mb-2">Assistente officina</h1>
      <p className="text-muted-foreground text-sm md:text-lg mb-4 sm:mb-6 max-w-2xl hidden sm:block">Meccanico virtuale: risponde a codici errore, sintomi e dati tecnici usando solo le schede caricate e l'esperienza dei casi risolti.</p>
      <div className="flex gap-1 border-b border-border mb-4 sm:mb-6 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`} data-testid={`tab-officina-${id}`}><Icon className="w-4 h-4" /> {label}</button>
        ))}
      </div>
      {tab === "chat" && <ChatOfficina client={api} />}
      {tab === "schede" && <SchedeTab />}
      {tab === "codici" && <CodiciTab />}
      {tab === "casi" && <CasiTab />}
      {tab === "impostazioni" && <ImpostazioniTab />}
    </div>
  );
}
