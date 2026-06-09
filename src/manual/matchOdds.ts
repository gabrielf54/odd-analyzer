import { sim, normalize } from "../crosswalk/match.js";
import type { ManualOddsLine } from "./schema.js";

// Casas escrevem o nome abreviado ("K. Havertz"); a base traz o nome completo
// ("Kai Havertz"). Mas sobrenome sozinho não basta: Argentina tem Emiliano E
// Lautaro Martínez — casar só pelo sobrenome empata os dois. Score = média do
// primeiro nome com o sobrenome (50/50). O primeiro nome tolera inicial
// ("K." = "Kai"): assim o abreviado ainda casa, mas o sobrenome compartilhado
// é desempatado pelo primeiro nome.
const AUTO_THRESHOLD = 0.85; // score mínimo do melhor candidato p/ auto-casar
const MARGIN = 0.15;          // distância mínima do 2º melhor (anti-ambiguidade)

function tokens(n: string): string[] {
  return n.split(" ").filter(Boolean);
}
function firstToken(n: string): string {
  const t = tokens(n);
  return t.length ? t[0]! : n;
}
function lastToken(n: string): string {
  const t = tokens(n);
  return t.length ? t[t.length - 1]! : n;
}

/** Similaridade do primeiro nome, tolerante a inicial. Se um dos lados é uma
 * inicial ("k", "k."), compatível = mesma primeira letra. Senão, Dice normal. */
function firstNameSim(a: string, b: string): number {
  const sa = a.replace(/[^a-z0-9]/g, ""), sb = b.replace(/[^a-z0-9]/g, "");
  if (sa.length === 0 || sb.length === 0) return 0;
  if (sa.length <= 1 || sb.length <= 1) return sa[0] === sb[0] ? 1 : 0;
  return sim(sa, sb);
}

/** Score de nome entre fontes: média (50/50) da similaridade do primeiro nome
 * (tolerante a inicial) com a do sobrenome (último token). Casa o abreviado
 * "K. Havertz" e ao mesmo tempo desempata sobrenomes iguais pelo primeiro nome. */
export function scoreName(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  const first = firstNameSim(firstToken(na), firstToken(nb));
  const last = sim(lastToken(na), lastToken(nb));
  return 0.5 * first + 0.5 * last;
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
