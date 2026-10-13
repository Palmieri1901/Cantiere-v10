"""API pubbliche per l'app dipendenti (PWA / Android). Autenticazione via header X-Api-Key."""
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from database import db
from routers.dipendenti import hash_key, inserisci_pending

router = APIRouter(prefix="/api/mobile")


async def get_dipendente(x_api_key: str = Header(default="")) -> dict:
    if not x_api_key:
        raise HTTPException(401, "Chiave mancante")
    dip = await db.dipendenti.find_one({"key_hash": hash_key(x_api_key)}, {"_id": 0, "key_hash": 0})
    if not dip or not dip.get("attivo", True):
        raise HTTPException(401, "Chiave non valida o disattivata")
    await db.dipendenti.update_one({"id": dip["id"]}, {"$set": {"ultimo_accesso": datetime.now(timezone.utc).isoformat()}})
    return dip


class LavoriBatch(BaseModel):
    lavori: List[dict]


@router.get("/me")
async def me(dip: dict = Depends(get_dipendente)):
    cant = await db.cantiere.find_one({"id": "default"}, {"_id": 0, "nome": 1}) or {}
    return {"id": dip["id"], "nome": dip["nome"], "cantiere": cant.get("nome", "Gestionale GEBnautica")}


@router.get("/clienti")
async def clienti(dip: dict = Depends(get_dipendente)):
    docs = await db.clienti.find({}, {"_id": 0, "id": 1, "nome": 1, "cognome": 1, "tipo_barca": 1, "lunghezza": 1, "anno": 1, "posto_barca": 1}).to_list(5000)
    # un solo record per persona: scheda dell'anno corrente se esiste, altrimenti la più vicina
    anno_corr = datetime.now().year
    best = {}
    for d in docs:
        k = (d.get("cognome", "").strip().lower(), d.get("nome", "").strip().lower())
        dist = abs(int(d.get("anno") or 0) - anno_corr) + (0 if int(d.get("anno") or 0) <= anno_corr else 0.5)
        if k not in best or dist < best[k][0]:
            best[k] = (dist, d)
    out = sorted((v[1] for v in best.values()), key=lambda d: (d.get("cognome", ""), d.get("nome", "")))
    esterni = await db.clienti_esterni.find({}, {"_id": 0, "id": 1, "nome": 1}).sort("nome", 1).to_list(2000)
    out += [{"id": e["id"], "cognome": e["nome"], "nome": "", "tipo_barca": "Cliente esterno", "anno": anno_corr, "esterno": True} for e in esterni]
    return out


@router.get("/articoli")
async def articoli(dip: dict = Depends(get_dipendente)):
    return await db.articoli.find({}, {"_id": 0, "id": 1, "codice": 1, "barcode": 1, "nome": 1, "categoria": 1, "quantita": 1, "unita": 1, "unita_misura": 1, "prezzo_listino": 1}).sort("nome", 1).to_list(5000)


@router.post("/lavori")
async def invia_lavori(payload: LavoriBatch, dip: dict = Depends(get_dipendente)):
    nuovi = await inserisci_pending(payload.lavori, dip, "api")
    return {"ok": True, "ricevuti": len(payload.lavori), "nuovi": nuovi}
