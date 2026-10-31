"""Client AI vision indipendente dal provider.

Priorità: GEMINI_API_KEY (Google Gemini diretto, nessuna dipendenza esterna) →
EMERGENT_LLM_KEY (solo se presente, retro-compatibilità con l'ambiente Emergent).
"""
import os
import asyncio
from typing import List
import httpx
from fastapi import HTTPException

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


def _clean(b64: str) -> str:
    return b64.split(",", 1)[-1] if "," in b64 else b64


def _mime(b64: str) -> str:
    head = b64[:12]
    if head.startswith("JVBER"):
        return "application/pdf"
    if head.startswith("iVBOR"):
        return "image/png"
    if head.startswith("UklGR"):
        return "image/webp"
    return "image/jpeg"


async def _gemini_direct(api_key: str, system: str, prompt: str, images: List[str]) -> str:
    primario = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
    # In caso di 503/429/404 (modello sovraccarico o non più disponibile) riprova e poi passa a modelli alternativi
    modelli = [primario] + [m for m in ("gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash") if m != primario]
    parts = [{"text": prompt}] + [{"inline_data": {"mime_type": _mime(i), "data": i}} for i in images]
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": parts}],
    }
    ultimo = None
    async with httpx.AsyncClient(timeout=180) as client:
        for model in modelli:
            for tentativo in range(3):
                try:
                    r = await client.post(GEMINI_URL.format(model=model), params={"key": api_key}, json=body)
                except httpx.HTTPError as e:
                    ultimo = f"rete: {e}"
                    await asyncio.sleep(1.5 * (tentativo + 1))
                    continue
                if r.status_code == 200:
                    break
                ultimo = f"{r.status_code}: {r.text[:200]}"
                if r.status_code in (404, 400) and "model" in r.text.lower():
                    break  # modello non disponibile → passa al successivo
                if r.status_code in (503, 429, 500):
                    await asyncio.sleep(2 * (tentativo + 1))
                    continue
                raise HTTPException(502, f"Errore Gemini ({r.status_code}): {r.text[:200]}")
            else:
                continue  # modello esaurito i tentativi → prova il successivo
            if r.status_code != 200:
                continue
            break
        else:
            raise HTTPException(503, f"Il servizio AI è momentaneamente sovraccarico su tutti i modelli disponibili. Riprova tra qualche minuto. (ultimo errore {ultimo})")
    data = r.json()
    try:
        return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
    except (KeyError, IndexError):
        return ""


async def _emergent(api_key: str, system: str, prompt: str, images: List[str]) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent, TextDelta, StreamDone
    from datetime import datetime
    chat = LlmChat(api_key=api_key, session_id=f"vision-{datetime.now().timestamp()}", system_message=system).with_model("gemini", "gemini-3-flash-preview")
    msg = UserMessage(text=prompt, file_contents=[ImageContent(image_base64=i) for i in images])
    chunks: List[str] = []
    async for ev in chat.stream_message(msg):
        if isinstance(ev, TextDelta):
            chunks.append(ev.content)
        elif isinstance(ev, StreamDone):
            break
    return "".join(chunks)


async def vision(system: str, prompt: str, images_b64: List[str]) -> str:
    """Analizza una o più immagini/PDF (base64) e restituisce il testo prodotto dal modello."""
    images = [_clean(i) for i in images_b64 if i]
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        return await _gemini_direct(gemini_key, system, prompt, images)
    emergent_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if emergent_key:
        return await _emergent(emergent_key, system, prompt, images)
    raise HTTPException(500, "Nessuna chiave AI configurata sul server: imposta GEMINI_API_KEY (o EMERGENT_LLM_KEY) nel file .env del backend e riavvia")


async def testo(system: str, prompt: str) -> str:
    """Generazione testo: Claude Sonnet 5 via chiave Emergent, altrimenti Gemini diretto."""
    emergent_key = os.environ.get("EMERGENT_LLM_KEY", "").strip()
    if emergent_key:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
        from datetime import datetime
        chat = LlmChat(api_key=emergent_key, session_id=f"hall-{datetime.now().timestamp()}", system_message=system).with_model("anthropic", "claude-sonnet-5")
        chunks: List[str] = []
        async for ev in chat.stream_message(UserMessage(text=prompt)):
            if isinstance(ev, TextDelta):
                chunks.append(ev.content)
            elif isinstance(ev, StreamDone):
                break
        return "".join(chunks)
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        return await _gemini_direct(gemini_key, system, prompt, [])
    raise HTTPException(500, "Nessuna chiave AI configurata")
