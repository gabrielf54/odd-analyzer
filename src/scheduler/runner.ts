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
import type { SchedulerRunRow } from "../store/repo.js";

export interface RunnerDeps {
  discover: () => Promise<Game[]>;
  collect: (eventId: string, mark: string) => Promise<{ retratos: number; lineup_status: string }>;
  lineupStatus: (eventId: string) => Promise<string>;
  forwardLog: () => Promise<any>;
  settle: () => Promise<any>;
  logRun: (row: SchedulerRunRow) => Promise<void> | void;
  recentRuns: () => Promise<SchedulerRunRow[]> | SchedulerRunRow[];
  now: () => number;
  cfg?: Partial<ScheduleConfig>;
}

const DISCOVER_EVERY = 60 * 60_000;     // re-descobre jogos novos da Copa: 1h
const SETTLE_EVERY = 60 * 60_000;       // liquida jogos terminados: 1h
const FORWARD_EVERY = 6 * 60 * 60_000;  // loga previsões dos jogos que vêm: 6h

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class SchedulerRunner {
  private cfg: ScheduleConfig;
  private scheduledKeys = new Set<string>();              // event|mark já agendado nesta sessão
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private intervals = new Set<ReturnType<typeof setInterval>>();
  private jobs: Job[] = [];                                // jobs agendados (p/ status)
  private q: Promise<unknown> = Promise.resolve();         // fila serializada de coletas
  private started = false;

  constructor(private deps: RunnerDeps) {
    this.cfg = { ...SCHED, ...(deps.cfg ?? {}) };
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
      const recent = await this.deps.recentRuns();
      if (recent.some((r) => r.event_id === eventId && r.mark === mark && r.job_type === "collect" && r.status === "ok")) {
        await this.safeLog({ event_id: eventId, jogo, job_type: "collect", mark, status: "pulado", detalhe: { motivo: "já coletado" } });
        return;
      }
    } catch { /* recentRuns falhou → segue e coleta (melhor 1 retrato a mais que nenhum) */ }
    try {
      const r = await this.deps.collect(eventId, mark);
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
      try { curr = await this.deps.lineupStatus(job.event_id); } catch { /* unknown */ }
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
    catch { /* log falhou — segue */ }
  }
}
