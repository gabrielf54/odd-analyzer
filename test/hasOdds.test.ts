import { describe, it, expect } from "vitest";
import { InMemoryRepo } from "../src/store/repo.js";

describe("hasOdds (engajamento do agendador — só rastreia jogo buscado)", () => {
  it("true só quando o evento tem odds gravadas", () => {
    const repo = new InMemoryRepo();
    expect(repo.hasOdds("e1")).toBe(false);
    repo.saveOdds("e1", [{
      event_id: "e1", entidade: "X", market_type: "sot", linha: 0.5,
      odd_over: 2, odd_under: null, book: "kto", coletado_em: "2026-06-22T00:00:00Z",
    } as any]);
    expect(repo.hasOdds("e1")).toBe(true);
    expect(repo.hasOdds("e2")).toBe(false);
  });
});
