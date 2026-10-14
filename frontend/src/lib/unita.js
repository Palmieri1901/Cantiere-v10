// Unità di misura standard del listino: codice, etichetta, domanda da porre per il calcolo
export const UNITA = [
  { id: "forfait", label: "Forfait (prezzo fisso)", domanda: null, breve: "" },
  { id: "m", label: "€ / metro (m)", domanda: "Metri", breve: "m" },
  { id: "mq", label: "€ / metro quadro (mq)", domanda: "Metri quadri", breve: "mq" },
  { id: "lt", label: "€ / litro (lt)", domanda: "Litri", breve: "lt" },
  { id: "kg", label: "€ / chilo (kg)", domanda: "Chili", breve: "kg" },
  { id: "ore", label: "€ / ora", domanda: "Ore", breve: "h" },
  { id: "giorni", label: "€ / giorno", domanda: "Giorni", breve: "gg" },
  { id: "pz", label: "€ / pezzo", domanda: "Pezzi", breve: "pz" },
  { id: "km", label: "€ / km", domanda: "Chilometri", breve: "km" },
  { id: "mov", label: "€ / movimento", domanda: "Numero movimenti", breve: "mov." },
];

const ALIAS = { metri: "m", metro: "m", mt: "m", "m²": "mq", m2: "mq", litri: "lt", litro: "lt", l: "lt", ora: "ore", h: "ore", giorno: "giorni", gg: "giorni", pezzo: "pz", pezzi: "pz", chili: "kg", chilo: "kg", movimento: "mov", amovimento: "mov", movimenti: "mov" };

export function normUnita(u) {
  const s = String(u || "forfait").toLowerCase().replace(/[€/\s]/g, "");
  const id = ALIAS[s] || s;
  return UNITA.find((x) => x.id === id) || UNITA[0];
}
