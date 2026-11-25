"""Annulla eliminazione: riporta il database com'era prima della richiesta DELETE (eliminati, modificati, creati)."""
import time

from fastapi import APIRouter, HTTPException
from pymongo.errors import DuplicateKeyError

from database import db

router = APIRouter(prefix="/cestino", tags=["cestino"])


@router.post("/{batch}/ripristina")
async def ripristina(batch: str):
    voci = await db["_cestino"].find({"batch": batch}).sort("seq", -1).to_list(20000)
    if not voci:
        raise HTTPException(404, "Niente da ripristinare (eliminazione troppo vecchia o già annullata)")
    n = 0
    try:
        for v in voci:  # in ordine inverso: annulla prima le ultime operazioni
            if v.get("tipo") == "nuovo":
                await db[v["coll"]].delete_one({"_id": v["doc"]["_id"]})
            else:
                await db[v["coll"]].replace_one({"_id": v["doc"]["_id"]}, v["doc"], upsert=True)
                n += v.get("tipo", "eliminato") == "eliminato"
    except DuplicateKeyError:
        raise HTTPException(409, "Non posso ripristinare: nel frattempo è stato creato un elemento con lo stesso codice")
    await db["_cestino"].delete_many({"batch": batch})
    # conserva le copie solo 24 ore
    await db["_cestino"].delete_many({"ts": {"$lt": time.time() - 86400}})
    return {"ripristinati": n}
