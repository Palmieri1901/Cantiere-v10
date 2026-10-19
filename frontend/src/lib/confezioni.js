// Unità "contenitore" → unità base; contenuto obbligatorio. Per lt/kg/mt/mq il contenuto è facoltativo.
export const CONTENITORI = { cf: "pz", conf: "pz", confezione: "pz", pacco: "pz", scatola: "pz", rotolo: "mt", bobina: "mt", latta: "lt", lattina: "lt", tanica: "lt", fusto: "lt", flacone: "lt", sacco: "kg", secchio: "kg" };
export const UNITA_BASE = ["lt", "kg", "mt", "m", "mq"];
const ETICH = { pz: "pezzi", lt: "litri", kg: "kg", mt: "metri", mq: "mq" };

export function conversione(um) {
  const u = (um || "").toLowerCase().trim();
  if (CONTENITORI[u]) return { finale: CONTENITORI[u], obbligatorio: true, etichetta: ETICH[CONTENITORI[u]] };
  if (UNITA_BASE.includes(u)) { const f = u === "m" ? "mt" : u; return { finale: f, obbligatorio: false, etichetta: ETICH[f] }; }
  return null;
}
export const isContenitore = (um) => !!conversione(um)?.obbligatorio;
export const UNITA_SCELTA = ["pz", "lt", "kg", "mt", "mq", "rotolo", "cf", "latta", "sacco", "cad", "set", "paio"];
