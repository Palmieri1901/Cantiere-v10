"""Modulo Gommoni GEB: catalogo, accessori, listini (pubblico/cantiere), import AI, preventivi PDF."""
import base64
import io
import os
from datetime import datetime, timezone
from typing import List, Optional, Dict

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from database import db
from pdf_builders import listino_riferimento, listino_nota_finale, banca_markup
from helpers import serialize
from models import (
    GommoneModello, GommoneModelloCreate, GommoneBulkCreate,
    GommoneAccessorio, GommoneAccessorioCreate, GommoneSconti,
    GommonePreventivo, GommonePreventivoCreate, SuzukiImportRequest,
)
from routers.suzuki import (
    _logo_flowable, _fmt_eur, _get_condizioni_preventivo,
    _pdf_pages_to_images_b64, _extract_json_array, _get_iva_perc,
)

router = APIRouter(prefix="/gommoni", tags=["Gommoni"])

CATEGORIE_SCONTO = {"privati": "Privati", "lavoro": "Lavoro", "concessionari": "Concessionari"}


# ---------------------------------------------------------------------------
# CATALOGO MODELLI
# ---------------------------------------------------------------------------
@router.get("/modelli", response_model=List[GommoneModello])
async def list_modelli():
    docs = await db.gommoni_modelli.find({}, {"_id": 0}).sort([("ordine", 1), ("lunghezza_m", 1), ("modello", 1)]).to_list(1000)
    return [GommoneModello(**d) for d in docs]


@router.post("/modelli", response_model=GommoneModello)
async def create_modello(payload: GommoneModelloCreate):
    m = GommoneModello(**payload.model_dump())
    await db.gommoni_modelli.insert_one(serialize(m))
    return m


@router.post("/modelli/bulk", response_model=List[GommoneModello])
async def bulk_modelli(payload: GommoneBulkCreate):
    out = []
    for p in payload.modelli:
        if not p.modello.strip():
            continue
        m = GommoneModello(**p.model_dump())
        await db.gommoni_modelli.insert_one(serialize(m))
        out.append(m)
    return out


@router.put("/modelli/{mid}", response_model=GommoneModello)
async def update_modello(mid: str, payload: GommoneModelloCreate):
    doc = await db.gommoni_modelli.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Modello non trovato")
    m = GommoneModello(**{**doc, **payload.model_dump(), "updated_at": datetime.now(timezone.utc)})
    await db.gommoni_modelli.update_one({"id": mid}, {"$set": serialize(m)})
    return m


