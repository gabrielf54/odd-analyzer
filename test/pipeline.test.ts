import { describe, it, expect } from "vitest";
import { analisarJogo } from "../src/pipeline.js";
import { ManualOdds } from "../src/providers/odds.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { fakeAnalista } from "../src/ai/analista.js";
import { MARKETS } from "../src/model/markets.js";

const event = { id: "ev1", jogo: "A x B", home_team: { id: "H", name: "A" }, away_team: { id: "A", name: "B" } };

// StatsProvider fake: 1 jogador titular com mu alto.
const fakeStats = {
  async elenco() { return [{ id: "p1", name: "Kaiki", team_id: "H" }]; },
  async xi_ids() { return new Set(["p1"]); },
  async entity_taxa() {
    return { mu: 3.0, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 15, concedido_adversario: "5.0", incerteza: "baixa" };
  },
  async team_taxa() { return null; },
  async team_rates() { return null; },
};

describe("analisarJogo", () => {
  it("mercado de contagem (jogador) gera candidatos e salva análise", async () => {
    const repo = new InMemoryRepo();
    const odds = new ManualOdds([{ entidade: "partida", linha: 1.5, odd_over: 2.5, odd_under: 1.5, book: "m" }]);
    const out = await analisarJogo(event, MARKETS["sot"]!, fakeStats, odds, repo, { analistaFn: fakeAnalista });
    expect(Array.isArray(out.candidatos)).toBe(true);
    // mu=3 over 1.5 → prob alta; odd_over 2.5 → ev positivo; deve passar o filtro
    expect(out.candidatos.length).toBeGreaterThan(0);
    expect(out.candidatos[0]!.market_type).toBe("sot");
    expect(repo.getAnalise("ev1")).not.toBeNull();
  });

  it("sem linhas de odds → nenhum candidato", async () => {
    const repo = new InMemoryRepo();
    const out = await analisarJogo(event, MARKETS["sot"]!, fakeStats, new ManualOdds([]), repo, { analistaFn: fakeAnalista });
    expect(out.candidatos).toEqual([]);
  });
});
