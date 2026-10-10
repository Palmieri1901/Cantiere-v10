"""Comunicazioni preventive alaggio/varo alla Capitaneria di porto, divise per porto."""
import io
import uuid
from html import escape
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db
from email_service import send_email
from pdf_capitaneria import build_comunicazione_capitaneria_pdf

router = APIRouter()

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
    out = {**DEFAULT_SETTINGS, **(doc or {})}
    out["porti"] = {k: {**v, "email": "", **((out.get("porti") or {}).get(k) or {})} for k, v in PORTI.items()}
    return out


@router.get("/capitaneria/impostazioni")
async def leggi_impostazioni():
    return await get_settings()


@router.put("/capitaneria/impostazioni")
async def salva_impostazioni(payload: CapitaneriaSettings):
    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "porti" in data:
        data["porti"] = {k: {**PORTI[k], **(data["porti"].get(k) or {})} for k in PORTI}
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


@router.post("/capitaneria/comunicazioni/{cid}/invia-email")
async def invia_email(cid: str):
    doc = await db.comunicazioni_capitaneria.find_one({"id": cid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Comunicazione non trovata")
    s = await get_settings()
    to = ((s["porti"].get(doc["porto"]) or {}).get("email") or "").strip()
    if not to:
        raise HTTPException(400, "Email dell'ufficio non impostata: inseriscila nelle impostazioni del porto")
    porto_nome = PORTI[doc["porto"]]["nome"]
    ops = " / ".join([x for x, on in (("alaggio", doc.get("alaggio")), ("varo", doc.get("varo"))) if on]) or "alaggio/varo"
    data_it = "/".join(reversed((doc.get("data_operazione") or "").split("-")))
    subject = f"Comunicazione preventiva {ops} – {porto_nome} – {data_it}"
    html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;font-size:14px;color:#0f172a">'
            f'<p>Buongiorno,</p><p>in allegato la comunicazione preventiva di <strong>{escape(ops)}</strong> con mezzo autogrù '
            f'(Allegato 1, {escape(doc.get("ordinanza") or s["ordinanza"])}) per il porto di <strong>{escape(porto_nome)}</strong>, '
            f'prevista il giorno <strong>{escape(data_it)}</strong> alle ore <strong>{escape(doc.get("ora_operazione") or "")}</strong>.</p>'
            f'<p>Unità: {escape(doc.get("unita_nome") or "-")} · lunghezza {escape(doc.get("unita_lunghezza") or "-")}</p>'
            f'<p>Cordiali saluti,<br/><strong>{escape(doc.get("ditta") or s["ditta"])}</strong><br/>'
            f'{escape(doc.get("resp_nome") or "")} {escape(doc.get("resp_cognome") or "")} · tel. {escape(doc.get("resp_cellulare") or "")}</p>'
            f'</td></tr></table>')
    pdf = build_comunicazione_capitaneria_pdf(doc, await _cantiere())
    mid = await send_email(to=to, subject=subject, html=html, attachments=[{"filename": _filename(doc), "bytes": pdf}])
    now = datetime.now(timezone.utc).isoformat()
    await db.comunicazioni_capitaneria.update_one({"id": cid}, {"$set": {"inviata_at": now, "inviata_a": to}})
    return {"ok": True, "inviata_a": to, "inviata_at": now, "email_id": mid}
