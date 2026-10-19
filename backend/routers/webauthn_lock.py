"""Sblocco biometrico (WebAuthn/passkey, autenticatore di piattaforma) per telefono: gestionale (JWT) e app dipendenti (X-Api-Key)."""
import base64
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from webauthn import (base64url_to_bytes, generate_authentication_options, generate_registration_options, options_to_json,
                      verify_authentication_response, verify_registration_response)
from webauthn.helpers.structs import (AuthenticatorAttachment, AuthenticatorSelectionCriteria, PublicKeyCredentialDescriptor,
                                      ResidentKeyRequirement, UserVerificationRequirement)

from auth import get_current_user
from database import db
from routers.mobile import get_dipendente

router = APIRouter(prefix="/webauthn")
mobile_router = APIRouter(prefix="/api/mobile/webauthn")
CHALLENGE_TTL = timedelta(minutes=2)


def _now():
    return datetime.now(timezone.utc)


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _rp(request: Request):
    rp_id = os.environ.get("WEBAUTHN_RP_ID", "").strip()
    host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
    if not rp_id:
        rp_id = host.split(":")[0]
    return rp_id, f"https://{host}"


def _challenge_from_body(body: "CredentialBody") -> str:
    import json
    cd = body.response.get("clientDataJSON", "")
    try:
        return json.loads(base64url_to_bytes(cd)).get("challenge", "")
    except Exception:  # noqa: BLE001
        return ""


async def _consume(account_id: str, kind: str, body: "CredentialBody"):
    ch = _challenge_from_body(body)
    return await db.webauthn_challenges.find_one_and_delete({"account_id": account_id, "kind": kind, "challenge": ch, "expires_at": {"$gt": _now()}})


class CredentialBody(BaseModel):
    id: str
    rawId: str
    type: str
    response: dict
    clientExtensionResults: dict = {}
    authenticatorAttachment: Optional[str] = None
    device_id: Optional[str] = ""
    device_nome: Optional[str] = ""


class DeviceIn(BaseModel):
    device_id: str
    device_nome: Optional[str] = ""


async def _status(account_id: str, device_id: str) -> dict:
    n = await db.webauthn_credentials.count_documents({"account_id": account_id, "device_id": device_id}) if device_id else 0
    return {"enrolled": n > 0}


async def _register_options(account_id: str, request: Request) -> str:
    rp_id, _ = _rp(request)
    existing = await db.webauthn_credentials.find({"account_id": account_id}, {"_id": 0, "credential_id": 1}).to_list(100)
    opts = generate_registration_options(
        rp_id=rp_id, rp_name="Gestionale GEBnautica", user_id=secrets.token_bytes(32), user_name=account_id[:60], user_display_name="Gestionale GEBnautica",
        authenticator_selection=AuthenticatorSelectionCriteria(authenticator_attachment=AuthenticatorAttachment.PLATFORM, resident_key=ResidentKeyRequirement.PREFERRED,
                                                               user_verification=UserVerificationRequirement.REQUIRED),
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(x["credential_id"])) for x in existing])
    await db.webauthn_challenges.insert_one({"id": str(uuid.uuid4()), "account_id": account_id, "kind": "registration", "challenge": _b64(opts.challenge), "expires_at": _now() + CHALLENGE_TTL})
    return options_to_json(opts)


async def _register_complete(account_id: str, body: CredentialBody, request: Request) -> dict:
    rp_id, origin = _rp(request)
    c = await _consume(account_id, "registration", body)
    if not c:
        raise HTTPException(400, "Richiesta scaduta: riprova")
    try:
        v = verify_registration_response(credential=body.model_dump(exclude={"device_id", "device_nome"}), expected_challenge=base64url_to_bytes(c["challenge"]),
                                         expected_rp_id=rp_id, expected_origin=origin, require_user_verification=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Registrazione biometrica non valida: {str(e)[:120]}")
    await db.webauthn_credentials.insert_one({"id": str(uuid.uuid4()), "account_id": account_id, "credential_id": _b64(v.credential_id), "public_key": _b64(v.credential_public_key),
                                              "sign_count": v.sign_count, "device_id": body.device_id or "", "device_nome": (body.device_nome or "")[:80], "rp_id": rp_id,
                                              "created_at": _now().isoformat(), "ultimo_uso": None})
    return {"ok": True}


async def _unlock_options(account_id: str, device_id: str, request: Request) -> str:
    rp_id, _ = _rp(request)
    q = {"account_id": account_id}
    if device_id:
        q["device_id"] = device_id
    creds = await db.webauthn_credentials.find(q, {"_id": 0, "credential_id": 1}).to_list(100)
    if not creds:
        raise HTTPException(404, "Nessuno sblocco biometrico registrato su questo dispositivo")
    opts = generate_authentication_options(rp_id=rp_id, user_verification=UserVerificationRequirement.REQUIRED,
                                           allow_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(x["credential_id"])) for x in creds])
    await db.webauthn_challenges.insert_one({"id": str(uuid.uuid4()), "account_id": account_id, "kind": "authentication", "challenge": _b64(opts.challenge), "expires_at": _now() + CHALLENGE_TTL})
    return options_to_json(opts)


