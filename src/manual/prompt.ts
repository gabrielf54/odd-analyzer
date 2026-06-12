import { MARKETS } from "../model/markets.js";

const PLAYER_MARKETS = new Set(["sot", "finalizacoes", "desarmes", "faltas", "passes"]);

/** Teto de odd: células com odd ≥ 10 (prob implícita < 10%) são linhas-limiar
 * muito improváveis — quase nunca têm valor nos nossos mercados de contagem e
 * só incham a resposta. Em jogos de Copa com muitas linhas isso estoura o limite
 * de saída da IA externa. Cortamos na coleta. */
const ODD_CAP = 10;
const ODD_CAP_RULE = `LIMITE DE ODD: IGNORE qualquer célula com odd ≥ ${ODD_CAP} (linhas muito improváveis) — não a colete, não a inclua na resposta.`;

/** Saída ENXUTA: em vez de JSON (nomes de chave repetidos em toda linha), a IA
 * devolve texto delimitado por "|". `book` aparece UMA vez no cabeçalho. Corta
 * ~2/3 dos tokens de output sem perder nenhum dado que o motor usa. */
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
 * desarmes + faltas + passes) de uma vez. Calibrado pela realidade da bet365
 * (auditoria 2026-06-09): linhas são colunas-limiar "N+" (não "Mais de X.5"),
 * não há lado Under, nomes vêm sem acento/islandês, cada mercado é opcional. */
export function buildPlayerGroupPrompt(event: any, lineup: any): string {
  const jogo = gameLabel(event);
  const lista = playerNames(lineup).map((n) => `- ${n}`).join("\n");
  return `Você está na página de apostas do jogo ${jogo} numa casa de apostas (ex.: bet365),
na aba de mercados de JOGADOR ("Player"/"Jogador"). Colete odds destes jogadores:
${lista}

MERCADOS-ALVO (todos OPCIONAIS — se a casa não tiver um NESTE jogo, simplesmente
não gere linhas dele; outros jogos podem ter):
- Chutes a Gol / "Player Shots On Target"     → market_type "sot"
- Finalizações Totais / "Player Shots"        → market_type "finalizacoes"
- Desarmes / "Tackles"                        → market_type "desarmes"
- Faltas Cometidas / "Player Fouls" / "Fouls" → market_type "faltas"
- Passes / "Player Passes" / "Total de Passes" → market_type "passes"
ATENÇÃO: "Player Shots On Target" (sot) e "Player Shots" (finalizacoes) têm rótulos
quase idênticos — NÃO troque um pelo outro. Idem "Faltas Cometidas" (faltas, o que o
jogador comete) vs "Faltas Sofridas" (NÃO é nosso mercado — ignore).

COMO LER AS LINHAS: nesta casa NÃO existe botão "Mais de"/"Over"/"Under". As linhas
são COLUNAS-LIMIAR acumulativas "1+", "2+", "3+"… — cada célula com odd já é, por
definição, um over ("aquele número OU MAIS"). Para cada célula com odd:
  - "linha"    = (número da coluna) − 0.5   → "2+" vira 1.5, "3+" vira 2.5
  - "odd_over" = a odd da célula
Só se a casa usar o estilo clássico "Mais de X.5", use esse X.5 direto como "linha".
IGNORE células com cadeado/suspensas (sem odd). NÃO confunda colunas de desfecho
("Score"/"Assist"/"Score or Assist") com linhas — não são mercado de contagem.
${ODD_CAP_RULE}

NOMES — case com a MINHA lista, não com o texto cru da casa. A casa remove acentos e
caracteres islandeses e às vezes muda o nome do meio. Para casar: tire acentos;
þ→th, ð→d, æ→ae, ö/ø→o; ignore caixa; case por sobrenome + primeiro nome aceitando
nome do meio ausente OU extra ("Mikael Egill Ellertsson" = "Mikael Ellertsson").
Cuidado: em mercados de goleiro a casa pode exibir outro goleiro (reserva) — só
inclua se casar com a lista. Sem match seguro → OMITA a linha, não invente.

EXECUÇÃO: garanta a aba "Player". Em cada mercado-alvo, abra o acordeão se fechado e
clique "Mostrar Mais"/"Show more" REPETIDAMENTE até sumir — ele revela mais JOGADORES
em uns mercados e mais COLUNAS em outros. Ignore blocos "Outras por Pedido"/sob
demanda. Não chute nenhuma odd que você não viu.

SAÍDA — formato compacto, NADA de JSON e nada de explicação. A PRIMEIRA linha é o
nome da casa: book=<nome da casa>. Depois UMA linha por odd, campos separados por "|":
  market_type|entidade|linha|odd_over
- "entidade": o nome EXATAMENTE como está na MINHA lista acima. Se a casa exibir um
  nome DIFERENTE do meu, escreva  entidade^nome_exibido_na_casa  (com "^"); se forem
  IGUAIS, escreva só entidade (sem "^"). Isso me deixa conferir matches duvidosos.
Exemplo (um por market_type; o "^" só aparece quando o nome difere):
book=bet365
sot|<jogador da lista>|1.5|1.72
finalizacoes|<jogador da lista>|2.5|2.10
desarmes|<jogador da lista>|1.5|1.90
faltas|<jogador da lista>|0.5|1.55
passes|<jogador da lista>^<nome na casa>|29.5|1.80`;
}