@router.delete("/modelli/{mid}")
async def delete_modello(mid: str):
    doc = await db.gommoni_modelli.find_one({"id": mid}, {"_id": 0, "omologazione_file_id": 1, "presentazione_file_id": 1})
    res = await db.gommoni_modelli.delete_one({"id": mid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Modello non trovato")
    for k in ("omologazione_file_id", "presentazione_file_id"):
        if doc and doc.get(k):
            await _delete_gridfs(doc[k])
    return {"ok": True}


# ---------------------------------------------------------------------------
# OMOLOGAZIONE PDF (GridFS)
# ---------------------------------------------------------------------------
def _bucket() -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(db, bucket_name="gommoni_omologazioni")


async def _delete_gridfs(fid: str):
    try:
        await _bucket().delete(ObjectId(fid))
    except Exception:
        pass


DOC_TIPI = {"omologazione": "Omologazione", "presentazione": "Real (video)", "catalogo": "Catalogo"}


def _check_tipo(tipo: str):
    if tipo not in DOC_TIPI:
        raise HTTPException(400, "Tipo documento non valido")


@router.post("/modelli/{mid}/doc/{tipo}")
async def upload_doc(mid: str, tipo: str, file: UploadFile = File(...)):
    _check_tipo(tipo)
    doc = await db.gommoni_modelli.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Modello non trovato")
    data = await file.read()
    is_pdf = data[:4] == b"%PDF"
    ctype = (file.content_type or "").lower()
    is_video = ctype.startswith("video/") or (file.filename or "").lower().endswith((".mp4", ".mov", ".m4v", ".webm"))
    if tipo == "presentazione":
        if not is_video:
            raise HTTPException(400, "Il Real deve essere un breve video (MP4/MOV/WebM)")
    elif not is_pdf:
        raise HTTPException(400, "Il file deve essere un PDF")
    if is_pdf:
        is_video = False
    limite = 120 if is_video else 30
    if len(data) > limite * 1024 * 1024:
        raise HTTPException(400, f"File troppo grande (max {limite} MB)")
    if doc.get(f"{tipo}_file_id"):
        await _delete_gridfs(doc[f"{tipo}_file_id"])
    mime = "application/pdf" if is_pdf else (ctype if ctype.startswith("video/") else "video/mp4")
    nome = file.filename or (f"{tipo}.pdf" if is_pdf else f"{tipo}.mp4")
    fid = await _bucket().upload_from_stream(nome, data, metadata={"modello_id": mid, "tipo": tipo, "mime": mime})
    await db.gommoni_modelli.update_one({"id": mid}, {"$set": {
        f"{tipo}_file_id": str(fid), f"{tipo}_nome": nome, f"{tipo}_mime": mime,
        "updated_at": datetime.now(timezone.utc)}})
    return {"ok": True, "file_id": str(fid), "nome": nome, "mime": mime}


@router.get("/modelli/{mid}/doc/{tipo}/file")
async def get_doc_file(mid: str, tipo: str):
    """Documento nel suo formato originale (PDF o video)."""
    _check_tipo(tipo)
    doc = await db.gommoni_modelli.find_one({"id": mid}, {"_id": 0})
    if not doc or not doc.get(f"{tipo}_file_id"):
        raise HTTPException(404, f"{DOC_TIPI[tipo]} non caricata")
    try:
        stream = await _bucket().open_download_stream(ObjectId(doc[f"{tipo}_file_id"]))
        data = await stream.read()
    except Exception:
        raise HTTPException(404, "File non trovato")
    mime = doc.get(f"{tipo}_mime") or "application/pdf"
    nome = (doc.get(f"{tipo}_nome") or f"{tipo}").replace('"', "")
    return StreamingResponse(io.BytesIO(data), media_type=mime, headers={"Content-Disposition": f'inline; filename="{nome}"', "Accept-Ranges": "bytes"})


@router.get("/modelli/{mid}/doc/{tipo}.pdf")
async def get_doc(mid: str, tipo: str):
    _check_tipo(tipo)
    doc = await db.gommoni_modelli.find_one({"id": mid}, {"_id": 0})
    if not doc or not doc.get(f"{tipo}_file_id"):
        raise HTTPException(404, f"{DOC_TIPI[tipo]} non caricata")
    try:
        stream = await _bucket().open_download_stream(ObjectId(doc[f"{tipo}_file_id"]))
        data = await stream.read()
    except Exception:
        raise HTTPException(404, "File non trovato")
    nome = (doc.get(f"{tipo}_nome") or f"{tipo}.pdf").replace('"', "")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{nome}"'})


@router.delete("/modelli/{mid}/doc/{tipo}")
async def delete_doc(mid: str, tipo: str):
    _check_tipo(tipo)
    doc = await db.gommoni_modelli.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Modello non trovato")
    if doc.get(f"{tipo}_file_id"):
        await _delete_gridfs(doc[f"{tipo}_file_id"])
    await db.gommoni_modelli.update_one({"id": mid}, {"$set": {f"{tipo}_file_id": "", f"{tipo}_nome": ""}})
    return {"ok": True}


# retro-compatibilità vecchi link omologazione
@router.get("/modelli/{mid}/omologazione.pdf")
async def get_omologazione_legacy(mid: str):
    return await get_doc(mid, "omologazione")


# ---------------------------------------------------------------------------
# ACCESSORI OPTIONAL
# ---------------------------------------------------------------------------
@router.get("/accessori", response_model=List[GommoneAccessorio])
async def list_accessori():
    docs = await db.gommoni_accessori.find({}, {"_id": 0}).sort([("serie", 1), ("nome", 1)]).to_list(2000)
    return [GommoneAccessorio(**d) for d in docs]


@router.post("/accessori", response_model=GommoneAccessorio)
async def create_accessorio(payload: GommoneAccessorioCreate):
    a = GommoneAccessorio(**payload.model_dump())
    await db.gommoni_accessori.insert_one(serialize(a))
    return a


@router.put("/accessori/{aid}", response_model=GommoneAccessorio)
async def update_accessorio(aid: str, payload: GommoneAccessorioCreate):
    doc = await db.gommoni_accessori.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Accessorio non trovato")
    a = GommoneAccessorio(**{**doc, **payload.model_dump(), "updated_at": datetime.now(timezone.utc)})
    await db.gommoni_accessori.update_one({"id": aid}, {"$set": serialize(a)})
    return a


@router.delete("/accessori/{aid}")
async def delete_accessorio(aid: str):
    res = await db.gommoni_accessori.delete_one({"id": aid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Accessorio non trovato")
    return {"ok": True}


# ---------------------------------------------------------------------------
# SCONTI PER TIPOLOGIA CLIENTE
# ---------------------------------------------------------------------------
async def _get_sconti() -> GommoneSconti:
    doc = await db.gommoni_settings.find_one({"id": "sconti"}, {"_id": 0, "id": 0, "updated_at": 0}) or {}
    return GommoneSconti(**doc)


@router.get("/sconti", response_model=GommoneSconti)
async def get_sconti():
    return await _get_sconti()


@router.put("/sconti", response_model=GommoneSconti)
async def save_sconti(payload: GommoneSconti):
    for v in (payload.privati, payload.lavoro, payload.concessionari):
        if not (0 <= v <= 100):
            raise HTTPException(400, "Percentuali fuori range 0-100")
    await db.gommoni_settings.update_one(
        {"id": "sconti"},
        {"$set": {**payload.model_dump(), "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return payload


# ---------------------------------------------------------------------------
# LISTA DOTAZIONI DI SERIE (catalogo voci selezionabili, separato dagli optional)
# ---------------------------------------------------------------------------
@router.get("/accessori-optional-voci")
async def get_optional_voci():
    doc = await db.gommoni_settings.find_one({"id": "accessori_optional_voci"}, {"_id": 0}) or {}
    return {"voci": doc.get("voci", [])}


@router.put("/accessori-optional-voci")
async def save_optional_voci(payload: dict):
    clean = []
    for v in payload.get("voci") or []:
        v = str(v).strip()
        if v and v.lower() not in [c.lower() for c in clean]:
            clean.append(v)
    await db.gommoni_settings.update_one({"id": "accessori_optional_voci"}, {"$set": {"voci": clean, "updated_at": datetime.now(timezone.utc)}}, upsert=True)
    return {"voci": clean}


@router.get("/dotazioni-serie")
async def get_dotazioni_serie():
    doc = await db.gommoni_settings.find_one({"id": "dotazioni_serie"}, {"_id": 0}) or {}
    return {"voci": doc.get("voci", [])}


@router.put("/dotazioni-serie")
async def save_dotazioni_serie(payload: dict):
    voci = payload.get("voci")
    if not isinstance(voci, list):
        raise HTTPException(400, "voci deve essere una lista")
    clean: List[str] = []
    for v in voci:
        s = str(v or "").strip()
        if s and s.lower() not in [c.lower() for c in clean]:
            clean.append(s)
    clean.sort(key=str.lower)
    await db.gommoni_settings.update_one({"id": "dotazioni_serie"}, {"$set": {"voci": clean, "updated_at": datetime.now(timezone.utc)}}, upsert=True)
    return {"voci": clean}


# ---------------------------------------------------------------------------
# IMPORT AI
# ---------------------------------------------------------------------------
_IMPORT_PROMPT = (
    "Sei un assistente che analizza listini e schede tecniche di GOMMONI (battelli pneumatici) in italiano.\n"
    "Estrai la lista di TUTTI i modelli visibili nella pagina fornita, con TUTTE le caratteristiche tecniche riportate.\n"
    "Rispondi SOLO con un array JSON, ogni elemento con le chiavi:\n"
    '  "modello": nome del gommone (stringa)\n'
    '  "lunghezza_m": lunghezza fuori tutto in metri (numero)\n'
    '  "larghezza_m": larghezza in metri (numero)\n'
    '  "diametro_tubolare_cm": diametro tubolare in cm (numero)\n'
    '  "compartimenti": numero compartimenti (intero)\n'
    '  "portata_persone": persone trasportabili (intero)\n'
    '  "potenza_max_hp": potenza massima motore in HP (numero)\n'
    '  "peso_kg": peso in kg (numero)\n'
    '  "carena": tipo di carena, categoria di progettazione CE, lunghezza interna se presenti (stringa)\n'
    '  "tessuto": tessuto tubolare es. PVC, Hypalon/Neoprene (H) con grammatura (stringa)\n'
    '  "lunghezza_interna_cm": misura interna in cm (numero)\n'
    '  "categoria_ce": categoria di progettazione CE es. C, C/B (stringa)\n'
    '  "potenza_min_hp": potenza minima motore in HP (numero)\n'
    '  "specchio": gambo/specchio di poppa es. L, XL, XXL (stringa)\n'
    '  "dotazioni": elenco COMPLETO degli accessori optional e delle caratteristiche descrittive (stringa, separate da virgola)\n'
    '  "prezzo_pubblico": prezzo al pubblico in euro IVA inclusa (numero, 0 se assente)\n'
    '  "note": altre informazioni tecniche utili non rientranti nelle chiavi precedenti (stringa)\n'
    "Se un dato non è presente, usa stringa vuota o 0.\n"
    "NON aggiungere testo prima o dopo il JSON. NON usare fenced code block."
)


async def _run_vision(images_b64: List[str]) -> List[dict]:
    from ai_client import vision

    rows: List[dict] = []
    for b64 in images_b64:
        text = await vision(
            "Sei un OCR avanzato specializzato in listini e schede tecniche di gommoni. Preciso e sintetico.",
            _IMPORT_PROMPT, [b64],
        )
        parsed = _extract_json_array(text.strip())
        if isinstance(parsed, list):
            rows.extend([r for r in parsed if isinstance(r, dict)])
    return rows


@router.post("/import-ai")
async def import_ai(payload: SuzukiImportRequest):
    rows = await _import_rows(payload)
    return {"count": len(rows), "modelli": rows}


@router.post("/import-ai-scheda")
async def import_ai_scheda(payload: SuzukiImportRequest):
    """Analizza la scheda tecnica di UN gommone e ritorna le caratteristiche (per compilare il form)."""
    rows = await _import_rows(payload)
    if not rows:
        raise HTTPException(400, "Nessuna caratteristica riconosciuta nel file")
    merged: dict = {}
    for r in rows:
        for k, v in r.items():
            if v not in ("", 0, None) and k not in merged:
                merged[k] = v
    return {"caratteristiche": merged}


async def _import_rows(payload: SuzukiImportRequest) -> List[dict]:
    if not payload.file_base64:
        raise HTTPException(400, "File mancante")
    raw = payload.file_base64.split(",", 1)[-1] if "," in payload.file_base64 else payload.file_base64
    try:
        data = base64.b64decode(raw)
    except Exception:
        raise HTTPException(400, "Base64 non valido")
    if (payload.file_name or "").lower().endswith(".pdf") or data[:4] == b"%PDF":
        images = _pdf_pages_to_images_b64(data)
        if not images:
            raise HTTPException(400, "PDF vuoto o non leggibile")
    else:
        images = [raw]
    return await _run_vision(images)


# ---------------------------------------------------------------------------
# PDF LISTINI E CARATTERISTICHE
# ---------------------------------------------------------------------------
def _pdf_header(story, title: str, subtitle: str, color, styles):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    logo = _logo_flowable(max_w_mm=42, max_h_mm=22)
    t = Paragraph(f"<b>{title}</b>", ParagraphStyle("t", parent=styles["Heading1"], fontSize=14, textColor=color, spaceAfter=2))
    s = Paragraph(subtitle, ParagraphStyle("s", parent=styles["Normal"], fontSize=9, textColor=colors.grey))
    if logo:
        head = Table([[logo, [t, s]]], colWidths=[46*mm, 140*mm])
        head.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 0)]))
        story.append(head)
    else:
        story += [t, s]
    story.append(Spacer(1, 8))


def _fmt_n(v, suffix=""):
    try:
        f = float(v)
        if f > 0:
            return f"{f:g}{suffix}"
    except Exception:
        pass
    return "—"


async def _build_listino_pdf(categoria: Optional[str] = None):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    docs = await db.gommoni_modelli.find({}, {"_id": 0}).sort([("ordine", 1), ("lunghezza_m", 1)]).to_list(1000)
    if not docs:
        raise HTTPException(400, "Nessun gommone in catalogo.")
    styles = getSampleStyleSheet()
    NAVY = colors.HexColor("#0F2A47")
    ACCENT = colors.HexColor("#C62828")
    LIGHT = colors.HexColor("#F2F4F7")
    BORDER = colors.HexColor("#D0D5DD")

    cantiere = categoria is not None
    sconti = await _get_sconti() if cantiere else None
    sc = float(getattr(sconti, categoria, 0)) if cantiere else 0.0

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)
    story = []
    if cantiere:
        title = f"GOMMONI GEB — Listino Cantiere · {CATEGORIE_SCONTO.get(categoria, categoria)} (sconto {sc:g}%) · {listino_riferimento()}"
        sub = "GEB di Palmieri Sandro · <b>DOCUMENTO RISERVATO</b>"
    else:
        title = f"GOMMONI GEB — Listino Pubblico · {listino_riferimento()}"
        sub = "GEB di Palmieri Sandro · Costruzione gommoni a marchio proprio"
    _pdf_header(story, title, sub, ACCENT if cantiere else NAVY, styles)

    st_head = ParagraphStyle("hd", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=9.5, textColor=colors.white, alignment=TA_CENTER)
    head = ["Modello", "Lungh.", "Largh.", "Ø Tub.", "Persone", "HP max", "Peso", "Pubblico € (IVA incl.)"]
    widths = [40*mm, 18*mm, 18*mm, 18*mm, 18*mm, 18*mm, 18*mm, 38*mm]
    if cantiere:
        head += [f"Sconto {sc:g}%", "Netto € (IVA incl.)"]
        widths = [34*mm, 15*mm, 15*mm, 15*mm, 15*mm, 15*mm, 15*mm, 28*mm, 20*mm, 28*mm]
    data = [[Paragraph(h, st_head) for h in head]]
    for r in docs:
        pub = float(r.get("prezzo_pubblico") or 0)
        row = [
            r.get("modello", ""),
            _fmt_n(r.get("lunghezza_m"), " m"), _fmt_n(r.get("larghezza_m"), " m"),
            _fmt_n(r.get("diametro_tubolare_cm"), " cm"), _fmt_n(r.get("portata_persone")),
            _fmt_n(r.get("potenza_max_hp")), _fmt_n(r.get("peso_kg"), " kg"),
            _fmt_eur(pub) if pub else "—",
        ]
        if cantiere:
            netto = pub * (1 - sc/100)
            row += ["− " + _fmt_eur(pub - netto) if pub else "—", _fmt_eur(netto) if pub else "—"]
        data.append(row)
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ("BACKGROUND", (0,0), (-1,0), ACCENT if cantiere else NAVY),
        ("FONTSIZE", (0,0), (-1,-1), 8.5),
        ("ALIGN", (1,1), (-1,-1), "CENTER"),
        ("ALIGN", (7,1), (-1,-1), "RIGHT"),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
        ("GRID", (0,0), (-1,-1), 0.25, BORDER),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("FONTNAME", (0,1), (0,-1), "Helvetica-Bold"),
    ]
    if cantiere:
        style += [("BACKGROUND", (9,1), (9,-1), colors.HexColor("#FDECEC")), ("TEXTCOLOR", (9,1), (9,-1), ACCENT), ("FONTNAME", (9,1), (9,-1), "Helvetica-Bold")]
    t.setStyle(TableStyle(style))
    story.append(t)
    story.append(Spacer(1, 8))
    story.append(Paragraph("<i>Prezzi IVA inclusa, salvo variazioni. Gommoni costruiti da GEB di Palmieri Sandro. Accessori optional quotati a parte.</i>",
                           ParagraphStyle("note", parent=styles["Normal"], fontSize=8, textColor=colors.grey)))

    acc = await db.gommoni_accessori.find({}, {"_id": 0}).sort([("serie", 1), ("nome", 1)]).to_list(2000)
    if acc:
        iva_m = 1 + await _get_iva_perc() / 100
        story.append(Spacer(1, 10))
        story.append(Paragraph("<b>ACCESSORI OPTIONAL</b> <font size='8' color='grey'>(prezzi IVA inclusa; su richiesta forniti montati)</font>",
                               ParagraphStyle("cat", parent=styles["Heading3"], fontSize=11, textColor=NAVY, spaceAfter=4)))
        _accessori_tables(story, acc, iva_m, styles, st_head, NAVY, LIGHT, BORDER, show_serie_title=True)

    story.extend(listino_nota_finale())
    doc.build(story)
    buf.seek(0)
    fn = f"listino_gommoni_geb_{categoria or 'pubblico'}.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{fn}"'})


def _accessori_tables(story, acc, iva_m, styles, st_head, NAVY, LIGHT, BORDER, show_serie_title=True, font_size=7.5):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle

    by_serie: Dict[str, list] = {}
    for a in acc:
        by_serie.setdefault(a.get("serie") or "Tutte le serie", []).append(a)
    for serie, items in by_serie.items():
        taglie = sorted({t for a in items for t in list((a.get("prezzi_per_modello") or {}).keys()) + list(a.get("di_serie") or [])}, key=lambda x: (len(x), x))
        if show_serie_title:
            story.append(Paragraph(f"<b>Serie {serie}</b>", ParagraphStyle("ser", parent=styles["Normal"], fontSize=9.5, textColor=NAVY, spaceBefore=6, spaceAfter=3)))
        head_cols = ["Accessorio", "Specifiche"] + (taglie if taglie else ["Prezzo"])
        adata = [[Paragraph(h, st_head) for h in head_cols]]
        st_cell = ParagraphStyle("ac", parent=styles["Normal"], fontSize=font_size, leading=font_size + 1.5)
        for a in items:
            row = [Paragraph(a.get("nome", ""), st_cell), Paragraph(a.get("specifiche") or a.get("descrizione") or "—", st_cell)]
            if taglie:
                for t in taglie:
                    if t in (a.get("di_serie") or []):
                        row.append("di serie")
                    elif (a.get("prezzi_per_modello") or {}).get(t):
                        row.append(_fmt_eur(a["prezzi_per_modello"][t] * iva_m))
                    else:
                        row.append("—")
            else:
                row.append(_fmt_eur((a.get("prezzo") or 0) * iva_m))
            adata.append(row)
        n = len(head_cols) - 2
        wt = (186*mm - 62*mm - 34*mm) / max(n, 1)
        ta = Table(adata, colWidths=[62*mm, 34*mm] + [wt]*n, repeatRows=1)
        ta.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), NAVY), ("FONTSIZE", (0,0), (-1,-1), font_size),
            ("ALIGN", (2,1), (-1,-1), "RIGHT"), ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
            ("GRID", (0,0), (-1,-1), 0.25, BORDER), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING", (0,0), (-1,-1), 2.5), ("BOTTOMPADDING", (0,0), (-1,-1), 2.5),
        ]))
        story.append(ta)


