"""Registro modifiche per la sincronizzazione tra installazioni (locale ↔ online).

Avvolge i metodi di scrittura delle collezioni Motor: ogni insert/update/replace/delete
imposta `_sync_ts` sul documento e registra (collezione, id, operazione, ts) in `_sync_log`.
I documenti sono identificati dal campo applicativo `id` (uuid); quelli senza `id` non vengono sincronizzati.
"""
import contextvars
import time

from motor.motor_asyncio import AsyncIOMotorCollection

ESCLUSE = {"_sync_log", "_sync_state", "_sync_config", "_cestino", "fs.files", "fs.chunks", "password_reset_tokens",
           "webauthn_credentials", "webauthn_challenges"}
# Documenti locali a ogni installazione (codice email temporaneo, cartella backup, chiavi/modello AI): mai sincronizzati
DOC_ESCLUSI = {"app_settings": {"backup_info", "recupero_codice", "ai_config", "ai_chiavi", "blocco_accessi"}}
# Credenziali: sincronizzate solo in parte (hash, mai in chiaro); env_password_hash/env_pin_hash restano locali
CHIAVE = {"users": "email"}
CAMPI = {
    "users": {"email", "role", "password_hash", "password_customized", "password_updated_at"},
    ("app_settings", "auth"): {"id", "recovery_pin_hash", "pin_customized", "pin_updated_at"},
}


def doc_escluso(coll: str, doc_id) -> bool:
    return doc_id in DOC_ESCLUSI.get(coll, ())


def chiave(coll: str) -> str:
    return CHIAVE.get(coll, "id")


def campi_sync(coll: str, doc_id=None) -> set | None:
    return CAMPI.get(coll) or CAMPI.get((coll, doc_id))


def filtra(coll: str, doc_id, doc: dict) -> dict:
    """Per i documenti di credenziali lascia solo i campi sincronizzabili (+ _sync_ts)."""
    f = campi_sync(coll, doc_id)
    return doc if not f else {k: v for k, v in doc.items() if k in f or k == "_sync_ts"}


def _irrilevante(coll: str, flt, update) -> bool:
    """Update su credenziali che non tocca campi sincronizzati (es. ultimo accesso, env_*): non va registrato."""
    doc_id = flt.get("id") if isinstance(flt, dict) and isinstance(flt.get("id"), str) else None
    f = campi_sync(coll, doc_id)
    if not f or not isinstance(update, dict):
        return False
    keys = set()
    for op in ("$set", "$unset", "$setOnInsert"):
        keys |= set((update.get(op) or {}).keys())
    return not (keys & f)
_origin = contextvars.ContextVar("sync_origin", default="local")
# Cestino della richiesta DELETE in corso: {"batch": id, "n": documenti salvati} (vedi middleware in server.py)
cestino_ctx = contextvars.ContextVar("cestino", default=None)


def now_ts() -> float:
    return time.time()


def set_origin(v: str):
    return _origin.set(v)


def _ids_from_filter(flt, k: str = "id") -> list | None:
    if isinstance(flt, dict) and isinstance(flt.get(k), str):
        return [flt[k]]
    if isinstance(flt, dict) and isinstance(flt.get(k), dict) and isinstance(flt[k].get("$in"), list):
        return [x for x in flt[k]["$in"] if isinstance(x, str)]
    return None


def is_file_coll(name: str) -> bool:
    return name.endswith(".files")


async def _al_cestino(coll, flt, multi: bool):
    """Copia i documenti che stanno per essere cancellati, per poter annullare l'eliminazione."""
    c = cestino_ctx.get()
    if not c or _origin.get() != "local" or is_file_coll(coll.name):
        return
    docs = await coll.find(flt).to_list(5000) if multi else [d for d in [await coll.find_one(flt)] if d]
    if not docs:
        return
    db = coll.database
    now = time.time()
    await db["_cestino"].insert_many([{"batch": c["batch"], "coll": coll.name, "doc": d, "ts": now} for d in docs])
    # conserva le copie solo 24 ore
    await db["_cestino"].delete_many({"ts": {"$lt": now - 86400}})
    c["n"] += len(docs)


def _esclusa(name: str) -> bool:
    # origin "nolog": scritture locali da non propagare (es. seed da .env all'avvio)
    return name in ESCLUSE or name.endswith(".chunks") or _origin.get() == "nolog"


async def _file_ids(coll, flt) -> list:
    if isinstance(flt, dict) and flt.get("_id") is not None and not isinstance(flt["_id"], dict):
        return [str(flt["_id"])]
    return [str(d["_id"]) for d in await coll.find(flt or {}, {"_id": 1}).to_list(10000)]


