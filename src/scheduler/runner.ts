// Casca ADAPTER do agendador 24h: o daemon. Descobre jogos, agenda os marcos por kickoff
// (setTimeout), roda varreduras periódicas (setInterval) e EXECUTA, com:
//  • fila serializada de 1 worker p/ TODA coleta (headless compartilhado não tolera
//    page.goto concorrente — lição do go-live dos coletores);
//  • dedup restart-safe via scheduler_runs (não re-coleta marco já feito OK);
//  • erro isolado (1 job falho não derruba o daemon);
//  • diário de bordo (logRun) em cada job.
// Tudo injetado → testável com fakes + fake timers. NÃO toca model/value (gate intacto).
import { computeSchedule, type Game, type Job, type ScheduleConfig, SCHED } from "./plan.js";
import { detectFlip } from "./lineupWatch.js";
import { logWarn } from "../lib/log.js";
import type { SchedulerRunRow } from "../store/repo.js";

export interface RunnerDeps {
  discover: () => Promise<Game[]>;
  collect: (eventId: string, mark: string) => Promise<{ retratos: number; lineup_status: string }>;
  lineupStatus: (eventId: string) => Promise<string>;
  forwardLog: () => Promise<any>;
  settle: () => Promise<any>;
  logRun: (row: SchedulerRunRow) => Promise<void> | void;
  /** dedup restart-safe DIRECIONADO: já coletou OK esse (evento, marco)? (query indexada,
   *  não varre janela recente → confiável mesmo com o diário grande). */
  alreadyCollected: (eventId: string, mark: string) => Promise<boolean> | boolean;
  now: () => number;
  cfg?: Partial<ScheduleConfig>;
  /** teto p/ UMA coleta (default 180s). Sem isso, 1 coleta pendurada trava a fila p/ sempre. */
  collectTimeoutMs?: number;
  /** teto p/ 1 checagem de status da escalação (default 20s). */
  lineupTimeoutMs?: number;
}

