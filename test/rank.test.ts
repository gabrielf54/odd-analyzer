import { describe, it, expect } from "vitest";
import { classifyRisk, rankCandidates, RISK_SEGURO, RISK_MODERADO } from "../src/candidates/rank.js";

describe("classifyRisk", () => {
  it("usa os cortes 0.50 / 0.35 (bordas inclusivas no piso da faixa)", () => {
    expect(classifyRisk(0.50)).toBe("seguro");
    expect(classifyRisk(0.54)).toBe("seguro");
    expect(classifyRisk(0.49)).toBe("moderado");
    expect(classifyRisk(0.35)).toBe("moderado");
    expect(classifyRisk(0.34)).toBe("tiro_longo");
    expect(classifyRisk(0.10)).toBe("tiro_longo");
    expect(RISK_SEGURO).toBe(0.50);
    expect(RISK_MODERADO).toBe(0.35);
  });
});

describe("rankCandidates", () => {
  const mk = (jogador: string, prob: number, ev: number) =>
    ({ jogador, prob_modelo: prob, ev });

  it("ordena faixa (seguro→moderado→tiro_longo) e por EV desc dentro da faixa", () => {
    const out = rankCandidates([
      mk("longo_alto_ev", 0.26, 1.09),
      mk("seguro_baixo_ev", 0.54, 0.27),
      mk("moderado", 0.38, 0.66),
      mk("seguro_alto_ev", 0.60, 0.40),
    ]);
    expect(out.map((c) => c.jogador)).toEqual([
      "seguro_alto_ev", "seguro_baixo_ev", "moderado", "longo_alto_ev",
    ]);
    expect(out[0]!.risco).toBe("seguro");
    expect(out[3]!.risco).toBe("tiro_longo");
  });

  it("marca recomendado=true só no primeiro", () => {
    const out = rankCandidates([mk("a", 0.6, 0.4), mk("b", 0.55, 0.3)]);
    expect(out[0]!.recomendado).toBe(true);
    expect(out[1]!.recomendado).toBe(false);
  });

  it("lista vazia → vazia", () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it("não muta a entrada", () => {
    const input = [mk("a", 0.6, 0.4)];
    rankCandidates(input);
    expect(input[0]).not.toHaveProperty("risco");
  });

  it("estrela vai pro primeiro SEM alerta_minutos; ordem não muda", () => {
    const out = rankCandidates([
      { jogador: "banco", prob_modelo: 0.6, ev: 0.5, alerta_minutos: true },
      { jogador: "limpo", prob_modelo: 0.55, ev: 0.3, alerta_minutos: false },
    ]);
    expect(out.map((c) => c.jogador)).toEqual(["banco", "limpo"]); // ordem intacta
    expect(out[0]!.recomendado).toBe(false);
    expect(out[1]!.recomendado).toBe(true);
  });

  it("todos com alerta → o primeiro leva a estrela mesmo assim", () => {
    const out = rankCandidates([
      { jogador: "a", prob_modelo: 0.6, ev: 0.5, alerta_minutos: true },
      { jogador: "b", prob_modelo: 0.2, ev: 0.9, alerta_minutos: true },
    ]);
    expect(out[0]!.recomendado).toBe(true);
  });

  it("candidato sem o campo conta como elegível (compat)", () => {
    const out = rankCandidates([{ jogador: "a", prob_modelo: 0.6, ev: 0.5 }]);
    expect(out[0]!.recomendado).toBe(true);
  });
});
