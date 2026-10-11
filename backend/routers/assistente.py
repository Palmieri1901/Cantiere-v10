"""Assistente vocale 'Hall': interpreta comandi in italiano e li trasforma in azioni sul gestionale."""
import json
import re
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from database import db
from ai_client import testo
from models import LavoroCreate, MovimentoCreate, ArticoloCreate
from routers.lavori import create_lavoro
from routers.magazzino import create_movimento, create_articolo
from routers.calendario import crea_evento, EventoIn, _tipi as tipi_calendario
from routers.mobile import get_dipendente

router = APIRouter(prefix="/assistente")
TIPI_LAVORO = ["Riparazione", "Manutenzione motore", "Antivegetativa", "Pulizia", "Elettrico", "Altro"]


class Richiesta(BaseModel):
    testo: str
    storia: Optional[List[dict]] = None


class Esecuzione(BaseModel):
    azione: str
    parametri: dict


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


async def _contesto():
    anno = datetime.now().year
    clienti = await db.clienti.find({"anno": {"$in": [anno, anno - 1]}}, {"_id": 0, "id": 1, "nome": 1, "cognome": 1, "tipo_barca": 1, "anno": 1}).to_list(2000)
    visti, cl = set(), []
    for c in sorted(clienti, key=lambda c: -c.get("anno", 0)):
        k = _norm(f"{c.get('cognome')}{c.get('nome')}")
        if k in visti:
            continue
        visti.add(k)
        cl.append(c)
    articoli = await db.articoli.find({}, {"_id": 0, "id": 1, "nome": 1, "codice": 1, "quantita": 1, "prezzo_listino": 1, "unita_misura": 1}).sort("nome", 1).to_list(1500)
    return cl, articoli


def _system(cl, articoli, tipi_cal, contesto):
    oggi = datetime.now()
    righe_cl = "\n".join(f"- {c['id']} | {c.get('cognome','')} {c.get('nome','')} | {c.get('tipo_barca','')}" for c in cl)
    righe_art = "\n".join(f"- {a['id']} | {a.get('nome','')} | cod {a.get('codice','')} | q {a.get('quantita',0)} {a.get('unita_misura','pz')} | € {a.get('prezzo_listino',0)}" for a in articoli)
    righe_tipi = ", ".join(f"{t['id']}={t['nome']}" for t in tipi_cal)
    azioni_extra = "" if contesto == "dipendente" else """
- "scarico_articolo" / "carico_articolo": {articolo_id, quantita, cliente_id?} — richiede_conferma true
- "nuovo_lavoro": {cliente_id, tipo (uno di %s), descrizione, ore, costo?, data (YYYY-MM-DD, default oggi)} — richiede_conferma true
- "nuovo_appuntamento": {data YYYY-MM-DD, ora HH:MM o "", titolo, tipo_id (uno di %s), note} — richiede_conferma true
- "nuovo_articolo": {nome, codice?, quantita?, prezzo_listino?, prezzo_acquisto?} — richiede_conferma true
- "appuntamenti": {da YYYY-MM-DD, a YYYY-MM-DD} — ricerca, richiede_conferma false
- "info_cliente": {cliente_id} — ricerca, richiede_conferma false""" % (TIPI_LAVORO, righe_tipi)
    azioni_dip = """
- "compila_lavoro": {cliente_id?, cliente_nome?, tipo (uno di %s), descrizione, ore, articoli: [{articolo_id, quantita}]} — compila il modulo del lavoro sul telefono, richiede_conferma true""" % TIPI_LAVORO if contesto == "dipendente" else ""
    return f"""Sei Hall, l'assistente vocale del gestionale di un cantiere nautico (rimessaggio barche, gommoni, motori Suzuki).
Oggi è {oggi.strftime('%A %d/%m/%Y')} ({oggi.strftime('%Y-%m-%d')}). Rispondi SOLO con un oggetto JSON valido, senza testo attorno né markdown.

Schema: {{"azione": string, "parametri": object, "riepilogo": string, "risposta": string, "richiede_conferma": boolean}}
- "riepilogo": una riga chiara in italiano di cosa farai (es. "Scarico 2 pz di Filtro olio Suzuki per Rossi Mario").
- "risposta": frase breve e naturale da leggere a voce all'utente (max 25 parole).

Azioni disponibili:
- "info_articolo": {{articolo_id}} — ricerca giacenza/prezzo, richiede_conferma false
- "risposta": {{}} — quando non c'è un'azione (saluti, chiarimenti, dato mancante): spiega in "risposta" cosa manca
- "non_capito": {{}} — richiesta non comprensibile{azioni_extra}{azioni_dip}

Regole: usa SEMPRE gli id esatti dagli elenchi sotto; abbina i nomi anche se pronunciati in modo approssimativo (dettatura vocale); se il cliente o l'articolo non esiste, usa "risposta" dicendolo. Interpreta date relative (domani, venerdì prossimo). Quantità in numeri. Se mancano dati essenziali (es. cliente per un lavoro) chiedi con "risposta".

CLIENTI (id | cognome nome | barca):
{righe_cl}

ARTICOLI MAGAZZINO (id | nome | codice | giacenza | prezzo vendita):
{righe_art}
"""


