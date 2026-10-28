import { carregarCaso, carregarIndice } from "./dados";
import { anexar, botao, h, linkExterno } from "./dom";
import { mapa } from "./mapa";
import { AcaoInvalida, Jogo } from "./motor";
import { type Nota, apagarSave, carregarSave, gravarSave, lerCasoSalvo } from "./salvar";
import type { Caso, Evento, Fato, IndiceCaso, Modo } from "./tipos";

type Aba = "notas" | "investigar" | "viajar" | "checar" | "dossie";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const ROTULO_ABA: Record<Aba, string> = {
  notas: "Caderno", investigar: "Investigar", viajar: "Viajar", checar: "Checar", dossie: "Dossiê",
};
const ROTULO_STATUS: Record<Fato["status"], string> = {
  confirmado: "Confirmado", contestado: "Contestado", desmentido: "Desmentido",
};
const ROTULO_FIM = {
  vitoria: "Caso resolvido", dossie_errado: "Dossiê errado", sem_dossie: "Sem dossiê",
  prazo: "Prazo esgotado",
};

const app = (): HTMLElement => document.getElementById("app")!;

function tela(...filhos: (Node | null)[]): void {
  app().replaceChildren(...filhos.filter((f): f is Node => f !== null));
  app().querySelector<HTMLElement>("[data-foco]")?.focus();
}

const horas = (min: number): string => {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return mm ? `${hh}h${String(mm).padStart(2, "0")}` : `${hh}h`;
};

