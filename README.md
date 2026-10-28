# Onde está Flávio Bolsonaro?

Jogo indie de perseguição geográfica que roda no navegador. Você é um agente da Polícia Federal
e precisa reconstituir, com fontes checadas, a rota de um senador que deixou o país
contra uma ordem judicial.

> **Aviso:** obra de **ficção e sátira**. Pistas marcadas como "imprensa" reproduzem, com atribuição,
> o que veículos jornalísticos publicaram em 27–28/10/2026, inclusive versões que depois foram
> contestadas ou desmentidas. O jogo mostra o status de cada uma. Diálogos de testemunhas,
> horários do jogo e o desfecho são inventados. Investigados citados negam as acusações.

## Como funciona

- `content/` — conteúdo revisado à mão (cidades, fontes, fatos com status).
- `backend/rota/` — Python: valida o conteúdo, gera casos com seed e exporta JSON estático.
- `web/` — frontend estático (GitHub Pages) que executa o caso exportado.

```sh
uv sync
uv run rota validate          # integridade do conteúdo + simulação de jogabilidade
uv run rota play --seed 7     # jogar no terminal
uv run rota export            # gera web/public/data/
uv run pytest

cd web
npm ci
npm test                      # paridade do motor TS com o Python (requer o export acima)
npm run dev                   # http://localhost:5173
npm run build                 # site estático em web/dist (CSP aplicada no build)
```

## Licenças

Código: MIT (ver `LICENSE`). Textos originais em `content/`: CC BY-SA 4.0.
Trechos atribuídos a veículos são citações curtas com link para a fonte.
