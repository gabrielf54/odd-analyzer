// Crosswalk de JOGO entre fontes (BSD → casa). FAIL-CLOSED: sem match acima do
// threshold, retorna null (nunca chuta jogo). Reusa o coeficiente de Dice do crosswalk
// de jogador. Função PURA. Ver docs/features/coleta-odds-automatica/casas/kto.md.
//
// ⚠️ Alinhamento de IDIOMA é responsabilidade de quem BUSCA o listView: nomes de time
// podem vir em PT na casa (lang=pt_BR → "Alemanha") e em EN na BSD ("Germany"), o que
// derruba a similaridade. O CLI busca o listView com lang inglês p/ casar; se mesmo
// assim não bater, o fail-closed devolve null e o operador passa o id da casa à mão.

import { sim } from "../crosswalk/match.js";
import { canonicalTeam } from "./teamNames.js";

export interface HouseEvent { id: string; home: string; away: string; }

/** Casa (home,away) da BSD ao evento da casa pelo nome dos times. Testa a ordem normal
 * E a invertida (home/away podem estar trocados entre fontes); usa o melhor dos dois.
 * Score = média da similaridade dos dois lados. < threshold → null (fail-closed).
 * `norm` default = canonicalTeam (resolve PT/EN/FR de seleção, ex.: Alemanha≡Germany). */
export function matchEventByName(
  events: HouseEvent[], home: string, away: string, threshold = 0.8,
  norm: (s: string) => string = canonicalTeam,
): { id: string; confianca: number } | null {
  const h = norm(home), a = norm(away);
  let best: { id: string; score: number } | null = null;
  for (const e of events) {
    const eh = norm(e.home), ea = norm(e.away);
    const direct = (sim(h, eh) + sim(a, ea)) / 2;
    const swap = (sim(h, ea) + sim(a, eh)) / 2;
    const score = Math.max(direct, swap);
    if (!best || score > best.score) best = { id: e.id, score };
  }
  if (!best || best.score < threshold) return null;
  return { id: best.id, confianca: Math.round(best.score * 1000) / 1000 };
}
