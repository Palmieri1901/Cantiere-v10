"""Modulo DDT (documento di trasporto) + Foglio di destinazione + rubrica indirizzi."""
import io
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from database import db
from helpers import serialize
from models import Ddt, DdtCreate, DdtIndirizzo, DdtIndirizzoCreate, DdtDestinatario
from routers.suzuki import _logo_flowable, _fmt_eur

router = APIRouter(prefix="/ddt", tags=["DDT"])


async def _cantiere() -> dict:
    return await db.cantiere.find_one({"id": "default"}, {"_id": 0}) or {}


# ---------------------------------------------------------------------------
# RUBRICA INDIRIZZI
# ---------------------------------------------------------------------------
@router.get("/indirizzi", response_model=List[DdtIndirizzo])
async def list_indirizzi(q: Optional[str] = None):
    query = {"nome": {"$regex": q, "$options": "i"}} if q else {}
    docs = await db.ddt_indirizzi.find(query, {"_id": 0}).sort("nome", 1).to_list(5000)
    return [DdtIndirizzo(**d) for d in docs]


@router.post("/indirizzi", response_model=DdtIndirizzo)
async def create_indirizzo(payload: DdtIndirizzoCreate):
    if not payload.nome.strip():
        raise HTTPException(400, "Nome obbligatorio")
    a = DdtIndirizzo(**payload.model_dump())
    await db.ddt_indirizzi.insert_one(serialize(a))
    return a


