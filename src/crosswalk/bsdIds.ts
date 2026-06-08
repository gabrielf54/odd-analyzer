import { matchPlayer } from "./match.js";

/** [{id: stats_id, name}] de quem atuou nos últimos `nJogos` finalizados do time.
 * Nome vem de player(id). Dedup por id, preservando ordem. */
export async function buildTeamMap(
  client: any,
  teamId: unknown,
  nGames = 5,
): Promise<{ id: string; name: string }[]> {
  if (!teamId) return [];
  const tid = String(teamId);
  const evs = await client.events({ team_id: tid, status: "finished", limit: nGames });
  const results: any[] = Array.isArray(evs?.results) ? evs.results : [];
  const ids: unknown[] = [];
  const seen = new Set<unknown>();
  for (const ev of results.slice(0, nGames)) {
    const ps = await client.eventPlayerStats(ev.id);
    const rows: any[] = Array.isArray(ps?.player_stats) ? ps.player_stats : [];
    for (const r of rows) {
      const pid = r.player_id;
      if (pid == null || String(r.team_id) !== tid) continue;
      if (!seen.has(pid)) { seen.add(pid); ids.push(pid); }
    }
  }
  const map: { id: string; name: string }[] = [];
  for (const pid of ids) {
    let d: any;
    try { d = await client.player(pid); } catch { continue; }
    const name = d && typeof d === "object" ? d.name : null;
    if (name) map.push({ id: String(pid), name });
  }
  return map;
}

/** Troca o `id` de cada jogador da escalação pelo stats-id casado por nome.
 * Preserva os demais campos. Sem match acima do threshold → descarta (fail-closed). */
export function resolve(
  players: any[],
  map: { id: string; name: string }[],
  threshold = 0.85,
): any[] {
  const out: any[] = [];
  for (const p of players) {
    const m = matchPlayer(p.name ?? "", map, null, threshold);
    if (m === null) continue;
    out.push({ ...p, id: m.id });
  }
  return out;
}
