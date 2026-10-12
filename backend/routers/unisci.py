"""Unione di clienti duplicati: i riferimenti del secondario passano al principale, poi il secondario viene eliminato."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db

router = APIRouter()


class UnisciIn(BaseModel):
    principale_id: str
    secondario_id: str
    anteprima: bool = False


RIFERIMENTI = [("lavori", "cliente_id"), ("lavori_pending", "cliente_id"), ("movimenti_magazzino", "cliente_id"), ("preventivi_esterni", "esterno_id")]


async def _unisci(coll: str, p: UnisciIn, label):
    if p.principale_id == p.secondario_id:
        raise HTTPException(400, "Scegli due clienti diversi")
    princ = await db[coll].find_one({"id": p.principale_id}, {"_id": 0})
    sec = await db[coll].find_one({"id": p.secondario_id}, {"_id": 0})
    if not princ or not sec:
        raise HTTPException(404, "Cliente non trovato")
    conteggi = {}
    totale = 0.0
    for c, campo in RIFERIMENTI:
        conteggi[c] = await db[c].count_documents({campo: p.secondario_id})
    async for l in db.lavori.find({"cliente_id": p.secondario_id}, {"_id": 0, "costo": 1}):
        totale += float(l.get("costo") or 0)
    out = {"principale": label(princ), "secondario": label(sec), "lavori": conteggi["lavori"], "totale_lavori": round(totale, 2),
           "da_approvare": conteggi["lavori_pending"], "movimenti": conteggi["movimenti_magazzino"], "preventivi": conteggi["preventivi_esterni"]}
    if p.anteprima:
        return out
    for c, campo in RIFERIMENTI:
        await db[c].update_many({campo: p.secondario_id}, {"$set": {campo: p.principale_id}})
    if coll == "clienti":
        await db.lavori_pending.update_many({"cliente_id": p.principale_id}, {"$set": {"cliente_nome": label(princ)}})
    else:
        await db.lavori_pending.update_many({"cliente_id": p.principale_id}, {"$set": {"cliente_nome": label(princ), "esterno": True}})
    await db[coll].delete_one({"id": p.secondario_id})
    return {**out, "ok": True}


@router.post("/clienti/unisci")
async def unisci_clienti(p: UnisciIn):
    return await _unisci("clienti", p, lambda c: f"{c.get('cognome','')} {c.get('nome','')}".strip())


@router.post("/esterni/unisci")
async def unisci_esterni(p: UnisciIn):
    return await _unisci("clienti_esterni", p, lambda c: c.get("nome", ""))
