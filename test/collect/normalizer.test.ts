import { describe, it, expect } from "vitest";
import { parseLinha, normalizeCollected, type RawCollectedLine, type HouseMarketTable } from "../../src/collect/normalizer.js";

// Spec §5.1: N+ = ≥N = over (N−0.5); .5 explícito = over direto; +N / "Mais de N"
// inteiro PURO = ambíguo → null (rejeita). Sempre lado over.
describe("parseLinha", () => {
  it("'N+' (N ou mais) vira over (N−0.5)", () => {
    expect(parseLinha("1+")).toBe(0.5);
    expect(parseLinha("2+")).toBe(1.5);
    expect(parseLinha("3+")).toBe(2.5);
  });

  it("'X,5+' vira over X.5 (vírgula PT)", () => {
    expect(parseLinha("0,5+")).toBe(0.5);
    expect(parseLinha("1,5+")).toBe(1.5);
  });

  it("'+X,5' / 'Mais de X,5' / 'Over X.5' viram over X.5", () => {
    expect(parseLinha("+1,5")).toBe(1.5);
    expect(parseLinha("Mais de 1,5")).toBe(1.5);
    expect(parseLinha("Mais de 2,5")).toBe(2.5);
    expect(parseLinha("Over 2.5")).toBe(2.5);
    expect(parseLinha("Acima de 0,5")).toBe(0.5);
  });

  it("'+N' / 'Mais de N' INTEIRO puro é AMBÍGUO → null", () => {
    expect(parseLinha("+2")).toBeNull();
    expect(parseLinha("Mais de 2")).toBeNull();
    expect(parseLinha("Over 2")).toBeNull();
  });

  it("escada de passes: '30+' vira over 29.5", () => {
    expect(parseLinha("30+")).toBe(29.5);
    expect(parseLinha("25+")).toBe(24.5);
  });

  it("número estruturado .5 (point do JSON) é a própria linha over; inteiro puro → null", () => {
    expect(parseLinha(2.5)).toBe(2.5);
    expect(parseLinha(0.5)).toBe(0.5);
    expect(parseLinha(2)).toBeNull(); // linha cheia (asiática/push) não é over no nosso modelo
  });

  it("lixo / vazio → null", () => {
    expect(parseLinha("")).toBeNull();
    expect(parseLinha("sim")).toBeNull();
    expect(parseLinha(null as unknown as string)).toBeNull();
  });
});

// De-para EXATA por casa (nunca substring: "Chutes a gol" contém "Chutes"). Fail-closed.
const TABELA: HouseMarketTable = {
  "chutes a gol": { market_type: "sot" },
  "finalizacoes no alvo": { market_type: "sot" },
  "finalizacoes": { market_type: "finalizacoes" },
  "desarmes (ganhos)": { market_type: "desarmes" },
  "faltas cometidas": { market_type: "faltas" },
  "faltas sofridas": { reject: "faltas sofridas != mercado faltas (cometidas)" },
};

const raw = (o: Partial<RawCollectedLine>): RawCollectedLine => ({
  book: "kto", market_label: "chutes a gol", entidade: "Lucas Paqueta",
  linha_raw: "2+", odd_over: 4.5, odd_under: null, subtype: "over_under", ...o,
});