def _parse(raw: str) -> dict:
    s = raw.strip()
    s = re.sub(r"^```(?:json)?|```$", "", s, flags=re.M).strip()
    m = re.search(r"\{.*\}", s, re.S)
    try:
        return json.loads(m.group(0) if m else s)
    except Exception:
        return {"azione": "non_capito", "parametri": {}, "riepilogo": "", "risposta": "Non ho capito, puoi ripetere?", "richiede_conferma": False}


async def _interpreta(req: Richiesta, contesto: str) -> dict:
    if not req.testo.strip():
        raise HTTPException(400, "Testo vuoto")
    cl, articoli = await _contesto()
    tipi_cal = await tipi_calendario()
    storia = "\n".join(f"{m.get('ruolo','utente')}: {m.get('testo','')}" for m in (req.storia or [])[-6:])
    prompt = (f"Conversazione precedente:\n{storia}\n\n" if storia else "") + f"Comando: {req.testo.strip()}"
    raw = await testo(_system(cl, articoli, tipi_cal, contesto), prompt)
    out = _parse(raw)
    out.setdefault("parametri", {})
    out.setdefault("richiede_conferma", False)
    out.setdefault("riepilogo", "")
    out.setdefault("risposta", "")
    az = out.get("azione", "risposta")
    if az in ("info_articolo", "info_cliente", "appuntamenti"):
        out["risultato"] = await _esegui(az, out["parametri"])
        out["risposta"] = out["risultato"].get("messaggio", out["risposta"])
        out["richiede_conferma"] = False
    if contesto == "dipendente" and az == "compila_lavoro":
        p = out["parametri"]
        p["articoli_dettaglio"] = [{**x, "nome": next((a["nome"] for a in articoli if a["id"] == x.get("articolo_id")), "")} for x in p.get("articoli", [])]
        c = next((c for c in cl if c["id"] == p.get("cliente_id")), None)
        if c:
            p["cliente_nome"] = f"{c.get('cognome','')} {c.get('nome','')}".strip()
    return out


