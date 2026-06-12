import { describe, it, expect } from "vitest";
import { runMatch } from "../src/pipeline.js";
import { MARKETS } from "../src/model/markets.js";

const op = { lines: () => [{ entidade: "partida", linha: 2.5, odd_over: 1.9, odd_under: 1.9, book: "manual" }] };
const ev = (extra: any = {}) => ({ id: "e1", jogo: "A x B", league_id: 9, home_team: { id: "H", name: "A" }, away_team: { id: "A2", name: "B" }, ...extra });

// H forte, A2 médio, X fraco — cada time ≥10 jogos (elegível p/ ratings)
function pool() {
  const g: any[] = [];
  for (let r = 0; r < 6; r++) {
    const d = `2026-01-${String(10 + r).padStart(2, "0")}`;
    g.push({ date: d + "a", home: "H", away: "A2", homeScore: 3, awayScore: 0 });
    g.push({ date: d + "b", home: "H", away: "X", homeScore: 3, awayScore: 0 });
    g.push({ date: d + "c", home: "A2", away: "X", homeScore: 2, awayScore: 0 });
  }
  return g;
}
const fonteOf = (out: any[]) => out[0]?.trace?.passos?.[0]?.entradas?.fonte;

describe("runMatch — RATINGS de força com fallback", () => {
  it("usa ratings quando há leaguePool + league_id + times elegíveis", async () => {
    const sp = { leaguePool: async () => pool(), teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev(), MARKETS.gols!, sp, op);
    expect(out.length).toBe(1);
    expect(fonteOf(out)).toBe("ratings_forca");
    expect(out[0].prob_modelo).toBeGreaterThan(0);
    expect(out[0].prob_modelo).toBeLessThan(1);
  });

  it("ratings dão λ DIFERENTE da média-crua (o número muda)", async () => {
    const sp = { leaguePool: async () => pool(), teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const comRatings = await runMatch(ev(), MARKETS.gols!, sp, op);
    const spFallback = { teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const semRatings = await runMatch(ev(), MARKETS.gols!, spFallback, op);
    expect(comRatings[0].mu).not.toBeCloseTo(semRatings[0].mu, 3);
  });

  it("mandante forte → 1X2 favorece o mandante (prob alta)", async () => {
    const sp = { leaguePool: async () => pool(), teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev(), MARKETS.vitoria!, sp, op);
    expect(out[0].prob_modelo).toBeGreaterThan(0.5); // H goleia → vence muito
  });

  it("fallback p/ média-crua quando NÃO há league_id", async () => {
    const sp = { leaguePool: async () => pool(), teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev({ league_id: undefined }), MARKETS.gols!, sp, op);
    expect(fonteOf(out)).toBe("media_movel");
  });

  it("fallback quando o provider NÃO tem leaguePool", async () => {
    const sp = { teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev(), MARKETS.gols!, sp, op);
    expect(fonteOf(out)).toBe("media_movel");
  });

  it("fallback quando os times não têm histórico suficiente", async () => {
    const sp = { leaguePool: async () => [{ date: "1", home: "H", away: "A2", homeScore: 1, awayScore: 0 }], teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev(), MARKETS.gols!, sp, op);
    expect(fonteOf(out)).toBe("media_movel"); // H/A2 só 1 jogo cada
  });

  it("fallback robusto se leaguePool lançar", async () => {
    const sp = { leaguePool: async () => { throw new Error("boom"); }, teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev(), MARKETS.gols!, sp, op);
    expect(fonteOf(out)).toBe("media_movel");
  });
});
