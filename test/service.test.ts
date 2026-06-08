import { describe, it, expect } from "vitest";
import {
  listarLigas, listarJogos, escalacaoProvavel, mediaRecenteJogador,
  analisar, apostarPaper, resultadoRealJogador,
} from "../src/service.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { ManualOdds } from "../src/providers/odds.js";

describe("service", () => {
  it("listarLigas ordena por nome", async () => {
    const client = { async leagues() { return { results: [{ id: 2, name: "Zeta", country: "X" }, { id: 1, name: "Alpha", country: "Y" }] }; } };
    const out = await listarLigas(client);
    expect(out.map((l) => l.nome)).toEqual(["Alpha", "Zeta"]);
  });

  it("listarJogos monta placar e ordena (pós desc)", async () => {
    const client = { async events() { return { results: [
      { id: "a", home_team: "A", away_team: "B", event_date: "2026-06-01", status: "finished", home_score: 1, away_score: 0 },
      { id: "b", home_team: "C", away_team: "D", event_date: "2026-06-03", status: "finished", home_score: 2, away_score: 2 },
    ] }; } };
    const out = await listarJogos(client, 9, "finished");
    expect(out[0]!.id).toBe("b"); // mais recente primeiro
    expect(out[0]!.placar).toBe("2×2");
  });

  it("listarJogos (notstarted) descarta jogo com horário já passado", async () => {
    const client = { async events() { return { results: [
      { id: "velho", home_team: "A", away_team: "B", event_date: "2026-03-31T11:30:00+00:00", status: "notstarted" },
      { id: "futuro", home_team: "C", away_team: "D", event_date: "2026-06-10T20:00:00+00:00", status: "notstarted" },
    ] }; } };
    const agora = new Date("2026-06-07T12:00:00+00:00");
    const out = await listarJogos(client, 31, "notstarted", 50, agora);
    expect(out.map((j) => j.id)).toEqual(["futuro"]); // 31/mar caiu fora
  });

  it("escalacaoProvavel usa lineup e resolve via crosswalk", async () => {
    const client = {
      async getEvent() { return { home_team: "A", away_team: "B", home_team_id: "H", away_team_id: "Aw" }; },
      async lineups() { return { lineup_status: "confirmed", lineups: {
        home: { team_id: "H", confirmed: true, players: [{ id: 999, name: "Kaiki", position: "DF" }] },
        away: { team_id: "Aw", confirmed: true, players: [] },
      } }; },
      async events() { return { results: [{ id: "e" }] }; },
      async eventPlayerStats() { return { player_stats: [{ player_id: 100, team_id: "H" }] }; },
      async player() { return { name: "Kaiki" }; },
    };
    const out = await escalacaoProvavel(client, "ev1");
    expect(out.origem).toBe("confirmada");
    expect(out.home.jogadores[0].id).toBe("100"); // resolvido p/ stats-id
  });

  it("mediaRecenteJogador calcula média do stat", async () => {
    const client = { async playerStats() { return { results: [{ shots_on_target: 2 }, { shots_on_target: 4 }] }; } };
    const out = await mediaRecenteJogador(client, "ev1", "sot", "p1");
    expect(out).toEqual({ media: 3, jogos: 2 });
  });

  it("analisar marca em_validacao p/ mercado de partida", async () => {
    const client = {
      async getEvent() { return { id: "ev1", home_team: "A", away_team: "B", home_team_id: "H", away_team_id: "Aw", league_id: 9 }; },
      async events() { return { results: [] }; }, // team_taxa sem dados → candidatos vazio
      async eventStats() { return { stats: {} }; },
    };
    const out = await analisar(client, "ev1", "escanteios", 9.5, 1.9, 1.9, { repo: new InMemoryRepo(), oddsProvider: new ManualOdds([{ entidade: "partida", linha: 9.5, odd_over: 1.9, odd_under: 1.9, book: "m" }]) });
    expect(out.em_validacao).toBe(true);
    expect(out.jogo).toBe("A x B");
  });

  it("apostarPaper bloqueia mercado em validação", async () => {
    await expect(apostarPaper(new InMemoryRepo(), "ev1", { jogador: "x", linha: 1, market_type: "gols", odd: 2, prob_modelo: 0.5, prob_devig: 0.4, edge: 0.1, ev: 0.1 }, true))
      .rejects.toThrow(/em validação/);
  });

  it("apostarPaper grava no ledger quando não em validação", async () => {
    const repo = new InMemoryRepo();
    await apostarPaper(repo, "ev1", { jogador: "Kaiki", linha: 1.5, market_type: "sot", odd: 2.0, prob_modelo: 0.6, prob_devig: 0.5, edge: 0.1, ev: 0.2 });
    expect(repo.ledger).toHaveLength(1);
    expect(repo.ledger[0]!.jogador).toBe("Kaiki");
  });

  it("resultadoRealJogador mapeia actuals por player_id", async () => {
    const client = { async eventPlayerStats() { return { player_stats: [{ player_id: 1, shots_on_target: 3 }, { player_id: 2, shots_on_target: 0 }] }; } };
    const out = await resultadoRealJogador(client, "ev1", "sot", 1.5);
    expect(out["1"]).toEqual({ valor_real: 3, bateu: true });
    expect(out["2"]).toEqual({ valor_real: 0, bateu: false });
  });
});
