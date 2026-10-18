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
    docs = await db.officina_schede.find({"tipo": {"$ne": "web"}}, {"_id": 0, "testo": 0, "file_path": 0}).sort("created_at", -1).to_list(2000)
    return docs


@router.get("/schede/anteprima-nome")
async def anteprima_nome(nome: str, percorso: str = ""):
    return deduci_marca_modello(nome, percorso)


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


MARCHE_NOTE = ["Suzuki", "Yamaha", "Mercury", "MerCruiser", "Mariner", "Honda", "Tohatsu", "Evinrude", "Johnson", "Selva", "Volvo Penta", "Volvo", "Yanmar", "Parsun", "Hidea", "Lombardini", "Nanni", "Seadoo", "Sea-Doo", "BRP", "Rotax", "Zodiac", "Garmin", "Raymarine", "Lowrance", "Simrad", "Humminbird", "MFG"]
_RE_MODELLO = re.compile(r"\b((?:DF|BF|FT|MFS|MD|VF|F|D|E|M)?\s?\d{1,3}(?:[.,]\d)?[A-Z]{0,4}(?:\s(?:HP|CV|EFI|XL|TXR|TLR|ETX|ELPT|XS|PRO|XR))?)\b", re.I)


def deduci_marca_modello(nome_file: str, percorso: str = "") -> dict:
    """Ricava marca/modello/titolo da nome file e cartella (es. 'Suzuki/DF140A manuale officina.pdf')."""
    base = re.sub(r"\.[A-Za-z0-9]{2,5}$", "", os.path.basename(nome_file or ""))
    pulito = re.sub(r"(?<=\d)[.,](?=\d)", "§", base)
    pulito = re.sub(r"[_\-\.]+", " ", pulito).replace("§", ".").strip()
    cartelle = [c for c in re.split(r"[\\/]", percorso or "") if c and c != os.path.basename(nome_file or "")]
    testo_ = " ".join(cartelle + [pulito])
    marca = ""
    for m in sorted(MARCHE_NOTE, key=len, reverse=True):
        if re.search(rf"\b{re.escape(m)}\b", testo_, re.I):
            marca = m
            break
    if not marca and len(cartelle) >= 2:  # la cartella radice della selezione non è una marca: usa solo la sottocartella
        marca = cartelle[-1].strip().title()
    resto = re.sub(rf"\b{re.escape(marca)}\b", " ", pulito, flags=re.I) if marca else pulito
    modello = ""
    for cand in _RE_MODELLO.findall(" ".join(cartelle[1:] + [resto])):
        c = re.sub(r"\s+", "", cand).upper()
        if re.search(r"\d", c) and not re.fullmatch(r"(19|20)\d{2}", c) and 2 <= len(c) <= 10:
            modello = c
            break
    titolo = pulito if pulito else base
    return {"marca": marca, "modello": modello, "titolo": titolo}


@router.post("/schede/upload")
async def upload_scheda(file: UploadFile = File(...), titolo: str = Form(""), marca: str = Form(""), modello: str = Form(""), percorso: str = Form(""), auto: str = Form("")):
    contenuto = await file.read()
    if not contenuto:
        raise HTTPException(400, "File vuoto")
    mime = file.content_type or ""
    sid = str(uuid.uuid4())
    ded = deduci_marca_modello(file.filename or "", percorso) if (auto or not (marca.strip() and modello.strip())) else {"marca": "", "modello": "", "titolo": ""}
    marca, modello = (marca.strip() or ded["marca"]), (modello.strip() or ded["modello"])
    titolo = titolo.strip() or ded["titolo"] or (file.filename or "Scheda")
    try:
        text = await _estrai_testo(file.filename or "", contenuto, mime)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Impossibile leggere il file: {e}")
    if not text.strip():
        raise HTTPException(400, "Nessun testo leggibile nel file")
    tipo = "pdf" if (mime == "application/pdf" or (file.filename or "").lower().endswith(".pdf")) else "immagine" if mime.startswith("image/") else "testo"
    s = {"id": sid, "titolo": titolo, "marca": marca, "modello": modello, "tipo": tipo,
         "nome_file": file.filename or "", "percorso": percorso, "testo": text, "caratteri": len(text), "created_at": _now()}
    s["n_chunks"] = await _indicizza(sid, text)
    await db.officina_schede.insert_one(s)
    return _pub(s)


class SchedaMetaIn(BaseModel):
    titolo: Optional[str] = None
    marca: Optional[str] = None
    modello: Optional[str] = None


