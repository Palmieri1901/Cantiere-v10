"""PDF Allegato 1 – Comunicazione preventiva alaggio/varo: rendering fedele del modulo ufficiale (template ODS)."""
import io
import os
import re
import base64
from functools import lru_cache
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from odf.opendocument import load
from odf.table import Table, TableRow, TableColumn
from odf.text import P
from odf.namespaces import TABLENS

TEMPLATE = os.path.join(os.path.dirname(__file__), "templates", "comunicazione_capitaneria.ods")
NCOLS = 15


def _cm(v: str) -> float:
    v = (v or "0cm").strip()
    if v.endswith("cm"):
        return float(v[:-2]) * cm
    if v.endswith("mm"):
        return float(v[:-2]) * cm / 10
    if v.endswith("pt"):
        return float(v[:-2])
    return float(v)


def _parse_styles(xml: str) -> dict:
    out = {}
    for m in re.finditer(r'<style:style style:name="(ce\d+)"([^>]*)>(.*?)</style:style>', xml, re.S):
        name, head, body = m.groups()
        parent = re.search(r'style:parent-style-name="([^"]*)"', head)
        st = {"size": 10.0, "bold": False, "align": None, "bg": None, "border": {}}
        g = lambda a: (re.search(a + r'="([^"]*)"', body) or [None, None])[1]
        if g("fo:font-size"):
            st["size"] = float(g("fo:font-size").replace("pt", ""))
        if g("fo:font-weight") == "bold":
            st["bold"] = True
        if g("fo:text-align"):
            st["align"] = g("fo:text-align")
        bg = g("fo:background-color")
        if bg and bg != "transparent":
            st["bg"] = colors.HexColor(bg)
        allb = g("fo:border")
        for side in ("top", "bottom", "left", "right"):
            b = g(f"fo:border-{side}") or allb
            if b and b != "none":
                w = float(b.split()[0].replace("pt", ""))
                st["border"][side] = (w, "double" in b)
        out[name] = st
    return out


@lru_cache(maxsize=1)
def _load_template():
    doc = load(TEMPLATE)
    xml = doc.contentxml().decode("utf8")
    styles = _parse_styles(xml)
    col_w = {m.group(1): _cm(m.group(2)) for m in re.finditer(r'style:name="(co\d+)"[^>]*>\s*<style:table-column-properties[^>]*style:column-width="([^"]*)"', xml)}
    row_h = {m.group(1): _cm(m.group(2)) for m in re.finditer(r'style:name="(ro\d+)"[^>]*>\s*<style:table-row-properties[^>]*style:row-height="([^"]*)"', xml)}
    t = doc.spreadsheet.getElementsByType(Table)[0]
    cols = []
    for c in t.getElementsByType(TableColumn):
        cols += [col_w.get(c.getAttrNS(TABLENS, "style-name"), 0.5 * cm)] * int(c.getAttrNS(TABLENS, "number-columns-repeated") or 1)
    cols = cols[:NCOLS]
    rows, cells = [], []
    r = 0
    for row in t.getElementsByType(TableRow):
        rep = int(row.getAttrNS(TABLENS, "number-rows-repeated") or 1)
        if r >= 56:
            break
        h = row_h.get(row.getAttrNS(TABLENS, "style-name"), 0.45 * cm)
        for _ in range(rep):
            rows.append(h)
        c = 0
        for cell in row.childNodes:
            kind = cell.qname[1]
            if kind not in ("table-cell", "covered-table-cell"):
                continue
            crep = int(cell.getAttrNS(TABLENS, "number-columns-repeated") or 1)
            if kind == "table-cell" and c < NCOLS:
                txt = "\n".join(str(p) for p in cell.getElementsByType(P))
                st = cell.getAttrNS(TABLENS, "style-name")
                cs = int(cell.getAttrNS(TABLENS, "number-columns-spanned") or 1)
                rs = int(cell.getAttrNS(TABLENS, "number-rows-spanned") or 1)
                for k in range(crep):
                    if c + k < NCOLS:
                        cells.append((r, c + k, st, cs, rs, txt))
            c += crep
        r += rep
    return cols, rows, cells, styles


