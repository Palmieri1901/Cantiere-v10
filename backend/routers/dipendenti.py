"""Dipendenti (chiavi API per l'app mobile) + coda lavori da approvare."""
import hashlib
import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db
from helpers import capitalizza_nome
from models import LavoroCreate
from routers.lavori import create_lavoro

router = APIRouter()


def hash_key(key: str) -> str:
    return hashlib.sha256(key.strip().upper().encode()).hexdigest()


def _gen_key() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    parts = ["".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3)]
    return "PM-" + "-".join(parts)


class DipendenteIn(BaseModel):
    nome: str
    attivo: Optional[bool] = True


class QrImport(BaseModel):
    dipendente_nome: Optional[str] = ""
    lavori: List[dict]


class ApprovaIn(BaseModel):
    cliente_id: Optional[str] = None
    esterno_nome: Optional[str] = None
    anagrafica_id: Optional[str] = None
    data: Optional[str] = None
    tipo: Optional[str] = None
    descrizione: Optional[str] = None
    ore: Optional[float] = None
    costo: Optional[float] = None
    materiali: Optional[str] = None
    articoli_magazzino: Optional[List[dict]] = None
    articoli_liberi: Optional[List[dict]] = None


def _pub(d: dict) -> dict:
    d.pop("_id", None)
    d.pop("key_hash", None)
    return d


@router.get("/dipendenti")
async def list_dipendenti():
    docs = await db.dipendenti.find({}, {"_id": 0, "key_hash": 0}).sort("nome", 1).to_list(500)
    return docs


@router.post("/dipendenti")
async def create_dipendente(payload: DipendenteIn):
    nome = capitalizza_nome(payload.nome)
    if not nome:
        raise HTTPException(400, "Nome obbligatorio")
    key = _gen_key()
    doc = {
        "id": str(uuid.uuid4()), "nome": nome, "attivo": True,
        "key_hash": hash_key(key), "key_hint": key[-4:],
        "created_at": datetime.now(timezone.utc).isoformat(), "ultimo_accesso": None,
    }
    await db.dipendenti.insert_one(doc)
    return {**_pub(dict(doc)), "chiave": key}


@router.put("/dipendenti/{did}")
async def update_dipendente(did: str, payload: DipendenteIn):
    r = await db.dipendenti.update_one({"id": did}, {"$set": {"nome": capitalizza_nome(payload.nome), "attivo": bool(payload.attivo)}})
    if not r.matched_count:
        raise HTTPException(404, "Dipendente non trovato")
    return _pub(await db.dipendenti.find_one({"id": did}))


@router.post("/dipendenti/{did}/rigenera-chiave")
async def rigenera_chiave(did: str):
    key = _gen_key()
    r = await db.dipendenti.update_one({"id": did}, {"$set": {"key_hash": hash_key(key), "key_hint": key[-4:]}})
    if not r.matched_count:
        raise HTTPException(404, "Dipendente non trovato")
    return {"chiave": key}


@router.delete("/dipendenti/{did}")
async def delete_dipendente(did: str):
    await db.dipendenti.delete_one({"id": did})
    return {"ok": True}


# ---------- coda lavori da approvare ----------

