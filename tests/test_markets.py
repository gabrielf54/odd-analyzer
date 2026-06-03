import pytest
from dataclasses import fields
from odd_analyzer.model.markets import MarketSpec, MARKETS

EXPECTED_KEYS = {"escanteios", "sot", "finalizacoes", "desarmes", "gols", "vitoria"}

def test_markets_registry_has_all_six_keys():
    assert set(MARKETS.keys()) == EXPECTED_KEYS

def test_market_spec_is_frozen_dataclass():
    spec = MARKETS["sot"]
    assert isinstance(spec, MarketSpec)
    with pytest.raises((AttributeError, TypeError)):
        spec.key = "outro"  # type: ignore[misc]

def test_market_spec_fields_present():
    field_names = {f.name for f in fields(MarketSpec)}
    assert field_names == {
        "key", "nivel", "kind", "stat_field",
        "prior_rate", "prior_strength", "nb_dispersion",
        "lines", "eixo_concessao", "label", "concede_baseline",
    }

def test_sot_spec_values():
    s = MARKETS["sot"]
    assert s.key == "sot"
    assert s.nivel == "jogador"
    assert s.kind == "contagem"
    assert s.stat_field == "shots_on_target"
    assert s.prior_rate == pytest.approx(0.4)
    assert s.nb_dispersion == pytest.approx(3.0)
    assert s.lines == [0.5, 1.5, 2.5]

def test_finalizacoes_spec_values():
    s = MARKETS["finalizacoes"]
    assert s.key == "finalizacoes"
    assert s.nivel == "jogador"
    assert s.kind == "contagem"
    assert s.stat_field == "total_shots"
    assert s.prior_rate == pytest.approx(1.2)
    assert s.lines == [0.5, 1.5, 2.5]

def test_desarmes_spec_values():
    s = MARKETS["desarmes"]
    assert s.key == "desarmes"
    assert s.nivel == "jogador"
    assert s.kind == "contagem"
    assert s.stat_field == "total_tackle"
    assert s.prior_rate == pytest.approx(2.0)
    assert s.lines == [0.5, 1.5, 2.5]

def test_escanteios_spec_values():
    s = MARKETS["escanteios"]
    assert s.key == "escanteios"
    assert s.nivel == "partida"
    assert s.kind == "contagem"
    assert s.stat_field == "corners"
    assert s.prior_rate == pytest.approx(5.0)
    assert s.lines == [8.5, 9.5, 10.5]

def test_gols_spec_values():
    s = MARKETS["gols"]
    assert s.key == "gols"
    assert s.nivel == "partida"
    assert s.kind == "partida_totais"
    assert s.stat_field == "goals"
    assert s.prior_rate == pytest.approx(1.3)
    assert s.lines == [1.5, 2.5, 3.5]

def test_vitoria_spec_values():
    s = MARKETS["vitoria"]
    assert s.key == "vitoria"
    assert s.nivel == "partida"
    assert s.kind == "partida_1x2"
    assert s.stat_field == "goals"
    assert s.lines == [1.5, 2.5, 3.5]

def test_contagem_markets_have_valid_prior_strength():
    for key in ("sot", "finalizacoes", "desarmes", "escanteios"):
        assert MARKETS[key].prior_strength > 0

def test_kind_values_are_valid():
    valid_kinds = {"contagem", "partida_totais", "partida_1x2"}
    for spec in MARKETS.values():
        assert spec.kind in valid_kinds

def test_nivel_values_are_valid():
    for spec in MARKETS.values():
        assert spec.nivel in {"jogador", "partida"}

def test_all_specs_have_nonempty_label_and_eixo():
    for spec in MARKETS.values():
        assert spec.label, f"{spec.key} tem label vazio"
        assert spec.eixo_concessao, f"{spec.key} tem eixo_concessao vazio"

def test_lines_are_sorted_and_nonempty():
    for spec in MARKETS.values():
        assert len(spec.lines) >= 1
        assert spec.lines == sorted(spec.lines)
