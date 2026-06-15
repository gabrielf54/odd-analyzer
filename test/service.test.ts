import { describe, it, expect } from "vitest";
import {
  listLeagues, listMatches, probableLineup, recentPlayerAverage,
  analyze, paperBet, realPlayerResult,
  generateOddsPrompt, analyzeManualService, confirmCrosswalk,
  saveOddsService, getOddsService, deleteOddsService,
} from "../src/service.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { ManualOdds } from "../src/providers/odds.js";
import { fakeClient, fakeReviewer } from "./manualFixtures.js";

describe("service", () => {
  it("listLeagues ordena por nome", async () => {
    const client = { async leagues() { return { results: [{ id: 2, name: "Zeta", country: "X" }, { id: 1, name: "Alpha", country: "Y" }] }; } };
    const out = await listLeagues(client);
    expect(out.map((l) => l.nome)).toEqual(["Alpha", "Zeta"]);
  });

  it("listMatches monta placar e ordena (pós desc)", async () => {
    const client = { async events() { return { results: [
      { id: "a", home_team: "A", away_team: "B", event_date: "2026-06-01", status: "finished", home_score: 1, away_score: 0 },
      { id: "b", home_team: "C", away_team: "D", event_date: "2026-06-03", status: "finished", home_score: 2, away_score: 2 },
    ] }; } };
    const out = await listMatches(client, 9, "finished");
    expect(out[0]!.id).toBe("b"); // mais recente primeiro
    expect(out[0]!.placar).toBe("2×2");
  });

  it("listMatches (notstarted) descarta jogo com horário já passado", async () => {
    const client = { async events() { return { results: [
      { id: "velho", home_team: "A", away_team: "B", event_date: "2026-03-31T11:30:00+00:00", status: "notstarted" },
      { id: "futuro", home_team: "C", away_team: "D", event_date: "2026-06-10T20:00:00+00:00", status: "notstarted" },
    ] }; } };
    const now = new Date("2026-06-07T12:00:00+00:00");
    const out = await listMatches(client, 31, "notstarted", 50, now);
    expect(out.map((j) => j.id)).toEqual(["futuro"]); // 31/mar caiu fora
  });

  it("listMatches (notstarted) inclui jogo AO VIVO (status próprio, ex.: 1st_half) e não filtra status na API", async () => {
    const now = new Date("2026-06-13T19:10:00+00:00");
    let calledStatus: unknown = "NAO_CHAMADO";
    const client = { async events(p: any) {
      calledStatus = p.status; // pré-jogo não pode mandar status (senão ao vivo some)
      return { results: [
        { id: "live", home_team: "Qatar", away_team: "Switzerland", event_date: "2026-06-13T19:00:00+00:00", status: "1st_half", home_score: 0, away_score: 0 },
        { id: "fim", home_team: "X", away_team: "Y", event_date: "2026-06-13T16:00:00+00:00", status: "finished", home_score: 1, away_score: 2 },
        { id: "futuro", home_team: "C", away_team: "D", event_date: "2026-06-18T20:00:00+00:00", status: "notstarted" },
      ] };
    } };
    const out = await listMatches(client, 27, "notstarted", 50, now);
    expect(calledStatus).toBeUndefined();
    expect(out.map((j) => j.id)).toEqual(["live", "futuro"]); // ao vivo entra, finalizado sai
    expect(out[0]!.placar).toBe("0×0"); // placar ao vivo aparece
  });

  it("listMatches (notstarted) mantém jogo iniciado há <3h, descarta >3h", async () => {
    const now = new Date("2026-06-07T12:00:00+00:00");
    const client = { async events() { return { results: [
      { id: "ha2h", home_team: "A", away_team: "B", event_date: "2026-06-07T10:00:00+00:00", status: "notstarted" }, // -2h: fica
      { id: "ha5h", home_team: "C", away_team: "D", event_date: "2026-06-07T07:00:00+00:00", status: "notstarted" }, // -5h: sai
      { id: "futuro", home_team: "E", away_team: "F", event_date: "2026-06-07T20:00:00+00:00", status: "notstarted" },
    ] }; } };
    const out = await listMatches(client, 31, "notstarted", 50, now);
    expect(out.map((j) => j.id)).toEqual(["ha2h", "futuro"]); // ordenado por data asc; ha5h fora
  });

  it("listMatches puxa janela ampla — não perde jogo de data cedo com id baixo (BSD ordena id desc)", async () => {
    // BSD devolve eventos ordenados por id DESC e respeita o limit pedido.
    // O opener (id baixo, data cedo) só aparece se pedirmos janela larga.
    const pool: any[] = [];
    for (let i = 0; i < 60; i++) {
      const id = 8390 - i; // ids altos = knockout, data tarde
      pool.push({ id, home_team: "TimeA" + id, away_team: "TimeB" + id, event_date: "2026-07-01T00:00:00+00:00", status: "notstarted" });
    }
    pool.push({ id: 8287, home_team: "Mexico", away_team: "South Africa", event_date: "2026-06-11T19:00:00+00:00", status: "notstarted" });
    pool.sort((a, b) => b.id - a.id); // id desc, como o BSD
    const client = { async events({ limit }: any) { return { results: pool.slice(0, limit) }; } };
    const now = new Date("2026-06-10T00:00:00+00:00");
    const out = await listMatches(client, 27, "notstarted", 50, now);
    const ids = out.map((j) => j.id);
    expect(ids).toContain(8287); // opener aparece apesar do id baixo
    expect(out[0]!.id).toBe(8287); // ordenado por data asc → opener primeiro
  });

  it("listMatches descarta times placeholder de chave (sem time real → sem stats)", async () => {
    const client = { async events() { return { results: [
      { id: 1, home_team: "W101", away_team: "L101", event_date: "2026-07-18T00:00:00+00:00", status: "notstarted" },
      { id: 2, home_team: "1K", away_team: "3D/3E/3I", event_date: "2026-07-01T00:00:00+00:00", status: "notstarted" },
      { id: 3, home_team: "Mexico", away_team: "South Africa", event_date: "2026-06-11T19:00:00+00:00", status: "notstarted" },
    ] }; } };
    const now = new Date("2026-06-10T00:00:00+00:00");
    const out = await listMatches(client, 27, "notstarted", 50, now);
    expect(out.map((j) => j.id)).toEqual([3]); // só o jogo com times reais
  });

  it("probableLineup usa lineup e resolve via crosswalk", async () => {
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
    const out = await probableLineup(client, "ev1");
    expect(out.origem).toBe("confirmada");
    expect(out.home.jogadores[0].id).toBe("100"); // resolvido p/ stats-id
  });

  it("recentPlayerAverage calcula média do stat", async () => {
    const client = { async playerStats() { return { results: [{ shots_on_target: 2 }, { shots_on_target: 4 }] }; } };
    const out = await recentPlayerAverage(client, "ev1", "sot", "p1");
    expect(out).toEqual({ media: 3, jogos: 2 });
  });

  it("analyze marca em_validacao p/ mercado de partida", async () => {
    const client = {
      async getEvent() { return { id: "ev1", home_team: "A", away_team: "B", home_team_id: "H", away_team_id: "Aw", league_id: 9 }; },
      async events() { return { results: [] }; }, // team_taxa sem dados → candidatos vazio
      async eventStats() { return { stats: {} }; },
    };
    const out = await analyze(client, "ev1", "escanteios", 9.5, 1.9, 1.9, { repo: new InMemoryRepo(), oddsProvider: new ManualOdds([{ entidade: "partida", linha: 9.5, odd_over: 1.9, odd_under: 1.9, book: "m" }]) });
    expect(out.em_validacao).toBe(true);
    expect(out.jogo).toBe("A x B");
  });

  it("paperBet bloqueia mercado em validação", async () => {
    await expect(paperBet(new InMemoryRepo(), "ev1", { jogador: "x", linha: 1, market_type: "gols", odd: 2, prob_modelo: 0.5, prob_devig: 0.4, edge: 0.1, ev: 0.1 }, true))
      .rejects.toThrow(/em validação/);
  });

  it("paperBet grava no ledger quando não em validação", async () => {
    const repo = new InMemoryRepo();
    await paperBet(repo, "ev1", { jogador: "Kaiki", linha: 1.5, market_type: "sot", odd: 2.0, prob_modelo: 0.6, prob_devig: 0.5, edge: 0.1, ev: 0.2 });
    expect(repo.ledger).toHaveLength(1);
    expect(repo.ledger[0]!.jogador).toBe("Kaiki");
  });

  it("realPlayerResult mapeia actuals por player_id", async () => {
    const client = { async eventPlayerStats() { return { player_stats: [{ player_id: 1, shots_on_target: 3 }, { player_id: 2, shots_on_target: 0 }] }; } };
    const out = await realPlayerResult(client, "ev1", "sot", 1.5);
    expect(out["1"]).toEqual({ valor_real: 3, bateu: true });
    expect(out["2"]).toEqual({ valor_real: 0, bateu: false });
  });
});

