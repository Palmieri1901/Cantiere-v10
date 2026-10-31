"""IVA per fornitore: il prezzo IVA inclusa di un articolo dipende dall'aliquota del suo fornitore (default 22%)."""
from database import db


async def iva_fornitori() -> dict:
    docs = await db.fornitori.find({}, {"_id": 0, "id": 1, "iva_percent": 1}).to_list(2000)
    return {f["id"]: float(f.get("iva_percent") if f.get("iva_percent") is not None else 22.0) for f in docs}


def prezzo_ivato(art: dict, iva_map: dict | None = None) -> float:
    iva = (iva_map or {}).get(art.get("fornitore_id") or "", 22.0)
    return round(float(art.get("prezzo_listino") or 0) * (1 + iva / 100), 2)
