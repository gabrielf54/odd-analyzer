import type { ReviewResult } from "../src/ai/reviewer.js";

/** Client fake p/ os testes do fluxo manual. Modela honestamente os DOIS
 * namespaces de id da BSD: a escalação (lineups) vem em lineup-id ("10","20"),
 * que dá 404 no playerStats; os stats reais usam stats-id ("1000","2000"). O
 * CrosswalkStatsProvider casa por nome (lineup → stats), igual ao fluxo ao vivo.
 *
 * Times: 100 (casa) tem Kai Havertz; 200 (fora) tem Joshua Kimmich. */
export function fakeClient(): any {
  const STATS = {
    "100": { evId: "g100", statsId: 1000, name: "Kai Havertz" },
    "200": { evId: "g200", statsId: 2000, name: "Joshua Kimmich" },
  } as Record<string, { evId: string; statsId: number; name: string }>;
  const byEv: Record<string, { statsId: number; name: string; teamId: string }> = {
    g100: { statsId: 1000, name: "Kai Havertz", teamId: "100" },
    g200: { statsId: 2000, name: "Joshua Kimmich", teamId: "200" },
  };

  return {
    async getEvent() {
      return {
        id: "e1", home_team: "Germany", away_team: "Scotland",
        home_team_id: "100", away_team_id: "200", league_id: 27,
      };
    },
    async lineups() {
      return {
        lineup_status: "confirmed",
        lineups: {
          home: { team_id: "100", confirmed: true, players: [{ id: "10", name: "Kai Havertz", position: "FW" }] },
          away: { team_id: "200", confirmed: true, players: [{ id: "20", name: "Joshua Kimmich", position: "MF" }] },
        },
      };
    },
    // Jogos finalizados recentes do time (crosswalk + teamConceded + teamRates).
    async events({ team_id }: any = {}) {
      const t = STATS[String(team_id)];
      if (!t) return { results: [] };
      return { results: [{ id: t.evId, home_team_id: String(team_id), away_team_id: "999", home_score: 1, away_score: 1 }] };
    },
    async eventPlayerStats(evId: unknown) {
      const e = byEv[String(evId)];
      if (!e) return { player_stats: [] };
      return { player_stats: [{ player_id: e.statsId, team_id: e.teamId, name: e.name, minutes_played: 90, shots_on_target: 3 }] };
    },
    async player(pid: unknown) {
      const e = Object.values(byEv).find((x) => x.statsId === Number(pid));
      return { name: e?.name ?? "x" };
    },
    // Stats do jogador por stats-id (rate). 12 jogos: 6 finalizações, 3 no alvo
    // (sot por decomposição usa total_shots como base) → mu alto.
    async playerStats() {
      const g = Array.from({ length: 12 }, () => ({ shots_on_target: 3, total_shots: 6, minutes_played: 90 }));
      return { results: g };
    },
    async eventStats() { return { stats: {} }; },
  };
}

// Revisor fake: não chama IA, anexa ia_revisao=null e devolve no shape do reviewer.
export function fakeReviewer(candidatos: any[], _contexto: any): ReviewResult {
  return {
    candidatos: candidatos.map((c) => ({ ...c, ia_revisao: null })),
    ia: { topo_explicacao: null, alertas: ["IA desligada (teste)"] },
  };
}
