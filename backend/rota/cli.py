"""CLI: validate | export | play."""

from __future__ import annotations

import argparse
import sys
import textwrap
from pathlib import Path

from rota.conteudo import ConteudoInvalido, carregar
from rota.exportar import MODOS, SAIDA_PADRAO, exportar
from rota.gerador import CasoInviavel, gerar
from rota.models import Conteudo
from rota.motor import AcaoInvalida, Evento, Jogo
from rota.simulacao import bot_cuidadoso, bot_direto, bot_objetivo

DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]


def validar(c: Conteudo, n_seeds: int) -> list[str]:
    falhas = []
    for modo in MODOS:
        cuidadoso = 0
        for seed in range(1, n_seeds + 1):
            try:
                caso = gerar(c, modo, seed)
            except CasoInviavel as err:
                falhas.append(str(err))
                continue
            for nome, bot in (("direto", bot_direto), ("objetivo", bot_objetivo)):
                jogo, _ = bot(caso)
                if jogo.e.fim != "vitoria":
                    falhas.append(f"{caso.id}: bot {nome} terminou em {jogo.e.fim}")
            cuidadoso += bot_cuidadoso(caso)[0].e.fim == "vitoria"
        # métrica de dificuldade, não critério de aprovação
        print(f"{modo}: bot cuidadoso (checa tudo, erra 1 destino/parada) vence "
              f"{cuidadoso}/{n_seeds}")
    return falhas


def _mostrar(eventos: list[Evento]) -> None:
    for ev in eventos:
        print(textwrap.fill(f"  [{ev.tipo}] {ev.texto}", width=88, subsequent_indent="    "))


def jogar(c: Conteudo, modo: str, seed: int) -> int:
    caso = gerar(c, "ficcao" if modo == "ficcao" else "imprensa", seed)
    jogo = Jogo(caso)
    print(f"\n== {caso.titulo} ({caso.id}) ==\n{textwrap.fill(caso.briefing, 88)}\n")
    while not jogo.e.fim:
        cid = caso.cidades[jogo.e.cidade]
        r = jogo.relogio
        resta = (jogo.limite_min - jogo.e.minutos) // 60
        print(f"\n{cid.nome} ({cid.pais}) — {DIAS[r.weekday()]} {r:%d/%m %Hh%M} — restam {resta}h"
              f" — dossiê: {jogo.e.dossie or '—'}")
        locais = cid.locais
        destinos = jogo.destinos()
        for i, lo in enumerate(locais, 1):
            print(f"  i{i}  investigar {lo.nome}{' ✓' if lo.id in jogo.e.investigados else ''}")
        for i, d in enumerate(destinos, 1):
            h = jogo.minutos_viagem(d) / 60
            print(f"  v{i}  viajar para {caso.cidades[d].nome} ({h:.1f}h)")
        pend = [f for f in jogo.e.revelados if f not in jogo.e.checados]
        for i, f in enumerate(pend, 1):
            print(f"  c{i}  checar: {caso.fatos[f].texto[:60]}…")
        print("  d   emitir dossiê   q   sair")
        try:
            cmd = input("> ").strip().lower()
        except EOFError:
            return 0
        try:
            if cmd == "q":
                return 0
            if cmd == "d":
                for i, p in enumerate(caso.paises, 1):
                    print(f"  {i:2} {p}")
                n = int(input("país> "))
                _mostrar(jogo.emitir_dossie(caso.paises[n - 1]))
            elif cmd[:1] in "ivc" and cmd[1:].isdigit():
                n = int(cmd[1:]) - 1
                if n < 0:
                    raise IndexError
                if cmd[0] == "i":
                    _mostrar(jogo.investigar(locais[n].id))
                elif cmd[0] == "v":
                    _mostrar(jogo.viajar(destinos[n]))
                else:
                    _mostrar(jogo.checar(pend[n]))
            else:
                print("  comando desconhecido")
        except (AcaoInvalida, IndexError, ValueError) as err:
            print(f"  ação inválida: {err}")
    print(f"\nFim: {jogo.e.fim} — pontos: {jogo.e.pontos}")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="rota")
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate", help="valida conteúdo e simula jogabilidade")
    v.add_argument("--seeds", type=int, default=200)
    e = sub.add_parser("export", help="exporta JSON para o frontend")
    e.add_argument("--seeds", type=int, default=20)
    e.add_argument("--out", type=Path, default=SAIDA_PADRAO)
    p = sub.add_parser("play", help="joga no terminal")
    p.add_argument("--modo", choices=MODOS, default="imprensa")
    p.add_argument("--seed", type=int, default=1)
    args = ap.parse_args(argv)

    try:
        c = carregar()
    except (ConteudoInvalido, ValueError) as err:
        print(f"conteúdo inválido:\n{err}", file=sys.stderr)
        return 1

    if args.cmd == "validate":
        falhas = validar(c, args.seeds)
        for f in falhas[:20]:
            print(f, file=sys.stderr)
        print(f"{'FALHOU' if falhas else 'ok'}: {len(falhas)} falhas em {args.seeds} seeds/modo")
        return 1 if falhas else 0
    if args.cmd == "export":
        arqs = exportar(c, args.seeds, args.out)
        print(f"{len(arqs)} arquivos em {args.out}")
        return 0
    return jogar(c, args.modo, args.seed)


if __name__ == "__main__":
    raise SystemExit(main())
