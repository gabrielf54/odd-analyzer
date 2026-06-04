import { describe, it, expect } from "vitest";
import { MARKETS, baselineFor } from "../src/model/markets.js";

describe("markets", () => {
  it("registry tem os 6 mercados do MVP", () => {
    expect(Object.keys(MARKETS).sort()).toEqual(
      ["desarmes", "escanteios", "finalizacoes", "gols", "sot", "vitoria"]
    );
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
});
