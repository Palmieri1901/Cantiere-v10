"""Lavagna: messaggi/memo condivisi tra dipendenti e amministrazione (tutti possono modificare e cancellare)."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import db
from routers.mobile import get_dipendente

router = APIRouter(prefix="/lavagna")
mobile_router = APIRouter(prefix="/api/mobile/lavagna")

TIPI = ("memo", "manca", "commissione", "urgente")


class MessaggioIn(BaseModel):
    testo: str
    tipo: Optional[str] = "memo"


class MessaggioUpd(BaseModel):
    testo: Optional[str] = None
    tipo: Optional[str] = None
    fatto: Optional[bool] = None


async def _lista():
    docs = await db.lavagna.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return sorted(docs, key=lambda d: (d.get("fatto", False), -(datetime.fromisoformat(d["created_at"]).timestamp())))


async def _crea(p: MessaggioIn, autore: str, autore_id: str):
    testo = p.testo.strip()
    if not testo:
        raise HTTPException(400, "Scrivi un messaggio")
    now = datetime.now(timezone.utc).isoformat()
    doc = {"id": str(uuid.uuid4()), "testo": testo[:1000], "tipo": p.tipo if p.tipo in TIPI else "memo", "fatto": False,
           "autore": autore, "autore_id": autore_id, "created_at": now, "updated_at": now, "modificato_da": ""}
    await db.lavagna.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _aggiorna(mid: str, p: MessaggioUpd, autore: str):
    doc = await db.lavagna.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Messaggio non trovato")
    upd = {k: v for k, v in p.model_dump().items() if v is not None}
    if "testo" in upd:
        upd["testo"] = upd["testo"].strip()[:1000]
        if not upd["testo"]:
            raise HTTPException(400, "Il messaggio non può essere vuoto")
    if "tipo" in upd and upd["tipo"] not in TIPI:
        upd["tipo"] = "memo"
    if "fatto" in upd:
        upd["fatto_da"] = autore if upd["fatto"] else ""
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    upd["modificato_da"] = autore
    await db.lavagna.update_one({"id": mid}, {"$set": upd})
    return {**doc, **upd}


async def _elimina(mid: str):
    r = await db.lavagna.delete_one({"id": mid})
    if not r.deleted_count:
        raise HTTPException(404, "Messaggio non trovato")
    return {"ok": True}


# --- Gestionale (amministrazione) ---
@router.get("")
async def lista():
    return await _lista()


@router.post("")
async def crea(p: MessaggioIn):
    return await _crea(p, "Amministrazione", "admin")


@router.put("/{mid}")
async def aggiorna(mid: str, p: MessaggioUpd):
    return await _aggiorna(mid, p, "Amministrazione")


@router.delete("/{mid}")
async def elimina(mid: str):
    return await _elimina(mid)


# --- App dipendenti ---
@mobile_router.get("")
async def lista_mobile(dip: dict = Depends(get_dipendente)):
    return await _lista()


@mobile_router.post("")
async def crea_mobile(p: MessaggioIn, dip: dict = Depends(get_dipendente)):
    return await _crea(p, dip.get("nome", ""), dip["id"])


@mobile_router.put("/{mid}")
async def aggiorna_mobile(mid: str, p: MessaggioUpd, dip: dict = Depends(get_dipendente)):
    return await _aggiorna(mid, p, dip.get("nome", ""))


@mobile_router.delete("/{mid}")
async def elimina_mobile(mid: str, dip: dict = Depends(get_dipendente)):
    return await _elimina(mid)
