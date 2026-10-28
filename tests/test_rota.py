from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from hypothesis import given, settings
from hypothesis import strategies as st
from pydantic import ValidationError
from rota.conteudo import DIR_CONTEUDO, ConteudoInvalido, carregar, checar_integridade
from rota.exportar import exportar
from rota.gerador import MARGEM_MIN, gerar
from rota.models import Conteudo, Fonte
from rota.motor import AcaoInvalida, Jogo
from rota.simulacao import bot_direto, bot_objetivo

C = carregar()
modos = st.sampled_from(["imprensa", "ficcao"])
seeds = st.integers(min_value=0, max_value=2**31)


def test_conteudo_integro() -> None:
    assert checar_integridade(C) == []


def test_toda_pista_de_imprensa_tem_fonte_https() -> None:
    fontes = {f.id: f for f in C.fontes}
    for fato in C.fatos:
        assert all(fontes[f].url.startswith("https://") for f in fato.fontes)


def test_rejeita_url_sem_https() -> None:
    with pytest.raises(ValidationError):
        Fonte(id="x", veiculo="v", titulo="t", url="javascript:alert(1)", publicado="2026-10-28")


def test_rejeita_campos_desconhecidos(tmp_path: Path) -> None:
    for nome in ("fontes", "fatos", "cidades", "caso"):
        (tmp_path / f"{nome}.yaml").write_text(
            (DIR_CONTEUDO / f"{nome}.yaml").read_text(encoding="utf-8"), encoding="utf-8")
    (tmp_path / "caso.yaml").write_text(
        (tmp_path / "caso.yaml").read_text(encoding="utf-8") + "\nhack: 1\n", encoding="utf-8")
    with pytest.raises(ValidationError):
        carregar(tmp_path)


def test_yaml_inseguro_nao_executa(tmp_path: Path) -> None:
    for nome in ("fontes", "fatos", "cidades", "caso"):
        (tmp_path / f"{nome}.yaml").write_text("!!python/object/apply:os.system ['true']\n")
    with pytest.raises(yaml.constructor.ConstructorError):
        carregar(tmp_path)


def test_referencia_quebrada_e_detectada() -> None:
    h = C.historia.model_copy(update={"rota": [*C.historia.rota, "atlantida"]})
    ruim = Conteudo(fontes=C.fontes, fatos=C.fatos, cidades=C.cidades, historia=h)
    assert any("atlantida" in e for e in checar_integridade(ruim))
    assert issubclass(ConteudoInvalido, ValueError)


@settings(max_examples=150, deadline=None)
@given(modo=modos, seed=seeds)
def test_caso_deterministico_e_resolvivel(modo: str, seed: int) -> None:
    a, b = gerar(C, modo, seed), gerar(C, modo, seed)  # type: ignore[arg-type]
    assert a == b
    assert bot_direto(a)[0].e.fim == "vitoria"
    assert bot_objetivo(a)[0].e.fim == "vitoria"
    assert a.prazo_horas == 48
    j, _ = bot_objetivo(a)
    assert a.prazo_horas * 60 - j.e.minutos >= MARGEM_MIN


@settings(max_examples=100, deadline=None)
@given(modo=modos, seed=seeds)
def test_estrutura_do_caso(modo: str, seed: int) -> None:
    caso = gerar(C, modo, seed)  # type: ignore[arg-type]
    assert len(set(caso.rota)) == len(caso.rota)
    for i, cid in enumerate(caso.rota[:-1]):
        assert caso.rota[i + 1] in caso.destinos[cid]
        # sempre há ao menos uma pista geográfica para a próxima cidade
        assert any(p.fato is None for p in caso.pistas[cid])
    for cid, ops in caso.destinos.items():
        assert cid not in ops
        assert all(o in caso.cidades for o in ops)
    if modo == "ficcao":
        assert all(p.fato is None for ps in caso.pistas.values() for p in ps)


def _caso_imprensa() -> Jogo:
    return Jogo(gerar(C, "imprensa", 1))


def test_acoes_invalidas() -> None:
    j = _caso_imprensa()
    with pytest.raises(AcaoInvalida):
        j.investigar("../../etc")
    with pytest.raises(AcaoInvalida):
        j.viajar("miami")
    with pytest.raises(AcaoInvalida):
        j.checar("migracoes-ponte")
    with pytest.raises(AcaoInvalida):
        j.emitir_dossie("Atlântida")


def test_reinvestigar_nao_custa() -> None:
    j = _caso_imprensa()
    local = j.caso.cidades[j.e.cidade].locais[0].id
    j.investigar(local)
    t = j.e.minutos
    j.investigar(local)
    assert j.e.minutos == t


def test_fora_da_rota_oferece_volta() -> None:
    j = _caso_imprensa()
    errado = next(d for d in j.destinos() if d != j.caso.rota[1])
    j.viajar(errado)
    assert not j.na_rota
    assert j.caso.rota[0] in j.destinos()
    ev = j.investigar(j.caso.cidades[errado].locais[0].id)
    assert ev[-1].texto in j.caso.nada


def test_dossie_errado_e_sem_dossie() -> None:
    for dossie, esperado in ((None, "sem_dossie"), ("Brasil", "dossie_errado")):
        j = _caso_imprensa()
        if dossie:
            j.emitir_dossie(dossie)
        for c in j.caso.rota[1:]:
            j.viajar(c)
        j.investigar(j.caso.alvo_local)
        assert j.e.fim == esperado
        with pytest.raises(AcaoInvalida):
            j.investigar(j.caso.alvo_local)


def test_prazo_estoura() -> None:
    caso = gerar(C, "imprensa", 1).model_copy(update={"prazo_horas": 2})
    j = Jogo(caso)
    for lo in caso.cidades[j.e.cidade].locais:
        if j.e.fim:
            break
        j.investigar(lo.id)
    assert j.e.fim == "prazo"
    assert j.e.minutos == 2 * 60


def test_sono_entre_0h_e_6h() -> None:
    j = _caso_imprensa()
    j.e.minutos = 12 * 60 + 30  # 23h30 de terça; investigar (1h) termina 0h30 → dorme
    j.investigar(j.caso.cidades[j.e.cidade].locais[0].id)
    assert (j.relogio.hour, j.relogio.minute, j.relogio.day) == (6, 0, 28)


def test_sono_janela_que_atravessa_meia_noite() -> None:
    caso = gerar(C, "imprensa", 1)
    j = Jogo(caso.model_copy(update={"regras": caso.regras.model_copy(
        update={"dormir_de": 23, "dormir_ate": 7})}))
    j.e.minutos = 11 * 60 + 30  # 22h30 → 23h30 → dorme até 7h do dia seguinte
    j.investigar(j.caso.cidades[j.e.cidade].locais[0].id)
    assert (j.relogio.hour, j.relogio.day) == (7, 28)


def test_export(tmp_path: Path) -> None:
    arqs = exportar(C, 2, tmp_path)
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert len(manifest) == len(arqs) - 1
    caso = json.loads((tmp_path / "casos" / "imprensa-1.json").read_text())
    assert caso["versao"] == 1
    golden = json.loads((tmp_path / "golden.json").read_text())
    assert golden["imprensa-1"][0]["estado"]["fim"] == "vitoria"
