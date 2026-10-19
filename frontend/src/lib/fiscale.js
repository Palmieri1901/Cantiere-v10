// Validazione formale codice fiscale e partita IVA (specchio di backend/fiscale.py)
const CF_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
const ALFA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DISPARI = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
const PARI = [...Array(10).keys(), ...Array(26).keys()];

export function validaPiva(p) {
  p = (p || "").replace(/\D/g, "");
  if (!p) return "";
  if (p.length !== 11) return "La partita IVA deve avere 11 cifre";
  let s = 0;
  for (let i = 0; i < 10; i++) { let n = Number(p[i]); if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } s += n; }
  return (10 - (s % 10)) % 10 === Number(p[10]) ? "" : "Partita IVA non valida (cifra di controllo errata)";
}

export function validaCf(cf) {
  cf = (cf || "").trim().toUpperCase();
  if (!cf) return "";
  if (/^\d{11}$/.test(cf)) return validaPiva(cf);
  if (cf.length !== 16) return "Il codice fiscale deve avere 16 caratteri";
  if (!CF_RE.test(cf)) return "Codice fiscale non valido (formato)";
  let s = 0;
  for (let i = 0; i < 15; i++) { const k = ALFA.indexOf(cf[i]); s += i % 2 === 0 ? DISPARI[k] : PARI[k]; }
  return "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[s % 26] === cf[15] ? "" : "Codice fiscale non valido (carattere di controllo errato)";
}

export const validaCap = (c) => (!c || /^\d{5}$/.test(c) ? "" : "Il CAP deve avere 5 cifre");
export const validaProvincia = (p) => (!p || /^[A-Za-z]{2}$/.test(p) ? "" : "Sigla provincia di 2 lettere");
