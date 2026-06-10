import { describe, it, expect } from "vitest";
import { clv, InMemoryRepo } from "../src/store/repo.js";

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