@router.get("/accessori.pdf")
async def accessori_pdf(serie: str = "", iva: str = "escl"):
    """Listino accessori per serie (Job/Sirio/Tsunami o tutte). iva=escl (come listino GEB) oppure incl."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

    query = {"serie": serie} if serie else {}
    acc = await db.gommoni_accessori.find(query, {"_id": 0}).sort([("serie", 1), ("nome", 1)]).to_list(2000)
    if not acc:
        raise HTTPException(400, f"Nessun accessorio{f' per la serie {serie}' if serie else ''}.")
    styles = getSampleStyleSheet()
    NAVY = colors.HexColor("#0F2A47")
    LIGHT = colors.HexColor("#F2F4F7")
    BORDER = colors.HexColor("#D0D5DD")
    st_head = ParagraphStyle("hd", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8, leading=9.5, textColor=colors.white, alignment=TA_CENTER)
    incl = iva == "incl"
    iva_perc = await _get_iva_perc()
    iva_m = (1 + iva_perc / 100) if incl else 1.0

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)
    story = []
    titolo = f"Prezzi per accessori Gommoni serie {serie} · {listino_riferimento()}" if serie else f"Prezzi per accessori Gommoni GEB · {listino_riferimento()}"
    _pdf_header(story, titolo, "GEB di Palmieri Sandro · Via degli Artigiani, 1 · 57034 Marina di Campo I. d'Elba (LI)", NAVY, styles)
    _accessori_tables(story, acc, iva_m, styles, st_head, NAVY, LIGHT, BORDER, show_serie_title=not serie, font_size=8.5)
    story.append(Spacer(1, 10))
    nota = f"I prezzi si intendono IVA {iva_perc:g}% inclusa." if incl else "I prezzi si intendono IVA esclusa."
    story.append(Paragraph(f"<i>{nota} La G.E.B. si riserva il diritto di variare i prezzi e i modelli senza preavviso - il presente listino annulla i precedenti.</i>",
                           ParagraphStyle("note", parent=styles["Normal"], fontSize=8, textColor=colors.grey, alignment=TA_CENTER)))
    story.append(Paragraph("P.I. 01246000499 · cell. 3472600872 · www.gebnautica.it · info@gebnautica.it",
                           ParagraphStyle("foot", parent=styles["Normal"], fontSize=7.5, textColor=colors.grey, alignment=TA_CENTER)))
    story.extend(listino_nota_finale())
    doc.build(story)
    buf.seek(0)
    fn = f"accessori_geb_{(serie or 'tutte').lower()}_iva_{iva}.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{fn}"'})


@router.get("/listino.pdf")
async def listino_pdf():
    return await _build_listino_pdf(None)


@router.get("/listino-cantiere.pdf")
async def listino_cantiere_pdf(categoria: str = "privati"):
    if categoria not in CATEGORIE_SCONTO:
        raise HTTPException(400, "Categoria non valida")
    return await _build_listino_pdf(categoria)


@router.get("/caratteristiche.pdf")
async def caratteristiche_pdf(modello_id: str = ""):
    """Scheda caratteristiche di tutti i gommoni o di un solo modello (?modello_id=)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether

    query = {"id": modello_id} if modello_id else {}
    docs = await db.gommoni_modelli.find(query, {"_id": 0}).sort([("ordine", 1), ("lunghezza_m", 1)]).to_list(1000)
    if not docs:
        raise HTTPException(404 if modello_id else 400, "Modello non trovato" if modello_id else "Nessun gommone in catalogo.")
    styles = getSampleStyleSheet()
    NAVY = colors.HexColor("#0F2A47")
    LIGHT = colors.HexColor("#F2F4F7")
    BORDER = colors.HexColor("#D0D5DD")
    st_lab = ParagraphStyle("l", parent=styles["Normal"], fontSize=7.5, textColor=colors.HexColor("#667085"))
    st_val = ParagraphStyle("v", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9.5)
    st_txt = ParagraphStyle("x", parent=styles["Normal"], fontSize=8.5, leading=11)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)
    story = []
    titolo = f"GOMMONE GEB — {docs[0].get('modello', '')} · Scheda tecnica" if modello_id else "GOMMONI GEB — Caratteristiche tecniche"
    _pdf_header(story, titolo, "GEB di Palmieri Sandro · Costruzione gommoni a marchio proprio", NAVY, styles)

    def cell(l, v):
        return [Paragraph(l.upper(), st_lab), Paragraph(v or "—", st_val)]

    for r in docs:
        block = [Paragraph(f"<b>{r.get('modello','')}</b>", ParagraphStyle("m", parent=styles["Heading3"], fontSize=12, textColor=NAVY, spaceBefore=6, spaceAfter=3))]
        cells = [
            cell("Misura esterna", f"{_fmt_n(r.get('lunghezza_m'), ' m')} × {_fmt_n(r.get('larghezza_m'), ' m')}"), cell("Misura interna", _fmt_n(r.get("lunghezza_interna_cm"), " cm")),
            cell("Ø tubolare", _fmt_n(r.get("diametro_tubolare_cm"), " cm")), cell("Camere", _fmt_n(r.get("compartimenti"))),
            cell("Portata persone", _fmt_n(r.get("portata_persone"))), cell("CV min – max", f"{_fmt_n(r.get('potenza_min_hp'))} – {_fmt_n(r.get('potenza_max_hp'))} HP"),
            cell("Massa", _fmt_n(r.get("peso_kg"), " kg")), cell("Carena", r.get("carena") or "—"),
            cell("Materiale tub.", r.get("tessuto") or "—"), cell("Categoria CE", r.get("categoria_ce") or "—"),
            cell("Specchio", r.get("specchio") or "—"), cell("Prezzo pubblico", _fmt_eur(r.get("prezzo_pubblico") or 0)),
        ]
        rows = [cells[i:i+4] for i in range(0, 12, 4)]
        tg = Table(rows, colWidths=[46.5*mm]*4)
        tg.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.4, BORDER), ("INNERGRID", (0,0), (-1,-1), 0.25, BORDER),
            ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, LIGHT]), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING", (0,0), (-1,-1), 3), ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ]))
        block.append(tg)
        nomi_serie = [x for x in (r.get("accessori_serie") or []) if x]
        if nomi_serie:
            block.append(Spacer(1, 3))
            block.append(Paragraph(f"<b>Accessori di serie:</b> {', '.join(nomi_serie)}", st_txt))
        nomi_opt = [x for x in (r.get("accessori_optional") or []) if x]
        if nomi_opt:
            block.append(Spacer(1, 3))
            block.append(Paragraph(f"<b>Accessori optional:</b> {', '.join(nomi_opt)}", st_txt))
        elif r.get("dotazioni"):
            block.append(Spacer(1, 3))
            block.append(Paragraph(f"<b>Accessori optional:</b> {r['dotazioni']}", st_txt))
        if r.get("note"):
            block.append(Paragraph(f"<b>Note:</b> {r['note']}", st_txt))
        story.append(KeepTogether(block))
        story.append(Spacer(1, 4))

    doc.build(story)
    buf.seek(0)
    fn = f"scheda_{docs[0].get('modello', 'gommone').replace(' ', '_')}.pdf" if modello_id else "caratteristiche_gommoni_geb.pdf"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{fn}"'})


