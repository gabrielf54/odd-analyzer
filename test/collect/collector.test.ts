import { describe, it, expect } from "vitest";
import { collectAll, type OddsCollector } from "../../src/collect/types.js";
import type { RawCollectedLine } from "../../src/collect/normalizer.js";

const ctx = { event_id: "e1", home: "Brasil", away: "Marrocos" };
const rawLine = (book: string): RawCollectedLine => ({
  book, market_label: "chutes a gol", entidade: "Vinicius", linha_raw: "0,5+",
  odd_over: 1.8, odd_under: null, subtype: "over_under",
});

const okCollector = (book: string): OddsCollector => ({
  book, async collect() { return { book, raws: [rawLine(book)] }; },
});
const blockedCollector = (book: string): OddsCollector => ({
  book, async collect() { throw new Error("Cloudflare 403"); },
});

describe("collectAll (orquestração sob demanda — 'pula e avisa', decisão #5)", () => {
  it("roda as casas em paralelo e agrega as linhas das que deram certo", async () => {
    const r = await collectAll([okCollector("kto"), okCollector("betnacional")], ctx);
    expect(r.raws).toHaveLength(2);
    expect(r.casas.every((c) => c.ok)).toBe(true);
  });

  it("uma casa bloqueada NÃO trava as outras — pula, marca erro, segue", async () => {
    const r = await collectAll([okCollector("kto"), blockedCollector("betano")], ctx);
    expect(r.raws).toHaveLength(1);                       // só a que deu certo
    expect(r.raws[0]!.book).toBe("kto");
    const betano = r.casas.find((c) => c.book === "betano")!;
    expect(betano.ok).toBe(false);
    expect(betano.erro).toMatch(/cloudflare|403/i);
    const kto = r.casas.find((c) => c.book === "kto")!;
    expect(kto.ok).toBe(true);
    expect(kto.n).toBe(1);
  });

  it("collector que devolve erro (sem lançar) também é pulado", async () => {
    const softFail: OddsCollector = { book: "superbet", async collect() { return { book: "superbet", raws: [], erro: "sem cobertura" }; } };
    const r = await collectAll([okCollector("kto"), softFail], ctx);
    expect(r.raws).toHaveLength(1);
    expect(r.casas.find((c) => c.book === "superbet")!.ok).toBe(false);
  });

  it("nenhuma casa → vazio, sem lançar", async () => {
    const r = await collectAll([], ctx);
    expect(r.raws).toEqual([]);
    expect(r.casas).toEqual([]);
  });
});
