import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/api/app.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { fakeClient as manualClient } from "./manualFixtures.js";

function makeClient(): any {
  return {
    async leagues() { return { results: [{ id: 9, name: "Série A", country: "BR" }] }; },
    async events() { return { results: [{ id: "e1", home_team: "A", away_team: "B", event_date: "2026-06-01", status: "finished", home_score: 1, away_score: 0 }] }; },
    async getEvent() { return { id: "ev1", home_team: "A", away_team: "B", home_team_id: "H", away_team_id: "Aw", league_id: 9 }; },
    async lineups() { return { lineups: {} }; },
    async eventPlayerStats() { return { player_stats: [{ player_id: 1, shots_on_target: 3 }] }; },
    async eventStats() { return { stats: {} }; },
  };
}

function app() { return createApp({ client: makeClient(), repo: new InMemoryRepo() }); }

describe("API", () => {
  it("GET /ligas → 200 lista", async () => {
    const r = await request(app()).get("/ligas");
    expect(r.status).toBe(200);
    expect(r.body[0].nome).toBe("Série A");
  });

  it("GET /ligas/9/jogos?status=finished → 200", async () => {
    const r = await request(app()).get("/ligas/9/jogos?status=finished");
    expect(r.status).toBe(200);
    expect(r.body[0].placar).toBe("1×0");
  });

  it("GET jogos com status inválido → 400 {erro,codigo}", async () => {
    const r = await request(app()).get("/ligas/9/jogos?status=xyz");
    expect(r.status).toBe(400);
    expect(r.body).toHaveProperty("erro");
    expect(r.body).toHaveProperty("codigo");
  });

  it("POST /analisar body válido → 200 com em_validacao", async () => {
    const r = await request(app()).post("/analisar").send({
      event_id: "ev1", market_key: "escanteios", linha: 9.5, odd_over: 1.9, odd_under: 1.9,
    });
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("em_validacao", true);
    expect(r.body).toHaveProperty("candidatos");
  });

  it("POST /analisar sem market_key → 400", async () => {
    const r = await request(app()).post("/analisar").send({ event_id: "ev1" });
    expect(r.status).toBe(400);
    expect(r.body.codigo).toBe("body_invalido");
  });

  it("POST /analisar mercado desconhecido → 400", async () => {
    const r = await request(app()).post("/analisar").send({ event_id: "ev1", market_key: "zzz", linha: 1, odd_over: 2, odd_under: 2 });
    expect(r.status).toBe(400);
    expect(r.body.erro).toMatch(/mercado desconhecido/);
  });

  it("GET /jogos/:id/resultado → 200 mapa por player_id", async () => {
    const r = await request(app()).get("/jogos/ev1/resultado?market=sot&linha=1.5");
    expect(r.status).toBe(200);
    expect(r.body["1"]).toEqual({ valor_real: 3, bateu: true });
  });
});

describe("API — fluxo manual de odds", () => {
  const manualApp = () => createApp({ client: manualClient(), repo: new InMemoryRepo() });

  it("GET /prompt → 200 com string do prompt e lista de jogadores", async () => {
    const r = await request(manualApp()).get("/prompt").query({ event_id: "e1", market: "sot" });
    expect(r.status).toBe(200);
    expect(r.body.prompt).toContain("Kai Havertz");
  });

  it("GET /prompt sem market → 400", async () => {
    const r = await request(manualApp()).get("/prompt").query({ event_id: "e1" });
    expect(r.status).toBe(400);
  });

  it("POST /analise/manual → 200 com candidatos", async () => {
    const r = await request(manualApp()).post("/analise/manual").send({
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, book: "b" }],
    });
    expect(r.status).toBe(200);
    expect(r.body.candidatos).toBeDefined();
    expect(r.body.jogadores_sem_match).toBeDefined();
  });

  it("POST /analise/manual sem coletado_em → 400", async () => {
    const r = await request(manualApp()).post("/analise/manual").send({ event_id: "e1", odds: [] });
    expect(r.status).toBe(400);
  });

  it("POST /crosswalk → 200 e persiste", async () => {
    const r = await request(manualApp()).post("/crosswalk").send({ nome_casa: "CR7", player_id: "20" });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});
