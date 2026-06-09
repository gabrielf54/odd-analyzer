import { sim, normalize } from "../crosswalk/match.js";
import type { ManualOddsLine } from "./schema.js";

// Casas escrevem o nome abreviado ("K. Havertz"); a base traz o nome completo
// ("Kai Havertz"). O Dice da string inteira penaliza a inicial (~0.74) e quase
// nada auto-casa. O sobrenome é a parte estável entre fontes — casamos pelo
// MAIOR entre Dice-da-string-inteira e Dice-do-sobrenome.
const AUTO_THRESHOLD = 0.85; // score mínimo do melhor candidato p/ auto-casar
const MARGIN = 0.15;          // distância mínima do 2º melhor (anti-ambiguidade)

function lastToken(n: string): string {
  const parts = n.split(" ").filter(Boolean);
  return parts.length ? parts[parts.length - 1]! : n;
}

/** Score de nome entre fontes: máximo entre a similaridade da string inteira e a
 * do sobrenome (último token). Robusto a primeiro-nome abreviado. */
export function scoreName(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  return Math.max(sim(na, nb), sim(lastToken(na), lastToken(nb)));
}

export interface OddsMatched extends ManualOddsLine { player_id: string; player_name: string; }
export interface SemMatch { nome_casa: string; candidatos: { id: string; name: string; confianca: number }[]; }
export interface MatchOddsResult { casados: OddsMatched[]; sem_match: SemMatch[]; }

/** Casa cada linha de jogador (nome da casa) a um jogador do squad.
 * overrides: { nome_normalizado_casa -> player_id } vindos do crosswalk salvo.
 * Auto-casa só quando o melhor candidato passa o threshold E está claramente à
 * frente do 2º (margem). Caso contrário → sem_match com top-3 candidatos.
 * Fail-closed: na ambiguidade nunca casa errado, devolve pro operador decidir. */
export function matchPlayerOdds(
  lines: ManualOddsLine[],
  squad: { id: string; name: string }[],
  overrides: Record<string, string>,
): MatchOddsResult {
  const casados: OddsMatched[] = [];
  const sem_match: SemMatch[] = [];

  for (const l of lines) {
    const key = normalize(l.entidade);
    const overrideId = overrides[key];
    if (overrideId != null) {
      const p = squad.find((s) => s.id === overrideId);
      casados.push({ ...l, player_id: overrideId, player_name: p?.name ?? l.entidade });
      continue;
    }

    const ranked = squad
      .map((p) => ({ id: p.id, name: p.name, confianca: Math.round(scoreName(l.entidade, p.name) * 1000) / 1000 }))
      .sort((a, b) => b.confianca - a.confianca);
    const best = ranked[0];
    const second = ranked[1];
    const unambiguous = best != null && best.confianca >= AUTO_THRESHOLD &&
      (second == null || best.confianca - second.confianca >= MARGIN);

    if (unambiguous) {
      casados.push({ ...l, player_id: best.id, player_name: best.name });
    } else {
      sem_match.push({ nome_casa: l.entidade, candidatos: ranked.slice(0, 3) });
    }
  }
  return { casados, sem_match };
}
