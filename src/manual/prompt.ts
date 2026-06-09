import { MARKETS } from "../model/markets.js";

const PLAYER_MARKETS = new Set(["sot", "finalizacoes", "desarmes"]);

function playerNames(lineup: any): string[] {
  const out: string[] = [];
  for (const side of ["home", "away"]) {
    for (const p of lineup?.[side]?.jogadores ?? []) out.push(p.name);
  }
  return out;
}

function gameLabel(event: any): string {
  return event.jogo ?? `${event.home_team ?? "?"} x ${event.away_team ?? "?"}`;
}

/** UM prompt cobrindo TODOS os mercados de jogador (SOT + finalizações +
 * desarmes) de uma vez — mais intuitivo que mercado a mercado. Só over. */
export function buildPlayerGroupPrompt(event: any, lineup: any): string {
  const jogo = gameLabel(event);
  const lista = playerNames(lineup).map((n) => `- ${n}`).join("\n");
  return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Colete as odds dos MERCADOS DE JOGADOR destes jogadores:
${lista}

Para CADA jogador, colete os TRÊS mercados abaixo (quando existirem), SOMENTE o
lado OVER ("Mais de"), para cada linha visível:
- Chutes a Gol / Finalizações no Gol (SOT) → use "market_type": "sot"
- Finalizações Totais → use "market_type": "finalizacoes"
- Desarmes → use "market_type": "desarmes"

Expanda TODAS as seções/abas/acordeões antes de ler. Se um jogador da lista não
aparecer num mercado, OMITA — não invente. Não chute odd que você não viu.

Devolva APENAS JSON, um único array com TODAS as linhas, nada mais:
[ { "market_type": "sot", "entidade": "<nome exato da lista>",
    "linha": <number>, "odd_over": <number>, "book": "<nome da casa>" } ]`;
}

/** UM prompt cobrindo TODOS os mercados de partida (gols + escanteios + 1X2). */
export function buildMatchGroupPrompt(event: any): string {
  const jogo = gameLabel(event);
  return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Colete as odds dos MERCADOS DE PARTIDA abaixo, para cada linha visível:
- Gols (Total): Over/Under, OS DOIS LADOS → "market_type": "gols", "entidade": "partida"
- Escanteios (Total): Over/Under, OS DOIS LADOS → "market_type": "escanteios", "entidade": "partida"
- Resultado (1X2): uma entrada por resultado → "market_type": "vitoria", "entidade": "<nome do time ou \\"empate\\">"

Expanda TODAS as seções/abas/acordeões antes de ler. Não invente. Não chute odd
que você não viu. Nos totais (gols/escanteios) sempre traga os dois lados.

Devolva APENAS JSON, um único array com TODAS as linhas, nada mais:
[
  { "market_type": "gols", "entidade": "partida", "linha": <number>, "odd_over": <number>, "odd_under": <number>, "book": "<nome da casa>" },
  { "market_type": "escanteios", "entidade": "partida", "linha": <number>, "odd_over": <number>, "odd_under": <number>, "book": "<nome da casa>" },
  { "market_type": "vitoria", "entidade": "<time ou empate>", "odd_over": <number>, "book": "<nome da casa>" }
]`;
}

/** Monta o prompt pronto pra colar na IA externa. `marketKey` aceita os grupos
 * "jogador" e "partida" (1 prompt cobrindo todos os mercados do grupo — o caminho
 * intuitivo) ou uma chave de mercado individual (mantido p/ compatibilidade). */
export function buildOddsPrompt(event: any, marketKey: string, lineup: any): string {
  if (marketKey === "jogador") return buildPlayerGroupPrompt(event, lineup);
  if (marketKey === "partida") return buildMatchGroupPrompt(event);

  const market = MARKETS[marketKey];
  if (!market) throw new Error(`mercado desconhecido: ${marketKey}`);
  const jogo = gameLabel(event);

  if (PLAYER_MARKETS.has(marketKey)) {
    const lista = playerNames(lineup).map((n) => `- ${n}`).join("\n");
    return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Aba: "${market.label}" (mercado de jogador).

Colete SOMENTE as odds OVER ("Mais de") de cada jogador desta lista:
${lista}

Para CADA jogador e CADA linha visível, devolva uma entrada.
Expanda TODAS as seções/acordeões antes de ler. Se um jogador da lista
não aparecer, OMITA — não invente. Não chute odd que você não viu.

Devolva APENAS JSON neste formato, nada mais:
[ { "market_type": "${marketKey}", "entidade": "<nome exato da lista>",
    "linha": <number>, "odd_over": <number>, "book": "<nome da casa>" } ]`;
  }

  const exemplo = marketKey === "vitoria"
    ? `[ { "market_type": "vitoria", "entidade": "<nome do time ou empate>",
    "odd_over": <number>, "book": "<nome da casa>" } ]  (uma entrada por resultado: mandante, visitante, empate)`
    : `[ { "market_type": "${marketKey}", "entidade": "partida", "linha": <number>,
    "odd_over": <number>, "odd_under": <number>, "book": "<nome da casa>" } ]`;

  return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Aba: "${market.label}" (mercado de partida).

Colete as odds com OS DOIS LADOS (Over/Under, "Mais de"/"Menos de") de cada linha visível.
Expanda TODAS as seções antes de ler. Não invente. Não chute odd que você não viu.

Devolva APENAS JSON neste formato, nada mais:
${exemplo}`;
}
