"""Mezzi del cantiere (camion, muletto…): incassi e spese di gestione per mese/anno."""
import io
import uuid
from html import escape
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

from database import db
from helpers import _euro

router = APIRouter()

CATEGORIE = ["incasso", "carburante", "riparazione", "biglietti", "pedaggio", "assicurazione", "altro"]
ETICHETTE = {"incasso": "Incassi", "carburante": "Carburante", "riparazione": "Riparazioni", "biglietti": "Biglietti/traghetto",
             "pedaggio": "Pedaggi", "assicurazione": "Assicurazione/bollo", "altro": "Altro"}
SPESE = [c for c in CATEGORIE if c != "incasso"]
MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]


class MezzoIn(BaseModel):
    nome: str
    targa: Optional[str] = ""
    note: Optional[str] = ""
    attivo: bool = True


class MovimentoIn(BaseModel):
    mezzo_id: str
    data: str
    categoria: str
    importo: float
    descrizione: Optional[str] = ""


def _now():
    return datetime.now(timezone.utc).isoformat()


@router.get("/mezzi")
async def list_mezzi():
    return await db.mezzi.find({}, {"_id": 0}).sort("nome", 1).to_list(500)


@router.post("/mezzi")
async def crea_mezzo(p: MezzoIn):
    if not p.nome.strip():
        raise HTTPException(400, "Nome obbligatorio")
    doc = {**p.model_dump(), "nome": p.nome.strip(), "id": str(uuid.uuid4()), "created_at": _now()}
    await db.mezzi.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/mezzi/{mid}")
async def aggiorna_mezzo(mid: str, p: MezzoIn):
    r = await db.mezzi.update_one({"id": mid}, {"$set": {**p.model_dump(), "nome": p.nome.strip()}})
    if r.matched_count == 0:
        raise HTTPException(404, "Mezzo non trovato")
    return await db.mezzi.find_one({"id": mid}, {"_id": 0})


