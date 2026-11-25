"""Blocco accessi: dopo MAX_TENTATIVI password o PIN errati l'accesso con quel metodo resta bloccato per 1 ora.

Stato in app_settings id=blocco_accessi (locale a ogni installazione, non sincronizzato).
Il recupero con codice via email o impronta sblocca subito.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from database import db, logger

MAX_TENTATIVI = 20
DURATA = timedelta(hours=1)
DOC = "blocco_accessi"
NOMI = {"password": "password", "pin": "PIN di recupero"}


def _ora(dt: datetime) -> str:
    return dt.astimezone(ZoneInfo("Europe/Rome")).strftime("%H:%M")


def _utc(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _msg_blocco(tipo: str, fino: datetime) -> str:
    return (f"Troppi tentativi errati ({MAX_TENTATIVI}): accesso con {NOMI[tipo]} bloccato fino alle {_ora(fino)}. "
            "Puoi sbloccarlo subito con il codice via email da «Password dimenticata».")


async def _stato(tipo: str) -> dict:
    d = await db.app_settings.find_one({"id": DOC}, {"_id": 0, tipo: 1}) or {}
    return d.get(tipo) or {}


async def controlla(tipo: str):
    fino = (await _stato(tipo)).get("fino")
    if isinstance(fino, datetime) and _utc(fino) > datetime.now(timezone.utc):
        raise HTTPException(429, _msg_blocco(tipo, _utc(fino)))


async def errore(tipo: str, messaggio: str):
    """Registra un tentativo errato e solleva l'errore (con tentativi rimasti o blocco)."""
    errori = int((await _stato(tipo)).get("errori") or 0) + 1
    if errori >= MAX_TENTATIVI:
        fino = datetime.now(timezone.utc) + DURATA
        await db.app_settings.update_one({"id": DOC}, {"$set": {tipo: {"errori": 0, "fino": fino}}}, upsert=True)
        logger.warning(f"Blocco accessi: {MAX_TENTATIVI} tentativi errati ({tipo}), bloccato fino alle {_ora(fino)}")
        asyncio.create_task(_avvisa(tipo, fino))
        raise HTTPException(429, _msg_blocco(tipo, fino))
    await db.app_settings.update_one({"id": DOC}, {"$set": {f"{tipo}.errori": errori}}, upsert=True)
    rimasti = MAX_TENTATIVI - errori
    raise HTTPException(401, f"{messaggio}. Tentativi rimasti: {rimasti} su {MAX_TENTATIVI}" if rimasti <= 10 else messaggio)


async def ok(*tipi: str):
    await db.app_settings.update_one({"id": DOC}, {"$unset": {t: "" for t in tipi}}, upsert=True)


async def sblocca_tutto():
    await ok(*NOMI)


async def _avvisa(tipo: str, fino: datetime):
    try:
        from auth import _email_amministratore
        from email_service import build_alert_blocco_email, send_email
        to = await _email_amministratore()
        if not to:
            return
        subject, html = build_alert_blocco_email(NOMI[tipo], MAX_TENTATIVI, datetime.now(timezone.utc).astimezone(ZoneInfo("Europe/Rome")).strftime("%d/%m/%Y %H:%M"), _ora(fino))
        await send_email(to=to, subject=subject, html=html, fallback_proxy=True)
    except Exception as e:  # noqa: BLE001
        logger.error(f"Avviso blocco accessi non inviato: {str(e)[:150]}")
