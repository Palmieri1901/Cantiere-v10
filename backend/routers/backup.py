"""Backup generale JSON + restore: include TUTTI i settori dell'app
(rimessaggio, tariffe, cantiere, magazzino, tubolari, Suzuki, gommoni GEB con PDF omologazione, DDT e rubrica).
Le credenziali (users, token) NON sono incluse.
"""
import base64
import json as _json
import os
from datetime import datetime, timezone
from typing import Dict, List

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from gridfs_sync import SyncBucket
from pydantic import BaseModel, ConfigDict

from database import db

router = APIRouter()

BACKUP_VERSION = 3
EXCLUDED = {"users", "password_reset_tokens", "_sync_log", "_sync_state"}
GRIDFS_BUCKETS = {"gommoni_omologazioni": "PDF omologazione gommoni"}

SETTORI: Dict[str, List[str]] = {
    "Cantiere e tariffe": ["cantiere", "tariffe", "app_settings"],
    "Rimessaggio": ["clienti", "lavori"],
    "Magazzino": ["articoli", "fornitori", "ricarichi_categoria", "spese_accessorie", "movimenti_magazzino"],
    "Tubolari": ["tubolari_config", "preventivi_tubolari"],
    "Suzuki": ["suzuki_modelli", "suzuki_preventivi", "suzuki_legenda", "suzuki_settings"],
    "Gommoni GEB": ["gommoni_modelli", "gommoni_accessori", "gommoni_settings", "gommoni_preventivi"],
    "DDT": ["ddt", "ddt_indirizzi"],
    "Dipendenti e app": ["dipendenti", "lavori_pending", "clienti_esterni", "preventivi_esterni"],
    "Documenti di servizio": ["documenti_servizio"],
}

# collezioni "singleton" del vecchio formato v2 (dict invece di lista)
_LEGACY_SINGLE = {"cantiere", "tariffe"}


def _is_gridfs(name: str) -> bool:
    return any(name.startswith(b + ".") for b in GRIDFS_BUCKETS)



@router.get("/backup/ultimo")
async def ultimo_backup():
    """Data dell'ultimo backup scaricato e giorni trascorsi (None se mai eseguito)."""
    doc = await db.app_settings.find_one({"id": "backup_info"}, {"_id": 0}) or {}
    ts = doc.get("ultimo_backup")
    giorni = None
    if ts:
        try:
            dt = datetime.fromisoformat(ts)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            giorni = (datetime.now(timezone.utc) - dt).days
        except ValueError:
            ts = None
    return {"ultimo_backup": ts, "giorni": giorni, "scaduto": ts is None or (giorni or 0) >= 7}


@router.get("/backup")
async def backup_data():
    """Esporta TUTTE le collezioni (tranne credenziali) + file GridFS in un unico JSON, in streaming."""
    generated_at, gen = await _backup_stream()
    filename = f"backup_geb_completo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return StreamingResponse(gen(), media_type="application/json",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})


async def _backup_stream():
    names = sorted(n for n in await db.list_collection_names() if n not in EXCLUDED and not _is_gridfs(n))
    generated_at = datetime.now(timezone.utc).isoformat()
    await db.app_settings.update_one({"id": "backup_info"}, {"$set": {"ultimo_backup": generated_at}}, upsert=True)

    async def gen():
        head = {"version": BACKUP_VERSION, "generated_at": generated_at, "app": "GEB Cantiere Nautico", "settori": SETTORI}
        yield _json.dumps(head, ensure_ascii=False)[:-1] + ', "collections": {'
        for i, n in enumerate(names):
            yield ("," if i else "") + _json.dumps(n) + ": ["
            first = True
            async for d in db[n].find({}, {"_id": 0}):
                yield ("" if first else ",") + _json.dumps(d, ensure_ascii=False, default=str)
                first = False
            yield "]"
        yield '}, "files": {'
        for i, b in enumerate(GRIDFS_BUCKETS):
            yield ("," if i else "") + _json.dumps(b) + ": ["
            bucket = SyncBucket(db, b)
            first = True
            async for f in bucket.find({}):
                data = await (await bucket.open_download_stream(f._id)).read()
                item = {"_id": str(f._id), "filename": f.filename, "metadata": f.metadata or {}, "data_b64": base64.b64encode(data).decode("ascii")}
                yield ("" if first else ",") + _json.dumps(item, ensure_ascii=False)
                first = False
            yield "]"
        yield "}}"

    return generated_at, gen


# --- Backup diretto su una cartella del PC (installazione locale: il backend gira sullo stesso computer) ---
PREFIX_DISCO = "backup_geb_completo_"
COPIE_DISCO = 3


class CartellaPayload(BaseModel):
    cartella: str


def _su_pc() -> bool:
    from routers.sync import _peer
    return bool(_peer())


