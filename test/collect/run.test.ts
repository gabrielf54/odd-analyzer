import { describe, it, expect } from "vitest";
import { runCollection } from "../../src/collect/run.js";
import type { HouseDef } from "../../src/collect/houses.js";

// casa fake com book "kto" → o de-para real (KTO_TABLE) mapeia "players shots on target"→sot.
const house: HouseDef = {
  book: "kto", needsBrowser: false,
  listUrl: () => "list", parseList: (d: any) => d.events,
  oddsUrl: (id) => `odds/${id}`,
  parseOdds: () => [{ book: "kto", market_label: "players shots on target", entidade: "Wirtz", linha_raw: "0,5+", odd_over: 1.5, odd_under: null, subtype: "over_under" }],
};
const get = async (url: string): Promise<any> => url.startsWith("odds/")
  ? {} : { events: [{ id: "H1", home: "Germany", away: "Curacao" }] };

const fakeRepo = () => {
  const saved: any[] = [];
  return { saved, async saveOdds(_e: string, rows: any[]) { saved.push(...rows); } };
};

describe("runCollection", () => {
  it("resolve a casa, coleta, normaliza e GRAVA (1 linha sot)", async () => {
    const repo = fakeRepo();
    const r = await runCollection(
      { id: "8295", jogo: "Germany x Curacao", home: "Germany", away: "Curacao" },
      repo, { plain: get }, { houses: [house], coletadoEm: "2026-06-14T00:00:00Z" },
    );
    expect(r.gravadas).toBe(1);
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0]).toMatchObject({ event_id: "8295", market_type: "sot", linha: 0.5, book: "kto", coletado_em: "2026-06-14T00:00:00Z" });
    expect(r.n_line_shop).toBe(1);
  });

  it("--dry: não grava", async () => {
    const repo = fakeRepo();
    const r = await runCollection(
      { id: "8295", home: "Germany", away: "Curacao" },
      repo, { plain: get }, { houses: [house], dry: true },
    );
    expect(r.gravadas).toBe(0);
    expect(repo.saved).toHaveLength(0);
  });

  it("nenhuma casa resolvida → vazio, não grava", async () => {
    const repo = fakeRepo();
    const r = await runCollection(
      { id: "e", home: "Brazil", away: "Argentina" },
      repo, { plain: get }, { houses: [house] },
    );
    expect(r.casas).toHaveLength(0);
    expect(r.gravadas).toBe(0);
  });

  it("casa PULADA no crosswalk vira `puladas` com book+motivo (observabilidade)", async () => {
    // Brazil x Argentina não está na lista (só Germany x Curacao) → kto pulada no crosswalk.
    // Sem isso, a casa some do resultado sem dar rastro (foi o que escondeu o betano).
    const repo = fakeRepo();
    const r = await runCollection(
      { id: "e", home: "Brazil", away: "Argentina" },
      repo, { plain: get }, { houses: [house] },
    );
    expect(r.puladas).toEqual([
      expect.objectContaining({ book: "kto", motivo: expect.stringMatching(/jogo não achado/i) }),
    ]);
  });

  it("casa cujo listUrl FALHA (ex.: 403) vira `puladas` com o motivo do erro", async () => {
    const repo = fakeRepo();
    const boom = async (url: string): Promise<any> => {
      if (url.startsWith("odds/")) return {};
      throw new Error("403 Forbidden");
    };
    const r = await runCollection(
      { id: "e", home: "Germany", away: "Curacao" },
      repo, { plain: boom }, { houses: [house] },
    );
    expect(r.puladas).toEqual([
      expect.objectContaining({ book: "kto", motivo: expect.stringMatching(/lista falhou|403/i) }),
    ]);
  });
});
