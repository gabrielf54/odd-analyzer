import { describe, it, expect } from "vitest";
import { buildCandidate } from "../src/candidates/builder.js";

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
  });
});
