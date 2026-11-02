"""Registro modifiche per la sincronizzazione tra installazioni (locale ↔ online).

Avvolge i metodi di scrittura delle collezioni Motor: ogni insert/update/replace/delete
imposta `_sync_ts` sul documento e registra (collezione, id, operazione, ts) in `_sync_log`.
I documenti sono identificati dal campo applicativo `id` (uuid); quelli senza `id` non vengono sincronizzati.
"""
import contextvars
import time
from motor.motor_asyncio import AsyncIOMotorCollection

ESCLUSE = {"_sync_log", "_sync_state", "fs.files", "fs.chunks"}
_origin = contextvars.ContextVar("sync_origin", default="local")


def now_ts() -> float:
    return time.time()


def set_origin(v: str):
    return _origin.set(v)


def _ids_from_filter(flt) -> list | None:
    if isinstance(flt, dict) and isinstance(flt.get("id"), str):
        return [flt["id"]]
    if isinstance(flt, dict) and isinstance(flt.get("id"), dict) and isinstance(flt["id"].get("$in"), list):
        return [x for x in flt["id"]["$in"] if isinstance(x, str)]
    return None


async def _log(coll: AsyncIOMotorCollection, ids: list, op: str, ts: float):
    if not ids or coll.name in ESCLUSE:
        return
    log = coll.database["_sync_log"]
    for i in ids:
        await log.update_one({"coll": coll.name, "doc_id": i}, {"$set": {"op": op, "ts": ts, "origin": _origin.get()}}, upsert=True)


def _with_ts(update, ts: float):
    if isinstance(update, list):  # pipeline
        return update + [{"$set": {"_sync_ts": ts}}]
    u = dict(update or {})
    u["$set"] = {**u.get("$set", {}), "_sync_ts": ts}
    return u


async def _resolve_ids(coll, flt, multi: bool) -> list:
    ids = _ids_from_filter(flt)
    if ids is not None:
        return ids
    if multi:
        return [d["id"] for d in await coll.find(flt, {"_id": 0, "id": 1}).to_list(10000) if d.get("id")]
    d = await coll.find_one(flt, {"_id": 0, "id": 1})
    return [d["id"]] if d and d.get("id") else []


def install():
    C = AsyncIOMotorCollection
    if getattr(C, "_sync_patched", False):
        return
    o_insert_one, o_insert_many = C.insert_one, C.insert_many
    o_update_one, o_update_many, o_replace_one = C.update_one, C.update_many, C.replace_one
    o_delete_one, o_delete_many, o_fou = C.delete_one, C.delete_many, C.find_one_and_update

    async def insert_one(self, doc, *a, **k):
        ts = now_ts()
        if self.name not in ESCLUSE and isinstance(doc, dict):
            doc["_sync_ts"] = ts
        r = await o_insert_one(self, doc, *a, **k)
        if isinstance(doc, dict) and doc.get("id"):
            await _log(self, [doc["id"]], "upsert", ts)
        return r

    async def insert_many(self, docs, *a, **k):
        ts = now_ts()
        docs = list(docs)
        if self.name not in ESCLUSE:
            for d in docs:
                if isinstance(d, dict):
                    d["_sync_ts"] = ts
        r = await o_insert_many(self, docs, *a, **k)
        await _log(self, [d["id"] for d in docs if isinstance(d, dict) and d.get("id")], "upsert", ts)
        return r

    def _mk_update(orig, multi):
        async def f(self, flt, update, *a, **k):
            ts = now_ts()
            if self.name in ESCLUSE:
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
        if self.name not in ESCLUSE and isinstance(doc, dict):
            doc["_sync_ts"] = ts
        r = await o_replace_one(self, flt, doc, *a, **k)
        ids = await _resolve_ids(self, flt, False) or ([doc["id"]] if isinstance(doc, dict) and doc.get("id") else [])
        await _log(self, ids, "upsert", ts)
        return r

    def _mk_delete(orig, multi):
        async def f(self, flt, *a, **k):
            if self.name in ESCLUSE:
                return await orig(self, flt, *a, **k)
            ids = await _resolve_ids(self, flt, multi)
            r = await orig(self, flt, *a, **k)
            await _log(self, ids, "delete", now_ts())
            return r
        return f

    async def find_one_and_update(self, flt, update, *a, **k):
        ts = now_ts()
        if self.name in ESCLUSE:
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
