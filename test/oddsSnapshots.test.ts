import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";
import { appendSnapshotFromUnified } from "../src/service.js";

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

  it("appendSnapshotFromUnified fotografa as odds unificadas atuais + lineup_status; re-coleta acumula", async () => {
    const repo = new InMemoryRepo();
    const uni = (over: number) => [{
      event_id: "e1", entidade_norm: "pedri", entidade: "Pedri", market_type: "sot",
      linha: 1.5, odd_over: over, odd_under: 1.8, book: "kto", casas_comparadas: [], divergencia: false,
    } as any];
    repo.saveOddsUnificadas("e1", uni(2.0));
    const r1 = await appendSnapshotFromUnified(repo, "e1", "predicted");
    expect(r1.retratos).toBe(1);
    repo.saveOddsUnificadas("e1", uni(1.7)); // odds mudaram (pós-escalação)
    await appendSnapshotFromUnified(repo, "e1", "confirmed");
    const snaps = repo.getOddsSnapshots("e1");
    expect(snaps.length).toBe(2); // histórico acumula, não sobrescreve
    expect(snaps.map((s) => s.lineup_status)).toEqual(["predicted", "confirmed"]);
    expect(snaps.map((s) => s.odd_over)).toEqual([2.0, 1.7]);
  });
});
