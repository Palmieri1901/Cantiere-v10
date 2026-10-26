"""Endpoints CRUD lavori (storico strutturato) + integrazione magazzino."""
import re
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException

from database import db
from models import Lavoro, LavoroCreate, MovimentoMagazzino
from helpers import serialize

router = APIRouter()


def _norm_liberi(items) -> list:
    """Articoli non in magazzino: [{descrizione, quantita, prezzo_unitario, totale}]"""
    out = []
    for it in items or []:
        descr = str(it.get("descrizione") or "").strip()
        qt = float(it.get("quantita") or 0)
        pu = float(it.get("prezzo_unitario") or 0)
        if not descr and qt * pu == 0:
            continue
        out.append({"descrizione": descr, "quantita": qt, "prezzo_unitario": pu, "totale": round(qt * pu, 2), "unita": str(it.get("unita") or "").strip(),
                    **({"listino_id": it["listino_id"], "listino_q": float(it.get("listino_q") or 0), "listino_q2": float(it.get("listino_q2") or 0)} if it.get("listino_id") else {})})
    return out


async def _scarica_articoli_magazzino(articoli: list, cliente: dict, lavoro_id: str, data: str) -> tuple[float, list]:
    """Per ogni articolo di magazzino usato: valida stock, decrementa la giacenza
    e crea un movimento di scarico. Restituisce (costo_totale, lista_snapshot).
    """
    if not articoli:
        return 0.0, []

    costo_extra = 0.0
    snapshot = []
    cliente_nome = f"{cliente.get('cognome','')} {cliente.get('nome','')}".strip() or "Cliente"

    for item in articoli:
        aid = item.get("articolo_id")
        qt = float(item.get("quantita") or 0)
        if not aid or qt <= 0:
            continue

        art = await db.articoli.find_one({"id": aid}, {"_id": 0})
        if not art:
            raise HTTPException(400, f"Articolo {aid} non trovato in magazzino")

        prezzo_unit = float(item.get("prezzo_unitario") or art.get("prezzo_listino") or 0)
        nuova_giacenza = float(art.get("quantita", 0)) - qt

        await db.articoli.update_one(
            {"id": aid},
            {"$set": {"quantita": nuova_giacenza, "updated_at": datetime.utcnow()}},
        )

        mv = MovimentoMagazzino(
            articolo_id=aid, tipo="scarico", quantita=-qt,
            quantita_dopo=nuova_giacenza,
            motivo=f"Lavoro cliente {cliente_nome}",
            data=data,
            cliente_id=cliente.get("id"),
            cliente_nome=cliente_nome,
            lavoro_id=lavoro_id,
        )
        await db.movimenti_magazzino.insert_one(mv.model_dump())

        costo_extra += qt * prezzo_unit
        snapshot.append({
            "articolo_id": aid,
            "codice": art.get("codice", ""),
            "nome": art.get("nome", ""),
            "unita": art.get("unita_misura") or "",
            "quantita": qt,
            "prezzo_unitario": prezzo_unit,
            "totale": qt * prezzo_unit,
        })

    return costo_extra, snapshot


async def _person_ids(cliente_id: str) -> list:
    """Id di tutte le schede annuali della stessa persona (cognome+nome)."""
    c = await db.clienti.find_one({"id": cliente_id}, {"_id": 0, "nome": 1, "cognome": 1})
    if not c:
        return [cliente_id]
    same = await db.clienti.find(
        {"cognome": {"$regex": f"^{re.escape((c.get('cognome') or '').strip())}$", "$options": "i"},
         "nome": {"$regex": f"^{re.escape((c.get('nome') or '').strip())}$", "$options": "i"}},
        {"_id": 0, "id": 1},
    ).to_list(200)
    return list({cliente_id, *[x["id"] for x in same]})


async def sync_lavori_cliente(cliente_id: str):
    """Denormalizza su ogni scheda annuale della persona i lavori dell'anno (costo_lavori + lavori_storico)."""
    ids = await _person_ids(cliente_id)
    lavori = await db.lavori.find({"cliente_id": {"$in": ids}}, {"_id": 0}).sort("data", 1).to_list(2000)
    schede = await db.clienti.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "anno": 1}).to_list(200)
    for s in schede:
        anno = str(s.get("anno") or "")
        mine = [l for l in lavori if str(l.get("data") or "")[:4] == anno]
        await db.clienti.update_one({"id": s["id"]}, {"$set": {
            "costo_lavori": round(sum(float(l.get("costo") or 0) for l in mine), 2),
            "lavori_storico": [{"id": l["id"], "data": l.get("data"), "tipo": l.get("tipo"), "descrizione": l.get("descrizione", ""),
                                 "costo": float(l.get("costo") or 0), "ore": float(l.get("ore") or 0), "dipendente": l.get("dipendente", ""),
                                 "articoli_magazzino": l.get("articoli_magazzino") or [], "articoli_liberi": l.get("articoli_liberi") or []} for l in mine],
        }})


