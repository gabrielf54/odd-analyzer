export type Populacao = "selecao" | "clube";

export interface MarketSpec {
  key: string;
  nivel: "jogador" | "partida";
  kind: "contagem" | "partida_totais" | "partida_1x2";
  stat_field: string;
  prior_rate: number;
  prior_strength: number;
  nb_dispersion: number;
  lines: number[];
  eixo_concessao: string;
  label: string;
  concede_baseline: number;
  concede_baseline_nacional: number;
  // Campo que a CASA usa pra LIQUIDAR (settle). Default = stat_field. Difere
  // quando modelamos uma coisa e a casa paga outra (desarmes: a base é
  // total_tackle, mas a casa liquida won_tackle — Opta "Tackles Won").
  settle_field?: string;
  // DECOMPOSIÇÃO do μ: prever um evento via base × taxa de conversão, quando o
  // alvo direto é mal previsto mas a base não. Desarme ganho: μ_ganhos =
  // μ_tentativas(stat_field) × aproveitamento(won/total, encolhido p/ wr_prior).
  // Recupera o sinal das tentativas (bem previstas) — backtest n=1746 (validação).
  mu_decomp?: { num_field: string; wr_shrink: number; wr_prior: number; base_label: string; won_label: string };
  // Eixo de CONCESSÃO lê um campo DIFERENTE do stat_field. Ex.: faltas — o jogador
  // produz `fouls`, mas o confronto é com `was_fouled` do adversário (faltas que ele
  // PROVOCA). Default = stat_field (comportamento atual). Só afeta o byPlayer path.
  concede_field?: string;
  // GATE de aposta de valor (estrela), CIENTE DE POPULAÇÃO. Roteado por
  // populacaoFor(leagueId): um mercado/linha pode valer na seleção e não no clube
  // (ou vice-versa). chave AUSENTE → não validado nessa população; [] → TODAS as
  // linhas; [a,b] → só essas. (Anti-lock-in: apertar a seleção não trava o clube.)
  // Política (CLAUDE.md): cada (mercado,população,linha) vira true conforme a
  // calibração/prova-forward o demonstrar — graduação gradual.
  validated_lines?: Partial<Record<Populacao, number[]>>;
}

function spec(p: Omit<MarketSpec, "concede_baseline" | "concede_baseline_nacional"> &
  { concede_baseline?: number; concede_baseline_nacional?: number }): MarketSpec {
  return { concede_baseline: 0.0, concede_baseline_nacional: 0.0, ...p };
}

/** Mercado/linha validado p/ a POPULAÇÃO do jogo (derivada da liga) → pode ganhar
 * estrela. Default de liga desconhecida = clube (ver populacaoFor). */
export function isValidated(marketType: string, linha?: number, leagueId?: unknown): boolean {
  const m = MARKETS[marketType];
  if (!m) return false;
  const lines = m.validated_lines?.[populacaoFor(leagueId)];
  if (lines === undefined) return false; // não validado nessa população
  if (lines.length === 0) return true; // todas as linhas
  return linha != null && lines.includes(linha);
}

/** Texto leigo (fora do money-path) explicando o gate de estrela da população.
 * O front mostra como selo + razão de uma linha não ter estrela. */
export function populacaoMotivo(pop: Populacao): string {
  return pop === "selecao"
    ? "Jogo de seleção: chutes a gol só viram aposta de valor na linha de 1+ (over 0.5) — linhas altas seguem analisadas, sem estrela. Finalizações (todas as linhas) e desarmes (1+/2+) valem."
    : "Jogo de clube: chutes a gol e finalizações viram aposta de valor em todas as linhas; desarme aguarda calibração de clube (ainda sem estrela).";
}

/** Campo que a casa usa para liquidar a aposta (default = stat_field). */
export function settleField(marketType: string): string | null {
  const m = MARKETS[marketType];
  return m ? (m.settle_field ?? m.stat_field) : null;
}

