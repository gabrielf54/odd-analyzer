import { describe, it, expect } from "vitest";
import { MARKETS, baselineFor, populacaoFor, isValidated, populacaoMotivo } from "../src/model/markets.js";

describe("markets", () => {
  it("registry tem os mercados do MVP (faltas inclusa, sem estrela ainda)", () => {
    expect(Object.keys(MARKETS).sort()).toEqual(
      ["desarmes", "escanteios", "faltas", "finalizacoes", "gols", "sot", "vitoria"]
    );
  });

  it("faltas: comete fouls, concede was_fouled; validada SÓ em over 0.5 na seleção", () => {
    const m = MARKETS["faltas"]!;
    expect(m.stat_field).toBe("fouls");
    expect(m.concede_field).toBe("was_fouled");
    expect(isValidated("faltas", 0.5, 27)).toBe(true);  // over 0.5 graduou (BrierSkill +0.034)
    expect(isValidated("faltas", 1.5, 27)).toBe(false); // reprovou
    expect(isValidated("faltas", 2.5, 27)).toBe(false); // reprovou
    expect(isValidated("faltas", 0.5, 9)).toBe(false);  // clube ausente (pós-Copa)
  });

  it("sot é nível jogador, contagem, campo shots_on_target", () => {
    const m = MARKETS["sot"]!;
    expect(m.nivel).toBe("jogador");
    expect(m.kind).toBe("contagem");
    expect(m.stat_field).toBe("shots_on_target");
  });

  it("baselineFor: liga de seleção (27=WC2026) usa baseline nacional", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, 27)).toBeCloseTo(4.28, 9);
  });

  it("baselineFor: liga de clube (9) usa baseline de clube", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, 9)).toBeCloseTo(4.55, 9);
  });

  it("baselineFor: league_id inválido cai no baseline de clube", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, null)).toBeCloseTo(4.55, 9);
  });

  it("populacaoFor: seleção (27/31) → selecao; clube (9) e desconhecida (null) → clube", () => {
    expect(populacaoFor(27)).toBe("selecao");
    expect(populacaoFor(31)).toBe("selecao");
    expect(populacaoFor(9)).toBe("clube");
    expect(populacaoFor(null)).toBe("clube");
    expect(populacaoFor("27")).toBe("selecao");
  });
});

describe("isValidated — por população", () => {
  it("seleção (27): finalizações todas; SOT só 0.5; desarme 0.5/1.5", () => {
    expect(isValidated("finalizacoes", 2.5, 27)).toBe(true);
    expect(isValidated("sot", 0.5, 27)).toBe(true);
    expect(isValidated("sot", 1.5, 27)).toBe(false);
    expect(isValidated("sot", 2.5, 27)).toBe(false);
    expect(isValidated("desarmes", 1.5, 27)).toBe(true);
    expect(isValidated("desarmes", 2.5, 27)).toBe(false);
  });
  it("clube (9): SOT e finalizações todas; desarme NÃO validado (aguarda Fatia 1)", () => {
    expect(isValidated("sot", 1.5, 9)).toBe(true);
    expect(isValidated("sot", 2.5, 9)).toBe(true);
    expect(isValidated("finalizacoes", 2.5, 9)).toBe(true);
    expect(isValidated("desarmes", 0.5, 9)).toBe(false);
    expect(isValidated("desarmes", 1.5, 9)).toBe(false);
  });
  it("liga desconhecida → clube", () => {
    expect(isValidated("sot", 1.5, null)).toBe(true);
    expect(isValidated("desarmes", 0.5, null)).toBe(false);
  });
  it("gols/vitória/escanteios: nunca validados", () => {
    expect(isValidated("gols", 2.5, 9)).toBe(false);
    expect(isValidated("escanteios", 9.5, 27)).toBe(false);
  });
});

describe("populacaoMotivo", () => {
  it("texto leigo por população", () => {
    expect(populacaoMotivo("selecao")).toMatch(/sele[çc]ão/i);
    expect(populacaoMotivo("selecao")).toMatch(/0\.5|1\+/);
    expect(populacaoMotivo("clube")).toMatch(/clube/i);
  });
});
