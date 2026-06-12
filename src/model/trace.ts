export interface TraceStep {
  passo: string;
  titulo: string;
  formula: string;
  entradas: Record<string, number | string>;
  saida: number;
  frase: string;
}

export interface Trace {
  alvo: string;
  linha: number;
  precisa: string;
  passos: TraceStep[];
  veredito_leigo: string;
}

/** Rastro parcial (cadeia do ritmo → mu). `buildCandidate` o finaliza com os
 * passos de valor (probabilidade/de-vig/comparação), que dependem da linha/odds. */
export interface RateTrace {
  statField: string;
  mu: number;
  passos: TraceStep[];
  // Presente só em candidato 1X2 (resultado): finalizeTrace descreve a chance
  // DAQUELE desfecho (vitória/empate), não "N ou mais gols". Carrega os gols
  // esperados pra montar o veredito leigo.
  match1x2?: { outcomeLabel: string; homeName: string; awayName: string; lambdaHome: number; lambdaAway: number };
}

const STAT_LABEL: Record<string, string> = {
  shots_on_target: "chutes a gol",
  total_shots: "finalizações",
  total_tackle: "desarmes",
  corners: "escanteios",
  goals: "gols",
};

export function statLabelFor(statField: string): string {
  return STAT_LABEL[statField] ?? statField;
}

const r2 = (x: number): number => Math.round(x * 100) / 100;
const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const numField = (g: Record<string, unknown>, f: string): number => {
  const v = g[f];
  return typeof v === "number" ? v : Number(v) || 0;
};

export interface RateTraceArgs {
  statField: string;
  games: Array<Record<string, unknown>>; // ordem crescente (recente no fim)
  rawRate: number;
  shrunk: number;
  priorRate: number;
  priorStrength: number;
  n: number;
  minutos: number;
  oppMult: number;
  haMult: number;
  oppConceded: number | null;
  isHome: boolean;
  mu: number;
  // Decomposição (ex.: desarme ganho = tentativas × aproveitamento). Quando
  // presente, `mu` é o esperado FINAL (ganhos); os passos do ritmo descrevem a
  // base (tentativas) e um passo extra mostra a conversão.
  decomp?: { winRate: number; attemptsMu: number; baseLabel: string; wonLabel: string };
}

export function buildRateTrace(a: RateTraceArgs): RateTrace {
  const label = a.decomp ? a.decomp.baseLabel : statLabelFor(a.statField);
  const window = a.games.slice(-5);
  const statTotal = window.reduce((s, g) => s + numField(g, a.statField), 0);
  const minTotal = window.reduce((s, g) => s + numField(g, "minutes_played"), 0);
  const passos: TraceStep[] = [];

  passos.push({
    passo: "taxa_base",
    titulo: `Ritmo recente de ${label}`,
    formula: "soma(stat) ÷ soma(minutos) × 90",
    entradas: { stat_total: statTotal, minutos_total: minTotal, jogos: window.length },
    saida: r2(a.rawRate),
    frase: `Nos últimos ${window.length} jogos fez ${statTotal} ${label} em ${minTotal} min — ritmo de ${r2(a.rawRate)} por 90 min.`,
  });

  passos.push({
    passo: "encolhimento",
    titulo: "Ajuste pela pouca amostra",
    formula: "média ponderada entre ritmo recente e a média típica do mercado",
    entradas: { ritmo_recente: r2(a.rawRate), media_tipica: a.priorRate, peso_jogos: a.n, peso_media: a.priorStrength },
    saida: r2(a.shrunk),
    frase: `Como são só ${a.n} jogos, puxamos pra média típica (${a.priorRate}): vira ${r2(a.shrunk)} por 90 min.`,
  });

  const porMinutos = (a.shrunk * a.minutos) / 90;
  passos.push({
    passo: "minutos",
    titulo: "Ajuste pelos minutos esperados",
    formula: "ritmo × minutos ÷ 90",
    entradas: { ritmo: r2(a.shrunk), minutos_esperados: r2(a.minutos) },
    saida: r2(porMinutos),
    frase: `Deve jogar ~${Math.round(a.minutos)} min, o que dá ${r2(porMinutos)} ${label}.`,
  });

  if (a.oppConceded != null) {
    passos.push({
      passo: "fator_adversario",
      titulo: "Defesa do adversário",
      formula: "concedido pelo adversário ÷ média da liga (limitado 0.7–1.4)",
      entradas: { concedido_adversario: a.oppConceded, multiplicador: r2(a.oppMult) },
      saida: r2(a.oppMult),
      frase: a.oppMult >= 1
        ? `Adversário cede bastante (${a.oppConceded}), empurra o número pra cima (×${r2(a.oppMult)}).`
        : `Adversário defende bem (${a.oppConceded}), segura o número (×${r2(a.oppMult)}).`,
    });
  }

  passos.push({
    passo: "fator_casa",
    titulo: a.isHome ? "Jogando em casa" : "Jogando fora",
    formula: "fator de mando",
    entradas: { mando: a.isHome ? "casa" : "fora", multiplicador: r2(a.haMult) },
    saida: r2(a.haMult),
    frase: a.isHome
      ? `Em casa, leve ajuste pra cima (×${r2(a.haMult)}).`
      : `Fora de casa, leve ajuste pra baixo (×${r2(a.haMult)}).`,
  });

  if (a.decomp) {
    // a.mu já é o esperado de GANHOS; attemptsMu é o esperado de tentativas.
    passos.push({
      passo: "esperado_tentativas",
      titulo: `Total esperado de ${a.decomp.baseLabel}`,
      formula: "ritmo ajustado × fatores",
      entradas: { esperado: r2(a.decomp.attemptsMu) },
      saida: r2(a.decomp.attemptsMu),
      frase: `No total, esperamos ${r2(a.decomp.attemptsMu)} ${a.decomp.baseLabel} nesta partida.`,
    });
    passos.push({
      passo: "aproveitamento",
      titulo: `Conversão em ${a.decomp.wonLabel}`,
      formula: "tentativas esperadas × taxa de aproveitamento (ganhos ÷ tentativas)",
      entradas: { tentativas: r2(a.decomp.attemptsMu), aproveitamento: pct(a.decomp.winRate), ganhos: r2(a.mu) },
      saida: r2(a.mu),
      frase: `Costuma ganhar ${pct(a.decomp.winRate)} do que tenta → ~${r2(a.mu)} ${a.decomp.wonLabel} (o que a casa paga).`,
    });
  } else {
    passos.push({
      passo: "esperado_final",
      titulo: `Total esperado de ${label}`,
      formula: "ritmo ajustado × fatores",
      entradas: { esperado: r2(a.mu) },
      saida: r2(a.mu),
      frase: `No total, esperamos ${r2(a.mu)} ${label} nesta partida.`,
    });
  }

  return { statField: a.statField, mu: a.mu, passos };
}

