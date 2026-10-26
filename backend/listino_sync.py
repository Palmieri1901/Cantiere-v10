"""Ricalcolo delle righe "dal listino" (lavori esterni e preventivi) quando cambiano le Tariffe.
Specchio di frontend/src/components/ListinoPicker.jsx (vociListino)."""
from datetime import datetime, timezone
import logging

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


def _ricalcola_riga(t: dict, r: dict) -> bool:
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
    async for lav in db.lavori.find({"articoli_liberi.listino_id": {"$exists": True}, "pagato": {"$ne": True}}, {"_id": 0}):
        liberi = lav.get("articoli_liberi") or []
        delta_old = sum(float(x.get("totale") or 0) for x in liberi)
        if not any(_ricalcola_riga(t, r) for r in liberi if r.get("listino_id")):
            continue
        for r in liberi:
            r["totale"] = round(float(r.get("quantita") or 0) * float(r.get("prezzo_unitario") or 0), 2)
        costo_base = float(lav.get("costo") or 0) - delta_old
        costo = round(costo_base + sum(x["totale"] for x in liberi), 2)
        await db.lavori.update_one({"id": lav["id"]}, {"$set": {"articoli_liberi": liberi, "costo": costo, "updated_at": now}})
        lavori_agg += 1
    from routers.esterni import _calc
    async for p in db.preventivi_esterni.find({"righe.listino_id": {"$exists": True}, "lavoro_id": {"$in": [None, ""]}}, {"_id": 0}):
        righe = p.get("righe") or []
        if not any(_ricalcola_riga(t, r) for r in righe if r.get("listino_id")):
            continue
        p["righe"] = righe
        _calc(p)
        p["updated_at"] = now
        await db.preventivi_esterni.update_one({"id": p["id"]}, {"$set": {k: p[k] for k in ("righe", "imponibile", "sconto", "netto", "iva", "totale", "updated_at")}})
        prev_agg += 1
    return {"lavori_aggiornati": lavori_agg, "preventivi_aggiornati": prev_agg}
