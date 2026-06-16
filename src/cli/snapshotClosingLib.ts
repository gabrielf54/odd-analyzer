// Extrai a odd de FECHAMENTO (lado registrado) do payload de odds de PARTIDA da BSD,
// p/ o CLV do loop forward. O formato real é PLANO (spike 2026-06-15) — ver
// src/odds/bsdMatchOdds.ts. gols = over da linha; vitória = o desfecho (mandante por
// padrão; passe o outcome p/ empate/visitante). Devolve null quando não acha (o CLI
// erra limpo). Player prop NÃO usa isto (BSD não dá odd de prop — colada manual).
import { parseBsdMatchOdds, matchBetOdd, type Outcome1x2 } from "../odds/bsdMatchOdds.js";

export function matchClosingOdd(
  oddsPayload: any, marketType: string, linha: number, outcome: Outcome1x2 = "home",
): number | null {
  return matchBetOdd(parseBsdMatchOdds(oddsPayload), marketType, linha, outcome);
}

/** Janela de FECHAMENTO p/ o CLV: só captura a odd de um jogo PERTO do apito (depois da
 * escalação oficial, que sai ~1h antes e move o preço). Sem isso, rodar o bulk de tarde
 * travaria um "fechamento" cedo demais p/ os jogos da noite (ex.: pegar o jogo das 22h às
 * 15h). Default: do apito até `windowMin` antes (90 = ~pós-escalação); tolera `graceMin`
 * minutos DEPOIS do apito (rodou um tico atrasado). Retorna false se a data é inválida. */
export function withinClosingWindow(kickoffMs: number, nowMs: number, windowMin = 90, graceMin = 15): boolean {
  if (!Number.isFinite(kickoffMs)) return false;
  const minsToKickoff = (kickoffMs - nowMs) / 60000;
  return minsToKickoff <= windowMin && minsToKickoff >= -graceMin;
}
