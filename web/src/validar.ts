// Validação estrutural de dados externos (JSON do caso e save do localStorage).
// Defesa em profundidade: o JSON vem do próprio site, mas o save pode estar corrompido ou adulterado.

import type { Caso, Estado, IndiceCaso } from "./tipos";

export class DadoInvalido extends Error {}

type Obj = Record<string, unknown>;

const ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
const CASO_ID = /^(imprensa|ficcao)-\d{1,10}$/;
const FIM = new Set(["vitoria", "dossie_errado", "sem_dossie", "prazo"]);
const STATUS = new Set(["confirmado", "contestado", "desmentido"]);

function falha(caminho: string): never {
  throw new DadoInvalido(`dado inválido em ${caminho}`);
}

function obj(v: unknown, c: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) falha(c);
  return v as Obj;
}

function arr(v: unknown, c: string): unknown[] {
  if (!Array.isArray(v)) falha(c);
  return v;
}

function str(v: unknown, c: string, max = 2000): string {
  if (typeof v !== "string" || v.length > max) falha(c);
  return v;
}

function num(v: unknown, c: string): number {
  if (typeof v !== "number" || !Number.isFinite(v)) falha(c);
  return v;
}

function id(v: unknown, c: string): string {
  const s = str(v, c, 41);
  if (!ID.test(s)) falha(c);
  return s;
}

function strs(v: unknown, c: string): string[] {
  return arr(v, c).map((x, i) => str(x, `${c}[${i}]`));
}

function ids(v: unknown, c: string): string[] {
  return arr(v, c).map((x, i) => id(x, `${c}[${i}]`));
}

