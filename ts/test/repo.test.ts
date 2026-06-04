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
    r.saveAnalise("e1", { jogo: "A x B" });
    expect(r.getAnalise("e1")).toEqual({ jogo: "A x B" });
    expect(r.getAnalise("zzz")).toBeNull();
  });

  it("ledger + updateFechamento calcula clv e resultado", () => {
    const r = new InMemoryRepo();
    r.saveLedger([{ event_id: "e1", jogador: "Kaiki", linha: 1.5, market_type: "sot", odd_flag: 2.0 }]);
    r.updateFechamento("e1", "Kaiki", 1.5, "sot", 1.8, 1);
    expect(r.ledger[0]!.resultado).toBe(1);
    expect(r.ledger[0]!.clv).toBeCloseTo(2.0 / 1.8 - 1, 9);
  });

  it("snapshotFechamento grava clv sem resultado", () => {
    const r = new InMemoryRepo();
    r.saveLedger([{ event_id: "e1", jogador: "Kaiki", linha: 1.5, market_type: "sot", odd_flag: 2.0 }]);
    r.snapshotFechamento("e1", "Kaiki", 1.5, "sot", 1.9);
    expect(r.ledger[0]!.clv).toBeCloseTo(2.0 / 1.9 - 1, 9);
    expect(r.ledger[0]!.resultado).toBeUndefined();
  });

  it("crosswalk salva e lê", () => {
    const r = new InMemoryRepo();
    r.saveCrosswalk(7, "kaiki", { bsd: "100" }, 0.95);
    expect(r.getCrosswalk(7)!.nome_normalizado).toBe("kaiki");
  });
});
