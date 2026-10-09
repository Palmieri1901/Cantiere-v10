"""Regression tests for iteration 20 bug: OFF switches must not show in
'Dettaglio manutenzione motore' PDF and must zero out their price in /calcola-costi."""
import io
import os
import pytest
import requests
import fitz  # pymupdf

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

BASE_PARAMS = {"lunghezza": 6, "tipo_sosta": "fuori", "potenza_motore": 40}

# All flags that we expect to influence motore/ricambi/manutenzione totals
MOTOR_FLAGS_1 = [
    "anodi_interni_attivo",
    "anodi_esterni_attivo",
    "filtro_olio_attivo",
    "olio_piede_attivo",
    "ingrassaggio_attivo",
    "girante_attivo",
]
GENERIC_FLAGS = [
    "antivegetativa_attiva",
    "lavaggio_inizio_attivo",
    "lavaggio_fine_attivo",
    "scafo_sporco_attivo",
    "copertura_attiva",
    "alaggio_varo_attivo",
]


def _get_costs(session, extra=None):
    params = {**BASE_PARAMS}
    if extra:
        params.update(extra)
    r = session.get(f"{API}/calcola-costi", params=params, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- /calcola-costi: motor flags zero out items ----------
@pytest.mark.parametrize("flag", MOTOR_FLAGS_1)
def test_motor_flag_off_reduces_cost(session, flag):
    base = _get_costs(session)
    off = _get_costs(session, {flag: "false"})
    # The ricambi/manodopera totals must drop (or stay same if the item was already 0)
    base_ric = float(base.get("costo_ricambi_totale") or 0) + float(base.get("costo_manodopera_motore") or 0)
    off_ric = float(off.get("costo_ricambi_totale") or 0) + float(off.get("costo_manodopera_motore") or 0)
    assert off_ric <= base_ric, f"{flag}: {off_ric} should be <= {base_ric}"
    # And at least one of the motore totals must change compared with base (otherwise flag isn't wired)
    assert off_ric < base_ric, f"Turning OFF {flag} did not reduce motor totals (base={base_ric} off={off_ric})"


@pytest.mark.parametrize("flag", GENERIC_FLAGS)
def test_generic_flag_off_reduces_total(session, flag):
    base = _get_costs(session)
    off = _get_costs(session, {flag: "false"})
    assert float(off.get("totale") or 0) <= float(base.get("totale") or 0)


def test_motor_flag_off_second_motor(session):
    params_base = {"secondo_motore": "true", "potenza_motore_2": 40}
    base = _get_costs(session, params_base)
    off = _get_costs(session, {**params_base, "anodi_interni_2_attivo": "false"})
    base_ric2 = float(base.get("costo_ricambi_motore_2_totale") or 0)
    off_ric2 = float(off.get("costo_ricambi_motore_2_totale") or 0)
    assert off_ric2 < base_ric2, f"anodi_interni_2_attivo OFF did not drop 2nd motor ricambi: {base_ric2}->{off_ric2}"


# ---------- /preventivo/pdf: text extraction ----------
def _pdf_text(data: bytes) -> str:
    with fitz.open(stream=data, filetype="pdf") as doc:
        return "\n".join(p.get_text() for p in doc)


def test_pdf_hides_off_rows_and_shows_on_rows(session):
    body = {
        "nome": "TEST_Mario",
        "cognome": "TEST_Rossi",
        "lunghezza": 6,
        "tipo_sosta": "fuori",
        "potenza_motore": 40,
        "anodi_interni_attivo": False,
        "filtro_olio_attivo": False,
    }
    r = session.post(f"{API}/preventivo/pdf", json=body, timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    text = _pdf_text(r.content)
    # OFF rows must NOT appear
    assert "Kit anodi interni" not in text, "Kit anodi interni should be hidden"
    assert "Filtro olio" not in text, "Filtro olio should be hidden"
    # ON rows must appear
    for row in ["Kit anodi esterni", "Olio piede", "Ingrassaggio", "Girante"]:
        assert row in text, f"{row} missing from PDF"


# ---------- /clienti CRUD + PDF ----------
def test_cliente_pdf_toggles(session):
    body = {
        "nome": "TEST_PDF",
        "cognome": "TEST_Toggle",
        "tipo_barca": "barca",
        "lunghezza": 6,
        "tipo_sosta": "fuori",
        "potenza_motore": 40,
        "anodi_interni_attivo": False,
        "filtro_olio_attivo": False,
    }
    r = session.post(f"{API}/clienti", json=body, timeout=15)
    assert r.status_code in (200, 201), r.text
    cid = r.json().get("id") or r.json().get("_id") or r.json().get("cliente", {}).get("id")
    assert cid, f"No id returned: {r.json()}"
    try:
        # GET PDF
        r2 = session.get(f"{API}/clienti/{cid}/preventivo.pdf", timeout=30)
        assert r2.status_code == 200, r2.text
        text = _pdf_text(r2.content)
        assert "Kit anodi interni" not in text
        assert "Filtro olio" not in text

        # Fetch to capture current totals
        rget = session.get(f"{API}/clienti/{cid}", timeout=15)
        assert rget.status_code == 200
        before_ric = float(rget.json().get("costo_ricambi_totale") or 0)

        # PUT reactivating anodi_interni (send full body)
        updated = {**body, "anodi_interni_attivo": True}
        rput = session.put(f"{API}/clienti/{cid}", json=updated, timeout=15)
        assert rput.status_code in (200, 204), rput.text

        rget2 = session.get(f"{API}/clienti/{cid}", timeout=15)
        after_ric = float(rget2.json().get("costo_ricambi_totale") or 0)
        assert after_ric == pytest.approx(before_ric + 50, abs=0.5), (
            f"Expected +50 after enabling anodi_interni: before={before_ric} after={after_ric}"
        )

        r3 = session.get(f"{API}/clienti/{cid}/preventivo.pdf", timeout=30)
        assert r3.status_code == 200
        text3 = _pdf_text(r3.content)
        assert "Kit anodi interni" in text3
    finally:
        session.delete(f"{API}/clienti/{cid}", timeout=15)