# ---------------------------------------------------------------------------
# PREVENTIVI
# ---------------------------------------------------------------------------
def _calc(p: GommonePreventivo) -> dict:
    pub = float(p.prezzo_gommone or 0)
    sc = float(p.sconto_perc or 0)
    sconto = round(pub * sc / 100, 2)
    netto_gommone = round(pub - sconto, 2)
    accessori = round(sum(float(a.prezzo or 0) * int(a.quantita or 1) for a in p.accessori), 2)
    motore = float(p.motore_prezzo or 0)
    msc = float(p.motore_sconto_perc or 0)
    motore_netto = round(motore * (1 - msc/100), 2)
    montaggio = float(p.montaggio or 0)
    cavetteria = float(p.cavetteria or 0)
    batteria = float(p.batteria or 0)
    totale = round(netto_gommone + accessori + motore_netto + montaggio + cavetteria + batteria, 2)
    return {"pubblico": pub, "sconto": sconto, "netto_gommone": netto_gommone, "accessori": accessori,
            "motore": motore, "motore_netto": motore_netto, "montaggio": montaggio, "cavetteria": cavetteria,
            "batteria": batteria, "totale": totale}


async def _next_numero() -> str:
    year = datetime.now().year
    n = await db.gommoni_preventivi.count_documents({"data": {"$regex": f"^{year}-"}})
    return f"G{year}-{n+1:03d}"