export interface Match1x2TraceArgs {
  homeName: string;
  awayName: string;
  lambdaHome: number;
  lambdaAway: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  outcome: "home" | "draw" | "away";
  fonte: string; // "ratings_forca" | "media_movel" — como o λ foi montado
}

/** Trace de RESULTADO (1X2): explica os gols esperados de cada time → as chances
 * de mandante/empate/visitante. `finalizeTrace` fecha com de-vig/comparação SEM a
 * moldura de "N ou mais" (que só faz sentido em mercado de contagem). */
export function buildMatch1x2Trace(a: Match1x2TraceArgs): RateTrace {
  const outcomeLabel =
    a.outcome === "draw" ? "empate"
      : a.outcome === "home" ? `${a.homeName} vencer`
        : `${a.awayName} vencer`;
  const pChosen = a.outcome === "home" ? a.pHome : a.outcome === "away" ? a.pAway : a.pDraw;
  const fonteFrase = a.fonte === "ratings_forca"
    ? "pela força recente dos dois times (ataque × fragilidade defensiva do rival)"
    : "pela média de gols recente dos dois times";
  const passos: TraceStep[] = [
    {
      passo: "gols_esperados",
      titulo: "Gols esperados de cada time",
      formula: "força de ataque × fragilidade defensiva do rival, com mando",
      entradas: { mandante: r2(a.lambdaHome), visitante: r2(a.lambdaAway), fonte: a.fonte },
      saida: r2(a.lambdaHome),
      frase: `Estimando ${fonteFrase}: ${a.homeName} faz ~${r2(a.lambdaHome)} gols, ${a.awayName} ~${r2(a.lambdaAway)}.`,
    },
    {
      passo: "probabilidades_1x2",
      titulo: "Chance de cada resultado",
      formula: "Poisson sobre os gols esperados → P(mandante) / P(empate) / P(visitante)",
      entradas: { mandante: pct(a.pHome), empate: pct(a.pDraw), visitante: pct(a.pAway) },
      saida: pChosen,
      frase: `Disso sai: ${a.homeName} ${pct(a.pHome)} · empate ${pct(a.pDraw)} · ${a.awayName} ${pct(a.pAway)}.`,
    },
  ];
  return {
    statField: "goals",
    mu: a.lambdaHome + a.lambdaAway,
    passos,
    match1x2: { outcomeLabel, homeName: a.homeName, awayName: a.awayName, lambdaHome: a.lambdaHome, lambdaAway: a.lambdaAway },
  };
}

export interface FinalizeArgs {
  alvo: string;
  linha: number;
  probModelo: number;
  probDevig: number;
  edge: number;
  ev: number;
}

