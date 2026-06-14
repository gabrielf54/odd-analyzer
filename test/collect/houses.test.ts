import { describe, it, expect } from "vitest";
import { buildCollectors, type HouseDef } from "../../src/collect/houses.js";
import type { CollectContext } from "../../src/collect/types.js";

const ctx: CollectContext = { event_id: "e1", home: "Germany", away: "Curacao" };

// casa fake (plain): a lista tem 1 jogo; o odds tem 1 linha crua.
const plainHouse: HouseDef = {
  book: "fake", needsBrowser: false,
  listUrl: () => "list", parseList: (d: any) => d.events,
  oddsUrl: (id) => `odds/${id}`,
  parseOdds: (d: any) => d.raws,
};
const browserHouse: HouseDef = { ...plainHouse, book: "fakecf", needsBrowser: true };

const get = async (url: string): Promise<any> => url === "list"
  ? { events: [{ id: "H1", home: "Alemanha", away: "Curacao" }] } // PT → canonicalTeam casa
  : { raws: [{ book: "fake", market_label: "x", entidade: "P", linha_raw: "0,5+", odd_over: 1.5, odd_under: null, subtype: "over_under" }] };

describe("buildCollectors (registry agnóstico)", () => {
  it("resolve o id da casa por nome (crosswalk) e monta o collector", async () => {
    const cs = await buildCollectors(ctx, { plain: get }, { houses: [plainHouse] });
    expect(cs).toHaveLength(1);
    const res = await cs[0]!.collect(ctx);
    expect(res.book).toBe("fake");
    expect(res.raws).toHaveLength(1);
  });

  it("casa needsBrowser sem fetcher de browser → pulada (não quebra)", async () => {
    const cs = await buildCollectors(ctx, { plain: get }, { houses: [browserHouse] });
    expect(cs).toHaveLength(0);
  });

  it("id explícito (override) pula a busca da lista", async () => {
    let listCalls = 0;
    const g = async (url: string) => { if (url === "list") listCalls++; return get(url); };
    const cs = await buildCollectors(ctx, { plain: g }, { houses: [plainHouse], overrides: { fake: "H9" } });
    expect(cs).toHaveLength(1);
    expect(listCalls).toBe(0);
    const res = await cs[0]!.collect(ctx);
    expect(res.raws).toHaveLength(1);
  });

  it("jogo não achado na lista → casa pulada (fail-closed)", async () => {
    const cs = await buildCollectors({ ...ctx, home: "Brazil", away: "Argentina" }, { plain: get }, { houses: [plainHouse] });
    expect(cs).toHaveLength(0);
  });
});
