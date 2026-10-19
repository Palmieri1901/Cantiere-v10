"""Validazione formale codice fiscale e partita IVA italiani + separazione indirizzo."""
import re

_CF_RE = re.compile(r"^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$")
_DISPARI = {c: v for c, v in zip("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ",
            [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23])}
_PARI = {c: v for c, v in zip("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ", list(range(10)) + list(range(26)))}


def valida_cf(cf: str) -> str:
    """Ritorna '' se valido, altrimenti il messaggio d'errore. Accetta anche P.IVA (11 cifre) come CF di azienda."""
    cf = (cf or "").strip().upper()
    if not cf:
        return ""
    if re.fullmatch(r"\d{11}", cf):
        return valida_piva(cf)
    if len(cf) != 16:
        return "Il codice fiscale deve avere 16 caratteri"
    if not _CF_RE.match(cf):
        return "Codice fiscale non valido (formato)"
    s = sum(_DISPARI[c] if i % 2 == 0 else _PARI[c] for i, c in enumerate(cf[:15]))
    if "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[s % 26] != cf[15]:
        return "Codice fiscale non valido (carattere di controllo errato)"
    return ""


def valida_piva(p: str) -> str:
    p = re.sub(r"\D", "", p or "")
    if not p:
        return ""
    if len(p) != 11:
        return "La partita IVA deve avere 11 cifre"
    s = 0
    for i, ch in enumerate(p[:10]):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        s += n
    if (10 - s % 10) % 10 != int(p[10]):
        return "Partita IVA non valida (cifra di controllo errata)"
    return ""


def separa_indirizzo(ind: str) -> dict:
    """'Via Roma 1, 57037 Portoferraio (LI)' → via/cap/citta/provincia (best effort)."""
    out = {"via": (ind or "").strip(), "cap": "", "citta": "", "provincia": ""}
    m = re.search(r"^(.*?)[,\s]+(\d{5})\s+(.+?)(?:\s*\(?\b([A-Z]{2})\)?)?\s*$", out["via"], re.I)
    if m:
        out.update(via=m.group(1).strip(" ,"), cap=m.group(2), citta=m.group(3).strip(" ,"), provincia=(m.group(4) or "").upper())
    return out


def componi_indirizzo(d: dict) -> str:
    via, cap, citta, prov = (str(d.get(k) or "").strip() for k in ("via", "cap", "citta", "provincia"))
    loc = " ".join(x for x in [cap, citta] if x) + (f" ({prov})" if prov else "")
    return ", ".join(x for x in [via, loc] if x)
