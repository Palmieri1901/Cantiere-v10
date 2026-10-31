"""Valutazioni usato: quotazione AI (stile Eurotax) di gommoni e motori fuoribordo, con report PDF su carta intestata."""
import io
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import db
from ai_client import testo
from pdf_builders import build_documento_servizio_pdf

router = APIRouter(prefix="/valutazioni")

STATI = ("ottimo", "buono", "pessimo")


class MotoreIn(BaseModel):
    modello: str
    anno: int
    ore: Optional[float] = 0
    stato: str = "buono"


class GommoneIn(BaseModel):
    modello: str
    anno: int
    stato: str = "buono"
    tubolari_nuovi: bool = False
    tubolari_anni: Optional[int] = None


class ValutazioneIn(BaseModel):
    cliente: Optional[str] = ""
    telefono: Optional[str] = ""
    note: Optional[str] = ""
    motore: Optional[MotoreIn] = None
    gommone: Optional[GommoneIn] = None


SYSTEM = (
    "Sei un perito nautico italiano esperto di usato (gommoni e fuoribordo), con conoscenza dei listini tipo Eurotax/Nautica usato. "
    "Fornisci quotazioni realistiche in euro per il mercato italiano dell'anno corrente, stimando valore minimo, massimo e consigliato "
    "per vendita tra privati/permuta in cantiere. Considera anno, ore moto, stato generale, prezzo di listino del nuovo, deprezzamento tipico, "
    "tubolari rifatti (per i gommoni). Rispondi SOLO con JSON valido, senza testo attorno."
)


def _descr(p: ValutazioneIn) -> str:
    parti = []
    if p.motore:
        m = p.motore
        parti.append(f"MOTORE: modello {m.modello}, anno {m.anno}, ore moto {m.ore or 0:g}, stato generale {m.stato}.")
    if p.gommone:
        g = p.gommone
        tub = f"tubolari rifatti/nuovi da {g.tubolari_anni} anni" if g.tubolari_nuovi and g.tubolari_anni is not None else ("tubolari nuovi" if g.tubolari_nuovi else "tubolari originali")
        parti.append(f"GOMMONE: modello {g.modello}, anno {g.anno}, stato generale {g.stato}, {tub}.")
    if p.note:
        parti.append(f"Note aggiuntive: {p.note}")
    return "\n".join(parti)


def _parse(raw: str) -> dict:
    s = raw.strip()
    s = re.sub(r"^```(?:json)?", "", s).strip()
    s = re.sub(r"```$", "", s).strip()
    m = re.search(r"\{.*\}", s, re.S)
    if not m:
        raise HTTPException(502, "Risposta AI non valida")
    cand = m.group(0)
    for fix in (lambda x: x, lambda x: re.sub(r",\s*([}\]])", r"\1", x), lambda x: re.sub(r",\s*([}\]])", r"\1", x.replace("\u20ac", "EUR").replace("\n", " "))):
        try:
            return json.loads(fix(cand))
        except Exception:
            continue
    raise HTTPException(502, "Risposta AI non interpretabile")


async def _chiedi(prompt: str) -> dict:
    ultimo = None
    for tentativo in range(3):
        try:
            extra = "" if tentativo == 0 else "\nATTENZIONE: la risposta precedente non era JSON valido. Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza markdown, senza commenti, stringhe senza virgolette interne."
            return _parse(await testo(SYSTEM, prompt + extra))
        except Exception as e:
            ultimo = e
    raise ultimo


async def _elabora(vid: str, p: ValutazioneIn):
    anno = datetime.now().year
    schema = {
        "motore": {"valore_min": 0, "valore_max": 0, "valore_consigliato": 0, "prezzo_nuovo_stimato": 0, "fattori": ["..."], "note": "..."},
        "gommone": {"valore_min": 0, "valore_max": 0, "valore_consigliato": 0, "prezzo_nuovo_stimato": 0, "fattori": ["..."], "note": "..."},
        "totale": {"valore_min": 0, "valore_max": 0, "valore_consigliato": 0},
        "commento": "sintesi in 2-3 frasi per il cliente",
    }
    prompt = (
        f"Anno corrente: {anno}.\n{_descr(p)}\n\n"
        f"Restituisci JSON con questo schema (ometti la chiave 'motore' o 'gommone' se non presente, valori interi in euro, massimo 5 fattori brevi, note e commento concisi): {json.dumps(schema, ensure_ascii=False)}"
    )
    try:
        res = await _chiedi(prompt)
        await db.valutazioni.update_one({"id": vid}, {"$set": {"risultato": res, "stato": "pronta"}})
    except Exception as e:
        msg = getattr(e, "detail", None) or str(e) or "Errore AI"
        await db.valutazioni.update_one({"id": vid}, {"$set": {"stato": "errore", "errore": str(msg)[:300]}})


@router.post("")
async def crea_valutazione(p: ValutazioneIn, bg: BackgroundTasks):
    if not p.motore and not p.gommone:
        raise HTTPException(400, "Indica almeno un motore o un gommone")
    for s in [p.motore and p.motore.stato, p.gommone and p.gommone.stato]:
        if s and s not in STATI:
            raise HTTPException(400, "Stato non valido (ottimo/buono/pessimo)")
    doc = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cliente": (p.cliente or "").strip(),
        "telefono": (p.telefono or "").strip(),
        "note": (p.note or "").strip(),
        "motore": p.motore.model_dump() if p.motore else None,
        "gommone": p.gommone.model_dump() if p.gommone else None,
        "risultato": None,
        "stato": "in_corso",
    }
    await db.valutazioni.insert_one({**doc})
    bg.add_task(_elabora, doc["id"], p)
    return doc


