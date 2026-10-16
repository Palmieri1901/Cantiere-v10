"""Unione di clienti duplicati: i riferimenti del secondario passano al principale, poi il secondario viene eliminato."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db

router = APIRouter()


class UnisciIn(BaseModel):
    principale_id: str
    secondario_id: str
    anteprima: bool = False
    principale_tipo: str = ""   # "clienti" (rimessaggio) | "esterni" (lavorazioni esterne)
    secondario_tipo: str = ""


RIFERIMENTI = [("lavori", "cliente_id"), ("lavori_pending", "cliente_id"), ("movimenti_magazzino", "cliente_id"), ("preventivi_esterni", "esterno_id")]


COLL = {"clienti": "clienti", "esterni": "clienti_esterni"}
LABEL = {"clienti": lambda c: f"{c.get('cognome','')} {c.get('nome','')}".strip(), "esterni": lambda c: c.get("nome", "")}
TIPO_LABEL = {"clienti": "Rimessaggio", "esterni": "Lavorazioni esterne"}


async def _unisci(default_tipo: str, p: UnisciIn):
    if p.principale_id == p.secondario_id:
        raise HTTPException(400, "Scegli due clienti diversi")
    tp, ts = p.principale_tipo or default_tipo, p.secondario_tipo or default_tipo
    if tp not in COLL or ts not in COLL:
        raise HTTPException(400, "Tipo cliente non valido")
    princ = await db[COLL[tp]].find_one({"id": p.principale_id}, {"_id": 0})
    sec = await db[COLL[ts]].find_one({"id": p.secondario_id}, {"_id": 0})
    if not princ or not sec:
        raise HTTPException(404, "Cliente non trovato")
    label, coll = LABEL[tp], COLL[tp]
    conteggi = {}
    totale = 0.0
    for c, campo in RIFERIMENTI:
        conteggi[c] = await db[c].count_documents({campo: p.secondario_id})
    async for l in db.lavori.find({"cliente_id": p.secondario_id}, {"_id": 0, "costo": 1}):
        totale += float(l.get("costo") or 0)
    out = {"principale": label(princ), "secondario": LABEL[ts](sec), "principale_tipo": TIPO_LABEL[tp], "secondario_tipo": TIPO_LABEL[ts], "lavori": conteggi["lavori"], "totale_lavori": round(totale, 2),
           "da_approvare": conteggi["lavori_pending"], "movimenti": conteggi["movimenti_magazzino"], "preventivi": conteggi["preventivi_esterni"]}
    if p.anteprima:
        return out
    for c, campo in RIFERIMENTI:
        await db[c].update_many({campo: p.secondario_id}, {"$set": {campo: p.principale_id}})
    if coll == "clienti":
        await db.lavori_pending.update_many({"cliente_id": p.principale_id}, {"$set": {"cliente_nome": label(princ)}})
    else:
        await db.lavori_pending.update_many({"cliente_id": p.principale_id}, {"$set": {"cliente_nome": label(princ), "esterno": True}})
    await db[COLL[ts]].delete_one({"id": p.secondario_id})
    return {**out, "ok": True}


@router.post("/clienti/unisci")
async def unisci_clienti(p: UnisciIn):
    return await _unisci("clienti", p)


@router.post("/esterni/unisci")
async def unisci_esterni(p: UnisciIn):
    return await _unisci("esterni", p)
