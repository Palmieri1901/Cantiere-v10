# Annulla eliminazione (cestino): X-Cestino header on DELETE + POST /api/cestino/{batch}/ripristina
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    r = ses.post(f"{API}/auth/login", json={"password": "admin"}, timeout=15)
    if r.status_code != 200:
        pytest.skip("login failed")
    return ses


@pytest.fixture(scope="module")
def cleanup(s):
    ids = {"esterni": [], "articoli": [], "lavori": []}
    yield ids
    for l in ids["lavori"]:
        s.delete(f"{API}/lavori/{l}")
    for e in ids["esterni"]:
        for p in s.get(f"{API}/esterni/{e}/preventivi").json() or []:
            s.delete(f"{API}/esterni/preventivi/{p['id']}")
        s.delete(f"{API}/esterni/{e}")
    for a in ids["articoli"]:
        s.delete(f"{API}/magazzino/articoli/{a}")


def _esterni(s):
    return {e["id"]: e for e in s.get(f"{API}/esterni").json()}


def _articolo(s, aid):
    return next((a for a in s.get(f"{API}/magazzino/articoli").json() if a["id"] == aid), None)


# Unauthenticated restore must be 401
def test_unauth_401():
    r = requests.post(f"{API}/cestino/x/ripristina")
    assert r.status_code == 401


# GET never carries X-Cestino
def test_get_no_header(s):
    r = s.get(f"{API}/esterni")
    assert r.status_code == 200
    assert "x-cestino" not in {k.lower() for k in r.headers}


# DELETE of non-existent -> 404 and no header
def test_delete_404_no_header(s):
    r = s.delete(f"{API}/esterni/nonexistent-xyz")
    assert r.status_code == 404
    assert "X-Cestino" not in r.headers


# Unknown batch -> 404
def test_unknown_batch_404(s):
    r = s.post(f"{API}/cestino/doesnotexist123/ripristina")
    assert r.status_code == 404
    assert "Niente da ripristinare" in r.json()["detail"]


# Cascade: esterno + lavoro deleted then restored; second restore 404
def test_esterno_cascade_restore(s, cleanup):
    e = s.post(f"{API}/esterni", json={"nome": "TEST_cestino_be"}).json()
    cleanup["esterni"].append(e["id"])
    lv = s.post(f"{API}/lavori", json={"cliente_id": e["id"], "data": "2026-01-10", "tipo": "Varie", "descrizione": "TEST_lav", "costo": 50})
    assert lv.status_code == 200, lv.text
    lid = lv.json()["id"]
    cleanup["lavori"].append(lid)
    assert _esterni(s)[e["id"]]["n"] == 1

    d = s.delete(f"{API}/esterni/{e['id']}")
    assert d.status_code == 200
    batch = d.headers.get("X-Cestino")
    assert batch
    assert e["id"] not in _esterni(s)

    r = s.post(f"{API}/cestino/{batch}/ripristina")
    assert r.status_code == 200
    assert r.json()["ripristinati"] >= 2
    est = _esterni(s)
    assert e["id"] in est
    assert est[e["id"]]["n"] == 1
    assert est[e["id"]]["totale"] == 50

    r2 = s.post(f"{API}/cestino/{batch}/ripristina")
    assert r2.status_code == 404
    assert "Niente da ripristinare" in r2.json()["detail"]


# Articolo delete + undo restores all fields
def test_articolo_restore(s, cleanup):
    a = s.post(f"{API}/magazzino/articoli", json={"nome": "TEST_art_cestino", "quantita": 10, "prezzo_listino": 5})
    assert a.status_code == 200, a.text
    aid = a.json()["id"]
    cleanup["articoli"].append(aid)
    d = s.delete(f"{API}/magazzino/articoli/{aid}")
    batch = d.headers.get("X-Cestino")
    assert d.status_code == 200 and batch
    assert _articolo(s, aid) is None
    assert s.post(f"{API}/cestino/{batch}/ripristina").status_code == 200
    art = _articolo(s, aid)
    assert art and art["quantita"] == 10 and art["nome"].lower().startswith("test_art_cestino")


# Undo of lavoro that used magazzino stock: stock must be re-decremented (consistency)
def test_lavoro_with_stock_restore_consistency(s, cleanup):
    a = s.post(f"{API}/magazzino/articoli", json={"nome": "TEST_art_stock", "quantita": 10, "prezzo_listino": 5}).json()
    cleanup["articoli"].append(a["id"])
    e = s.post(f"{API}/esterni", json={"nome": "TEST_cestino_stock"}).json()
    cleanup["esterni"].append(e["id"])
    lv = s.post(f"{API}/lavori", json={"cliente_id": e["id"], "data": "2026-01-10", "tipo": "Varie", "costo": 0,
                                         "articoli_magazzino": [{"articolo_id": a["id"], "quantita": 3}]}).json()
    cleanup["lavori"].append(lv["id"])
    assert _articolo(s, a["id"])["quantita"] == 7
    d = s.delete(f"{API}/lavori/{lv['id']}")
    batch = d.headers.get("X-Cestino")
    assert batch
    assert _articolo(s, a["id"])["quantita"] == 10
    assert s.post(f"{API}/cestino/{batch}/ripristina").status_code == 200
    q = _articolo(s, a["id"])["quantita"]
    assert q == 7, f"After undo lavoro is back (uses 3 pcs) but stock is {q} (expected 7)"
