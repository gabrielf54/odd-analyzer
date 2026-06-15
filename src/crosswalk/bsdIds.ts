import { scoreName } from "./match.js";

/** [{id: stats_id, name}] do elenco do time, p/ crosswalk lineup-id → stats-id por nome.
 * SELEÇÃO: usa `nationalPool(teamId)` (/players?national_team_id=) — o elenco com stats-id
 * e nome DIRETO. Reconstruir de jogos finalizados é raso p/ seleção (o `squad` de seleção
 * vem vazio → props da Copa davam 0 candidatos). CLUBE: nationalPool vem vazio → cai no
 * caminho dos últimos `nGames` finalizados (quem atuou). Dedup por id, preservando ordem. */
export async function buildTeamMap(
  client: any,
  teamId: unknown,
  nGames = 5,
): Promise<{ id: string; name: string; posicao: string }[]> {
  if (!teamId) return [];
  const tid = String(teamId);

  // Fonte primária (seleção): pool nacional — elenco direto, sem reconstruir.
  try {
    const np = await client.nationalPool?.(tid);
    const pool: any[] = Array.isArray(np?.results) ? np.results : [];
    const fromPool: { id: string; name: string; posicao: string }[] = [];
    const seenPool = new Set<string>();
    for (const p of pool) {
      const id = String(p?.id ?? "");
      if (!id || !p?.name || seenPool.has(id)) continue;
      seenPool.add(id);
      fromPool.push({ id, name: p.name, posicao: String(p.position ?? "") });
    }
    if (fromPool.length) return fromPool;
  } catch { /* sem pool nacional (clube/indisponível) → events path abaixo */ }

  // Fonte (clube): quem atuou nos últimos `nGames` finalizados.
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
  const map: { id: string; name: string; posicao: string }[] = [];
  for (const pid of ids) {
    let d: any;
    try { d = await client.player(pid); } catch { continue; }
    const name = d && typeof d === "object" ? d.name : null;
    if (name) map.push({ id: String(pid), name, posicao: String(d.position ?? "") });
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
    // scoreName tolera o nome ABREVIADO da escalação ("J. Kimmich") contra o completo
    // do pool/stats ("Joshua Kimmich") — o Dice de string inteira do matchPlayer não.
    let best: { id: string; name: string } | null = null;
    let score = 0;
    for (const m of map) {
      const s = scoreName(p.name ?? "", m.name);
      if (s > score) { score = s; best = m; }
    }
    if (best == null || score < threshold) continue; // fail-closed
    out.push({ ...p, id: best.id });
  }
  return out;
}
