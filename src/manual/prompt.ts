import { MARKETS } from "../model/markets.js";

const PLAYER_MARKETS = new Set(["sot", "finalizacoes", "desarmes"]);

function playerNames(lineup: any): string[] {
  const out: string[] = [];
  for (const side of ["home", "away"]) {
    for (const p of lineup?.[side]?.jogadores ?? []) out.push(p.name);
  }
  return out;
}

/** Monta o prompt pronto pra colar no Claude-extensão, fatiado por mercado.
 * Jogador: embute a lista de jogadores (ancla a IA nos nomes da base) e pede só
 * over. Partida: pede os dois lados (totais) ou um por resultado (1x2). */
export function buildOddsPrompt(event: any, marketKey: string, lineup: any): string {
  const market = MARKETS[marketKey];
  if (!market) throw new Error(`mercado desconhecido: ${marketKey}`);
  const jogo = event.jogo ?? `${event.home_team ?? "?"} x ${event.away_team ?? "?"}`;

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
