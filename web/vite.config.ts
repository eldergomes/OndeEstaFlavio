import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// CSP só no build: o servidor de dev do Vite injeta estilos inline.
// O GitHub Pages não permite cabeçalhos HTTP, então a política vai em <meta>.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

const csp = (): Plugin => ({
  name: "csp-meta",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace(
      "<!--CSP-->",
      `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    ),
});

export default defineConfig({
  base: "./",
  plugins: [csp()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
  test: { environment: "node" },
});
