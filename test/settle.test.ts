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
  it("vitória 3 lados: liquida mandante/empate/visitante pelo sufixo do jogador", () => {
    const tres = [
      { event_id: "e1", jogador: "A x B (1)", linha: 0.5, market_type: "vitoria" },
      { event_id: "e1", jogador: "A x B (X)", linha: 0.5, market_type: "vitoria" },
      { event_id: "e1", jogador: "A x B (2)", linha: 0.5, market_type: "vitoria" },
    ];
    // jogo 1x1 (empate): só o lado (X) bate
    const emp = settleMatchRows(tres, { home_score: 1, away_score: 1 });
    expect(emp.find((r) => r.jogador.endsWith("(1)"))!.resultado).toBe(0);
    expect(emp.find((r) => r.jogador.endsWith("(X)"))!.resultado).toBe(1);
    expect(emp.find((r) => r.jogador.endsWith("(2)"))!.resultado).toBe(0);
    // jogo 0x2 (visitante vence): só o lado (2) bate
    const vis = settleMatchRows(tres, { home_score: 0, away_score: 2 });
    expect(vis.find((r) => r.jogador.endsWith("(1)"))!.resultado).toBe(0);
    expect(vis.find((r) => r.jogador.endsWith("(X)"))!.resultado).toBe(0);
    expect(vis.find((r) => r.jogador.endsWith("(2)"))!.resultado).toBe(1);
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
