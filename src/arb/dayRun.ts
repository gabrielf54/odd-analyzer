// Job "ANALISAR DIA INTEIRO" do módulo de arbitragem: para uma (liga, dia), coleta as
// odds de TODOS os jogos do dia nas casas (serializado — o headless compartilhado não
// tolera concorrência; lição do Stake) e escaneia arbitragem após cada jogo, acumulando
// no job. O registro de jobs é EM MEMÓRIA de propósito: restart perde só a barra de
// progresso — as odds ficam no banco e o re-scan (scanDayOdds) recupera o resultado na
// hora. PURO de I/O: coleta e leitura entram por injeção (DayRunDeps).
// Ver docs/features/arbitragem-surebet/design.md (D6).

import { findArbs, type ArbOpportunity, type ArbOddsRow } from "./surebet.js";

export interface DayJobGame {
  event_id: string;
  jogo: string;
  estado: "aguardando" | "coletando" | "ok" | "erro";
  n_odds: number;
  erro?: string;
}

export type ArbOpportunityComJogo = ArbOpportunity & { jogo: string };

export interface ArbDayJob {
  id: string;
  league_id: string;
  data: string;                       // YYYY-MM-DD (dia no fuso BR)
  total: number;                      // banca por oportunidade (R$)
  estado: "rodando" | "concluido" | "erro";
  criado_em: string;
  jogos: DayJobGame[];
  oportunidades: ArbOpportunityComJogo[];
  erro?: string;
}

/** Dia local BR (America/Sao_Paulo) de um timestamp ISO — o dono opera no fuso BR;
 * "jogos de terça" são os que acontecem terça NO BRASIL, não em UTC. */
export function diaLocalBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // en-CA = YYYY-MM-DD
}

/** Filtra a lista de jogos da liga pelo dia (BR). */
export function matchesOnDay<T extends { data?: string }>(matches: T[], dia: string): T[] {
  return matches.filter((m) => m.data != null && diaLocalBR(m.data) === dia);
}

export interface DayRunDeps {
  /** Coleta as odds do jogo nas casas e grava no banco (coletarOddsService por baixo). */
  collectEvent: (eventId: string) => Promise<{ gravadas: number }>;
  /** Lê o `odds` cru do banco (todas as casas). */
  getOdds: (eventId: string) => Promise<ArbOddsRow[]> | ArbOddsRow[];
}

/** Roda o job: coleta SERIAL jogo a jogo, escaneia após cada um (progresso incremental —
 * o front vê oportunidades pingando antes do fim). Erro num jogo NÃO derruba o dia; e
 * mesmo com coleta falha o scan roda no que já existe no banco. Muta o job in-place
 * (o GET de status lê o mesmo objeto do registro). */
export async function runDayJob(job: ArbDayJob, deps: DayRunDeps): Promise<void> {
  try {
    for (const g of job.jogos) {
      g.estado = "coletando";
      try {
        await deps.collectEvent(g.event_id);
      } catch (e: any) {
        g.estado = "erro";
        g.erro = String(e?.message ?? e);
      }
      try {
        const rows = await deps.getOdds(g.event_id);
        g.n_odds = rows.length;
        const opps: ArbOpportunityComJogo[] = findArbs(rows, { total: job.total })
          .map((o) => ({ ...o, jogo: g.jogo }));
        job.oportunidades = job.oportunidades
          .filter((o) => o.event_id !== g.event_id)
          .concat(opps)
          .sort((a, b) => a.soma_inversos - b.soma_inversos);
        if (g.estado !== "erro") g.estado = "ok";
      } catch (e: any) {
        if (g.estado !== "erro") { g.estado = "erro"; g.erro = String(e?.message ?? e); }
      }
    }
    job.estado = "concluido";
  } catch (e: any) {
    job.estado = "erro";
    job.erro = String(e?.message ?? e);
  }
}

/** Re-scan instantâneo do que JÁ está no banco (sem coletar) — reconferir sem pagar
 * nova coleta. Mesmo motor do job. */
export function scanDayOdds(
  games: { event_id: string; jogo: string; rows: ArbOddsRow[] }[], total: number,
): ArbOpportunityComJogo[] {
  return games
    .flatMap((g) => findArbs(g.rows, { total }).map((o) => ({ ...o, jogo: g.jogo })))
    .sort((a, b) => a.soma_inversos - b.soma_inversos);
}

// ---- Registro de jobs (memória do processo) ----

const jobs = new Map<string, ArbDayJob>();
let seq = 0;

export interface CreateDayJobInput {
  league_id: string;
  data: string;
  total: number;
  jogos: { event_id: string; jogo: string }[];
  /** timestamp de criação (injetável p/ teste). */
  agora: string;
}

export function createDayJob(input: CreateDayJobInput): ArbDayJob {
  const job: ArbDayJob = {
    id: `arb-${++seq}-${input.agora.replace(/\D/g, "").slice(0, 14)}`,
    league_id: input.league_id,
    data: input.data,
    total: input.total,
    estado: "rodando",
    criado_em: input.agora,
    jogos: input.jogos.map((g) => ({ ...g, estado: "aguardando" as const, n_odds: 0 })),
    oportunidades: [],
  };
  jobs.set(job.id, job);
  return job;
}

export function getDayJob(id: string): ArbDayJob | null {
  return jobs.get(id) ?? null;
}

/** Um job por vez: coleta usa headless compartilhado + bate nas casas — dois dias em
 * paralelo dobraria a carga e embolaria a fila. O endpoint devolve 409 se já há um. */
export function hasRunningJob(): boolean {
  for (const j of jobs.values()) if (j.estado === "rodando") return true;
  return false;
}

/** Limpa o registro (só teste). */
export function resetDayJobs(): void {
  jobs.clear();
  seq = 0;
}