@router.get("/preventivi", response_model=List[GommonePreventivo])
async def list_preventivi():
    docs = await db.gommoni_preventivi.find({}, {"_id": 0}).sort("data", -1).to_list(2000)
    return [GommonePreventivo(**d) for d in docs]


@router.post("/preventivi", response_model=GommonePreventivo)
async def create_preventivo(payload: GommonePreventivoCreate):
    data = payload.model_dump()
    data["data"] = data.get("data") or datetime.now(timezone.utc).date().isoformat()
    data["numero"] = data.get("numero") or await _next_numero()
    p = GommonePreventivo(**data)
    await db.gommoni_preventivi.insert_one(serialize(p))
    return p


@router.put("/preventivi/{pid}", response_model=GommonePreventivo)
async def update_preventivo(pid: str, payload: GommonePreventivoCreate):
    doc = await db.gommoni_preventivi.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Preventivo non trovato")
    data = payload.model_dump(exclude_none=True)
    p = GommonePreventivo(**{**doc, **data, "updated_at": datetime.now(timezone.utc)})
    await db.gommoni_preventivi.update_one({"id": pid}, {"$set": serialize(p)})
    return p


@router.delete("/preventivi/{pid}")
async def delete_preventivo(pid: str):
    res = await db.gommoni_preventivi.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Preventivo non trovato")
    return {"ok": True}


