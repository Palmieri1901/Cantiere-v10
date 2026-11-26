"""Liberatoria per modifica/potenziamento motore fuoribordo: testo modificabile + PDF da far firmare al cliente."""
import io
from datetime import datetime, timezone
from html import escape
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db
from routers.suzuki import _NO_CACHE, _logo_flowable

router = APIRouter(prefix="/suzuki/liberatoria", tags=["Suzuki"])

# Segnaposto: {cliente} {motore} {matricola} {imbarcazione} {hp_da} {hp_a} {intervento} {cantiere}
TESTO_DEFAULT = [
    "Il/La sottoscritto/a {cliente}, proprietario/a del motore fuoribordo {motore}, matricola {matricola}, installato sull'imbarcazione {imbarcazione}, "
    "chiede espressamente a {cantiere} di eseguire sul motore la modifica di potenziamento da {hp_da} HP a {hp_a} HP ({intervento}).",
    "Dichiara di essere a conoscenza che la modifica è ammessa esclusivamente per l'impiego in gare in circuiti chiusi o per scopi dimostrativi "
    "e non per il normale uso del mezzo, e si impegna a non utilizzare il motore modificato per la navigazione ordinaria.",
    "Dichiara di essere stato/a informato/a che la modifica può comportare la decadenza della garanzia del costruttore e può incidere su durata, consumi e affidabilità del motore.",
    "Dichiara di essere stato/a informato/a che la variazione di potenza va riportata sui documenti del motore e dell'imbarcazione (es. certificato d'uso del motore, "
    "documenti di navigazione, polizza assicurativa) e che la potenza installata deve rispettare i limiti dell'imbarcazione e dell'abilitazione al comando: "
    "i relativi adempimenti restano a suo carico.",
    "Si assume ogni responsabilità derivante dall'uso del motore modificato e solleva {cantiere} da responsabilità per danni a persone o cose, sanzioni o contestazioni "
    "conseguenti alla modifica richiesta, fatti salvi i casi di dolo o colpa grave previsti dalla legge.",
    "Dichiara di aver letto, compreso e accettato quanto sopra.",
]
SEGNALAZIONE_DEFAULT = [
    "Oggetto: Segnalazione di non conformità del motore fuoribordo",
    "Gentile Cliente,",
    "in occasione dell'intervento di manutenzione e dei controlli tecnici effettuati sul suo motore fuoribordo, è stata riscontrata una configurazione "
    "che ne determina un potenziamento rispetto alle caratteristiche tecniche e ai parametri di omologazione originali.",
    "Tale modifica comporta una condizione di non conformità rispetto alle caratteristiche dichiarate e alle disposizioni normative applicabili, "
    "con possibili conseguenze in caso di controlli da parte delle autorità competenti.",
    "Con la presente, {cantiere} le segnala formalmente quanto riscontrato e raccomanda il ripristino del motore alla configurazione originale di fabbrica, "
    "al fine di ricondurlo alle condizioni di conformità previste.",
    "La invitiamo pertanto a valutare e programmare quanto prima l'intervento di ripristino. Fino alla regolarizzazione della configurazione, "
    "sconsigliamo l'utilizzo del motore nelle attuali condizioni.",
    "La presente comunicazione viene rilasciata a titolo di segnalazione tecnica, affinché il cliente sia informato delle condizioni riscontrate "
    "e delle possibili implicazioni derivanti dall'utilizzo del motore in tale configurazione.",
    "Restiamo a disposizione per qualsiasi chiarimento e per l'eventuale intervento di ripristino.",
    "Cordiali saluti.",
    "{cantiere}\nAssistenza tecnica e manutenzione nautica",
]
# tipo documento -> (id impostazione, testo predefinito)
TIPI = {"potenziamento": ("liberatoria_potenziamento", TESTO_DEFAULT), "non_conformita": ("segnalazione_non_conformita", SEGNALAZIONE_DEFAULT)}


class TestoIn(BaseModel):
    paragrafi: List[str]