@router.get("/clienti/{cliente_id}/lavori", response_model=List[Lavoro])
async def list_lavori(cliente_id: str):
    # Lo storico è della persona: unisco i lavori di tutte le schede annuali con stesso cognome+nome
    ids = await _person_ids(cliente_id)
    docs = await db.lavori.find({"cliente_id": {"$in": ids}}, {"_id": 0}).sort("data", -1).to_list(1000)
    for d in docs:
        if isinstance(d.get("created_at"), str):
            try:
                d["created_at"] = datetime.fromisoformat(d["created_at"])
            except Exception:
                pass
    return [Lavoro(**d) for d in docs]


@router.post("/lavori", response_model=Lavoro)
async def create_lavoro(payload: LavoroCreate):
    if payload.stato not in ("pianificato", "in_corso", "completato"):
        raise HTTPException(400, "Stato non valido")
    c = await db.clienti.find_one({"id": payload.cliente_id})
    if not c:
        c = await db.clienti_esterni.find_one({"id": payload.cliente_id})
        if c:
            c = {**c, "cognome": c.get("nome", ""), "nome": ""}
    if not c:
        raise HTTPException(404, "Cliente non trovato")

    data = {k: v for k, v in payload.model_dump().items() if v is not None}
    articoli_input = data.pop("articoli_magazzino", None) or []
    liberi = _norm_liberi(data.pop("articoli_liberi", None))

    lavoro = Lavoro(**data)
    lavoro.articoli_liberi = liberi
    lavoro.costo = float(lavoro.costo or 0) + sum(x["totale"] for x in liberi)
    # Prima creo il record poi decurto il magazzino (così il lavoro_id è disponibile)
    await db.lavori.insert_one(serialize(lavoro))

    costo_extra, snapshot = await _scarica_articoli_magazzino(
        articoli_input, c, lavoro.id, payload.data,
    )

    if snapshot:
        lavoro.articoli_magazzino = snapshot
        lavoro.costo = float(lavoro.costo or 0) + costo_extra
        await db.lavori.update_one(
            {"id": lavoro.id},
            {"$set": {"articoli_magazzino": snapshot, "costo": lavoro.costo}},
        )
    await sync_lavori_cliente(lavoro.cliente_id)
    return lavoro


