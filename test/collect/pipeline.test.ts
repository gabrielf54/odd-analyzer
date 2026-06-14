import { describe, it, expect } from "vitest";
import { collectOdds, normalizeByBook } from "../../src/collect/pipeline.js";
import type { OddsCollector, CollectContext } from "../../src/collect/types.js";
import type { HouseMarketTable, RawCollectedLine } from "../../src/collect/normalizer.js";

// De-para fake (não depende das tabelas reais): isola o teste de composição.
const TABLES: Record<string, HouseMarketTable> = {
  kto: { "chutes a gol": { market_type: "sot" } },
  betano: { "chutes a gol": { market_type: "sot" } },
};
const resolve = (b: string): HouseMarketTable => TABLES[b] ?? {};

const ctx: CollectContext = { event_id: "e1", home: "A", away: "B" };

function fake(book: string, oddOver: number): OddsCollector {
  return {
    book,
    async collect() {
      return { book, raws: [{ book, market_label: "Chutes a gol", entidade: "Wirtz", linha_raw: "1,5+", odd_over: oddOver, odd_under: null, subtype: "over_under" }] };
    },
  };
}
function broken(book: string): OddsCollector {
  return { book, async collect() { return { book, raws: [], erro: "bloqueado" }; } };
}

describe("normalizeByBook", () => {
  it("agrupa por casa e aplica o de-para de CADA uma; rótulo fora da tabela → rejeita", () => {
    const raws: RawCollectedLine[] = [
      { book: "kto", market_label: "Chutes a gol", entidade: "X", linha_raw: "0,5+", odd_over: 1.5, odd_under: null, subtype: "over_under" },
      { book: "betano", market_label: "Mercado Inexistente", entidade: "Y", linha_raw: "0,5+", odd_over: 1.5, odd_under: null, subtype: "over_under" },
    ];
    const r = normalizeByBook(raws, resolve);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ market_type: "sot", book: "kto" });
    expect(r.linhas_rejeitadas).toHaveLength(1);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/n[ãa]o mapeado/i);
  });
});

describe("collectOdds (pipeline)", () => {
  it("normaliza por casa → line shopping (melhor odd) → flag de divergência", async () => {
    // impl 1/1.5=.667 vs 1/2.6=.385 → ~28pp ≥ 20 → flag de revisão.
    const r = await collectOdds([fake("kto", 1.5), fake("betano", 2.6)], ctx, resolve);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ market_type: "sot", entidade: "Wirtz", linha: 1.5, book: "betano", odd_over: 2.6 });
    expect(r.linhas[0]!.casas_comparadas).toHaveLength(2);
    // grava por-casa: as DUAS casas preservadas (a análise re-faz o shopping).
    expect(r.linhas_por_casa).toHaveLength(2);
    expect(r.divergencias).toHaveLength(1);
    expect(r.casas.every((c) => c.ok)).toBe(true);
  });

  it("'pula e avisa': casa que falha não derruba as outras", async () => {
    const r = await collectOdds([fake("kto", 1.8), broken("betano")], ctx, resolve);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]!.book).toBe("kto");
    const betano = r.casas.find((c) => c.book === "betano")!;
    expect(betano.ok).toBe(false);
    expect(betano.erro).toMatch(/bloqueado/);
  });
});