@router.get("/backup/cartella")
async def backup_cartella():
    """Cartella del PC configurata per i backup; `su_pc` indica se questa istanza gira sul PC locale."""
    doc = await db.app_settings.find_one({"id": "backup_info"}, {"_id": 0}) or {}
    cartella = doc.get("cartella_pc") or ""
    return {"su_pc": _su_pc(), "cartella": cartella, "esiste": bool(cartella) and os.path.isdir(os.path.expanduser(cartella))}


@router.put("/backup/cartella")
async def imposta_cartella(p: CartellaPayload):
    cartella = os.path.expanduser(p.cartella.strip())
    if not cartella:
        raise HTTPException(400, "Indica la cartella")
    try:
        os.makedirs(cartella, exist_ok=True)
        test = os.path.join(cartella, ".geb_backup_test")
        with open(test, "w") as fh:
            fh.write("ok")
        os.remove(test)
    except OSError as e:
        raise HTTPException(400, f"Cartella non utilizzabile: {e.strerror or e}")
    await db.app_settings.update_one({"id": "backup_info"}, {"$set": {"cartella_pc": cartella}}, upsert=True)
    return {"cartella": cartella}


@router.post("/backup/su-disco")
async def backup_su_disco():
    """Scrive il backup direttamente nella cartella del PC e conserva solo le ultime copie."""
    doc = await db.app_settings.find_one({"id": "backup_info"}, {"_id": 0}) or {}
    cartella = doc.get("cartella_pc")
    if not cartella:
        raise HTTPException(400, "Nessuna cartella impostata: scegli la cartella dei backup in Impostazioni")
    if not os.path.isdir(cartella):
        raise HTTPException(400, f"La cartella {cartella} non esiste più (disco scollegato?)")
    filename = f"{PREFIX_DISCO}{datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:-4]}.json"
    percorso = os.path.join(cartella, filename)
    _, gen = await _backup_stream()
    try:
        with open(percorso, "w", encoding="utf-8") as fh:
            async for chunk in gen():
                fh.write(chunk)
    except OSError as e:
        raise HTTPException(500, f"Scrittura non riuscita: {e.strerror or e}")
    vecchi = sorted(f for f in os.listdir(cartella) if f.startswith(PREFIX_DISCO) and f.endswith(".json"))
    eliminati = vecchi[:-COPIE_DISCO]
    for f in eliminati:
        os.remove(os.path.join(cartella, f))
    return {"file": filename, "cartella": cartella, "dimensione": os.path.getsize(percorso), "copie": min(len(vecchi), COPIE_DISCO), "eliminati": len(eliminati)}


class RestorePayload(BaseModel):
    model_config = ConfigDict(extra="allow")
    version: int | None = None
    collections: Dict[str, list] | None = None
    files: Dict[str, list] | None = None


def _legacy_collections(payload: RestorePayload) -> Dict[str, list]:
    """Converte un backup v1/v2 (chiavi top-level) nel formato collections."""
    extra = payload.model_extra or {}
    out: Dict[str, list] = {}
    for k, v in extra.items():
        if k in ("generated_at", "app", "counts", "settori", "files_counts"):
            continue
        if k in _LEGACY_SINGLE and isinstance(v, dict):
            out[k] = [v]
        elif isinstance(v, list):
            out[k] = v
    return out


@router.post("/restore")
async def restore_data(payload: RestorePayload):
    """Ripristina le collezioni presenti nel file (sovrascrivendole). Le collezioni assenti non vengono toccate."""
    collections = payload.collections if payload.collections is not None else _legacy_collections(payload)
    if not collections and not payload.files:
        raise HTTPException(400, "File di backup non valido: nessuna sezione riconosciuta")
    restored: Dict[str, int] = {}
    for name, docs in collections.items():
        if name in EXCLUDED or _is_gridfs(name) or not isinstance(docs, list):
            continue
        clean = [{k: v for k, v in d.items() if not k.startswith("_")} for d in docs if isinstance(d, dict)]
        await db[name].delete_many({})
        if clean:
            await db[name].insert_many(clean)
        restored[name] = len(clean)
    for bucket_name, files in (payload.files or {}).items():
        if bucket_name not in GRIDFS_BUCKETS or not isinstance(files, list):
            continue
        bucket = SyncBucket(db, bucket_name)
        await db[f"{bucket_name}.files"].delete_many({})
        await db[f"{bucket_name}.chunks"].delete_many({})
        n = 0
        for f in files:
            try:
                data = base64.b64decode(f.get("data_b64", ""))
                await bucket.upload_from_stream_with_id(ObjectId(f["_id"]), f.get("filename") or "file", data, metadata=f.get("metadata") or {})
                n += 1
            except Exception:
                continue
        restored[f"{bucket_name} (file)"] = n
    return {"ok": True, "restored": restored}
