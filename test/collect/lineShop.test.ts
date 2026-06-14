import { describe, it, expect } from "vitest";
import { pickBestPrice } from "../../src/collect/lineShop.js";
import type { ManualOddsLine } from "../../src/manual/schema.js";

const L = (book: string, odd_over: number, o: Partial<ManualOddsLine> = {}): ManualOddsLine => ({
  market_type: "sot", entidade: "Lucas Paqueta", linha: 1.5, odd_over, odd_under: null, book, ...o,
});

// Dados reais da spec §12 (Paquetá over 1.5): Betano 4.7, Superbet 4.55, KTO 6.5, Betnacional 4.2.
describe("pickBestPrice (line shopping)", () => {
  it("4 casas da MESMA linha colapsam em 1 — a de MAIOR odd_over (melhor preço p/ o over)", () => {
    const r = pickBestPrice([L("betano", 4.7), L("superbet", 4.55), L("kto", 6.5), L("betnacional", 4.2)]);
    expect(r).toHaveLength(1);
    expect(r[0]!.book).toBe("kto");
    expect(r[0]!.odd_over).toBe(6.5);
  });

  it("anexa casas_comparadas (todas as casas + odd) p/ a UI dizer 'aposte na casa X'", () => {
    const r = pickBestPrice([L("betano", 4.7), L("kto", 6.5)]);
    expect(r[0]!.casas_comparadas).toHaveLength(2);
    expect(r[0]!.casas_comparadas.map((c) => c.book).sort()).toEqual(["betano", "kto"]);
  });

  it("linhas/jogadores/mercados diferentes NÃO se misturam", () => {
    const r = pickBestPrice([
      L("kto", 6.5, { linha: 1.5 }),
      L("kto", 2.0, { linha: 0.5 }),
      L("kto", 3.0, { entidade: "Vinicius" }),
      L("kto", 3.0, { market_type: "finalizacoes" }),
    ]);
    expect(r).toHaveLength(4);
  });

  it("mantém o odd_under da MESMA casa vencedora (coerência de de-vig por casa)", () => {
    const r = pickBestPrice([
      L("betano", 4.7, { odd_under: 1.2 }),
      L("kto", 6.5, { odd_under: 1.1 }),
    ]);
    expect(r[0]!.book).toBe("kto");
    expect(r[0]!.odd_under).toBe(1.1);
  });

  it("lista vazia → vazia", () => {
    expect(pickBestPrice([])).toEqual([]);
  });
});