/** Fecha o trace de 1X2: chance do desfecho → de-vig → comparação, sem "N ou mais". */
function finalize1x2(rt: RateTrace, mx: NonNullable<RateTrace["match1x2"]>, v: FinalizeArgs): Trace {
  const passos = [...rt.passos];
  passos.push({
    passo: "probabilidade",
    titulo: `Chance de ${mx.outcomeLabel}`,
    formula: "probabilidade do desfecho escolhido (do passo anterior)",
    entradas: { desfecho: mx.outcomeLabel, chance: pct(v.probModelo) },
    saida: v.probModelo,
    frase: `Nosso número pra ${mx.outcomeLabel}: ${pct(v.probModelo)}.`,
  });
  passos.push({
    passo: "casa_devig",
    titulo: "Chance que a casa embute",
    formula: "odd justa, tirando a margem da casa",
    entradas: { prob_casa: v.probDevig },
    saida: v.probDevig,
    frase: `A casa, tirando o lucro dela, dá ${pct(v.probDevig)} pra isso acontecer.`,
  });
  passos.push({
    passo: "comparacao",
    titulo: "Nosso número vs a casa",
    formula: "edge = nossa chance − chance da casa",
    entradas: { nossa_chance: v.probModelo, chance_casa: v.probDevig, edge: r2(v.edge), ev: r2(v.ev) },
    saida: r2(v.edge),
    frase: v.edge > 0
      ? `Achamos ${pct(v.probModelo)} contra ${pct(v.probDevig)} da casa — vantagem a favor.`
      : `Achamos só ${pct(v.probModelo)} contra ${pct(v.probDevig)} da casa — sem vantagem.`,
  });
  const golsFrase = `${mx.homeName} ${r2(mx.lambdaHome)} × ${r2(mx.lambdaAway)} ${mx.awayName}`;
  const veredito_leigo = v.edge > 0
    ? `Pelos gols esperados (${golsFrase}), a chance de ${mx.outcomeLabel} é ${pct(v.probModelo)}, acima dos ${pct(v.probDevig)} da casa. Tem valor.`
    : `Pelos gols esperados (${golsFrase}), a chance de ${mx.outcomeLabel} é ${pct(v.probModelo)}, abaixo dos ${pct(v.probDevig)} da casa. Sem valor — a odd não paga o risco.`;
  return { alvo: v.alvo, linha: v.linha, precisa: mx.outcomeLabel, passos, veredito_leigo };
}

export function finalizeTrace(rt: RateTrace, v: FinalizeArgs): Trace {
  if (rt.match1x2) return finalize1x2(rt, rt.match1x2, v);
  const label = statLabelFor(rt.statField);
  const k = Math.floor(v.linha) + 1;
  const precisa = `${k} ou mais`;
  const passos = [...rt.passos];

  passos.push({
    passo: "probabilidade",
    titulo: `Chance de ${precisa} ${label}`,
    formula: `P(X ≥ ${k})`,
    entradas: { esperado: r2(rt.mu), precisa: k },
    saida: v.probModelo,
    frase: `Com esse esperado, a chance de ${precisa} ${label} é ${pct(v.probModelo)}.`,
  });

  passos.push({
    passo: "casa_devig",
    titulo: "Chance que a casa embute",
    formula: "odd justa, tirando a margem da casa",
    entradas: { prob_casa: v.probDevig },
    saida: v.probDevig,
    frase: `A casa, tirando o lucro dela, dá ${pct(v.probDevig)} pra isso acontecer.`,
  });

  passos.push({
    passo: "comparacao",
    titulo: "Nosso número vs a casa",
    formula: "edge = nossa chance − chance da casa",
    entradas: { nossa_chance: v.probModelo, chance_casa: v.probDevig, edge: r2(v.edge), ev: r2(v.ev) },
    saida: r2(v.edge),
    frase: v.edge > 0
      ? `Achamos ${pct(v.probModelo)} contra ${pct(v.probDevig)} da casa — vantagem a favor.`
      : `Achamos só ${pct(v.probModelo)} contra ${pct(v.probDevig)} da casa — sem vantagem.`,
  });

  const veredito_leigo = v.edge > 0
    ? `Esperamos ${r2(rt.mu)} ${label} nesta partida; a chance de ${precisa} é ${pct(v.probModelo)}, acima dos ${pct(v.probDevig)} da casa. Tem valor.`
    : `Esperamos ${r2(rt.mu)} ${label} nesta partida; a chance de ${precisa} é ${pct(v.probModelo)}, abaixo dos ${pct(v.probDevig)} da casa. Sem valor — a odd não paga o risco.`;

  return { alvo: v.alvo, linha: v.linha, precisa, passos, veredito_leigo };
}
