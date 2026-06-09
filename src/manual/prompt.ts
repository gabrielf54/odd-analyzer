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
 * desarmes) de uma vez. Calibrado pela realidade da bet365 (auditoria
 * 2026-06-09): linhas são colunas-limiar "N+" (não "Mais de X.5"), não há lado
 * Under, nomes vêm sem acento/islandês, e cada mercado é opcional por jogo. */
export function buildPlayerGroupPrompt(event: any, lineup: any): string {
  const jogo = gameLabel(event);
  const lista = playerNames(lineup).map((n) => `- ${n}`).join("\n");
  return `Você está na página de apostas do jogo ${jogo} numa casa de apostas (ex.: bet365),
na aba de mercados de JOGADOR ("Player"/"Jogador"). Colete odds destes jogadores:
${lista}

MERCADOS-ALVO (todos OPCIONAIS — se a casa não tiver um NESTE jogo, simplesmente
não gere linhas dele; outros jogos podem ter):
- Chutes a Gol / "Player Shots On Target"  → "market_type": "sot"
- Finalizações Totais / "Player Shots"     → "market_type": "finalizacoes"
- Desarmes / "Tackles"                     → "market_type": "desarmes"
ATENÇÃO: "Player Shots On Target" (sot) e "Player Shots" (finalizacoes) têm rótulos
quase idênticos — NÃO troque um pelo outro. Sempre grave o rótulo cru da casa em
"market_label_casa" para conferência.

COMO LER AS LINHAS: nesta casa NÃO existe botão "Mais de"/"Over"/"Under". As linhas
são COLUNAS-LIMIAR acumulativas "1+", "2+", "3+"… — cada célula com odd já é, por
definição, um over ("aquele número OU MAIS"). Para cada célula com odd:
  - "linha"       = (número da coluna) − 0.5   → "2+" vira 1.5, "3+" vira 2.5
  - "linha_label" = o rótulo cru da coluna ("2+")
  - "odd_over"    = a odd da célula
Só se a casa usar o estilo clássico "Mais de X.5", use esse X.5 direto como "linha".
IGNORE células com cadeado/suspensas (sem odd). NÃO confunda colunas de desfecho
("Score"/"Assist"/"Score or Assist") com linhas — não são mercado de contagem.

NOMES — case com a MINHA lista, não com o texto cru da casa. A casa remove acentos e
caracteres islandeses e às vezes muda o nome do meio. Para casar: tire acentos;
þ→th, ð→d, æ→ae, ö/ø→o; ignore caixa; case por sobrenome + primeiro nome aceitando
nome do meio ausente OU extra ("Mikael Egill Ellertsson" = "Mikael Ellertsson").
Em "entidade" devolva o nome EXATAMENTE como está na minha lista acima; em
"entidade_casa", o nome como exibido na casa. Sem match seguro → OMITA, não invente.
Cuidado: em mercados de goleiro a casa pode exibir outro goleiro (reserva) — só
inclua se casar com a lista.

EXECUÇÃO: garanta a aba "Player". Em cada mercado-alvo, abra o acordeão se fechado e
clique "Mostrar Mais"/"Show more" REPETIDAMENTE até sumir — ele revela mais JOGADORES
em uns mercados e mais COLUNAS em outros. Ignore blocos "Outras por Pedido"/sob
demanda. Não chute nenhuma odd que você não viu.

Devolva APENAS JSON, um único array com TODAS as linhas, nada mais. Um exemplo por
market_type:
[
  { "market_type": "sot", "market_label_casa": "Player Shots On Target",
    "entidade": "<nome da minha lista>", "entidade_casa": "<nome exibido na casa>",
    "linha": 1.5, "linha_label": "2+", "odd_over": 1.72, "book": "<nome da casa>" },
  { "market_type": "finalizacoes", "market_label_casa": "Player Shots",
    "entidade": "<nome da minha lista>", "entidade_casa": "<nome exibido na casa>",
    "linha": 2.5, "linha_label": "3+", "odd_over": 2.10, "book": "<nome da casa>" },
  { "market_type": "desarmes", "market_label_casa": "Tackles",
    "entidade": "<nome da minha lista>", "entidade_casa": "<nome exibido na casa>",
    "linha": 1.5, "linha_label": "2+", "odd_over": 1.90, "book": "<nome da casa>" }
]`;
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
