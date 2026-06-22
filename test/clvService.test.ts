import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";
import { normalize } from "../src/crosswalk/match.js";
import { clvService } from "../src/service.js";

describe("clvService (compõe ledger + snapshots + kickoff → CLV por aposta + resumo)", () => {
  it("casa a aposta aos retratos, segmenta pela escalação e agrega o resumo por mercado", async () => {
    const repo = new InMemoryRepo();
    // aposta flagada às 09:00 (criado_em = entrada)
    repo.saveLedger([{
      event_id: "e1", jogador: "Pedri", player_id: "1", linha: 1.5, market_type: "sot",
      odd_flag: 2.0, prob_modelo: 0.6, criado_em: "2026-06-22T09:00:00Z",
    }]);
    // histórico: 09:00 predicted @2.0 → 14:00 confirmed @1.7
    repo.appendOddsSnapshot("e1", [{
      entidade_norm: normalize("Pedri"), entidade: "Pedri", market_type: "sot", linha: 1.5,
      odd_over: 2.0, odd_under: 1.8, book: "kto", lineup_status: "predicted", coletado_em: "2026-06-22T09:00:00Z",
    }]);
    repo.appendOddsSnapshot("e1", [{
      entidade_norm: normalize("Pedri"), entidade: "Pedri", market_type: "sot", linha: 1.5,
      odd_over: 1.7, odd_under: 2.2, book: "kto", lineup_status: "confirmed", coletado_em: "2026-06-22T14:00:00Z",
    }]);
    const client = { getEvent: async () => ({ id: "e1", event_date: "2026-06-22T15:00:00Z" }) };

    const r = await clvService(client, repo, "e1");
    expect(r.kickoff).toBe("2026-06-22T15:00:00Z");
    expect(r.apostas.length).toBe(1);
    const a = r.apostas[0]!;
    expect(a.jogador).toBe("Pedri");
    expect(a.segmentos.total).toBeCloseTo(2.0 / 1.7 - 1, 9);
    expect(a.segmentos.salto_escalacao).toBeCloseTo(2.0 / 1.7 - 1, 9);
    expect(a.pre_lineup).toBe(false); // já confirmou
    expect(r.resumo_por_mercado.sot!.n).toBe(1);
    expect(r.resumo_por_mercado.sot!.media).toBeCloseTo(2.0 / 1.7 - 1, 9);
  });

  it("aposta sem retrato correspondente é ignorada", async () => {
    const repo = new InMemoryRepo();
    repo.saveLedger([{ event_id: "e1", jogador: "Gavi", linha: 0.5, market_type: "desarmes", odd_flag: 1.8, criado_em: "2026-06-22T09:00:00Z" }]);
    const client = { getEvent: async () => ({ id: "e1", event_date: "2026-06-22T15:00:00Z" }) };
    const r = await clvService(client, repo, "e1");
    expect(r.apostas).toEqual([]);
  });
});
