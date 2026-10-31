# Valutazioni usato: regression for barca value 0€ bug (AI key normalization) + PDF content
import io
import os
import time
import pytest
import requests
from pypdf import PdfReader

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
KEYS = ("valore_min", "valore_max", "valore_consigliato")


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{API}/auth/login", json={"password": "admin"}, timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    if tok:
        ss.headers["Authorization"] = f"Bearer {tok}"
    return ss


_created = {}


def _poll(s, vid, maxs=150):
    t0 = time.time()
    while time.time() - t0 < maxs:
        d = s.get(f"{API}/valutazioni/{vid}", timeout=20).json()
        if d.get("stato") in ("pronta", "errore"):
            return d
        time.sleep(5)
    pytest.fail("timeout polling valutazione")


def _check_values(res, keys):
    for k in keys:
        blk = res.get(k) or {}
        for c in KEYS:
            assert float(blk.get(c) or 0) > 0, f"{k}.{c}={blk.get(c)} res={res}"
    tm = res["totale"]
    for c in KEYS:
        somma = float(res["motore"][c]) + float(res["gommone"][c])
        assert abs(float(tm[c]) - somma) <= max(0.5 * somma, 1000), f"totale incoerente {c}: {tm[c]} vs {somma}"


@pytest.fixture(scope="module", autouse=True)
def cleanup(s):
    yield
    for vid in _created.values():
        s.delete(f"{API}/valutazioni/{vid}")


class TestValutazioni:
    def test_barca_two_engines(self, s):
        body = {"cliente": "TEST_barca", "motore": {"modello": "Suzuki DF140", "anno": 2008, "ore": 1700, "stato": "usurato", "numero": 2},
                "gommone": {"modello": "Jeanneau Cap Camarat 755", "anno": 2008, "stato": "usurato", "tipo": "barca"}}
        r = s.post(f"{API}/valutazioni", json=body, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["stato"] == "in_corso" and isinstance(d["id"], str)
        assert "_id" not in d
        _created["barca"] = d["id"]
        d = _poll(s, d["id"])
        assert d["stato"] == "pronta", d
        print("BARCA risultato:", {k: {c: (d["risultato"].get(k) or {}).get(c) for c in KEYS} for k in ("motore", "gommone", "totale")})
        _check_values(d["risultato"], ("motore", "gommone", "totale"))

    def test_barca_pdf(self, s):
        vid = _created.get("barca")
        if not vid:
            pytest.skip("no barca")
        r = s.get(f"{API}/valutazioni/{vid}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        txt = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(r.content)).pages)
        print(txt[:2500])
        assert "N° motori" in txt or "N°motori" in txt.replace(" ", "")
        i = txt.find("Barca")
        assert i >= 0, "sezione Imbarcazione – Barca assente"
        j = txt.find("Valutazione complessiva", i)
        sez = txt[i: j if j > 0 else i + 600]
        assert "0 € – 0 €" not in sez and "0 €–0 €" not in sez, sez

    def test_gommone_single_engine(self, s):
        body = {"cliente": "TEST_gommone", "motore": {"modello": "Suzuki DF140", "anno": 2016, "ore": 500, "stato": "buono", "numero": 1},
                "gommone": {"modello": "GEB 780 Tsunami", "anno": 2016, "stato": "buono", "tipo": "gommone", "tubolari_nuovi": True, "tubolari_anni": 2}}
        r = s.post(f"{API}/valutazioni", json=body, timeout=30)
        assert r.status_code == 200, r.text
        _created["gommone"] = r.json()["id"]
        d = _poll(s, r.json()["id"])
        assert d["stato"] == "pronta", d
        print("GOMMONE risultato:", {k: {c: (d["risultato"].get(k) or {}).get(c) for c in KEYS} for k in ("motore", "gommone", "totale")})
        _check_values(d["risultato"], ("motore", "gommone", "totale"))
        pdf = s.get(f"{API}/valutazioni/{d['id']}/pdf", timeout=30)
        assert pdf.status_code == 200
        txt = "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(pdf.content)).pages)
        assert "Gommone" in txt and "Rifatti da 2 anni" in txt

    def test_validation(self, s):
        assert s.post(f"{API}/valutazioni", json={}, timeout=20).status_code == 400
        bad = {"gommone": {"modello": "X", "anno": 2010, "stato": "nuovissimo"}}
        assert s.post(f"{API}/valutazioni", json=bad, timeout=20).status_code == 400
        assert s.get(f"{API}/valutazioni/nonexistent-id", timeout=20).status_code == 404
