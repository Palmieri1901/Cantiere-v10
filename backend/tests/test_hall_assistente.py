"""Backend tests for AI assistant 'Hall' - /api/assistente/* and /api/mobile/assistente."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marina-workspace.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ANSELMI_HINT = "anselmi"
ARTICOLO_ID = "7a96b8c2-41dd-4a2a-8344-647fccea58ae"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"password": "admin"}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def employee_key(session):
    # create temp employee
    r = session.post(f"{API}/dipendenti", json={"nome": "TEST_Hall"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    key = data.get("chiave")
    did = data.get("id")
    assert key and did
    yield key
    session.delete(f"{API}/dipendenti/{did}")


@pytest.fixture(scope="module")
def anselmi_id(session):
    r = session.get(f"{API}/clienti", timeout=15)
    assert r.status_code == 200
    for c in r.json():
        full = f"{c.get('cognome','')} {c.get('nome','')}".lower()
        if "anselmi" in full:
            return c["id"]
    pytest.skip("Cliente Anselmi non trovato")


def _interpreta(session, testo):
    return session.post(f"{API}/assistente/interpreta", json={"testo": testo}, timeout=60)


# ---------- INTERPRETA ----------
class TestInterpreta:
    def test_empty_text(self, session):
        r = _interpreta(session, "")
        assert r.status_code == 400

    def test_info_articolo(self, session):
        r = _interpreta(session, "quanti anodi alluminio suzuki ho in magazzino?")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("azione") == "info_articolo"
        assert d.get("richiede_conferma") is False
        risposta = (d.get("risposta") or "").lower()
        assert any(k in risposta for k in ("magazzino", "pz", "euro", "prezzo", "giacen"))

    def test_appuntamenti(self, session):
        r = _interpreta(session, "che appuntamenti ho questa settimana?")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("azione") == "appuntamenti"

    def test_nuovo_lavoro(self, session, anselmi_id):
        r = _interpreta(session, "nuovo lavoro antivegetativa 3 ore per anselmi")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("azione") == "nuovo_lavoro"
        assert d.get("richiede_conferma") is True
        assert d.get("parametri", {}).get("cliente_id") == anselmi_id

    def test_scarico(self, session, anselmi_id):
        r = _interpreta(session, "scarica 1 anodo alluminio suzuki per anselmi")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("azione") == "scarico_articolo"
        assert d.get("richiede_conferma") is True
        p = d.get("parametri", {})
        assert p.get("articolo_id") == ARTICOLO_ID
        # cliente ok
        assert p.get("cliente_id") == anselmi_id

    def test_nuovo_appuntamento(self, session):
        r = _interpreta(session, "appuntamento alaggio verdi domani alle 9")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("azione") == "nuovo_appuntamento"
        p = d.get("parametri", {})
        from datetime import datetime, timedelta
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        assert p.get("data") == tomorrow
        assert (p.get("ora") or "").startswith("09")

    def test_non_capito(self, session):
        r = _interpreta(session, "asdf qwerty zxcv blah blah")
        assert r.status_code == 200
        d = r.json()
        assert d.get("azione") in ("non_capito", "risposta")


# ---------- ESEGUI ----------
class TestEsegui:
    def test_whitelist_rejects_info(self, session):
        r = session.post(f"{API}/assistente/esegui", json={"azione": "info_articolo", "parametri": {"articolo_id": ARTICOLO_ID}}, timeout=15)
        assert r.status_code == 400

    def test_scarico_then_carico(self, session):
        # pre-stock
        r0 = session.get(f"{API}/magazzino/articoli", timeout=15)
        art = next(a for a in r0.json() if a["id"] == ARTICOLO_ID)
        q_iniziale = art["quantita"]

        # scarico 1
        rs = session.post(f"{API}/assistente/esegui", json={"azione": "scarico_articolo", "parametri": {"articolo_id": ARTICOLO_ID, "quantita": 1}}, timeout=20)
        assert rs.status_code == 200, rs.text

        r1 = session.get(f"{API}/magazzino/articoli", timeout=15)
        art1 = next(a for a in r1.json() if a["id"] == ARTICOLO_ID)
        assert art1["quantita"] == q_iniziale - 1

        # carico 1 to restore
        rc = session.post(f"{API}/assistente/esegui", json={"azione": "carico_articolo", "parametri": {"articolo_id": ARTICOLO_ID, "quantita": 1}}, timeout=20)
        assert rc.status_code == 200

        r2 = session.get(f"{API}/magazzino/articoli", timeout=15)
        art2 = next(a for a in r2.json() if a["id"] == ARTICOLO_ID)
        assert art2["quantita"] == q_iniziale

    def test_nuovo_appuntamento_and_delete(self, session):
        from datetime import datetime, timedelta
        d = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        r = session.post(f"{API}/assistente/esegui", json={"azione": "nuovo_appuntamento", "parametri": {"data": d, "ora": "10:00", "titolo": "TEST_Hall_Appt", "tipo_id": "altro"}}, timeout=20)
        assert r.status_code == 200, r.text
        ev = r.json().get("evento") or {}
        eid = ev.get("id")
        assert eid
        # verify list
        anno, mese = d[:4], d[5:7]
        lst = session.get(f"{API}/calendario/eventi", params={"anno": anno, "mese": mese}, timeout=15).json()
        assert any(e.get("id") == eid for e in lst)
        # cleanup
        session.delete(f"{API}/calendario/eventi/{eid}")

    def test_nuovo_lavoro_and_delete(self, session, anselmi_id):
        from datetime import datetime
        r = session.post(f"{API}/assistente/esegui", json={"azione": "nuovo_lavoro", "parametri": {"cliente_id": anselmi_id, "tipo": "Antivegetativa", "descrizione": "TEST_Hall", "ore": 1, "data": datetime.now().strftime("%Y-%m-%d")}}, timeout=20)
        assert r.status_code == 200, r.text
        lav = r.json().get("lavoro") or {}
        lid = lav.get("id")
        assert lid
        # verify
        lst = session.get(f"{API}/lavori", params={"cliente_id": anselmi_id}, timeout=15)
        if lst.status_code == 200:
            assert any(l.get("id") == lid for l in lst.json())
        # cleanup
        session.delete(f"{API}/lavori/{lid}")


# ---------- MOBILE ----------
class TestMobileAssistente:
    def test_no_header_401(self):
        r = requests.post(f"{API}/mobile/assistente", json={"testo": "ciao"}, timeout=15)
        assert r.status_code in (401, 403)

    def test_compila_lavoro(self, employee_key, anselmi_id):
        r = requests.post(f"{API}/mobile/assistente",
                          headers={"X-Api-Key": employee_key},
                          json={"testo": "lavoro per anselmi, pulizia carena 2 ore, usato un anodo alluminio suzuki"},
                          timeout=60)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("azione") == "compila_lavoro"
        p = d.get("parametri", {})
        assert p.get("cliente_id") == anselmi_id
        assert p.get("tipo") == "Pulizia"
        assert float(p.get("ore") or 0) == 2
        arts = p.get("articoli") or []
        assert len(arts) >= 1
        assert arts[0].get("articolo_id") == ARTICOLO_ID
        dett = p.get("articoli_dettaglio") or []
        assert len(dett) >= 1
        assert dett[0].get("nome")
