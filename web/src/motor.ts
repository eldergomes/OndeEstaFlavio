// Espelho de backend/rota/motor.py. Qualquer mudança de regra deve ser feita nos dois;
// motor.test.ts reexecuta os roteiros de golden.json exportados pelo Python.

import type { Caso, Estado, Evento, Fim } from "./tipos";

export class AcaoInvalida extends Error {}

const MIN = 60_000;

export function distanciaKm(a: [number, number], b: [number, number]): number {
  const [lat1, lon1, lat2, lon2] = [a[0], a[1], b[0], b[1]].map((g) => (g * Math.PI) / 180) as
    [number, number, number, number];
  const h = Math.sin((lat2 - lat1) / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 6371.0 * 2 * Math.asin(Math.sqrt(h));
}

function offsetMin(iso: string): number {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(iso);
  if (!m) return 0;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -v : v;
}

export function estadoInicial(caso: Caso): Estado {
  return {
    minutos: 0, pos: 0, cidade: caso.rota[0]!, investigados: [], revelados: [], checados: [],
    dossie: null, fim: null, pontos: 0,
  };
}

const ev = (tipo: Evento["tipo"], texto: string, ref: string | null = null): Evento =>
  ({ tipo, texto, ref });

export class Jogo {
  readonly e: Estado;
  private readonly inicioMs: number;

  constructor(readonly caso: Caso, estado?: Estado) {
    this.e = estado ?? estadoInicial(caso);
    // relógio "de parede" no fuso do início, representado em UTC para usar getUTC*
    this.inicioMs = Date.parse(caso.inicio) + offsetMin(caso.inicio) * MIN;
  }

  // ---------- consultas ----------

  get naRota(): boolean {
    return this.e.cidade === this.caso.rota[this.e.pos];
  }

  get relogio(): Date {
    return new Date(this.inicioMs + this.e.minutos * MIN);
  }

  get limiteMin(): number {
    return this.caso.prazo_horas * 60;
  }

  get noFinal(): boolean {
    return this.naRota && this.e.pos === this.caso.rota.length - 1;
  }

  destinos(): string[] {
    const base = [...(this.caso.destinos[this.e.cidade] ?? [])];
    const volta = this.caso.rota[this.e.pos]!;
    if (!this.naRota && !base.includes(volta)) base.push(volta);
    return base;
  }

  minutosViagem(destino: string): number {
    const a = this.caso.cidades[this.e.cidade]!;
    const b = this.caso.cidades[destino]!;
    const km = distanciaKm([a.lat, a.lon], [b.lat, b.lon]);
    const r = this.caso.regras;
    return r.min_embarque + Math.ceil((km / r.velocidade_kmh) * 2) * 30;
  }

  // ---------- ações ----------

  investigar(local: string): Evento[] {
    this.ativo();
    const locais = this.caso.cidades[this.e.cidade]!.locais.map((l) => l.id);
    const idx = locais.indexOf(local);
    if (idx < 0) throw new AcaoInvalida(`local inexistente: ${local}`);
    const final = this.noFinal;
    const repetido = this.e.investigados.includes(local);
    if (!repetido) this.e.investigados.push(local);
    const eventos = repetido ? [] : this.gastar(this.caso.regras.min_investigar);
    if (this.e.fim) return eventos;

    if (final && local === this.caso.alvo_local) return [...eventos, this.encerrar()];
    let texto: string;
    let ref: string | null = null;
    if (final) {
      texto = this.caso.perto[idx % this.caso.perto.length]!;
    } else if (this.naRota) {
      const p = this.caso.pistas[this.e.cidade]!.find((x) => x.local === local)!;
      texto = p.texto;
      ref = p.fato;
      if (ref && !this.e.revelados.includes(ref)) this.e.revelados.push(ref);
    } else {
      texto = this.caso.nada[idx % this.caso.nada.length]!;
    }
    return [...eventos, ev("pista", texto, ref)];
  }

  checar(fato: string): Evento[] {
    this.ativo();
    if (!this.e.revelados.includes(fato)) throw new AcaoInvalida(`fato não revelado: ${fato}`);
    const info = this.caso.fatos[fato]!;
    let eventos: Evento[] = [];
    if (!this.e.checados.includes(fato)) {
      this.e.checados.push(fato);
      eventos = this.gastar(this.caso.regras.min_checar);
      if (this.e.fim) return eventos;
    }
    return [...eventos, ev("checagem", `${info.status.toUpperCase()}: ${info.nota}`, fato)];
  }

  viajar(destino: string): Evento[] {
    this.ativo();
    if (!this.destinos().includes(destino)) {
      throw new AcaoInvalida(`destino indisponível: ${destino}`);
    }
    const custo = this.minutosViagem(destino);
    const ultimo = this.caso.rota.length - 1;
    const avanca = this.naRota && destino === this.caso.rota[Math.min(this.e.pos + 1, ultimo)];
    if (avanca && this.e.pos < ultimo) this.e.pos += 1;
    this.e.cidade = destino;
    this.e.investigados = [];
    const eventos = this.gastar(custo);
    if (this.e.fim) return eventos;
    return [...eventos, ev("viagem", `Chegada a ${this.caso.cidades[destino]!.nome}.`, destino)];
  }

  emitirDossie(pais: string): Evento[] {
    this.ativo();
    if (!this.caso.paises.includes(pais)) throw new AcaoInvalida(`país inválido: ${pais}`);
    this.e.dossie = pais;
    const eventos = this.gastar(this.caso.regras.min_dossie);
    if (this.e.fim) return eventos;
    return [...eventos, ev("dossie", `Dossiê emitido indicando: ${pais}.`, pais)];
  }

  // ---------- internos ----------

  private ativo(): void {
    if (this.e.fim) throw new AcaoInvalida("jogo encerrado");
  }

  private gastar(minutos: number): Evento[] {
    this.e.minutos += minutos;
    const eventos: Evento[] = [];
    const r = this.caso.regras;
    const agora = this.relogio;
    const hora = agora.getUTCHours();
    // janela de sono [dormir_de, dormir_ate), podendo atravessar a meia-noite
    const dorme = r.dormir_de > r.dormir_ate
      ? hora >= r.dormir_de || hora < r.dormir_ate
      : hora >= r.dormir_de && hora < r.dormir_ate;
    if (dorme) {
      let acordar = Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate(),
        r.dormir_ate);
      if (acordar <= agora.getTime()) acordar += 24 * 60 * MIN;
      this.e.minutos += Math.floor((acordar - agora.getTime()) / MIN);
      eventos.push(ev("sono", "Você parou para dormir."));
    }
    if (this.e.minutos > this.limiteMin) {
      this.e.minutos = this.limiteMin;
      this.e.fim = "prazo";
      eventos.push(ev("fim", this.caso.desfecho.prazo, "prazo"));
    }
    return eventos;
  }

  private encerrar(): Evento {
    let fim: Fim;
    if (this.e.dossie === null) fim = "sem_dossie";
    else if (this.e.dossie !== this.caso.destino_pais) fim = "dossie_errado";
    else {
      fim = "vitoria";
      const restanteH = Math.floor((this.limiteMin - this.e.minutos) / 60);
      this.e.pontos = restanteH * 10 + this.e.checados.length * 20;
    }
    this.e.fim = fim;
    return ev("fim", this.caso.desfecho[fim], fim);
  }
}
