"""Backend tests for Calendario module."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://marina-workspace.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"password": "admin"}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


# ---- Tipi ----
class TestTipi:
    def test_default_tipi(self, client):
        # Reset to default by deleting via PUT with defaults
        r = client.get(f"{API}/calendario/tipi")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 3
        # If first load (no saved), should match defaults
        ids = {t["id"] for t in data}
        # Not strict since may have been overridden, but check structure
        for t in data:
            assert {"id", "nome", "colore"} <= set(t.keys())

    def test_put_tipi_assigns_uuid_for_new(self, client):
        payload = [
            {"id": "alaggio", "nome": "Alaggio", "colore": "#2563eb"},
            {"id": "varo", "nome": "Varo", "colore": "#0d9488"},
            {"id": "altro", "nome": "Altro", "colore": "#6b7280"},
            {"nome": "TEST_Consegna", "colore": "#ef4444"},  # no id -> uuid
        ]
        r = client.put(f"{API}/calendario/tipi", json=payload)
        assert r.status_code == 200, r.text
        saved = r.json()
        assert len(saved) == 4
        new_item = [t for t in saved if t["nome"] == "TEST_Consegna"][0]
        assert new_item["id"] and new_item["id"] != ""
        assert len(new_item["id"]) >= 8  # uuid-ish

    def test_put_tipi_empty_400(self, client):
        r = client.put(f"{API}/calendario/tipi", json=[])
        assert r.status_code == 400


# ---- Eventi ----
@pytest.fixture(scope="module")
def created_ids():
    return []


class TestEventi:
    def test_create_evento(self, client, created_ids):
        r = client.post(f"{API}/calendario/eventi", json={
            "data": "2026-10-15", "ora": "09:30", "titolo": "TEST_Alaggio Rossi",
            "tipo_id": "alaggio", "note": "Barca 7m"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["titolo"] == "TEST_Alaggio Rossi"
        assert d["data"] == "2026-10-15"
        assert "id" in d
        created_ids.append(d["id"])

    def test_create_empty_titolo_400(self, client):
        r = client.post(f"{API}/calendario/eventi", json={
            "data": "2026-10-15", "titolo": "  ", "tipo_id": "altro"
        })
        assert r.status_code == 400

    def test_list_by_month(self, client, created_ids):
        # Create another in different month
        r = client.post(f"{API}/calendario/eventi", json={
            "data": "2026-11-05", "titolo": "TEST_Varo", "tipo_id": "varo"
        })
        assert r.status_code == 200
        created_ids.append(r.json()["id"])

        r = client.get(f"{API}/calendario/eventi", params={"anno": 2026, "mese": 10})
        assert r.status_code == 200
        lst = r.json()
        assert all(e["data"].startswith("2026-10-") for e in lst)
        assert any(e["titolo"] == "TEST_Alaggio Rossi" for e in lst)

    def test_list_whole_year(self, client):
        r = client.get(f"{API}/calendario/eventi", params={"anno": 2026})
        assert r.status_code == 200
        lst = r.json()
        datas = [e["data"] for e in lst]
        assert any(d.startswith("2026-10-") for d in datas)
        assert any(d.startswith("2026-11-") for d in datas)

    def test_conteggio_mesi(self, client):
        r = client.get(f"{API}/calendario/conteggio-mesi", params={"anno": 2026})
        assert r.status_code == 200
        d = r.json()
        # keys may be str in JSON
        keys = {int(k) for k in d.keys()}
        assert 10 in keys and 11 in keys
        assert d[str(10)] >= 1 or d.get(10, 0) >= 1

    def test_update_evento(self, client, created_ids):
        eid = created_ids[0]
        r = client.put(f"{API}/calendario/eventi/{eid}", json={
            "data": "2026-10-16", "ora": "10:00", "titolo": "TEST_Alaggio Updated",
            "tipo_id": "altro", "note": "upd"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["titolo"] == "TEST_Alaggio Updated"
        assert d["data"] == "2026-10-16"

    def test_update_unknown_404(self, client):
        r = client.put(f"{API}/calendario/eventi/nonexistent-id", json={
            "data": "2026-10-16", "titolo": "x", "tipo_id": "altro"
        })
        assert r.status_code == 404

    def test_delete_unknown_404(self, client):
        r = client.delete(f"{API}/calendario/eventi/nonexistent-id")
        assert r.status_code == 404

    def test_delete_evento(self, client, created_ids):
        for eid in list(created_ids):
            r = client.delete(f"{API}/calendario/eventi/{eid}")
            assert r.status_code == 200
            created_ids.remove(eid)


class TestHomeRiepilogo:
    def test_calendario_mese_present(self, client):
        r = client.get(f"{API}/home/riepilogo")
        assert r.status_code == 200, r.text
        d = r.json()
        assert "calendario_mese" in d
        assert isinstance(d["calendario_mese"], int)


class TestCleanup:
    def test_restore_default_tipi(self, client):
        payload = [
            {"id": "alaggio", "nome": "Alaggio", "colore": "#2563eb"},
            {"id": "varo", "nome": "Varo", "colore": "#0d9488"},
            {"id": "altro", "nome": "Altro", "colore": "#6b7280"},
        ]
        r = client.put(f"{API}/calendario/tipi", json=payload)
        assert r.status_code == 200
