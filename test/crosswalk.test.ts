import { describe, it, expect } from "vitest";
import { normalize, matchPlayer } from "../src/crosswalk/match.js";
import { construirMapaTime, resolver } from "../src/crosswalk/bsdIds.js";

describe("crosswalk/match", () => {
  it("normalize remove acento e caixa", () => {
    expect(normalize("Côte d'Ivoire")).toBe("cote d'ivoire");
    expect(normalize("  Kaiki   Fernandes ")).toBe("kaiki fernandes");
  });

  it("matchPlayer casa por similaridade", () => {
    const elenco = [{ id: "7", name: "Kaiki Fernandes" }, { id: "9", name: "João Silva" }];
    const m = matchPlayer("Kaiki Fernandes", elenco, null, 0.8);
    expect(m?.id).toBe("7");
    expect(m?.confianca).toBe(1.0);
  });

  it("matchPlayer fail-closed: sem match acima do threshold → null", () => {
    const elenco = [{ id: "9", name: "João Silva" }];
    expect(matchPlayer("Cristiano Ronaldo", elenco, null, 0.9)).toBeNull();
  });

  it("matchPlayer respeita overrides", () => {
    const elenco = [{ id: "7", name: "Kaiki Fernandes" }];
    const m = matchPlayer("K. Fernandes", elenco, { "K. Fernandes": "7" }, 0.99);
    expect(m?.id).toBe("7");
    expect(m?.confianca).toBe(1.0);
  });
});

describe("crosswalk/bsdIds", () => {
  const client = {
    async events() { return { results: [{ id: "e1" }] }; },
    async eventPlayerStats() {
      return { player_stats: [{ player_id: 100, team_id: "T" }, { player_id: 101, team_id: "T" }] };
    },
    async player(pid: unknown) { return { name: pid === 100 ? "Kaiki Fernandes" : "Joao Silva" }; },
  };

  it("construirMapaTime monta [{id,name}] dedup", async () => {
    const mapa = await construirMapaTime(client, "T", 5);
    expect(mapa).toEqual([
      { id: "100", name: "Kaiki Fernandes" },
      { id: "101", name: "Joao Silva" },
    ]);
  });

  it("resolver troca id da escalação pelo stats-id casado", async () => {
    const mapa = await construirMapaTime(client, "T", 5);
    const escalacao = [{ id: "999", name: "Kaiki Fernandes", team_id: "T", posicao: "DF" }];
    const out = resolver(escalacao, mapa, 0.8);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("100");
    expect(out[0]!.posicao).toBe("DF");
  });

  it("resolver descarta quem não casa (fail-closed)", async () => {
    const mapa = await construirMapaTime(client, "T", 5);
    const escalacao = [{ id: "999", name: "Zinedine Zidane", team_id: "T" }];
    expect(resolver(escalacao, mapa, 0.9)).toEqual([]);
  });
});