export const MARKETS: Record<string, MarketSpec> = {
  // SOT validado SÓ em 0.5 na população de SELEÇÃO. Calibração offline em 2071
  // jogos de seleção (ligas 31,58-67: AFCON/amistoso/quali — a Copa passada é
  // vazia, ver scripts/recalibrate-sot-fin-selecao.mts, leave-one-out): BrierSkill
  // over 0.5 = +0.048, MAS over 1.5 = -0.047 e over 2.5 = -0.272 (NEGATIVO = pior
  // que chutar a média). Seleção chuta a gol pouco (base só 6.4% fazem 2+, 1.6%
  // fazem 3+) → o modelo não bate a média nas linhas altas. As linhas 1.5/2.5
  // seguem ANALISADAS (lines abaixo), mas SEM estrela (fora de validated_lines);
  // forward na Copa pode regraduar. (A validação antiga "todas as linhas" foi em
  // clube — atacante de clube finaliza muito; seleção é jogo travado/desigual.)
  sot: spec({
    key: "sot", nivel: "jogador", kind: "contagem", stat_field: "shots_on_target",
    prior_rate: 0.4, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "chutes_a_gol_concedidos_por_jogo", label: "Chutes a Gol (SOT)",
    concede_baseline: 4.55, concede_baseline_nacional: 4.28,
    // seleção: só 0.5 (1.5/2.5 reprovam, calib 2026-06-11). clube: todas (legado
    // Brasileirão; re-confirmar na Fatia 1). Anti-lock-in.
    validated_lines: { selecao: [0.5], clube: [] },
  }),
  // Finalizações TRANSFERIU limpo do clube p/ seleção: mesma calibração (n=2071,
  // scripts/recalibrate-sot-fin-selecao.mts) deu BrierSkill positivo nas 3 linhas
  // (+0.119/+0.088/+0.084 em 0.5/1.5/2.5) → validado em todas as linhas.
  finalizacoes: spec({
    key: "finalizacoes", nivel: "jogador", kind: "contagem", stat_field: "total_shots",
    prior_rate: 1.2, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "finalizacoes_concedidas_por_jogo", label: "Finalizações Totais",
    concede_baseline: 13.46, concede_baseline_nacional: 12.22,
    // transfere limpo do clube p/ seleção → todas as linhas nas duas populações.
    validated_lines: { selecao: [], clube: [] },
  }),
  // DESARME GANHO via DECOMPOSIÇÃO (2026-06-11): a casa liquida won_tackle (Opta
  // "Tackles Won"). Prever "ganho" direto reprovou (motor só prevê tentativas);
  // mas μ_ganhos = μ_tentativas(total_tackle) × aproveitamento(won/total, encolhido)
  // PASSA — backtest n=1746/2710, 10 ligas (scripts/recalibrate-desarmes-decomp.mts,
  // backtest-desarme-25-fino.mts): BrierSkill +0.085 (over 0.5) e +0.028 (over 1.5)
  // com nb_dispersion=2.0. nb_dispersion 2.0 (não 3.0): ganho é distribuição diferente
  // de tentativa (afinamento) — varredura n=2710 mostrou R≈2.0 melhor no 1.5 (skill
  // dobra) sem piorar o 0.5; efeito monotônico (não overfit). **OVER 2.5 robustamente
  // MORTO** (todas as 18 combinações R×k deram BrierSkill<0; evento raro, sem sinal —
  // NÃO re-tentar) → fora de validated_lines, observação forward. base=total_tackle
  // (μ tentativas, prior 1.3); mu_decomp aplica o aproveitamento; settle=won_tackle.
  desarmes: spec({
    key: "desarmes", nivel: "jogador", kind: "contagem", stat_field: "total_tackle",
    prior_rate: 1.3, prior_strength: 12.0, nb_dispersion: 2.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "desarmes_concedidos_por_jogo", label: "Desarmes",
    settle_field: "won_tackle",
    // seleção: 0.5/1.5 (decomposição won_tackle, wr_prior medido na seleção).
    // clube: AUSENTE = não validado até a Fatia 1 medir o aproveitamento de clube.
    validated_lines: { selecao: [0.5, 1.5] },
    mu_decomp: { num_field: "won_tackle", wr_shrink: 40, wr_prior: 0.622, base_label: "desarmes tentados", won_label: "desarmes ganhos" },
    concede_baseline: 14.64, concede_baseline_nacional: 13.97,
  }),
  // FALTAS cometidas (`fouls`). Confronto: o jogador comete falta × o adversário
  // PROVOCA falta (`was_fouled` — concede_field). Settlement = faltas COMETIDAS.
  // prior_rate/nb_dispersion/baseline MEDIDOS em 140 jogos de seleção (2026-06-11,
  // scripts/measure-faltas-defesas-baseline.mts): prior 1.0/90, was_fouled
  // 10.72/time/jogo.
  // Calibração leave-one-out (n=1816 jogos de seleção, 2026-06-11,
  // scripts/recalibrate-faltas-defesas.mts): over 0.5 BrierSkill=+0.034 (R=2.5
  // melhor ECE) → VALIDADO; over 1.5=-0.031 e 2.5=-0.060 (negativos) → analisadas,
  // SEM estrela (forward pode regraduar). nb_dispersion=2.5 (calibrado).
  // clube AUSENTE (re-mede pós-Copa).
  faltas: spec({
    key: "faltas", nivel: "jogador", kind: "contagem", stat_field: "fouls",
    concede_field: "was_fouled",
    prior_rate: 1.0, prior_strength: 12.0, nb_dispersion: 2.5, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "faltas_provocadas_por_jogo", label: "Faltas (Cometidas)",
    concede_baseline: 10.72, concede_baseline_nacional: 10.72,
    validated_lines: { selecao: [0.5] },
  }),
  escanteios: spec({
    key: "escanteios", nivel: "partida", kind: "contagem", stat_field: "corners",
    prior_rate: 5.0, prior_strength: 10.0, nb_dispersion: 3.0, lines: [8.5, 9.5, 10.5],
    eixo_concessao: "escanteios_concedidos_por_jogo", label: "Escanteios (Total)",
    concede_baseline: 4.79,
  }),
  gols: spec({
    key: "gols", nivel: "partida", kind: "partida_totais", stat_field: "goals",
    prior_rate: 1.3, prior_strength: 10.0, nb_dispersion: 3.0, lines: [1.5, 2.5, 3.5],
    eixo_concessao: "gols_concedidos_por_jogo", label: "Gols (Total)",
    concede_baseline: 1.3,
  }),
  vitoria: spec({
    key: "vitoria", nivel: "partida", kind: "partida_1x2", stat_field: "goals",
    prior_rate: 1.3, prior_strength: 10.0, nb_dispersion: 3.0, lines: [1.5, 2.5, 3.5],
    eixo_concessao: "gols_concedidos_por_jogo", label: "Resultado (1X2)",
    concede_baseline: 1.3,
  }),
};

// Ligas de seleção (Copa e correlatas) → baseline nacional. WC2026 = 27.
const NATIONAL_LEAGUE_IDS = new Set([58, 59, 60, 61, 62, 64, 65, 66, 67, 31, 27]);

/** População do jogo pela liga: NATIONAL_LEAGUE_IDS → "selecao"; o resto (e liga
 * desconhecida/inválida) → "clube". Fonte ÚNICA de verdade de população — usada por
 * baselineFor (concessão) e isValidated (gate de estrela). Ligas de clube novas caem
 * em "clube" sem cadastro → serve o pós-Copa sem lock-in. */
export function populacaoFor(leagueId: unknown): Populacao {
  const lid = typeof leagueId === "number" ? leagueId : parseInt(String(leagueId), 10);
  if (Number.isNaN(lid)) return "clube";
  return NATIONAL_LEAGUE_IDS.has(lid) ? "selecao" : "clube";
}

/** Escolhe o concede_baseline certo pela liga: seleção → nacional; senão → clube. */
export function baselineFor(market: MarketSpec, leagueId: unknown): number {
  return populacaoFor(leagueId) === "selecao"
    ? (market.concede_baseline_nacional || market.concede_baseline)
    : market.concede_baseline;
}