def _fmt_data(s: str, short=True) -> str:
    s = (s or "").strip()
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return f"{s[8:10]}/{s[5:7]}/{s[2:4] if short else s[0:4]}"
    return s


def _overrides(c: dict) -> dict:
    ordinanza = (c.get("ordinanza") or "").strip() or "Ordinanza n. 61/2023, in data 03/08/2023 della Capitaneria di porto di Portoferraio"
    porto_nome = c.get("porto_nome") or ("Marina di Campo" if (c.get("porto") or "marina_di_campo") == "marina_di_campo" else "Marciana Marina")
    x = lambda on: "x" if on else ""
    uso = c.get("uso") or "diporto"
    tipo = c.get("tipo_unita") or "natante"
    return {
        (1, 3): " " + ordinanza,
        (5, 14): c.get("ufficio_locale_marittimo") or "",
        (6, 14): c.get("delegazione_spiaggia") or "",
        (8, 6): c.get("dichiarante") or "", (9, 6): c.get("ditta") or "",
        (10, 1): c.get("ditta_sede") or "", (10, 11): c.get("ditta_via") or "",
        (12, 10): porto_nome, (18, 10): porto_nome,
        (16, 6): _fmt_data(c.get("data_operazione")), (16, 10): c.get("ora_operazione") or "",
        (17, 5): x(c.get("alaggio")), (17, 12): x(c.get("varo")),
        (20, 5): x(uso == "diporto"), (20, 12): x(uso == "pesca"),
        (22, 2): x(tipo == "natante"), (22, 7): x(tipo == "imbarcazione"),
        (24, 1): c.get("unita_nome") or "", (24, 9): c.get("unita_iscrizione") or "", (24, 13): c.get("unita_nominativo") or "",
        (26, 1): c.get("unita_lunghezza") or "", (26, 9): c.get("unita_pescaggio") or "", (26, 13): c.get("unita_larghezza") or "",
        (32, 1): c.get("resp_nome") or "", (32, 11): c.get("resp_cognome") or "",
        (34, 1): c.get("resp_nato_a") or "", (34, 11): _fmt_data(c.get("resp_nato_il")),
        (36, 1): c.get("resp_qualifica") or "", (36, 11): c.get("resp_cellulare") or "",
        (49, 0): f"conoscere e rispettare le prescrizioni contenute nell'{ordinanza.split(' della ')[0]};",
        (53, 1): c.get("firma_localita") or "", (53, 9): _fmt_data(c.get("firma_data")),
        (54, 13): c.get("ditta") or "",
    }


def _draw_header(cv, cantiere: dict, x0: float, y_top: float, width: float) -> float:
    """Logo + dati azienda sopra il modulo. Ritorna l'altezza usata."""
    h = 2.0 * cm
    logo = cantiere.get("logo_base64") or ""
    tx = x0
    if logo and "," in logo:
        try:
            img = ImageReader(io.BytesIO(base64.b64decode(logo.split(",", 1)[1])))
            iw, ih = img.getSize()
            lw, lh = 4.2 * cm, 1.7 * cm
            sc = min(lw / iw, lh / ih)
            cv.drawImage(img, x0, y_top - 0.15 * cm - ih * sc, iw * sc, ih * sc, mask="auto", preserveAspectRatio=True)
            tx = x0 + iw * sc + 0.4 * cm
        except Exception:
            pass
    nome = (cantiere.get("nome") or "").strip()
    parts = [x for x in [cantiere.get("indirizzo"), " ".join(filter(None, [cantiere.get("cap"), cantiere.get("citta"), cantiere.get("provincia") and f"({cantiere.get('provincia')})"])),
                         cantiere.get("telefono") and f"Tel. {cantiere.get('telefono')}", cantiere.get("email"), cantiere.get("piva") and f"P.IVA {cantiere.get('piva')}"] if x]
    if nome:
        cv.setFont("Helvetica-Bold", 11)
        cv.drawString(tx, y_top - 0.6 * cm, nome)
    cv.setFont("Helvetica", 7.5)
    cv.setFillColor(colors.HexColor("#444444"))
    y = y_top - 0.95 * cm
    for line in (" · ".join(parts[:2]), " · ".join(parts[2:])):
        if line:
            cv.drawString(tx, y, line)
            y -= 0.33 * cm
    cv.setFillColor(colors.black)
    cv.setLineWidth(0.5)
    cv.line(x0, y_top - h + 0.25 * cm, x0 + width, y_top - h + 0.25 * cm)
    return h


