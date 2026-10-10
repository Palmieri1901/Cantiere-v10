"""Comunicazioni preventive alaggio/varo alla Capitaneria di porto, divise per porto."""
import io
import os
import uuid
from html import escape
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db
from email_service import send_email
from pdf_capitaneria import build_comunicazione_capitaneria_pdf, fmt_mt

router = APIRouter()
public_router = APIRouter()

PORTI = {
    "marina_di_campo": {"nome": "Marina di Campo", "ufficio_locale_marittimo": "", "delegazione_spiaggia": "Campo nell'Elba"},
    "marciana_marina": {"nome": "Marciana Marina", "ufficio_locale_marittimo": "Marciana Marina", "delegazione_spiaggia": ""},
}

DEFAULT_SETTINGS = {
    "id": "capitaneria",
    "ordinanza": "Ordinanza n. 61/2023, in data 03/08/2023 della Capitaneria di porto di Portoferraio",
    "dichiarante": "Palmieri Sandro",
    "ditta": "GEB di Palmieri Sandro",
    "ditta_sede": "Campo nell'Elba",
    "ditta_via": "Via degli Artigiani, 1",
    "resp_nome": "Sandro", "resp_cognome": "Palmieri", "resp_nato_a": "Torino", "resp_nato_il": "1972-01-19",
    "resp_qualifica": "titolare", "resp_cellulare": "3472600872",
    "firma_localita": "Marina di Campo",
    "email_mittente": "GEB Nautica",
    "porti": {k: {**v, "email": ""} for k, v in PORTI.items()},
}


class CapitaneriaSettings(BaseModel):
    ordinanza: Optional[str] = None
    dichiarante: Optional[str] = None
    ditta: Optional[str] = None
    ditta_sede: Optional[str] = None
    ditta_via: Optional[str] = None
    resp_nome: Optional[str] = None
    resp_cognome: Optional[str] = None
    resp_nato_a: Optional[str] = None
    resp_nato_il: Optional[str] = None
    resp_qualifica: Optional[str] = None
    resp_cellulare: Optional[str] = None
    firma_localita: Optional[str] = None
    email_mittente: Optional[str] = None
    porti: Optional[dict] = None


class ComunicazioneIn(BaseModel):
    porto: str
    ordinanza: Optional[str] = ""
    ufficio_locale_marittimo: Optional[str] = ""
    delegazione_spiaggia: Optional[str] = ""
    porto_nome: Optional[str] = ""
    dichiarante: Optional[str] = ""
    ditta: Optional[str] = ""
    ditta_sede: Optional[str] = ""
    ditta_via: Optional[str] = ""
    data_operazione: Optional[str] = ""
    ora_operazione: Optional[str] = ""
    alaggio: bool = False
    varo: bool = False
    uso: Optional[str] = "diporto"
    tipo_unita: Optional[str] = "natante"
    unita_nome: Optional[str] = ""
    unita_iscrizione: Optional[str] = ""
    unita_nominativo: Optional[str] = ""
    unita_lunghezza: Optional[str] = ""
    unita_pescaggio: Optional[str] = ""
    unita_larghezza: Optional[str] = ""
    resp_nome: Optional[str] = ""
    resp_cognome: Optional[str] = ""
    resp_nato_a: Optional[str] = ""
    resp_nato_il: Optional[str] = ""
    resp_qualifica: Optional[str] = ""
    resp_cellulare: Optional[str] = ""
    firma_localita: Optional[str] = ""
    firma_data: Optional[str] = ""
    note: Optional[str] = ""


async def get_settings() -> dict:
    doc = await db.app_settings.find_one({"id": "capitaneria"}, {"_id": 0})
    return _merge_settings(doc)


def _merge_settings(doc) -> dict:
    out = {**DEFAULT_SETTINGS, **(doc or {})}
    out["porti"] = {k: {**v, "email": "", **((out.get("porti") or {}).get(k) or {})} for k, v in PORTI.items()}
    out["smtp_configurato"] = bool(os.environ.get("SMTP_HOST"))
    return out


@router.get("/capitaneria/impostazioni")
async def leggi_impostazioni():
    return await get_settings()


@router.put("/capitaneria/impostazioni")
async def salva_impostazioni(payload: CapitaneriaSettings):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "porti" in data:
        cur = (await get_settings())["porti"]
        data["porti"] = {k: {**cur[k], **(data["porti"].get(k) or {})} for k in PORTI}
    await db.app_settings.update_one({"id": "capitaneria"}, {"$set": {"id": "capitaneria", **data}}, upsert=True)
    return await get_settings()


async def _cantiere() -> dict:
    return await db.cantiere.find_one({"id": "default"}, {"_id": 0}) or {}


def _check_porto(porto: str):
    if porto not in PORTI:
        raise HTTPException(400, "Porto non valido")


@router.get("/capitaneria/comunicazioni")
async def list_comunicazioni(porto: Optional[str] = None):
    q = {"porto": porto} if porto else {}
    docs = await db.comunicazioni_capitaneria.find(q, {"_id": 0}).to_list(5000)
    docs.sort(key=lambda d: (d.get("data_operazione") or "", d.get("created_at") or ""), reverse=True)
    return docs


@router.post("/capitaneria/comunicazioni")
async def crea_comunicazione(payload: ComunicazioneIn):
    _check_porto(payload.porto)
    now = datetime.now(timezone.utc).isoformat()
    doc = {**payload.model_dump(), "id": str(uuid.uuid4()), "created_at": now, "updated_at": now, "inviata_at": None, "inviata_a": ""}
    await db.comunicazioni_capitaneria.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/capitaneria/comunicazioni/{cid}")
