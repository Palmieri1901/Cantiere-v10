"""Ricalcolo delle righe "dal listino" (lavori esterni e preventivi) quando cambiano le Tariffe.
Specchio di frontend/src/components/ListinoPicker.jsx (vociListino)."""
from datetime import datetime, timezone
import logging
import re

logger = logging.getLogger(__name__)

_FISSI = {"motore_2_15": "motore_labor_2_15hp", "motore_16_40": "motore_labor_fino_40hp", "motore_41_150": "motore_labor_40_150hp",
          "motore_oltre_150": "motore_labor_oltre_150hp", "motore_entrobordo": "motore_labor_entrobordo"}
_PER_M = {"movimentazione": "costo_movimentazione_per_metro", "taccaggio": "costo_taccaggio_per_metro", "scafo_sporco": "maggiorazione_scafo_sporco_per_metro",
          "lavaggio_inizio": "costo_lavaggio_inizio_stagione", "lavaggio_fine": "costo_lavaggio_fine_stagione"}
_PER_Q = {"sosta_temp": "sosta_temporanea_giornaliera", "manodopera": "costo_orario_manodopera", "girante": "costo_girante", "olio_motore": "costo_olio_motore",
          "filtro_olio": "costo_filtro_olio", "candela": "costo_candela", "termostato": "costo_termostato", "olio_piede": "costo_olio_piede",
          "anodi_interni": "costo_anodi_interni", "anodi_esterni": "costo_anodi_esterni", "ingrassaggio": "costo_ingrassaggio"}
_PER_MQ = {"copertura": "copertura_per_metro", "antivegetativa": "antivegetativa_per_metro"}


def totale_listino(t: dict, voce_id: str, q: float, q2: float):
    """Ritorna (quantita, totale) con le tariffe correnti, oppure None se la voce non è ricalcolabile."""
    g = lambda k: float(t.get(k) or 0)  # noqa: E731
    if voce_id in _FISSI:
        return 1, round(g(_FISSI[voce_id]), 2)
    if voce_id in _PER_M:
        return q, round(q * g(_PER_M[voce_id]), 2)
    if voce_id in _PER_Q:
        return q, round(q * g(_PER_Q[voce_id]), 2)
    if voce_id in _PER_MQ:
        mq = round(q * q2, 2)
        return mq, round(mq * g(_PER_MQ[voce_id]), 2)
    if voce_id in ("alaggio", "varo"):
        fisso, oltre = (g("alaggio_fino_5m"), g("alaggio_oltre_5m_per_metro")) if voce_id == "alaggio" else (g("varo_fino_5m"), g("varo_oltre_5m_per_metro"))
        return 1, round(fisso if q <= 5 else oltre, 2)
    if voce_id.startswith("extra_"):
        try:
            s = (t.get("servizi_extra") or [])[int(voce_id[6:])]
        except (ValueError, IndexError):
            return None
        prezzo = float(s.get("prezzo") or 0)
        unita = str(s.get("unita") or "forfait").lower()
        a_quantita = unita not in ("", "forfait", "cad", "cadauno")
        qq = q if a_quantita else 1
        return qq, round(qq * prezzo, 2)
    return None


