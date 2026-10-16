"""Cantiere Nautico API — entrypoint FastAPI.

L'app è organizzata in moduli:
  · database.py       — client MongoDB, logger, TOTAL_POSTI
  · models.py         — modelli Pydantic (Cliente, Tariffe, Lavoro, Cantiere, ...)
  · helpers.py        — serialize, calcolo automatico dei costi, _euro
  · auth.py           — JWT auth + endpoints + seed_admin
  · pdf_builders.py   — costruttori PDF (preventivo, storico multi-anno)
  · routers/*.py      — un router per dominio (tariffe, clienti, lavori,
                        stats, export, cantiere, backup, preventivo,
                        report, anni)
"""
import os
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from database import client as mongo_client, db, logger
from auth import auth_router, seed_admin, get_current_user
from fastapi import Depends
from routers import (
    tariffe, clienti, lavori, stats, export,
    cantiere, backup, preventivo, report, anni, contratti, magazzino, tubolari, suzuki, gommoni, ddt,
    dipendenti, mobile, esterni, servizio, capitaneria, mezzi, aggiornamenti, calendario, assistente, unisci, anagrafica, officina,
)


app = FastAPI(title="Cantiere Nautico API")

api_router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])


@api_router.get("/")
async def root():
    return {"message": "Cantiere Nautico API - OK"}


# Aggrega tutti i router di dominio sotto /api
api_router.include_router(tariffe.router)
api_router.include_router(clienti.router)
api_router.include_router(anagrafica.router)
api_router.include_router(officina.router)
api_router.include_router(lavori.router)
api_router.include_router(stats.router)
api_router.include_router(export.router)
api_router.include_router(cantiere.router)
api_router.include_router(backup.router)
api_router.include_router(preventivo.router)
api_router.include_router(report.router)
api_router.include_router(anni.router)
api_router.include_router(contratti.router)
api_router.include_router(magazzino.router)
api_router.include_router(tubolari.router)
api_router.include_router(suzuki.router)
api_router.include_router(gommoni.router)
api_router.include_router(ddt.router)
api_router.include_router(dipendenti.router)
api_router.include_router(esterni.router)
api_router.include_router(servizio.router)
api_router.include_router(capitaneria.router)
api_router.include_router(mezzi.router)
api_router.include_router(aggiornamenti.router)
api_router.include_router(calendario.router)
api_router.include_router(assistente.router)
api_router.include_router(unisci.router)

app.include_router(api_router)
app.include_router(auth_router)
app.include_router(mobile.router)
app.include_router(assistente.mobile_router)
app.include_router(officina.mobile_router)
app.include_router(capitaneria.public_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        os.environ.get('FRONTEND_URL', 'http://localhost:3000'),
        'http://localhost:3000',
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    await db.users.create_index("email", unique=True)
    await officina.ensure_indexes()
    # TTL su token di reset password: MongoDB rimuove il documento allo scadere
    try:
        await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.password_reset_tokens.create_index("token", unique=True)
    except Exception as e:
        logger.warning(f"password_reset_tokens indexes skipped: {e}")
    # Indici magazzino
    try:
        await db.articoli.create_index("codice")
        await db.articoli.create_index("nome")
        await db.movimenti_magazzino.create_index("articolo_id")
        await db.movimenti_magazzino.create_index([("created_at", -1)])
    except Exception as e:
        logger.warning(f"magazzino indexes skipped: {e}")
    await seed_admin()
    try:
        await db.dipendenti.create_index("key_hash")
        await db.lavori_pending.create_index("client_uid", unique=True)
        await db.lavori_pending.create_index("stato")
    except Exception as e:
        logger.warning(f"dipendenti indexes skipped: {e}")
    # Migrazione: denormalizza lavori storico sulle schede cliente (costo_lavori)
    try:
        from routers.lavori import sync_lavori_cliente
        if await db.clienti.count_documents({"costo_lavori": {"$exists": False}}) > 0:
            for cid in await db.lavori.distinct("cliente_id"):
                await sync_lavori_cliente(cid)
            await db.clienti.update_many({"costo_lavori": {"$exists": False}}, {"$set": {"costo_lavori": 0.0, "lavori_storico": []}})
    except Exception as e:
        logger.warning(f"Migration costo_lavori skipped: {e}")
    # Migrazione iter13: scafo_sporco_attivo
    try:
        await db.clienti.update_many(
            {"scafo_sporco_attivo": {"$exists": False}, "costo_scafo_sporco": {"$gt": 0}},
            {"$set": {"scafo_sporco_attivo": True}},
        )
        await db.clienti.update_many(
            {"scafo_sporco_attivo": {"$exists": False}},
            {"$set": {"scafo_sporco_attivo": False}},
        )
    except Exception as e:
        logger.warning(f"Migration iter13 scafo_sporco_attivo skipped: {e}")
    # Migrazione iter14: copertura_attiva
    try:
        await db.clienti.update_many(
            {"copertura_attiva": {"$exists": False}, "costo_copertura": {"$gt": 0}},
            {"$set": {"copertura_attiva": True}},
        )
        await db.clienti.update_many(
            {"copertura_attiva": {"$exists": False}},
            {"$set": {"copertura_attiva": False}},
        )
    except Exception as e:
        logger.warning(f"Migration iter14 copertura_attiva skipped: {e}")
    # Migrazione iter20: alaggio_varo_attivo per sosta fuori/temporanea
    try:
        await db.clienti.update_many(
            {"alaggio_varo_attivo": {"$exists": False}, "tipo_sosta": {"$in": ["fuori", "temporanea"]}},
            {"$set": {"alaggio_varo_attivo": True}},
        )
        await db.clienti.update_many(
            {"alaggio_varo_attivo": {"$exists": False}},
            {"$set": {"alaggio_varo_attivo": False}},
        )
    except Exception as e:
        logger.warning(f"Migration iter20 alaggio_varo_attivo skipped: {e}")
    # Migrazione iter29: forza alaggio_varo_attivo=True su temporanea
    try:
        await db.clienti.update_many(
            {"tipo_sosta": "temporanea", "alaggio_varo_attivo": False},
            {"$set": {"alaggio_varo_attivo": True}},
        )
    except Exception as e:
        logger.warning(f"Migration iter29 temporanea→alaggio_varo skipped: {e}")


@app.on_event("shutdown")
async def _shutdown():
    mongo_client.close()
