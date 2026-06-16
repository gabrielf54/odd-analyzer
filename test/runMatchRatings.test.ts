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

  it("1X2: casa cada linha ao RESULTADO (mandante/empate/visitante) — jogador e prob distintos", async () => {
    // Regressão do crash do paper_ledger (2026-06-12): antes TODA linha de vitória
    // virava "mandante", com jogador+linha+market idênticos → 3 candidatos colidiam
    // na chave do upsert ("ON CONFLICT ... cannot affect row a second time").
    const sp = { leaguePool: async () => pool(), teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const opV = { lines: () => [
      { entidade: "A", linha: 0, odd_over: 1.5, odd_under: null, book: "m" },       // mandante (home.name = "A")
      { entidade: "empate", linha: 0, odd_over: 3.4, odd_under: null, book: "m" },   // empate
      { entidade: "B", linha: 0, odd_over: 6.0, odd_under: null, book: "m" },        // visitante (away.name = "B")
    ] };
    const out = await runMatch(ev(), MARKETS.vitoria!, sp, opV);
    expect(out).toHaveLength(3);
    const js = out.map((c: any) => c.jogador);
    expect(new Set(js).size).toBe(3); // chaves distintas → não colide no paper_ledger
    expect(js).toContain("A x B (1)");
    expect(js).toContain("A x B (X)");
    expect(js).toContain("A x B (2)");
    const home = out.find((c: any) => c.jogador.endsWith("(1)"))!;
    const away = out.find((c: any) => c.jogador.endsWith("(2)"))!;
    expect(home.prob_modelo).toBeGreaterThan(away.prob_modelo); // mandante forte vence mais
    const soma = out.reduce((s: number, c: any) => s + c.prob_modelo, 0);
    expect(soma).toBeCloseTo(1, 2); // home+empate+away ≈ 1
  });

  it("1X2: nome do visitante com pontuação/'&' ainda casa (sobreposição de tokens)", async () => {
    const sp = { leaguePool: async () => pool(), teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    // home.name="A", away.name="B" — uso um away multi-token p/ exercitar o overlap
    const ev2 = ev({ away_team: { id: "A2", name: "Bosnia and Herzegovina" } });
    const opV = { lines: () => [
      { entidade: "Bosnia & Herzegovina", linha: 0, odd_over: 6.0, odd_under: null, book: "m" },
    ] };
    const out = await runMatch(ev2, MARKETS.vitoria!, sp, opV);
    expect(out[0].jogador).toMatch(/\(2\)$/); // casou como visitante, não como mandante
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

  it("usa ratings ENCOLHIDOS mesmo com pouco histórico (não cai mais no fallback média-crua cego)", async () => {
    // O fix do bug `Iran×NZ`: time com poucos jogos deve usar o rating ENCOLHIDO pro
    // neutro, não a média-crua (que invertia mismatch). 1 jogo cada → ainda ratings.
    const sp = { leaguePool: async () => [{ date: "1", home: "H", away: "A2", homeScore: 1, awayScore: 0 }], teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev(), MARKETS.gols!, sp, op);
    expect(fonteOf(out)).toBe("ratings_forca");
  });

  it("fallback média-crua só quando um time está AUSENTE do pool (sem rating)", async () => {
    // A2 nunca aparece no pool → não tem rating → aí sim cai no fallback.
    const sp = { leaguePool: async () => [{ date: "1", home: "H", away: "X", homeScore: 1, awayScore: 0 }, { date: "2", home: "X", away: "H", homeScore: 0, awayScore: 2 }], teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev(), MARKETS.gols!, sp, op);
    expect(fonteOf(out)).toBe("media_movel"); // A2 ausente
  });

  it("fallback robusto se leaguePool lançar", async () => {
    const sp = { leaguePool: async () => { throw new Error("boom"); }, teamRates: async () => ({ lambda_for: 1.5, lambda_against: 1.2 }) };
    const out = await runMatch(ev(), MARKETS.gols!, sp, op);
    expect(fonteOf(out)).toBe("media_movel");
  });
});