async def aggiorna_comunicazione(cid: str, payload: ComunicazioneIn):
    _check_porto(payload.porto)
    existing = await db.comunicazioni_capitaneria.find_one({"id": cid}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Comunicazione non trovata")
    data = {**payload.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}
    await db.comunicazioni_capitaneria.update_one({"id": cid}, {"$set": data})
    return {**existing, **data}


@router.delete("/capitaneria/comunicazioni/{cid}")
async def elimina_comunicazione(cid: str):
    res = await db.comunicazioni_capitaneria.delete_one({"id": cid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Comunicazione non trovata")
    return {"ok": True}


def _filename(doc: dict) -> str:
    return f"comunicazione_{doc.get('porto', '')}_{(doc.get('data_operazione') or '').replace('-', '')}.pdf"


@router.post("/capitaneria/pdf")
async def pdf_anteprima(payload: ComunicazioneIn):
    _check_porto(payload.porto)
    pdf = build_comunicazione_capitaneria_pdf(payload.model_dump(), await _cantiere())
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": "inline; filename=comunicazione_capitaneria.pdf"})


@router.get("/capitaneria/comunicazioni/{cid}/pdf")
async def pdf_comunicazione(cid: str):
    doc = await db.comunicazioni_capitaneria.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Comunicazione non trovata")
    pdf = build_comunicazione_capitaneria_pdf(doc, await _cantiere())
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f"attachment; filename={_filename(doc)}"})


@public_router.get("/api/capitaneria/pubblico/{token}.pdf")
async def pdf_pubblico(token: str):
    doc = await db.comunicazioni_capitaneria.find_one({"pdf_token": token}, {"_id": 0})
    if not doc or len(token) < 32:
        raise HTTPException(404, "Documento non trovato")
    pdf = build_comunicazione_capitaneria_pdf(doc, await _cantiere())
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f"inline; filename={_filename(doc)}"})


def _public_base(request: Request) -> str:
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    return f"https://{host.split(',')[0].strip()}"


@router.post("/capitaneria/comunicazioni/{cid}/invia-email")
async def invia_email(cid: str, request: Request):
    doc = await db.comunicazioni_capitaneria.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Comunicazione non trovata")
    s = await get_settings()
    to = ((s["porti"].get(doc["porto"]) or {}).get("email") or "").strip()
    if not to:
        raise HTTPException(400, "Email dell'ufficio non impostata: inseriscila nelle impostazioni del porto")
    token = doc.get("pdf_token") or uuid.uuid4().hex + uuid.uuid4().hex
    if not doc.get("pdf_token"):
        await db.comunicazioni_capitaneria.update_one({"id": cid}, {"$set": {"pdf_token": token}})
    con_allegato = bool(os.environ.get("SMTP_HOST"))
    link = f"{_public_base(request)}/api/capitaneria/pubblico/{token}.pdf"
    porto_nome = PORTI[doc["porto"]]["nome"]
    ops = " / ".join([x for x, on in (("alaggio", doc.get("alaggio")), ("varo", doc.get("varo"))) if on]) or "alaggio/varo"
    data_it = "/".join(reversed((doc.get("data_operazione") or "").split("-")))
    subject = f"Comunicazione preventiva {ops} – {porto_nome} – {data_it}"
    intro = "in allegato" if con_allegato else "si trasmette"
    blocco_link = ("" if con_allegato else
                   f'<p style="margin:18px 0"><a href="{link}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold">Apri / scarica il modulo PDF (Allegato 1)</a></p>'
                   f'<p style="font-size:12px;color:#555">Se il pulsante non funziona, copiare questo indirizzo nel browser:<br/>{escape(link)}</p>')
    html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;font-size:14px;color:#0f172a">'
            f'<p>Buongiorno,</p><p>{intro} la comunicazione preventiva di <strong>{escape(ops)}</strong> con mezzo autogrù '
            f'(Allegato 1, {escape(doc.get("ordinanza") or s["ordinanza"])}) per il porto di <strong>{escape(porto_nome)}</strong>, '
            f'prevista il giorno <strong>{escape(data_it)}</strong> alle ore <strong>{escape(doc.get("ora_operazione") or "")}</strong>.</p>'
            f'<p>Unità: {escape(doc.get("unita_nome") or "-")} · lunghezza {escape(fmt_mt(doc.get("unita_lunghezza")))}</p>'
            f'{blocco_link}'
            f'<p>Cordiali saluti,<br/><strong>{escape(doc.get("ditta") or s["ditta"])}</strong><br/>'
            f'{escape(doc.get("resp_nome") or "")} {escape(doc.get("resp_cognome") or "")} · tel. {escape(doc.get("resp_cellulare") or "")}</p>'
            f'</td></tr></table>')
    attachments = None
    if con_allegato:
        attachments = [{"filename": _filename(doc), "bytes": build_comunicazione_capitaneria_pdf(doc, await _cantiere())}]
    mid = await send_email(to=to, subject=subject, html=html, attachments=attachments, from_name=(s.get("email_mittente") or "GEB Nautica").strip())
    now = datetime.now(timezone.utc).isoformat()
    await db.comunicazioni_capitaneria.update_one({"id": cid}, {"$set": {"inviata_at": now, "inviata_a": to, "inviata_con_allegato": con_allegato}})
    return {"ok": True, "inviata_a": to, "inviata_at": now, "email_id": mid, "con_allegato": con_allegato, "link_pdf": link}
