"""Sincronizzazione bidirezionale tra installazioni (es. PC locale ↔ online).

Entrambe le installazioni espongono /api/sync/*; quella con SYNC_PEER_URL configurato esegue
periodicamente pull (modifiche del peer → locale) e push (modifiche locali → peer).
Regola: vince l'ultima modifica (confronto `_sync_ts` per documento). Richiede SYNC_TOKEN uguale sui due lati.
"""
import asyncio
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import Response
from bson import json_util
from pymongo.errors import DuplicateKeyError

from database import db, logger
from sync_log import ESCLUSE, now_ts, set_origin

router = APIRouter(prefix="/sync")  # stato/ora: protetti dal login del gestionale
peer_router = APIRouter(prefix="/api/sync")  # endpoint tra installazioni: protetti dal solo SYNC_TOKEN
PAGE = 500
_stato = {"in_corso": False, "ultimo_ok": None, "ultimo_errore": "", "ultimo_tentativo": None, "inviati": 0, "ricevuti": 0}


def _token() -> str:
    return os.environ.get("SYNC_TOKEN", "")


def _peer() -> str:
    return (os.environ.get("SYNC_PEER_URL") or "").rstrip("/")


def _check(x_sync_token: str):
    if not _token() or x_sync_token != _token():
        raise HTTPException(401, "Token di sincronizzazione non valido")


async def _entries(since: float, exclude_origin: Optional[str]):
    q = {"ts": {"$gt": since}}
    if exclude_origin:
        q["origin"] = {"$ne": exclude_origin}
    return await db["_sync_log"].find(q, {"_id": 0}).sort("ts", 1).limit(PAGE).to_list(PAGE)


async def _with_docs(entries: list) -> list:
    out = []
    for e in entries:
        item = {"coll": e["coll"], "doc_id": e["doc_id"], "op": e["op"], "ts": e["ts"]}
        if e["op"] == "upsert":
            d = await db[e["coll"]].find_one({"id": e["doc_id"]}, {"_id": 0})
            if d is None:
                item["op"] = "delete"
            else:
                item["doc"] = d
        out.append(item)
    return out


@peer_router.get("/changes")
async def changes(since: float = 0, x_sync_token: str = Header(default="")):
    """Modifiche fatte su questa installazione (escluse quelle ricevute via sync) dopo `since`."""
    _check(x_sync_token)
    entries = await _entries(since, exclude_origin="sync")
    return _bson({"changes": await _with_docs(entries), "has_more": len(entries) == PAGE, "server_ts": now_ts()})


@peer_router.get("/snapshot")
async def snapshot(coll: str, skip: int = 0, x_sync_token: str = Header(default="")):
    """Tutti i documenti (con id) di una collezione: usato al primo allineamento."""
    _check(x_sync_token)
    if coll in ESCLUSE:
        raise HTTPException(400, "Collezione non sincronizzabile")
    docs = await db[coll].find({"id": {"$exists": True}}, {"_id": 0}).skip(skip).limit(PAGE).to_list(PAGE)
    return _bson({"docs": docs, "has_more": len(docs) == PAGE})


@peer_router.get("/collections")
async def collections(x_sync_token: str = Header(default="")):
    _check(x_sync_token)
    names = await db.list_collection_names()
    return [n for n in names if n not in ESCLUSE and not n.startswith("system.")]


def _bson(data) -> Response:
    """Serializza con bson.json_util per preservare datetime/bytes nei documenti."""
    return Response(json_util.dumps(data), media_type="application/json")


async def apply_changes(changes: list) -> int:
    """Applica modifiche ricevute con regola 'ultima modifica vince'. Ritorna quante applicate."""
    tok = set_origin("sync")
    n = 0
    try:
        for c in changes:
            coll, did, ts = c["coll"], c["doc_id"], float(c.get("ts") or 0)
            if coll in ESCLUSE or not did:
                continue
            cur = await db[coll].find_one({"id": did}, {"_id": 0, "_sync_ts": 1})
            cur_ts = float((cur or {}).get("_sync_ts") or 0)
            if c["op"] == "delete":
                if cur is not None and cur_ts <= ts:
                    await db[coll].delete_one({"id": did})
                    await db["_sync_log"].update_one({"coll": coll, "doc_id": did}, {"$set": {"ts": ts}})
                    n += 1
            else:
                doc = c.get("doc") or {}
                if cur is None or cur_ts < ts:
                    doc = {**doc, "_sync_ts": ts}
                    try:
                        await db[coll].replace_one({"id": did}, doc, upsert=True)
                    except DuplicateKeyError as e:  # stesso valore univoco (es. email utente) con id diverso: vince il documento in arrivo
                        kv = (getattr(e, "details", None) or {}).get("keyValue") or {}
                        if not kv:
                            raise
                        await db[coll].delete_many({**kv, "id": {"$ne": did}})
                        await db[coll].replace_one({"id": did}, doc, upsert=True)
                    await db["_sync_log"].update_one({"coll": coll, "doc_id": did}, {"$set": {"ts": ts}})
                    n += 1
    finally:
        set_origin("local") if tok is None else _origin_reset(tok)
    return n


