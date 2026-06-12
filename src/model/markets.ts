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
  // Modo do multiplicador de concessão. "concession" (default) = lê teamConceded
  // (comportamento atual). "none" = oppMult fixo em 1.0: em PASSE o eixo de concessão
  // teria SINAL INVERTIDO (somaria a posse do rival → infla quando deveria desinflar),
  // então é neutralizado.
  opp_mode?: "concession" | "none";
  // Mercado vem em ESCADA one-sided (vários degraus "N+" por jogador, ex.: passes).
  // O wiring agrupa os degraus por jogador e de-viga a escada inteira (ladderDevig).
  ladder?: boolean;
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
    ? "Jogo de seleção: viram aposta de valor — chutes a gol só em 1+ (over 0.5); finalizações em 1+ e 2+ (over 0.5/1.5); desarmes só em 1+; faltas só em 1+. Linhas mais altas seguem analisadas, sem estrela."
    : "Jogo de clube: finalizações viram aposta de valor em todas as linhas; chutes a gol, desarmes e faltas só na linha de 1+ (over 0.5). Linhas mais altas seguem analisadas, sem estrela.";
}

/** Campo que a casa usa para liquidar a aposta (default = stat_field). */
export function settleField(marketType: string): string | null {
  const m = MARKETS[marketType];
  return m ? (m.settle_field ?? m.stat_field) : null;
}