@router.post("/preventivi/preview-pdf")
async def preview_pdf(payload: GommonePreventivoCreate):
    data = payload.model_dump()
    data["data"] = data.get("data") or datetime.now(timezone.utc).date().isoformat()
    data["numero"] = data.get("numero") or "ANTEPRIMA"
    pdf = await _build_preventivo_pdf(GommonePreventivo(**data))
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": 'inline; filename="anteprima_preventivo_gommone.pdf"'})


@router.get("/preventivi/{pid}/pdf")
async def preventivo_pdf(pid: str):
    doc = await db.gommoni_preventivi.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Preventivo non trovato")
    p = GommonePreventivo(**doc)
    pdf = await _build_preventivo_pdf(p)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="preventivo_gommone_{p.numero or p.id}.pdf"'})


async def _build_preventivo_pdf(p: GommonePreventivo) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

    NAVY = colors.HexColor("#0F2A47")
    NAVY_LIGHT = colors.HexColor("#26466B")
    LIGHT = colors.HexColor("#F2F4F7")
    BORDER = colors.HexColor("#D0D5DD")
    MUTED = colors.HexColor("#667085")
    styles = getSampleStyleSheet()
    st_label = ParagraphStyle("lab", parent=styles["Normal"], fontSize=8, textColor=MUTED, leading=10)
    st_val = ParagraphStyle("val", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10, leading=13)
    st_title = ParagraphStyle("t", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=NAVY)
    st_sub = ParagraphStyle("s", parent=styles["Normal"], fontSize=9, leading=11, textColor=MUTED)
    st_row = ParagraphStyle("row", parent=styles["Normal"], fontSize=9, leading=12)
    st_row_b = ParagraphStyle("rb", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9, leading=12)
    st_sec = ParagraphStyle("sec", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10.5, textColor=colors.white, leading=13)
    st_footer = ParagraphStyle("f", parent=styles["Normal"], fontSize=8, textColor=MUTED, leading=11)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=14*mm, rightMargin=14*mm, topMargin=10*mm, bottomMargin=10*mm)

    def section(text):
        t = Table([[Paragraph(text, st_sec)]], colWidths=[182*mm])
        t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), NAVY), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4), ("LEFTPADDING", (0,0), (-1,-1), 10)]))
        return t

    def money_table(rows):
        t = Table(rows, colWidths=[140*mm, 42*mm])
        t.setStyle(TableStyle([
            ("BOX", (0,0), (-1,-1), 0.4, BORDER), ("INNERGRID", (0,0), (-1,-1), 0.25, BORDER),
            ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, LIGHT]), ("ALIGN", (1,0), (1,-1), "RIGHT"),
            ("VALIGN", (0,0), (-1,-1), "MIDDLE"), ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
            ("TOPPADDING", (0,0), (-1,-1), 3), ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ]))
        return t

    def highlight(label, value, bg=NAVY_LIGHT, size=13):
        t = Table([[Paragraph(label, ParagraphStyle("hl", parent=st_sec, fontSize=11)),
                    Paragraph(value, ParagraphStyle("hv", parent=st_sec, fontSize=size, alignment=TA_RIGHT))]], colWidths=[140*mm, 42*mm])
        t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), bg), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                               ("LEFTPADDING", (0,0), (-1,-1), 10), ("RIGHTPADDING", (0,0), (-1,-1), 10),
                               ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6)]))
        return t

    story = []
    left_text = [Paragraph("VIA DEGLI ARTIGIANI, 1 · 57034 CAMPO NELL'ELBA (LI)", st_sub),
                 Paragraph("Tel. 347 260 08 72 · info@genbnautica.it · www.genbnautica.it", st_sub)]
    logo = _logo_flowable(max_w_mm=44, max_h_mm=22)
    left = Table([[logo], [left_text]], colWidths=[110*mm]) if logo else [Paragraph("<b>GEB di Palmieri Sandro</b>", st_val), *left_text]
    if logo:
        left.setStyle(TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("TOPPADDING", (0,0), (-1,-1), 0), ("BOTTOMPADDING", (0,0), (-1,-1), 2)]))
    try:
        data_it = datetime.fromisoformat((p.data or "")[:10]).strftime("%d/%m/%Y")
    except Exception:
        data_it = "—"
    right = [Paragraph("PREVENTIVO", st_title), Paragraph("Gommone GEB", st_sub), Spacer(1, 4),
             Table([[Paragraph("N°", st_label), Paragraph(p.numero or "—", st_val)],
                    [Paragraph("Data", st_label), Paragraph(data_it, st_val)]], colWidths=[18*mm, 50*mm],
                   style=TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("TOPPADDING", (0,0), (-1,-1), 1.5), ("BOTTOMPADDING", (0,0), (-1,-1), 1.5)]))]
    bm = banca_markup(await db.documenti_servizio.find_one({"id": "default"}, {"_id": 0}), {"nome": "GEB di Palmieri Sandro"})
    if bm:
        right += [Spacer(1, 3), Paragraph(bm, ParagraphStyle("bk", parent=st_label, alignment=TA_RIGHT, leading=9.5))]
    header = Table([[left, right]], colWidths=[112*mm, 70*mm])
    header.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0)]))
    story += [header, Spacer(1, 6), HRFlowable(width="100%", thickness=0.8, color=BORDER, spaceAfter=6)]

    cl = [Paragraph("Spettabile", st_label), Paragraph(f"<b>{p.cliente_nome or '—'}</b>", st_val)]
    if p.cliente_telefono:
        cl.append(Paragraph(f"Tel. {p.cliente_telefono}", st_row))
    if p.cliente_email:
        cl.append(Paragraph(f"Email: {p.cliente_email}", st_row))
    cl.append(Paragraph(f"Tipologia: {CATEGORIE_SCONTO.get(p.tipo_cliente or '', p.tipo_cliente or '—')}", st_row))
    cb = Table([[cl]], colWidths=[182*mm])
    cb.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), LIGHT), ("BOX", (0,0), (-1,-1), 0.6, BORDER),
                            ("LEFTPADDING", (0,0), (-1,-1), 10), ("TOPPADDING", (0,0), (-1,-1), 6), ("BOTTOMPADDING", (0,0), (-1,-1), 6)]))
    story += [cb, Spacer(1, 8), section("GOMMONE GEB")]

    def cell(l, v):
        return [Paragraph(l.upper(), st_label), Paragraph(v or "—", st_val)]
    cells = [
        cell("Modello", p.modello), cell("Misura esterna", f"{_fmt_n(p.lunghezza_m, ' m')} × {_fmt_n(p.larghezza_m, ' m')}"), cell("Misura interna", _fmt_n(p.lunghezza_interna_cm, " cm")),
        cell("Ø tubolare", _fmt_n(p.diametro_tubolare_cm, " cm")), cell("Camere", _fmt_n(p.compartimenti)), cell("Portata persone", _fmt_n(p.portata_persone)),
        cell("CV min – max", f"{_fmt_n(p.potenza_min_hp)} – {_fmt_n(p.potenza_max_hp)} HP"), cell("Massa", _fmt_n(p.peso_kg, " kg")), cell("Carena", p.carena or "—"),
        cell("Materiale tub.", p.tessuto or "—"), cell("Categoria CE", p.categoria_ce or "—"), cell("Specchio", p.specchio or "—"),
    ]
    tg = Table([cells[i:i+3] for i in range(0, 12, 3)], colWidths=[60.66*mm]*3)
    tg.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.4, BORDER), ("INNERGRID", (0,0), (-1,-1), 0.25, BORDER),
                            ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.white, LIGHT]), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                            ("LEFTPADDING", (0,0), (-1,-1), 8), ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4)]))
    story.append(tg)
    if p.accessori_serie:
        story.append(Spacer(1, 3))
        story.append(Paragraph(f"<b>Accessori di serie (inclusi):</b> {', '.join(p.accessori_serie)}", st_row))
    if p.dotazioni:
        story.append(Spacer(1, 3))
        story.append(Paragraph(f"<b>Dotazioni di serie:</b> {p.dotazioni}", st_row))
    story.append(Spacer(1, 8))

    calc = _calc(p)
    story.append(section("COSTO GOMMONE"))
    rows = [[Paragraph("Prezzo pubblico gommone (IVA inclusa)", st_row), Paragraph(_fmt_eur(calc["pubblico"]), st_row_b)]]
    if p.sconto_perc:
        rows.append([Paragraph(f"Sconto {CATEGORIE_SCONTO.get(p.tipo_cliente or '', '')}: <b>{p.sconto_perc:g}%</b>", st_row), Paragraph("− " + _fmt_eur(calc["sconto"]), st_row_b)])
    story.append(money_table(rows))
    story.append(highlight("NETTO GOMMONE", _fmt_eur(calc["netto_gommone"])))
    story.append(Spacer(1, 8))

    if p.accessori:
        story.append(section("ACCESSORI OPTIONAL"))
        rows = [[Paragraph(f"{a.nome}" + (f" × {a.quantita}" if (a.quantita or 1) > 1 else ""), st_row),
                 Paragraph("+ " + _fmt_eur(float(a.prezzo or 0) * int(a.quantita or 1)), st_row_b)] for a in p.accessori]
        rows.append([Paragraph("<b>Totale accessori</b>", st_row), Paragraph(_fmt_eur(calc["accessori"]), st_row_b)])
        story.append(money_table(rows))
        story.append(Spacer(1, 8))

    if p.motore_modello or calc["motore"] > 0 or calc["montaggio"] > 0 or calc["cavetteria"] > 0 or calc["batteria"] > 0:
        story.append(section("MOTORIZZAZIONE"))
        rows = []
        if p.motore_modello or calc["motore"] > 0:
            rows.append([Paragraph(f"Motore {p.motore_modello or ''} (IVA inclusa)", st_row), Paragraph("+ " + _fmt_eur(calc["motore"]), st_row_b)])
        if p.motore_sconto_perc:
            rows.append([Paragraph(f"Sconto motore <b>{p.motore_sconto_perc:g}%</b>", st_row), Paragraph("− " + _fmt_eur(calc["motore"] - calc["motore_netto"]), st_row_b)])
        if calc["montaggio"] > 0:
            rows.append([Paragraph("Montaggio e collaudo", st_row), Paragraph("+ " + _fmt_eur(calc["montaggio"]), st_row_b)])
        if calc["cavetteria"] > 0:
            rows.append([Paragraph("Cavetterie e comandi", st_row), Paragraph("+ " + _fmt_eur(calc["cavetteria"]), st_row_b)])
        if calc["batteria"] > 0:
            rows.append([Paragraph("Batteria", st_row), Paragraph("+ " + _fmt_eur(calc["batteria"]), st_row_b)])
        tot_mot = calc["motore_netto"] + calc["montaggio"] + calc["cavetteria"] + calc["batteria"]
        rows.append([Paragraph("<b>Totale motorizzazione</b>", st_row), Paragraph(_fmt_eur(tot_mot), st_row_b)])
        story.append(money_table(rows))
        story.append(Spacer(1, 8))

    tot = Table([[Paragraph("TOTALE PREVENTIVO", ParagraphStyle("tl", parent=st_sec, fontSize=11, alignment=TA_RIGHT)),
                  Paragraph(_fmt_eur(calc["totale"]), ParagraphStyle("tv", parent=st_sec, fontSize=15, alignment=TA_RIGHT))],
                 ["", Paragraph("IVA compresa", ParagraphStyle("iva", parent=styles["Normal"], fontSize=9, textColor=colors.white, alignment=TA_RIGHT))]],
                colWidths=[130*mm, 52*mm])
    tot.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), NAVY), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                             ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 14)]))
    story += [tot, Spacer(1, 10)]
    if p.note:
        story += [Paragraph(f"<b>Note:</b> {p.note}", st_row), Spacer(1, 6)]

    condizioni = await _get_condizioni_preventivo()
    cond = [Paragraph(t, st_footer) for t in condizioni if t and t.strip()]
    firma = [Paragraph("Il titolare", ParagraphStyle("fl", parent=styles["Normal"], fontSize=9, textColor=MUTED, alignment=TA_CENTER)), Spacer(1, 22),
             Paragraph("<b>Sandro Palmieri</b>", ParagraphStyle("fn", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10.5, textColor=NAVY, alignment=TA_CENTER)),
             HRFlowable(width="80%", thickness=0.5, color=BORDER, spaceBefore=2, hAlign="CENTER")]
    footer = Table([[cond, firma]], colWidths=[120*mm, 62*mm])
    footer.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("LINEABOVE", (0,0), (-1,0), 0.6, BORDER), ("TOPPADDING", (0,0), (-1,-1), 6)]))
    story.append(footer)
    doc.build(story)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# INVIO DOCUMENTAZIONE MODELLO (email con allegati + link WhatsApp)
