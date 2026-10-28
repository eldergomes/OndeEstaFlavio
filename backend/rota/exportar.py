"""Exporta casos, schema, golden e manifest (SHA-256) para o frontend estático."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from rota.conteudo import RAIZ
from rota.gerador import gerar
from rota.models import Caso, Conteudo, Modo
from rota.simulacao import bot_cuidadoso, bot_direto, bot_objetivo

SAIDA_PADRAO = RAIZ / "web" / "public" / "data"
MODOS: tuple[Modo, ...] = ("imprensa", "ficcao")


def _escrever(caminho: Path, dados: Any) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    texto = json.dumps(dados, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    caminho.write_text(texto + "\n", encoding="utf-8")


def _golden(caso: Caso) -> list[dict[str, Any]]:
    saida = []
    for nome, bot in (("direto", bot_direto), ("objetivo", bot_objetivo),
                      ("cuidadoso", bot_cuidadoso)):
        jogo, acoes = bot(caso)
        saida.append({"bot": nome, "acoes": acoes, "estado": asdict(jogo.e)})
    return saida


def exportar(c: Conteudo, n_seeds: int, saida: Path = SAIDA_PADRAO) -> list[Path]:
    escritos: list[Path] = []
    indice: list[dict[str, Any]] = []
    golden: dict[str, Any] = {}
    for modo in MODOS:
        for seed in range(1, n_seeds + 1):
            caso = gerar(c, modo, seed)
            arq = saida / "casos" / f"{caso.id}.json"
            _escrever(arq, caso.model_dump(mode="json"))
            escritos.append(arq)
            indice.append({"id": caso.id, "modo": modo, "seed": seed})
            if seed <= 3:
                golden[caso.id] = _golden(caso)

    for nome, dados in (
        ("indice.json", {"versao": 1, "casos": indice}),
        ("schema.json", Caso.model_json_schema()),
        ("golden.json", golden),
    ):
        _escrever(saida / nome, dados)
        escritos.append(saida / nome)

    manifest = {
        str(p.relative_to(saida)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(escritos)
    }
    _escrever(saida / "manifest.json", manifest)
    return [*escritos, saida / "manifest.json"]
