"""Condivisione PDF via link pubblico temporaneo (per WhatsApp)."""
import io
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket
from bson import ObjectId

from database import db

router = APIRouter(prefix="/condividi")
public_router = APIRouter()
GIORNI_VALIDITA = 30


def _bucket():
    return AsyncIOMotorGridFSBucket(db, bucket_name="share_pdf")


@router.post("/pdf")
async def carica_pdf(request: Request, file: UploadFile = File(...), filename: str = Form("documento.pdf")):
    data = await file.read()
    if not data[:5] == b"%PDF-":
        raise HTTPException(400, "Il file non è un PDF")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(400, "PDF troppo grande (max 25 MB)")
    token = secrets.token_urlsafe(18)
    fid = await _bucket().upload_from_stream(filename, data, metadata={"token": token})
    await db.share_pdf.insert_one({"token": token, "file_id": str(fid), "filename": filename, "created_at": datetime.now(timezone.utc).isoformat(),
                                   "expires_at": (datetime.now(timezone.utc) + timedelta(days=GIORNI_VALIDITA)).isoformat()})
    base = str(request.base_url).rstrip("/")
    fwd = request.headers.get("x-forwarded-host")
    if fwd:
        base = f"{request.headers.get('x-forwarded-proto', 'https')}://{fwd}"
    return {"token": token, "url": f"{base}/api/condividi/{token}.pdf", "valido_fino": GIORNI_VALIDITA}


@public_router.get("/api/condividi/{token}.pdf")
async def scarica_pdf(token: str):
    doc = await db.share_pdf.find_one({"token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Link non valido o scaduto")
    if doc.get("expires_at") and doc["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(410, "Link scaduto")
    try:
        stream = await _bucket().open_download_stream(ObjectId(doc["file_id"]))
        data = await stream.read()
    except Exception:
        raise HTTPException(404, "File non trovato")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{doc.get("filename", "documento.pdf")}"'})
