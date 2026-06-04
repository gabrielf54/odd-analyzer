import { matchPlayer } from "./match.js";

/** [{id: stats_id, name}] de quem atuou nos últimos `nJogos` finalizados do time.
 * Nome vem de player(id). Dedup por id, preservando ordem. */
export async function construirMapaTime(
  client: any,
  teamId: unknown,
  nJogos = 5,
): Promise<{ id: string; name: string }[]> {
  if (!teamId) return [];
  const tid = String(teamId);
  const evs = await client.events({ team_id: tid, status: "finished", limit: nJogos });
  const results: any[] = Array.isArray(evs?.results) ? evs.results : [];
  const ids: unknown[] = [];
  const vistos = new Set<unknown>();
  for (const ev of results.slice(0, nJogos)) {
    const ps = await client.eventPlayerStats(ev.id);
    const rows: any[] = Array.isArray(ps?.player_stats) ? ps.player_stats : [];
    for (const r of rows) {
      const pid = r.player_id;
      if (pid == null || String(r.team_id) !== tid) continue;
      if (!vistos.has(pid)) { vistos.add(pid); ids.push(pid); }
    }
  }
  const mapa: { id: string; name: string }[] = [];
  for (const pid of ids) {
    let d: any;
    try { d = await client.player(pid); } catch { continue; }
    const nome = d && typeof d === "object" ? d.name : null;
    if (nome) mapa.push({ id: String(pid), name: nome });
  }
  return mapa;
}

/** Troca o `id` de cada jogador da escalação pelo stats-id casado por nome.
 * Preserva os demais campos. Sem match acima do threshold → descarta (fail-closed). */
export function resolver(
  jogadores: any[],
  mapa: { id: string; name: string }[],
  threshold = 0.85,
): any[] {
  const out: any[] = [];
  for (const p of jogadores) {
    const m = matchPlayer(p.name ?? "", mapa, null, threshold);
    if (m === null) continue;
    out.push({ ...p, id: m.id });
  }
  return out;
}
