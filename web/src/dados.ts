// Carregamento dos dados estáticos com limite de tamanho e verificação SHA-256 do manifest.

import type { Caso, IndiceCaso } from "./tipos";
import { DadoInvalido, validarCaso, validarIndice } from "./validar";

const BASE = "data/";
const LIMITE_BYTES = 1_000_000;

let manifest: Record<string, string> | null = null;

async function baixar(caminho: string): Promise<string> {
  const resp = await fetch(BASE + caminho, { credentials: "omit", cache: "no-cache" });
  if (!resp.ok) throw new DadoInvalido(`falha ao baixar ${caminho} (${resp.status})`);
  const texto = await resp.text();
  if (texto.length > LIMITE_BYTES) throw new DadoInvalido(`${caminho} grande demais`);
  return texto;
}

async function sha256(texto: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null; // contexto inseguro (http): sem verificação
  const dig = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(dig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function baixarVerificado(caminho: string): Promise<unknown> {
  manifest ??= JSON.parse(await baixar("manifest.json")) as Record<string, string>;
  const texto = await baixar(caminho);
  const esperado = manifest[caminho];
  if (typeof esperado !== "string") throw new DadoInvalido(`${caminho} fora do manifest`);
  const obtido = await sha256(texto);
  if (obtido !== null && obtido !== esperado) {
    throw new DadoInvalido(`${caminho}: hash não confere`);
  }
  return JSON.parse(texto);
}

export async function carregarIndice(): Promise<IndiceCaso[]> {
  return validarIndice(await baixarVerificado("indice.json"));
}

export async function carregarCaso(id: string, indice: IndiceCaso[]): Promise<Caso> {
  // só ids presentes no índice viram caminho de fetch
  if (!indice.some((c) => c.id === id)) throw new DadoInvalido(`caso desconhecido: ${id}`);
  return validarCaso(await baixarVerificado(`casos/${id}.json`));
}