/** UM prompt cobrindo TODOS os mercados de partida (gols + escanteios + 1X2). */
export function buildMatchGroupPrompt(event: any): string {
  const jogo = gameLabel(event);
  return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Colete as odds dos MERCADOS DE PARTIDA abaixo, para cada linha visível:
- Gols (Total): Over/Under, OS DOIS LADOS → market_type "gols", entidade "partida"
- Escanteios (Total): Over/Under, OS DOIS LADOS → market_type "escanteios", entidade "partida"
- Resultado (1X2): uma entrada por resultado → market_type "vitoria", entidade <time ou "empate">

Expanda TODAS as seções/abas/acordeões antes de ler. Não invente. Não chute odd
que você não viu. Nos totais (gols/escanteios) sempre traga os dois lados.
${ODD_CAP_RULE} Nos totais, use a odd do lado Over para decidir o corte.

SAÍDA — formato compacto, NADA de JSON. A PRIMEIRA linha é book=<nome da casa>.
Depois UMA linha por odd, campos separados por "|":
- gols e escanteios (DOIS lados):  market_type|partida|linha|odd_over|odd_under
- vitoria (uma por resultado, SEM linha):  vitoria|<time ou "empate">|odd_over
Exemplo:
book=bet365
gols|partida|2.5|1.90|1.95
escanteios|partida|9.5|1.85|1.95
vitoria|${event.home_team ?? "Mandante"}|1.80
vitoria|empate|3.40
vitoria|${event.away_team ?? "Visitante"}|4.20`;
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

Para CADA jogador e CADA linha visível, gere uma linha. Expanda TODAS as seções/
acordeões antes de ler. Se um jogador da lista não aparecer, OMITA — não invente.
Não chute odd que você não viu.
${ODD_CAP_RULE}

SAÍDA — formato compacto, NADA de JSON. A PRIMEIRA linha é book=<nome da casa>.
Depois UMA linha por odd, campos separados por "|":
  ${marketKey}|entidade|linha|odd_over
"entidade" = o nome exato da minha lista; se a casa exibir nome DIFERENTE, escreva
entidade^nome_na_casa (com "^"), senão só entidade.
Exemplo:
book=bet365
${marketKey}|<nome exato da lista>|1.5|1.72`;
  }

  if (marketKey === "vitoria") {
    return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Aba: "${market.label}" (mercado de partida).

Colete o Resultado (1X2): uma entrada por resultado (mandante, visitante, empate).
Expanda TODAS as seções antes de ler. Não invente. Não chute odd que você não viu.
${ODD_CAP_RULE}

SAÍDA — formato compacto, NADA de JSON. A PRIMEIRA linha é book=<nome da casa>.
Depois UMA linha por resultado (SEM linha numérica):
  vitoria|<time ou "empate">|odd_over
Exemplo:
book=bet365
vitoria|${event.home_team ?? "Mandante"}|1.80
vitoria|empate|3.40`;
  }

  return `Você está na página de apostas do jogo ${jogo} na casa de apostas.
Aba: "${market.label}" (mercado de partida).

Colete as odds com OS DOIS LADOS (Over/Under, "Mais de"/"Menos de") de cada linha visível.
Expanda TODAS as seções antes de ler. Não invente. Não chute odd que você não viu.
${ODD_CAP_RULE} Nos totais, use a odd do lado Over para decidir o corte.

SAÍDA — formato compacto, NADA de JSON. A PRIMEIRA linha é book=<nome da casa>.
Depois UMA linha por odd, campos separados por "|":
  ${marketKey}|partida|linha|odd_over|odd_under
Exemplo:
book=bet365
${marketKey}|partida|2.5|1.90|1.95`;
}