def build_comunicazione_capitaneria_pdf(c: dict, cantiere: dict | None = None) -> bytes:
    cols, rows, cells, styles = _load_template()
    ov = _overrides(c)
    W, H = A4
    total_w = sum(cols)
    x0 = (W - total_w) / 2
    buf = io.BytesIO()
    cv = canvas.Canvas(buf, pagesize=A4)
    cv.setTitle("Comunicazione preventiva alaggio/varo")
    y_top = H - 1.0 * cm
    if cantiere:
        y_top -= _draw_header(cv, cantiere, x0, y_top, total_w)
    total_h = sum(rows)
    scale = min(1.0, (y_top - 0.8 * cm) / total_h)
    xs = [x0]
    for w in cols:
        xs.append(xs[-1] + w)
    ys = [y_top]
    for h in rows:
        ys.append(ys[-1] - h * scale)

    texts = {}
    for (r, col, stname, cs, rs, txt) in cells:
        t = ov.get((r, col), txt) if (r, col) in ov else txt
        if t:
            texts[(r, col)] = t
    occupied = set()
    for (r, col, stname, cs, rs, txt) in cells:
        for rr in range(r, r + rs):
            for cc in range(col, col + cs):
                if (rr, cc) != (r, col):
                    occupied.add((rr, cc))

    for (r, col, stname, cs, rs, txt) in cells:
        st = styles.get(stname) or {"size": 10.0, "bold": False, "align": None, "bg": None, "border": {}}
        c2 = min(col + cs, NCOLS)
        r2 = min(r + rs, len(rows))
        left, right = xs[col], xs[c2]
        top, bottom = ys[r], ys[r2]
        if st["bg"]:
            cv.setFillColor(st["bg"])
            cv.rect(left, bottom, right - left, top - bottom, stroke=0, fill=1)
        cv.setStrokeColor(colors.black)
        for side, (w, double) in st["border"].items():
            cv.setLineWidth(max(0.5, min(w, 1.2)))
            seg = {"top": (left, top, right, top), "bottom": (left, bottom, right, bottom), "left": (left, bottom, left, top), "right": (right, bottom, right, top)}[side]
            cv.line(*seg)
            if double:
                cv.line(seg[0], seg[1] - 2, seg[2], seg[3] - 2)
        text = texts.get((r, col), "")
        if not text:
            continue
        size = st["size"] * scale
        font = "Helvetica-Bold" if st["bold"] else "Helvetica"
        # overflow nelle celle vuote adiacenti (come nel foglio di calcolo)
        ext = c2
        if cs == 1 and st["align"] != "center":
            while ext < NCOLS and (r, ext) not in texts and (r, ext) not in occupied:
                ext += 1
        avail = xs[ext] - left - 3
        while size > 5.5 and cv.stringWidth(text, font, size) > avail:
            size -= 0.25
        cv.setFont(font, size)
        cv.setFillColor(colors.black)
        ty = bottom + (top - bottom - size * 0.72) / 2
        if st["align"] == "center":
            cv.drawCentredString((left + right) / 2, ty, text)
        else:
            cv.drawString(left + 1.5, ty, text)
    cv.showPage()
    cv.save()
    return buf.getvalue()
