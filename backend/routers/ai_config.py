"""Configurazione del modello AI dalla pagina Impostazioni (senza toccare i Secrets)."""
import os

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ai_client import MODELLI_GEMINI, MODELLO_EMERGENT, chiavi, get_ai_config, stato_ai, vision
from database import db

router = APIRouter(prefix="/ai")


class AiConfigIn(BaseModel):
    modello_gemini: str = ""
    preferisci_emergent: bool = False


class ChiaveIn(BaseModel):
    gemini_api_key: str = ""


async def _modelli_disponibili(api_key: str) -> list[str]:
    try:
        async with httpx.AsyncClient(timeout=15) as cl:
            r = await cl.get("https://generativelanguage.googleapis.com/v1beta/models", params={"key": api_key, "pageSize": 200})
        if r.status_code != 200:
            return MODELLI_GEMINI
        nomi = [m["name"].split("/")[-1] for m in r.json().get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
        flash = sorted({n for n in nomi if "flash" in n and "image" not in n and "tts" not in n and "live" not in n}, reverse=True)
        return flash or MODELLI_GEMINI
    except httpx.HTTPError:
        return MODELLI_GEMINI


@router.get("/config")
async def ai_config():
    gemini_key, emergent_key = await chiavi()
    cfg = await get_ai_config()
    attivo = "emergent" if emergent_key and (cfg["preferisci_emergent"] or not gemini_key) else ("gemini" if gemini_key else "")
    return {
        **cfg,
        "gemini_key_presente": bool(gemini_key),
        "gemini_key_da_app": bool(gemini_key) and not os.environ.get("GEMINI_API_KEY", "").strip(),
        "emergent_key_presente": bool(emergent_key),
        "provider_attivo": attivo,
        "modello_attivo": MODELLO_EMERGENT if attivo == "emergent" else (cfg["modello_gemini"] if attivo == "gemini" else ""),
        "modello_emergent": MODELLO_EMERGENT,
        "modelli_gemini": await _modelli_disponibili(gemini_key) if gemini_key else MODELLI_GEMINI,
        "stato": stato_ai,
    }


@router.put("/config")
async def salva_ai_config(p: AiConfigIn):
    modello = p.modello_gemini.strip()
    if modello and not modello.startswith("gemini-"):
        raise HTTPException(400, "Nome modello non valido: deve iniziare con 'gemini-'")
    await db.app_settings.update_one({"id": "ai_config"}, {"$set": {"modello_gemini": modello, "preferisci_emergent": p.preferisci_emergent}}, upsert=True)
    return await ai_config()


@router.put("/chiave")
async def salva_chiave(p: ChiaveIn):
    """Chiave Gemini inserita dall'app (locale a questa installazione, mai mostrata né sincronizzata)."""
    k = p.gemini_api_key.strip()
    if k:
        try:
            async with httpx.AsyncClient(timeout=15) as cl:
                r = await cl.get("https://generativelanguage.googleapis.com/v1beta/models", params={"key": k, "pageSize": 1})
        except httpx.HTTPError:
            raise HTTPException(502, "Impossibile verificare la chiave: controlla la connessione internet")
        if r.status_code != 200:
            raise HTTPException(400, "Chiave Gemini non valida: copiala di nuovo da aistudio.google.com")
        await db.app_settings.update_one({"id": "ai_chiavi"}, {"$set": {"gemini_api_key": k}}, upsert=True)
    else:
        await db.app_settings.delete_one({"id": "ai_chiavi"})
    return await ai_config()


@router.post("/test")
async def test_ai():
    """Prova rapida: chiede al modello attivo di rispondere OK e riporta provider/modello usati."""
    r = await vision("Rispondi solo con il testo richiesto.", "Scrivi esattamente la parola OK", [])
    return {"ok": "OK" in r.upper(), "risposta": r.strip()[:40], "provider": stato_ai["ultimo_provider"], "modello": stato_ai["ultimo_modello"]}
