"""Modelos de conteúdo (entrada YAML) e de caso (saída JSON consumida pelo frontend)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

Id = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,40}$")]
Texto = Annotated[str, StringConstraints(min_length=1, max_length=400, strip_whitespace=True)]
Status = Literal["confirmado", "contestado", "desmentido"]
Modo = Literal["imprensa", "ficcao"]
Fim = Literal["vitoria", "dossie_errado", "sem_dossie", "prazo"]


def _https(url: str) -> str:
    if not url.startswith("https://"):
        raise ValueError("fonte precisa usar https://")
    return url


UrlHttps = Annotated[str, StringConstraints(max_length=500), AfterValidator(_https)]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# ---------- conteúdo ----------


class Fonte(_Base):
    id: Id
    veiculo: Texto
    titulo: Texto
    url: UrlHttps
    publicado: date


class Fato(_Base):
    id: Id
    texto: Texto
    fontes: list[Id] = Field(min_length=1)
    status: Status
    nota: Texto


class Local(_Base):
    id: Id
    nome: Texto


class Cidade(_Base):
    id: Id
    nome: Texto
    pais: Texto
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    descricao: Texto
    locais: list[Local] = Field(min_length=3, max_length=3)
    pistas: list[Texto] = Field(min_length=3)


class Briefing(_Base):
    imprensa: Texto = Field(max_length=800)
    ficcao: Texto = Field(max_length=800)


class Desfecho(_Base):
    vitoria: Texto
    dossie_errado: Texto
    sem_dossie: Texto
    prazo: Texto


class Historia(_Base):
    titulo: Texto
    inicio: datetime
    prazo_horas: int = Field(gt=0, le=24 * 14)
    briefing: Briefing
    rota: list[Id] = Field(min_length=2)
    pistas: dict[Id, list[Id]]
    distratores: list[Id]
    perto: list[Texto] = Field(min_length=1)
    nada: list[Texto] = Field(min_length=1)
    desfecho: Desfecho


class Conteudo(_Base):
    fontes: list[Fonte]
    fatos: list[Fato]
    cidades: list[Cidade]
    historia: Historia


# ---------- caso exportado ----------


class Regras(_Base):
    min_investigar: int = 60
    min_checar: int = 90
    min_dossie: int = 30
    min_embarque: int = 60
    velocidade_kmh: int = 750
    dormir_de: int = Field(default=0, ge=0, le=23)
    dormir_ate: int = Field(default=6, ge=0, le=23)


class FonteOut(_Base):
    veiculo: str
    titulo: str
    url: str
    publicado: date


class FatoOut(_Base):
    texto: str
    status: Status
    nota: str
    fontes: list[FonteOut]


class CidadeOut(_Base):
    nome: str
    pais: str
    lat: float
    lon: float
    descricao: str
    locais: list[Local]


class Pista(_Base):
    local: Id
    texto: str
    fato: Id | None = None


class Caso(_Base):
    versao: Literal[1] = 1
    id: str
    modo: Modo
    seed: int
    titulo: str
    briefing: str
    inicio: datetime
    prazo_horas: int
    regras: Regras
    rota: list[Id]
    destino_pais: str
    alvo_local: Id
    paises: list[str]
    cidades: dict[Id, CidadeOut]
    destinos: dict[Id, list[Id]]
    pistas: dict[Id, list[Pista]]
    fatos: dict[Id, FatoOut]
    perto: list[str]
    nada: list[str]
    desfecho: Desfecho
