// Save local (só neste navegador). Leitura sempre validada; falha → descarta.

import type { Caso, Estado, TipoEvento } from "./tipos";
import { validarEstado } from "./validar";

const CHAVE = "rota-de-fuga:save:v1";
const MAX_NOTAS = 400;
const TIPOS = new Set<TipoEvento>(["pista", "checagem", "viagem", "dossie", "sono", "fim"]);

export interface Nota {
  cidade: string;
  tipo: TipoEvento;
  texto: string;
  ref: string | null;
}

export interface Save {
  casoId: string;
  estado: Estado;
  trilha: string[];
  notas: Nota[];
}

export function lerCasoSalvo(): string | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto || bruto.length > 500_000) return null;
    const d = JSON.parse(bruto) as { casoId?: unknown };
    return typeof d.casoId === "string" ? d.casoId : null;
  } catch {
    return null;
  }
}

export function carregarSave(caso: Caso): Save | null {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Record<string, unknown>;
    if (d?.casoId !== caso.id) return null;
    const estado = validarEstado(d.estado, caso);
    const trilha = d.trilha;
    if (!Array.isArray(trilha) || !trilha.every((c) => typeof c === "string" && c in caso.cidades)) {
      return null;
    }
    const notas = d.notas;
    if (!Array.isArray(notas) || notas.length > MAX_NOTAS) return null;
    const ok = notas.every((n: Record<string, unknown>) =>
      typeof n?.cidade === "string" && n.cidade in caso.cidades
      && TIPOS.has(n.tipo as TipoEvento)
      && typeof n.texto === "string" && n.texto.length <= 2000
      && (n.ref === null || typeof n.ref === "string"));
    if (!ok) return null;
    return { casoId: caso.id, estado, trilha: trilha as string[], notas: notas as Nota[] };
  } catch {
    apagarSave();
    return null;
  }
}

export function gravarSave(s: Save): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ ...s, notas: s.notas.slice(-MAX_NOTAS) }));
  } catch {
    // modo privado / cota cheia: o jogo continua sem save
  }
}

export function apagarSave(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // idem
  }
}
