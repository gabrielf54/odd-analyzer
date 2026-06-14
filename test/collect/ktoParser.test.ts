import { describe, it, expect } from "vitest";
import { parseKambi } from "../../src/collect/adapters/kto.js";
import { normalizeCollected } from "../../src/collect/normalizer.js";
import { KTO_TABLE } from "../../src/collect/tables.js";

// Fixture no shape DOCUMENTADO da Kambi (offering /betoffer): odds e line em MILÉSIMOS
// (1780 = 1.78; line 500 = 0.5), criterion.englishLabel = rótulo, participant = jogador.
const fixture = {
  events: [{ id: 999, homeName: "Brasil", awayName: "Marrocos" }],
  betOffers: [
    {
      id: 1, eventId: 999,
      criterion: { id: 1001, englishLabel: "Player Shots on Target" },
      outcomes: [
        { label: "Over", type: "OT_OVER", line: 500, odds: 1780, participant: "Lucas Paqueta" },
        { label: "Under", type: "OT_UNDER", line: 500, odds: 2050, participant: "Lucas Paqueta" },
      ],
    },
    {
      id: 2, eventId: 999,
      criterion: { id: 1002, englishLabel: "Player Fouls" },
      outcomes: [
        { label: "Over", type: "OT_OVER", line: 1500, odds: 2400, participant: "Casemiro" },
      ],
    },
    {
      id: 3, eventId: 999,
      criterion: { id: 2001, englishLabel: "Total Goals" },
      outcomes: [
        { label: "Over", type: "OT_OVER", line: 2500, odds: 1900 },
        { label: "Under", type: "OT_UNDER", line: 2500, odds: 1900 },
      ],
    },
  ],
};

describe("parseKambi (KTO)", () => {
  it("extrai prop de jogador over/under: odds e linha decodificadas dos milésimos", () => {
    const raws = parseKambi(fixture, "kto");
    const sot = raws.find((r) => r.market_label === "Player Shots on Target")!;
    expect(sot.book).toBe("kto");
    expect(sot.entidade).toBe("Lucas Paqueta");
    expect(sot.linha_raw).toBe(0.5);
    expect(sot.odd_over).toBeCloseTo(1.78, 9);
    expect(sot.odd_under).toBeCloseTo(2.05, 9);
    expect(sot.subtype).toBe("over_under");
  });

  it("prop one-sided (só over) vem com odd_under null", () => {
    const raws = parseKambi(fixture, "kto");
    const fouls = raws.find((r) => r.market_label === "Player Fouls")!;
    expect(fouls.entidade).toBe("Casemiro");
    expect(fouls.linha_raw).toBe(1.5);
    expect(fouls.odd_over).toBeCloseTo(2.4, 9);
    expect(fouls.odd_under ?? null).toBeNull();
  });

  it("mercado de partida (sem participant) vira entidade 'partida'", () => {
    const raws = parseKambi(fixture, "kto");
    const gols = raws.find((r) => r.market_label === "Total Goals")!;
    expect(gols.entidade).toBe("partida");
    expect(gols.linha_raw).toBe(2.5);
    expect(gols.odd_over).toBeCloseTo(1.9, 9);
    expect(gols.odd_under).toBeCloseTo(1.9, 9);
  });

  it("3 betOffers → 3 linhas cruas; resiliente a payload vazio", () => {
    expect(parseKambi(fixture, "kto")).toHaveLength(3);
    expect(parseKambi({}, "kto")).toEqual([]);
    expect(parseKambi(null, "kto")).toEqual([]);
  });
});

// SHAPE REAL capturado deslogado na KTO BR (2026-06-14, Alemanha–Curaçao, evento Kambi
// 1025862126). O englishLabel real carrega o sufixo de liquidação "(Settled/Decided using
// Opta data)" (VARIA: "Settled" vs "Decided") e apóstrofo — o parser limpa os dois antes
// do de-para EXATO (cleanKambiLabel), senão a tabela nunca casa.
const realFixture = {
  betOffers: [
    { id: 1, criterion: { englishLabel: "Player's shots on target (Settled using Opta data)" },
      outcomes: [{ label: "Mais", type: "OT_OVER", line: 500, odds: 3700, participant: "Nico Schlotterbeck" }] },
    { id: 2, criterion: { englishLabel: "Player's shots (Settled using Opta data)" },
      outcomes: [{ label: "Mais", type: "OT_OVER", line: 1500, odds: 4600, participant: "Jonathan Tah" }] },
    // "Desarmes completados" = tackles GANHOS (Opta Tackles Won) = nosso settle won_tackle.
    { id: 3, criterion: { englishLabel: "Player tackles (Decided using Opta data)" },
      outcomes: [{ label: "Mais", type: "OT_OVER", line: 500, odds: 1440, participant: "Kai Havertz" }] },
    { id: 4, criterion: { englishLabel: "Player's fouls committed (Settled using Opta data)" },
      outcomes: [{ label: "Mais", type: "OT_OVER", line: 1500, odds: 3550, participant: "Roshon Van Eijma" }] },
    // faltas SOFRIDAS (fouls won) — mercado DIFERENTE; deve ser rejeitado (não modelamos).
    { id: 5, criterion: { englishLabel: "Player's fouls won (Decided using Opta data)" },
      outcomes: [{ label: "Mais", type: "OT_OVER", line: 2500, odds: 3750, participant: "Nick Woltemade" }] },
  ],
};

describe("KTO shape real → parser + de-para (captura 2026-06-14)", () => {
  it("parser limpa o sufixo Opta e o apóstrofo do englishLabel", () => {
    const raws = parseKambi(realFixture, "kto");
    const labels = raws.map((r) => r.market_label).sort();
    expect(labels).toContain("Players shots on target");
    expect(labels).toContain("Player tackles");
    expect(labels).toContain("Players fouls won");
    // nenhum rótulo deve carregar o sufixo de liquidação
    expect(raws.every((r) => !/opta/i.test(r.market_label))).toBe(true);
  });

  it("cadeia parser→normalizeCollected com KTO_TABLE mapeia sot/finalizações/desarmes/faltas", () => {
    const { linhas, linhas_rejeitadas } = normalizeCollected(parseKambi(realFixture, "kto"), KTO_TABLE);
    const byEnt = Object.fromEntries(linhas.map((l) => [l.entidade, l]));
    expect(byEnt["Nico Schlotterbeck"]).toMatchObject({ market_type: "sot", linha: 0.5, odd_over: 3.7 });
    expect(byEnt["Jonathan Tah"]).toMatchObject({ market_type: "finalizacoes", linha: 1.5, odd_over: 4.6 });
    expect(byEnt["Kai Havertz"]).toMatchObject({ market_type: "desarmes", linha: 0.5, odd_over: 1.44 });
    expect(byEnt["Roshon Van Eijma"]).toMatchObject({ market_type: "faltas", linha: 1.5, odd_over: 3.55 });
    // faltas sofridas (Woltemade) NÃO entra — rejeitada com motivo.
    expect(byEnt["Nick Woltemade"]).toBeUndefined();
    const sofridas = linhas_rejeitadas.find((r) => /sofridas|fouls won/i.test(r.motivo));
    expect(sofridas).toBeTruthy();
  });
});
