"""Autenticazione: hashing password, JWT, get_current_user, endpoints e seed_admin."""
import os
import uuid
import secrets
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Request, HTTPException, Depends, Response

from database import db, logger
from models import (
    LoginRequest, RegisterRequest,
    ForgotPasswordRequest, ResetPasswordRequest, ChangePasswordRequest,
    PinResetRequest, ChangePinRequest,
)
from email_service import send_email, build_password_reset_email

JWT_ALGORITHM = "HS256"
SESSION_DAYS = 30
RESET_TOKEN_TTL_MIN = 60


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


PASSWORD_POLICY_MSG = "La password deve avere almeno 8 caratteri, una lettera maiuscola, un numero e un simbolo tra : . - ? !"


def validate_password_policy(pw: str) -> None:
    import re as _re
    pw = pw or ""
    if len(pw) < 8 or not _re.search(r"[A-Z]", pw) or not _re.search(r"[0-9]", pw) or not _re.search(r"[:.\-?!]", pw):
        raise HTTPException(400, PASSWORD_POLICY_MSG)


def verify_master_password(pw: str) -> bool:
    import hashlib, hmac
    expected = os.environ.get("MASTER_PASSWORD_SHA256", "").strip().lower()
    if not expected:
        return False
    return hmac.compare_digest(hashlib.sha256((pw or "").encode("utf-8")).hexdigest(), expected)


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
        "type": "access",
    }
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token non valido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utente non trovato")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessione scaduta")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token non valido")


auth_router = APIRouter(prefix="/api/auth")


def _set_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token", value=token, httponly=True, secure=True,
        samesite="lax", max_age=SESSION_DAYS * 24 * 3600, path="/",
    )


@auth_router.post("/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.strip().lower()
    if not email or not payload.password:
        raise HTTPException(400, "Email e password obbligatorie")
    if len(payload.password) < 5:
        raise HTTPException(400, "La password deve contenere almeno 5 caratteri")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(400, "Email già registrata")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "password_hash": hash_password(payload.password),
        "nome": payload.nome or email.split("@")[0],
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    _set_cookie(response, token)
    return {"id": user_id, "email": email, "nome": doc["nome"], "role": "user", "token": token}


@auth_router.post("/login")
async def login(payload: LoginRequest, response: Response):
    # Utente unico condiviso: se l'email non è fornita usiamo ADMIN_EMAIL.
    email = (payload.email or "").strip().lower()
    if not email:
        email = os.environ.get("ADMIN_EMAIL", "admin@portomare.it").strip().lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(401, "Password non corretta")
    token = create_access_token(user["id"], email)
    _set_cookie(response, token)
    return {"id": user["id"], "email": email, "nome": user.get("nome", ""), "role": user.get("role", "user"), "token": token}


@auth_router.post("/pin-reset")
async def pin_reset(payload: PinResetRequest, response: Response):
    """Recupero password tramite PIN master.

    Verifica il PIN salvato in `app_settings`. Se corretto, aggiorna la
    password dell'utente admin e apre una sessione (login automatico).
    """
    pin_raw = (payload.pin or "").strip()
    if not pin_raw or not payload.new_password:
        raise HTTPException(400, "PIN e nuova password obbligatori")
    validate_password_policy(payload.new_password)

    settings = await db.app_settings.find_one({"id": "auth"})
    if not settings or not settings.get("recovery_pin_hash"):
        raise HTTPException(500, "PIN di recupero non configurato")
    if not verify_password(pin_raw, settings["recovery_pin_hash"]):
        raise HTTPException(401, "PIN non corretto")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@portomare.it").strip().lower()
    user = await db.users.find_one({"email": admin_email})
    if not user:
        raise HTTPException(500, "Utente admin non trovato")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_customized": True,
        }},
    )
    logger.info(f"Password admin reimpostata via PIN per {admin_email}")

    token = create_access_token(user["id"], admin_email)
    _set_cookie(response, token)
    return {"ok": True, "id": user["id"], "email": admin_email, "nome": user.get("nome", ""), "role": user.get("role", "user"), "token": token}


from pydantic import BaseModel as _BM


class MasterResetRequest(_BM):
    master_password: str
    new_password: str


@auth_router.post("/master-reset")
async def master_reset(payload: MasterResetRequest, response: Response):
    """Password dimenticata: la super password (hash in .env) autorizza a impostarne una nuova."""
    if not verify_master_password(payload.master_password):
        raise HTTPException(401, "Super password non corretta")
    validate_password_policy(payload.new_password)
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@portomare.it").strip().lower()
    user = await db.users.find_one({"email": admin_email})
    if not user:
        raise HTTPException(500, "Utente admin non trovato")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(payload.new_password), "password_customized": True}})
    logger.info(f"Password admin reimpostata via super password per {admin_email}")
    token = create_access_token(user["id"], admin_email)
    _set_cookie(response, token)
    return {"ok": True, "id": user["id"], "email": admin_email, "nome": user.get("nome", ""), "role": user.get("role", "user"), "token": token}