async def inserisci_pending(items: list, dipendente: dict, origine: str) -> int:
    """Inserisce i lavori ricevuti (dedupe su client_uid). Restituisce quanti nuovi."""
    nuovi = 0
    for it in items:
        uid = str(it.get("client_uid") or uuid.uuid4())
        if await db.lavori_pending.find_one({"client_uid": uid}):
            continue
        cid = it.get("cliente_id")
        anagrafica_id = ""
        if cid and str(cid).startswith("ana:"):
            anagrafica_id, cid = cid[4:], None
        cliente = await db.clienti.find_one({"id": cid}, {"_id": 0, "nome": 1, "cognome": 1, "tipo_barca": 1}) if cid else None
        if not cliente and cid:
            est = await db.clienti_esterni.find_one({"id": cid}, {"_id": 0, "nome": 1})
            if est:
                cliente = {"cognome": est["nome"], "nome": "", "tipo_barca": "esterno"}
        if anagrafica_id and not it.get("cliente_nome"):
            ana = await db.anagrafica.find_one({"id": anagrafica_id}, {"_id": 0, "nome": 1, "cognome": 1})
            if ana:
                it["cliente_nome"] = f"{ana.get('cognome','')} {ana.get('nome','')}".strip()
        cliente_nome = f"{cliente.get('cognome','')} {cliente.get('nome','')}".strip() if cliente else capitalizza_nome(it.get("cliente_nome") or "")
        doc = {
            "id": str(uuid.uuid4()), "client_uid": uid,
            "dipendente_id": dipendente.get("id"), "dipendente_nome": dipendente.get("nome", ""),
            "cliente_id": cid, "cliente_nome": cliente_nome, "cliente_trovato": bool(cliente), "anagrafica_id": anagrafica_id,
            "tipo_barca": (cliente or {}).get("tipo_barca", ""),
            "data": it.get("data") or datetime.now().strftime("%Y-%m-%d"),
            "tipo": it.get("tipo") or "Riparazione",
            "descrizione": it.get("descrizione") or "",
            "ore": float(it.get("ore") or 0),
            "materiali": it.get("materiali") or "",
            "articoli_magazzino": it.get("articoli_magazzino") or [],
            "articoli_liberi": it.get("articoli_liberi") or [],
            "stato": "in_attesa", "origine": origine,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.lavori_pending.insert_one(doc)
        nuovi += 1
    return nuovi


@router.get("/lavori-pending")
async def list_pending(stato: str = "in_attesa"):
    q = {} if stato == "tutti" else {"stato": stato}
    return await db.lavori_pending.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.get("/lavori-pending/count")
async def count_pending():
    return {"count": await db.lavori_pending.count_documents({"stato": "in_attesa"})}


@router.post("/lavori-pending/import-qr")
async def import_qr(payload: QrImport):
    dip = {"id": None, "nome": payload.dipendente_nome or "QR"}
    if payload.dipendente_nome:
        found = await db.dipendenti.find_one({"nome": payload.dipendente_nome}, {"_id": 0, "id": 1, "nome": 1})
        if found:
            dip = found
    nuovi = await inserisci_pending(payload.lavori, dip, "qr")
    return {"ok": True, "nuovi": nuovi, "duplicati": len(payload.lavori) - nuovi}


@router.put("/lavori-pending/{pid}")
async def update_pending(pid: str, payload: ApprovaIn):
    upd = {k: v for k, v in payload.model_dump().items() if v is not None}
    r = await db.lavori_pending.update_one({"id": pid, "stato": "in_attesa"}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "Lavoro in attesa non trovato")
    return await db.lavori_pending.find_one({"id": pid}, {"_id": 0})


@router.post("/lavori-pending/{pid}/approva")
async def approva_pending(pid: str, payload: ApprovaIn):
    p = await db.lavori_pending.find_one({"id": pid, "stato": "in_attesa"}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Lavoro in attesa non trovato")
    override = {k: v for k, v in payload.model_dump().items() if v is not None}
    esterno_nome = override.pop("esterno_nome", None)
    anagrafica_id = override.pop("anagrafica_id", None) or p.get("anagrafica_id") or ""
    merged = {**p, **override}
    if esterno_nome:
        from routers.esterni import crea_esterno
        est = await crea_esterno(esterno_nome, anagrafica_id=anagrafica_id)
        merged["cliente_id"] = est["id"]
        await db.lavori_pending.update_one({"id": pid}, {"$set": {"cliente_id": est["id"], "cliente_nome": est["nome"], "cliente_trovato": True, "esterno": True}})
    cid_ok = merged.get("cliente_id") and (
        await db.clienti.find_one({"id": merged["cliente_id"]}) or await db.clienti_esterni.find_one({"id": merged["cliente_id"]})
    )
    if not cid_ok:
        raise HTTPException(400, "Associa prima un cliente valido")
    costo = merged.get("costo")
    if costo is None or float(costo) == 0:
        tariffe = await db.tariffe.find_one({"id": "default"}, {"_id": 0, "costo_orario_manodopera": 1}) or {}
        costo = round(float(merged.get("ore") or 0) * float(tariffe.get("costo_orario_manodopera") or 0), 2)
    lc = LavoroCreate(
        cliente_id=merged["cliente_id"], data=merged["data"], tipo=merged["tipo"],
        descrizione=merged.get("descrizione", ""), costo=float(costo or 0),
        materiali=merged.get("materiali", ""), stato="completato",
        ore=float(merged.get("ore") or 0), dipendente=p.get("dipendente_nome", ""),
        articoli_magazzino=merged.get("articoli_magazzino") or None,
        articoli_liberi=merged.get("articoli_liberi") or None,
    )
    lavoro = await create_lavoro(lc)
    cl = await db.clienti.find_one({"id": merged["cliente_id"]}, {"_id": 0, "nome": 1, "cognome": 1})
    if cl:
        nome_cl = f"{cl.get('cognome','')} {cl.get('nome','')}".strip()
    else:
        est = await db.clienti_esterni.find_one({"id": merged["cliente_id"]}, {"_id": 0, "nome": 1})
        nome_cl = (est or {}).get("nome", p.get("cliente_nome", ""))
    await db.lavori_pending.update_one({"id": pid}, {"$set": {
        "stato": "approvato", "lavoro_id": lavoro.id, "cliente_id": merged["cliente_id"], "cliente_nome": nome_cl, "cliente_trovato": True,
        "approvato_at": datetime.now(timezone.utc).isoformat(),
    }})
    return lavoro


@router.post("/lavori-pending/{pid}/rifiuta")
async def rifiuta_pending(pid: str):
    r = await db.lavori_pending.update_one({"id": pid, "stato": "in_attesa"}, {"$set": {"stato": "rifiutato"}})
    if not r.matched_count:
        raise HTTPException(404, "Lavoro in attesa non trovato")
    return {"ok": True}


@router.delete("/lavori-pending/{pid}")
async def delete_pending(pid: str):
    await db.lavori_pending.delete_one({"id": pid})
    return {"ok": True}


class EliminaIn(BaseModel):
    ids: List[str]


@router.post("/lavori-pending/elimina")
async def elimina_pending(payload: EliminaIn):
    r = await db.lavori_pending.delete_many({"id": {"$in": payload.ids}})
    return {"ok": True, "eliminati": r.deleted_count}
