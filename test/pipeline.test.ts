import { describe, it, expect } from "vitest";
import { analyzeMatch, matchCount, runMatch } from "../src/pipeline.js";
import { ManualOdds } from "../src/providers/odds.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { fakeAnalyst } from "../src/ai/analyst.js";
import { MARKETS } from "../src/model/markets.js";

const event = { id: "ev1", jogo: "A x B", home_team: { id: "H", name: "A" }, away_team: { id: "A", name: "B" } };

// StatsProvider fake: 1 jogador titular com mu alto.
const fakeStats = {
  async squad() { return [{ id: "p1", name: "Kaiki", team_id: "H" }]; },
  async xiIds() { return new Set(["p1"]); },
  async entityRate() {
    return { mu: 3.0, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 15, concedido_adversario: "5.0", incerteza: "baixa" };
  },
  async teamRate() { return null; },
  async teamRates() { return null; },
};

describe("analyzeMatch", () => {
  it("mercado de contagem (jogador) gera candidatos e salva análise", async () => {
    const repo = new InMemoryRepo();
    const odds = new ManualOdds([{ entidade: "partida", linha: 1.5, odd_over: 2.5, odd_under: 1.5, book: "m" }]);
    const out = await analyzeMatch(event, MARKETS["sot"]!, fakeStats, odds, repo, { analystFn: fakeAnalyst });
    expect(Array.isArray(out.candidatos)).toBe(true);
    // mu=3 over 1.5 → prob alta; odd_over 2.5 → ev positivo; deve passar o filtro
    expect(out.candidatos.length).toBeGreaterThan(0);
    expect(out.candidatos[0]!.market_type).toBe("sot");
    expect(repo.getAnalysis("ev1")).not.toBeNull();
  });

  it("sem linhas de odds → nenhum candidato", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeMatch(event, MARKETS["sot"]!, fakeStats, new ManualOdds([]), repo, { analystFn: fakeAnalyst });
    expect(out.candidatos).toEqual([]);
  });
});

describe("pipeline exports p/ reuso manual", () => {
  it("matchCount e runMatch estão exportados", () => {
    expect(typeof matchCount).toBe("function");
    expect(typeof runMatch).toBe("function");
  });
});