@auth_router.post("/change-pin")
async def change_pin(payload: ChangePinRequest, user: dict = Depends(get_current_user)):
    """Cambia il PIN di recupero master: richiede il PIN attuale (non la password)."""
    current_pin = (payload.current_pin or "").strip()
    new_pin = (payload.new_pin or "").strip()
    if not current_pin or not new_pin:
        raise HTTPException(400, "Compila entrambi i campi")
    if len(new_pin) < 4:
        raise HTTPException(400, "Il PIN deve contenere almeno 4 caratteri")

    settings = await db.app_settings.find_one({"id": "auth"})
    if not settings or not settings.get("recovery_pin_hash"):
        raise HTTPException(500, "PIN di recupero non configurato")
    if not verify_password(current_pin, settings["recovery_pin_hash"]):
        raise HTTPException(401, "PIN attuale non corretto")

    await db.app_settings.update_one(
        {"id": "auth"},
        {"$set": {
            "recovery_pin_hash": hash_password(new_pin),
            "pin_customized": True,
            "updated_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )
    return {"ok": True, "message": "PIN di recupero aggiornato"}


@auth_router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@auth_router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "nome": user.get("nome", ""), "role": user.get("role", "user")}


@auth_router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest):
    """Genera un token di reset e invia il link all'indirizzo fisso di recupero.

    Per motivi di privacy la risposta è sempre 200 anche se l'email non esiste
    nel database (evita l'enumerazione degli account).
    """
    email = (payload.email or "").strip().lower()
    user = await db.users.find_one({"email": email}) if email else None

    # Restituiamo sempre lo stesso messaggio per non rivelare l'esistenza dell'account.
    generic_ok = {"ok": True, "message": "Se l'account esiste, un link di recupero è stato inviato all'email di recupero."}

    if not user:
        return generic_ok

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.password_reset_tokens.insert_one({
        "token": token,
        "user_id": user["id"],
        "user_email": user["email"],
        "created_at": now,
        "expires_at": now + timedelta(minutes=RESET_TOKEN_TTL_MIN),
        "used": False,
    })

    owner_email = os.environ.get("OWNER_EMAIL", "").strip()
    if not owner_email:
        logger.error("OWNER_EMAIL non configurato, impossibile inviare recupero password")
        raise HTTPException(500, "Servizio di recupero non configurato")

    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    reset_link = f"{frontend_url}/reset-password?token={token}"

    subject, html = build_password_reset_email(reset_link, user["email"])
    try:
        await send_email(to=owner_email, subject=subject, html=html)
    except HTTPException:
        # In caso di problema con l'invio email, comunichiamo comunque il generic_ok
        # ma logghiamo il link internamente così l'admin può recuperarlo dai log.
        logger.warning(f"Reset link (email fallita) per {user['email']}: {reset_link}")
        return generic_ok

    logger.info(f"Reset password inviato a {owner_email} per account {user['email']}")
    return generic_ok


@auth_router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest):
    if not payload.token or not payload.new_password:
        raise HTTPException(400, "Token e nuova password obbligatori")
    validate_password_policy(payload.new_password)

    record = await db.password_reset_tokens.find_one({"token": payload.token})
    if not record:
        raise HTTPException(400, "Link non valido o già utilizzato")
    if record.get("used"):
        raise HTTPException(400, "Link già utilizzato")
    expires_at = record.get("expires_at")
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(400, "Link scaduto")

    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    await db.password_reset_tokens.update_one(
        {"_id": record["_id"]},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc)}},
    )
    logger.info(f"Password reimpostata per user_id={record['user_id']}")
    return {"ok": True, "message": "Password aggiornata correttamente"}


@auth_router.post("/change-password")
async def change_password(payload: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    if not payload.current_password or not payload.new_password:
        raise HTTPException(400, "Compila entrambi i campi")
    validate_password_policy(payload.new_password)

    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(payload.current_password, full.get("password_hash", "")):
        raise HTTPException(401, "Password attuale non corretta")

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    return {"ok": True, "message": "Password aggiornata correttamente"}


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@portomare.it").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "nome": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        # NOTA: aggiorniamo la password solo se l'utente non l'ha mai cambiata.
        if not existing.get("password_customized"):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password)}}
            )
            logger.info(f"Admin password aggiornata dal .env: {admin_email}")

    # Seed PIN di recupero master (singleton in app_settings)
    recovery_pin = os.environ.get("RECOVERY_PIN", "1985").strip()
    settings = await db.app_settings.find_one({"id": "auth"})
    if settings is None:
        await db.app_settings.insert_one({
            "id": "auth",
            "recovery_pin_hash": hash_password(recovery_pin),
            "pin_customized": False,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        })
        logger.info("Recovery PIN seeded from .env")
    elif not settings.get("pin_customized") and not verify_password(recovery_pin, settings.get("recovery_pin_hash", "")):
        await db.app_settings.update_one(
            {"id": "auth"},
            {"$set": {
                "recovery_pin_hash": hash_password(recovery_pin),
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        logger.info("Recovery PIN aggiornato dal .env")