export function https(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function validarCaso(dado: unknown): Caso {
  const d = obj(dado, "caso");
  if (d.versao !== 1) falha("caso.versao");
  if (!CASO_ID.test(str(d.id, "caso.id", 30))) falha("caso.id");
  if (d.modo !== "imprensa" && d.modo !== "ficcao") falha("caso.modo");
  num(d.seed, "caso.seed");
  str(d.titulo, "caso.titulo");
  str(d.briefing, "caso.briefing");
  if (Number.isNaN(Date.parse(str(d.inicio, "caso.inicio", 40)))) falha("caso.inicio");
  if (num(d.prazo_horas, "caso.prazo_horas") <= 0) falha("caso.prazo_horas");

  const r = obj(d.regras, "regras");
  for (const k of ["min_investigar", "min_checar", "min_dossie", "min_embarque", "velocidade_kmh",
    "dormir_de", "dormir_ate"]) {
    if (num(r[k], `regras.${k}`) < 0) falha(`regras.${k}`);
  }
  if (num(r.velocidade_kmh, "regras.velocidade_kmh") === 0) falha("regras.velocidade_kmh");

  const cidades = obj(d.cidades, "cidades");
  for (const [k, v] of Object.entries(cidades)) {
    id(k, "cidades");
    const c = obj(v, `cidades.${k}`);
    str(c.nome, `cidades.${k}.nome`);
    str(c.pais, `cidades.${k}.pais`);
    str(c.descricao, `cidades.${k}.descricao`);
    num(c.lat, `cidades.${k}.lat`);
    num(c.lon, `cidades.${k}.lon`);
    const locais = arr(c.locais, `cidades.${k}.locais`);
    if (locais.length !== 3) falha(`cidades.${k}.locais`);
    locais.forEach((l, i) => {
      const lo = obj(l, `cidades.${k}.locais[${i}]`);
      id(lo.id, `cidades.${k}.locais[${i}].id`);
      str(lo.nome, `cidades.${k}.locais[${i}].nome`);
    });
  }
  const existe = (c: string, ctx: string): void => {
    if (!(c in cidades)) falha(ctx);
  };

  const rota = ids(d.rota, "rota");
  if (rota.length < 2) falha("rota");
  rota.forEach((c) => existe(c, "rota"));
  const paises = strs(d.paises, "paises");
  if (!paises.includes(str(d.destino_pais, "destino_pais"))) falha("destino_pais");
  id(d.alvo_local, "alvo_local");

  for (const [k, v] of Object.entries(obj(d.destinos, "destinos"))) {
    existe(k, "destinos");
    ids(v, `destinos.${k}`).forEach((c) => existe(c, `destinos.${k}`));
  }
  const fatos = obj(d.fatos, "fatos");
  for (const [k, v] of Object.entries(fatos)) {
    id(k, "fatos");
    const f = obj(v, `fatos.${k}`);
    str(f.texto, `fatos.${k}.texto`);
    str(f.nota, `fatos.${k}.nota`);
    if (!STATUS.has(str(f.status, `fatos.${k}.status`))) falha(`fatos.${k}.status`);
    arr(f.fontes, `fatos.${k}.fontes`).forEach((x, i) => {
      const fo = obj(x, `fatos.${k}.fontes[${i}]`);
      str(fo.veiculo, "fonte.veiculo");
      str(fo.titulo, "fonte.titulo");
      str(fo.publicado, "fonte.publicado", 20);
      if (!https(str(fo.url, "fonte.url", 500))) falha("fonte.url");
    });
  }
  for (const [k, v] of Object.entries(obj(d.pistas, "pistas"))) {
    existe(k, "pistas");
    arr(v, `pistas.${k}`).forEach((x, i) => {
      const p = obj(x, `pistas.${k}[${i}]`);
      id(p.local, `pistas.${k}[${i}].local`);
      str(p.texto, `pistas.${k}[${i}].texto`);
      if (p.fato !== null && !(id(p.fato, `pistas.${k}[${i}].fato`) in fatos)) {
        falha(`pistas.${k}[${i}].fato`);
      }
    });
  }
  if (strs(d.perto, "perto").length === 0) falha("perto");
  if (strs(d.nada, "nada").length === 0) falha("nada");
  const ds = obj(d.desfecho, "desfecho");
  for (const k of ["vitoria", "dossie_errado", "sem_dossie", "prazo"]) str(ds[k], `desfecho.${k}`);
  return d as unknown as Caso;
}

export function validarIndice(dado: unknown): IndiceCaso[] {
  const d = obj(dado, "indice");
  if (d.versao !== 1) falha("indice.versao");
  return arr(d.casos, "indice.casos").map((x, i) => {
    const c = obj(x, `indice.casos[${i}]`);
    if (!CASO_ID.test(str(c.id, "id", 30))) falha(`indice.casos[${i}].id`);
    if (c.modo !== "imprensa" && c.modo !== "ficcao") falha(`indice.casos[${i}].modo`);
    return { id: c.id as string, modo: c.modo, seed: num(c.seed, "seed") };
  });
}

/** Valida um estado salvo contra o caso a que pertence. */
export function validarEstado(dado: unknown, caso: Caso): Estado {
  const e = obj(dado, "estado");
  const minutos = num(e.minutos, "minutos");
  const pos = num(e.pos, "pos");
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > caso.prazo_horas * 60) falha("minutos");
  if (!Number.isInteger(pos) || pos < 0 || pos >= caso.rota.length) falha("pos");
  const cidade = id(e.cidade, "cidade");
  if (!(cidade in caso.cidades)) falha("cidade");
  const locais = new Set(caso.cidades[cidade]?.locais.map((l) => l.id));
  const investigados = ids(e.investigados, "investigados");
  if (investigados.some((l) => !locais.has(l))) falha("investigados");
  const revelados = ids(e.revelados, "revelados");
  const checados = ids(e.checados, "checados");
  if (revelados.some((f) => !(f in caso.fatos))) falha("revelados");
  if (checados.some((f) => !revelados.includes(f))) falha("checados");
  const dossie = e.dossie === null ? null : str(e.dossie, "dossie", 80);
  if (dossie !== null && !caso.paises.includes(dossie)) falha("dossie");
  if (e.fim !== null && !FIM.has(str(e.fim, "fim", 20))) falha("fim");
  return {
    minutos, pos, cidade, investigados, revelados, checados, dossie,
    fim: e.fim as Estado["fim"],
    pontos: num(e.pontos, "pontos"),
  };
}
