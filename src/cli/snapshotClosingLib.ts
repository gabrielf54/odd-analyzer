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
