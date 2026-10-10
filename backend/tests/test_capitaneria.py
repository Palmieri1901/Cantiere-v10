"""Tests for Capitaneria module: settings, CRUD, PDF, email, home riepilogo."""
import io
import os
import pytest
import requests

try:
    import fitz  # pymupdf
except Exception:
    fitz = None

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"password": "admin"})
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


DEFAULT_ORDINANZA = "Ordinanza n. 61/2023, in data 03/08/2023 della Capitaneria di porto di Portoferraio"


class TestImpostazioni:
    def test_defaults(self, client):
        r = client.get(f"{API}/capitaneria/impostazioni")
        assert r.status_code == 200
        data = r.json()
        assert "ordinanza" in data
        assert data["dichiarante"] == "Palmieri Sandro"
        assert "marina_di_campo" in data["porti"]
        assert "marciana_marina" in data["porti"]
        # emails default to empty string (may be set by prior tests but field must exist)
        assert "email" in data["porti"]["marina_di_campo"]
        assert "email" in data["porti"]["marciana_marina"]

    def test_update_and_reload(self, client):
        payload = {
            "ordinanza": "Ordinanza n. 99/2026",
            "porti": {"marina_di_campo": {"email": "delivered@resend.dev"}},
        }
        r = client.put(f"{API}/capitaneria/impostazioni", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ordinanza"] == "Ordinanza n. 99/2026"
        assert data["porti"]["marina_di_campo"]["email"] == "delivered@resend.dev"
        # reload
        r2 = client.get(f"{API}/capitaneria/impostazioni")
        d2 = r2.json()
        assert d2["ordinanza"] == "Ordinanza n. 99/2026"
        assert d2["porti"]["marina_di_campo"]["email"] == "delivered@resend.dev"


@pytest.fixture(scope="class")
def created_doc(client):
    payload = {
        "porto": "marina_di_campo",
        "data_operazione": "2026-07-01",
        "ora_operazione": "10.00",
        "alaggio": True,
        "varo": False,
        "unita_nome": "TEST QA",
        "unita_lunghezza": "7.4",
        "dichiarante": "Palmieri Sandro",
        "ditta": "GEB di Palmieri Sandro",
        "ordinanza": DEFAULT_ORDINANZA,
        "delegazione_spiaggia": "Campo nell'Elba",
        "porto_nome": "Marina di Campo",
    }
    r = client.post(f"{API}/capitaneria/comunicazioni", json=payload)
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["id"]
    yield doc
    # cleanup
    client.delete(f"{API}/capitaneria/comunicazioni/{doc['id']}")


class TestCRUD:
    def test_create_and_list_filter(self, client, created_doc):
        r = client.get(f"{API}/capitaneria/comunicazioni", params={"porto": "marina_di_campo"})
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert created_doc["id"] in ids
        # not in other porto
        r2 = client.get(f"{API}/capitaneria/comunicazioni", params={"porto": "marciana_marina"})
        ids2 = [d["id"] for d in r2.json()]
        assert created_doc["id"] not in ids2

    def test_put_update(self, client, created_doc):
        upd = {**created_doc, "unita_lunghezza": "8.0"}
        r = client.put(f"{API}/capitaneria/comunicazioni/{created_doc['id']}", json=upd)
        assert r.status_code == 200
        assert r.json()["unita_lunghezza"] == "8.0"

    def test_create_invalid_porto(self, client):
        r = client.post(f"{API}/capitaneria/comunicazioni", json={"porto": "roma"})
        assert r.status_code == 400

    def test_pdf_download(self, client, created_doc):
        r = client.get(f"{API}/capitaneria/comunicazioni/{created_doc['id']}/pdf")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 500
        if fitz:
            d = fitz.open(stream=r.content, filetype="pdf")
            assert d.page_count == 1
            text = d[0].get_text()
            assert "Allegato 1" in text
            assert "TEST QA" in text
            assert "Delegazione di Spiaggia" in text
            assert "Palmieri Sandro" in text

    def test_pdf_anteprima(self, client):
        payload = {"porto": "marciana_marina", "unita_nome": "ANTEPRIMA", "alaggio": True,
                   "data_operazione": "2026-08-02", "ora_operazione": "09.30"}
        r = client.post(f"{API}/capitaneria/pdf", json=payload)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"


class TestEmail:
    def test_send_ok(self, client, created_doc):
        # ensure email set on marina_di_campo
        client.put(f"{API}/capitaneria/impostazioni", json={"porti": {"marina_di_campo": {"email": "delivered@resend.dev"}}})
        r = client.post(f"{API}/capitaneria/comunicazioni/{created_doc['id']}/invia-email")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["inviata_a"] == "delivered@resend.dev"
        # verify persisted
        lst = client.get(f"{API}/capitaneria/comunicazioni", params={"porto": "marina_di_campo"}).json()
        doc = next(d for d in lst if d["id"] == created_doc["id"])
        assert doc.get("inviata_at")

    def test_send_without_email(self, client):
        # create on marciana_marina
        r = client.post(f"{API}/capitaneria/comunicazioni", json={"porto": "marciana_marina", "alaggio": True,
                                                                   "data_operazione": "2026-07-02", "ora_operazione": "11.00",
                                                                   "unita_nome": "TEST NOEMAIL"})
        cid = r.json()["id"]
        # ensure marciana_marina email is empty
        client.put(f"{API}/capitaneria/impostazioni", json={"porti": {"marciana_marina": {"email": ""}}})
        r2 = client.post(f"{API}/capitaneria/comunicazioni/{cid}/invia-email")
        assert r2.status_code == 400
        client.delete(f"{API}/capitaneria/comunicazioni/{cid}")


class TestHomeRiepilogo:
    def test_home_includes_capitaneria(self, client):
        r = client.get(f"{API}/home/riepilogo")
        assert r.status_code == 200
        data = r.json()
        assert "capitaneria" in data
        assert isinstance(data["capitaneria"], int)


class TestCleanupExistingSeed:
    def test_delete_seed_doc_if_any(self, client):
        # best effort - delete the seed id if present
        seed = "7f2b3c71-ad28-4860-809d-c06c2b9adc32"
        client.delete(f"{API}/capitaneria/comunicazioni/{seed}")


def test_restore_defaults(client):
    """Final: restore ordinanza and clear emails."""
    r = client.put(f"{API}/capitaneria/impostazioni", json={
        "ordinanza": DEFAULT_ORDINANZA,
        "porti": {"marina_di_campo": {"email": ""}, "marciana_marina": {"email": ""}},
    })
    assert r.status_code == 200
    d = r.json()
    assert d["ordinanza"] == DEFAULT_ORDINANZA
    assert d["porti"]["marina_di_campo"]["email"] == ""