@router.delete("/mezzi/{mid}")
async def elimina_mezzo(mid: str):
    n = await db.mezzi_movimenti.count_documents({"mezzo_id": mid})
    if n:
        raise HTTPException(400, f"Il mezzo ha {n} movimenti registrati: eliminali prima")
    r = await db.mezzi.delete_one({"id": mid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Mezzo non trovato")
    return {"ok": True}


def _check(p: MovimentoIn):
    if p.categoria not in CATEGORIE:
        raise HTTPException(400, "Categoria non valida")
    if p.importo <= 0:
        raise HTTPException(400, "Importo deve essere maggiore di zero")
    if len(p.data) != 10:
        raise HTTPException(400, "Data non valida")


@router.get("/mezzi/movimenti")
async def list_movimenti(anno: int, mezzo_id: Optional[str] = None, mese: Optional[int] = None):
    q = {"data": {"$gte": f"{anno}-01-01", "$lte": f"{anno}-12-31"}}
    if mezzo_id:
        q["mezzo_id"] = mezzo_id
    if mese:
        q["data"] = {"$gte": f"{anno}-{mese:02d}-01", "$lte": f"{anno}-{mese:02d}-31"}
    docs = await db.mezzi_movimenti.find(q, {"_id": 0}).sort("data", -1).to_list(10000)
    return docs


@router.post("/mezzi/movimenti")
async def crea_movimento(p: MovimentoIn):
    _check(p)
    if not await db.mezzi.find_one({"id": p.mezzo_id}):
        raise HTTPException(404, "Mezzo non trovato")
    doc = {**p.model_dump(), "id": str(uuid.uuid4()), "created_at": _now()}
    await db.mezzi_movimenti.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.put("/mezzi/movimenti/{mid}")
async def aggiorna_movimento(mid: str, p: MovimentoIn):
    _check(p)
    r = await db.mezzi_movimenti.update_one({"id": mid}, {"$set": p.model_dump()})
    if r.matched_count == 0:
        raise HTTPException(404, "Movimento non trovato")
    return await db.mezzi_movimenti.find_one({"id": mid}, {"_id": 0})


@router.delete("/mezzi/movimenti/{mid}")
async def elimina_movimento(mid: str):
    r = await db.mezzi_movimenti.delete_one({"id": mid})
    if r.deleted_count == 0:
        raise HTTPException(404, "Movimento non trovato")
    return {"ok": True}


async def _riepilogo(anno: int, mezzo_id: Optional[str]) -> dict:
    docs = await list_movimenti(anno, mezzo_id)
    mesi = [{"mese": m + 1, "nome": MESI[m], **{c: 0.0 for c in CATEGORIE}, "spese": 0.0, "parziale": 0.0, "n": 0, "incassi_desc": []} for m in range(12)]
    for d in docs:
        m = int(d["data"][5:7]) - 1
        mesi[m][d["categoria"]] += float(d["importo"])
        mesi[m]["n"] += 1
        if d["categoria"] == "incasso" and (d.get("descrizione") or "").strip():
            mesi[m]["incassi_desc"].append(d["descrizione"].strip())
    for r in mesi:
        r["spese"] = round(sum(r[c] for c in SPESE), 2)
        r["parziale"] = round(r["incasso"] - r["spese"], 2)
        for c in CATEGORIE:
            r[c] = round(r[c], 2)
    tot = {c: round(sum(r[c] for r in mesi), 2) for c in CATEGORIE}
    tot["spese"] = round(sum(r["spese"] for r in mesi), 2)
    tot["parziale"] = round(tot["incasso"] - tot["spese"], 2)
    tot["n"] = sum(r["n"] for r in mesi)
    return {"anno": anno, "mezzo_id": mezzo_id, "mesi": mesi, "totale": tot, "categorie": CATEGORIE, "etichette": ETICHETTE}


@router.get("/mezzi/riepilogo")
async def riepilogo(anno: int, mezzo_id: Optional[str] = None):
    return await _riepilogo(anno, mezzo_id)


@router.get("/mezzi/anni")
async def anni_disponibili():
    docs = await db.mezzi_movimenti.find({}, {"_id": 0, "data": 1}).to_list(100000)
    anni = sorted({int(d["data"][:4]) for d in docs} | {datetime.now().year}, reverse=True)
    return anni


@router.get("/mezzi/riepilogo.pdf")
async def riepilogo_pdf(anno: int, mezzo_id: Optional[str] = None):
    r = await _riepilogo(anno, mezzo_id)
    cant = await db.cantiere.find_one({"id": "default"}, {"_id": 0}) or {}
    mezzo = await db.mezzi.find_one({"id": mezzo_id}, {"_id": 0}) if mezzo_id else None
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=landscape(A4), leftMargin=12*mm, rightMargin=12*mm, topMargin=12*mm, bottomMargin=12*mm)
    st = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=st["Title"], fontSize=15, alignment=0, spaceAfter=2)
    small = ParagraphStyle("s", parent=st["Normal"], fontSize=8, textColor=colors.HexColor("#5B6478"))
    titolo = f"Consumi e ricavi mezzi – {anno}" + (f" – {mezzo['nome']}" + (f" ({mezzo['targa']})" if mezzo.get("targa") else "") if mezzo else " – Tutti i mezzi")
    elems = [Paragraph(titolo, h), Paragraph(f"{cant.get('nome', '')} · generato il {datetime.now().strftime('%d/%m/%Y')}", small), Spacer(1, 4*mm)]
    header = ["Mese", "Incassi"] + [ETICHETTE[c] for c in SPESE] + ["Tot. spese", "Parziale"]
    rows = [header]
    desc_st = ParagraphStyle("d", parent=st["Normal"], fontSize=6.5, leading=7.5, textColor=colors.HexColor("#5B6478"), alignment=2)
    for m in r["mesi"]:
        inc = _euro(m["incasso"])
        if m.get("incassi_desc"):
            inc = Paragraph(f"<para align=right>{escape(inc)}<br/><font size=6.5 color='#5B6478'>{escape(' · '.join(m['incassi_desc']))}</font></para>", desc_st)
        rows.append([m["nome"], inc] + [_euro(m[c]) for c in SPESE] + [_euro(m["spese"]), _euro(m["parziale"])])
    t = r["totale"]
    rows.append(["TOTALE ANNO", _euro(t["incasso"])] + [_euro(t[c]) for c in SPESE] + [_euro(t["spese"]), _euro(t["parziale"])])
    tbl = Table(rows, repeatRows=1, colWidths=[24*mm, 48*mm] + [27*mm] * (len(header) - 2))
    tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F2A44")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F3F0E8")]),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E8E2D0")), ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D9D4C7")), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TEXTCOLOR", (-1, 1), (-1, -1), colors.HexColor("#0F766E")),
    ]))
    for i, m in enumerate(r["mesi"], start=1):
        if m["parziale"] < 0:
            tbl.setStyle(TableStyle([("TEXTCOLOR", (-1, i), (-1, i), colors.HexColor("#B91C1C"))]))
    if t["parziale"] < 0:
        tbl.setStyle(TableStyle([("TEXTCOLOR", (-1, -1), (-1, -1), colors.HexColor("#B91C1C"))]))
    elems.append(tbl)
    pdf.build(elems)
    nome = f"mezzi_{anno}" + (f"_{mezzo['nome'].replace(' ', '_')}" if mezzo else "") + ".pdf"
    return StreamingResponse(io.BytesIO(buf.getvalue()), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={nome}"})
