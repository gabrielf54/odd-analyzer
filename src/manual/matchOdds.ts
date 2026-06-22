import { normalize, scoreName } from "../crosswalk/match.js";
import type { ManualOddsLine } from "./schema.js";

// scoreName (casa abreviado "K. Havertz" ao "Kai Havertz") agora mora em crosswalk/match
// (lar canônico, compartilhado com o crosswalk de stats-id). Re-exporto p/ compat.
export { scoreName };

const AUTO_THRESHOLD = 0.75; // score mínimo do melhor candidato p/ auto-casar
const REVIEW_BELOW = 0.85;    // auto-match com score < isto é SINALIZADO p/ revisão (auto_ligados);
                              // >= isto casa silencioso (alta confiança, comportamento histórico)
const MARGIN = 0.15;          // distância mínima do 2º melhor (anti-ambiguidade)

export interface OddsMatched extends ManualOddsLine { player_id: string; player_name: string; }
export interface SemMatch { nome_casa: string; candidatos: { id: string; name: string; confianca: number }[]; }
/** Auto-casado mas com confiança intermediária [0.75,0.85): casou sozinho, mas o
 * front mostra "liguei sozinho — confira" com os parecidos p/ o operador corrigir. */
export interface AutoLigado {
  nome_casa: string; player_id: string; player_name: string; confianca: number;
  candidatos: { id: string; name: string; confianca: number }[];
}
export interface MatchOddsResult { casados: OddsMatched[]; sem_match: SemMatch[]; auto_ligados: AutoLigado[]; }

/** Casa cada linha de jogador (nome da casa) a um jogador do squad.
 * overrides: { nome_normalizado_casa -> player_id } vindos do crosswalk salvo.
 * Auto-casa só quando o melhor candidato passa o threshold (0.75) E está claramente
 * à frente do 2º (margem) — a margem segue barrando ambiguidade. Match na faixa
 * [0.75,0.85) casa, mas vai TAMBÉM em `auto_ligados` (revisar no front). Match >=0.85
 * casa silencioso. Sem match confiável → sem_match com top-3 candidatos.
 * Fail-closed: na ambiguidade nunca casa errado, devolve pro operador decidir. */
export function matchPlayerOdds(
  lines: ManualOddsLine[],
  squad: { id: string; name: string }[],
  overrides: Record<string, string>,
): MatchOddsResult {
  const casados: OddsMatched[] = [];
  const sem_match: SemMatch[] = [];
  const auto_ligados: AutoLigado[] = [];

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
      // Confiança intermediária: casou, mas sinaliza p/ o operador conferir.
      if (best.confianca < REVIEW_BELOW) {
        auto_ligados.push({
          nome_casa: l.entidade, player_id: best.id, player_name: best.name,
          confianca: best.confianca, candidatos: ranked.slice(0, 3),
        });
      }
    } else {
      sem_match.push({ nome_casa: l.entidade, candidatos: ranked.slice(0, 3) });
    }
  }
  return { casados, sem_match, auto_ligados };
}
