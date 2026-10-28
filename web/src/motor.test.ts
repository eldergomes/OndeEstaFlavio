import { describe, expect, it } from "vitest";
import golden from "../public/data/golden.json";
import { AcaoInvalida, Jogo } from "./motor";
import type { Caso } from "./tipos";
import { validarCaso, validarEstado } from "./validar";

// Gerados por `uv run rota export` (pré-requisito do teste).
const arquivos = import.meta.glob<Caso>("../public/data/casos/*.json", {
  eager: true, import: "default",
});
const casos = new Map(Object.values(arquivos).map((c) => [c.id, validarCaso(c)]));

type Roteiro = { bot: string; acoes: [string, string][]; estado: unknown };

function executar(j: Jogo, [tipo, arg]: [string, string]): void {
  if (tipo === "investigar") j.investigar(arg);
  else if (tipo === "checar") j.checar(arg);
  else if (tipo === "viajar") j.viajar(arg);
  else if (tipo === "dossie") j.emitirDossie(arg);
  else throw new Error(tipo);
}

describe("paridade com o motor Python (golden.json)", () => {
  for (const [id, roteiros] of Object.entries(golden as unknown as Record<string, Roteiro[]>)) {
    for (const r of roteiros) {
      it(`${id} / bot ${r.bot}`, () => {
        const caso = casos.get(id);
        expect(caso).toBeDefined();
        const j = new Jogo(caso!);
        r.acoes.forEach((a) => executar(j, a));
        expect(j.e).toEqual(r.estado);
      });
    }
  }
});

describe("regras", () => {
  const caso = casos.get("imprensa-1")!;

  it("rejeita ações inválidas", () => {
    const j = new Jogo(caso);
    expect(() => j.investigar("../x")).toThrow(AcaoInvalida);
    expect(() => j.viajar(caso.rota.at(-1)!)).toThrow(AcaoInvalida);
    expect(() => j.checar("migracoes-ponte")).toThrow(AcaoInvalida);
    expect(() => j.emitirDossie("Atlântida")).toThrow(AcaoInvalida);
  });

  it("estado salvo adulterado é rejeitado", () => {
    const j = new Jogo(caso);
    expect(validarEstado(JSON.parse(JSON.stringify(j.e)), caso)).toEqual(j.e);
    for (const ruim of [
      { ...j.e, cidade: "atlantida" },
      { ...j.e, minutos: -1 },
      { ...j.e, pos: 99 },
      { ...j.e, checados: ["x"] },
      { ...j.e, dossie: "<img src=x onerror=alert(1)>" },
      { ...j.e, fim: "hack" },
      null,
      [],
    ]) {
      expect(() => validarEstado(ruim, caso)).toThrow();
    }
  });

  it("caso com url não-https é rejeitado", () => {
    const ruim = structuredClone(caso);
    const f = Object.values(ruim.fatos)[0]!;
    f.fontes[0]!.url = "javascript:alert(1)";
    expect(() => validarCaso(ruim)).toThrow();
  });
});