async def _esegui(azione: str, p: dict) -> dict:
    if azione == "info_articolo":
        a = await db.articoli.find_one({"id": p.get("articolo_id")}, {"_id": 0})
        if not a:
            return {"messaggio": "Articolo non trovato."}
        q, u = a.get("quantita", 0), a.get("unita_misura", "pz")
        return {"messaggio": f"{a['nome']}: {q:g} {u} in magazzino, prezzo di vendita {a.get('prezzo_listino', 0):.2f} euro, acquisto {a.get('prezzo_acquisto', 0):.2f}.", "articolo": a}
    if azione == "info_cliente":
        c = await db.clienti.find_one({"id": p.get("cliente_id")}, {"_id": 0})
        if not c:
            return {"messaggio": "Cliente non trovato."}
        n_lav = await db.lavori.count_documents({"cliente_id": c["id"]})
        tel = f", telefono {c['telefono']}" if c.get("telefono") else ""
        return {"messaggio": f"{c.get('cognome','')} {c.get('nome','')}: {c.get('tipo_barca','')} di {c.get('lunghezza', 0):g} metri, anno {c.get('anno')}{tel}, {n_lav} lavori registrati.", "cliente": c}
    if azione == "appuntamenti":
        da = p.get("da") or datetime.now().strftime("%Y-%m-%d")
        a = p.get("a") or da
        ev = await db.calendario_eventi.find({"data": {"$gte": da, "$lte": a}}, {"_id": 0}).sort([("data", 1), ("ora", 1)]).to_list(200)
        if not ev:
            return {"messaggio": "Nessun appuntamento nel periodo richiesto.", "eventi": []}
        righe = "; ".join(f"{datetime.strptime(e['data'], '%Y-%m-%d').strftime('%d/%m')}{' ' + e['ora'] if e.get('ora') else ''} {e['titolo']}" for e in ev[:8])
        return {"messaggio": f"{len(ev)} appuntamenti: {righe}.", "eventi": ev}
    if azione in ("scarico_articolo", "carico_articolo"):
        cl = await db.clienti.find_one({"id": p.get("cliente_id")}, {"_id": 0}) if p.get("cliente_id") else None
        mv = await create_movimento(MovimentoCreate(
            articolo_id=p["articolo_id"], tipo="scarico" if azione == "scarico_articolo" else "carico",
            quantita=float(p.get("quantita", 1)), motivo="Assistente Hall",
            cliente_id=cl["id"] if cl else None, cliente_nome=f"{cl.get('cognome','')} {cl.get('nome','')}".strip() if cl else ""))
        return {"messaggio": f"Fatto. Giacenza aggiornata: {mv.quantita_dopo:g}.", "movimento": mv.model_dump(mode='json')}
    if azione == "nuovo_lavoro":
        lav = await create_lavoro(LavoroCreate(
            cliente_id=p["cliente_id"], data=p.get("data") or datetime.now().strftime("%Y-%m-%d"),
            tipo=p.get("tipo") if p.get("tipo") in TIPI_LAVORO else "Altro", descrizione=p.get("descrizione", ""),
            ore=float(p.get("ore") or 0), costo=float(p.get("costo") or 0), dipendente="Hall"))
        return {"messaggio": "Lavoro registrato nella scheda del cliente.", "lavoro": lav.model_dump(mode='json')}
    if azione == "nuovo_appuntamento":
        ev = await crea_evento(EventoIn(data=p["data"], ora=p.get("ora") or "", titolo=p.get("titolo") or "Appuntamento", tipo_id=p.get("tipo_id") or "altro", note=p.get("note") or ""))
        return {"messaggio": "Appuntamento aggiunto al calendario.", "evento": ev}
    if azione == "nuovo_articolo":
        art = await create_articolo(ArticoloCreate(nome=p["nome"], codice=p.get("codice") or "", quantita=float(p.get("quantita") or 0),
                                                   prezzo_listino=float(p.get("prezzo_listino") or 0), prezzo_acquisto=float(p.get("prezzo_acquisto") or 0)))
        return {"messaggio": f"Articolo {art.nome} creato in magazzino.", "articolo": art.model_dump(mode='json')}
    raise HTTPException(400, "Azione non eseguibile")


@router.post("/interpreta")
async def interpreta(req: Richiesta):
    return await _interpreta(req, "gestionale")


@router.post("/esegui")
async def esegui(e: Esecuzione):
    if e.azione not in ("scarico_articolo", "carico_articolo", "nuovo_lavoro", "nuovo_appuntamento", "nuovo_articolo"):
        raise HTTPException(400, "Azione non consentita")
    try:
        return await _esegui(e.azione, e.parametri)
    except KeyError as k:
        raise HTTPException(400, f"Dato mancante: {k}")


# Endpoint per l'app dipendenti (autenticazione con chiave personale, fuori dal router /api protetto da cookie)
mobile_router = APIRouter(prefix="/api/mobile")


@mobile_router.post("/assistente")
async def interpreta_dipendente(req: Richiesta, dip: dict = Depends(get_dipendente)):
    return await _interpreta(req, "dipendente")