@router.patch("/schede/{sid}")
async def aggiorna_meta_scheda(sid: str, p: SchedaMetaIn):
    """Modifica solo titolo/marca/modello senza reindicizzare il testo."""
    upd = {k: v.strip() for k, v in p.model_dump().items() if v is not None}
    if "titolo" in upd and not upd["titolo"]:
        raise HTTPException(400, "Il titolo non può essere vuoto")
    r = await db.officina_schede.update_one({"id": sid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "Scheda non trovata")
    return _pub(await db.officina_schede.find_one({"id": sid}, {"_id": 0}))


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


async def _tavily_call(cl, query: str, key: str, max_results: int, domini: Optional[List[str]] = None) -> List[dict]:
    body = {"api_key": key, "query": query, "max_results": max_results, "search_depth": "advanced", "include_answer": False}
    if domini:
        body["include_domains"] = domini
    r = await cl.post("https://api.tavily.com/search", json=body)
    if r.status_code != 200:
        raise HTTPException(502, f"Ricerca web non riuscita ({r.status_code}): controlla la chiave Tavily")
    return [{"titolo": x.get("title", ""), "url": x.get("url", ""), "testo": (x.get("content") or "")[:1200], "preferito": bool(domini)} for x in r.json().get("results", [])]


async def _tavily(query: str, key: str) -> List[dict]:
    """Prima i siti di riferimento scelti dall'officina (in ordine di priorità), poi il resto del web."""
    if not key:
        return []
    from routers.officina_siti import domini_prioritari
    domini = await domini_prioritari()
    try:
        async with httpx.AsyncClient(timeout=25) as cl:
            out = await _tavily_call(cl, query, key, 4, domini) if domini else []
            urls = {w["url"] for w in out}
            out += [w for w in await _tavily_call(cl, query, key, 5) if w["url"] not in urls]
        return out[:8]
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Ricerca web non raggiungibile: {e}")


# ---------- Codici errore ----------
def _norm_codice(c: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (c or "").upper())


class CodiceIn(BaseModel):
    marca: str
    modello: Optional[str] = ""
    codice: str
    descrizione: str
    cause: Optional[str] = ""
    controlli: Optional[str] = ""


class ImportCodiciIn(BaseModel):
    marca: str
    modello: Optional[str] = ""
    testo: str  # una riga per codice: "C-04 | descrizione | cause | controlli" (separatori | ; tab) oppure "C-04 descrizione"


def _parse_righe(testo: str) -> List[dict]:
    out = []
    for riga in (testo or "").splitlines():
        riga = riga.strip().strip("-•").strip()
        if not riga:
            continue
        parti = [p.strip() for p in re.split(r"\s*[|;\t]\s*", riga)]
        if len(parti) == 1:
            m = re.match(r"^([A-Za-z]{0,4}[-\s]?\d{1,4}[A-Za-z]?)[\s:.\-–]+(.+)$", riga)
            if not m:
                continue
            parti = [m.group(1), m.group(2)]
        cod, descr = parti[0], parti[1] if len(parti) > 1 else ""
        if not _norm_codice(cod) or not descr:
            continue
        out.append({"codice": cod.upper(), "descrizione": descr, "cause": parti[2] if len(parti) > 2 else "", "controlli": parti[3] if len(parti) > 3 else ""})
    return out


async def _salva_codici(marca: str, modello: str, righe: List[dict]) -> dict:
    marca, modello = marca.strip(), (modello or "").strip()
    if not marca:
        raise HTTPException(400, "Marca obbligatoria (es. Suzuki, Mercury)")
    nuovi = aggiornati = 0
    for r in righe:
        key = {"marca_norm": marca.lower(), "modello_norm": modello.lower(), "codice_norm": _norm_codice(r["codice"])}
        doc = {**key, "marca": marca, "modello": modello, "codice": r["codice"].strip().upper(), "descrizione": r["descrizione"].strip(),
               "cause": (r.get("cause") or "").strip(), "controlli": (r.get("controlli") or "").strip(), "updated_at": _now()}
        res = await db.officina_codici.update_one(key, {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": _now()}}, upsert=True)
        if res.upserted_id:
            nuovi += 1
        else:
            aggiornati += 1
    return {"nuovi": nuovi, "aggiornati": aggiornati}


@router.get("/codici")
async def lista_codici(marca: str = "", q: str = ""):
    f = {}
    if marca.strip():
        f["marca_norm"] = marca.strip().lower()
    docs = await db.officina_codici.find(f, {"_id": 0}).sort([("marca", 1), ("modello", 1), ("codice", 1)]).to_list(20000)
    if q.strip():
        ql, qn = q.strip().lower(), _norm_codice(q)
        docs = [d for d in docs if ql in f"{d['codice']} {d['descrizione']} {d.get('cause','')} {d.get('controlli','')} {d.get('modello','')}".lower() or (qn and qn in d["codice_norm"])]
    return docs


@router.get("/codici/marche")
async def marche_codici():
    pipe = [{"$group": {"_id": "$marca", "n": {"$sum": 1}}}, {"$sort": {"_id": 1}}]
    return [{"marca": g["_id"], "n": g["n"]} async for g in db.officina_codici.aggregate(pipe)]


@router.post("/codici")
async def crea_codice(p: CodiceIn):
    if not p.codice.strip() or not p.descrizione.strip():
        raise HTTPException(400, "Codice e descrizione obbligatori")
    return await _salva_codici(p.marca, p.modello or "", [p.model_dump()])


@router.post("/codici/import")
async def importa_codici(p: ImportCodiciIn):
    righe = _parse_righe(p.testo)
    if not righe:
        raise HTTPException(400, "Nessuna riga valida: usa il formato 'CODICE | descrizione | cause | controlli' oppure 'CODICE descrizione'")
    return {**(await _salva_codici(p.marca, p.modello or "", righe)), "righe": len(righe)}


@router.post("/codici/import-file")
async def importa_codici_file(file: UploadFile = File(...), marca: str = Form(...), modello: str = Form("")):
    contenuto = await file.read()
    mime = file.content_type or ""
    testo_ = await _estrai_testo(file.filename or "", contenuto, mime) if (mime == "application/pdf" or mime.startswith("image/")) else contenuto.decode("utf-8", errors="ignore")
    righe = _parse_righe(testo_.replace(",", " | ") if (file.filename or "").lower().endswith(".csv") else testo_)
    if not righe:
        raise HTTPException(400, "Nessun codice riconosciuto nel file")
    return {**(await _salva_codici(marca, modello, righe)), "righe": len(righe)}


@router.put("/codici/{cid}")
async def aggiorna_codice(cid: str, p: CodiceIn):
    d = {"marca": p.marca.strip(), "marca_norm": p.marca.strip().lower(), "modello": (p.modello or "").strip(), "modello_norm": (p.modello or "").strip().lower(),
         "codice": p.codice.strip().upper(), "codice_norm": _norm_codice(p.codice), "descrizione": p.descrizione.strip(), "cause": (p.cause or "").strip(), "controlli": (p.controlli or "").strip(), "updated_at": _now()}
    r = await db.officina_codici.update_one({"id": cid}, {"$set": d})
    if not r.matched_count:
        raise HTTPException(404, "Codice non trovato")
    return await db.officina_codici.find_one({"id": cid}, {"_id": 0})


@router.delete("/codici/{cid}")
async def elimina_codice(cid: str):
    await db.officina_codici.delete_one({"id": cid})
    return {"ok": True}


@router.delete("/codici")
async def elimina_codici_marca(marca: str):
    r = await db.officina_codici.delete_many({"marca_norm": marca.strip().lower()})
    return {"eliminati": r.deleted_count}


async def _codici_per_domanda(msg: str, marca: str = "") -> List[dict]:
    """Codici errore citati nella domanda (match esatto normalizzato, es. 'c-04' = 'C04')."""
    cand = {_norm_codice(m) for m in re.findall(r"\b[A-Za-z]{0,4}[-\s]?\d{1,4}[A-Za-z]?\b", msg)}
    cand = {c for c in cand if any(ch.isdigit() for ch in c) and len(c) <= 8}
    if not cand:
        return []
    f = {"codice_norm": {"$in": list(cand)}}
    if marca.strip():
        f["marca_norm"] = marca.strip().lower()
    docs = await db.officina_codici.find(f, {"_id": 0}).to_list(50)
    toks = _tokens(msg)
    return sorted(docs, key=lambda d: -_score(f"{d['marca']} {d.get('modello','')}", toks))[:10]


# ---------- Memo officina (appunti liberi dell'operatore: codici, promemoria…) ----------
class MemoIn(BaseModel):
    titolo: str
    testo: Optional[str] = ""
    autore: Optional[str] = ""


@router.get("/memo")
async def lista_memo():
    return await db.officina_memo.find({}, {"_id": 0}).sort("updated_at", -1).to_list(5000)


async def _crea_memo(p: MemoIn, autore: str):
    if not p.titolo.strip():
        raise HTTPException(400, "Titolo obbligatorio")
    m = {"id": str(uuid.uuid4()), "titolo": p.titolo.strip(), "testo": (p.testo or "").strip(), "autore": (p.autore or "").strip() or autore, "created_at": _now(), "updated_at": _now()}
    await db.officina_memo.insert_one(m)
    m.pop("_id", None)
    return m


@router.post("/memo")
async def crea_memo(p: MemoIn):
    return await _crea_memo(p, "gestionale")


@router.put("/memo/{mid}")
async def aggiorna_memo(mid: str, p: MemoIn):
    r = await db.officina_memo.update_one({"id": mid}, {"$set": {"titolo": p.titolo.strip(), "testo": (p.testo or "").strip(), "updated_at": _now()}})
    if not r.matched_count:
        raise HTTPException(404, "Memo non trovato")
    return await db.officina_memo.find_one({"id": mid}, {"_id": 0})


@router.delete("/memo/{mid}")
async def elimina_memo(mid: str):
    await db.officina_memo.delete_one({"id": mid})
    return {"ok": True}


# ---------- Chat ----------
class ChatIn(BaseModel):
    messaggio: str
    session_id: str
    web: bool = False
    marca: Optional[str] = ""
    modello: Optional[str] = ""


async def ensure_indexes():
    await db.officina_chunks.create_index("scheda_id")
    await db.officina_chunks.create_index([("testo", "text")], default_language="none", name="testo_text")
    await db.officina_schede.create_index([("marca", 1), ("modello", 1)])
    await db.officina_codici.create_index([("marca_norm", 1), ("modello_norm", 1), ("codice_norm", 1)], unique=True)


@router.get("/modelli")
async def modelli():
    """Elenco marca/modello presenti nelle schede, con conteggio."""
    pipe = [{"$group": {"_id": {"marca": "$marca", "modello": "$modello"}, "n": {"$sum": 1}}}, {"$sort": {"_id.marca": 1, "_id.modello": 1}}]
    out = []
    async for g in db.officina_schede.aggregate(pipe):
        out.append({"marca": g["_id"].get("marca") or "", "modello": g["_id"].get("modello") or "", "n": g["n"]})
    return out


async def _cerca_chunks(msg: str, toks: List[str], schede: dict, filtro_ids: Optional[set]) -> list:
    """Stage 1: ricerca full-text Mongo (scala a migliaia di schede); stage 2: ri-punteggio con boost su marca/modello citati."""
    q = {"$text": {"$search": msg}}
    if filtro_ids is not None:
        q["scheda_id"] = {"$in": list(filtro_ids)}
    cand = await db.officina_chunks.find(q, {"_id": 0, "score": {"$meta": "textScore"}}).sort([("score", {"$meta": "textScore"})]).limit(80).to_list(80)
    if not cand:  # codici tipo "C-04" o termini rari: fallback regex sui blocchi delle schede filtrate (o di quelle con marca/modello citati)
        ids = filtro_ids
        if ids is None:
            ids = {sid for sid, s in schede.items() if _score(f"{s.get('marca','')} {s.get('modello','')} {s.get('titolo','')}", toks) > 0} or None
        rq = {"$or": [{"testo": {"$regex": re.escape(t), "$options": "i"}} for t in toks[:12] if len(t) >= 3]}
        if ids is not None:
            rq["scheda_id"] = {"$in": list(ids)}
        cand = await db.officina_chunks.find(rq, {"_id": 0}).limit(300).to_list(300) if rq["$or"] else []
    for c in cand:
        s = schede.get(c["scheda_id"], {})
        c["_s"] = _score(c["testo"], toks) + 0.5 * _score(f"{s.get('titolo','')} {s.get('marca','')} {s.get('modello','')}", toks) + float(c.get("score") or 0)
        c.pop("score", None)
    return sorted([c for c in cand if c["_s"] > 0], key=lambda c: -c["_s"])[:8]


SYSTEM = """Sei l'Assistente Officina di un cantiere nautico (motori fuoribordo/entrobordo, gommoni, impianti di bordo).
Rispondi in italiano, con linguaggio tecnico da meccanico, in modo ordinato e conciso.
REGOLE:
1. Basa le risposte SOLO sulla TABELLA CODICI ERRORE, sui MEMO DELL'OPERATORE, sulle SCHEDE TECNICHE e sui CASI RISOLTI forniti nel contesto (ed eventuali RISULTATI WEB se presenti). Non inventare valori, coppie di serraggio, codici o procedure. Se la tabella codici contiene il codice chiesto, quella è la fonte principale.
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
    schede = {s["id"]: s for s in await db.officina_schede.find({}, {"_id": 0, "testo": 0, "file_path": 0}).to_list(20000)}
    filtro = None
    if (p.marca or "").strip() or (p.modello or "").strip():
        filtro = {sid for sid, s in schede.items()
                  if (not (p.marca or "").strip() or (s.get("marca") or "").lower() == p.marca.strip().lower())
                  and (not (p.modello or "").strip() or (s.get("modello") or "").lower() == p.modello.strip().lower())}
    top = await _cerca_chunks(msg, toks, schede, filtro)
    codici = await _codici_per_domanda(msg, p.marca or "")
    memo = await db.officina_memo.find({}, {"_id": 0}).to_list(5000)
    for m in memo:
        m["_s"] = _score(f"{m['titolo']} {m.get('testo','')}", toks)
    top_memo = sorted([m for m in memo if m["_s"] > 0], key=lambda m: -m["_s"])[:5]
    casi = await db.officina_casi.find({}, {"_id": 0}).to_list(20000)
    for c in casi:
        c["_s"] = _score(" ".join(str(c.get(k) or "") for k in ("motore", "codici", "sintomo", "diagnosi", "soluzione", "note")), toks)
    top_casi = sorted([c for c in casi if c["_s"] > 0], key=lambda c: -c["_s"])[:5]

    web = []
    if p.web:
        web = await _tavily(msg, (await _config())["tavily_key"])

    storia = await db.officina_chat.find({"session_id": p.session_id}, {"_id": 0}).sort("ts", -1).to_list(8)
    storia = list(reversed(storia))

    ctx = []
    if filtro is not None:
        ctx.append(f"=== FILTRO ATTIVO: solo schede {p.marca or ''} {p.modello or ''} ===")
    if codici:
        ctx.append("=== TABELLA CODICI ERRORE (fonte ufficiale caricata dall'officina) ===")
        for c in codici:
            ctx.append(f"[Codice: {c['marca']}{(' ' + c['modello']) if c.get('modello') else ''} {c['codice']}] {c['descrizione']}" + (f" | Cause: {c['cause']}" if c.get("cause") else "") + (f" | Controlli: {c['controlli']}" if c.get("controlli") else ""))
    if top_memo:
        ctx.append("=== MEMO DELL'OPERATORE (appunti personali dell'officina) ===")
        for m in top_memo:
            ctx.append(f"[Memo: {m['titolo']}] {m.get('testo','')}")
    if top:
        ctx.append("=== SCHEDE TECNICHE (incluse pagine dei SITI DI RIFERIMENTO indicizzati, citale come [Sito: nome · titolo]) ===")
        for c in top:
            s = schede.get(c["scheda_id"], {})
            if s.get("tipo") == "web":
                ctx.append(f"[Sito: {s.get('sito','')} · {s.get('titolo','?')}] ({s.get('url','')})\n{c['testo']}")
            else:
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
            ctx.append(f"[Web{' · sito di riferimento' if w.get('preferito') else ''}: {w['titolo']}] ({w['url']})\n{w['testo']}")
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
    fonti = [{"tipo": "codice", "titolo": f"{c['marca']} {c['codice']}", "id": c["id"]} for c in codici]
    fonti += [{"tipo": "memo", "titolo": m["titolo"], "id": m["id"]} for m in top_memo]
    for c in top:
        s = schede.get(c["scheda_id"], {})
        fonti.append({"tipo": "sito", "titolo": f"{s.get('sito','')} · {s.get('titolo','?')}", "id": c["scheda_id"], "url": s.get("url", "")} if s.get("tipo") == "web"
                     else {"tipo": "scheda", "titolo": s.get("titolo", "?"), "id": c["scheda_id"]})
    fonti = list({(f["tipo"], f["id"]): f for f in fonti}.values())
    fonti += [{"tipo": "caso", "titolo": f"{c.get('motore','')} · {c.get('sintomo','')[:60]}", "id": c["id"]} for c in top_casi]
    fonti += [{"tipo": "web", "titolo": w["titolo"], "url": w["url"]} for w in web]
    return {"risposta": risposta, "fonti": fonti, "web_usato": bool(web), "schede_trovate": len(top), "casi_trovati": len(top_casi), "codici_trovati": len(codici)}


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


# ---------- Lettura targhetta/matricola da foto ----------
class FotoIn(BaseModel):
    immagine: str  # base64 (data URL ammesso)
    session_id: Optional[str] = ""


async def _leggi_targhetta(p: FotoIn, canale: str) -> dict:
    if not (p.immagine or "").strip():
        raise HTTPException(400, "Immagine mancante")
    out = await vision(
        "Sei un tecnico di officina nautica. Leggi la targhetta/etichetta identificativa di un motore marino (fuoribordo o entrobordo) o di un'imbarcazione fotografata. Rispondi SOLO con JSON valido.",
        'Estrai dalla foto: {"marca":"","modello":"","matricola":"","anno":"","potenza":"","altri_dati":"","testo_letto":""}. '
        "marca = costruttore (Suzuki, Yamaha, Mercury, Honda, Tohatsu, Selva, Volvo Penta, Yanmar, …); modello = sigla (es. DF140A, F40, MFS9.9); matricola = numero di serie/serial number/No. (riporta esattamente come stampato); "
        "anno = anno di produzione se presente o deducibile; potenza = kW o HP se presenti; altri_dati = peso, tensione, codici colore o altro utile; testo_letto = tutto il testo leggibile. Campi vuoti se non leggibili. Nessun testo fuori dal JSON.",
        [p.immagine])
    import json
    m = re.search(r"\{.*\}", out, re.S)
    try:
        dati = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        dati = {}
    dati = {k: str(dati.get(k) or "").strip() for k in ("marca", "modello", "matricola", "anno", "potenza", "altri_dati", "testo_letto")}
    if not any(dati[k] for k in ("marca", "modello", "matricola")):
        raise HTTPException(422, "Non riesco a leggere la targhetta: riprova con più luce, inquadrando da vicino e senza riflessi")
    riga = " · ".join(x for x in [f"{dati['marca']} {dati['modello']}".strip(), f"matricola {dati['matricola']}" if dati["matricola"] else "", f"anno {dati['anno']}" if dati["anno"] else "", dati["potenza"]] if x)
    if p.session_id:
        await db.officina_chat.insert_one({"id": str(uuid.uuid4()), "session_id": p.session_id, "ruolo": "utente", "testo": f"[Foto targhetta] {riga}", "ts": _now(), "canale": canale})
    return {**dati, "riga": riga}


@router.post("/targhetta")
async def leggi_targhetta(p: FotoIn):
    return await _leggi_targhetta(p, "gestionale")


# ---------- App dipendenti ----------
from routers.mobile import get_dipendente  # noqa: E402

mobile_router = APIRouter(prefix="/api/mobile/officina")


@mobile_router.post("/chat")
async def chat_mobile(p: ChatIn, dip: dict = Depends(get_dipendente)):
    return await _rispondi(p, f"app:{dip.get('nome','')}")


@mobile_router.post("/targhetta")
async def targhetta_mobile(p: FotoIn, dip: dict = Depends(get_dipendente)):
    return await _leggi_targhetta(p, f"app:{dip.get('nome','')}")


@mobile_router.get("/chat/{session_id}")
async def storico_mobile(session_id: str, dip: dict = Depends(get_dipendente)):
    return await db.officina_chat.find({"session_id": session_id}, {"_id": 0}).sort("ts", 1).to_list(200)


@mobile_router.post("/casi")
async def caso_mobile(p: CasoIn, dip: dict = Depends(get_dipendente)):
    return await _crea_caso(p, dip.get("nome", "dipendente"))


@mobile_router.get("/memo")
async def memo_mobile(dip: dict = Depends(get_dipendente)):
    return await lista_memo()


@mobile_router.post("/memo")
async def crea_memo_mobile(p: MemoIn, dip: dict = Depends(get_dipendente)):
    return await _crea_memo(p, dip.get("nome", "dipendente"))


@mobile_router.get("/codici")
async def codici_mobile(marca: str = "", q: str = "", dip: dict = Depends(get_dipendente)):
    return await lista_codici(marca, q)


@mobile_router.get("/modelli")
async def modelli_mobile(dip: dict = Depends(get_dipendente)):
    return await modelli()


@mobile_router.get("/config")
async def config_mobile(dip: dict = Depends(get_dipendente)):
    c = await _config()
    return {"tavily_configurata": bool(c["tavily_key"]), "web_default": c["web_default"]}