const DISCOVER_EVERY = 60 * 60_000;     // re-descobre jogos novos da Copa: 1h
const SETTLE_EVERY = 60 * 60_000;       // liquida jogos terminados: 1h
const FORWARD_EVERY = 6 * 60 * 60_000;  // loga previsões dos jogos que vêm: 6h

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Race da promise contra um timeout que REJEITA. Blinda a fila serializada: uma coleta
 *  que nunca resolve (Playwright/rede travada) não pode bloquear as próximas. Exportado p/
 *  o server.ts envolver a coleta real (garante que o browser headless seja fechado no hang). */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${label} após ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class SchedulerRunner {
  private cfg: ScheduleConfig;
  private scheduledKeys = new Set<string>();              // event|mark já agendado nesta sessão
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();
  private jobs: Job[] = [];                                // jobs agendados (p/ status)
  private q: Promise<unknown> = Promise.resolve();         // fila serializada de coletas
  private started = false;
  private collectTimeoutMs: number;
  private lineupTimeoutMs: number;

  constructor(private deps: RunnerDeps) {
    this.cfg = { ...SCHED, ...(deps.cfg ?? {}) };
    this.collectTimeoutMs = deps.collectTimeoutMs ?? 180_000;
    this.lineupTimeoutMs = deps.lineupTimeoutMs ?? 20_000;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.discoverAndSchedule();
    this.addInterval(setInterval(() => void this.discoverAndSchedule(), DISCOVER_EVERY));
    this.addInterval(setInterval(() => void this.runSweep("forward_log", this.deps.forwardLog), FORWARD_EVERY));
    this.addInterval(setInterval(() => void this.runSweep("settle", this.deps.settle), SETTLE_EVERY));
    void this.runSweep("forward_log", this.deps.forwardLog); // já no boot
    void this.runSweep("settle", this.deps.settle);
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    for (const i of this.intervals) clearInterval(i);
    this.timers.clear(); this.intervals.clear(); this.started = false;
  }

  /** Jogos agendados FUTUROS (p/ o painel/endpoint). Runs vêm do repo, não daqui. */
  status(): { scheduled: Job[] } {
    const now = this.deps.now();
    return { scheduled: this.jobs.filter((j) => j.fireAt > now).sort((a, b) => a.fireAt - b.fireAt) };
  }

  /** Re-roda a descoberta AGORA. Chamado logo após uma busca MANUAL de odds → o jogo
   *  recém-buscado entra no rastreio na hora, sem esperar a varredura horária. */
  kick(): void { if (this.started) void this.discoverAndSchedule(); }

  private addInterval(i: ReturnType<typeof setInterval>) { this.intervals.add(i); }

  private async discoverAndSchedule(): Promise<void> {
    let games: Game[] = [];
    try { games = await this.deps.discover(); }
    catch (e) { await this.safeLog({ job_type: "discover", status: "erro", detalhe: { erro: msg(e) } }); return; }
    await this.safeLog({ job_type: "discover", status: "ok", detalhe: { jogos: games.length } });
    for (const job of computeSchedule(games, this.deps.now(), this.cfg)) {
      const key = `${job.event_id}|${job.mark}`;
      if (this.scheduledKeys.has(key)) continue;
      this.scheduledKeys.add(key);
      this.jobs.push(job);
      const delay = Math.max(0, job.fireAt - this.deps.now());
      const t = setTimeout(() => { this.timers.delete(t); void this.fire(job); }, delay);
      this.timers.add(t);
    }
    // Poda jobs já passados (em execução de semanas, jobs[] cresceria sem limite). Os
    // futuros que importam ficam; o status() já filtra, mas isto limita a memória.
    this.jobs = this.jobs.filter((j) => j.fireAt > this.deps.now());
  }

  private fire(job: Job): void {
    if (job.job_type === "lineup_watch") { this.startWatch(job); return; }
    void this.enqueueCollect(() => this.runCollect(job.event_id, job.jogo, job.mark ?? "base"));
  }

  /** Encadeia em cima da fila → 1 coleta por vez (serializa o headless). Nunca rejeita. */
  private enqueueCollect(fn: () => Promise<void>): Promise<unknown> {
    this.q = this.q.then(fn).catch(() => {});
    return this.q;
  }

  private async runCollect(eventId: string, jogo: string, mark: string): Promise<void> {
    // dedup restart-safe: já coletou OK esse event+mark? então pula (snapshots são
    // append-only — re-coletar não corrompe, mas evita retrato redundante).
    try {
      if (await this.deps.alreadyCollected(eventId, mark)) {
        await this.safeLog({ event_id: eventId, jogo, job_type: "collect", mark, status: "pulado", detalhe: { motivo: "já coletado" } });
        return;
      }
    } catch (e) {
      // dedup falhou (BD intermitente) → segue e coleta (melhor 1 retrato a mais que
      // nenhum), mas LOGA — senão a intermitência fica invisível e gera retrato redundante mudo.
      logWarn("scheduler:dedup", "alreadyCollected falhou — coletando sem dedup", { eventId, mark, erro: msg(e) });
    }
    try {
      const r = await withTimeout(this.deps.collect(eventId, mark), this.collectTimeoutMs, `collect ${eventId}/${mark}`);
      await this.safeLog({ event_id: eventId, jogo, job_type: "collect", mark, status: "ok", detalhe: { retratos: r.retratos, lineup_status: r.lineup_status } });
    } catch (e) {
      await this.safeLog({ event_id: eventId, jogo, job_type: "collect", mark, status: "erro", detalhe: { erro: msg(e) } });
    }
  }

  /** Vigília da escalação: poll do status até virar confirmed (→ 1 coleta 'salto') ou a
   *  janela fechar (K - lineupEndMin). Captura o instante do salto da linha. */
  private startWatch(job: Job): void {
    const K = new Date(job.kickoff).getTime();
    const endAt = K - this.cfg.lineupEndMin * 60_000;
    let prev: string | null = null;
    let done = false;
    let iv: ReturnType<typeof setInterval>;
    const finish = (motivo: string) => {
      if (done) return; done = true;
      clearInterval(iv); this.intervals.delete(iv);
      void this.safeLog({ event_id: job.event_id, jogo: job.jogo, job_type: "lineup_watch", mark: null, status: "pulado", detalhe: { motivo } });
    };
    const poll = async () => {
      if (done) return;
      if (this.deps.now() >= endAt) { finish("janela fechou sem confirmação"); return; }
      let curr = "unknown";
      try { curr = await withTimeout(this.deps.lineupStatus(job.event_id), this.lineupTimeoutMs, `lineup ${job.event_id}`); } catch { /* unknown */ }
      if (detectFlip(prev, curr)) {
        done = true; clearInterval(iv); this.intervals.delete(iv);
        await this.safeLog({ event_id: job.event_id, jogo: job.jogo, job_type: "lineup_watch", mark: "salto", status: "ok", detalhe: { lineup_status: curr } });
        void this.enqueueCollect(() => this.runCollect(job.event_id, job.jogo, "salto"));
        return;
      }
      prev = curr;
    };
    iv = setInterval(() => void poll(), this.cfg.lineupPollMin * 60_000);
    this.intervals.add(iv);
    void poll(); // checa já no início da janela
  }

  private async runSweep(jobType: string, fn: () => Promise<any>): Promise<void> {
    try {
      const out = await fn();
      await this.safeLog({ job_type: jobType, status: "ok", detalhe: out });
    } catch (e) {
      await this.safeLog({ job_type: jobType, status: "erro", detalhe: { erro: msg(e) } });
    }
  }

  /** Grava no diário; NUNCA derruba o daemon se o log falhar. */
  private async safeLog(row: Omit<SchedulerRunRow, "criado_em">): Promise<void> {
    try { await this.deps.logRun({ ...row, criado_em: new Date(this.deps.now()).toISOString() }); }
    catch (e) { logWarn("scheduler:logRun", "falha ao gravar no diário (segue vivo)", { job_type: row.job_type, erro: msg(e) }); }
  }
}
