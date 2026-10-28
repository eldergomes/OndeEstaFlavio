"""Carga e validação de integridade do conteúdo em content/*.yaml."""

from __future__ import annotations

from collections import Counter
from pathlib import Path

import yaml

from rota.models import Conteudo

RAIZ = Path(__file__).resolve().parents[2]
DIR_CONTEUDO = RAIZ / "content"
LIMITE_ARQUIVO = 256 * 1024


class ConteudoInvalido(ValueError):
    pass


def _ler_yaml(caminho: Path) -> object:
    if caminho.stat().st_size > LIMITE_ARQUIVO:
        raise ConteudoInvalido(f"{caminho.name}: arquivo grande demais")
    with caminho.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def carregar(diretorio: Path = DIR_CONTEUDO) -> Conteudo:
    conteudo = Conteudo.model_validate(
        {
            "fontes": _ler_yaml(diretorio / "fontes.yaml"),
            "fatos": _ler_yaml(diretorio / "fatos.yaml"),
            "cidades": _ler_yaml(diretorio / "cidades.yaml"),
            "historia": _ler_yaml(diretorio / "caso.yaml"),
        }
    )
    erros = checar_integridade(conteudo)
    if erros:
        raise ConteudoInvalido("\n".join(erros))
    return conteudo


def _duplicados(ids: list[str]) -> list[str]:
    return sorted(i for i, n in Counter(ids).items() if n > 1)


def checar_integridade(c: Conteudo) -> list[str]:
    erros: list[str] = []
    fontes = {f.id for f in c.fontes}
    fatos = {f.id for f in c.fatos}
    cidades = {x.id: x for x in c.cidades}
    h = c.historia

    for nome, ids in (
        ("fonte", [f.id for f in c.fontes]),
        ("fato", [f.id for f in c.fatos]),
        ("cidade", [x.id for x in c.cidades]),
    ):
        erros += [f"{nome} duplicada: {i}" for i in _duplicados(ids)]

    for fato in c.fatos:
        erros += [f"fato {fato.id}: fonte inexistente {f}" for f in fato.fontes if f not in fontes]

    for cid in c.cidades:
        erros += [f"cidade {cid.id}: local duplicado {i}"
                  for i in _duplicados([lo.id for lo in cid.locais])]
    todas_pistas = [p for cid in c.cidades for p in cid.pistas]
    erros += [f"pista geográfica repetida: {p!r}" for p in _duplicados(todas_pistas)]

    erros += [f"rota: cidade inexistente {r}" for r in h.rota if r not in cidades]
    erros += [f"rota: cidade repetida {r}" for r in _duplicados(h.rota)]
    for origem, ids in h.pistas.items():
        if origem not in h.rota[:-1]:
            erros.append(f"pistas: {origem} não é cidade intermediária da rota")
        erros += [f"pistas[{origem}]: fato inexistente {i}" for i in ids if i not in fatos]
    erros += [f"rota: {r} sem pistas de imprensa" for r in h.rota[:-1] if not h.pistas.get(r)]
    erros += [f"distrator inexistente {i}" for i in h.distratores if i not in fatos]

    # cidades fora da rota servem de despiste; precisa haver o bastante para 3 por parada
    if len(c.cidades) - len(h.rota) < 4:
        erros.append("poucas cidades de despiste (mínimo 4 fora da rota)")
    return erros
