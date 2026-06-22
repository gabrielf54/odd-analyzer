import { describe, it, expect } from "vitest";
import { resultadoFor, settlePlayerRows, settleMatchRows } from "../src/backtest/settle.js";

describe("resultadoFor", () => {
  it("over: stat real > linha → 1, senão 0", () => {
    expect(resultadoFor({ won_tackle: 3 }, "won_tackle", 1.5)).toBe(1);
    expect(resultadoFor({ won_tackle: 1 }, "won_tackle", 1.5)).toBe(0);
  });
  it("empate na linha inteira não acontece (linhas são .5); campo ausente → 0", () => {
    expect(resultadoFor({}, "won_tackle", 0.5)).toBe(0);
    expect(resultadoFor({ shots_on_target: 2 }, "shots_on_target", 1.5)).toBe(1);
  });
});

describe("settlePlayerRows", () => {
  const ps = [
    { player_id: 1000, won_tackle: 3, total_tackle: 4, shots_on_target: 2 },
    { player_id: 2000, won_tackle: 0, total_tackle: 1, shots_on_target: 0 },
  ];
  it("casa por player_id e liquida pelo settle_field do mercado (desarme=won_tackle)", () => {
    const ledger = [
      { event_id: "e1", jogador: "A", player_id: "1000", linha: 1.5, market_type: "desarmes" },
      { event_id: "e1", jogador: "B", player_id: "2000", linha: 0.5, market_type: "sot" },
    ];
    const out = settlePlayerRows(ledger, ps);
    expect(out).toEqual([
      { event_id: "e1", jogador: "A", linha: 1.5, market_type: "desarmes", resultado: 1 }, // won 3 > 1.5
      { event_id: "e1", jogador: "B", linha: 0.5, market_type: "sot", resultado: 0 },       // sot 0 ! > 0.5
    ]);
  });
  it("sem match (player_id ausente no player-stats) → pula a linha", () => {
    const ledger = [{ event_id: "e1", jogador: "Z", player_id: "9999", linha: 0.5, market_type: "sot" }];
    expect(settlePlayerRows(ledger, ps)).toEqual([]);
  });
  it("poucos minutos (<60) → NÃO liquida: prop pressupõe que o jogador atuou (espelha calib ≥60min)", () => {
    const reserva = [{ player_id: 3000, minutes_played: 16, shots_on_target: 0, total_shots: 0 }];
    const ledger = [{ event_id: "e1", jogador: "Reserva", player_id: "3000", linha: 0.5, market_type: "sot" }];
    expect(settlePlayerRows(ledger, reserva)).toEqual([]);
  });
  it("minutos suficientes (>=60) → liquida normalmente", () => {
    const titular = [{ player_id: 3000, minutes_played: 75, shots_on_target: 2, total_shots: 3 }];
    const ledger = [{ event_id: "e1", jogador: "Titular", player_id: "3000", linha: 0.5, market_type: "sot" }];
    expect(settlePlayerRows(ledger, titular)[0]!.resultado).toBe(1);
  });
});

describe("settleMatchRows (gols/vitória pelo placar)", () => {
  const ledger = [
    { event_id: "e1", jogador: "A x B", linha: 1.5, market_type: "gols" },
    { event_id: "e1", jogador: "A x B", linha: 2.5, market_type: "gols" },
    { event_id: "e1", jogador: "A x B", linha: 3.5, market_type: "gols" },
    { event_id: "e1", jogador: "A x B (1)", linha: 0.5, market_type: "vitoria" },
  ];
  it("jogo 2x1: total 3 → over 1.5/2.5 batem, 3.5 não; mandante venceu → vitória=1", () => {
    const out = settleMatchRows(ledger, { home_score: 2, away_score: 1 });
    expect(out).toEqual([
      { event_id: "e1", jogador: "A x B", linha: 1.5, market_type: "gols", resultado: 1 },
      { event_id: "e1", jogador: "A x B", linha: 2.5, market_type: "gols", resultado: 1 },
      { event_id: "e1", jogador: "A x B", linha: 3.5, market_type: "gols", resultado: 0 },
      { event_id: "e1", jogador: "A x B (1)", linha: 0.5, market_type: "vitoria", resultado: 1 },
    ]);
  });
  it("jogo 0x2: mandante perdeu → vitória=0; total 2 → só over 1.5 bate", () => {
    const out = settleMatchRows(ledger, { home_score: 0, away_score: 2 });
    expect(out.find((r) => r.market_type === "vitoria")!.resultado).toBe(0);
    expect(out.find((r) => r.linha === 1.5)!.resultado).toBe(1);
    expect(out.find((r) => r.linha === 2.5)!.resultado).toBe(0);
  });
  it("sem placar → não liquida nada (degrada)", () => {
    expect(settleMatchRows(ledger, {})).toEqual([]);
    expect(settleMatchRows(ledger, { home_score: 1 })).toEqual([]);
  });
  it("ignora linhas de player prop (só partida)", () => {
    const mixed = [{ event_id: "e1", jogador: "X", player_id: "1", linha: 0.5, market_type: "sot" }];
    expect(settleMatchRows(mixed, { home_score: 1, away_score: 1 })).toEqual([]);
  });
});

describe("settleMatchRows (1X2 — liquida o LADO certo pelo rótulo (1)/(X)/(2))", () => {
  // A vitória loga 3 linhas por jogo (mandante/empate/visitante), distinguidas pelo
  // sufixo do `jogador`. Liquidar TODAS como "mandante venceu?" (bug pré-2026-06-21)
  // marca (2)/(X) com resultado errado e arruína a calibração da vitória.
  const ledger = [
    { event_id: "e1", jogador: "A x B (1)", linha: 0.5, market_type: "vitoria" },
    { event_id: "e1", jogador: "A x B (X)", linha: 0.5, market_type: "vitoria" },
    { event_id: "e1", jogador: "A x B (2)", linha: 0.5, market_type: "vitoria" },
  ];
  it("visitante vence (1x2): só (2) bate", () => {
    const out = settleMatchRows(ledger, { home_score: 1, away_score: 2 });
    const byLado = Object.fromEntries(out.map((r) => [r.jogador, r.resultado]));
    expect(byLado).toEqual({ "A x B (1)": 0, "A x B (X)": 0, "A x B (2)": 1 });
  });
  it("empate (1x1): só (X) bate", () => {
    const out = settleMatchRows(ledger, { home_score: 1, away_score: 1 });
    const byLado = Object.fromEntries(out.map((r) => [r.jogador, r.resultado]));
    expect(byLado).toEqual({ "A x B (1)": 0, "A x B (X)": 1, "A x B (2)": 0 });
  });
  it("mandante vence (2x0): só (1) bate", () => {
    const out = settleMatchRows(ledger, { home_score: 2, away_score: 0 });
    const byLado = Object.fromEntries(out.map((r) => [r.jogador, r.resultado]));
    expect(byLado).toEqual({ "A x B (1)": 1, "A x B (X)": 0, "A x B (2)": 0 });
  });
  it("linha 1X2 sem sufixo (legado) → assume mandante (retrocompat)", () => {
    const legado = [{ event_id: "e1", jogador: "A x B", linha: 0.5, market_type: "vitoria" }];
    expect(settleMatchRows(legado, { home_score: 2, away_score: 0 })[0]!.resultado).toBe(1);
    expect(settleMatchRows(legado, { home_score: 0, away_score: 2 })[0]!.resultado).toBe(0);
  });
});