def _origin_reset(tok):
    from sync_log import _origin
    _origin.reset(tok)


@peer_router.post("/apply")
async def apply_remote(request: Request, x_sync_token: str = Header(default="")):
    _check(x_sync_token)
    body = json_util.loads((await request.body()).decode() or "{}")
    return {"applicate": await apply_changes(body.get("changes") or [])}


# ---------- client (gira solo dove SYNC_PEER_URL è configurato) ----------
async def _state() -> dict:
    return await db["_sync_state"].find_one({"id": "peer"}, {"_id": 0}) or {"id": "peer", "pull_ts": None, "push_ts": 0}


async def _save_state(s: dict):
    await db["_sync_state"].replace_one({"id": "peer"}, s, upsert=True)


async def sync_once() -> dict:
    peer = _peer()
    if not peer or not _token() or _stato["in_corso"]:
        return _stato
    _stato["in_corso"] = True
    _stato["ultimo_tentativo"] = now_ts()
    h = {"X-Sync-Token": _token()}
    try:
        async with httpx.AsyncClient(timeout=60) as cl:
            s = await _state()
            # 1) primo allineamento completo
            if s.get("pull_ts") is None:
                start = now_ts()
                colls = (await cl.get(f"{peer}/api/sync/collections", headers=h)).raise_for_status().json()
                _stato["ricevuti"] = 0
                for coll in colls:
                    skip = 0
                    while True:
                        r = json_util.loads((await cl.get(f"{peer}/api/sync/snapshot", params={"coll": coll, "skip": skip}, headers=h)).raise_for_status().text)
                        _stato["ricevuti"] += await apply_changes([{"coll": coll, "doc_id": d["id"], "op": "upsert", "ts": float(d.get("_sync_ts") or 0), "doc": d} for d in r["docs"] if d.get("id")])
                        skip += len(r["docs"])
                        if not r["has_more"]:
                            break
                s["pull_ts"] = start
                await _save_state(s)
            # 2) pull incrementale
            while True:
                r = json_util.loads((await cl.get(f"{peer}/api/sync/changes", params={"since": s["pull_ts"]}, headers=h)).raise_for_status().text)
                if r["changes"]:
                    _stato["ricevuti"] += await apply_changes(r["changes"])
                    s["pull_ts"] = max(c["ts"] for c in r["changes"])
                    await _save_state(s)
                if not r["has_more"]:
                    break
            # 3) push
            while True:
                entries = await _entries(float(s.get("push_ts") or 0), exclude_origin="sync")
                if not entries:
                    break
                payload = await _with_docs(entries)
                r = (await cl.post(f"{peer}/api/sync/apply", content=json_util.dumps({"changes": payload}), headers={**h, "Content-Type": "application/json"})).raise_for_status().json()
                _stato["inviati"] += int(r.get("applicate") or 0)
                s["push_ts"] = max(e["ts"] for e in entries)
                await _save_state(s)
                if len(entries) < PAGE:
                    break
        _stato["ultimo_ok"] = now_ts()
        _stato["ultimo_errore"] = ""
    except Exception as e:  # offline o peer non raggiungibile: si riprova al prossimo giro
        _stato["ultimo_errore"] = str(e)[:200]
        logger.warning("sync: %s", e)
    finally:
        _stato["in_corso"] = False
    return _stato


async def sync_loop():
    await asyncio.sleep(5)
    while True:
        await sync_once()
        await asyncio.sleep(int(os.environ.get("SYNC_INTERVAL", "30")))


@router.get("/stato")
async def stato():
    pend = await db["_sync_log"].count_documents({"origin": {"$ne": "sync"}, "ts": {"$gt": float((await _state()).get("push_ts") or 0)}}) if _peer() else 0
    return {**_stato, "peer": _peer(), "configurato": bool(_peer() and _token()), "token_presente": bool(_token()), "in_attesa_di_invio": pend}


@router.post("/ora")
async def ora():
    if not _peer():
        raise HTTPException(400, "Questa installazione non ha un peer configurato (SYNC_PEER_URL)")
    return await sync_once()
