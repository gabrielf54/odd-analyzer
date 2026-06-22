// Núcleo PURO do agendador: descobre jogos elegíveis e calcula a agenda de marcos
// (horário absoluto de disparo) por jogo. Sem I/O, sem timers — só datas e filtros.
// Testável 100%. "enriquecer ≠ poluir": coleta só nos marcos que movem a linha.
const H = 3600_000, M = 60_000;

export interface Game { event_id: string; jogo: string; kickoff: string; }
export type JobType = "collect" | "lineup_watch";
export interface Job {
  event_id: string; jogo: string; job_type: JobType;
  mark: string | null;   // 'base'|'deriva'|'fechamento' (collect) | 'lineup_watch'
  fireAt: number;        // epoch ms absoluto
  kickoff: string;
}

export interface ScheduleConfig {
  baseOffsetH: number; derivaOffsetH: number;
  lineupStartMin: number; lineupEndMin: number; lineupPollMin: number;
  closingOffsetMin: number;
}
export const SCHED: ScheduleConfig = {
  baseOffsetH: 6, derivaOffsetH: 3,
  lineupStartMin: 90, lineupEndMin: 15, lineupPollMin: 10,
  closingOffsetMin: 3,
};

/** Time placeholder de chave (W101, 1K, "3D/3E/3I"…) — sem stats, fora. Espelha o
 *  isPlaceholderTeam do service.ts. */
function isPlaceholder(name: unknown): boolean {
  const s = String(name ?? "").trim();
  if (!s) return true;
  if (s.includes("/")) return true;
  return /^([WL]\d+|\d[A-Za-z]|[A-Za-z]\d)$/.test(s);
}

/** Jogos elegíveis: liga certa, sem placeholder, kickoff em (now, now+horizon]. */
export function upcomingGames(events: any[], now: Date, horizonH: number, leagueIds: number[]): Game[] {
  const t0 = now.getTime(), t1 = t0 + horizonH * H;
  const out: Game[] = [];
  for (const e of events ?? []) {
    const lg = Number(e.league_id);
    if (leagueIds.length && !leagueIds.includes(lg)) continue;
    if (isPlaceholder(e.home_team) || isPlaceholder(e.away_team)) continue;
    const k = e.event_date ?? e.date ?? e.start_time ?? "";
    const t = Date.parse(k);
    if (!Number.isFinite(t) || t <= t0 || t > t1) continue;
    out.push({ event_id: String(e.id), jogo: `${e.home_team} x ${e.away_team}`, kickoff: new Date(t).toISOString() });
  }
  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/** Agenda de marcos por jogo (horário absoluto). Pula marco já passado; o lineup_watch
 *  agenda no início da janela (ou já, se a janela começou), desde que ela não tenha
 *  fechado (K - lineupEndMin). */
export function computeSchedule(games: Game[], now: number, cfg: ScheduleConfig): Job[] {
  const jobs: Job[] = [];
  for (const g of games) {
    const K = new Date(g.kickoff).getTime();
    const mk = (mark: string, fireAt: number) => {
      if (fireAt <= now) return; // marco passado → pula
      jobs.push({ event_id: g.event_id, jogo: g.jogo, job_type: "collect", mark, fireAt, kickoff: g.kickoff });
    };
    mk("base", K - cfg.baseOffsetH * H);
    mk("deriva", K - cfg.derivaOffsetH * H);
    if (K - cfg.lineupEndMin * M > now) { // janela da escalação ainda aberta
      const start = Math.max(K - cfg.lineupStartMin * M, now + 1);
      jobs.push({ event_id: g.event_id, jogo: g.jogo, job_type: "lineup_watch", mark: "lineup_watch", fireAt: start, kickoff: g.kickoff });
    }
    mk("fechamento", K - cfg.closingOffsetMin * M);
  }
  return jobs.sort((a, b) => a.fireAt - b.fireAt);
}
