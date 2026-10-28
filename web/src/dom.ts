// Construção de DOM sem innerHTML: todo texto entra como nó de texto.

import { https } from "./validar";

type Filho = Node | string | null | undefined | false;

interface Props {
  class?: string;
  attrs?: Record<string, string>;
  onClick?: () => void;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Props = {}, ...filhos: Filho[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  for (const [k, v] of Object.entries(props.attrs ?? {})) {
    if (/^on/i.test(k) || k === "href" || k === "src" || k === "style") {
      throw new Error(`atributo não permitido: ${k}`);
    }
    el.setAttribute(k, v);
  }
  if (props.onClick) el.addEventListener("click", props.onClick);
  anexar(el, filhos);
  return el;
}

export function anexar(el: Node, filhos: Filho[]): void {
  for (const f of filhos) {
    if (f === null || f === undefined || f === false) continue;
    el.appendChild(typeof f === "string" ? document.createTextNode(f) : f);
  }
}

export function botao(texto: string, onClick: () => void, props: Props = {}): HTMLButtonElement {
  const b = h("button", { ...props, onClick }, texto);
  b.type = "button";
  return b;
}

/** Link externo: só https, abre em nova aba sem referrer nem acesso a window.opener. */
export function linkExterno(url: string, texto: string): HTMLElement {
  if (!https(url)) return h("span", {}, texto);
  const a = h("a", { attrs: { target: "_blank", rel: "noopener noreferrer external" } }, texto);
  a.href = url;
  return a;
}

const SVG = "http://www.w3.org/2000/svg";

export function svg(tag: string, attrs: Record<string, string | number> = {},
  ...filhos: (SVGElement | string)[]): SVGElement {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (/^on/i.test(k) || k.includes("href")) throw new Error(`atributo não permitido: ${k}`);
    el.setAttribute(k, String(v));
  }
  for (const f of filhos) el.appendChild(typeof f === "string" ? document.createTextNode(f) : f);
  return el;
}