describe("service manual (coleta de odds via IA externa)", () => {
  it("generateOddsPrompt monta prompt com lineup do jogo", async () => {
    const p = await generateOddsPrompt(fakeClient(), "e1", "sot");
    expect(p).toContain("Kai Havertz");
  });

  it("analyzeManualService valida body e roda análise", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManualService(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }],
    }, { repo, reviewerFn: fakeReviewer });
    expect(out.candidatos).toBeDefined();
    expect(out.linhas_rejeitadas).toHaveLength(0);
  });

  it("analyzeManualService sem coletado_em lança", async () => {
    await expect(analyzeManualService(fakeClient(), { event_id: "e1", odds: [] }))
      .rejects.toThrow();
  });

  it("confirmCrosswalk persiste nome->id no repo", async () => {
    const repo = new InMemoryRepo();
    await confirmCrosswalk(repo, "CR7", "20");
    expect(repo.listCrosswalk()["cr7"]).toBe("20");
  });
});

describe("service — odds persistidas", () => {
  const body = (odds: any[]) => ({ event_id: "e1", coletado_em: "2026-06-10T00:00:00Z", odds });

  it("saveOddsService persiste linhas válidas e devolve rejeitadas", async () => {
    const repo = new InMemoryRepo();
    const out = await saveOddsService(repo, body([
      { market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" },
      { market_type: "zzz", entidade: "X", linha: 0.5, odd_over: 2.0, book: "b" },
    ]));
    expect(out.salvas).toBe(1);
    expect(out.linhas_rejeitadas).toHaveLength(1);
    expect(repo.getOdds("e1")).toHaveLength(1);
  });

  it("getOddsService lê o que foi salvo", async () => {
    const repo = new InMemoryRepo();
    await saveOddsService(repo, body([{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }]));
    expect(await getOddsService(repo, "e1")).toHaveLength(1);
  });

  it("deleteOddsService limpa o jogo", async () => {
    const repo = new InMemoryRepo();
    await saveOddsService(repo, body([{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }]));
    await deleteOddsService(repo, "e1");
    expect(await getOddsService(repo, "e1")).toEqual([]);
  });

  it("clear TOTAL (sem filtro) apaga a análise salva junto", async () => {
    const repo = new InMemoryRepo();
    await analyzeManualService(fakeClient(), body([
      { market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" },
    ]), { repo, reviewerFn: fakeReviewer });
    expect(repo.getManualResult("e1")).not.toBeNull();
    await deleteOddsService(repo, "e1"); // limpar todas
    expect(repo.getManualResult("e1")).toBeNull();
  });

  it("apagar UMA odd (com filtro) NÃO apaga a análise", async () => {
    const repo = new InMemoryRepo();
    await analyzeManualService(fakeClient(), body([
      { market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" },
    ]), { repo, reviewerFn: fakeReviewer });
    await deleteOddsService(repo, "e1", { entidade: "K. Havertz", market_type: "sot", linha: 0.5, book: "b" });
    expect(repo.getManualResult("e1")).not.toBeNull(); // edição pontual preserva a análise
  });

  it("analyzeManualService persiste odds do corpo e analisa do repo", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManualService(fakeClient(), body([
      { market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" },
    ]), { repo, reviewerFn: fakeReviewer });
    expect(out.candidatos).toBeDefined();
    expect(repo.getOdds("e1")).toHaveLength(1);
  });

  it("analyzeManualService sem odds no corpo analisa o que já está no repo", async () => {
    const repo = new InMemoryRepo();
    await saveOddsService(repo, body([{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }]));
    const out = await analyzeManualService(fakeClient(), { event_id: "e1" }, { repo, reviewerFn: fakeReviewer });
    expect(out.candidatos).toBeDefined();
    expect(out.jogadores_sem_match).toBeDefined();
  });
});
