"""Cestino: elenco delle eliminazioni degli ultimi 7 giorni e ripristino (eliminati, modificati, creati nella stessa richiesta)."""
import time

from fastapi import APIRouter, HTTPException
from pymongo.errors import DuplicateKeyError

from database import db

router = APIRouter(prefix="/cestino", tags=["cestino"])
GIORNI = 7
ETICHETTE = {
    "clienti": "Cliente rimessaggio", "lavori": "Lavoro", "clienti_esterni": "Cliente esterno", "preventivi_esterni": "Preventivo",
    "articoli": "Articolo di magazzino", "anagrafica": "Anagrafica", "mezzi": "Mezzo", "contratti": "Contratto", "dipendenti": "Dipendente",
    "movimenti": "Movimento di magazzino", "ddt": "DDT", "preventivi": "Preventivo", "tariffe": "Voce di listino", "fornitori": "Fornitore",
}


def _nome(d: dict) -> str:
    for k in ("ragione_sociale", "nome_completo", "nome", "descrizione", "oggetto", "titolo", "codice", "numero"):
        v = d.get(k)
        if v:
            return f"{d.get('cognome', '')} {v}".strip() if k == "nome" else str(v)
    return ""


async def _pulisci():
    await db["_cestino"].delete_many({"ts": {"$lt": time.time() - GIORNI * 86400}})


@router.get("")
async def elenco():
    await _pulisci()
    out = []
    for g in await db["_cestino"].aggregate([
        {"$match": {"tipo": {"$ne": "nuovo"}}},
        {"$sort": {"seq": -1}},
        {"$group": {"_id": "$batch", "ts": {"$max": "$ts"}, "path": {"$first": "$path"}, "voci": {"$push": {"tipo": "$tipo", "coll": "$coll", "doc": "$doc"}}}},
        {"$sort": {"ts": -1}}, {"$limit": 300},
    ]).to_list(300):
        el = [v for v in g["voci"] if v.get("tipo", "eliminato") == "eliminato"]
        if not el:
            continue
        # elemento principale: quello indicato nell'indirizzo della richiesta, altrimenti il primo cancellato
        path = g.get("path") or ""
        main = next((v for v in el if v["doc"].get("id") and str(v["doc"]["id"]) in path), el[-1])
        out.append({"batch": g["_id"], "ts": g["ts"], "tipo": ETICHETTE.get(main["coll"], main["coll"].replace("_", " ").capitalize()),
                    "nome": _nome(main["doc"]), "collegati": len(el) - 1})
    return out


@router.post("/{batch}/ripristina")
async def ripristina(batch: str):
    voci = await db["_cestino"].find({"batch": batch}).sort("seq", -1).to_list(20000)
    if not voci:
        raise HTTPException(404, "Niente da ripristinare (eliminazione troppo vecchia o gi\u00e0 annullata)")
    limite = max(v["ts"] for v in voci) + 5
    n = saltati = 0
    try:
        for v in voci:  # in ordine inverso: annulla prima le ultime operazioni
            coll, _id = db[v["coll"]], v["doc"]["_id"]
            if v.get("tipo") in ("nuovo", "prima"):
                cur = await coll.find_one({"_id": _id}, {"_sync_ts": 1})
                if cur and float(cur.get("_sync_ts") or 0) > limite:
                    saltati += 1  # modificato dopo l'eliminazione: non tornare indietro su dati pi\u00f9 recenti
                    continue
            if v.get("tipo") == "nuovo":
                await coll.delete_one({"_id": _id})
            else:
                await coll.replace_one({"_id": _id}, v["doc"], upsert=True)
                n += v.get("tipo", "eliminato") == "eliminato"
    except DuplicateKeyError:
        raise HTTPException(409, "Non posso ripristinare: nel frattempo \u00e8 stato creato un elemento con lo stesso codice")
    await db["_cestino"].delete_many({"batch": batch})
    await _pulisci()
    return {"ripristinati": n, "non_riportati": saltati}
