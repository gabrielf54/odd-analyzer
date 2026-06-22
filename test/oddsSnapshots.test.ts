import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";

describe("odds_snapshots (histórico imutável de odds)", () => {
  it("append ACRESCENTA (não sobrescreve) e get devolve em ordem de coletado_em", () => {
    const repo = new InMemoryRepo();
    repo.appendOddsSnapshot("e1", [{
      entidade_norm: "pedri", entidade: "Pedri", market_type: "sot", linha: 1.5,
      odd_over: 2.0, odd_under: 1.8, book: "kto", lineup_status: "predicted",
      coletado_em: "2026-06-22T09:00:00Z",
    }]);
    repo.appendOddsSnapshot("e1", [{
      entidade_norm: "pedri", entidade: "Pedri", market_type: "sot", linha: 1.5,
      odd_over: 1.7, odd_under: 2.2, book: "kto", lineup_status: "confirmed",
      coletado_em: "2026-06-22T14:00:00Z",
    }]);
    const snaps = repo.getOddsSnapshots("e1");
    expect(snaps.length).toBe(2); // os DOIS retratos da mesma linha coexistem
    expect(snaps[0]!.coletado_em < snaps[1]!.coletado_em).toBe(true); // ordenado por tempo
    expect(snaps[0]!.odd_over).toBe(2.0);
    expect(snaps[1]!.lineup_status).toBe("confirmed");
  });
});