async def _log(coll: AsyncIOMotorCollection, ids: list, op: str, ts: float):
    if not ids or _esclusa(coll.name):
        return
    log = coll.database["_sync_log"]
    for i in ids:
        if doc_escluso(coll.name, i):
            continue
        await log.update_one({"coll": coll.name, "doc_id": i}, {"$set": {"op": op, "ts": ts, "origin": _origin.get()}}, upsert=True)


def _with_ts(update, ts: float):
    if isinstance(update, list):  # pipeline
        return update + [{"$set": {"_sync_ts": ts}}]
    u = dict(update or {})
    u["$set"] = {**u.get("$set", {}), "_sync_ts": ts}
    return u


async def _resolve_ids(coll, flt, multi: bool) -> list:
    if is_file_coll(coll.name):
        return await _file_ids(coll, flt)
    k = chiave(coll.name)
    ids = _ids_from_filter(flt, k)
    if ids is not None:
        return ids
    if multi:
        return [d[k] for d in await coll.find(flt, {"_id": 0, k: 1}).to_list(10000) if d.get(k)]
    d = await coll.find_one(flt, {"_id": 0, k: 1})
    return [d[k]] if d and d.get(k) else []


def install():
    C = AsyncIOMotorCollection
    if getattr(C, "_sync_patched", False):
        return
    o_insert_one, o_insert_many = C.insert_one, C.insert_many
    o_update_one, o_update_many, o_replace_one = C.update_one, C.update_many, C.replace_one
    o_delete_one, o_delete_many, o_fou = C.delete_one, C.delete_many, C.find_one_and_update

    async def insert_one(self, doc, *a, **k):
        ts = now_ts()
        if not _esclusa(self.name) and isinstance(doc, dict):
            doc["_sync_ts"] = ts
        r = await o_insert_one(self, doc, *a, **k)
        if isinstance(doc, dict) and doc.get(chiave(self.name)):
            await _log(self, [doc[chiave(self.name)]], "upsert", ts)
        elif is_file_coll(self.name) and isinstance(doc, dict) and doc.get("_id") is not None:
            await _log(self, [str(doc["_id"])], "upsert", ts)
        return r

    async def insert_many(self, docs, *a, **k):
        ts = now_ts()
        docs = list(docs)
        if not _esclusa(self.name):
            for d in docs:
                if isinstance(d, dict):
                    d["_sync_ts"] = ts
        r = await o_insert_many(self, docs, *a, **k)
        ck = chiave(self.name)
        await _log(self, [d[ck] for d in docs if isinstance(d, dict) and d.get(ck)], "upsert", ts)
        return r

    def _mk_update(orig, multi):
        async def f(self, flt, update, *a, **k):
            ts = now_ts()
            if _esclusa(self.name) or is_file_coll(self.name) or _irrilevante(self.name, flt, update):
                return await orig(self, flt, update, *a, **k)
            r = await orig(self, flt, _with_ts(update, ts), *a, **k)
            ids = await _resolve_ids(self, flt, multi)
            if not ids and k.get("upsert") and isinstance(flt, dict) and isinstance(flt.get("id"), str):
                ids = [flt["id"]]
            await _log(self, ids, "upsert", ts)
            return r
        return f

    async def replace_one(self, flt, doc, *a, **k):
        ts = now_ts()
        if not _esclusa(self.name) and isinstance(doc, dict):
            doc["_sync_ts"] = ts
        r = await o_replace_one(self, flt, doc, *a, **k)
        ck = chiave(self.name)
        ids = await _resolve_ids(self, flt, False) or ([doc[ck]] if isinstance(doc, dict) and doc.get(ck) else [])
        await _log(self, ids, "upsert", ts)
        return r

    def _mk_delete(orig, multi):
        async def f(self, flt, *a, **k):
            if _esclusa(self.name):
                return await orig(self, flt, *a, **k)
            ids = await _resolve_ids(self, flt, multi)
            await _al_cestino(self, flt, multi)
            r = await orig(self, flt, *a, **k)
            await _log(self, ids, "delete", now_ts())
            return r
        return f

    async def find_one_and_update(self, flt, update, *a, **k):
        ts = now_ts()
        if _esclusa(self.name) or is_file_coll(self.name) or _irrilevante(self.name, flt, update):
            return await o_fou(self, flt, update, *a, **k)
        r = await o_fou(self, flt, _with_ts(update, ts), *a, **k)
        ids = await _resolve_ids(self, flt, False) or ([r["id"]] if isinstance(r, dict) and r.get("id") else [])
        await _log(self, ids, "upsert", ts)
        return r

    C.insert_one, C.insert_many, C.replace_one = insert_one, insert_many, replace_one
    C.update_one, C.update_many = _mk_update(o_update_one, False), _mk_update(o_update_many, True)
    C.delete_one, C.delete_many = _mk_delete(o_delete_one, False), _mk_delete(o_delete_many, True)
    C.find_one_and_update = find_one_and_update
    C._sync_patched = True
