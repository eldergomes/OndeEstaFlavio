"""Jogadores automáticos usados para validar jogabilidade e gerar casos golden."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from rota.models import Caso
from rota.motor import Jogo

# Roteiro de ações: ("investigar", local) | ("checar", fato) | ("viajar", cidade) | ("dossie", país)
Acao = tuple[str, str]


def executar(jogo: Jogo, acao: Acao) -> None:
    tipo, arg = acao
    metodos: dict[str, Callable[[str], Any]] = {
        "investigar": jogo.investigar,
        "checar": jogo.checar,
        "viajar": jogo.viajar,
        "dossie": jogo.emitir_dossie,
    }
    metodos[tipo](arg)


def bot_direto(caso: Caso) -> tuple[Jogo, list[Acao]]:
    """Sabe a resposta: caminho mínimo. Garante que o caso tem solução."""
    jogo, acoes = Jogo(caso), []
    plano: list[Acao] = [("dossie", caso.destino_pais)]
    plano += [("viajar", c) for c in caso.rota[1:]]
    plano.append(("investigar", caso.alvo_local))
    for a in plano:
        if jogo.e.fim:
            break
        executar(jogo, a)
        acoes.append(a)
    return jogo, acoes


def bot_objetivo(caso: Caso) -> tuple[Jogo, list[Acao]]:
    """Jogador atento e sem desvios: investiga até achar a pista geográfica e segue em frente.
    É a régua de jogabilidade: todo caso gerado precisa ser vencível por ele."""
    jogo, acoes = Jogo(caso), []

    def faz(a: Acao) -> None:
        if not jogo.e.fim:
            executar(jogo, a)
            acoes.append(a)

    for i, cidade in enumerate(caso.rota[:-1]):
        for p in caso.pistas[cidade]:
            faz(("investigar", p.local))
            if p.fato is None:
                break
        if i == len(caso.rota) - 2:
            faz(("dossie", caso.destino_pais))
        faz(("viajar", caso.rota[i + 1]))
    for lo in caso.cidades[caso.rota[-1]].locais:
        faz(("investigar", lo.id))
    return jogo, acoes


def bot_cuidadoso(caso: Caso) -> tuple[Jogo, list[Acao]]:
    """Jogador humano razoável: investiga tudo, checa tudo e erra um destino por parada."""
    jogo, acoes = Jogo(caso), []

    def faz(a: Acao) -> bool:
        if jogo.e.fim:
            return False
        executar(jogo, a)
        acoes.append(a)
        return True

    for i, cidade in enumerate(caso.rota[:-1]):
        for lo in caso.cidades[cidade].locais:
            faz(("investigar", lo.id))
        for f in list(jogo.e.revelados):
            if f not in jogo.e.checados:
                faz(("checar", f))
        # o erro plausível é o destino errado mais próximo
        errado = min((d for d in caso.destinos[cidade] if d != caso.rota[i + 1]),
                     key=jogo.minutos_viagem)
        faz(("viajar", errado))
        faz(("investigar", caso.cidades[errado].locais[0].id))
        faz(("viajar", cidade))
        if i == len(caso.rota) - 2:
            faz(("dossie", caso.destino_pais))
        faz(("viajar", caso.rota[i + 1]))
    for lo in caso.cidades[caso.rota[-1]].locais:
        faz(("investigar", lo.id))
    return jogo, acoes
