"""PDF Allegato 1 – Comunicazione preventiva di alaggio/varo con mezzo autogrù (Capitaneria di porto)."""
import io
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

BLACK = colors.black
GREY = colors.HexColor("#444444")
LINE = colors.HexColor("#999999")


def _fmt_data(s: str) -> str:
    s = (s or "").strip()
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}/{s[5:7]}/{s[0:4]}"
    return s


def _box(on: bool) -> str:
    return "☒" if on else "☐"


def build_comunicazione_capitaneria_pdf(c: dict) -> bytes:
    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=14*mm, bottomMargin=14*mm,
                            title="Comunicazione preventiva alaggio/varo")
    st = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=st["Normal"], fontName="Helvetica", fontSize=9.2, leading=12.5, textColor=BLACK)
    small = ParagraphStyle("s", parent=body, fontSize=8, leading=10.5, textColor=GREY)
    center = ParagraphStyle("c", parent=body, alignment=1)
    title = ParagraphStyle("t", parent=body, fontName="Helvetica-Bold", fontSize=10.5, leading=14, alignment=1)
    sect = ParagraphStyle("sec", parent=body, fontName="Helvetica-Bold", fontSize=10, alignment=1, spaceBefore=6, spaceAfter=3)
    letter = ParagraphStyle("l", parent=body, fontName="Helvetica-Bold", fontSize=10)

    def V(x):
        return f"<u><b>{escape(str(x or '').strip()) or '&nbsp;' * 12}</b></u>"

    ordinanza = c.get("ordinanza") or "Ordinanza n. 61/2023, in data 03/08/2023 della Capitaneria di porto di Portoferraio"
    porto = c.get("porto") or "marina_di_campo"
    ulm = c.get("ufficio_locale_marittimo") or ""
    deleg = c.get("delegazione_spiaggia") or ""
    porto_nome = c.get("porto_nome") or ("Marina di Campo" if porto == "marina_di_campo" else "Marciana Marina")

    e = []
    e.append(Paragraph(escape(ordinanza), small))
    e.append(Paragraph("Allegato 1 – Comunicazione preventiva di alaggio/varo con mezzo autogrù", title))
    e.append(Spacer(1, 4*mm))
    e.append(Paragraph("Alla Capitaneria di porto di Portoferraio", ParagraphStyle("r", parent=body, alignment=2, fontName="Helvetica-Bold")))
    e.append(Paragraph(f"Ufficio Locale Marittimo di {V(ulm) if ulm else '_______________________'}", ParagraphStyle("r2", parent=body, alignment=2)))
    e.append(Paragraph(f"Delegazione di Spiaggia {V(deleg) if deleg else '_______________________'}", ParagraphStyle("r3", parent=body, alignment=2)))
    e.append(Spacer(1, 4*mm))

    def sec(lett, txt):
        t = Table([[Paragraph(lett, letter), Paragraph(txt, body)]], colWidths=[8*mm, 166*mm])
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
        e.append(t)

    sec("A", f"Il sottoscritto {V(c.get('dichiarante'))} in qualità di rappresentante legale della {V(c.get('ditta'))}, "
             f"con sede in {V(c.get('ditta_sede'))} alla via {V(c.get('ditta_via'))}, società censita, ai sensi dell'articolo 68 del Codice "
             f"della Navigazione, all'effettuazione delle operazioni di alaggio/varo unità navali nel porto di {V(porto_nome)}")
    e.append(Paragraph("RIFERISCE", sect))
    op_al, op_va = bool(c.get("alaggio")), bool(c.get("varo"))
    sec("B", f"Che il giorno {V(_fmt_data(c.get('data_operazione')))} alle ore {V(c.get('ora_operazione'))} saranno effettuate le operazioni di "
             f"&nbsp;{_box(op_al)} alaggio &nbsp;&nbsp; {_box(op_va)} varo &nbsp; della seguente unità navale, presso il porto di {V(porto_nome)}")
    uso = c.get("uso") or "diporto"
    tipo = c.get("tipo_unita") or "natante"
    sec("C", f"{_box(uso == 'diporto')} diporto &nbsp;&nbsp;&nbsp; {_box(uso == 'pesca')} pesca professionale<br/>"
             f"{_box(tipo == 'natante')} natante &nbsp;&nbsp;&nbsp; {_box(tipo == 'imbarcazione')} imbarcazione")
    e.append(Spacer(1, 2*mm))
    hdr = ParagraphStyle("h", parent=small, fontName="Helvetica-Bold")
    rows = [[Paragraph("D", letter), Paragraph("nome", hdr), Paragraph("n° d'iscrizione", hdr), Paragraph("nominativo internazionale", hdr)],
            ["", Paragraph(V(c.get("unita_nome")), body), Paragraph(V(c.get("unita_iscrizione")), body), Paragraph(V(c.get("unita_nominativo")), body)],
            ["", Paragraph("lunghezza", hdr), Paragraph("pescaggio", hdr), Paragraph("larghezza", hdr)],
            ["", Paragraph(V(c.get("unita_lunghezza")), body), Paragraph(V(c.get("unita_pescaggio")), body), Paragraph(V(c.get("unita_larghezza")), body)]]
    t = Table(rows, colWidths=[8*mm, 55*mm, 55*mm, 56*mm])
    t.setStyle(TableStyle([("GRID", (1, 0), (-1, -1), 0.4, LINE), ("LEFTPADDING", (0, 0), (0, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    e.append(t)
    e.append(Paragraph("DICHIARA", sect))
    sec("E", "Il responsabile delle operazioni sul posto è il/la Sig./Sig.ra:")
    rows = [["", Paragraph("nome", hdr), Paragraph("cognome", hdr), Paragraph("nato/a a", hdr), Paragraph("il", hdr)],
            ["", Paragraph(V(c.get("resp_nome")), body), Paragraph(V(c.get("resp_cognome")), body), Paragraph(V(c.get("resp_nato_a")), body), Paragraph(V(_fmt_data(c.get("resp_nato_il"))), body)],
            ["", Paragraph("qualifica", hdr), Paragraph("n° cellulare", hdr), "", ""],
            ["", Paragraph(V(c.get("resp_qualifica")), body), Paragraph(V(c.get("resp_cellulare")), body), "", ""]]
    t = Table(rows, colWidths=[8*mm, 41.5*mm, 41.5*mm, 41.5*mm, 41.5*mm])
    t.setStyle(TableStyle([("GRID", (1, 0), (-1, 1), 0.4, LINE), ("GRID", (1, 2), (2, 3), 0.4, LINE), ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 2)]))
    e.append(t)
    e.append(Spacer(1, 2*mm))
    sec("F", "L'operazione di alaggio/varo sarà effettuata con idoneo mezzo ed attrezzature di sollevamento in relazione al rapporto tra "
             "dislocamento dell'unità navale e la portata della gru; di porre in essere ogni possibile cautela affinché non si verifichino danni "
             "alla banchina ed infrastrutture portuali in genere; il personale addetto all'impiego del mezzo di sollevamento è competente, "
             "qualificato ed informato su quanto previsto dalla normativa in materia di sicurezza ed igiene sui luoghi di lavoro; che la ditta è "
             "autorizzata ad operare in base alle vigenti disposizioni in materia; nel caso la banchina fosse già interessata da altre attività, "
             "lo scrivente darà inizio all'alaggio/varo soltanto dopo che siano ultimate le altre operazioni.")
    e.append(Spacer(1, 2*mm))
    e.append(Paragraph("La sottoscrizione della presente comunicazione implica l'assunzione dell'onere di:", body))
    e.append(Paragraph(f"• conoscere e rispettare le prescrizioni contenute nell'{escape(ordinanza)};", body))
    e.append(Paragraph("• manlevare l'Amministrazione marittima dalla responsabilità per qualsiasi danno possa occorrere alle persone e/o cose "
                       "e/o all'ambiente dalle operazioni di cui alla presente.", body))
    e.append(Spacer(1, 10*mm))
    firma = Table([[Paragraph(V(c.get("firma_localita")), center), Paragraph(V(_fmt_data(c.get("firma_data"))), center), Paragraph(f"<b>{escape(c.get('ditta') or '')}</b>", center)],
                   [Paragraph("(località)", small), Paragraph("(data)", small), Paragraph("timbro e firma", small)]],
                  colWidths=[55*mm, 45*mm, 74*mm])
    firma.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("LINEABOVE", (2, 1), (2, 1), 0.6, BLACK), ("TOPPADDING", (0, 1), (-1, 1), 8)]))
    e.append(firma)
    pdf.build(e)
    return buf.getvalue()
