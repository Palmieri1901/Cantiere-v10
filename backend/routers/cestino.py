"""Annulla eliminazione: ripristina i documenti salvati nel cestino da una richiesta DELETE."""
from fastapi import APIRouter, HTTPException

from database import db

router = APIRouter(prefix="/cestino", tags=["cestino"])


@router.post("/{batch}/ripristina")
async def ripristina(batch: str):
    voci = await db["_cestino"].find({"batch": batch}).to_list(5000)
    if not voci:
        raise HTTPException(404, "Niente da ripristinare (eliminazione troppo vecchia o già annullata)")
    for v in voci:
        await db[v["coll"]].replace_one({"_id": v["doc"]["_id"]}, v["doc"], upsert=True)
    await db["_cestino"].delete_many({"batch": batch})
    return {"ripristinati": len(voci)}
