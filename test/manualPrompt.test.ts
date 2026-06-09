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

  it("grupo 'jogador': lista + 3 mercados, modelo coluna N+ e matching normalizado", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "jogador", lineup);
    expect(p).toContain("Kai Havertz");
    expect(p).toContain("Joshua Kimmich");
    expect(p).toContain('"sot"');
    expect(p).toContain('"finalizacoes"');
    expect(p).toContain('"desarmes"');
    // bet365: linhas são colunas-limiar "N+", não "Mais de X.5"
    expect(p).toMatch(/2\+/);
    expect(p).toContain('"linha_label"');
    // nome cru da casa preservado + normalização de acento/islandês
    expect(p).toContain('"entidade_casa"');
    expect(p).toMatch(/þ→th|acento/i);
    // mercados opcionais (desarmes pode não existir no jogo)
    expect(p).toMatch(/OPCIONAIS|não tiver|OMITA/);
  });

  it("grupo 'partida': UM prompt com gols + escanteios + vitoria, 2 lados nos totais", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "partida", lineup);
    expect(p).toContain('"gols"');
    expect(p).toContain('"escanteios"');
    expect(p).toContain('"vitoria"');
    expect(p).toContain('"odd_under"');
    expect(p).not.toContain("Kai Havertz");
  });
});
