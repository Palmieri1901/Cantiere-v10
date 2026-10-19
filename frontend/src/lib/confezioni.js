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
const ALIAS = { pz: "pz", "pz.": "pz", pcs: "pz", pc: "pz", pezzi: "pz", pezzo: "pz", n: "pz", "n.": "pz", nr: "pz", num: "pz", cad: "pz", cadauno: "pz", un: "pz", unit: "pz", "": "pz",
  lt: "lt", l: "lt", litri: "lt", litro: "lt", kg: "kg", chili: "kg", chilogrammi: "kg", g: "kg", mt: "mt", m: "mt", ml: "mt", metri: "mt", metro: "mt", mq: "mq", m2: "mq", "m²": "mq",
  cf: "cf", "cf.": "cf", conf: "cf", cnf: "cf", confezione: "cf", confezioni: "cf", sc: "cf", scat: "cf", scatola: "cf", pacco: "cf", bl: "cf", blister: "cf",
  rotolo: "rotolo", rotoli: "rotolo", rt: "rotolo", rot: "rotolo", bobina: "rotolo", latta: "latta", lattina: "latta", tanica: "latta", fusto: "latta", flacone: "latta", sacco: "sacco", sacchi: "sacco", secchio: "sacco", set: "set", kit: "set", paio: "paio", pa: "paio" };
// Normalizza la sigla letta dal DDT in una delle unità gestite (default pz)
export const normalizzaUm = (um) => { const u = String(um || "").trim().toLowerCase().replace(/\s+/g, ""); return ALIAS[u] || (UNITA_SCELTA.includes(u) ? u : "pz"); };
