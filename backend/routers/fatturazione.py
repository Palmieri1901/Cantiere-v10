"""Integrazione Fatture in Cloud (API v2, token manuale): clienti + bozze fattura da conti/preventivi."""
import logging
import uuid
import re
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import db
from fiscale import valida_cf, valida_piva, separa_indirizzo, componi_indirizzo, is_estero
from pdf_builders import righe_lavoro

router = APIRouter(prefix="/fatturazione")
BASE = "https://api-v2.fattureincloud.it"
COST_KEYS = [("Sosta", "costo_sosta"), ("Movimentazione", "costo_movimentazione"), ("Taccaggio", "costo_taccaggio"), ("Copertura", "costo_copertura"),
             ("Alaggio", "costo_alaggio"), ("Varo", "costo_varo"), ("Antivegetativa", "costo_antivegetativa"), ("Magg. scafo sporco", "costo_scafo_sporco"),
             ("Lavaggio inizio stagione", "costo_lavaggio_inizio"), ("Lavaggio fine stagione", "costo_lavaggio_fine"), ("Manutenzione motore", "costo_manutenzione_motore")]


async def _cfg() -> dict:
    return await db.fatturazione_config.find_one({"id": "default"}, {"_id": 0}) or {}


async def _fic(method: str, path: str, token: str, **kw):
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    try:
        async with httpx.AsyncClient(base_url=BASE, timeout=30) as c:
            r = await c.request(method, path, headers=headers, **kw)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Fatture in Cloud non raggiungibile: {e}")
    if r.status_code == 401:
        raise HTTPException(401, "Token Fatture in Cloud non valido o scaduto: aggiornalo nelle Impostazioni")
    if r.status_code >= 400:
        try:
            j = r.json()
            err = j.get("error", {})
            msg = err.get("message") or r.text[:300]
            vr = err.get("validation_result") or j.get("extra", {}).get("validation_result") or {}
            vr = vr.get("fields") if isinstance(vr.get("fields"), dict) else vr
            det = [f"{k}: {', '.join(v) if isinstance(v, list) else v}" for k, v in vr.items()]
            if det:
                msg += " — " + "; ".join(det)[:600]
        except Exception:  # noqa: BLE001
            msg = r.text[:300]
        logging.getLogger("fatturazione").warning("FIC %s %s -> %s %s", method, path, r.status_code, r.text[:800])
        raise HTTPException(r.status_code, f"Fatture in Cloud: {msg}")
    return r.json() if r.content else {}


class ConfigIn(BaseModel):
    token: Optional[str] = None
    company_id: Optional[int] = None


def _mask(t: str) -> str:
    return (t[:6] + "…" + t[-4:]) if len(t) > 12 else ("•••" if t else "")


@router.get("/config")
async def get_config():
    c = await _cfg()
    return {"configurato": bool(c.get("token")), "token_mascherato": _mask(c.get("token") or ""), "company_id": c.get("company_id"),
            "company_name": c.get("company_name", ""), "vat_id": c.get("vat_id"), "utente": c.get("utente", "")}


@router.put("/config")
async def set_config(p: ConfigIn):
    c = await _cfg()
    upd = {}
    if p.token is not None and p.token.strip():
        tok = p.token.strip().removeprefix("Bearer ").strip()
        info = await _fic("GET", "/user/info", tok)
        upd["token"] = tok
        upd["utente"] = (info.get("data") or {}).get("email", "")
        comps = (await _fic("GET", "/user/companies", tok)).get("data", {}).get("companies", [])
        if len(comps) == 1 and not p.company_id:
            p.company_id = comps[0]["id"]
    tok = upd.get("token") or c.get("token")
    if p.company_id is not None and tok:
        comps = (await _fic("GET", "/user/companies", tok)).get("data", {}).get("companies", [])
        comp = next((x for x in comps if x["id"] == p.company_id), None)
        if not comp:
            raise HTTPException(400, "Azienda non trovata tra quelle del token")
        upd["company_id"], upd["company_name"] = comp["id"], comp.get("name", "")
        try:
            vats = (await _fic("GET", f"/c/{comp['id']}/info/vat_types", tok)).get("data", [])
            v22 = next((v for v in vats if float(v.get("value") or -1) == 22), None)
            upd["vat_id"] = v22["id"] if v22 else None
        except HTTPException as e:
            if e.status_code not in (401, 403):
                raise
            upd["vat_id"] = None
    if not upd:
        raise HTTPException(400, "Nessun dato da salvare")
    await db.fatturazione_config.update_one({"id": "default"}, {"$set": upd}, upsert=True)
    return await get_config()


