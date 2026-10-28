"""Geração determinística de casos a partir do conteúdo."""

from __future__ import annotations

import itertools
import random

from rota.models import (
    Caso,
    CidadeOut,
    Conteudo,
    FatoOut,
    FonteOut,
    Modo,
    Pista,
    Regras,
)
from rota.simulacao import bot_objetivo

TAMANHO_ROTA_FICCAO = 5
N_DESTINOS = 4  # opções de viagem por cidade (antes do "voltar")
CHANCE_DISTRATOR = 0.5
MAX_TENTATIVAS = 200
MARGEM_MIN = 8 * 60  # sobra mínima do bot_objetivo: espaço para checar e errar


class CasoInviavel(ValueError):
    pass


def gerar(c: Conteudo, modo: Modo, seed: int) -> Caso:
    """Gera um caso que o bot_objetivo vence com sobra >= MARGEM_MIN. Sorteios inviáveis
    (rota fictícia longa demais, pistas mal posicionadas) são refeitos — determinístico:
    mesma seed, mesmo caso."""
    # RNG não criptográfico de propósito: o caso só precisa ser reproduzível pela seed.
    rng = random.Random(f"{modo}:{seed}")  # noqa: S311  # nosec B311
    for _ in range(MAX_TENTATIVAS):
        caso = _montar(c, modo, seed, rng)
        jogo, _ = bot_objetivo(caso)
        if jogo.e.fim == "vitoria" and jogo.limite_min - jogo.e.minutos >= MARGEM_MIN:
            return caso
    raise CasoInviavel(f"{modo}-{seed}: nenhum caso vencível em {c.historia.prazo_horas}h")


def _montar(c: Conteudo, modo: Modo, seed: int, rng: random.Random) -> Caso:
    h = c.historia
    cidades = {x.id: x for x in c.cidades}
    fatos = {f.id: f for f in c.fatos}
    fontes = {f.id: f for f in c.fontes}

    if modo == "imprensa":
        rota = list(h.rota)
    else:
        candidatas = sorted(i for i in cidades if i != h.rota[0])
        rota = [h.rota[0], *rng.sample(candidatas, TAMANHO_ROTA_FICCAO - 1)]
    fora = sorted(set(cidades) - set(rota))

    pistas: dict[str, list[Pista]] = {}
    usados: set[str] = set()
    for atual, prox in itertools.pairwise(rota):
        textos: list[tuple[str, str | None]] = [
            (t, None) for t in rng.sample(cidades[prox].pistas, 3)
        ]
        if modo == "imprensa":
            fato = rng.choice(h.pistas[atual])
            textos[0] = (fatos[fato].texto, fato)
            livres = [d for d in h.distratores if d not in usados]
            if livres and rng.random() < CHANCE_DISTRATOR:
                d = rng.choice(livres)
                textos[2] = (fatos[d].texto, d)
        rng.shuffle(textos)
        locais = [lo.id for lo in cidades[atual].locais]
        pistas[atual] = [Pista(local=lo, texto=t, fato=f) for lo, (t, f) in zip(
            locais, textos, strict=True)]
        usados.update(f for _, f in textos if f)

    destinos: dict[str, list[str]] = {}
    for cid in sorted(cidades):
        if cid in rota[:-1]:
            prox = rota[rota.index(cid) + 1]
            opcoes = [prox, *rng.sample(fora, N_DESTINOS - 1)]
        else:
            opcoes = rng.sample([x for x in fora if x != cid], N_DESTINOS - 1)
        rng.shuffle(opcoes)
        destinos[cid] = opcoes

    final = cidades[rota[-1]]
    return Caso(
        id=f"{modo}-{seed}",
        modo=modo,
        seed=seed,
        titulo=h.titulo,
        briefing=h.briefing.imprensa if modo == "imprensa" else h.briefing.ficcao,
        inicio=h.inicio,
        prazo_horas=h.prazo_horas,
        regras=Regras(),
        rota=rota,
        destino_pais=final.pais,
        alvo_local=rng.choice(final.locais).id,
        paises=sorted({x.pais for x in c.cidades}),
        cidades={
            x.id: CidadeOut(nome=x.nome, pais=x.pais, lat=x.lat, lon=x.lon,
                            descricao=x.descricao, locais=x.locais)
            for x in c.cidades
        },
        destinos=destinos,
        pistas=pistas,
        fatos={
            i: FatoOut(
                texto=fatos[i].texto,
                status=fatos[i].status,
                nota=fatos[i].nota,
                fontes=[FonteOut(veiculo=fontes[f].veiculo, titulo=fontes[f].titulo,
                                 url=fontes[f].url, publicado=fontes[f].publicado)
                        for f in fatos[i].fontes],
            )
            for i in sorted(usados)
        },
        perto=list(h.perto),
        nada=list(h.nada),
        desfecho=h.desfecho,
    )
