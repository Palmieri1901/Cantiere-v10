# Unit tests for _normalizza (AI key aliases + derive missing value from totale)
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from routers.valutazioni import _normalizza, ValutazioneIn  # noqa: E402

P = ValutazioneIn(motore={"modello": "Suzuki DF140", "anno": 2008, "numero": 2},
                  gommone={"modello": "Jeanneau", "anno": 2008, "tipo": "barca"})
T = {"valore_min": 20000, "valore_max": 30000, "valore_consigliato": 25000}
M = {"valore_min": 6000, "valore_max": 8000, "valore_consigliato": 7000}


def test_alias_imbarcazione():
    r = _normalizza({"motore": dict(M), "imbarcazione": {"valore_min": 1, "valore_max": 2, "valore_consigliato": 1}, "totale": dict(T)}, P)
    assert r["gommone"]["valore_min"] == 1 and "imbarcazione" not in r


def test_alias_barca():
    r = _normalizza({"motore": dict(M), "barca": {"valore_min": 5, "valore_max": 6, "valore_consigliato": 5}, "totale": dict(T)}, P)
    assert r["gommone"]["valore_max"] == 6


def test_derive_gommone_from_totale():
    r = _normalizza({"motore": dict(M), "gommone": {"valore_min": 0, "valore_max": 0, "valore_consigliato": 0, "note": "x"}, "totale": dict(T)}, P)
    assert r["gommone"]["valore_min"] == 14000 and r["gommone"]["valore_consigliato"] == 18000 and r["gommone"]["note"] == "x"


def test_derive_totale():
    r = _normalizza({"motore": dict(M), "gommone": {"valore_min": 1000, "valore_max": 2000, "valore_consigliato": 1500}}, P)
    assert r["totale"]["valore_max"] == 10000


def test_string_values_with_dots():
    # AI might return '12.000' strings -> float('12.000') = 12.0 (silent wrong value) or ValueError for '12.000,00'
    try:
        _normalizza({"motore": {"valore_min": "6.000 €"}, "gommone": {}, "totale": dict(T)}, P)
        ok = True
    except Exception:
        ok = False
    print("string-with-euro handled:", ok)
