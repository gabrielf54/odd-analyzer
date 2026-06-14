import { describe, it, expect } from "vitest";
import { clv, InMemoryRepo, SupabaseRepo } from "../src/store/repo.js";

describe("clv", () => {
  it("positivo quando peguei preço melhor que o fechamento", () => {
    expect(clv(2.0, 1.8)).toBeCloseTo(2.0 / 1.8 - 1, 9);
  });
});

describe("InMemoryRepo", () => {
  it("salva e lê análise", () => {
    const r = new InMemoryRepo();
    r.saveAnalysis("e1", { jogo: "A x B" });
    expect(r.getAnalysis("e1")).toEqual({ jogo: "A x B" });
    expect(r.getAnalysis("zzz")).toBeNull();
  });

  it("ledger + updateClosing calcula clv e resultado", () => {
    const r = new InMemoryRepo();
    r.saveLedger([{ event_id: "e1", jogador: "Kaiki", linha: 1.5, market_type: "sot", odd_flag: 2.0 }]);
    r.updateClosing("e1", "Kaiki", 1.5, "sot", 1.8, 1);
    expect(r.ledger[0]!.resultado).toBe(1);
    expect(r.ledger[0]!.clv).toBeCloseTo(2.0 / 1.8 - 1, 9);
  });

  it("snapshotClosing grava clv sem resultado", () => {
    const r = new InMemoryRepo();
    r.saveLedger([{ event_id: "e1", jogador: "Kaiki", linha: 1.5, market_type: "sot", odd_flag: 2.0 }]);
    r.snapshotClosing("e1", "Kaiki", 1.5, "sot", 1.9);
    expect(r.ledger[0]!.clv).toBeCloseTo(2.0 / 1.9 - 1, 9);
    expect(r.ledger[0]!.resultado).toBeUndefined();
  });

  it("saveLedger é idempotente por (event,jogador,linha,market) — re-gravar não duplica", () => {
    const r = new InMemoryRepo();
    const row = { event_id: "e1", jogador: "X", player_id: "1000", linha: 1.5, market_type: "desarmes", odd_flag: 2.0 };
    r.saveLedger([row]);
    r.saveLedger([{ ...row, odd_flag: 2.1 }]); // mesma chave, odd nova
    expect(r.ledger).toHaveLength(1);
    expect(r.ledger[0]!.odd_flag).toBe(2.1);
    expect(r.ledger[0]!.player_id).toBe("1000");
  });

  it("re-gravar NÃO apaga um resultado já liquidado (merge preserva)", () => {
    const r = new InMemoryRepo();
    const row = { event_id: "e1", jogador: "X", linha: 1.5, market_type: "sot", odd_flag: 2.0 };
    r.saveLedger([row]);
    r.settleResult("e1", "X", 1.5, "sot", 1);
    r.saveLedger([{ ...row, odd_flag: 2.2 }]); // re-análise
    expect(r.ledger[0]!.resultado).toBe(1); // preservado
    expect(r.ledger[0]!.odd_flag).toBe(2.2);
  });

  it("settleResult seta resultado sem exigir odd de fechamento", () => {
    const r = new InMemoryRepo();
    r.saveLedger([{ event_id: "e1", jogador: "X", linha: 1.5, market_type: "desarmes", odd_flag: 2.0 }]);
    r.settleResult("e1", "X", 1.5, "desarmes", 1);
    expect(r.ledger[0]!.resultado).toBe(1);
    expect(r.ledger[0]!.odd_fechamento).toBeUndefined();
  });

  it("getLedger devolve só as linhas do evento", () => {
    const r = new InMemoryRepo();
    r.saveLedger([
      { event_id: "e1", jogador: "X", linha: 1.5, market_type: "sot", odd_flag: 2.0 },
      { event_id: "e2", jogador: "Y", linha: 0.5, market_type: "sot", odd_flag: 3.0 },
    ]);
    const rows = r.getLedger("e1");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.jogador).toBe("X");
  });

  it("crosswalk salva e lê", () => {
    const r = new InMemoryRepo();
    r.saveCrosswalk(7, "kaiki", { bsd: "100" }, 0.95);
    expect(r.getCrosswalk(7)!.nome_normalizado).toBe("kaiki");
  });

  it("listCrosswalk devolve overrides {nome_normalizado -> id_canonico}", () => {
    const r = new InMemoryRepo();
    r.saveCrosswalk(20, "cr7", { bet365: "CR7" }, 1.0, true);
    const ov = r.listCrosswalk();
    expect(ov["cr7"]).toBe("20");
  });
});

