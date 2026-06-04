import { describe, it, expect } from "vitest";
import {
  windowedRate, assembleMu, filterGamesByScope, expectedMinutes, playerMuFromGames,
} from "../src/model/assemble.js";

type Game = Record<string, unknown>;

describe("assemble", () => {
  it("windowedRate por-jogo (minutesField=null) usa média", () => {
    const games: Game[] = [{ x: 2 }, { x: 4 }, { x: 6 }];
    const r = windowedRate(games, "x");
    expect(r["w3"]).toBeCloseTo((2 + 4 + 6) / 3, 12);
  });

  it("windowedRate per-90 ponderado por minutos", () => {
    const games: Game[] = [
      { x: 1, minutes_played: 90 },
      { x: 2, minutes_played: 45 },
    ];
    const r = windowedRate(games, "x", [3, 5, 10], null, "minutes_played");
    // (1+2)/(90+45)*90 = 2.0
    expect(r["w3"]).toBeCloseTo(2.0, 12);
  });

  it("assembleMu compõe lambda * mults", () => {
    // expectedLambda(1.0, 90)=1.0 ; *1.2*1.1 = 1.32
    expect(assembleMu(1.0, 90, 1.2, 1.1)).toBeCloseTo(1.32, 12);
  });

  it("filterGamesByScope separa seleção/clube pelo team_id alvo", () => {
    const games: Game[] = [
      { team_id: "10", x: 1 }, { team_id: "20", x: 2 },
    ];
    expect(filterGamesByScope(games, "todos", "10")).toHaveLength(2);
    expect(filterGamesByScope(games, "selecao", "10")).toEqual([{ team_id: "10", x: 1 }]);
    expect(filterGamesByScope(games, "clube", "10")).toEqual([{ team_id: "20", x: 2 }]);
  });

  it("expectedMinutes usa a janela recente", () => {
    const games: Game[] = [
      { minutes_played: 90 }, { minutes_played: 80 }, { minutes_played: 70 },
      { minutes_played: 60 }, { minutes_played: 50 },
    ];
    // w5 = média dos 5 = 70
    expect(expectedMinutes(games)).toBeCloseTo(70, 12);
  });

  it("playerMuFromGames devolve mu/raw_rate/shrunk/n ou null", () => {
    const games: Game[] = [
      { shots_on_target: 1, minutes_played: 90 },
      { shots_on_target: 2, minutes_played: 90 },
    ];
    const out = playerMuFromGames(games, "shots_on_target", 0.4, 12.0, 1.0, 1.0, 90.0);
    expect(out).not.toBeNull();
    expect(out!.n).toBe(2);
    expect(typeof out!.mu).toBe("number");

    expect(playerMuFromGames([], "shots_on_target", 0.4, 12.0, 1.0, 1.0)).toBeNull();
  });
});