@router.get("")
async def lista_valutazioni(limit: int = 100):
    return await db.valutazioni.find({}, {"_id": 0}).sort("created_at", -1).to_list(limit)


@router.get("/{vid}")
async def get_valutazione(vid: str):
    d = await db.valutazioni.find_one({"id": vid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Valutazione non trovata")
    return d


@router.post("/{vid}/riprova")
async def riprova_valutazione(vid: str, bg: BackgroundTasks):
    d = await db.valutazioni.find_one({"id": vid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Valutazione non trovata")
    p = ValutazioneIn(cliente=d.get("cliente"), telefono=d.get("telefono"), note=d.get("note"),
                      motore=MotoreIn(**d["motore"]) if d.get("motore") else None, gommone=GommoneIn(**d["gommone"]) if d.get("gommone") else None)
    await db.valutazioni.update_one({"id": vid}, {"$set": {"stato": "in_corso", "errore": ""}})
    bg.add_task(_elabora, vid, p)
    return {"ok": True}


@router.delete("/{vid}")
async def elimina_valutazione(vid: str):
    r = await db.valutazioni.delete_one({"id": vid})
    if not r.deleted_count:
        raise HTTPException(404, "Valutazione non trovata")
    return {"ok": True}


def _eur(v) -> str:
    try:
        return f"€ {float(v or 0):,.0f}".replace(",", ".")
    except Exception:
        return "—"


@router.get("/{vid}/pdf")
async def pdf_valutazione(vid: str):
    d = await db.valutazioni.find_one({"id": vid}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Valutazione non trovata")
    if not d.get("risultato"):
        raise HTTPException(400, "Valutazione non ancora pronta")
    cant = await db.cantiere.find_one({"id": "default"}, {"_id": 0}) or {}
    r = d.get("risultato") or {}
    blocchi = []
    if d.get("cliente") or d.get("telefono"):
        blocchi.append(("Cliente", [("Nominativo", d.get("cliente") or "—"), ("Telefono", d.get("telefono") or "—")]))
    if d.get("motore"):
        m, rm = d["motore"], r.get("motore") or {}
        blocchi.append(("Motore fuoribordo", [
            ("Modello", m["modello"]), ("Anno", str(m["anno"])), ("Ore moto", f"{float(m.get('ore') or 0):g} h"), ("Stato generale", str(m.get("stato", "")).capitalize()),
            ("Quotazione", f"{_eur(rm.get('valore_min'))} – {_eur(rm.get('valore_max'))}"), ("Valore consigliato", _eur(rm.get("valore_consigliato"))),
        ]))
    if d.get("gommone"):
        g, rg = d["gommone"], r.get("gommone") or {}
        tub = (f"Rifatti da {g.get('tubolari_anni')} anni" if g.get("tubolari_nuovi") and g.get("tubolari_anni") is not None else ("Nuovi" if g.get("tubolari_nuovi") else "Originali"))
        blocchi.append(("Gommone", [
            ("Modello", g["modello"]), ("Anno", str(g["anno"])), ("Stato generale", str(g.get("stato", "")).capitalize()), ("Tubolari", tub),
            ("Quotazione", f"{_eur(rg.get('valore_min'))} – {_eur(rg.get('valore_max'))}"), ("Valore consigliato", _eur(rg.get("valore_consigliato"))),
        ]))
    if d.get("motore") and d.get("gommone") and r.get("totale"):
        t = r["totale"]
        blocchi.append(("Valutazione complessiva", [("Quotazione", f"{_eur(t.get('valore_min'))} – {_eur(t.get('valore_max'))}"), ("Valore consigliato", _eur(t.get("valore_consigliato")))]))
    righe = []
    for k, lab in (("motore", "Motore"), ("gommone", "Gommone")):
        rr = r.get(k) or {}
        if rr.get("fattori"):
            righe.append(f"{lab} – fattori considerati: " + "; ".join(str(x) for x in rr["fattori"]))
        if rr.get("note"):
            righe.append(f"{lab}: {rr['note']}")
    if r.get("commento"):
        righe.append(r["commento"])
    righe.append("Valutazione indicativa elaborata con il supporto di intelligenza artificiale sulla base dei dati dichiarati e dei valori medi di mercato dell'usato nautico; non costituisce perizia. "
                 "Il valore definitivo è soggetto a verifica diretta del mezzo.")
    pdf = build_documento_servizio_pdf(cant, "VALUTAZIONE USATO", blocchi, testo="\n".join(righe))
    nome = (d.get("cliente") or (d.get("gommone") or {}).get("modello") or (d.get("motore") or {}).get("modello") or "usato").replace(" ", "_")
    return StreamingResponse(io.BytesIO(pdf), media_type="application/pdf",
                             headers={"Content-Disposition": f'inline; filename="Valutazione_{nome}.pdf"'})
