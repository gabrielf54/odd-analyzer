import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/api/app.js";
import { InMemoryRepo } from "../src/store/repo.js";

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
