import { describe, it, expect } from "vitest";
import { buildOddsPrompt } from "../src/manual/prompt.js";

const lineup = {
  home: { team_name: "Germany", jogadores: [{ id: "10", name: "Kai Havertz" }] },
  away: { team_name: "Scotland", jogadores: [{ id: "20", name: "Joshua Kimmich" }] },
};

describe("buildOddsPrompt", () => {
  it("mercado de jogador embute a lista de jogadores e pede só over", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "sot", lineup);
    expect(p).toContain("Kai Havertz");
    expect(p).toContain("Joshua Kimmich");
    expect(p).toMatch(/OVER|Mais de/i);
    expect(p).toContain('"market_type": "sot"');
    expect(p).toMatch(/não invente|OMITA/i);
  });

  it("mercado de partida (totais) pede os dois lados e não embute jogadores", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "escanteios", lineup);
    expect(p).not.toContain("Kai Havertz");
    expect(p).toMatch(/over.*under|Mais.*Menos/i);
    expect(p).toContain('"market_type": "escanteios"');
    expect(p).toContain('"odd_under"');
  });

  it("vitoria pede uma entrada por resultado", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "vitoria", lineup);
    expect(p).toContain('"market_type": "vitoria"');
    expect(p).toMatch(/empate/i);
  });

  it("mercado desconhecido lança", () => {
    expect(() => buildOddsPrompt({ jogo: "x" }, "cartoes", lineup)).toThrow(/desconhecido/);
  });
});
