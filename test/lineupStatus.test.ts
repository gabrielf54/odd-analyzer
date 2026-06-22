import { describe, it, expect } from "vitest";
import { lineupStatusFromLineups } from "../src/service.js";

describe("lineupStatusFromLineups (deriva o status da escalação do payload /lineups/)", () => {
  it("lineup_status='confirmed' → confirmed", () => {
    expect(lineupStatusFromLineups({ lineup_status: "confirmed", lineups: {} })).toBe("confirmed");
  });
  it("algum lado marcado confirmed → confirmed", () => {
    expect(lineupStatusFromLineups({ lineups: { home: { confirmed: true, players: [] } } })).toBe("confirmed");
  });
  it("tem jogadores mas não confirmado → predicted", () => {
    expect(lineupStatusFromLineups({ lineups: { home: { team_id: "1", players: [{ id: 1, name: "X" }] } } })).toBe("predicted");
  });
  it("sem escalação → unknown", () => {
    expect(lineupStatusFromLineups({ lineups: {} })).toBe("unknown");
    expect(lineupStatusFromLineups(null)).toBe("unknown");
  });
});
