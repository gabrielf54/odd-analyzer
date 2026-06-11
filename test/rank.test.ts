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

describe("rankCandidates — ordenação", () => {
  // confirmado + mercado validado (sot) por padrão; sobrescreve quando preciso.
  const mk = (jogador: string, prob: number, ev: number, extra: Record<string, unknown> = {}) =>
    ({ jogador, prob_modelo: prob, ev, titularidade: "confirmado", market_type: "sot", ...extra });

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

  it("lista vazia → vazia", () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it("não muta a entrada", () => {
    const input = [mk("a", 0.6, 0.4)];
    rankCandidates(input);
    expect(input[0]).not.toHaveProperty("risco");
    expect(input[0]).not.toHaveProperty("recomendado");
  });
});

describe("rankCandidates — gate de titularidade + mercado validado", () => {
  it("NÃO recomenda quando ninguém está confirmado (pré-lineup)", () => {
    const r = rankCandidates([
      { prob_modelo: 0.6, ev: 0.2, titularidade: "provavel", market_type: "sot", linha: 1.5 },
      { prob_modelo: 0.5, ev: 0.1, titularidade: "provavel", market_type: "sot", linha: 0.5 },
    ]);
    expect(r.every((c: any) => c.recomendado === false)).toBe(true);
    expect(r.every((c: any) => c.pronto_para_apostar === false)).toBe(true);
  });

  it("recomenda o melhor confirmado de mercado validado, sem alerta de minutos", () => {
    const r = rankCandidates([
      { prob_modelo: 0.6, ev: 0.3, titularidade: "confirmado", market_type: "sot", linha: 0.5 },
      { prob_modelo: 0.55, ev: 0.2, titularidade: "confirmado", market_type: "sot", linha: 0.5, alerta_minutos: true },
    ]);
    const star = r.find((c: any) => c.recomendado === true);
    expect(star!.prob_modelo).toBe(0.6);
    expect(r.find((c: any) => c.alerta_minutos)!.pronto_para_apostar).toBe(false);
  });

  it("sot: recomenda na linha validada (0.5) e NÃO nas de atenção (1.5/2.5)", () => {
    // Calibração na seleção: sot só tem skill em over 0.5; 1.5/2.5 reprovam.
    const r05 = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "sot", linha: 0.5 }]);
    expect(r05[0]!.pronto_para_apostar).toBe(true);
    expect(r05[0]!.recomendado).toBe(true);
    for (const linha of [1.5, 2.5]) {
      const r = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "sot", linha }]);
      expect(r[0]!.pronto_para_apostar).toBe(false);
      expect(r[0]!.recomendado).toBe(false);
    }
  });

  it("NÃO recomenda mercado NÃO-validado (gols) mesmo confirmado", () => {
    const r = rankCandidates([
      { prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "gols", linha: 2.5 },
    ]);
    expect(r[0]!.recomendado).toBe(false);
    expect(r[0]!.pronto_para_apostar).toBe(false);
  });

  it("desarme: recomenda nas linhas validadas (1.5) e NÃO na de observação (2.5)", () => {
    const r15 = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "desarmes", linha: 1.5 }]);
    expect(r15[0]!.pronto_para_apostar).toBe(true);
    expect(r15[0]!.recomendado).toBe(true);
    const r25 = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "desarmes", linha: 2.5 }]);
    expect(r25[0]!.pronto_para_apostar).toBe(false);
    expect(r25[0]!.recomendado).toBe(false);
  });

  it("entre validado e não-validado, a estrela vai pro validado (mesmo com EV menor)", () => {
    const r = rankCandidates([
      { prob_modelo: 0.8, ev: 0.5, titularidade: "confirmado", market_type: "gols", linha: 2.5 },
      { prob_modelo: 0.6, ev: 0.3, titularidade: "confirmado", market_type: "finalizacoes", linha: 1.5 },
    ]);
    const star = r.find((c: any) => c.recomendado === true);
    expect(star!.market_type).toBe("finalizacoes");
  });

  it("todos com alerta de minutos → ninguém recomendado", () => {
    const r = rankCandidates([
      { prob_modelo: 0.6, ev: 0.5, titularidade: "confirmado", market_type: "sot", linha: 1.5, alerta_minutos: true },
      { prob_modelo: 0.2, ev: 0.9, titularidade: "confirmado", market_type: "sot", linha: 0.5, alerta_minutos: true },
    ]);
    expect(r.every((c: any) => c.recomendado === false)).toBe(true);
  });
});
