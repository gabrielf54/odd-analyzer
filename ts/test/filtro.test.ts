import { describe, it, expect } from "vitest";
import { filterCandidates, CORTES_DEFAULT } from "../src/candidates/filtro.js";

const cand = (over: Partial<Record<string, unknown>>) => ({
  edge: 0.05, ev: 0.06, xi_confirmado: true, amostra_jogos: 12, ...over,
});

describe("filterCandidates", () => {
  it("mantém só quem passa edge/ev/xi/amostra e ordena por ev desc", () => {
    const cands = [
      cand({ ev: 0.06 }),
      cand({ ev: 0.10 }),
      cand({ edge: 0.01 }),          // reprovado: edge baixo
      cand({ xi_confirmado: false }), // reprovado: não confirmado
      cand({ amostra_jogos: 5 }),     // reprovado: amostra pequena
    ];
    const out = filterCandidates(cands, CORTES_DEFAULT);
    expect(out).toHaveLength(2);
    expect(out[0]!["ev"]).toBe(0.10); // ordenado desc
  });

  it("lista vazia é resultado válido", () => {
    expect(filterCandidates([cand({ edge: 0.0, ev: 0.0 })], CORTES_DEFAULT)).toEqual([]);
  });
});