@router.delete("/config")
async def reset_config():
    await db.fatturazione_config.delete_one({"id": "default"})
    return {"ok": True}


@router.get("/companies")
async def companies():
    c = await _cfg()
    if not c.get("token"):
        raise HTTPException(400, "Token non configurato")
    return [{"id": x["id"], "name": x.get("name", "")} for x in (await _fic("GET", "/user/companies", c["token"])).get("data", {}).get("companies", [])]


# ---------- Costruzione documento ----------
def _riga(descr: str, qta: float, prezzo: float) -> dict:
    return {"name": descr[:255], "description": "", "qty": round(qta or 1, 3), "net_price": round(prezzo, 2)}


def _righe_lavori(lavori: list) -> List[dict]:
    out = []
    for l in lavori:
        for titolo, qta, pu, imp, hdr in righe_lavoro(l):
            if hdr:
                out.append({"name": f"{l.get('data', '')} · {titolo}"[:255], "description": "", "qty": 1, "net_price": 0, "_nota": True})
            elif imp:
                q = float(str(qta).split()[0].replace(",", ".")) if qta else 1
                out.append(_riga(f"  {titolo}{(' ' + qta) if qta else ''}", q or 1, (pu if pu else imp)))
    return out


async def _righe_cliente(c: dict) -> List[dict]:
    r = [_riga(f"{lbl} · rimessaggio {c.get('anno', '')}", 1, float(c.get(k) or 0)) for lbl, k in COST_KEYS if float(c.get(k) or 0) > 0]
    r += [_riga(x.get("descrizione") or "Lavorazione extra", 1, float(x.get("prezzo") or 0)) for x in (c.get("lavorazioni_extra") or []) if float(x.get("prezzo") or 0) > 0]
    lavori = await db.lavori.find({"cliente_id": c["id"], "data": {"$regex": f"^{c.get('anno')}"}}, {"_id": 0}).sort("data", 1).to_list(1000)
    return r + _righe_lavori(lavori)


async def _entita(tok: str, cid: int, soggetto: dict, nome: str) -> dict:
    az = (soggetto.get("tipo_soggetto") or "privato") == "azienda" and soggetto.get("ragione_sociale")
    payload = {"type": "company" if az else "person", "name": (soggetto.get("ragione_sociale") if az else nome).strip()[:255]}
    if soggetto.get("partita_iva"):
        payload["vat_number"] = soggetto["partita_iva"]
    if soggetto.get("codice_fiscale"):
        payload["tax_code"] = soggetto["codice_fiscale"]
    if soggetto.get("codice_sdi"):
        payload["ei_code"] = soggetto["codice_sdi"]
    if soggetto.get("pec"):
        payload["certified_email"] = soggetto["pec"]
    if soggetto.get("email"):
        payload["email"] = soggetto["email"]
    if soggetto.get("telefono") or soggetto.get("cellulare"):
        payload["phone"] = soggetto.get("telefono") or soggetto.get("cellulare")
    ind = _indirizzo_parti(soggetto)
    if ind.get("via"):
        payload["address_street"] = ind["via"][:255]
    if ind.get("cap"):
        payload["address_postal_code"] = ind["cap"]
    if ind.get("citta"):
        payload["address_city"] = ind["citta"][:255]
    if ind.get("provincia"):
        payload["address_province"] = ind["provincia"][:2].upper()
    payload["country"] = str(soggetto.get("nazione") or "").strip() if is_estero(soggetto) else "Italia"
    if payload.get("ei_code") or payload.get("certified_email"):
        payload["e_invoice"] = True
    esc = lambda v: str(v).replace("'", "\\'")  # noqa: E731
    q = f"vat_number = '{esc(payload['vat_number'])}'" if payload.get("vat_number") else f"name = '{esc(payload['name'])}'"
    try:
        found = (await _fic("GET", f"/c/{cid}/entities/clients", tok, params={"q": q, "per_page": 50})).get("data", [])
    except HTTPException as e:
        if e.status_code == 403:
            raise HTTPException(403, "Il token Fatture in Cloud non ha il permesso 'Clienti' (lettura/scrittura): rigeneralo con i permessi Clienti e Proforma")
        found = []
    hit = next((x for x in found if (payload.get("vat_number") and x.get("vat_number") == payload["vat_number"]) or (x.get("name") or "").lower() == payload["name"].lower()), None)
    if hit:
        await _fic("PUT", f"/c/{cid}/entities/clients/{hit['id']}", tok, json={"data": payload})
        return {**payload, "id": hit["id"]}
    new_id = (await _fic("POST", f"/c/{cid}/entities/clients", tok, json={"data": payload})).get("data", {}).get("id")
    return {**payload, "id": new_id}


