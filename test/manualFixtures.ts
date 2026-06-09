/** Client fake mínimo p/ os testes do fluxo manual: 1 jogo, squad de 2 jogadores
 * confirmados, stats que dão mu alto (SOT 3/jogo em 12 jogos). */
export function fakeClient(): any {
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
    async playerStats() {
      const g = Array.from({ length: 12 }, () => ({ shots_on_target: 3, minutes_played: 90 }));
      return { results: g };
    },
    async events() { return { results: [] }; },
    async eventStats() { return { stats: {} }; },
    async eventPlayerStats() { return { player_stats: [] }; },
    async player() { return { name: "x" }; },
  };
}

export const fakeAnalyst = (cands: any[]) => ({ melhor_aposta: null, candidatos_vistos: cands.length });
