import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";
import { normalize } from "../src/crosswalk/match.js";
import { clvPorMercadoService } from "../src/service.js";

const snap = (jogador: string, market_type: string, linha: number, odd_over: number, lineup_status: string, coletado_em: string) => ({
  entidade_norm: normalize(jogador), entidade: jogador, market_type, linha,
  odd_over, odd_under: null, book: "kto", lineup_status, coletado_em,
});

describe("clvPorMercadoService (todas as apostas → CLV agregado por mercado, entre jogos)", () => {
  it("casa cada aposta aos retratos do SEU evento, agrega o CLV-total por mercado", async () => {
    const repo = new InMemoryRepo();
    repo.saveLedger([
      { event_id: "e1", jogador: "Pedri", linha: 1.5, market_type: "sot", odd_flag: 2.0, resultado: 1, criado_em: "2026-06-22T09:00:00Z" },
      { event_id: "e2", jogador: "Gavi", linha: 0.5, market_type: "sot", odd_flag: 1.8, resultado: 0, criado_em: "2026-06-22T09:00:00Z" },
      { event_id: "e2", jogador: "Rice", linha: 1.5, market_type: "desarmes", odd_flag: 2.2, resultado: 1, criado_em: "2026-06-22T09:00:00Z" },
    ]);
    // e1 / Pedri / sot: 09:00 @2.0 → 14:00 @1.7 ; apito 15:00 → total 2.0/1.7-1
    repo.appendOddsSnapshot("e1", [snap("Pedri", "sot", 1.5, 2.0, "predicted", "2026-06-22T09:00:00Z")]);
    repo.appendOddsSnapshot("e1", [snap("Pedri", "sot", 1.5, 1.7, "confirmed", "2026-06-22T14:00:00Z")]);
    // e2 / Gavi / sot: 10:00 @1.8 → 13:00 @1.5 ; apito 14:00 → total 1.8/1.5-1 = 0.2
    repo.appendOddsSnapshot("e2", [snap("Gavi", "sot", 0.5, 1.8, "predicted", "2026-06-22T10:00:00Z")]);
    repo.appendOddsSnapshot("e2", [snap("Gavi", "sot", 0.5, 1.5, "confirmed", "2026-06-22T13:00:00Z")]);
    // e2 / Rice / desarmes: 11:00 @2.2 → 13:30 @2.0 ; apito 14:00 → total 2.2/2.0-1 = 0.1
    repo.appendOddsSnapshot("e2", [snap("Rice", "desarmes", 1.5, 2.2, "predicted", "2026-06-22T11:00:00Z")]);
    repo.appendOddsSnapshot("e2", [snap("Rice", "desarmes", 1.5, 2.0, "confirmed", "2026-06-22T13:30:00Z")]);

    const kickoffs: Record<string, string> = { e1: "2026-06-22T15:00:00Z", e2: "2026-06-22T14:00:00Z" };
    const client = { getEvent: async (id: string) => ({ id, event_date: kickoffs[id] }) };

    const r = await clvPorMercadoService(client, repo);
    expect(r.por_mercado.map((m) => m.market_type)).toEqual(["desarmes", "sot"]);

    const sot = r.por_mercado.find((m) => m.market_type === "sot")!;
    expect(sot.n).toBe(2);
    expect(sot.clv_medio).toBeCloseTo(((2.0 / 1.7 - 1) + 0.2) / 2, 9);

    const des = r.por_mercado.find((m) => m.market_type === "desarmes")!;
    expect(des.n).toBe(1);
    expect(des.clv_medio).toBeCloseTo(0.1, 9);

    expect(typeof r.limitacao).toBe("string");
    expect(r.limitacao.length).toBeGreaterThan(0);
  });

  it("é DETERMINÍSTICO: o IC (bootstrap) não muda entre chamadas (endpoint de leitura/selo de confiança)", async () => {
    const repo = new InMemoryRepo();
    // 6 apostas com CLVs-total distintos no mesmo mercado → o bootstrap percentila valores
    // variados; sem seed, Math.random faria lo/hi mudar a cada chamada.
    const ledger: any[] = [];
    for (let i = 0; i < 6; i++) {
      const jogador = `J${i}`;
      ledger.push({ event_id: "e1", jogador, linha: 0.5, market_type: "sot", odd_flag: 2.0, resultado: 1, criado_em: "2026-06-22T09:00:00Z" });
      repo.appendOddsSnapshot("e1", [snap(jogador, "sot", 0.5, 2.0 + i * 0.1, "predicted", "2026-06-22T09:00:00Z")]);
      repo.appendOddsSnapshot("e1", [snap(jogador, "sot", 0.5, 1.5 + i * 0.05, "confirmed", "2026-06-22T14:00:00Z")]);
    }
    repo.saveLedger(ledger);
    const client = { getEvent: async () => ({ event_date: "2026-06-22T15:00:00Z" }) };

    const a = await clvPorMercadoService(client, repo);
    const b = await clvPorMercadoService(client, repo);
    expect(a.por_mercado).toEqual(b.por_mercado);
    const sot = a.por_mercado.find((m) => m.market_type === "sot")!;
    expect(sot.n).toBe(6);
    expect(sot.lo).toBeLessThan(sot.hi); // IC não-degenerado (valores distintos)
  });

  it("conta SÓ apostas liquidadas: DNP/jogo não terminado (resultado nulo) fica fora", async () => {
    const repo = new InMemoryRepo();
    repo.saveLedger([
      // liquidada COM resultado 0 (jogou ≥60min, mas não bateu a linha) → ENTRA. Guarda o bug
      // `== null` vs falsy: um filtro `if (!resultado)` derrubaria o 0 por engano.
      { event_id: "e1", jogador: "Pedri", linha: 0.5, market_type: "sot", odd_flag: 2.0, resultado: 0, criado_em: "2026-06-22T09:00:00Z" },
      // não-liquidada (banco/DNP ou jogo não terminado) → fora, mesmo com retrato
      { event_id: "e1", jogador: "Gavi", linha: 0.5, market_type: "sot", odd_flag: 1.8, resultado: null, criado_em: "2026-06-22T09:00:00Z" },
    ]);
    repo.appendOddsSnapshot("e1", [snap("Pedri", "sot", 0.5, 2.0, "predicted", "2026-06-22T09:00:00Z")]);
    repo.appendOddsSnapshot("e1", [snap("Pedri", "sot", 0.5, 1.7, "confirmed", "2026-06-22T14:00:00Z")]);
    repo.appendOddsSnapshot("e1", [snap("Gavi", "sot", 0.5, 1.8, "predicted", "2026-06-22T09:00:00Z")]);
    repo.appendOddsSnapshot("e1", [snap("Gavi", "sot", 0.5, 1.5, "confirmed", "2026-06-22T14:00:00Z")]);
    const client = { getEvent: async () => ({ event_date: "2026-06-22T15:00:00Z" }) };

    const r = await clvPorMercadoService(client, repo);
    const sot = r.por_mercado.find((m) => m.market_type === "sot")!;
    expect(sot.n).toBe(1); // só a Pedri (liquidada, resultado=0); Gavi (resultado nulo) fora
    expect(sot.clv_medio).toBeCloseTo(2.0 / 1.7 - 1, 9);
  });

  it("pula aposta de forwardLog (odd_flag=null) e aposta sem retrato correspondente", async () => {
    const repo = new InMemoryRepo();
    repo.saveLedger([
      { event_id: "e1", jogador: "Brasil", linha: 2.5, market_type: "gols", odd_flag: null, resultado: 1, criado_em: "2026-06-22T09:00:00Z" },
      { event_id: "e1", jogador: "SemRetrato", linha: 0.5, market_type: "sot", odd_flag: 1.9, resultado: 1, criado_em: "2026-06-22T09:00:00Z" },
    ]);
    const client = { getEvent: async (id: string) => ({ id, event_date: "2026-06-22T15:00:00Z" }) };
    const r = await clvPorMercadoService(client, repo);
    expect(r.por_mercado).toEqual([]);
  });
});
