import { describe, it, expect } from "vitest";
import { buildCandidate } from "../src/candidates/builder.js";
import { impliedProb } from "../src/value/devig.js";

describe("buildCandidate", () => {
  it("calcula prob_devig/edge/ev e monta o dossiê (a IA nunca calcula)", () => {
    const c = buildCandidate({
      jogador: "Kaiki", linha: 1.5, odd_over: 1.9, odd_under: 2.0,
      prob_modelo: 0.6, mu: 1.8, minutos_esperados: 88, xi_confirmado: true,
      amostra_jogos: 12, concedido_adversario: 5.0, incerteza: "baixa",
      market_type: "desarmes", player_id: "42",
    });
    expect(c["jogador"]).toBe("Kaiki");
    expect(c["market_type"]).toBe("desarmes");
    expect(c["prob_devig"]).toBeGreaterThan(0);
    expect(c["edge"]).toBeCloseTo(0.6 - (c["prob_devig"] as number), 12);
    expect(c["ev"]).toBeCloseTo(0.6 * 1.9 - 1.0, 12);
    expect(c["sem_devig"]).toBe(false);
  });

  it("só over (sem odd_under): prob_devig = implícita crua e marca sem_devig", () => {
    const c = buildCandidate({
      jogador: "K. Havertz", linha: 0.5, odd_over: 2.0, odd_under: null,
      prob_modelo: 0.6, mu: 1.0, minutos_esperados: 90, xi_confirmado: true,
      amostra_jogos: 12, concedido_adversario: "n/d", incerteza: "baixa", market_type: "sot",
    });
    expect(c["sem_devig"]).toBe(true);
    expect(c["prob_devig"]).toBeCloseTo(impliedProb(2.0), 9); // 0.5 cru, sem normalizar margem
    expect(c["odd"]).toBe(2.0);
    expect(c["edge"]).toBeCloseTo(0.6 - 0.5, 9);
    expect(c["ev"]).toBeCloseTo(0.6 * 2.0 - 1.0, 9);
  });

  it("com os dois lados simétricos: de-vig dá 0.5 e sem_devig=false", () => {
    const c = buildCandidate({
      jogador: "partida", linha: 9.5, odd_over: 1.9, odd_under: 1.9,
      prob_modelo: 0.55, mu: 10, minutos_esperados: 90, xi_confirmado: true,
      amostra_jogos: 10, concedido_adversario: "n/d", incerteza: "media", market_type: "escanteios",
    });
    expect(c["sem_devig"]).toBe(false);
    expect(c["prob_devig"]).toBeCloseTo(0.5, 9);
  });

  it("carrega posicao/titularidade/concedido_posicao e deriva alerta_minutos (<60)", () => {
    const c = buildCandidate({
      jogador: "X", linha: 0.5, odd_over: 2.0, odd_under: null, prob_modelo: 0.5, mu: 1.0,
      minutos_esperados: 31, xi_confirmado: true, amostra_jogos: 20,
      concedido_adversario: "n/d", incerteza: "baixa", market_type: "sot",
      posicao: "M", titularidade: "provavel", concedido_posicao: "2.1/jogo a meio-campistas (1.10× o típico)",
    });
    expect(c["posicao"]).toBe("M");
    expect(c["titularidade"]).toBe("provavel");
    expect(c["alerta_minutos"]).toBe(true);
    expect(c["concedido_posicao"]).toMatch(/meio-campistas/);
  });

  it("alerta_minutos=false com 60+ e defaults null quando ausentes", () => {
    const c = buildCandidate({
      jogador: "X", linha: 0.5, odd_over: 2.0, odd_under: null, prob_modelo: 0.5, mu: 1.0,
      minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 20,
      concedido_adversario: "n/d", incerteza: "baixa", market_type: "gols",
    });
    expect(c["alerta_minutos"]).toBe(false);
    expect(c["posicao"]).toBeNull();
    expect(c["titularidade"]).toBeNull();
    expect(c["concedido_posicao"]).toBeNull();
  });

  it("alerta_minutos: borda exata em 60 (false) e 59 (true)", () => {
    const base = {
      jogador: "X", linha: 0.5, odd_over: 2.0, odd_under: null, prob_modelo: 0.5, mu: 1.0,
      xi_confirmado: true, amostra_jogos: 20, concedido_adversario: "n/d",
      incerteza: "baixa", market_type: "sot",
    };
    expect(buildCandidate({ ...base, minutos_esperados: 60 }).alerta_minutos).toBe(false);
    expect(buildCandidate({ ...base, minutos_esperados: 59 }).alerta_minutos).toBe(true);
  });

  it("I1 defesa: odd_under inválido (0/≤1) cai no conservador, não estoura impliedProb", () => {
    const base = {
      jogador: "partida (1)", linha: 2.5, odd_over: 1.8, prob_modelo: 0.5, mu: 2.0,
      minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 10,
      concedido_adversario: "n/d", incerteza: "media", market_type: "vitoria",
    };
    // 0 era o valor que o ramo de partida passava sem under (bug do 1x2 só-over).
    const c0 = buildCandidate({ ...base, odd_under: 0 });
    expect(c0["sem_devig"]).toBe(true);
    expect(c0["prob_devig"]).toBeCloseTo(impliedProb(1.8), 9);
    // 1.0 também é inválido (impliedProb lança em ≤ 1) → conservador.
    expect(() => buildCandidate({ ...base, odd_under: 1.0 })).not.toThrow();
    expect(buildCandidate({ ...base, odd_under: 1.0 })["sem_devig"]).toBe(true);
  });

  it("I5: deriva forma_tendencia do stats_detalhadas (em alta / null sem dado)", () => {
    const base = {
      jogador: "X", linha: 2.5, odd_over: 2.0, odd_under: 1.8, prob_modelo: 0.5,
      mu: 2.5, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 10,
      concedido_adversario: "1.0", incerteza: "media", market_type: "desarmes",
    };
    const sdAlta = { media_5: 3.5, media_10: 2.5, ultimos_valores: [4, 3, 4, 3, 3], minutos_medios: 88, media_casa: null, media_fora: null, jogos_casa: 0, jogos_fora: 0 };
    expect(buildCandidate({ ...base, stats_detalhadas: sdAlta })["forma_tendencia"]).toBe("em alta");
    // sem stats_detalhadas → campo presente e null (a IA não menciona)
    expect(buildCandidate(base)["forma_tendencia"]).toBeNull();
  });

  it("I5: carrega posse_adversario quando presente; null quando ausente", () => {
    const base = {
      jogador: "X", linha: 2.5, odd_over: 2.0, odd_under: 1.8, prob_modelo: 0.5,
      mu: 2.5, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 10,
      concedido_adversario: "1.0", incerteza: "media", market_type: "desarmes",
    };
    expect(buildCandidate({ ...base, posse_adversario: 58 })["posse_adversario"]).toBe(58);
    expect(buildCandidate(base)["posse_adversario"]).toBeNull();
  });

  it("repassa stats_detalhadas quando presente; null quando ausente", () => {
    const base = {
      jogador: "X", linha: 2.5, odd_over: 2.0, odd_under: 1.8, prob_modelo: 0.5,
      mu: 2.5, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 10,
      concedido_adversario: "1.0", incerteza: "media", market_type: "desarmes",
    };
    const sd = { media_5: 3.0, media_10: 2.5, ultimos_valores: [4, 3, 2, 3, 3], minutos_medios: 88, media_casa: 3.5, media_fora: 2.4, jogos_casa: 5, jogos_fora: 5 };
    expect(buildCandidate({ ...base, stats_detalhadas: sd }).stats_detalhadas).toEqual(sd);
    expect(buildCandidate(base).stats_detalhadas).toBeNull();
  });

  it("carrega book e casas_comparadas (line shopping) quando presentes; null/ausente senão", () => {
    const base = {
      jogador: "Paqueta", linha: 1.5, odd_over: 6.5, odd_under: null, prob_modelo: 0.2,
      mu: 1.2, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 12,
      concedido_adversario: "n/d", incerteza: "media", market_type: "sot",
    };
    const comp = [{ book: "kto", odd_over: 6.5 }, { book: "betano", odd_over: 4.7 }];
    const c = buildCandidate({ ...base, book: "kto", casas_comparadas: comp });
    expect(c["book"]).toBe("kto");
    expect(c["casas_comparadas"]).toEqual(comp);
    // ausente → book null, sem casas_comparadas (não quebra o fluxo manual de 1 casa)
    const cBare = buildCandidate(base);
    expect(cBare["book"]).toBeNull();
    expect(cBare["casas_comparadas"]).toBeNull();
  });

  it("respeita o override `devig` (de-vig de escada): usa a prob justa, não a crua", () => {
    const base = {
      jogador: "K. Havertz", linha: 0.5, odd_over: 2.0, odd_under: null, prob_modelo: 0.6,
      mu: 1.0, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 12,
      concedido_adversario: "n/d", incerteza: "baixa", market_type: "passes",
    };
    // com devig (escada ajustou) → prob_devig vem do override, NÃO a crua 1/odd_over=0.5
    const c = buildCandidate({ ...base, devig: { prob: 0.42, sem_devig: false } });
    expect(c["prob_devig"]).toBe(0.42);
    expect(c["sem_devig"]).toBe(false);
    expect(c["edge"]).toBeCloseTo(0.6 - 0.42, 12);
    expect(c["ev"]).toBeCloseTo(0.6 * 2.0 - 1.0, 12);
    // sem devig → comportamento atual (one-sided → sem_devig:true, prob_devig=1/odd_over)
    const cBare = buildCandidate(base);
    expect(cBare["sem_devig"]).toBe(true);
    expect(cBare["prob_devig"]).toBeCloseTo(impliedProb(2.0), 12);
  });
});