async def _unlock_complete(account_id: str, body: CredentialBody, request: Request) -> dict:
    rp_id, origin = _rp(request)
    c = await _consume(account_id, "authentication", body)
    if not c:
        raise HTTPException(401, "Richiesta scaduta: riprova")
    cred = await db.webauthn_credentials.find_one({"account_id": account_id, "credential_id": body.id})
    if not cred:
        raise HTTPException(401, "Credenziale sconosciuta")
    try:
        v = verify_authentication_response(credential=body.model_dump(exclude={"device_id", "device_nome"}), expected_challenge=base64url_to_bytes(c["challenge"]),
                                           expected_rp_id=rp_id, expected_origin=origin, credential_public_key=base64url_to_bytes(cred["public_key"]),
                                           credential_current_sign_count=cred["sign_count"], require_user_verification=True)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(401, f"Sblocco biometrico non valido: {str(e)[:120]}")
    await db.webauthn_credentials.update_one({"_id": cred["_id"]}, {"$set": {"sign_count": v.new_sign_count, "ultimo_uso": _now().isoformat()}})
    return {"ok": True}


async def _lista(account_id: str):
    return await db.webauthn_credentials.find({"account_id": account_id}, {"_id": 0, "id": 1, "device_nome": 1, "device_id": 1, "created_at": 1, "ultimo_uso": 1}).sort("created_at", -1).to_list(100)


# ---------- Gestionale (JWT) ----------
def _acc(user: dict) -> str:
    return f"user:{user['id']}"


@router.get("/status")
async def status(device_id: str = "", user: dict = Depends(get_current_user)):
    return await _status(_acc(user), device_id)


@router.post("/register/options")
async def register_options(request: Request, user: dict = Depends(get_current_user)):
    return await _register_options(_acc(user), request)


@router.post("/register/complete")
async def register_complete(body: CredentialBody, request: Request, user: dict = Depends(get_current_user)):
    return await _register_complete(_acc(user), body, request)


@router.post("/unlock/options")
async def unlock_options(p: DeviceIn, request: Request, user: dict = Depends(get_current_user)):
    return await _unlock_options(_acc(user), p.device_id, request)


@router.post("/unlock/complete")
async def unlock_complete(body: CredentialBody, request: Request, user: dict = Depends(get_current_user)):
    return await _unlock_complete(_acc(user), body, request)


@router.get("/dispositivi")
async def dispositivi(user: dict = Depends(get_current_user)):
    return await _lista(_acc(user))


@router.delete("/dispositivi/{cid}")
async def elimina_dispositivo(cid: str, user: dict = Depends(get_current_user)):
    await db.webauthn_credentials.delete_one({"id": cid, "account_id": _acc(user)})
    return {"ok": True}


# ---------- App dipendenti (X-Api-Key) ----------
def _accd(dip: dict) -> str:
    return f"dip:{dip['id']}"


@mobile_router.get("/status")
async def status_m(device_id: str = "", dip: dict = Depends(get_dipendente)):
    return await _status(_accd(dip), device_id)


@mobile_router.post("/register/options")
async def register_options_m(request: Request, dip: dict = Depends(get_dipendente)):
    return await _register_options(_accd(dip), request)


@mobile_router.post("/register/complete")
async def register_complete_m(body: CredentialBody, request: Request, dip: dict = Depends(get_dipendente)):
    return await _register_complete(_accd(dip), body, request)


@mobile_router.post("/unlock/options")
async def unlock_options_m(p: DeviceIn, request: Request, dip: dict = Depends(get_dipendente)):
    return await _unlock_options(_accd(dip), p.device_id, request)


@mobile_router.post("/unlock/complete")
async def unlock_complete_m(body: CredentialBody, request: Request, dip: dict = Depends(get_dipendente)):
    return await _unlock_complete(_accd(dip), body, request)
