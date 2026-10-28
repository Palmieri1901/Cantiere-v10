export { fmt, Field } from "@/pages/suzuki/common";

export const CATEGORIE = [
  { key: "privati", label: "Privati" },
  { key: "lavoro", label: "Lavoro" },
  { key: "concessionari", label: "Concessionari" },
];

export const EMPTY_GOMMONE = {
  modello: "", lunghezza_m: 0, larghezza_m: 0, diametro_tubolare_cm: 0, compartimenti: 0,
  portata_persone: 0, potenza_max_hp: 0, peso_kg: 0, carena: "", tessuto: "", lunghezza_interna_cm: 0, categoria_ce: "", potenza_min_hp: 0, specchio: "", dotazioni: "",
  note: "", prezzo_pubblico: 0, ordine: 0, accessori_serie: [], accessori_optional: [],
};

export const EMPTY_ACCESSORIO = { nome: "", descrizione: "", categoria: "", serie: "", specifiche: "", prezzo: 0, prezzi_per_modello: {}, di_serie: [] };

export const SERIE = ["Job", "Sirio", "Tsunami"];

// "GEB 620 Tsunami" -> { taglia: "620", serie: "Tsunami" }
export const parseModello = (nome = "") => {
  const taglia = (nome.match(/\b(\d{3})\b/) || [])[1] || "";
  const serie = SERIE.find((s) => nome.toLowerCase().includes(s.toLowerCase())) || "";
  return { taglia, serie };
};

export const taglieDaModelli = (modelli) => {
  const out = {};
  for (const m of modelli) {
    const { taglia, serie } = parseModello(m.modello);
    if (serie && taglia) (out[serie] ||= new Set()).add(taglia);
  }
  return Object.fromEntries(Object.entries(out).map(([s, set]) => [s, [...set].sort()]));
};

// prezzo IVA escl. per taglia: null = non disponibile, 0 = di serie
export const prezzoAccessorio = (a, taglia) => {
  if ((a.di_serie || []).includes(taglia)) return 0;
  const p = (a.prezzi_per_modello || {})[taglia];
  if (p != null && p > 0) return p;
  // Taglia senza prezzo specifico: si usa il prezzo base (se presente)
  return a.prezzo > 0 ? a.prezzo : null;
};

export const EMPTY_PREV_GOMMONE = {
  cliente_nome: "", cliente_telefono: "", cliente_email: "", tipo_cliente: "privati",
  gommone_id: "", modello: "", lunghezza_m: 0, larghezza_m: 0, diametro_tubolare_cm: 0,
  compartimenti: 0, portata_persone: 0, potenza_max_hp: 0, peso_kg: 0, carena: "", tessuto: "", lunghezza_interna_cm: 0, categoria_ce: "", potenza_min_hp: 0, specchio: "",
  dotazioni: "", prezzo_gommone: 0, sconto_perc: 0, accessori: [], accessori_serie: [],
  motore_modello: "", motore_prezzo: 0, motore_sconto_perc: 0, montaggio: 0, cavetteria: 0, batteria: 0,
  note: "", stato: "bozza", data: new Date().toISOString().slice(0, 10),
};

export const numOrZero = (v) => Number(v) || 0;

export const gommonePayload = (f) => ({
  ...f,
  lunghezza_m: numOrZero(f.lunghezza_m), larghezza_m: numOrZero(f.larghezza_m),
  diametro_tubolare_cm: numOrZero(f.diametro_tubolare_cm), compartimenti: Math.round(numOrZero(f.compartimenti)),
  portata_persone: Math.round(numOrZero(f.portata_persone)), potenza_max_hp: numOrZero(f.potenza_max_hp),
  peso_kg: numOrZero(f.peso_kg), lunghezza_interna_cm: numOrZero(f.lunghezza_interna_cm), potenza_min_hp: numOrZero(f.potenza_min_hp), prezzo_pubblico: numOrZero(f.prezzo_pubblico), ordine: Math.round(numOrZero(f.ordine)),
});