describe("InMemoryRepo — odds", () => {
  const row = (over: number, extra: Partial<import("../src/store/repo.js").OddsRow> = {}) => ({
    event_id: "e1", entidade: "CR7", market_type: "sot", linha: 0.5,
    odd_over: over, odd_under: null as number | null, book: "bet365",
    coletado_em: "2026-06-10T00:00:00Z", ...extra,
  });

  it("saveOdds insere e getOdds devolve", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5)]);
    const got = r.getOdds("e1");
    expect(got).toHaveLength(1);
    expect(got[0]!.odd_over).toBe(1.5);
    expect(r.getOdds("zzz")).toEqual([]);
  });

  it("saveOdds sobrescreve a mesma PK (event+entidade+market+linha+book)", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5)]);
    r.saveOdds("e1", [row(1.8)]); // mesma PK, odd nova
    const got = r.getOdds("e1");
    expect(got).toHaveLength(1);
    expect(got[0]!.odd_over).toBe(1.8);
  });

  it("saveOdds acumula mercados diferentes sem apagar", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5)]);
    r.saveOdds("e1", [row(2.0, { market_type: "desarmes" })]);
    expect(r.getOdds("e1")).toHaveLength(2);
  });

  it("deleteOdds sem filtro limpa o jogo; com filtro remove 1 linha", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5), row(2.0, { market_type: "desarmes" })]);
    r.deleteOdds("e1", { market_type: "sot" });
    expect(r.getOdds("e1")).toHaveLength(1);
    r.deleteOdds("e1");
    expect(r.getOdds("e1")).toEqual([]);
  });

  it("listOddsEvents resume por event_id", () => {
    const r = new InMemoryRepo();
    r.saveOdds("e1", [row(1.5)]);
    r.saveOdds("e2", [row(1.5, { event_id: "e2" }), row(2.0, { event_id: "e2", market_type: "desarmes" })]);
    const sum = r.listOddsEvents().sort((a, b) => a.event_id.localeCompare(b.event_id));
    expect(sum).toHaveLength(2);
    expect(sum[1]!.total_linhas).toBe(2);
    expect(sum[0]!.ultimo_coletado_em).toBe("2026-06-10T00:00:00Z");
  });
});

describe("SupabaseRepo — getOdds paginação", () => {
  // Fake do PostgREST: .range(from,to) devolve a fatia; .order/.eq/.select encadeiam.
  function fakeClient(allRows: any[]) {
    const builder: any = {
      from: () => builder, select: () => builder, eq: () => builder, order: () => builder,
      range: (from: number, to: number) => Promise.resolve({ data: allRows.slice(from, to + 1), error: null }),
    };
    return builder;
  }
  it("pagina além de 1000 linhas (não corta em silêncio)", async () => {
    const rows = Array.from({ length: 2345 }, (_, i) => ({
      event_id: "e1", entidade: `p${i}`, market_type: "sot", linha: 0.5, odd_over: 1.5, odd_under: null, book: "kto",
    }));
    const repo = new SupabaseRepo(fakeClient(rows));
    expect(await repo.getOdds("e1")).toHaveLength(2345);
  });
  it("uma página parcial encerra (≤1000)", async () => {
    const rows = Array.from({ length: 42 }, (_, i) => ({ event_id: "e1", entidade: `p${i}`, market_type: "sot", linha: 0.5, odd_over: 1.5, odd_under: null, book: "kto" }));
    const repo = new SupabaseRepo(fakeClient(rows));
    expect(await repo.getOdds("e1")).toHaveLength(42);
  });
});
