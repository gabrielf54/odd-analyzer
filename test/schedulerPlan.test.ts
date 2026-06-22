import { describe, it, expect } from "vitest";
import { upcomingGames, computeSchedule, filterEngaged, SCHED } from "../src/scheduler/plan.js";

const H = 3600_000, M = 60_000;
const ev = (id: string, home: string, away: string, dateISO: string, league = 27) =>
  ({ id, home_team: home, away_team: away, event_date: dateISO, league_id: league });

describe("upcomingGames", () => {
  const now = new Date("2026-06-22T08:00:00Z");
  it("mantém Copa no horizonte, tira placeholder e fora-de-janela", () => {
    const evs = [
      ev("1", "Argentina", "Áustria", "2026-06-22T14:00:00Z"),  // dentro (6h)
      ev("2", "1K", "2J", "2026-06-22T18:00:00Z"),               // placeholder
      ev("3", "Brasil", "Sérvia", "2026-06-25T14:00:00Z"),       // fora do horizonte (30h)
      ev("4", "Espanha", "Japão", "2026-06-22T06:00:00Z"),       // já começou (antes de now)
    ];
    const g = upcomingGames(evs, now, 30, [27]);
    expect(g.map((x) => x.event_id)).toEqual(["1"]);
    expect(g[0]!.kickoff).toBe("2026-06-22T14:00:00.000Z");
    expect(g[0]!.jogo).toBe("Argentina x Áustria");
  });
  it("filtra por liga quando leagueIds não-vazio", () => {
    const evs = [ev("9", "Time A", "Time B", "2026-06-22T14:00:00Z", 99)];
    expect(upcomingGames(evs, now, 30, [27]).length).toBe(0);
    expect(upcomingGames(evs, now, 30, [99]).length).toBe(1);
  });
  it("ordena por kickoff", () => {
    const evs = [
      ev("a", "X", "Y", "2026-06-22T18:00:00Z"),
      ev("b", "W", "Z", "2026-06-22T12:00:00Z"),
    ];
    expect(upcomingGames(evs, now, 30, [27]).map((x) => x.event_id)).toEqual(["b", "a"]);
  });
});

describe("filterEngaged (só rastreia jogos que o dono buscou)", () => {
  const games = [
    { event_id: "1", jogo: "A x B", kickoff: "2026-06-22T14:00:00Z" },
    { event_id: "2", jogo: "C x D", kickoff: "2026-06-22T18:00:00Z" },
  ];
  it("mantém só os com odds buscadas", () => {
    expect(filterEngaged(games, ["1"]).map((g) => g.event_id)).toEqual(["1"]);
  });
  it("nenhum engajado → vazio", () => {
    expect(filterEngaged(games, [])).toEqual([]);
  });
  it("normaliza tipo (number vs string)", () => {
    expect(filterEngaged(games, [2 as any]).map((g) => g.event_id)).toEqual(["2"]);
  });
});

describe("computeSchedule (marcos por jogo)", () => {
  const kickoff = "2026-06-22T14:00:00Z";
  const K = new Date(kickoff).getTime();
  const game = { event_id: "1", jogo: "Argentina x Áustria", kickoff };

  it("jogo a 8h gera base/deriva/lineup_watch/fechamento nos offsets certos", () => {
    const now = new Date("2026-06-22T06:00:00Z").getTime(); // K-8h
    const jobs = computeSchedule([game], now, SCHED);
    const byMark = Object.fromEntries(jobs.map((j) => [j.mark ?? j.job_type, j.fireAt]));
    expect(byMark["base"]).toBe(K - 6 * H);
    expect(byMark["deriva"]).toBe(K - 3 * H);
    expect(byMark["lineup_watch"]).toBe(K - 90 * M);
    expect(byMark["fechamento"]).toBe(K - 3 * M);
  });

  it("pula marcos já passados (descoberto a K-1h)", () => {
    const now = new Date("2026-06-22T13:00:00Z").getTime(); // K-1h
    const jobs = computeSchedule([game], now, SCHED);
    const marks = jobs.map((j) => j.mark ?? j.job_type);
    expect(marks).not.toContain("base");
    expect(marks).not.toContain("deriva");
    expect(marks).toContain("lineup_watch"); // janela até K-15min ainda aberta → agenda já (max(start, now+1))
    expect(marks).toContain("fechamento");
    const watch = jobs.find((j) => j.job_type === "lineup_watch")!;
    expect(watch.fireAt).toBe(now + 1); // janela já começou → dispara imediatamente
  });

  it("jogo prestes a começar (K-10min): só fechamento, sem watch (janela fechou em K-15min)", () => {
    const now = new Date("2026-06-22T13:50:00Z").getTime(); // K-10min
    const jobs = computeSchedule([game], now, SCHED);
    const marks = jobs.map((j) => j.mark ?? j.job_type);
    expect(marks).not.toContain("lineup_watch");
    expect(marks).toContain("fechamento");
  });

  it("ordena por fireAt", () => {
    const now = new Date("2026-06-22T06:00:00Z").getTime();
    const jobs = computeSchedule([game], now, SCHED);
    const times = jobs.map((j) => j.fireAt);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
