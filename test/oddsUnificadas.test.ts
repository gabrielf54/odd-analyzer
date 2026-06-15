import { describe, it, expect } from "vitest";
import { buildUnifiedOdds } from "../src/collect/unify.js";
import { InMemoryRepo } from "../src/store/repo.js";
import {
  reprojectUnifiedOdds, unificarOddsService, saveOddsService, deleteOddsService,
} from "../src/service.js";
import type { ManualOddsLine } from "../src/manual/schema.js";

const L = (entidade: string, book: string, odd_over: number, o: Partial<ManualOddsLine> = {}): ManualOddsLine =>
  ({ market_type: "finalizacoes", entidade, linha: 0.5, odd_over, odd_under: null, book, ...o });

describe("buildUnifiedOdds (projeção pura cru → unificado)", () => {
  it("colapsa grafias do mesmo jogador e guarda a MAIOR odd + casas comparadas", () => {
    const { linhas } = buildUnifiedOdds([
      L("Llorente, Marcos", "superbet", 1.12),
      L("Marcos Llorente", "kto", 1.46),
      L("Marcos Llorente", "betnacional", 1.125),
    ], "ev1");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.entidade_norm).toBe("marcos llorente");
    expect(linhas[0]!.odd_over).toBe(1.46);
    expect(linhas[0]!.book).toBe("kto");
    expect(linhas[0]!.casas_comparadas).toHaveLength(3);
  });

  it("marca divergencia + spread_pp quando as casas discordam ≥ limiar", () => {
    const { linhas } = buildUnifiedOdds([
      L("Zubimendi, Martin", "superbet", 1.70, { market_type: "sot" }),
      L("Martin Zubimendi", "betnacional", 2.40, { market_type: "sot" }),
      L("Martín Zubimendi", "kto", 3.60, { market_type: "sot" }),
    ], "ev1");
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.divergencia).toBe(true);
    expect(linhas[0]!.spread_pp).toBeGreaterThan(20);
    expect(linhas[0]!.odd_over).toBe(3.60); // melhor preço = KTO (mais conservadora)
  });

  it("sem divergência → divergencia=false, spread_pp=null", () => {
    const { linhas } = buildUnifiedOdds([
      L("Pedri", "kto", 2.0), L("Pedri", "betnacional", 2.05),
    ], "ev1");
    expect(linhas[0]!.divergencia).toBe(false);
    expect(linhas[0]!.spread_pp).toBeNull();
  });
});

describe("espelho odds_unificadas (service ↔ repo)", () => {
  const rows = [
    { event_id: "ev1", entidade: "Llorente, Marcos", market_type: "finalizacoes", linha: 0.5, odd_over: 1.12, odd_under: null, book: "superbet" },
    { event_id: "ev1", entidade: "Marcos Llorente", market_type: "finalizacoes", linha: 0.5, odd_over: 1.46, odd_under: null, book: "kto" },
  ];

  it("reprojectUnifiedOdds grava o espelho a partir do cru", async () => {
    const repo = new InMemoryRepo();
    repo.saveOdds("ev1", rows);
    const { linhas } = await reprojectUnifiedOdds(repo, "ev1");
    expect(linhas).toHaveLength(1);
    expect(repo.getOddsUnificadas("ev1")).toHaveLength(1);
    expect(repo.getOddsUnificadas("ev1")[0]!.odd_over).toBe(1.46);
  });

  it("saveOddsService re-espelha automaticamente", async () => {
    const repo = new InMemoryRepo();
    await saveOddsService(repo, {
      event_id: "ev1", coletado_em: "2026-06-15T00:00:00Z",
      odds: rows.map((r) => ({ ...r })),
    });
    expect(repo.getOddsUnificadas("ev1")).toHaveLength(1); // 2 cruas → 1 unificada
  });

  it("unificarOddsService devolve o resumo (n_cru → n_unificado)", async () => {
    const repo = new InMemoryRepo();
    repo.saveOdds("ev1", rows);
    const out = await unificarOddsService(repo, "ev1");
    expect(out.n_cru).toBe(2);
    expect(out.n_unificado).toBe(1);
    expect(out.linhas[0]!.book).toBe("kto");
  });

  it("deleteOddsService limpa o espelho junto (apagar tudo → unificada vazia)", async () => {
    const repo = new InMemoryRepo();
    repo.saveOdds("ev1", rows);
    await reprojectUnifiedOdds(repo, "ev1");
    expect(repo.getOddsUnificadas("ev1")).toHaveLength(1);
    await deleteOddsService(repo, "ev1");
    expect(repo.getOddsUnificadas("ev1")).toHaveLength(0);
  });

  it("re-espelhar SUBSTITUI (não acumula linha velha de coleta anterior)", async () => {
    const repo = new InMemoryRepo();
    repo.saveOdds("ev1", rows);
    await reprojectUnifiedOdds(repo, "ev1");
    repo.deleteOdds("ev1");
    repo.saveOdds("ev1", [rows[0]!]); // só 1 casa agora
    await reprojectUnifiedOdds(repo, "ev1");
    const uni = repo.getOddsUnificadas("ev1");
    expect(uni).toHaveLength(1);
    expect(uni[0]!.book).toBe("superbet"); // a única que sobrou, não a KTO antiga
  });
});