function quando(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${DIAS[d.getUTCDay()]}, ${dd}/${mo} · ${String(d.getUTCHours()).padStart(2, "0")}h${
    String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function erro(msg: string): void {
  tela(h("section", { class: "janela centro" },
    h("h2", {}, "Algo deu errado"),
    h("p", {}, msg),
    botao("Voltar ao início", () => void inicio(), { attrs: { "data-foco": "" } })));
}

// ---------------- abertura ----------------

let indice: IndiceCaso[] = [];

export async function inicio(): Promise<void> {
  try {
    indice = await carregarIndice();
  } catch (e) {
    erro(e instanceof Error ? e.message : "falha ao carregar os dados");
    return;
  }
  const salvo = lerCasoSalvo();
  const temSave = salvo !== null && indice.some((c) => c.id === salvo);

  tela(h("section", { class: "janela abertura" },
    h("h1", { class: "logo" }, "Onde está Flávio Bolsonaro?"),
    h("p", { class: "subtitulo" }, "Um jogo de perseguição com checagem de fatos"),
    h("div", { class: "aviso", attrs: { role: "note" } },
      h("strong", {}, "Ficção e sátira. "),
      "Pistas marcadas como imprensa reproduzem, com atribuição, o que veículos publicaram em "
        + "27–28/10/2026, inclusive versões depois contestadas ou desmentidas. Testemunhas, horários "
        + "do jogo e desfechos são inventados. Investigados citados negam as acusações."),
    h("div", { class: "menu" },
      temSave ? botao("Continuar caso salvo", () => void abrir(salvo, true),
        { attrs: { "data-foco": "" } }) : null,
      botao("Novo caso — rota da imprensa", () => void novo("imprensa"),
        temSave ? {} : { attrs: { "data-foco": "" } }),
      botao("Novo caso — rota fictícia", () => void novo("ficcao"))),
    h("p", { class: "rodape" }, "Sem cookies, sem rastreamento. O progresso fica só neste navegador.")));
}

function novo(modo: Modo): Promise<void> {
  const opcoes = indice.filter((c) => c.modo === modo);
  const sorteio = new Uint32Array(1);
  crypto.getRandomValues(sorteio);
  const escolhido = opcoes[sorteio[0]! % opcoes.length];
  if (!escolhido) {
    erro("nenhum caso disponível");
    return Promise.resolve();
  }
  return abrir(escolhido.id, false);
}

async function abrir(id: string, continuar: boolean): Promise<void> {
  let caso: Caso;
  try {
    caso = await carregarCaso(id, indice);
  } catch (e) {
    erro(e instanceof Error ? e.message : "falha ao carregar o caso");
    return;
  }
  const save = continuar ? carregarSave(caso) : null;
  if (!save) apagarSave();
  const partida = new Partida(caso, save?.estado, save?.trilha, save?.notas);
  if (save) partida.render();
  else briefing(partida);
}

function briefing(p: Partida): void {
  tela(h("section", { class: "janela centro briefing" },
    h("p", { class: "etiqueta" }, `Caso ${p.caso.id}`),
    h("h2", {}, quando(p.jogo.relogio)),
    h("p", {}, p.caso.briefing),
    h("p", { class: "dica" },
      `Prazo: ${p.caso.prazo_horas}h. Investigar custa ${horas(p.caso.regras.min_investigar)}, `
        + `checar ${horas(p.caso.regras.min_checar)}, emitir dossiê ${horas(p.caso.regras.min_dossie)}. `
        + `Entre ${p.caso.regras.dormir_de}h e ${p.caso.regras.dormir_ate}h você dorme.`),
    botao("Começar", () => p.render(), { attrs: { "data-foco": "" } })));
}

// ---------------- partida ----------------

class Partida {
  readonly jogo: Jogo;
  aba: Aba = "notas";
  ultimos: Evento[] = [];

  constructor(readonly caso: Caso, estado?: Jogo["e"], readonly trilha: string[] = [],
    readonly notas: Nota[] = []) {
    this.jogo = new Jogo(caso, estado);
    if (this.trilha.length === 0) this.trilha.push(this.jogo.e.cidade);
  }

  private acao(fn: () => Evento[]): void {
    const cidade = this.jogo.e.cidade;
    let eventos: Evento[];
    try {
      eventos = fn();
    } catch (e) {
      if (e instanceof AcaoInvalida) return;
      throw e;
    }
    for (const ev of eventos) {
      this.notas.push({ cidade: ev.tipo === "viagem" ? this.jogo.e.cidade : cidade, ...ev });
      if (ev.tipo === "viagem") this.trilha.push(this.jogo.e.cidade);
    }
    this.ultimos = eventos;
    gravarSave({ casoId: this.caso.id, estado: this.jogo.e, trilha: this.trilha, notas: this.notas });
    if (this.jogo.e.fim) {
      apagarSave();
      fimDeJogo(this);
      return;
    }
    this.aba = "notas";
    this.render();
  }

  render(): void {
    const e = this.jogo.e;
    const cid = this.caso.cidades[e.cidade]!;
    const resta = this.jogo.limiteMin - e.minutos;

    const esquerda = h("section", { class: "painel cartao" },
      h("div", { class: "local" },
        h("h2", {}, cid.nome),
        h("p", { class: "pais" }, cid.pais),
        h("p", { class: "relogio" }, quando(this.jogo.relogio))),
      mapa(this.caso, this.trilha, e.cidade),
      h("p", { class: "descricao" }, cid.descricao));

    const direita = h("section", { class: "painel conteudo", attrs: { "aria-live": "polite" } },
      this.conteudo());

    const abas = h("nav", { class: "acoes", attrs: { "aria-label": "Ações" } },
      ...(Object.keys(ROTULO_ABA) as Aba[]).map((a, i) => {
        const b = botao(`${i + 1} ${ROTULO_ABA[a]}`, () => this.mudarAba(a),
          { class: a === this.aba ? "ativo" : "" });
        b.setAttribute("aria-pressed", String(a === this.aba));
        b.dataset.aba = a;
        return b;
      }));

    const status = h("div", { class: "status" },
      h("span", { class: resta < 24 * 60 ? "alerta" : "" }, `Restam ${horas(resta)}`),
      h("span", {}, `Dossiê: ${e.dossie ?? "não emitido"}`),
      botao("Sair", () => void inicio(), { class: "discreto" }));

    tela(h("div", { class: "jogo" }, status, esquerda, direita, abas));
  }

  mudarAba(a: Aba): void {
    this.aba = a;
    this.ultimos = [];
    this.render();
    document.querySelector<HTMLElement>(".conteudo button, .conteudo a")?.focus();
  }

  private conteudo(): Node {
    switch (this.aba) {
      case "investigar": return this.abaInvestigar();
      case "viajar": return this.abaViajar();
      case "checar": return this.abaChecar();
      case "dossie": return this.abaDossie();
      default: return this.abaNotas();
    }
  }

  private abaNotas(): Node {
    const frag = document.createDocumentFragment();
    if (this.ultimos.length) {
      anexar(frag, [h("div", { class: "fala" }, ...this.ultimos.map((ev) => h("p", {
        class: `ev ev-${ev.tipo}`,
      }, ev.tipo === "pista" && ev.ref ? h("span", { class: "selo" }, "imprensa") : null, ev.texto)))]);
    }
    const pistas = this.notas.filter((n) => n.tipo === "pista" || n.tipo === "checagem");
    anexar(frag, [
      h("h3", {}, "Caderno"),
      pistas.length === 0
        ? h("p", { class: "dica" }, "Nada anotado ainda. Comece investigando os locais da cidade (tecla 2).")
        : h("ol", { class: "caderno", attrs: { reversed: "" } }, ...pistas.slice().reverse().map((n) => {
          const checada = n.tipo === "checagem" && n.ref ? this.caso.fatos[n.ref] : undefined;
          return h("li", { class: checada ? `checagem status-${checada.status}` : "" },
            h("span", { class: "onde" }, this.caso.cidades[n.cidade]?.nome ?? ""),
            checada ? h("span", { class: "selo" }, `checagem: ${ROTULO_STATUS[checada.status]}`) : null,
            checada ? `${checada.texto} — ${checada.nota}` : n.texto);
        })),
    ]);
    return frag;
  }

  private abaInvestigar(): Node {
    const e = this.jogo.e;
    const custo = horas(this.caso.regras.min_investigar);
    return h("div", { class: "lista" },
      h("h3", {}, "Onde investigar?"),
      ...this.caso.cidades[e.cidade]!.locais.map((lo) => botao(
        e.investigados.includes(lo.id) ? `${lo.nome} ✓ (rever)` : `${lo.nome} — ${custo}`,
        () => this.acao(() => this.jogo.investigar(lo.id)))));
  }

  private abaViajar(): Node {
    const volta = this.caso.rota[this.jogo.e.pos];
    return h("div", { class: "lista" },
      h("h3", {}, "Para onde?"),
      ...this.jogo.destinos().map((d) => {
        const c = this.caso.cidades[d]!;
        const rotulo = `${c.nome} (${c.pais}) — ${horas(this.jogo.minutosViagem(d))}`
          + (!this.jogo.naRota && d === volta ? " · voltar" : "");
        return botao(rotulo, () => this.acao(() => this.jogo.viajar(d)));
      }));
  }

  private abaChecar(): Node {
    const e = this.jogo.e;
    if (e.revelados.length === 0) {
      return h("div", {}, h("h3", {}, "Checagem"),
        h("p", { class: "dica" },
          this.caso.modo === "ficcao"
            ? "No modo ficção não há pistas de imprensa para checar."
            : "Pistas marcadas como imprensa aparecem aqui para checagem."));
    }
    return h("div", { class: "lista" },
      h("h3", {}, "Checagem de pistas da imprensa"),
      ...e.revelados.map((id) => {
        const f = this.caso.fatos[id]!;
        if (!e.checados.includes(id)) {
          return h("div", { class: "fato" }, h("p", {}, f.texto),
            botao(`Checar — ${horas(this.caso.regras.min_checar)}`,
              () => this.acao(() => this.jogo.checar(id))));
        }
        return cartaoFato(f);
      }));
  }

  private abaDossie(): Node {
    const e = this.jogo.e;
    return h("div", { class: "lista dossie" },
      h("h3", {}, "Dossiê de cooperação internacional"),
      h("p", { class: "dica" },
        `Indique o país de destino. Emitir custa ${horas(this.caso.regras.min_dossie)}; `
          + "você pode reemitir se mudar de ideia."),
      h("div", { class: "grade-paises" }, ...this.caso.paises.map((p) => {
        const b = botao(p, () => this.acao(() => this.jogo.emitirDossie(p)),
          { class: p === e.dossie ? "ativo" : "" });
        b.setAttribute("aria-pressed", String(p === e.dossie));
        return b;
      })));
  }
}

function cartaoFato(f: Fato): HTMLElement {
  return h("div", { class: `fato status-${f.status}` },
    h("span", { class: "selo" }, ROTULO_STATUS[f.status]),
    h("p", {}, f.texto),
    h("p", { class: "nota" }, f.nota),
    h("ul", { class: "fontes" }, ...f.fontes.map((fo) =>
      h("li", {}, linkExterno(fo.url, `${fo.veiculo} — ${fo.titulo}`), ` (${fo.publicado})`))));
}

function fimDeJogo(p: Partida): void {
  const e = p.jogo.e;
  const fim = e.fim!;
  const ultimo = p.ultimos.at(-1)?.texto ?? "";
  const rota = p.caso.rota.map((c) => p.caso.cidades[c]!.nome).join(" → ");
  tela(h("section", { class: `janela fim fim-${fim}` },
    h("h2", {}, ROTULO_FIM[fim]),
    h("p", {}, ultimo),
    fim === "vitoria" ? h("p", { class: "pontos" }, `Pontuação: ${e.pontos}`) : null,
    h("h3", {}, p.caso.modo === "imprensa" ? "Rota noticiada" : "Rota deste caso (fictícia)"),
    h("p", {}, `${rota} — ${p.caso.destino_pais}`),
    Object.keys(p.caso.fatos).length
      ? h("div", {}, h("h3", {}, "O que a imprensa publicou (e o que se confirmou)"),
        ...Object.values(p.caso.fatos).map(cartaoFato))
      : null,
    h("div", { class: "menu" },
      botao("Jogar de novo", () => void inicio(), { attrs: { "data-foco": "" } }))));
}

// ---------------- teclado ----------------

export function atalhos(): void {
  document.addEventListener("keydown", (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (!/^[1-5]$/.test(ev.key) && ev.key !== "Escape") return;
    const alvo = document.querySelector<HTMLButtonElement>(
      ev.key === "Escape" ? 'nav.acoes [data-aba="notas"]' : `nav.acoes button:nth-child(${ev.key})`);
    if (alvo) {
      ev.preventDefault();
      alvo.click();
    }
  });
}
