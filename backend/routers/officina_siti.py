"""Siti di riferimento per l'Assistente officina: indicizzazione pagine (sfogliabili offline) + priorità nella ricerca web."""
import asyncio
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from urllib.parse import urljoin, urlparse, urldefrag

import httpx
from bs4 import BeautifulSoup
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db

router = APIRouter(prefix="/officina/siti")
MAX_PAGINE = 300
_in_corso: set = set()


def _now():
    return datetime.now(timezone.utc).isoformat()


def _dominio(url: str) -> str:
    u = url.strip()
    if not u.startswith("http"):
        u = "https://" + u
    return urlparse(u).netloc.lower().removeprefix("www.")


class SitoIn(BaseModel):
    url: str
    nome: Optional[str] = ""
    priorita: Optional[int] = 1
    max_pagine: Optional[int] = MAX_PAGINE


def _pub(s: dict) -> dict:
    s = {k: v for k, v in s.items() if k != "_id"}
    s["in_corso"] = s["id"] in _in_corso
    return s


@router.get("")
async def lista():
    docs = await db.officina_siti.find({}, {"_id": 0}).sort("priorita", 1).to_list(100)
    return [_pub(d) for d in docs]


@router.post("")
async def crea(p: SitoIn):
    dom = _dominio(p.url)
    if not dom or "." not in dom:
        raise HTTPException(400, "Indirizzo sito non valido")
    if await db.officina_siti.find_one({"dominio": dom}):
        raise HTTPException(400, "Sito già presente")
    s = {"id": str(uuid.uuid4()), "dominio": dom, "url": f"https://{dom}", "nome": (p.nome or dom).strip(), "priorita": int(p.priorita or 1),
         "max_pagine": min(int(p.max_pagine or MAX_PAGINE), 1000), "pagine": 0, "ultimo_indicizzato": None, "stato": "mai indicizzato", "created_at": _now()}
    await db.officina_siti.insert_one(s)
    return _pub(s)


@router.put("/{sid}")
async def aggiorna(sid: str, p: SitoIn):
    upd = {"nome": (p.nome or "").strip(), "priorita": int(p.priorita or 1), "max_pagine": min(int(p.max_pagine or MAX_PAGINE), 1000)}
    r = await db.officina_siti.update_one({"id": sid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "Sito non trovato")
    return _pub(await db.officina_siti.find_one({"id": sid}))


@router.delete("/{sid}")
async def elimina(sid: str):
    await db.officina_schede.delete_many({"sito_id": sid})
    await db.officina_chunks.delete_many({"sito_id": sid})
    await db.officina_siti.delete_one({"id": sid})
    return {"ok": True}


# ---------- Indicizzazione ----------
_SKIP_EXT = re.compile(r"\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|rar|mp4|mp3|css|js|ico|woff2?|ttf|xml)(\?|$)", re.I)


def _estrai(html: str, url: str):
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["script", "style", "nav", "footer", "header", "noscript", "iframe", "form"]):
        t.decompose()
    titolo = (soup.title.get_text(" ", strip=True) if soup.title else "") or url
    main = soup.find("main") or soup.find("article") or soup.body or soup
    testo = re.sub(r"\n{3,}", "\n\n", main.get_text("\n", strip=True))
    links = []
    for a in soup.find_all("a", href=True):
        href, _ = urldefrag(urljoin(url, a["href"]))
        links.append(href)
    return titolo[:200], testo, links


async def _crawl(sito: dict):
    from routers.officina import _chunks
    sid, dom, limite = sito["id"], sito["dominio"], sito.get("max_pagine") or MAX_PAGINE
    _in_corso.add(sid)
    await db.officina_siti.update_one({"id": sid}, {"$set": {"stato": "indicizzazione in corso…", "pagine": 0}})
    await db.officina_schede.delete_many({"sito_id": sid})
    await db.officina_chunks.delete_many({"sito_id": sid})
    coda, visti, n = [sito["url"], f"https://www.{dom}"], set(), 0
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0 (GEBnautica officina indexer)"}) as cl:
            while coda and n < limite:
                url = coda.pop(0)
                key = url.rstrip("/").lower()
                if key in visti or _SKIP_EXT.search(url):
                    continue
                visti.add(key)
                try:
                    r = await cl.get(url)
                except httpx.HTTPError:
                    continue
                if r.status_code != 200 or "text/html" not in r.headers.get("content-type", ""):
                    continue
                titolo, testo, links = _estrai(r.text, str(r.url))
                for l in links:
                    if _dominio(l) == dom and l.rstrip("/").lower() not in visti and len(coda) < 3000:
                        coda.append(l)
                if len(testo) < 150:
                    continue
                n += 1
                scheda_id = str(uuid.uuid4())
                ch = _chunks(testo)
                if ch:
                    await db.officina_chunks.insert_many([{"id": str(uuid.uuid4()), "scheda_id": scheda_id, "sito_id": sid, "idx": i, "testo": c} for i, c in enumerate(ch)])
                await db.officina_schede.insert_one({"id": scheda_id, "titolo": titolo, "marca": "", "modello": "", "tipo": "web", "sito_id": sid, "sito": sito.get("nome") or dom,
                                                     "url": str(r.url), "nome_file": "", "caratteri": len(testo), "n_chunks": len(ch), "created_at": _now()})
                if n % 10 == 0:
                    await db.officina_siti.update_one({"id": sid}, {"$set": {"pagine": n}})
                await asyncio.sleep(0.2)
        await db.officina_siti.update_one({"id": sid}, {"$set": {"pagine": n, "stato": f"indicizzato ({n} pagine)", "ultimo_indicizzato": _now()}})
    except Exception as e:  # noqa: BLE001
        await db.officina_siti.update_one({"id": sid}, {"$set": {"pagine": n, "stato": f"errore: {str(e)[:120]}"}})
    finally:
        _in_corso.discard(sid)


@router.post("/{sid}/indicizza")
async def indicizza(sid: str):
    s = await db.officina_siti.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Sito non trovato")
    if sid in _in_corso:
        raise HTTPException(400, "Indicizzazione già in corso")
    asyncio.create_task(_crawl(s))
    return {"ok": True, "stato": "avviata"}


async def domini_prioritari() -> List[str]:
    docs = await db.officina_siti.find({}, {"_id": 0, "dominio": 1, "priorita": 1}).sort("priorita", 1).to_list(50)
    return [d["dominio"] for d in docs]