describe("normalizeCollected", () => {
  it("rótulo conhecido + linha válida → linha canônica com book e market_type certos", () => {
    const r = normalizeCollected([raw({})], TABELA);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ market_type: "sot", entidade: "Lucas Paqueta", linha: 1.5, odd_over: 4.5, book: "kto" });
    expect(r.linhas_rejeitadas).toHaveLength(0);
  });

  it("não confunde por SUBSTRING: 'Finalizacoes' vira finalizacoes, 'Chutes a gol' vira sot", () => {
    const r = normalizeCollected([
      raw({ market_label: "finalizacoes", linha_raw: "1+" }),
      raw({ market_label: "chutes a gol", linha_raw: "1+" }),
    ], TABELA);
    const byMkt = Object.fromEntries(r.linhas.map((l) => [l.market_type, l]));
    expect(byMkt["finalizacoes"]).toBeTruthy();
    expect(byMkt["sot"]).toBeTruthy();
  });

  it("rótulo NÃO mapeado → rejeita (fail-closed), não adivinha", () => {
    const r = normalizeCollected([raw({ market_label: "Faltas" })], TABELA);
    expect(r.linhas).toHaveLength(0);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/n[ãa]o mapeado/i);
  });

  it("rótulo marcado como reject (faltas sofridas) → rejeita com motivo da casa", () => {
    const r = normalizeCollected([raw({ market_label: "faltas sofridas" })], TABELA);
    expect(r.linhas).toHaveLength(0);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/sofridas/i);
  });

  it("linha ambígua (+2) → rejeita", () => {
    const r = normalizeCollected([raw({ linha_raw: "+2" })], TABELA);
    expect(r.linhas).toHaveLength(0);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/linha/i);
  });

  it("subtipo fora da whitelist (exato/handicap/sgm) → rejeita, nunca vira over", () => {
    for (const sub of ["exact", "handicap", "sgm", "correct_score"]) {
      const r = normalizeCollected([raw({ subtype: sub })], TABELA);
      expect(r.linhas, sub).toHaveLength(0);
      expect(r.linhas_rejeitadas[0]!.motivo, sub).toMatch(/subtipo/i);
    }
  });

  it("odd_over inválida (<=1.01) → rejeita", () => {
    const r = normalizeCollected([raw({ odd_over: 1.0 })], TABELA);
    expect(r.linhas).toHaveLength(0);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/odd/i);
  });

  it("carrega rotulo_cru na linha aceita p/ auditoria", () => {
    const r = normalizeCollected([raw({ market_label: "chutes a gol" })], TABELA);
    expect(r.linhas[0]!.rotulo_cru).toBe("chutes a gol");
  });
});

// 1X2 (subtype "1x2"): linha fixa 0, exige os TRÊS lados (casa=odd_over, fora=odd_under,
// empate=odd_draw) — sem empate não há trava de arbitragem e o de-vig 3-way não fecha.
const TABELA_1X2: HouseMarketTable = { "full time": { market_type: "vitoria" } };
const raw1x2 = (o: Partial<RawCollectedLine>): RawCollectedLine => ({
  book: "kto", market_label: "Full Time", entidade: "partida", linha_raw: 0,
  odd_over: 2.6, odd_under: 2.85, odd_draw: 3.15, subtype: "1x2", ...o,
});

describe("normalizeCollected — 1X2 (odd_draw)", () => {
  it("1x2 completo → linha canônica vitoria com linha 0 e os 3 lados", () => {
    const r = normalizeCollected([raw1x2({})], TABELA_1X2);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({
      market_type: "vitoria", entidade: "partida", linha: 0,
      odd_over: 2.6, odd_under: 2.85, odd_draw: 3.15, book: "kto",
    });
  });

  it("1x2 sem empate (odd_draw ausente) → rejeita", () => {
    const r = normalizeCollected([raw1x2({ odd_draw: null })], TABELA_1X2);
    expect(r.linhas).toHaveLength(0);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/1x2/i);
  });

  it("1x2 sem o lado fora (odd_under ausente) → rejeita", () => {
    const r = normalizeCollected([raw1x2({ odd_under: null })], TABELA_1X2);
    expect(r.linhas).toHaveLength(0);
  });

  it("odd_draw inválida (<=1.01) → rejeita", () => {
    const r = normalizeCollected([raw1x2({ odd_draw: 1.0 })], TABELA_1X2);
    expect(r.linhas).toHaveLength(0);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/odd_draw/i);
  });

  it("mercado over/under comum segue SEM odd_draw (null)", () => {
    const r = normalizeCollected([raw({})], TABELA);
    expect(r.linhas[0]!.odd_draw ?? null).toBeNull();
  });
});