export const MARKETS: Record<string, MarketSpec> = {
  // SOT validado SÓ em 0.5 nas DUAS populações. AUDITORIA 2026-06-11
  // (scripts/audit-player-markets.mts, leave-one-out, NO PONTO DE APOSTA — banda
  // prob∈[0.35,0.65] onde a casa põe a linha):
  //  • seleção (n=2392): over 0.5 BrierSkill full +0.050 / banda +0.018 (ECE 0.094) ✅;
  //    over 1.5 = -0.012 (banda -0.59); over 2.5 = -0.182 → fora.
  //  • clube (n=2800): over 0.5 full +0.098 / banda +0.009 (ECE 0.044) ✅; over 1.5
  //    full +0.003 MAS banda -0.32 / ECE 0.23 (super-prevê ~25pp) e over 2.5 -0.067.
  //    O "todas as linhas" do clube era LEGADO de Brasileirão (motor antigo) e nunca
  //    re-confirmado — a auditoria mostrou que 1.5/2.5 são estrela-FANTASMA (pooling).
  //    → DEMOVIDO p/ [0.5] nas duas. SOT 2+ é evento raro/mal previsto em qualquer pop.
  // nb_dispersion 3.0→2.0: R=2.0 calibra over 0.5 melhor nas DUAS pops (sel +0.059/
  // ECE 0.060 vs +0.050/0.068; clube +0.101/0.034 vs +0.098/0.039). 1.5/2.5 seguem
  // ANALISADAS (lines), sem estrela; forward pode regraduar.
  sot: spec({
    key: "sot", nivel: "jogador", kind: "contagem", stat_field: "shots_on_target",
    prior_rate: 0.4, prior_strength: 12.0, nb_dispersion: 2.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "chutes_a_gol_concedidos_por_jogo", label: "Chutes a Gol (SOT)",
    concede_baseline: 4.55, concede_baseline_nacional: 4.28,
    validated_lines: { selecao: [0.5], clube: [0.5] },
  }),
  // FINALIZAÇÕES — o mercado mais forte. AUDITORIA 2026-06-11
  // (audit-player-markets.mts, leave-one-out, banda de aposta):
  //  • clube (n=2800): over 0.5/1.5/2.5 full +0.201/+0.188/+0.127; banda 0.5/1.5
  //    +0.028/+0.036 (ECE 0.033/0.021) ✅; 2.5 banda -0.012/ECE 0.07 (marginal mas
  //    NÃO fantasma — clube finaliza muito) → fica TODAS as linhas.
  //  • seleção (n=2392): 0.5/1.5 full +0.137/+0.122, banda +0.012/~0 (ECE 0.080/0.079)
  //    ✅; over 2.5 full +0.111 MAS banda -0.094 / ECE 0.13 (super-prevê ~13pp em TODO
  //    R) → estrela-FANTASMA, DEMOVIDA. Seleção chuta a gol/finaliza menos que clube.
  finalizacoes: spec({
    key: "finalizacoes", nivel: "jogador", kind: "contagem", stat_field: "total_shots",
    prior_rate: 1.2, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "finalizacoes_concedidas_por_jogo", label: "Finalizações Totais",
    concede_baseline: 13.46, concede_baseline_nacional: 12.22,
    // clube: todas; seleção: só 0.5/1.5 (2.5 reprovou no ponto de aposta).
    validated_lines: { selecao: [0.5, 1.5], clube: [] },
  }),
  // DESARME GANHO via DECOMPOSIÇÃO: a casa liquida won_tackle (Opta "Tackles Won").
  // μ_ganhos = μ_tentativas(total_tackle, bem previstas) × aproveitamento(won/total,
  // encolhido p/ a média da liga). settle=won_tackle. AUDITORIA 2026-06-11
  // (audit-player-markets.mts, leave-one-out, banda de aposta):
  //  • só over 0.5 vale, nas DUAS populações. seleção (n=2392): 0.5 full +0.077 /
  //    banda ~0 (ECE 0.038) ✅. clube (n=2800): 0.5 full +0.110 / banda +0.008
  //    (ECE 0.034) ✅ → GRADUADO no clube (era ausente; o aproveitamento de clube
  //    wr≈0.614 calibra igual ao da seleção wr≈0.640).
  //  • OVER 1.5 DEMOVIDO na seleção: full só +0.0085 (≈ruído) e banda -0.081 / ECE
  //    0.13 (super-prevê 2+ ganhos) em TODO R×k → estrela-fantasma. clube 1.5 full
  //    +0.047 mas banda -0.045 → também sem estrela (cataloga, forward pode regraduar).
  //  • OVER 2.5 morto nas duas (§5). nb_dispersion=2.0 (ganho afina a distribuição).
  desarmes: spec({
    key: "desarmes", nivel: "jogador", kind: "contagem", stat_field: "total_tackle",
    prior_rate: 1.3, prior_strength: 12.0, nb_dispersion: 2.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "desarmes_concedidos_por_jogo", label: "Desarmes",
    settle_field: "won_tackle",
    // só over 0.5 nas duas pops (1.5/2.5 reprovam no ponto de aposta).
    validated_lines: { selecao: [0.5], clube: [0.5] },
    mu_decomp: { num_field: "won_tackle", wr_shrink: 40, wr_prior: 0.622, base_label: "desarmes tentados", won_label: "desarmes ganhos" },
    concede_baseline: 14.64, concede_baseline_nacional: 13.97,
  }),
  // FALTAS cometidas (`fouls`). Confronto: o jogador comete falta × o adversário
  // PROVOCA falta (`was_fouled` — concede_field). Settlement = faltas COMETIDAS.
  // Só over 0.5 vale, nas DUAS populações. AUDITORIA 2026-06-11
  // (audit-player-markets.mts, leave-one-out, banda de aposta):
  //  • seleção (n=2392): over 0.5 full +0.033 / banda -0.025 (ECE 0.07) → MANTÉM (a
  //    estrela mais marginal; forward vigia). 1.5=-0.039, 2.5=-0.077 → fora.
  //  • clube (n=2800): over 0.5 full +0.063 / banda ~0 (ECE 0.045) → GRADUADO no clube
  //    (mais limpo que a seleção). 1.5=-0.007, 2.5=-0.096 → fora.
  // nb_dispersion=2.5 (calibrado). O eixo de árbitro (alavanca real) segue bloqueado
  // por dado (CORE §5).
  faltas: spec({
    key: "faltas", nivel: "jogador", kind: "contagem", stat_field: "fouls",
    concede_field: "was_fouled",
    prior_rate: 1.0, prior_strength: 12.0, nb_dispersion: 2.5, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "faltas_provocadas_por_jogo", label: "Faltas (Cometidas)",
    concede_baseline: 10.72, concede_baseline_nacional: 10.72,
    validated_lines: { selecao: [0.5], clube: [0.5] },
  }),
  // PASSES tentados (`total_pass`). Betano liquida "Total de Passes" pela Opta. Confronto
  // FRACO (posse/estado-de-jogo dominado) → oppMult NEUTRALIZADO (opp_mode:"none").
  // CALIBROU MAL na seleção (n=1621, 2026-06-11): no ponto de aposta (linha≈μ do jogador)
  // BrierSkill NEGATIVO em todas as 24 combos (melhor −0.014, PS=8/R=20); positivo só no
  // agregado (artefato de pooling de linhas óbvias). Mesmo desfecho do defesas →
  // DIAGNÓSTICO, SEM validated_lines (nunca ganha estrela). prior_rate=30 (mediana
  // total_pass/90), prior_strength=8, nb_dispersion=20 (melhor config medida — p/ o forward
  // ser honesto). lines:[] (passe não tem linha fixa; a escada vem por jogador da casa).
  passes: spec({
    key: "passes", nivel: "jogador", kind: "contagem", stat_field: "total_pass",
    opp_mode: "none", settle_field: "total_pass", ladder: true,
    prior_rate: 30.0, prior_strength: 8.0, nb_dispersion: 20.0, lines: [],
    eixo_concessao: "passes_(posse_dominado)", label: "Passes (Total)",
  }),
  // MERCADOS DE PARTIDA — NÃO calibram em NENHUMA população (auditoria 2026-06-11,
  // scripts/audit-match-markets.mts, λ=média-gols-últimos-10 → Dixon-Coles):
  //  • gols (totais): seleção n=351 BrierSkill 1.5/2.5/3.5 = -0.033/-0.053/+0.023
  //    (ECE 0.10-0.15); clube n=480 = -0.062/-0.022/-0.059 (ECE 0.08-0.11) → fora.
  //  • vitória (1X2): mando seleção +0.042 mas ECE 0.126 (jogo de seleção é neutro);
  //    clube -0.065 / ECE 0.137 → o λ=média-gols é cru demais p/ 1X2 (faltaria força
  //    de time tipo Elo) → fora.
  //  • escanteios: clube n=476 melhor linha (10.5) BrierSkill +0.002 (ruído) / ECE
  //    0.027 — calibrado mas SEM edge; 8.5/9.5 negativos. seleção: eventStats de
  //    seleção NÃO traz corner_kicks (9/480 amostras) → não-mensurável offline.
  //  → todos SEM validated_lines; catalogados em features/mercados-nao-validados.
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

/** Chaves de todos os mercados / só os de jogador — fonte ÚNICA p/ a validação de
 * borda (manual/schema.ts) e o roteamento do fluxo manual (manual/analyze.ts).
 * Derivam de MARKETS: um mercado novo NÃO precisa ser re-listado na borda (era o
 * bug de `faltas`, 2026-06-11 — a borda Zod rejeitava o que o motor já aceitava). */
export const MARKET_KEYS: string[] = Object.keys(MARKETS);
export const PLAYER_MARKET_KEYS: string[] = Object.values(MARKETS)
  .filter((m) => m.nivel === "jogador")
  .map((m) => m.key);

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
