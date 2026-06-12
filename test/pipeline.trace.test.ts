import { describe, it, expect } from "vitest";
import { analyzeMatch } from "../src/pipeline.js";
import { MARKETS } from "../src/model/markets.js";

const event = { id: "e1", jogo: "Spain x Peru", home_team: { id: "H", name: "Spain" }, away_team: { id: "A", name: "Peru" } };

const statsProvider = {
  async squad() { return [{ id: "p1", name: "Mikel Oyarzabal", team_id: "H", posicao: "FW" }]; },
  async xiIds() { return new Set<string>(); },
  async entityRate() {
    return {
      mu: 0.317, minutos_esperados: 63.2, xi_confirmado: true, amostra_jogos: 50,
      concedido_adversario: "3.3", incerteza: "baixa",
      trace: { statField: "shots_on_target", mu: 0.317,
        passos: [{ passo: "taxa_base", titulo: "t", formula: "f", entradas: {}, saida: 0.45, frase: "fr" }] },
    };
  },
};
const oddsProvider = { lines() { return [{ entidade: "p", linha: 1.5, odd_over: 4, odd_under: 1.9, book: "manual" }]; } };
const repo = { async saveAnalysis() {}, async saveLedger() {} };
const analystFn = () => ({ melhor_aposta: null, outras: [], alertas: [] });

describe("analyzeMatch trace", () => {
  it("com diagnostics: reprovado carrega trace finalizado", async () => {
    const out = await analyzeMatch(event, MARKETS.sot!, statsProvider, oddsProvider, repo, { analystFn, diagnostics: true });
    const r = out.reprovados[0] as any;
    expect(r.trace).toBeDefined();
    expect(r.trace.passos.map((p: any) => p.passo)).toContain("comparacao");
  });

  it("sem diagnostics: aprovados não vazam trace", async () => {
    const out = await analyzeMatch(event, MARKETS.sot!, statsProvider, oddsProvider, repo, { analystFn, diagnostics: false });
    for (const c of out.candidatos as any[]) expect(c.trace).toBeUndefined();
    expect(out.reprovados).toEqual([]);
  });
});

describe("match trace minimo", () => {
  it("escanteios: candidato traz trace com esperado_final e comparacao", async () => {
    const sp = {
      async teamRate() { return { mu: 5.2, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 10, concedido_adversario: "n/d", incerteza: "media" }; },
    };
    const op = { lines() { return [{ entidade: "partida", linha: 9.5, odd_over: 1.9, odd_under: 1.9, book: "manual" }]; } };
    const repo = { async saveAnalysis() {}, async saveLedger() {} };
    const ev = { id: "e2", jogo: "A x B", home_team: { id: "H", name: "A" }, away_team: { id: "A2", name: "B" } };
    const out = await analyzeMatch(ev, MARKETS.escanteios!, sp, op, repo, { analystFn: () => ({ melhor_aposta: null, outras: [], alertas: [] }), diagnostics: true });
    const all = [...out.candidatos, ...out.reprovados] as any[];
    expect(all.length).toBeGreaterThan(0);
    const withTrace = all.find((c) => c.trace);
    expect(withTrace).toBeDefined();
    expect(withTrace.trace.passos.map((p: any) => p.passo)).toEqual(
      expect.arrayContaining(["esperado_final", "comparacao"]),
    );
  });

  it("gols (totais): candidato traz trace", async () => {
    const sp = { async teamRates() { return { lambda_for: 1.5, lambda_against: 1.2 }; } };
    const op = { lines() { return [{ entidade: "partida", linha: 2.5, odd_over: 1.9, odd_under: 1.9, book: "manual" }]; } };
    const repo = { async saveAnalysis() {}, async saveLedger() {} };
    const ev = { id: "e4", jogo: "A x B", home_team: { id: "H", name: "A" }, away_team: { id: "A2", name: "B" } };
    const out = await analyzeMatch(ev, MARKETS.gols!, sp, op, repo, { analystFn: () => ({ melhor_aposta: null, outras: [], alertas: [] }), diagnostics: true });
    const all = [...out.candidatos, ...out.reprovados] as any[];
    expect(all.find((c) => c.trace)).toBeDefined();
  });

  it("vitoria (1x2): traz trace PRÓPRIO de resultado (gols esperados → P do desfecho), não over de gols", async () => {
    const sp = { async teamRates() { return { lambda_for: 1.5, lambda_against: 1.2 }; } };
    const op = { lines() { return [{ entidade: "A", linha: 0, odd_over: 2.0, odd_under: null, book: "manual" }]; } };
    const repo = { async saveAnalysis() {}, async saveLedger() {} };
    const ev = { id: "e3", jogo: "A x B", home_team: { id: "H", name: "A" }, away_team: { id: "A2", name: "B" } };
    const out = await analyzeMatch(ev, MARKETS.vitoria!, sp, op, repo, { analystFn: () => ({ melhor_aposta: null, outras: [], alertas: [] }), diagnostics: true });
    const all = [...out.candidatos, ...out.reprovados] as any[];
    expect(all.length).toBeGreaterThan(0);
    const c = all.find((x) => x.trace);
    expect(c).toBeDefined();
    // passos de 1X2, NUNCA a moldura de contagem "probabilidade" de "N ou mais"
    expect(c.trace.passos.map((p: any) => p.passo)).toEqual(
      expect.arrayContaining(["gols_esperados", "probabilidades_1x2", "comparacao"]),
    );
    // o desfecho ("A vencer") aparece no veredito leigo, não "gols a mais"
    expect(c.trace.veredito_leigo).toMatch(/A vencer/);
    expect(c.trace.veredito_leigo).not.toMatch(/ou mais/);
  });
});
