# Scan DDT (AI) bugfix regression: Gemini model list + Emergent fallback (iteration 27)
import os
import io
import sys
import base64
import asyncio
import pytest
import requests
from fastapi import HTTPException

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
load_dotenv("/app/frontend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

DDT_LINES = [
    ("12345", "Anodo barra alluminio", "pz", "2", "10,50"),
    ("67890", "Filtro gasolio Racor", "pz", "3", "24,00"),
]


def _png_b64():
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (1400, 600), "white")
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 30)
    except Exception:
        font = ImageFont.load_default()
    d.text((40, 30), "DDT N. 77 del 10/01/2026 - Fornitore TEST_Nautica Srl", fill="black", font=font)
    d.text((40, 110), "Codice   Descrizione                 UM   Q.ta   Prezzo", fill="black", font=font)
    y = 170
    for c, n, um, q, p in DDT_LINES:
        d.text((40, y), f"{c}    {n:<28} {um}    {q}      {p}", fill="black", font=font)
        y += 60
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _pdf_b64():
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 12)
    c.drawString(40, 800, "DDT N. 77 del 10/01/2026 - Fornitore TEST_Nautica Srl")
    c.drawString(40, 770, "Codice    Descrizione                    UM    Q.ta    Prezzo")
    y = 745
    for co, n, um, q, p in DDT_LINES:
        c.drawString(40, y, f"{co}     {n}     {um}     {q}     {p}")
        y -= 22
    c.save()
    return base64.b64encode(buf.getvalue()).decode()


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"password": "admin"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


def _check_rows(data):
    assert isinstance(data.get("articoli"), list), data
    assert len(data["articoli"]) >= 2, data
    codici = " ".join(str(a.get("codice", "")) + " " + str(a.get("nome", "")) for a in data["articoli"])
    assert "12345" in codici, codici


class TestScanDDTEndpoint:
    def test_fornitori_exist(self, client):
        r = client.get(f"{BASE_URL}/api/magazzino/fornitori")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_scan_ddt_png_image(self, client):
        r = client.post(f"{BASE_URL}/api/magazzino/scan-ddt", json={"image_base64": _png_b64()}, timeout=240)
        print("PNG", r.status_code, r.text[:600])
        assert r.status_code == 200, r.text[:400]
        _check_rows(r.json())

    def test_scan_ddt_pdf_file(self, client):
        r = client.post(f"{BASE_URL}/api/magazzino/scan-ddt",
                        json={"file_base64": _pdf_b64(), "mime_type": "application/pdf"}, timeout=240)
        print("PDF", r.status_code, r.text[:600])
        assert r.status_code == 200, r.text[:400]
        _check_rows(r.json())

    def test_scan_ddt_empty_payload_400(self, client):
        r = client.post(f"{BASE_URL}/api/magazzino/scan-ddt", json={})
        assert r.status_code == 400

    def test_scan_ddt_unauth_401(self):
        r = requests.post(f"{BASE_URL}/api/magazzino/scan-ddt", json={"image_base64": "x"})
        assert r.status_code == 401


class TestAiClientUnit:
    def test_vision_emergent_only(self, monkeypatch):
        import ai_client
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        assert os.environ.get("EMERGENT_LLM_KEY")
        out = asyncio.run(ai_client.vision("Rispondi solo con il testo richiesto.", "Scrivi esattamente la parola OK", []))
        assert out.strip().strip(".").upper() == "OK", out

    def test_vision_fallback_when_gemini_503(self, monkeypatch):
        import ai_client
        monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
        called = {}

        async def boom(*a, **k):
            called["gemini"] = True
            raise HTTPException(503, "sovraccarico su tutti i modelli (ultimo errore 404)")
        monkeypatch.setattr(ai_client, "_gemini_direct", boom)
        out = asyncio.run(ai_client.vision("Rispondi solo con il testo richiesto.", "Scrivi esattamente la parola OK", []))
        assert called.get("gemini")
        assert out.strip().strip(".").upper() == "OK", out

    def test_vision_real_fake_gemini_key_falls_back(self, monkeypatch):
        """Real _gemini_direct with invalid key → Google returns 400 API_KEY_INVALID → should fall back?"""
        import ai_client
        monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
        try:
            out = asyncio.run(ai_client.vision("Rispondi solo con il testo richiesto.", "Scrivi esattamente la parola OK", []))
            print("fake-key result:", out)
            assert out.strip().strip(".").upper() == "OK"
        except HTTPException as e:
            pytest.fail(f"No fallback with invalid key: {e.status_code} {e.detail[:200]}")

    def test_vision_no_keys_500(self, monkeypatch):
        import ai_client
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("EMERGENT_LLM_KEY", raising=False)
        with pytest.raises(HTTPException) as ei:
            asyncio.run(ai_client.vision("s", "p", []))
        assert ei.value.status_code == 500
