"""Máquina de estados do jogo. Regras espelhadas em web/src/motor.ts (paridade via golden)."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Literal

from rota.models import Caso, Fim

TipoEvento = Literal["pista", "checagem", "viagem", "dossie", "sono", "fim"]


class AcaoInvalida(ValueError):
    pass


@dataclass
class Evento:
    tipo: TipoEvento
    texto: str
    ref: str | None = None


@dataclass
class Estado:
    minutos: int = 0
    pos: int = 0
    cidade: str = ""
    investigados: list[str] = field(default_factory=list)
    revelados: list[str] = field(default_factory=list)
    checados: list[str] = field(default_factory=list)
    dossie: str | None = None
    fim: Fim | None = None
    pontos: int = 0


def distancia_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 6371.0 * 2 * math.asin(math.sqrt(h))


class Jogo:
    def __init__(self, caso: Caso, estado: Estado | None = None) -> None:
        self.caso = caso
        self.e = estado or Estado(cidade=caso.rota[0])

    # ---------- consultas ----------

    @property
    def na_rota(self) -> bool:
        return self.e.cidade == self.caso.rota[self.e.pos]

    @property
    def relogio(self) -> datetime:
        return self.caso.inicio + timedelta(minutes=self.e.minutos)

    @property
    def limite_min(self) -> int:
        return self.caso.prazo_horas * 60

    def destinos(self) -> list[str]:
        base = list(self.caso.destinos.get(self.e.cidade, []))
        volta = self.caso.rota[self.e.pos]
        if not self.na_rota and volta not in base:
            base.append(volta)
        return base

    def minutos_viagem(self, destino: str) -> int:
        a, b = self.caso.cidades[self.e.cidade], self.caso.cidades[destino]
        km = distancia_km((a.lat, a.lon), (b.lat, b.lon))
        r = self.caso.regras
        return r.min_embarque + math.ceil(km / r.velocidade_kmh * 2) * 30

    # ---------- ações ----------

    def investigar(self, local: str) -> list[Evento]:
        self._ativo()
        locais = [lo.id for lo in self.caso.cidades[self.e.cidade].locais]
        if local not in locais:
            raise AcaoInvalida(f"local inexistente: {local}")
        idx = locais.index(local)
        final = self.na_rota and self.e.pos == len(self.caso.rota) - 1
        repetido = local in self.e.investigados
        if not repetido:
            self.e.investigados.append(local)
        eventos = [] if repetido else self._gastar(self.caso.regras.min_investigar)
        if self.e.fim:
            return eventos

        if final and local == self.caso.alvo_local:
            return [*eventos, self._encerrar()]
        if final:
            texto, ref = self.caso.perto[idx % len(self.caso.perto)], None
        elif self.na_rota:
            p = next(p for p in self.caso.pistas[self.e.cidade] if p.local == local)
            texto, ref = p.texto, p.fato
            if ref and ref not in self.e.revelados:
                self.e.revelados.append(ref)
        else:
            texto, ref = self.caso.nada[idx % len(self.caso.nada)], None
        return [*eventos, Evento("pista", texto, ref)]

    def checar(self, fato: str) -> list[Evento]:
        self._ativo()
        if fato not in self.e.revelados:
            raise AcaoInvalida(f"fato não revelado: {fato}")
        info = self.caso.fatos[fato]
        eventos: list[Evento] = []
        if fato not in self.e.checados:
            self.e.checados.append(fato)
            eventos = self._gastar(self.caso.regras.min_checar)
            if self.e.fim:
                return eventos
        return [*eventos, Evento("checagem", f"{info.status.upper()}: {info.nota}", fato)]

    def viajar(self, destino: str) -> list[Evento]:
        self._ativo()
        if destino not in self.destinos():
            raise AcaoInvalida(f"destino indisponível: {destino}")
        custo = self.minutos_viagem(destino)
        avanca = self.na_rota and destino == self.caso.rota[min(self.e.pos + 1,
                                                                len(self.caso.rota) - 1)]
        if avanca and self.e.pos < len(self.caso.rota) - 1:
            self.e.pos += 1
        self.e.cidade = destino
        self.e.investigados = []
        eventos = self._gastar(custo)
        if self.e.fim:
            return eventos
        return [*eventos, Evento("viagem", f"Chegada a {self.caso.cidades[destino].nome}.",
                                 destino)]

    def emitir_dossie(self, pais: str) -> list[Evento]:
        self._ativo()
        if pais not in self.caso.paises:
            raise AcaoInvalida(f"país inválido: {pais}")
        self.e.dossie = pais
        eventos = self._gastar(self.caso.regras.min_dossie)
        if self.e.fim:
            return eventos
        return [*eventos, Evento("dossie", f"Dossiê emitido indicando: {pais}.", pais)]

    # ---------- internos ----------

    def _ativo(self) -> None:
        if self.e.fim:
            raise AcaoInvalida("jogo encerrado")

    def _gastar(self, minutos: int) -> list[Evento]:
        self.e.minutos += minutos
        eventos: list[Evento] = []
        r = self.caso.regras
        agora = self.relogio
        hora = agora.hour
        # janela de sono [dormir_de, dormir_ate), podendo atravessar a meia-noite
        if r.dormir_de > r.dormir_ate:
            dorme = hora >= r.dormir_de or hora < r.dormir_ate
        else:
            dorme = r.dormir_de <= hora < r.dormir_ate
        if dorme:
            acordar = agora.replace(hour=r.dormir_ate, minute=0, second=0, microsecond=0)
            if acordar <= agora:
                acordar += timedelta(days=1)
            self.e.minutos += int((acordar - agora).total_seconds() // 60)
            eventos.append(Evento("sono", "Você parou para dormir."))
        if self.e.minutos > self.limite_min:
            self.e.minutos = self.limite_min
            self.e.fim = "prazo"
            eventos.append(Evento("fim", self.caso.desfecho.prazo, "prazo"))
        return eventos

    def _encerrar(self) -> Evento:
        if self.e.dossie is None:
            self.e.fim = "sem_dossie"
        elif self.e.dossie != self.caso.destino_pais:
            self.e.fim = "dossie_errado"
        else:
            self.e.fim = "vitoria"
            restante_h = (self.limite_min - self.e.minutos) // 60
            self.e.pontos = restante_h * 10 + len(self.e.checados) * 20
        return Evento("fim", getattr(self.caso.desfecho, self.e.fim), self.e.fim)
