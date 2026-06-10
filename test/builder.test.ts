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
});