class LiberatoriaIn(BaseModel):
    tipo: str = "potenziamento"
    cliente: str = ""
    codice_fiscale: str = ""
    indirizzo: str = ""
    telefono: str = ""
    imbarcazione: str = ""
    motore: str = ""
    matricola: str = ""
    hp_da: str = ""
    hp_a: str = ""
    intervento: str = ""
    luogo: str = ""
    data: str = ""
    paragrafi: List[str] = []


def _tipo(tipo: str):
    if tipo not in TIPI:
        raise HTTPException(400, "Tipo di documento non valido")
    return TIPI[tipo]


async def _testo(tipo: str) -> List[str]:
    doc_id, default = _tipo(tipo)
    d = await db.app_settings.find_one({"id": doc_id}, {"_id": 0}) or {}
    return d.get("paragrafi") or default


@router.get("/testo")
async def get_testo(tipo: str = "potenziamento"):
    return {"paragrafi": await _testo(tipo), "predefinito": _tipo(tipo)[1]}


@router.put("/testo")
async def put_testo(p: TestoIn, tipo: str = "potenziamento"):
    doc_id, default = _tipo(tipo)
    par = [x.strip() for x in p.paragrafi if x.strip()]
    await db.app_settings.update_one({"id": doc_id}, {"$set": {"paragrafi": par}}, upsert=True)
    return {"paragrafi": par or default}