class InviaIn(BaseModel):
    tipo: str  # cliente | esterno | preventivo_esterno
    id: str
    anno: Optional[int] = None


CAMPI_FISCALI = ("tipo_soggetto", "ragione_sociale", "nome", "cognome", "codice_fiscale", "partita_iva", "codice_sdi", "pec", "indirizzo", "via", "cap", "citta", "provincia", "nazione", "email", "telefono", "cellulare")


def _indirizzo_parti(s: dict) -> dict:
    """Usa via/cap/citta/provincia se presenti, altrimenti li ricava dal campo indirizzo libero."""
    if any(str(s.get(k) or "").strip() for k in ("via", "cap", "citta")):
        return {k: str(s.get(k) or "").strip() for k in ("via", "cap", "citta", "provincia")}
    return separa_indirizzo(s.get("indirizzo") or "")


def _mancanti(s: dict) -> List[str]:
    """Campi obbligatori per fatturare: privato = nome, cognome, indirizzo completo, CF; azienda = ragione sociale, indirizzo completo, P.IVA, SDI."""
    g = lambda k: str(s.get(k) or "").strip()  # noqa: E731
    if is_estero(s):
        az = (s.get("tipo_soggetto") or "privato") == "azienda" and g("ragione_sociale")
        return [] if az else [lbl for k, lbl in (("cognome", "Cognome"), ("nome", "Nome")) if not g(k)]
    if (s.get("tipo_soggetto") or "privato") == "azienda":
        req = [("ragione_sociale", "Ragione sociale"), ("partita_iva", "Partita IVA"), ("codice_sdi", "Codice SDI")]
    else:
        req = [("cognome", "Cognome"), ("nome", "Nome"), ("codice_fiscale", "Codice fiscale")]
    out = [lbl for k, lbl in req if not g(k)]
    ind = _indirizzo_parti(s)
    out += [lbl for k, lbl in (("via", "Via"), ("cap", "CAP"), ("citta", "Città"), ("provincia", "Provincia")) if not ind.get(k)]
    return out


def _errori_formali(s: dict) -> List[str]:
    out = []
    if is_estero(s):
        return out
    e = valida_cf(s.get("codice_fiscale"))
    if e:
        out.append(e)
    e = valida_piva(s.get("partita_iva"))
    if e:
        out.append(e)
    cap = str(s.get("cap") or "").strip()
    if cap and not re.fullmatch(r"\d{5}", cap):
        out.append("Il CAP deve avere 5 cifre")
    prov = str(s.get("provincia") or "").strip()
    if prov and not re.fullmatch(r"[A-Za-z]{2}", prov):
        out.append("La provincia è la sigla di 2 lettere (es. LI)")
    return out


async def _soggetto_doc(tipo: str, id_: str):
    """Ritorna (collezione, documento soggetto) per il tipo di invio."""
    if tipo == "cliente":
        return "clienti", await db.clienti.find_one({"id": id_}, {"_id": 0})
    if tipo == "esterno":
        return "clienti_esterni", await db.clienti_esterni.find_one({"id": id_}, {"_id": 0})
    if tipo == "preventivo_esterno":
        prev = await db.preventivi_esterni.find_one({"id": id_}, {"_id": 0})
        return "clienti_esterni", (await db.clienti_esterni.find_one({"id": prev["esterno_id"]}, {"_id": 0}) if prev else None)
    raise HTTPException(400, "Tipo non valido")


def _split_nome(doc: dict) -> dict:
    """I clienti esterni hanno solo 'nome': prova a separare cognome e nome se mancano."""
    s = dict(doc)
    if not s.get("cognome") and s.get("nome") and " " in s["nome"].strip():
        parti = s["nome"].strip().split()
        s["cognome"], s["nome"] = parti[0], " ".join(parti[1:])
    return s