@router.put("/indirizzi/{aid}", response_model=DdtIndirizzo)
async def update_indirizzo(aid: str, payload: DdtIndirizzoCreate):
    doc = await db.ddt_indirizzi.find_one({"id": aid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Indirizzo non trovato")
    a = DdtIndirizzo(**{**doc, **payload.model_dump(), "updated_at": datetime.now(timezone.utc)})
    await db.ddt_indirizzi.update_one({"id": aid}, {"$set": serialize(a)})
    return a


@router.delete("/indirizzi/{aid}")
async def delete_indirizzo(aid: str):
    res = await db.ddt_indirizzi.delete_one({"id": aid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Indirizzo non trovato")
    return {"ok": True}


# ---------------------------------------------------------------------------
# DDT CRUD (catalogati per anno)
# ---------------------------------------------------------------------------
@router.get("/anni")
async def list_anni():
    anni = await db.ddt.distinct("anno")
    cur = datetime.now().year
    return sorted(set([int(a) for a in anni if a] + [cur]), reverse=True)


@router.get("/prossimo-numero")
async def prossimo_numero(anno: Optional[int] = None):
    anno = anno or datetime.now().year
    return {"anno": anno, "numero": await _next_numero(anno)}


async def _next_numero(anno: int) -> int:
    last = await db.ddt.find({"anno": anno}, {"_id": 0, "numero": 1}).sort("numero", -1).limit(1).to_list(1)
    return (int(last[0]["numero"]) if last else 0) + 1


@router.get("", response_model=List[Ddt])
async def list_ddt(anno: Optional[int] = None, q: Optional[str] = None):
    query: dict = {}
    if anno:
        query["anno"] = anno
    if q:
        query["cessionario.nome"] = {"$regex": q, "$options": "i"}
    docs = await db.ddt.find(query, {"_id": 0}).sort([("anno", -1), ("numero", -1)]).to_list(5000)
    return [Ddt(**d) for d in docs]


@router.post("", response_model=Ddt)
async def create_ddt(payload: DdtCreate):
    data = payload.model_dump(exclude_none=True)
    data["data"] = data.get("data") or datetime.now(timezone.utc).date().isoformat()
    data["anno"] = data.get("anno") or int(data["data"][:4])
    if not data.get("numero"):
        data["numero"] = await _next_numero(data["anno"])
    elif await db.ddt.find_one({"anno": data["anno"], "numero": data["numero"]}):
        raise HTTPException(400, f"DDT n. {data['numero']}/{data['anno']} già esistente")
    d = Ddt(**data)
    await db.ddt.insert_one(serialize(d))
    return d


@router.put("/{did}", response_model=Ddt)
async def update_ddt(did: str, payload: DdtCreate):
    doc = await db.ddt.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DDT non trovato")
    data = payload.model_dump(exclude_none=True)
    merged = {**doc, **data, "updated_at": datetime.now(timezone.utc)}
    dup = await db.ddt.find_one({"anno": merged["anno"], "numero": merged["numero"], "id": {"$ne": did}})
    if dup:
        raise HTTPException(400, f"DDT n. {merged['numero']}/{merged['anno']} già esistente")
    d = Ddt(**merged)
    await db.ddt.update_one({"id": did}, {"$set": serialize(d)})
    return d


@router.delete("/{did}")
async def delete_ddt(did: str):
    res = await db.ddt.delete_one({"id": did})
    if res.deleted_count == 0:
        raise HTTPException(404, "DDT non trovato")
    return {"ok": True}


@router.post("/preview-pdf")
async def preview_ddt_pdf(payload: DdtCreate):
    data = payload.model_dump(exclude_none=True)
    data["data"] = data.get("data") or datetime.now(timezone.utc).date().isoformat()
    data["anno"] = data.get("anno") or int(data["data"][:4])
    data["numero"] = data.get("numero") or await _next_numero(data["anno"])
    pdf = await _build_ddt_pdf(Ddt(**data))
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="anteprima_ddt.pdf"'})


@router.post("/preview-foglio-destinazione")
async def preview_foglio_pdf(payload: DdtCreate):
    pdf = await _build_foglio_pdf(Ddt(**payload.model_dump(exclude_none=True)))
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="foglio_destinazione.pdf"'})


@router.get("/{did}/pdf")
async def ddt_pdf(did: str):
    doc = await db.ddt.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DDT non trovato")
    d = Ddt(**doc)
    pdf = await _build_ddt_pdf(d)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="DDT_{d.numero}_{d.anno}.pdf"'})


@router.get("/{did}/foglio-destinazione.pdf")
async def foglio_pdf(did: str):
    doc = await db.ddt.find_one({"id": did}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "DDT non trovato")
    d = Ddt(**doc)
    pdf = await _build_foglio_pdf(d)
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="Foglio_destinazione_DDT_{d.numero}_{d.anno}.pdf"'})


# ---------------------------------------------------------------------------
# PDF
# ---------------------------------------------------------------------------
def _dest_lines(d: DdtDestinatario) -> List[str]:
    out = [d.nome] if d.nome else []
    if d.indirizzo:
        out.append(d.indirizzo)
    loc = " ".join(x for x in [d.cap, d.citta, f"({d.provincia})" if d.provincia else ""] if x).strip()
    if loc:
        out.append(loc)
    if d.telefono:
        out.append(f"Tel. {d.telefono}")
    return out


def _fmt_data(iso: str) -> str:
    try:
        return datetime.fromisoformat((iso or "")[:10]).strftime("%d/%m/%Y")
    except Exception:
        return iso or ""


def _mittente_lines(c: dict) -> List[str]:
    loc = " ".join(x for x in [c.get("cap", ""), c.get("citta", ""), f"({c.get('provincia')})" if c.get("provincia") else ""] if x)
    return [x for x in [
        f"<b>{c.get('nome') or 'GEB di Palmieri Sandro'}</b>",
        "Costruzione battelli pneumatici · Centro assistenza inflatable boat",
        "Riparazione - Manutenzione - Rimessaggio",
        c.get("indirizzo", ""), loc,
        f"Tel. {c['telefono']}" if c.get("telefono") else "",
        f"P.I. {c['piva']}" if c.get("piva") else "",
        c.get("sito_web", ""),
    ] if x]


async def _build_ddt_pdf(d: Ddt) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    c = await _cantiere()
    NAVY = colors.HexColor("#0F2A47")
    LIGHT = colors.HexColor("#F2F4F7")
    BORDER = colors.HexColor("#9AA4B2")
    styles = getSampleStyleSheet()
    st = ParagraphStyle("n", parent=styles["Normal"], fontSize=8.5, leading=10.5)
    st_b = ParagraphStyle("b", parent=st, fontName="Helvetica-Bold")
    st_lab = ParagraphStyle("l", parent=st, fontSize=6.5, leading=8, textColor=colors.HexColor("#555"))
    st_val = ParagraphStyle("v", parent=st, fontName="Helvetica-Bold", fontSize=9.5, leading=12)
    st_title = ParagraphStyle("t", parent=st, fontName="Helvetica-Bold", fontSize=15, leading=18, textColor=NAVY, alignment=TA_RIGHT)
    st_r = ParagraphStyle("r", parent=st, alignment=TA_RIGHT)
    st_head = ParagraphStyle("h", parent=st_b, textColor=colors.white, alignment=TA_CENTER, fontSize=8)

    def box(label, value, w):
        t = Table([[Paragraph(label.upper(), st_lab)], [Paragraph(value or "&nbsp;", st_val)]], colWidths=[w])
        t.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.5, BORDER), ("TOPPADDING", (0,0), (-1,-1), 1.5), ("BOTTOMPADDING", (0,0), (-1,-1), 2), ("LEFTPADDING", (0,0), (-1,-1), 4)]))
        return t

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=12*mm, rightMargin=12*mm, topMargin=10*mm, bottomMargin=10*mm)
    story = []

    logo = _logo_flowable(max_w_mm=40, max_h_mm=22)
    mitt = [Paragraph(x, st) for x in _mittente_lines(c)]
    left = Table([[logo, mitt]] if logo else [[mitt]], colWidths=[44*mm, 76*mm] if logo else [120*mm])
    left.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0)]))
    right = [Paragraph("DDT documento di trasporto", st_title), Paragraph("DPR 472 del 14/08/1996", st_r), Spacer(1, 6),
             Table([[box("Numero", f"{d.numero}/{d.anno}", 30*mm), box("Data", _fmt_data(d.data), 32*mm)]], colWidths=[31*mm, 33*mm],
                   style=TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 1)]))]
    head = Table([[left, right]], colWidths=[120*mm, 66*mm])
    head.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 0)]))
    story += [head, Spacer(1, 6)]

    info = Table([[box("Codice cliente", d.codice_cliente, 46*mm), box("Rif. ordine", d.rif_ordine, 46*mm),
                   box("Condizioni di pagamento", d.condizioni_pagamento, 46*mm), box("N. pag.", "1", 46*mm)]], colWidths=[46.5*mm]*4)
    info.setStyle(TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 1)]))
    story += [info, Spacer(1, 6)]

    dest = d.cessionario if d.destinazione_idem else d.destinazione
    ces_p = [Paragraph("CESSIONARIO", st_lab)] + [Paragraph(x, st_val if i == 0 else st) for i, x in enumerate(_dest_lines(d.cessionario))]
    des_p = [Paragraph("DESTINAZIONE MERCE", st_lab)] + ([Paragraph("IDEM", st_val)] if d.destinazione_idem else [Paragraph(x, st_val if i == 0 else st) for i, x in enumerate(_dest_lines(dest))])
    tdest = Table([[ces_p, des_p]], colWidths=[93*mm, 93*mm], rowHeights=[26*mm])
    tdest.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.5, BORDER), ("INNERGRID", (0,0), (-1,-1), 0.5, BORDER), ("VALIGN", (0,0), (-1,-1), "TOP"),
                               ("LEFTPADDING", (0,0), (-1,-1), 6), ("TOPPADDING", (0,0), (-1,-1), 4)]))
    story += [tdest, Spacer(1, 6)]

    rows = [[Paragraph(h, st_head) for h in ["Q.tà", "Descrizione", "Prezzo unitario", "Totale"]]]
    tot = 0.0
    for r in d.righe:
        imp = float(r.quantita or 0) * float(r.prezzo_unitario or 0)
        tot += imp
        rows.append([Paragraph(f"{r.quantita:g}", ParagraphStyle("c", parent=st, alignment=TA_CENTER)), Paragraph(r.descrizione or "", st),
                     Paragraph(_fmt_eur(r.prezzo_unitario) if r.prezzo_unitario else "—", st_r), Paragraph(_fmt_eur(imp) if imp else "—", st_r)])
    for _ in range(max(0, 8 - len(d.righe))):
        rows.append(["", "", "", ""])
    if tot:
        rows.append(["", Paragraph("<b>TOTALE</b>", st_r), "", Paragraph(f"<b>{_fmt_eur(tot)}</b>", st_r)])
    tr = Table(rows, colWidths=[16*mm, 110*mm, 30*mm, 30*mm], repeatRows=1)
    tr.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), NAVY), ("GRID", (0,0), (-1,-1), 0.4, BORDER), ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]), ("TOPPADDING", (0,0), (-1,-1), 3.5), ("BOTTOMPADDING", (0,0), (-1,-1), 3.5)]))
    story += [tr, Spacer(1, 6)]

    t2 = Table([[box("Causale", d.causale, 40*mm), box("Porto", d.porto, 28*mm), box("Colli", str(d.colli or ""), 20*mm), box("Peso", d.peso, 24*mm),
                 box("Data / ora inizio trasporto", d.data_ora_trasporto, 40*mm), box("Variazioni", "", 33*mm)]],
               colWidths=[41*mm, 29*mm, 21*mm, 25*mm, 41*mm, 29*mm])
    t2.setStyle(TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 1)]))
    story += [t2, Spacer(1, 4)]

    def sig(label):
        t = Table([[Paragraph(label.upper(), st_lab)], [Spacer(1, 14*mm)]], colWidths=[46*mm])
        t.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.5, BORDER), ("LEFTPADDING", (0,0), (-1,-1), 4)]))
        return t
    t3 = Table([[box("Vettore", d.vettore, 46*mm), box("Aspetto beni", d.aspetto_beni, 46*mm), sig("Firma del vettore"), sig("Firma del conducente")],
                [Paragraph(f"<b>Note:</b> {d.note}" if d.note else "", st), "", "", sig("Firma del destinatario")]], colWidths=[46.5*mm]*4)
    t3.setStyle(TableStyle([("LEFTPADDING", (0,0), (-1,-1), 0), ("RIGHTPADDING", (0,0), (-1,-1), 1), ("VALIGN", (0,0), (-1,-1), "TOP"),
                            ("SPAN", (0,1), (2,1)), ("TOPPADDING", (0,1), (-1,1), 4)]))
    story.append(t3)
    doc.build(story)
    return buf.getvalue()


