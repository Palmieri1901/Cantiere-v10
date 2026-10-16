"""Anagrafica generale: dati anagrafici/fiscali condivisi, alimentata da Rimessaggio, Esterni o inserimento diretto."""
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db
from helpers import capitalizza_nome

router = APIRouter()

CAMPI = ("nome", "cognome", "tipo_soggetto", "ragione_sociale", "partita_iva", "codice_sdi", "pec",
         "codice_fiscale", "indirizzo", "telefono", "cellulare", "email", "note")


class AnagraficaIn(BaseModel):
    nome: str = ""
    cognome: str = ""
    tipo_soggetto: Optional[str] = "privato"
    ragione_sociale: Optional[str] = ""
    partita_iva: Optional[str] = ""
    codice_sdi: Optional[str] = ""
    pec: Optional[str] = ""
    codice_fiscale: Optional[str] = ""
    indirizzo: Optional[str] = ""
    telefono: Optional[str] = ""
    cellulare: Optional[str] = ""
    email: Optional[str] = ""
    note: Optional[str] = ""


def _norm(d: dict) -> dict:
    out = {k: str(d.get(k) or "").strip() for k in CAMPI}
    out["nome"], out["cognome"] = capitalizza_nome(out["nome"]), capitalizza_nome(out["cognome"])
    out["tipo_soggetto"] = out["tipo_soggetto"] if out["tipo_soggetto"] in ("privato", "azienda") else "privato"
    out["codice_fiscale"], out["codice_sdi"] = out["codice_fiscale"].upper(), out["codice_sdi"].upper()
    out["partita_iva"] = re.sub(r"\D", "", out["partita_iva"])
    if out["tipo_soggetto"] == "azienda" and not out["ragione_sociale"]:
        raise HTTPException(400, "Intestazione (ragione sociale) obbligatoria per le aziende")
    if not out["cognome"] and not out["ragione_sociale"]:
        raise HTTPException(400, "Inserisci almeno il cognome o la ragione sociale")
    return out


async def _trova_esistente(d: dict) -> Optional[dict]:
    if d["partita_iva"]:
        hit = await db.anagrafica.find_one({"partita_iva": d["partita_iva"]}, {"_id": 0})
        if hit:
            return hit
    if d["codice_fiscale"]:
        hit = await db.anagrafica.find_one({"codice_fiscale": d["codice_fiscale"]}, {"_id": 0})
        if hit:
            return hit
    if d["cognome"]:
        return await db.anagrafica.find_one({"cognome": re.compile(f"^{re.escape(d['cognome'])}$", re.I),
                                              "nome": re.compile(f"^{re.escape(d['nome'])}$", re.I)}, {"_id": 0})
    return None


async def upsert_anagrafica(d: dict, origine: str) -> dict:
    """Crea o aggiorna (senza sovrascrivere con vuoti) la voce in anagrafica. Ritorna {voce, creato}."""
    d = _norm(d)
    now = datetime.now(timezone.utc).isoformat()
    esist = await _trova_esistente(d)
    if esist:
        upd = {k: v for k, v in d.items() if v and v != esist.get(k)}
        if upd:
            upd["updated_at"] = now
            await db.anagrafica.update_one({"id": esist["id"]}, {"$set": upd})
        return {"voce": {**esist, **upd}, "creato": False}
    voce = {"id": str(uuid.uuid4()), **d, "origine": origine, "created_at": now, "updated_at": now}
    await db.anagrafica.insert_one(voce)
    voce.pop("_id", None)
    return {"voce": voce, "creato": True}


@router.get("/anagrafica")
async def lista(q: str = ""):
    docs = await db.anagrafica.find({}, {"_id": 0}).sort([("cognome", 1), ("ragione_sociale", 1), ("nome", 1)]).to_list(5000)
    if q.strip():
        ql = q.strip().lower()
        docs = [d for d in docs if ql in " ".join(str(d.get(k) or "") for k in CAMPI).lower()]
    return docs


@router.post("/anagrafica")
async def crea(p: AnagraficaIn):
    return await upsert_anagrafica(p.model_dump(), "manuale")


@router.put("/anagrafica/{aid}")
async def aggiorna(aid: str, p: AnagraficaIn):
    d = _norm(p.model_dump())
    d["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.anagrafica.update_one({"id": aid}, {"$set": d})
    if not r.matched_count:
        raise HTTPException(404, "Voce non trovata")
    return await db.anagrafica.find_one({"id": aid}, {"_id": 0})


@router.delete("/anagrafica/{aid}")
async def elimina(aid: str):
    r = await db.anagrafica.delete_one({"id": aid})
    if not r.deleted_count:
        raise HTTPException(404, "Voce non trovata")
    return {"ok": True}


@router.post("/anagrafica/da-cliente/{cliente_id}")
async def da_cliente(cliente_id: str):
    c = await db.clienti.find_one({"id": cliente_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Cliente non trovato")
    return await upsert_anagrafica(c, "rimessaggio")


@router.post("/anagrafica/da-esterno/{eid}")
async def da_esterno(eid: str):
    e = await db.clienti_esterni.find_one({"id": eid}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Cliente non trovato")
    parti = (e.get("nome") or "").split(" ", 1)
    d = {**e, "cognome": parti[0], "nome": parti[1] if len(parti) > 1 else ""}
    return await upsert_anagrafica(d, "esterni")