@router.put("/lavori/{lavoro_id}", response_model=Lavoro)
async def update_lavoro(lavoro_id: str, payload: LavoroCreate):
    existing = await db.lavori.find_one({"id": lavoro_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Lavoro non trovato")
    if payload.stato not in ("pianificato", "in_corso", "completato"):
        raise HTTPException(400, "Stato non valido")

    payload_data = payload.model_dump()
    articoli_new_input = payload_data.pop("articoli_magazzino", None)
    articoli_old = existing.get("articoli_magazzino") or []
    liberi_input = payload_data.pop("articoli_liberi", None)
    liberi_old = existing.get("articoli_liberi") or []
    liberi_finale = liberi_old if liberi_input is None else _norm_liberi(liberi_input)
    # Il client invia costo = manodopera/voce; gli articoli (magazzino + liberi) vengono sommati qui sotto
    costo_base = float(payload_data.get("costo") or 0)
    if liberi_input is None and articoli_new_input is None:
        costo_base = (float(payload_data.get("costo") or existing.get("costo") or 0)
                      - sum(float(x.get("totale") or 0) for x in liberi_old)
                      - sum(float(x.get("totale") or 0) for x in articoli_old))

    # Snapshot definitivo per il lavoro (di default resta quello esistente)
    snapshot_finale = articoli_old
    costo_delta_magazzino = 0.0

    # Se il client ha inviato la lista aggiornata, calcolo il delta con quella salvata
    if articoli_new_input is not None:
        cliente = await db.clienti.find_one({"id": existing.get("cliente_id")}, {"_id": 0}) or {}
        cliente_nome = f"{cliente.get('cognome','')} {cliente.get('nome','')}".strip() or "Cliente"
        data_str = payload.data or existing.get("data") or datetime.now().strftime("%Y-%m-%d")

        def _sum_by_aid(items):
            m = {}
            for it in items or []:
                aid = it.get("articolo_id")
                if not aid:
                    continue
                m[aid] = m.get(aid, 0.0) + float(it.get("quantita") or 0)
            return m

        old_map = _sum_by_aid(articoli_old)
        new_map = _sum_by_aid(articoli_new_input)
        all_ids = set(old_map.keys()) | set(new_map.keys())

        snapshot_finale = []
        # Ricostruzione snapshot: prendo prezzo dal payload se presente altrimenti dal vecchio
        prezzo_map = {}
        for it in (articoli_new_input or []):
            aid = it.get("articolo_id")
            if aid and it.get("prezzo_unitario") is not None:
                prezzo_map[aid] = float(it.get("prezzo_unitario") or 0)
        for it in articoli_old:
            aid = it.get("articolo_id")
            if aid and aid not in prezzo_map:
                prezzo_map[aid] = float(it.get("prezzo_unitario") or 0)

        for aid in all_ids:
            old_q = float(old_map.get(aid, 0) or 0)
            new_q = float(new_map.get(aid, 0) or 0)
            delta = new_q - old_q  # >0 = scarico ulteriore, <0 = restituzione
            if abs(delta) < 1e-9 and new_q == 0:
                # Articolo rimosso da entrambe le liste vuote → skip
                continue

            art = await db.articoli.find_one({"id": aid}, {"_id": 0})
            if not art and delta > 0:
                raise HTTPException(400, f"Articolo {aid} non trovato in magazzino")

            if delta != 0 and art:
                nuova_giacenza = float(art.get("quantita", 0)) - delta
                await db.articoli.update_one(
                    {"id": aid},
                    {"$set": {"quantita": nuova_giacenza, "updated_at": datetime.utcnow()}},
                )
                tipo_mv = "scarico" if delta > 0 else "carico"
                mv = MovimentoMagazzino(
                    articolo_id=aid, tipo=tipo_mv,
                    quantita=(-delta if delta > 0 else abs(delta)),
                    quantita_dopo=nuova_giacenza,
                    motivo=f"Aggiornamento lavoro · Cliente {cliente_nome}",
                    data=data_str,
                    cliente_id=cliente.get("id"),
                    cliente_nome=cliente_nome,
                    lavoro_id=lavoro_id,
                )
                await db.movimenti_magazzino.insert_one(mv.model_dump())

            if new_q > 0:
                prezzo_unit = float(prezzo_map.get(aid) or (art or {}).get("prezzo_listino") or 0)
                snapshot_finale.append({
                    "articolo_id": aid,
                    "codice": (art or {}).get("codice", "") or "",
                    "nome": (art or {}).get("nome", "") or "",
                    "unita": (art or {}).get("unita_misura") or "",
                    "quantita": new_q,
                    "prezzo_unitario": prezzo_unit,
                    "totale": new_q * prezzo_unit,
                })
                costo_delta_magazzino += new_q * prezzo_unit

        # Ricalcola costo togliendo il vecchio contributo magazzino e aggiungendo il nuovo
    merged = {**existing, **{k: v for k, v in payload_data.items() if v is not None}}
    merged["costo"] = round(costo_base + sum(float(x.get("totale") or 0) for x in snapshot_finale) + sum(float(x.get("totale") or 0) for x in liberi_finale), 2)
    merged["id"] = lavoro_id
    merged["articoli_magazzino"] = snapshot_finale
    merged["articoli_liberi"] = liberi_finale
    lavoro = Lavoro(**merged)
    await db.lavori.update_one({"id": lavoro_id}, {"$set": serialize(lavoro)})
    await sync_lavori_cliente(lavoro.cliente_id)
    return lavoro


@router.delete("/lavori/{lavoro_id}")
async def delete_lavoro(lavoro_id: str):
    existing = await db.lavori.find_one({"id": lavoro_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Lavoro non trovato")

    # Ripristina la giacenza di ogni articolo scaricato al momento della creazione
    ripristinati = 0
    saltati = 0
    articoli_usati = existing.get("articoli_magazzino") or []
    cliente = await db.clienti.find_one({"id": existing.get("cliente_id")}, {"_id": 0}) or {}
    cliente_nome = f"{cliente.get('cognome','')} {cliente.get('nome','')}".strip() or "Cliente"

    for item in articoli_usati:
        aid = item.get("articolo_id")
        qt = float(item.get("quantita") or 0)
        if not aid or qt <= 0:
            continue
        art = await db.articoli.find_one({"id": aid}, {"_id": 0})
        if not art:
            # Articolo eliminato dal magazzino nel frattempo: non ripristiniamo
            saltati += 1
            continue
        nuova_giacenza = float(art.get("quantita", 0)) + qt
        await db.articoli.update_one(
            {"id": aid},
            {"$set": {"quantita": nuova_giacenza, "updated_at": datetime.utcnow()}},
        )
        mv = MovimentoMagazzino(
            articolo_id=aid, tipo="carico", quantita=qt,
            quantita_dopo=nuova_giacenza,
            motivo=f"Storno lavoro eliminato · Cliente {cliente_nome}",
            data=datetime.now().strftime("%Y-%m-%d"),
            cliente_id=cliente.get("id"),
            cliente_nome=cliente_nome,
            lavoro_id=lavoro_id,
        )
        await db.movimenti_magazzino.insert_one(mv.model_dump())
        ripristinati += 1

    await db.lavori.delete_one({"id": lavoro_id})
    await sync_lavori_cliente(existing.get("cliente_id"))
    return {"ok": True, "giacenze_ripristinate": ripristinati, "articoli_saltati": saltati}
