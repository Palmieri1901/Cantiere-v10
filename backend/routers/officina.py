"""Assistente officina: schede tecniche (PDF/immagini/testo), memoria casi risolti, chat AI con ricerca web opzionale (Tavily)."""
import base64
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Header
from pydantic import BaseModel

from database import db
from ai_client import testo, vision

router = APIRouter(prefix="/officina")
CHUNK = 1200


def _now():
    return datetime.now(timezone.utc).isoformat()


def _tokens(s: str) -> List[str]:
    s = (s or "").lower()
    toks = set(re.findall(r"[a-zà-ù0-9][a-zà-ù0-9\-\.]{1,}", s))
    for t in list(toks):
        toks.add(re.sub(r"[\-\.]", "", t))  # c-04 → c04
    return [t for t in toks if len(t) > 1]


def _score(testo_: str, toks: List[str]) -> float:
    low = (testo_ or "").lower()
    low_flat = re.sub(r"[\-\.]", "", low)
    sc = 0.0
    for t in toks:
        n = low.count(t) or low_flat.count(t)
        if n:
            sc += (3 if (any(ch.isdigit() for ch in t) or len(t) > 6) else 1) * min(n, 5)
    return sc


def _chunks(text: str) -> List[str]:
    text = re.sub(r"[ \t]+", " ", text or "").strip()
    out, cur = [], ""
    for par in re.split(r"\n{2,}|\n(?=[A-Z0-9])", text):
        if len(cur) + len(par) > CHUNK and cur:
            out.append(cur.strip()); cur = ""
        cur += par + "\n"
    if cur.strip():
        out.append(cur.strip())
    return out or ([text] if text else [])


