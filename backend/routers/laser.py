"""LaserLogo: foto condivise tra dispositivi (salvate come data URL JPEG in MongoDB)."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db

router = APIRouter(prefix="/laser")
MAX_FOTO = 40


class FotoIn(BaseModel):
    id: Optional[str] = None
    name: str
    url: str  # data:image/jpeg;base64,...


@router.get("/foto")
async def lista():
    return await db.laser_foto.find({}, {"_id": 0}).sort("created_at", 1).to_list(MAX_FOTO)


@router.post("/foto")
async def salva(p: FotoIn):
    if not p.url.startswith("data:image/") or len(p.url) > 3_000_000:
        raise HTTPException(400, "Immagine non valida o troppo grande (max ~2 MB)")
    if await db.laser_foto.count_documents({}) >= MAX_FOTO:
        raise HTTPException(400, f"Massimo {MAX_FOTO} foto: elimina quelle che non servono")
    doc = {"id": p.id or str(uuid.uuid4()), "name": p.name[:120], "url": p.url, "created_at": datetime.now(timezone.utc).isoformat()}
    await db.laser_foto.update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
    return {k: v for k, v in doc.items() if k != "url"}


@router.delete("/foto/{fid}")
async def elimina(fid: str):
    await db.laser_foto.delete_one({"id": fid})
    return {"ok": True}
