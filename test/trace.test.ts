import { describe, it, expect } from "vitest";
import { buildRateTrace, finalizeTrace, statLabelFor } from "../src/model/trace.js";

describe("statLabelFor", () => {
  it("traduz stat_field pra termo leigo", () => {
    expect(statLabelFor("shots_on_target")).toBe("chutes a gol");
    expect(statLabelFor("desconhecido")).toBe("desconhecido");
  });
});

describe("buildRateTrace", () => {
  const games = [
    { shots_on_target: 1, minutes_played: 90 },
    { shots_on_target: 0, minutes_played: 90 },
    { shots_on_target: 2, minutes_played: 90 },
  ];
  const rt = buildRateTrace({
    statField: "shots_on_target", games,
    rawRate: 1.0, shrunk: 0.45, priorRate: 0.4, priorStrength: 12, n: 3,
    minutos: 63.2, oppMult: 1.0, haMult: 0.92, oppConceded: 3.3, isHome: false, mu: 0.317,
  });

  it("emite os passos do ritmo na ordem certa", () => {
    expect(rt.passos.map((p) => p.passo)).toEqual([
      "taxa_base", "encolhimento", "minutos", "fator_adversario", "fator_casa", "esperado_final",
    ]);
  });

  it("taxa_base soma o stat e os minutos da janela", () => {
    const base = rt.passos[0];
    expect(base.entradas.stat_total).toBe(3);
    expect(base.entradas.minutos_total).toBe(270);
    expect(base.frase).toContain("3 chutes a gol");
  });

  it("guarda mu e statField pra finalizar", () => {
    expect(rt.mu).toBe(0.317);
    expect(rt.statField).toBe("shots_on_target");
  });

  it("omite fator_adversario quando oppConceded é null", () => {
    const rt2 = buildRateTrace({
      statField: "shots_on_target", games,
      rawRate: 1, shrunk: 0.45, priorRate: 0.4, priorStrength: 12, n: 3,
      minutos: 90, oppMult: 1, haMult: 1, oppConceded: null, isHome: true, mu: 0.45,
    });
    expect(rt2.passos.map((p) => p.passo)).not.toContain("fator_adversario");
  });
});

describe("finalizeTrace", () => {
  const rt = buildRateTrace({
    statField: "shots_on_target", games: [{ shots_on_target: 1, minutes_played: 90 }],
    rawRate: 1, shrunk: 0.45, priorRate: 0.4, priorStrength: 12, n: 1,
    minutos: 63.2, oppMult: 1, haMult: 0.92, oppConceded: 3.3, isHome: false, mu: 0.317,
  });
  const trace = finalizeTrace(rt, {
    alvo: "Mikel Oyarzabal", linha: 1.5, probModelo: 0.048, probDevig: 0.369, edge: -0.321, ev: -0.808,
  });

  it("anexa probabilidade, casa_devig e comparacao", () => {
    const ids = trace.passos.map((p) => p.passo);
    expect(ids.slice(-3)).toEqual(["probabilidade", "casa_devig", "comparacao"]);
  });

  it("preenche alvo, linha e precisa", () => {
    expect(trace.alvo).toBe("Mikel Oyarzabal");
    expect(trace.linha).toBe(1.5);
    expect(trace.precisa).toBe("2 ou mais");
  });

  it("veredito_leigo aponta falta de valor quando edge negativo", () => {
    expect(trace.veredito_leigo.toLowerCase()).toContain("sem valor");
  });
});