async def _estrai_testo(nome: str, contenuto: bytes, mime: str) -> str:
    if mime == "application/pdf" or nome.lower().endswith(".pdf"):
        import fitz
        doc = fitz.open(stream=contenuto, filetype="pdf")
        pagine = [p.get_text() for p in doc]
        txt = "\n\n".join(pagine)
        if len(txt.strip()) < 200 * max(1, len(doc) // 2):  # scansione: OCR via AI sulle prime pagine
            imgs = [base64.b64encode(p.get_pixmap(dpi=110).tobytes("png")).decode() for p in list(doc)[:12]]
            txt += "\n\n" + await vision("Sei un OCR tecnico. Trascrivi fedelmente tutto il testo, tabelle e codici presenti nelle immagini, in ordine.", "Trascrivi il contenuto di queste pagine.", imgs)
        return txt
    if mime.startswith("image/"):
        b64 = base64.b64encode(contenuto).decode()
        return await vision("Sei un OCR tecnico per officina nautica. Trascrivi fedelmente tutto il testo, tabelle, codici errore e valori presenti nell'immagine.", "Trascrivi il contenuto dell'immagine.", [b64])
    return contenuto.decode("utf-8", errors="ignore")


async def _indicizza(scheda_id: str, text: str):
    await db.officina_chunks.delete_many({"scheda_id": scheda_id})
    ch = _chunks(text)
    if ch:
        await db.officina_chunks.insert_many([{"id": str(uuid.uuid4()), "scheda_id": scheda_id, "idx": i, "testo": c} for i, c in enumerate(ch)])
    return len(ch)


# ---------- Schede ----------
class SchedaTestoIn(BaseModel):
    titolo: str
    marca: Optional[str] = ""
    modello: Optional[str] = ""
    testo: str


def _pub(s: dict) -> dict:
    return {k: v for k, v in s.items() if k not in ("_id", "testo", "file_path")}


@router.get("/schede")
async def lista_schede():
    docs = await db.officina_schede.find({}, {"_id": 0, "testo": 0, "file_path": 0}).sort("created_at", -1).to_list(2000)
    return docs


@router.get("/schede/{sid}")
async def dettaglio_scheda(sid: str):
    s = await db.officina_schede.find_one({"id": sid}, {"_id": 0, "file_path": 0})
    if not s:
        raise HTTPException(404, "Scheda non trovata")
    return s


@router.post("/schede/testo")
async def crea_scheda_testo(p: SchedaTestoIn):
    if not p.titolo.strip() or not p.testo.strip():
        raise HTTPException(400, "Titolo e testo obbligatori")
    s = {"id": str(uuid.uuid4()), "titolo": p.titolo.strip(), "marca": (p.marca or "").strip(), "modello": (p.modello or "").strip(),
         "tipo": "testo", "nome_file": "", "testo": p.testo, "caratteri": len(p.testo), "created_at": _now()}
    s["n_chunks"] = await _indicizza(s["id"], p.testo)
    await db.officina_schede.insert_one(s)
    return _pub(s)


@router.post("/schede/upload")
async def upload_scheda(file: UploadFile = File(...), titolo: str = Form(""), marca: str = Form(""), modello: str = Form("")):
    contenuto = await file.read()
    if not contenuto:
        raise HTTPException(400, "File vuoto")
    mime = file.content_type or ""
    sid = str(uuid.uuid4())
    try:
        text = await _estrai_testo(file.filename or "", contenuto, mime)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Impossibile leggere il file: {e}")
    if not text.strip():
        raise HTTPException(400, "Nessun testo leggibile nel file")
    tipo = "pdf" if (mime == "application/pdf" or (file.filename or "").lower().endswith(".pdf")) else "immagine" if mime.startswith("image/") else "testo"
    s = {"id": sid, "titolo": titolo.strip() or (file.filename or "Scheda"), "marca": marca.strip(), "modello": modello.strip(), "tipo": tipo,
         "nome_file": file.filename or "", "testo": text, "caratteri": len(text), "created_at": _now()}
    s["n_chunks"] = await _indicizza(sid, text)
    await db.officina_schede.insert_one(s)
    return _pub(s)


@router.put("/schede/{sid}")
async def aggiorna_scheda(sid: str, p: SchedaTestoIn):
    s = await db.officina_schede.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Scheda non trovata")
    upd = {"titolo": p.titolo.strip() or s["titolo"], "marca": (p.marca or "").strip(), "modello": (p.modello or "").strip(), "testo": p.testo, "caratteri": len(p.testo)}
    upd["n_chunks"] = await _indicizza(sid, p.testo)
    await db.officina_schede.update_one({"id": sid}, {"$set": upd})
    return _pub({**s, **upd})


@router.delete("/schede/{sid}")
async def elimina_scheda(sid: str):
    s = await db.officina_schede.find_one({"id": sid}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Scheda non trovata")
    await db.officina_chunks.delete_many({"scheda_id": sid})
    await db.officina_schede.delete_one({"id": sid})
    return {"ok": True}


# ---------- Casi risolti ----------
class CasoIn(BaseModel):
    motore: str = ""
    codici: Optional[str] = ""
    sintomo: str
    diagnosi: Optional[str] = ""
    soluzione: str
    note: Optional[str] = ""
    autore: Optional[str] = ""


@router.get("/casi")
async def lista_casi():
    return await db.officina_casi.find({}, {"_id": 0}).sort("created_at", -1).to_list(5000)


@router.post("/casi")
async def crea_caso(p: CasoIn):
    return await _crea_caso(p, "gestionale")


async def _crea_caso(p: CasoIn, autore: str):
    if not p.sintomo.strip() or not p.soluzione.strip():
        raise HTTPException(400, "Sintomo e soluzione obbligatori")
    c = {"id": str(uuid.uuid4()), **{k: (v or "").strip() for k, v in p.model_dump().items()}, "created_at": _now()}
    c["autore"] = c["autore"] or autore
    await db.officina_casi.insert_one(c)
    c.pop("_id", None)
    return c


@router.put("/casi/{cid}")
async def aggiorna_caso(cid: str, p: CasoIn):
    r = await db.officina_casi.update_one({"id": cid}, {"$set": {k: (v or "").strip() for k, v in p.model_dump().items()}})
    if not r.matched_count:
        raise HTTPException(404, "Caso non trovato")
    return await db.officina_casi.find_one({"id": cid}, {"_id": 0})


@router.delete("/casi/{cid}")
async def elimina_caso(cid: str):
    await db.officina_casi.delete_one({"id": cid})
    return {"ok": True}


# ---------- Impostazioni ----------
class ConfigIn(BaseModel):
    tavily_key: Optional[str] = None
    web_default: Optional[bool] = None


async def _config() -> dict:
    c = await db.officina_config.find_one({"id": "default"}, {"_id": 0}) or {}
    key = c.get("tavily_key") or os.environ.get("TAVILY_API_KEY", "")
    return {"tavily_key": key, "web_default": bool(c.get("web_default", False)), "chiave_personalizzata": bool(c.get("tavily_key"))}


@router.get("/config")
async def get_config():
    c = await _config()
    k = c["tavily_key"]
    return {"tavily_configurata": bool(k), "tavily_mascherata": (k[:8] + "…" + k[-4:]) if len(k) > 14 else ("•••" if k else ""),
            "chiave_personalizzata": c["chiave_personalizzata"], "web_default": c["web_default"]}


@router.put("/config")
async def set_config(p: ConfigIn):
    upd = {}
    if p.tavily_key is not None:
        upd["tavily_key"] = p.tavily_key.strip()
    if p.web_default is not None:
        upd["web_default"] = bool(p.web_default)
    await db.officina_config.update_one({"id": "default"}, {"$set": upd}, upsert=True)
    return await get_config()


async def _tavily(query: str, key: str) -> List[dict]:
    if not key:
        return []
    try:
        async with httpx.AsyncClient(timeout=25) as cl:
            r = await cl.post("https://api.tavily.com/search", json={"api_key": key, "query": query, "max_results": 5, "search_depth": "advanced", "include_answer": False})
        if r.status_code != 200:
            raise HTTPException(502, f"Ricerca web non riuscita ({r.status_code}): controlla la chiave Tavily")
        return [{"titolo": x.get("title", ""), "url": x.get("url", ""), "testo": (x.get("content") or "")[:1200]} for x in r.json().get("results", [])]
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Ricerca web non raggiungibile: {e}")


# ---------- Chat ----------
class ChatIn(BaseModel):
    messaggio: str
    session_id: str
    web: bool = False


SYSTEM = """Sei l'Assistente Officina di un cantiere nautico (motori fuoribordo/entrobordo, gommoni, impianti di bordo).
Rispondi in italiano, con linguaggio tecnico da meccanico, in modo ordinato e conciso.
REGOLE:
1. Basa le risposte SOLO sulle SCHEDE TECNICHE e sui CASI RISOLTI forniti nel contesto (ed eventuali RISULTATI WEB se presenti). Non inventare valori, coppie di serraggio, codici o procedure.
2. Se il contesto non contiene l'informazione, dillo chiaramente ("Nelle schede caricate non trovo…") e suggerisci cosa caricare o di attivare la ricerca web.
3. Per codici errore: spiega il significato, le cause probabili in ordine di probabilità e i controlli da fare passo-passo.
4. Per sintomi: proponi ipotesi di diagnosi ordinate per probabilità, segnalando quali derivano dall'esperienza (casi risolti) e quali dalle schede.
5. Cita sempre le fonti usate tra parentesi quadre, es. [Scheda: Manuale DF140] o [Caso: 12/03/2025] o [Web: titolo].
6. Chiudi, se utile, con una riga "Da verificare:" con la domanda che faresti al meccanico per restringere la diagnosi.
Formatta con brevi titoli in grassetto ed elenchi puntati."""


async def _rispondi(p: ChatIn, canale: str) -> dict:
    msg = (p.messaggio or "").strip()
    if not msg:
        raise HTTPException(400, "Messaggio vuoto")
    toks = _tokens(msg)
    chunks = await db.officina_chunks.find({}, {"_id": 0}).to_list(50000)
    schede = {s["id"]: s for s in await db.officina_schede.find({}, {"_id": 0, "testo": 0, "file_path": 0}).to_list(5000)}
    for c in chunks:
        s = schede.get(c["scheda_id"], {})
        c["_s"] = _score(c["testo"], toks) + 0.5 * _score(f"{s.get('titolo','')} {s.get('marca','')} {s.get('modello','')}", toks)
    top = sorted([c for c in chunks if c["_s"] > 0], key=lambda c: -c["_s"])[:8]
    casi = await db.officina_casi.find({}, {"_id": 0}).to_list(5000)
    for c in casi:
        c["_s"] = _score(" ".join(str(c.get(k) or "") for k in ("motore", "codici", "sintomo", "diagnosi", "soluzione", "note")), toks)
    top_casi = sorted([c for c in casi if c["_s"] > 0], key=lambda c: -c["_s"])[:5]

    web = []
    if p.web:
        web = await _tavily(msg, (await _config())["tavily_key"])

    storia = await db.officina_chat.find({"session_id": p.session_id}, {"_id": 0}).sort("ts", -1).to_list(8)
    storia = list(reversed(storia))

    ctx = []
    if top:
        ctx.append("=== SCHEDE TECNICHE ===")
        for c in top:
            s = schede.get(c["scheda_id"], {})
            ctx.append(f"[Scheda: {s.get('titolo','?')}{(' · ' + s.get('marca')) if s.get('marca') else ''}{(' ' + s.get('modello')) if s.get('modello') else ''}]\n{c['testo']}")
    else:
        ctx.append("=== SCHEDE TECNICHE === (nessuna scheda pertinente trovata)")
    if top_casi:
        ctx.append("=== CASI RISOLTI (esperienza officina) ===")
        for c in top_casi:
            ctx.append(f"[Caso: {c.get('created_at','')[:10]} · {c.get('motore','')}] codici: {c.get('codici','') or '—'} | sintomo: {c.get('sintomo','')} | diagnosi: {c.get('diagnosi','') or '—'} | soluzione: {c.get('soluzione','')}")
    if web:
        ctx.append("=== RISULTATI WEB ===")
        for w in web:
            ctx.append(f"[Web: {w['titolo']}] ({w['url']})\n{w['testo']}")
    if storia:
        ctx.append("=== CONVERSAZIONE PRECEDENTE ===")
        for h in storia:
            ctx.append(f"{'Meccanico' if h['ruolo'] == 'utente' else 'Assistente'}: {h['testo'][:800]}")
    prompt = "\n\n".join(ctx) + f"\n\n=== DOMANDA DEL MECCANICO ===\n{msg}"
    risposta = await testo(SYSTEM, prompt)

    ts = _now()
    await db.officina_chat.insert_many([
        {"id": str(uuid.uuid4()), "session_id": p.session_id, "ruolo": "utente", "testo": msg, "ts": ts, "canale": canale},
        {"id": str(uuid.uuid4()), "session_id": p.session_id, "ruolo": "assistente", "testo": risposta, "ts": ts, "canale": canale},
    ])
    fonti = [{"tipo": "scheda", "titolo": schede.get(c["scheda_id"], {}).get("titolo", "?"), "id": c["scheda_id"]} for c in top]
    fonti = list({f["id"]: f for f in fonti}.values())
    fonti += [{"tipo": "caso", "titolo": f"{c.get('motore','')} · {c.get('sintomo','')[:60]}", "id": c["id"]} for c in top_casi]
    fonti += [{"tipo": "web", "titolo": w["titolo"], "url": w["url"]} for w in web]
    return {"risposta": risposta, "fonti": fonti, "web_usato": bool(web), "schede_trovate": len(top), "casi_trovati": len(top_casi)}


@router.post("/chat")
async def chat(p: ChatIn):
    return await _rispondi(p, "gestionale")


@router.get("/chat/{session_id}")
async def storico_chat(session_id: str):
    docs = await db.officina_chat.find({"session_id": session_id}, {"_id": 0}).sort("ts", 1).to_list(200)
    return docs


@router.delete("/chat/{session_id}")
async def azzera_chat(session_id: str):
    await db.officina_chat.delete_many({"session_id": session_id})
    return {"ok": True}


# ---------- App dipendenti ----------
from routers.mobile import get_dipendente  # noqa: E402

mobile_router = APIRouter(prefix="/api/mobile/officina")


@mobile_router.post("/chat")
async def chat_mobile(p: ChatIn, dip: dict = Depends(get_dipendente)):
    return await _rispondi(p, f"app:{dip.get('nome','')}")


@mobile_router.get("/chat/{session_id}")
async def storico_mobile(session_id: str, dip: dict = Depends(get_dipendente)):
    return await db.officina_chat.find({"session_id": session_id}, {"_id": 0}).sort("ts", 1).to_list(200)


@mobile_router.post("/casi")
async def caso_mobile(p: CasoIn, dip: dict = Depends(get_dipendente)):
    return await _crea_caso(p, dip.get("nome", "dipendente"))


@mobile_router.get("/config")
async def config_mobile(dip: dict = Depends(get_dipendente)):
    c = await _config()
    return {"tavily_configurata": bool(c["tavily_key"]), "web_default": c["web_default"]}
