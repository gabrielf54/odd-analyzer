import { describe, it, expect } from "vitest";
import { normalize } from "../src/crosswalk/match.js";
import { computeClosingUpdates } from "../src/backtest/clvCapture.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { capturarFechamentoService } from "../src/service.js";

describe("computeClosingUpdates (CLV automático: aposta logada × odds atuais = fechamento)", () => {
  const bets = [
    { event_id: "e1", jogador: "Pedri", linha: 1.5, market_type: "sot", odd_flag: 2.0 },
    { event_id: "e1", jogador: "Gavi", linha: 0.5, market_type: "desarmes", odd_flag: 1.8 }, // sem odd atual → pula
    { event_id: "e1", jogador: "Rodri", linha: 0.5, market_type: "faltas", odd_flag: null }, // calibração (sem entrada) → pula
  ];
  const odds = [
    { entidade_norm: normalize("Pedri"), market_type: "sot", linha: 1.5, odd_over: 1.8, odd_under: 2.1 },
    { entidade_norm: normalize("Pedri"), market_type: "sot", linha: 2.5, odd_over: 3.5, odd_under: 1.3 }, // linha errada
  ];

  it("casa por (nome normalizado, mercado, linha) e calcula CLV = odd_flag/fechamento − 1", () => {
    const ups = computeClosingUpdates(bets, odds);
    expect(ups.length).toBe(1);
    expect(ups[0]!.jogador).toBe("Pedri");
    expect(ups[0]!.odd_fechamento).toBe(1.8);
    expect(ups[0]!.clv).toBeCloseTo(2.0 / 1.8 - 1, 9); // peguei 2.0, fechou 1.8 → CLV positivo (bati o fechamento)
    expect(ups[0]!.prob_devig_fechamento).toBeGreaterThan(0.4); // fairProbOver(1.8, 2.1)
    expect(ups[0]!.prob_devig_fechamento).toBeLessThan(0.65);
  });

  it("fechamento só-over (sem under) → prob_devig do fechamento = implícita crua", () => {
    const ups = computeClosingUpdates(
      [{ event_id: "e1", jogador: "Pedri", linha: 1.5, market_type: "sot", odd_flag: 2.0 }],
      [{ entidade_norm: normalize("Pedri"), market_type: "sot", linha: 1.5, odd_over: 2.5, odd_under: null }],
    );
    expect(ups[0]!.prob_devig_fechamento).toBeCloseTo(1 / 2.5, 9);
    expect(ups[0]!.clv).toBeCloseTo(2.0 / 2.5 - 1, 9); // peguei 2.0, fechou 2.5 → CLV negativo
  });

  it("aposta sem odd_flag (linha de calibração) e sem match são ignoradas", () => {
    const ups = computeClosingUpdates(bets, []);
    expect(ups).toEqual([]);
  });
});

describe("capturarFechamentoService (fiação: ledger + odds_unificadas → grava fechamento/CLV)", () => {
  it("aplica odd_fechamento, prob_devig_fechamento, clv e fechamento_em na aposta logada", async () => {
    const repo = new InMemoryRepo();
    repo.saveLedger([{ event_id: "e1", jogador: "Pedri", player_id: "1", linha: 1.5, market_type: "sot", odd_flag: 2.0, prob_modelo: 0.6 }]);
    repo.saveOddsUnificadas("e1", [{
      event_id: "e1", entidade_norm: normalize("Pedri"), entidade: "Pedri", market_type: "sot",
      linha: 1.5, odd_over: 1.8, odd_under: 2.1, book: "kto", casas_comparadas: [], divergencia: false,
    } as any]);
    const r = await capturarFechamentoService(repo, "e1");
    expect(r.capturadas).toBe(1);
    expect(r.clv_medio).toBeCloseTo(2.0 / 1.8 - 1, 9);
    const led = repo.getLedger("e1")[0]!;
    expect(led.odd_fechamento).toBe(1.8);
    expect(led.clv).toBeCloseTo(2.0 / 1.8 - 1, 9);
    expect(led.prob_devig_fechamento).toBeGreaterThan(0.4);
    expect(led.fechamento_em).toBeTruthy();
  });

  it("sem apostas casáveis → não grava nada, capturadas=0", async () => {
    const repo = new InMemoryRepo();
    repo.saveLedger([{ event_id: "e1", jogador: "Pedri", linha: 1.5, market_type: "sot", odd_flag: 2.0 }]);
    const r = await capturarFechamentoService(repo, "e1"); // sem odds unificadas
    expect(r.capturadas).toBe(0);
    expect(r.clv_medio).toBeNull();
  });
});