# ---------------------------------------------------------------------------
import secrets as _secrets  # noqa: E402
from pydantic import BaseModel as _BM  # noqa: E402
from fastapi import Request  # noqa: E402

public_router = APIRouter()
SHARE_TIPI = {"caratteristiche": "Scheda tecnica", "listino": "Listino prezzi pubblico", "accessori": "Lista accessori", "catalogo": "Catalogo", "presentazione": "Real (video)", "omologazione": "Omologazione"}
GENERATI = ("caratteristiche", "listino", "accessori")


def _serie_modello(doc: dict) -> str:
    nome = (doc.get("modello") or "").lower()
    for s in ("Job", "Sirio", "Tsunami"):
        if s.lower() in nome:
            return s
    return ""


async def _resp_bytes(resp) -> bytes:
    return b"".join([chunk async for chunk in resp.body_iterator]) if hasattr(resp.body_iterator, "__aiter__") else b"".join(resp.body_iterator)


async def _share_token(doc: dict) -> str:
    if doc.get("share_token"):
        return doc["share_token"]
    tok = _secrets.token_urlsafe(18)
    await db.gommoni_modelli.update_one({"id": doc["id"]}, {"$set": {"share_token": tok}})
    return tok


async def _doc_bytes(doc: dict, tipo: str) -> tuple[bytes, str] | None:
    slug = (doc.get("modello") or "gommone").replace(" ", "_")
    if tipo == "caratteristiche":
        return await _resp_bytes(await caratteristiche_pdf(doc["id"])), f"scheda_tecnica_{slug}.pdf", "application/pdf"
    if tipo == "listino":
        return await _resp_bytes(await _build_listino_pdf(None)), "listino_pubblico_gommoni_GEB.pdf", "application/pdf"
    if tipo == "accessori":
        serie = _serie_modello(doc)
        try:
            resp = await accessori_pdf(serie, "incl")
        except HTTPException:
            try:
                resp = await accessori_pdf("", "incl")
            except HTTPException:
                return None
        return await _resp_bytes(resp), f"accessori_{(serie or 'GEB')}.pdf", "application/pdf"
    if not doc.get(f"{tipo}_file_id"):
        return None
    try:
        stream = await _bucket().open_download_stream(ObjectId(doc[f"{tipo}_file_id"]))
        return await stream.read(), (doc.get(f"{tipo}_nome") or f"{tipo}.pdf"), (doc.get(f"{tipo}_mime") or "application/pdf")
    except Exception:
        return None