async def _build_foglio_pdf(d: Ddt) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

    c = await _cantiere()
    NAVY = colors.HexColor("#0F2A47")
    styles = getSampleStyleSheet()
    st = ParagraphStyle("n", parent=styles["Normal"], fontSize=10, leading=13)
    st_mitt = ParagraphStyle("m", parent=st, fontSize=7.5, leading=9.5, textColor=colors.HexColor("#333"))
    st_lab = ParagraphStyle("l", parent=st, fontSize=11, fontName="Helvetica-Bold", textColor=colors.HexColor("#555"))
    st_dest_name = ParagraphStyle("dn", parent=st, fontName="Helvetica-Bold", fontSize=30, leading=36, textColor=NAVY)
    st_dest = ParagraphStyle("d", parent=st, fontName="Helvetica-Bold", fontSize=22, leading=28)
    st_note = ParagraphStyle("nt", parent=st, fontSize=13, leading=17)
    st_small = ParagraphStyle("s", parent=st, fontSize=9, textColor=colors.grey, alignment=TA_CENTER)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15*mm, rightMargin=15*mm, topMargin=12*mm, bottomMargin=12*mm)
    story = []
    logo = _logo_flowable(max_w_mm=55, max_h_mm=30)
    mitt = [Paragraph("MITT:", st_lab)] + [Paragraph(x, st_mitt) for x in _mittente_lines(c)]
    head = Table([[logo, mitt]] if logo else [[mitt]], colWidths=[60*mm, 120*mm] if logo else [180*mm])
    head.setStyle(TableStyle([("VALIGN", (0,0), (-1,-1), "TOP"), ("LEFTPADDING", (0,0), (-1,-1), 0)]))
    story += [head, Spacer(1, 6), HRFlowable(width="100%", thickness=1.2, color=NAVY), Spacer(1, 40)]

    dest = d.cessionario if d.destinazione_idem else d.destinazione
    lines = _dest_lines(dest)
    story.append(Paragraph("DESTINAZIONE:", st_lab))
    story.append(Spacer(1, 8))
    if lines:
        story.append(Paragraph(lines[0], st_dest_name))
        for x in lines[1:]:
            story.append(Paragraph(x, st_dest))
    else:
        story.append(Paragraph("—", st_dest))
    story.append(Spacer(1, 30))
    if d.note_destinazione:
        t = Table([[Paragraph(f"<b>Note:</b><br/>{d.note_destinazione.replace(chr(10), '<br/>')}", st_note)]], colWidths=[180*mm])
        t.setStyle(TableStyle([("BOX", (0,0), (-1,-1), 0.8, NAVY), ("LEFTPADDING", (0,0), (-1,-1), 10), ("TOPPADDING", (0,0), (-1,-1), 8), ("BOTTOMPADDING", (0,0), (-1,-1), 8)]))
        story.append(t)
        story.append(Spacer(1, 20))
    rif = f"Rif. DDT n. {d.numero}/{d.anno} del {_fmt_data(d.data)}" if d.numero else ""
    extra = " · ".join(x for x in [rif, f"Colli: {d.colli}" if d.colli else "", f"Peso: {d.peso}" if d.peso else ""] if x)
    if extra:
        story.append(Paragraph(extra, st_small))
    doc.build(story)
    return buf.getvalue()


# ---------- App dipendenti (API key): rubrica indirizzi e foglio destinazione ----------
from fastapi import Depends  # noqa: E402
from routers.mobile import richiede  # noqa: E402

mobile_router = APIRouter(prefix="/api/mobile/ddt", dependencies=[Depends(richiede("ddt"))])
mobile_router.add_api_route("/indirizzi", list_indirizzi, methods=["GET"], response_model=List[DdtIndirizzo])
mobile_router.add_api_route("/foglio-destinazione.pdf", preview_foglio_pdf, methods=["POST"])
