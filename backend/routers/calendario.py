import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db

router = APIRouter(prefix="/calendario")

TIPI_DEFAULT = [
    {"id": "alaggio", "nome": "Alaggio", "colore": "#2563eb"},
    {"id": "varo", "nome": "Varo", "colore": "#0d9488"},
    {"id": "altro", "nome": "Altro", "colore": "#6b7280"},
]


class TipoIn(BaseModel):
    id: Optional[str] = None
    nome: str
    colore: str = "#6b7280"


class EventoIn(BaseModel):
    data: str
    ora: Optional[str] = ""
    titolo: str
    tipo_id: str = "altro"
    note: Optional[str] = ""


def _now():
    return datetime.now(timezone.utc).isoformat()


async def _tipi():
    doc = await db.app_settings.find_one({"id": "calendario_tipi"}, {"_id": 0})
    return doc["tipi"] if doc else TIPI_DEFAULT


@router.get("/tipi")
async def get_tipi():
    return await _tipi()


@router.put("/tipi")
async def put_tipi(tipi: List[TipoIn]):
    puliti = [{"id": t.id or str(uuid.uuid4()), "nome": t.nome.strip(), "colore": t.colore} for t in tipi if t.nome.strip()]
    if not puliti:
        raise HTTPException(400, "Serve almeno un tipo")
    await db.app_settings.update_one({"id": "calendario_tipi"}, {"$set": {"tipi": puliti}}, upsert=True)
    return puliti


@router.get("/eventi")
async def list_eventi(anno: int, mese: Optional[int] = None):
    if mese:
        q = {"data": {"$regex": f"^{anno}-{mese:02d}-"}}
    else:
        q = {"data": {"$regex": f"^{anno}-"}}
    return await db.calendario_eventi.find(q, {"_id": 0}).sort([("data", 1), ("ora", 1)]).to_list(5000)


@router.get("/conteggio-mesi")
async def conteggio_mesi(anno: int):
    pipe = [{"$match": {"data": {"$regex": f"^{anno}-"}}},
            {"$group": {"_id": {"$substr": ["$data", 5, 2]}, "n": {"$sum": 1}}}]
    rows = await db.calendario_eventi.aggregate(pipe).to_list(12)
    return {int(r["_id"]): r["n"] for r in rows}


@router.post("/eventi")
async def crea_evento(p: EventoIn):
    if not p.titolo.strip():
        raise HTTPException(400, "Titolo obbligatorio")
    doc = {**p.model_dump(), "titolo": p.titolo.strip(), "id": str(uuid.uuid4()), "created_at": _now()}
    await db.calendario_eventi.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/eventi/{eid}")
async def aggiorna_evento(eid: str, p: EventoIn):
    if not p.titolo.strip():
        raise HTTPException(400, "Titolo obbligatorio")
    r = await db.calendario_eventi.update_one({"id": eid}, {"$set": {**p.model_dump(), "titolo": p.titolo.strip(), "updated_at": _now()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Evento non trovato")
    return await db.calendario_eventi.find_one({"id": eid}, {"_id": 0})


@router.delete("/eventi/{eid}")
async def elimina_evento(eid: str):
    r = await db.calendario_eventi.delete_one({"id": eid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Evento non trovato")
    return {"ok": True}
