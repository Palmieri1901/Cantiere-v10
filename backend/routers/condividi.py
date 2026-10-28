"""Condivisione PDF via link pubblico temporaneo (per WhatsApp)."""
import io
import os
import secrets
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

from database import db

router = APIRouter(prefix="/condividi")
public_router = APIRouter()
GIORNI_VALIDITA = 30


def _bucket() -> AsyncIOMotorGridFSBucket:
    return AsyncIOMotorGridFSBucket(db, bucket_name="pdf_condivisi")


def _base_url(request: Request) -> str:
    env = os.environ.get("FRONTEND_URL", "").rstrip("/")
    return env if env and "localhost" not in env else str(request.base_url).rstrip("/")


@router.post("/pdf")
async def condividi_pdf(request: Request, file: UploadFile = File(...), filename: str = Form("")):
    data = await file.read()
    if data[:4] != b"%PDF":
        raise HTTPException(400, "Il file deve essere un PDF")
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(400, "PDF troppo grande (max 25 MB)")
    nome = (filename or file.filename or "documento.pdf").replace('"', "").strip() or "documento.pdf"
    if not nome.lower().endswith(".pdf"):
        nome += ".pdf"
    token = secrets.token_urlsafe(16)
    scad = datetime.now(timezone.utc) + timedelta(days=GIORNI_VALIDITA)
    fid = await _bucket().upload_from_stream(nome, data, metadata={"token": token, "scadenza": scad.isoformat()})
    await db.pdf_condivisi.insert_one({"token": token, "file_id": str(fid), "nome": nome, "scadenza": scad.isoformat(), "created_at": datetime.now(timezone.utc).isoformat()})
    return {"token": token, "url": f"{_base_url(request)}/api/condividi/{token}.pdf", "scadenza": scad.isoformat(), "nome": nome}


@public_router.get("/api/condividi/{token}.pdf")
async def scarica_condiviso(token: str):
    doc = await db.pdf_condivisi.find_one({"token": token}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Link non valido")
    if doc["scadenza"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(410, "Link scaduto")
    try:
        stream = await _bucket().open_download_stream(ObjectId(doc["file_id"]))
        data = await stream.read()
    except Exception:
        raise HTTPException(404, "File non trovato")
    return StreamingResponse(io.BytesIO(data), media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{doc["nome"]}"'})
