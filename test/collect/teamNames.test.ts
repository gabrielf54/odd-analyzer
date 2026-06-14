import { describe, it, expect } from "vitest";
import { canonicalTeam } from "../../src/collect/teamNames.js";
import { matchEventByName } from "../../src/collect/matchEvent.js";

describe("canonicalTeam", () => {
  it("reduz PT/EN/FR à mesma chave canônica", () => {
    expect(canonicalTeam("Alemanha")).toBe("germany");
    expect(canonicalTeam("Germany")).toBe("germany");
    expect(canonicalTeam("Holanda")).toBe(canonicalTeam("Netherlands"));
    expect(canonicalTeam("Costa do Marfim")).toBe("ivory coast");
    expect(canonicalTeam("Côte d'Ivoire")).toBe("ivory coast");
    expect(canonicalTeam("Japão")).toBe("japan");
  });
  it("nome fora do mapa cai no normalizado (acento-strip) — fail-closed", () => {
    expect(canonicalTeam("Curaçao")).toBe("curacao");
    expect(canonicalTeam("Ecuador")).toBe("ecuador");
  });
});

describe("matchEventByName cross-idioma (Betnacional PT × BSD EN)", () => {
  // lista da Betnacional vem em PT; a BSD pergunta em EN.
  const bet6 = [
    { id: "914873584", home: "Alemanha", away: "Curacao" },
    { id: "914873610", home: "Holanda", away: "Japão" },
    { id: "914873452", home: "Costa do Marfim", away: "Equador" },
  ];
  it("casa Germany×Curaçao (EN) com Alemanha×Curacao (PT)", () => {
    expect(matchEventByName(bet6, "Germany", "Curaçao")?.id).toBe("914873584");
  });
  it("casa Netherlands×Japan (EN) com Holanda×Japão (PT)", () => {
    expect(matchEventByName(bet6, "Netherlands", "Japan")?.id).toBe("914873610");
  });
  it("casa BSD 'Côte d'Ivoire' com Bet6 'Costa do Marfim'", () => {
    expect(matchEventByName(bet6, "Côte d'Ivoire", "Ecuador")?.id).toBe("914873452");
  });
  it("fail-closed: jogo ausente → null", () => {
    expect(matchEventByName(bet6, "Brazil", "Argentina")).toBeNull();
  });
});