@router.post("/pdf")
async def liberatoria_pdf(p: LiberatoriaIn):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    c = await db.cantiere.find_one({"id": "default"}, {"_id": 0}) or {}
    cant = c.get("nome") or "il cantiere"
    vuoto = "_______________"
    val = {k: escape(str(getattr(p, k) or "").strip()) or vuoto for k in ("cliente", "motore", "matricola", "imbarcazione", "hp_da", "hp_a")}
    val["intervento"] = escape(p.intervento.strip()) or "come da accordi"
    val["cantiere"] = f"<b>{escape(cant)}</b>"
    for k in ("cliente", "motore", "matricola", "imbarcazione"):
        if val[k] != vuoto:
            val[k] = f"<b>{val[k]}</b>"

    st_b = ParagraphStyle("b", fontName="Helvetica", fontSize=10.5, leading=15, alignment=4, spaceAfter=7)
    st_s = ParagraphStyle("s", fontName="Helvetica", fontSize=8.5, leading=11, textColor=colors.HexColor("#475569"))
    st_t = ParagraphStyle("t", fontName="Helvetica-Bold", fontSize=15, leading=19, alignment=1, spaceAfter=3)
    st_st = ParagraphStyle("st", fontName="Helvetica", fontSize=10, leading=13, alignment=1, textColor=colors.HexColor("#475569"))

    intest = [Paragraph(f"<b>{escape(cant)}</b>", ParagraphStyle("c", fontName="Helvetica", fontSize=11, leading=14))]
    riga = " · ".join(x for x in [c.get("indirizzo", ""), " ".join(x for x in [c.get("cap", ""), c.get("citta", ""), f"({c['provincia']})" if c.get("provincia") else ""] if x)] if x)
    for x in [riga, " · ".join(x for x in [f"Tel. {c['telefono']}" if c.get("telefono") else "", c.get("email", ""), f"P.IVA {c['piva']}" if c.get("piva") else ""] if x)]:
        if x:
            intest.append(Paragraph(escape(x), st_s))
    logo = _logo_flowable(45, 18)
    head = Table([[logo or "", intest]], colWidths=[50 * mm, None])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))

    dati = [["Cliente", p.cliente], ["Codice fiscale", p.codice_fiscale], ["Indirizzo", p.indirizzo], ["Telefono", p.telefono],
            ["Imbarcazione", p.imbarcazione], ["Motore", p.motore], ["Matricola", p.matricola],
            ["Potenza", f"da {p.hp_da or '____'} HP a {p.hp_a or '____'} HP"]]
    tdati = Table([[Paragraph(f"<b>{a}</b>", st_s), Paragraph(escape(b or ""), ParagraphStyle("v", fontName="Helvetica", fontSize=10, leading=13))] for a, b in dati],
                  colWidths=[35 * mm, None])
    tdati.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
                               ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))

    segn = p.tipo == "non_conformita"
    paragrafi = [x for x in (p.paragrafi or await _testo(p.tipo)) if x.strip()]
    corpo = []
    for t in paragrafi:
        try:
            html = escape(t).format(**val)
        except (KeyError, IndexError, ValueError):
            html = escape(t)
        html = html.replace("\n", "<br/>")
        if html.lower().startswith("oggetto:"):
            corpo.append(Paragraph(f"<b>{html}</b>", ParagraphStyle("o", parent=st_b, alignment=0, spaceAfter=12)))
        else:
            corpo.append(Paragraph(html, st_b if not segn or len(t) > 60 else ParagraphStyle("l", parent=st_b, alignment=0)))

    data = p.data.strip() or datetime.now(timezone.utc).strftime("%d/%m/%Y")
    if segn:
        return _pdf_segnalazione(p, c, cant, head, corpo, data, st_b)
    firme = Table([[Paragraph(f"Luogo e data: {escape(p.luogo.strip() or c.get('citta', '') or '__________')}, {escape(data)}", st_b), ""],
                   ["", ""], ["Firma del cliente", f"Per {cant}"], ["\n\n_____________________________", "\n\n_____________________________"]],
                  colWidths=[90 * mm, 90 * mm])
    firme.setStyle(TableStyle([("SPAN", (0, 0), (1, 0)), ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"), ("FONTSIZE", (0, 2), (-1, -1), 10)]))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title="Liberatoria potenziamento motore")
    doc.build([head, Spacer(1, 8 * mm), Paragraph("LIBERATORIA", st_t),
               Paragraph("Richiesta di modifica / potenziamento motore fuoribordo", st_st), Spacer(1, 6 * mm),
               tdati, Spacer(1, 6 * mm), *corpo, Spacer(1, 8 * mm), firme])
    buf.seek(0)
    return _risposta(buf, "Liberatoria_potenziamento", p.cliente)


def _risposta(buf, prefisso: str, cliente: str):
    nome = "".join(ch for ch in (cliente or "cliente") if ch.isalnum() or ch in " _-").strip().replace(" ", "_") or "cliente"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="{prefisso}_{nome}.pdf"', **_NO_CACHE})


def _pdf_segnalazione(p, c, cant, head, corpo, data, st_b):
    """Lettera di segnalazione al cliente: luogo/data, destinatario, dati motore, testo (nessuna firma del cliente)."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    st_r = ParagraphStyle("r", parent=st_b, alignment=2, spaceAfter=2)
    st_d = ParagraphStyle("d", parent=st_b, alignment=0, spaceAfter=1, leading=14)
    dest = [Paragraph("Spett.le", st_d), Paragraph(f"<b>{escape(p.cliente.strip() or 'Cliente')}</b>", st_d)]
    dest += [Paragraph(escape(x), st_d) for x in (p.indirizzo.strip(), f"Tel. {p.telefono.strip()}" if p.telefono.strip() else "") if x]
    tdest = Table([["", dest]], colWidths=[100 * mm, None])
    tdest.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    rif = [("Motore", p.motore), ("Matricola", p.matricola), ("Imbarcazione", p.imbarcazione)]
    rif = [(a, b.strip()) for a, b in rif if b.strip()]
    flow = [head, Spacer(1, 8 * mm), Paragraph(f"{escape(p.luogo.strip() or c.get('citta', '') or '')}{', ' if (p.luogo.strip() or c.get('citta')) else ''}{escape(data)}", st_r),
            Spacer(1, 4 * mm), tdest, Spacer(1, 8 * mm)]
    if rif:
        t = Table([[Paragraph(f"<b>{a}</b>", st_d), Paragraph(escape(b), st_d)] for a, b in rif], colWidths=[32 * mm, None])
        t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")), ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f1f5f9")),
                               ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3)]))
        if corpo and corpo[0].text.lower().startswith("<b>oggetto"):
            flow += [corpo.pop(0)]
        flow += [t, Spacer(1, 6 * mm)]
    flow += corpo
    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                      title="Segnalazione di non conformità del motore fuoribordo").build(flow)
    buf.seek(0)
    return _risposta(buf, "Segnalazione_non_conformita", p.cliente)