def _base_url(request: Request) -> str:
    env = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if env and "localhost" not in env:
        return env
    return str(request.base_url).rstrip("/")


class InviaDocIn(_BM):
    email: Optional[str] = ""
    telefono: Optional[str] = ""
    messaggio: Optional[str] = ""


@router.get("/modelli/{mid}/documentazione")
async def documentazione_info(mid: str, request: Request):
    doc = await db.gommoni_modelli.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Modello non trovato")
    tok = await _share_token(doc)
    base = _base_url(request)
    links = []
    for t, lbl in SHARE_TIPI.items():
        if t not in GENERATI and not doc.get(f"{t}_file_id"):
            continue
        video = (doc.get(f"{t}_mime") or "").startswith("video/")
        links.append({"tipo": t, "label": lbl, "video": video, "url": f"{base}/api/gommoni/share/{tok}/{t}.{'mp4' if video else 'pdf'}"})
    return {"modello": doc.get("modello", ""), "links": links}


@router.post("/modelli/{mid}/invia-documentazione")
async def invia_documentazione(mid: str, p: InviaDocIn, request: Request):
    from email_service import send_email
    doc = await db.gommoni_modelli.find_one({"id": mid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Modello non trovato")
    info = await documentazione_info(mid, request)
    nome = doc.get("modello", "Gommone GEB")
    testo = (p.messaggio or "").strip() or f"Buongiorno, in allegato la documentazione del gommone {nome}: scheda tecnica, listino prezzi pubblico, lista accessori, catalogo e video di presentazione."
    out = {"email_inviata": False, "whatsapp_url": None, "links": info["links"], "testo": testo}
    if (p.email or "").strip():
        allegati, troppo_grandi = [], []
        for l in info["links"]:
            r = await _doc_bytes(doc, l["tipo"])
            if not r:
                continue
            if len(r[0]) > 20 * 1024 * 1024:
                troppo_grandi.append(l)
            else:
                allegati.append({"filename": r[1], "bytes": r[0]})
        html = f"<p>{testo}</p><p>Documenti in allegato.</p>"
        if troppo_grandi and all(l["url"].startswith("https://") for l in troppo_grandi):
            html += "<p>File troppo grandi per l'allegato, scaricabili qui:</p><ul>" + "".join(f'<li><a href="{l["url"]}">{l["label"]}</a></li>' for l in troppo_grandi) + "</ul>"
        html += "<p>Cantiere GEB nautica</p>"
        try:
            await send_email(to=p.email.strip(), subject=f"Documentazione gommone GEB {nome}", html=html, attachments=allegati)
            out["email_inviata"] = True
        except Exception as e:  # noqa: BLE001
            raise HTTPException(400, f"Invio email non riuscito: {getattr(e, 'detail', e)}")
    if (p.telefono or "").strip():
        import urllib.parse
        num = "".join(ch for ch in p.telefono if ch.isdigit())
        if num.startswith("00"):
            num = num[2:]
        elif len(num) == 10 and num.startswith("3"):
            num = "39" + num
        msg = testo + "\n\n" + "\n".join(f"{l['label']}: {l['url']}" for l in info["links"])
        out["whatsapp_url"] = f"https://wa.me/{num}?text={urllib.parse.quote(msg)}"
    return out


@public_router.get("/api/gommoni/share/{token}/{tipo}.{ext}")
async def share_doc(token: str, tipo: str, ext: str):
    if tipo not in SHARE_TIPI:
        raise HTTPException(404, "Documento non trovato")
    doc = await db.gommoni_modelli.find_one({"share_token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Link non valido")
    r = await _doc_bytes(doc, tipo)
    if not r:
        raise HTTPException(404, "Documento non caricato")
    return StreamingResponse(io.BytesIO(r[0]), media_type=r[2], headers={"Content-Disposition": f'inline; filename="{r[1]}"', "Accept-Ranges": "bytes"})


async def migra_presentazioni_pdf():
    """Una tantum: i PDF caricati come 'presentazione' prima della separazione Real/Catalogo diventano 'catalogo'."""
    cur = db.gommoni_modelli.find({"presentazione_file_id": {"$nin": ["", None]}, "presentazione_mime": {"$not": {"$regex": "^video/"}}}, {"_id": 0})
    async for d in cur:
        if d.get("catalogo_file_id"):
            continue
        await db.gommoni_modelli.update_one({"id": d["id"]}, {
            "$set": {"catalogo_file_id": d["presentazione_file_id"], "catalogo_nome": d.get("presentazione_nome", ""), "catalogo_mime": "application/pdf"},
            "$unset": {"presentazione_file_id": "", "presentazione_nome": "", "presentazione_mime": ""}})
