import { describe, it, expect } from "vitest";
import { resultadoFor, settlePlayerRows } from "../src/backtest/settle.js";

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
