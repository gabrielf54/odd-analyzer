import { describe, it, expect } from "vitest";
import { MARKETS, baselineFor, populacaoFor, isValidated, populacaoMotivo, settleField, PLAYER_MARKET_KEYS } from "../src/model/markets.js";

describe("markets", () => {
  it("registry tem os mercados do MVP (faltas + passes inclusas, sem estrela ainda)", () => {
    expect(Object.keys(MARKETS).sort()).toEqual(
      ["desarmes", "escanteios", "faltas", "finalizacoes", "gols", "passes", "sot", "vitoria"]
    );
  });

  it("registry tem 8 mercados", () => {
    expect(Object.keys(MARKETS).length).toBe(8);
  });

  it("passes: diagnóstico (opp_mode none, sem estrela em nenhuma população)", () => {
    const m = MARKETS["passes"]!;
    expect(m.nivel).toBe("jogador");
    expect(m.opp_mode).toBe("none");
    expect(m.settle_field).toBe("total_pass");
    expect(m.stat_field).toBe("total_pass");
    // diagnóstico: calibração reprovou → nunca ganha estrela (nenhuma população)
    expect(isValidated("passes", 84.5, 27)).toBe(false);   // seleção
    expect(isValidated("passes", 84.5, 7171)).toBe(false); // clube
    expect(settleField("passes")).toBe("total_pass");
    expect(PLAYER_MARKET_KEYS).toContain("passes");
  });

  it("faltas: comete fouls, concede was_fouled; validada SÓ em over 0.5 na seleção", () => {
    const m = MARKETS["faltas"]!;
    expect(m.stat_field).toBe("fouls");
    expect(m.concede_field).toBe("was_fouled");
    expect(isValidated("faltas", 0.5, 27)).toBe(true);  // seleção over 0.5 (BrierSkill full +0.033)
    expect(isValidated("faltas", 1.5, 27)).toBe(false); // reprovou
    expect(isValidated("faltas", 2.5, 27)).toBe(false); // reprovou
    expect(isValidated("faltas", 0.5, 9)).toBe(true);   // clube over 0.5 GRADUOU (auditoria 2026-06-11, full +0.063)
  });

  it("sot é nível jogador, contagem, campo shots_on_target", () => {
    const m = MARKETS["sot"]!;
    expect(m.nivel).toBe("jogador");
    expect(m.kind).toBe("contagem");
    expect(m.stat_field).toBe("shots_on_target");
  });

  it("baselineFor: liga de seleção (27=WC2026) usa baseline nacional", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, 27)).toBeCloseTo(4.28, 9);
  });

  it("baselineFor: liga de clube (9) usa baseline de clube", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, 9)).toBeCloseTo(4.55, 9);
  });

  it("baselineFor: league_id inválido cai no baseline de clube", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, null)).toBeCloseTo(4.55, 9);
  });

  it("populacaoFor: seleção (27/31) → selecao; clube (9) e desconhecida (null) → clube", () => {
    expect(populacaoFor(27)).toBe("selecao");
    expect(populacaoFor(31)).toBe("selecao");
    expect(populacaoFor(9)).toBe("clube");
    expect(populacaoFor(null)).toBe("clube");
    expect(populacaoFor("27")).toBe("selecao");
  });
});

describe("isValidated — por população", () => {
  it("seleção (27): finalizações 0.5/1.5; SOT só 0.5; desarme só 0.5 (auditoria 2026-06-11)", () => {
    expect(isValidated("finalizacoes", 0.5, 27)).toBe(true);
    expect(isValidated("finalizacoes", 1.5, 27)).toBe(true);
    expect(isValidated("finalizacoes", 2.5, 27)).toBe(false); // DEMOVIDO (banda -0.094/ECE 0.13)
    expect(isValidated("sot", 0.5, 27)).toBe(true);
    expect(isValidated("sot", 1.5, 27)).toBe(false);
    expect(isValidated("sot", 2.5, 27)).toBe(false);
    expect(isValidated("desarmes", 0.5, 27)).toBe(true);
    expect(isValidated("desarmes", 1.5, 27)).toBe(false); // DEMOVIDO (banda -0.081/ECE 0.13)
    expect(isValidated("desarmes", 2.5, 27)).toBe(false);
  });
  it("clube (9): SOT só 0.5; finalizações todas; desarme/faltas 0.5 (auditoria 2026-06-11)", () => {
    expect(isValidated("sot", 0.5, 9)).toBe(true);
    expect(isValidated("sot", 1.5, 9)).toBe(false);  // DEMOVIDO (legado fantasma, banda -0.32)
    expect(isValidated("sot", 2.5, 9)).toBe(false);  // DEMOVIDO
    expect(isValidated("finalizacoes", 2.5, 9)).toBe(true);
    expect(isValidated("desarmes", 0.5, 9)).toBe(true);  // GRADUOU no clube (full +0.110)
    expect(isValidated("desarmes", 1.5, 9)).toBe(false); // marginal, sem estrela
  });
  it("liga desconhecida → clube", () => {
    expect(isValidated("sot", 0.5, null)).toBe(true);
    expect(isValidated("sot", 1.5, null)).toBe(false);
    expect(isValidated("desarmes", 0.5, null)).toBe(true);
  });
  it("gols/vitória/escanteios: nunca validados", () => {
    expect(isValidated("gols", 2.5, 9)).toBe(false);
    expect(isValidated("escanteios", 9.5, 27)).toBe(false);
  });
});

describe("populacaoMotivo", () => {
  it("texto leigo por população", () => {
    expect(populacaoMotivo("selecao")).toMatch(/sele[çc]ão/i);
    expect(populacaoMotivo("selecao")).toMatch(/0\.5|1\+/);
    expect(populacaoMotivo("clube")).toMatch(/clube/i);
  });
});
