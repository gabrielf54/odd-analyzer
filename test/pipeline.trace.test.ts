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
