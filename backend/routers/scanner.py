"""Scanner documenti: timbro/firma salvato e composizione PDF dalle pagine fotografate."""
import base64
import io
from typing import List

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db

router = APIRouter(prefix="/scanner", tags=["scanner"])
DOC = "scanner_timbro"


class TimbroIn(BaseModel):
    immagine: str = ""


class Timbro(BaseModel):
    x: float
    y: float
    w: float


class Pagina(BaseModel):
    img: str
    timbri: List[Timbro] = []


class ScanIn(BaseModel):
    pagine: List[Pagina]
    nome: str = "Documento"


def _bytes(data_url: str) -> bytes:
    try:
        return base64.b64decode(data_url.split(",", 1)[-1])
    except Exception:  # noqa: BLE001
        raise HTTPException(400, "Immagine non valida")


@router.get("/timbro")
async def get_timbro():
    d = await db.app_settings.find_one({"id": DOC}, {"_id": 0}) or {}
    return {"immagine": d.get("immagine", "")}


@router.put("/timbro")
async def put_timbro(p: TimbroIn):
    if p.immagine and not p.immagine.startswith("data:image/"):
        raise HTTPException(400, "Immagine non valida")
    if len(p.immagine) > 3_000_000:
        raise HTTPException(400, "Immagine troppo grande")
    await db.app_settings.update_one({"id": DOC}, {"$set": {"immagine": p.immagine}}, upsert=True)
    return {"immagine": p.immagine}


@router.post("/pdf")
async def scan_pdf(p: ScanIn):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas

    if not p.pagine:
        raise HTTPException(400, "Nessuna pagina")
    timbro = None
    if any(pg.timbri for pg in p.pagine):
        t = (await db.app_settings.find_one({"id": DOC}, {"_id": 0}) or {}).get("immagine")
        if not t:
            raise HTTPException(400, "Nessun timbro/firma salvato")
        timbro = ImageReader(io.BytesIO(_bytes(t)))
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(p.nome or "Documento")
    for pg in p.pagine:
        img = ImageReader(io.BytesIO(_bytes(pg.img)))
        iw, ih = img.getSize()
        size = landscape(A4) if iw > ih else A4
        c.setPageSize(size)
        pw, ph = size
        s = min(pw / iw, ph / ih)
        dw, dh = iw * s, ih * s
        ox, oy = (pw - dw) / 2, (ph - dh) / 2
        c.drawImage(img, ox, oy, dw, dh)
        for tb in pg.timbri:
            tw, th = timbro.getSize()
            w = max(0.03, min(tb.w, 1)) * dw
            h = w * th / tw
            c.drawImage(timbro, ox + tb.x * dw, oy + dh - tb.y * dh - h, w, h, mask="auto")
        c.showPage()
    c.save()
    buf.seek(0)
    nome = "".join(ch for ch in (p.nome or "Documento") if ch.isalnum() or ch in " _-").strip().replace(" ", "_") or "Documento"
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{nome}.pdf"'})