_NUM = r"(\d+(?:[.,]\d+)?)"
_fnum = lambda s: float(str(s).replace(",", "."))  # noqa: E731
_PATTERNS = [
    (re.compile(rf"^(Copertura|Antivegetativa) {_NUM} × {_NUM} m", re.I), lambda m: ({"copertura": "copertura", "antivegetativa": "antivegetativa"}[m.group(1).lower()], _fnum(m.group(2)), _fnum(m.group(3)))),
    (re.compile(rf"^(Movimentazione|Taccaggio|Maggiorazione scafo sporco|Lavaggio inizio stagione|Lavaggio fine stagione) barca {_NUM} m", re.I),
     lambda m: ({"movimentazione": "movimentazione", "taccaggio": "taccaggio", "maggiorazione scafo sporco": "scafo_sporco", "lavaggio inizio stagione": "lavaggio_inizio", "lavaggio fine stagione": "lavaggio_fine"}[m.group(1).lower()], _fnum(m.group(2)), 0)),
    (re.compile(rf"^Sosta temporanea {_NUM} giorni", re.I), lambda m: ("sosta_temp", _fnum(m.group(1)), 0)),
    (re.compile(rf"^(Alaggio|Varo) barca {_NUM} m", re.I), lambda m: (m.group(1).lower(), _fnum(m.group(2)), 0)),
    (re.compile(rf"^Manodopera {_NUM} h", re.I), lambda m: ("manodopera", _fnum(m.group(1)), 0)),
    (re.compile(rf"^(Girante|Olio motore|Filtro olio|Candele|Termostato|Olio piede|Kit anodi interni|Kit anodi esterni|Ingrassaggio) × {_NUM}", re.I),
     lambda m: ({"girante": "girante", "olio motore": "olio_motore", "filtro olio": "filtro_olio", "candele": "candela", "termostato": "termostato", "olio piede": "olio_piede",
                 "kit anodi interni": "anodi_interni", "kit anodi esterni": "anodi_esterni", "ingrassaggio": "ingrassaggio"}[m.group(1).lower()], _fnum(m.group(2)), 0)),
]
_FISSI_NOMI = {"manodopera fuoribordo 2-15 hp": "motore_2_15", "manodopera fuoribordo 16-40 hp": "motore_16_40", "manodopera fuoribordo 41-150 hp": "motore_41_150",
               "manodopera fuoribordo oltre 150 hp": "motore_oltre_150", "manodopera entrobordo": "motore_entrobordo"}


def _inferisci_listino(r: dict) -> bool:
    """Righe create prima del collegamento al listino: ricava voce e misura dalla descrizione generata dal picker."""
    d = str(r.get("descrizione") or "").strip()
    if not d:
        return False
    if d.lower() in _FISSI_NOMI:
        r["listino_id"], r["listino_q"], r["listino_q2"] = _FISSI_NOMI[d.lower()], 1, 0
        return True
    for rx, fn in _PATTERNS:
        m = rx.match(d)
        if m:
            r["listino_id"], r["listino_q"], r["listino_q2"] = fn(m)
            return True
    return False


def _ricalcola_riga(t: dict, r: dict) -> bool:
    if not r.get("listino_id") and not _inferisci_listino(r):
        return False
    res = totale_listino(t, r.get("listino_id") or "", float(r.get("listino_q") or 0), float(r.get("listino_q2") or 0))
    if not res:
        return False
    quantita, totale = res
    pu = round(totale / quantita, 4) if quantita else totale
    if abs(pu - float(r.get("prezzo_unitario") or 0)) < 0.00005 and abs(quantita - float(r.get("quantita") or 0)) < 0.005:
        return False
    r["quantita"], r["prezzo_unitario"], r["totale"] = quantita, pu, totale
    return True


async def aggiorna_conti_esterni(db, t: dict) -> dict:
    """Aggiorna le righe dal listino di lavori (articoli_liberi) e preventivi esterni non ancora fatturati."""
    now = datetime.now(timezone.utc).isoformat()
    lavori_agg = prev_agg = 0
    async for lav in db.lavori.find({"pagato": {"$ne": True}, "articoli_liberi.0": {"$exists": True}}, {"_id": 0}):
        liberi = lav.get("articoli_liberi") or []
        delta_old = sum(float(x.get("totale") or 0) for x in liberi)
        if not any([_ricalcola_riga(t, r) for r in liberi]):
            continue
        for r in liberi:
            r["totale"] = round(float(r.get("quantita") or 0) * float(r.get("prezzo_unitario") or 0), 2)
        costo_base = float(lav.get("costo") or 0) - delta_old
        costo = round(costo_base + sum(x["totale"] for x in liberi), 2)
        await db.lavori.update_one({"id": lav["id"]}, {"$set": {"articoli_liberi": liberi, "costo": costo, "updated_at": now}})
        lavori_agg += 1
    from routers.esterni import _calc
    async for p in db.preventivi_esterni.find({"righe.0": {"$exists": True}, "lavoro_id": {"$in": [None, ""]}}, {"_id": 0}):
        righe = p.get("righe") or []
        if not any([_ricalcola_riga(t, r) for r in righe if r.get("tipo") != "articolo"]):
            continue
        p["righe"] = righe
        _calc(p)
        p["updated_at"] = now
        await db.preventivi_esterni.update_one({"id": p["id"]}, {"$set": {k: p[k] for k in ("righe", "imponibile", "sconto", "netto", "iva", "totale", "updated_at")}})
        prev_agg += 1
    return {"lavori_aggiornati": lavori_agg, "preventivi_aggiornati": prev_agg}