@router.post("/verifica")
async def verifica(p: InviaIn):
    """Controlla che il soggetto sia completo prima dell'invio; indica se è già in Anagrafica generale."""
    _, doc = await _soggetto_doc(p.tipo, p.id)
    if not doc:
        raise HTTPException(404, "Soggetto non trovato")
    s = _split_nome(doc)
    sogg = {k: str(s.get(k) or "") for k in CAMPI_FISCALI}
    sogg["tipo_soggetto"] = sogg["tipo_soggetto"] or "privato"
    sogg.update(_indirizzo_parti(sogg))
    from routers.anagrafica import _trova_esistente, _norm
    try:
        in_ana = bool(await _trova_esistente(_norm(sogg)))
    except HTTPException:
        in_ana = False
    errori = _errori_formali(sogg)
    return {"ok": not _mancanti(sogg) and not errori, "mancanti": _mancanti(sogg), "errori": errori, "soggetto": sogg, "in_anagrafica": in_ana}


class CompletaIn(InviaIn):
    dati: dict
    registra_anagrafica: bool = True


@router.post("/completa-dati")
async def completa_dati(p: CompletaIn):
    """Salva i dati fiscali sul cliente (rimessaggio o esterno) e, se richiesto, in Anagrafica generale."""
    coll, doc = await _soggetto_doc(p.tipo, p.id)
    if not doc:
        raise HTTPException(404, "Soggetto non trovato")
    dati = {k: str(p.dati.get(k) or "").strip() for k in CAMPI_FISCALI}
    dati["codice_fiscale"], dati["codice_sdi"], dati["provincia"] = dati["codice_fiscale"].upper(), dati["codice_sdi"].upper(), dati["provincia"].upper()
    dati["partita_iva"] = re.sub(r"\D", "", dati["partita_iva"])
    dati["indirizzo"] = componi_indirizzo(dati) or dati["indirizzo"]
    mancanti = _mancanti(dati)
    if mancanti:
        raise HTTPException(400, "Dati incompleti: " + ", ".join(mancanti))
    errori = _errori_formali(dati)
    if errori:
        raise HTTPException(400, "; ".join(errori))
    upd = dict(dati)
    if coll == "clienti_esterni":
        upd["nome"] = dati["ragione_sociale"] if dati["tipo_soggetto"] == "azienda" and dati["ragione_sociale"] else f"{dati['cognome']} {dati['nome']}".strip()
        upd["cognome_ref"], upd["nome_ref"] = dati["cognome"], dati["nome"]
        upd.pop("cognome", None)
    upd["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db[coll].update_one({"id": doc["id"]}, {"$set": upd})
    ana = None
    if p.registra_anagrafica:
        from routers.anagrafica import upsert_anagrafica
        ana = await upsert_anagrafica(dati, "fatturazione")
    return {"ok": True, "anagrafica": ana}


@router.post("/invia")
async def invia(p: InviaIn):
    c = await _cfg()
    if not c.get("token") or not c.get("company_id"):
        raise HTTPException(400, "Fatture in Cloud non configurato: vai in Impostazioni → Fatturazione")
    tok, cid = c["token"], c["company_id"]
    vat_id = c.get("vat_id")
    if not vat_id:
        try:
            vats = (await _fic("GET", f"/c/{cid}/info/vat_types", tok)).get("data", [])
            v22 = next((v for v in vats if float(v.get("value") or -1) == 22), None)
            vat_id = v22["id"] if v22 else None
        except HTTPException:
            vat_id = None
    vat = {"id": vat_id} if vat_id is not None else {"id": 0, "value": 22, "description": "22%"}
    if p.tipo == "cliente":
        doc = await db.clienti.find_one({"id": p.id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Cliente non trovato")
        nome, sogg, righe = f"{doc.get('cognome', '')} {doc.get('nome', '')}", doc, await _righe_cliente(doc)
        oggetto = f"Rimessaggio {doc.get('anno', '')} · {doc.get('tipo_barca', '')} {doc.get('lunghezza') or ''} m".strip()
    elif p.tipo == "esterno":
        doc = await db.clienti_esterni.find_one({"id": p.id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Cliente esterno non trovato")
        q = {"cliente_id": p.id}
        if p.anno:
            q["data"] = {"$regex": f"^{p.anno}"}
        lavori = await db.lavori.find(q, {"_id": 0}).sort("data", 1).to_list(1000)
        nome, sogg, righe = doc.get("nome", ""), doc, _righe_lavori(lavori)
        oggetto = f"Lavori eseguiti{(' ' + str(p.anno)) if p.anno else ''}"
    elif p.tipo == "preventivo_esterno":
        prev = await db.preventivi_esterni.find_one({"id": p.id}, {"_id": 0})
        if not prev:
            raise HTTPException(404, "Preventivo non trovato")
        doc = await db.clienti_esterni.find_one({"id": prev["esterno_id"]}, {"_id": 0}) or {}
        nome, sogg = doc.get("nome", prev.get("esterno_nome", "")), doc
        righe = [_riga(r.get("descrizione") or "Voce", float(r.get("quantita") or 1), float(r.get("prezzo_unitario") or 0)) for r in prev.get("righe", []) if float(r.get("prezzo_unitario") or 0) > 0]
        oggetto = f"Preventivo n. {prev.get('numero', '')} · {prev.get('oggetto', '')}"
    else:
        raise HTTPException(400, "Tipo non valido")
    righe = [r for r in righe if r.get("_nota") or r["net_price"] > 0]
    if not any(not r.get("_nota") for r in righe):
        raise HTTPException(400, "Nessuna voce con importo da fatturare")
    manc = _mancanti(_split_nome(sogg))
    if manc:
        raise HTTPException(422, "Dati del cliente incompleti per la fatturazione: " + ", ".join(manc))
    errf = _errori_formali(sogg)
    if errf:
        raise HTTPException(422, "Dati del cliente non validi: " + "; ".join(errf))
    sogg = _split_nome(sogg)
    entity = await _entita(tok, cid, sogg, nome)
    entity_id = entity["id"]
    items = [{"name": r["name"], "description": r["description"], "qty": r["qty"], "net_price": r["net_price"], "vat": vat} for r in righe]
    data = {"type": "proforma", "entity": entity, "date": datetime.now().strftime("%Y-%m-%d"), "subject": oggetto[:255], "items_list": items}
    netto = round(sum(r["qty"] * r["net_price"] for r in righe), 2)
    data["payments_list"] = [{"amount": round(netto * 1.22, 2), "due_date": datetime.now().strftime("%Y-%m-%d"), "status": "not_paid"}]
    try:
        res = (await _fic("POST", f"/c/{cid}/issued_documents", tok, json={"data": data})).get("data", {})
    except HTTPException as e:
        if e.status_code == 403:
            raise HTTPException(403, "Il token Fatture in Cloud non ha il permesso 'Proforma' (lettura/scrittura): rigeneralo da Impostazioni → Applicazioni e integrazioni → Autenticazione manuale e salvalo nelle Impostazioni del gestionale")
        raise
    invio = {"id": str(uuid.uuid4()), "tipo": p.tipo, "rif_id": p.id, "anno": p.anno, "fic_id": res.get("id"), "fic_entity_id": entity_id, "nome": nome.strip(),
             "totale": round(sum(r["qty"] * r["net_price"] for r in righe if not r.get("_nota")), 2), "righe": len(items), "ts": datetime.now(timezone.utc).isoformat()}
    await db.fatturazione_invii.insert_one(invio)
    invio.pop("_id", None)
    return {**invio, "url": f"https://secure.fattureincloud.it/proformas-view-{res.get('id')}" if res.get("id") else ""}


@router.get("/stato-documento")
async def stato_documento(tipo: str, rif_id: str, anno: Optional[int] = None):
    q = {"tipo": tipo, "rif_id": rif_id}
    if anno is not None:
        q["anno"] = anno
    inv = await db.fatturazione_invii.find_one(q, {"_id": 0}, sort=[("ts", -1)])
    if not inv:
        return {"emessa": False}
    return {**inv, "emessa": True, "url": f"https://secure.fattureincloud.it/proformas-view-{inv.get('fic_id')}" if inv.get("fic_id") else ""}


@router.get("/invii")
async def invii(tipo: str = "", rif_id: str = ""):
    q = {}
    if tipo:
        q["tipo"] = tipo
    if rif_id:
        q["rif_id"] = rif_id
    return await db.fatturazione_invii.find(q, {"_id": 0}).sort("ts", -1).to_list(200)
