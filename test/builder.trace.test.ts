import { describe, it, expect } from "vitest";
import { buildCandidate } from "../src/candidates/builder.js";
import type { RateTrace } from "../src/model/trace.js";

const rateTrace: RateTrace = {
  statField: "shots_on_target",
  mu: 0.317,
  passos: [{ passo: "esperado_final", titulo: "x", formula: "y", entradas: {}, saida: 0.317, frase: "z" }],
};

describe("buildCandidate com trace", () => {
  it("finaliza o trace quando recebido", () => {
    const c = buildCandidate({
      jogador: "Mikel Oyarzabal", linha: 1.5, odd_over: 4, odd_under: 1.9,
      prob_modelo: 0.048, mu: 0.317, minutos_esperados: 63.2, xi_confirmado: true,
      amostra_jogos: 50, concedido_adversario: "3.3", incerteza: "baixa",
      market_type: "sot", trace: rateTrace,
    }) as any;
    expect(c.trace).toBeDefined();
    expect(c.trace.alvo).toBe("Mikel Oyarzabal");
    expect(c.trace.precisa).toBe("2 ou mais");
    expect(c.trace.passos.map((p: any) => p.passo)).toContain("comparacao");
  });

  it("não cria trace quando não recebido", () => {
    const c = buildCandidate({
      jogador: "X", linha: 1.5, odd_over: 4, odd_under: 1.9,
      prob_modelo: 0.048, mu: 0.317, minutos_esperados: 63.2, xi_confirmado: true,
      amostra_jogos: 50, concedido_adversario: "3.3", incerteza: "baixa", market_type: "sot",
    }) as any;
    expect(c.trace).toBeUndefined();
  });
});
