import { describe, it, expect } from "vitest";
import { matchEventByName } from "../../src/collect/matchEvent.js";

// events no shape genérico {id, home, away} (o adapter da casa mapeia o listView pra cá).
const events = [
  { id: "1025862126", home: "Germany", away: "Curacao" },
  { id: "999", home: "Brazil", away: "Morocco" },
];

describe("matchEventByName", () => {
  it("casa pelo nome dos times (ordem normal)", () => {
    const m = matchEventByName(events, "Germany", "Curacao");
    expect(m?.id).toBe("1025862126");
    expect(m!.confianca).toBeGreaterThan(0.9);
  });

  it("casa com ordem invertida (home/away trocados entre as fontes)", () => {
    const m = matchEventByName(events, "Curacao", "Germany");
    expect(m?.id).toBe("1025862126");
  });

  it("tolera acento (normaliza NFKD): 'Curaçao' casa 'Curacao'", () => {
    const m = matchEventByName(events, "Germany", "Curaçao");
    expect(m?.id).toBe("1025862126");
  });

  it("fail-closed: sem match acima do threshold → null (nunca chuta jogo)", () => {
    expect(matchEventByName(events, "Argentina", "Chile")).toBeNull();
    expect(matchEventByName([], "Germany", "Curacao")).toBeNull();
  });
});
