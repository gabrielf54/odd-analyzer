import { describe, it, expect } from "vitest";
import { readFileSync, rmSync, existsSync } from "node:fs";
import { formatSnapshotLine, appendOddsSnapshot, type OddsSnapshot } from "../src/odds/snapshotArchive.js";

const snap: OddsSnapshot = {
  ts: "2026-06-16T16:00:00.000Z", fase: "abertura", event_id: "8314", jogo: "France x Senegal",
  odds: { home_win: 1.45, draw: 4.44, away_win: 7.16, over_25_goals: 1.86 },
};

describe("formatSnapshotLine", () => {
  it("serializa a foto em 1 linha JSON estável", () => {
    const line = formatSnapshotLine(snap);
    expect(line).not.toContain("\n");
    const parsed = JSON.parse(line);
    expect(parsed.event_id).toBe("8314");
    expect(parsed.fase).toBe("abertura");
    expect(parsed.odds.home_win).toBe(1.45);
  });
});

describe("appendOddsSnapshot (append-only, cria pasta)", () => {
  const tmp = "tmp/test-odds-snapshots.jsonl";
  it("anexa linhas sem reescrever e cria a pasta", () => {
    if (existsSync(tmp)) rmSync(tmp);
    appendOddsSnapshot(snap, tmp);
    appendOddsSnapshot({ ...snap, fase: "fechamento", ts: "2026-06-16T18:30:00.000Z" }, tmp);
    const lines = readFileSync(tmp, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).fase).toBe("abertura");
    expect(JSON.parse(lines[1]!).fase).toBe("fechamento");
    rmSync(tmp);
  });
});
