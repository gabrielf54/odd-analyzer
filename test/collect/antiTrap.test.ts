import { describe, it, expect } from "vitest";
import { flagDivergences } from "../../src/collect/antiTrap.js";
import type { ManualOddsLine } from "../../src/manual/schema.js";

const L = (book: string, odd_over: number, o: Partial<ManualOddsLine> = {}): ManualOddsLine => ({
  market_type: "sot", entidade: "Lucas Paqueta", linha: 1.5, odd_over, odd_under: null, book, ...o,
});

describe("flagDivergences (detector de armadilha cross-casa)", () => {
  it("dispersão SAUDÁVEL (Paquetá SOT 1.5, gap ~8pp) NÃO é flagada", () => {
    // Betano 4.7 / Superbet 4.55 / KTO 6.5 / Betnacional 4.2 → impl 21/22/15/24% → gap ~8pp
    const flags = flagDivergences([L("betano", 4.7), L("superbet", 4.55), L("kto", 6.5), L("betnacional", 4.2)]);
    expect(flags).toHaveLength(0);
  });

  it("ARMADILHA (Igor Thiago faltas 1.5, gap ~27pp) é flagada p/ REVISÃO", () => {
    // Betano 2.4 (42%) / Superbet 1.47 (68%) / KTO 1.87 (53%) / Betnacional 1.44 (69%) → gap ~27pp
    const flags = flagDivergences([
      L("betano", 2.4, { market_type: "faltas" }),
      L("superbet", 1.47, { market_type: "faltas" }),
      L("kto", 1.87, { market_type: "faltas" }),
      L("betnacional", 1.44, { market_type: "faltas" }),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.market_type).toBe("faltas");
    expect(flags[0]!.spread_pp).toBeGreaterThan(20);
    expect(flags[0]!.books).toHaveLength(4);
    expect(flags[0]!.motivo).toMatch(/revis/i);
  });

  it("uma casa só nunca diverge (precisa de ≥2 p/ comparar)", () => {
    expect(flagDivergences([L("kto", 6.5)])).toHaveLength(0);
  });

  it("threshold é parametrizável (conservador apertado flaga o Paquetá)", () => {
    const flags = flagDivergences([L("betano", 4.7), L("kto", 6.5)], 5);
    expect(flags).toHaveLength(1);
  });

  it("agrupa o mesmo jogador em formatos de nome diferentes entre casas (Superbet 'Last, First' vs KTO)", () => {
    // Superbet "Llorente, Marcos" 1.66 (60%) vs KTO "Marcos Llorente" 3.6 (28%) → ~32pp.
    // Sem normalizar o nome, eram 2 grupos e a divergência passava batida.
    const flags = flagDivergences([
      L("superbet", 1.66, { entidade: "Llorente, Marcos", market_type: "finalizacoes", linha: 1.5 }),
      L("kto", 3.6, { entidade: "Marcos Llorente", market_type: "finalizacoes", linha: 1.5 }),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.books).toHaveLength(2);
    expect(flags[0]!.spread_pp).toBeGreaterThan(20);
  });

  it("lista vazia → vazia", () => {
    expect(flagDivergences([])).toEqual([]);
  });
});
