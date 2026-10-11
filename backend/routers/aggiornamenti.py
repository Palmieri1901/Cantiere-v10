import os
import httpx
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/aggiornamenti")

NON_DISPONIBILE = {"disponibile": False, "motivo": "Aggiornamenti disponibili soltanto sull'installazione Oracle"}


def _cfg():
    url, token = os.environ.get("UPDATER_URL"), os.environ.get("UPDATER_TOKEN")
    return (url, token) if url and token else (None, None)


async def _call(method, path, timeout=60):
    url, token = _cfg()
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=timeout) as c:
            r = await c.request(method, f"{url}{path}", headers={"X-Updater-Token": token})
    except httpx.HTTPError as e:
        raise HTTPException(503, f"Servizio aggiornamenti non raggiungibile: {e}")
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.json().get("detail", "Errore updater"))
    return r.json()


@router.get("/stato")
async def stato():
    return await _call("GET", "/status") or NON_DISPONIBILE


@router.get("/progresso")
async def progresso():
    return await _call("GET", "/state", timeout=10) or NON_DISPONIBILE


@router.get("/log")
async def log():
    return await _call("GET", "/log", timeout=10) or {"log": ""}


@router.post("/avvia")
async def avvia():
    r = await _call("POST", "/update", timeout=10)
    if r is None:
        raise HTTPException(400, NON_DISPONIBILE["motivo"])
    return r


@router.post("/ripristina")
async def ripristina():
    r = await _call("POST", "/rollback", timeout=10)
    if r is None:
        raise HTTPException(400, NON_DISPONIBILE["motivo"])
    return r
