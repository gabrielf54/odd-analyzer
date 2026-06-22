import { logError, logWarn } from "../lib/log.js";
// O tipo da linha unificada mora na camada que a PRODUZ (collect/unify); o store só
// persiste. Re-exporto p/ quem já importa de store/repo (compat) — sem inverter a camada.
import type { UnifiedOddsRow } from "../collect/unify.js";
export type { UnifiedOddsRow };

/** Closing Line Value: positivo = peguei preço melhor que o fechamento. */
export function clv(oddFlag: number, closingOdd: number): number {
  return oddFlag / closingOdd - 1.0;
}

export interface OddsRow {
  event_id: string;
  entidade: string;
  market_type: string;
  linha: number;
  odd_over: number;
  odd_under: number | null;
  book: string;
  coletado_em?: string;
}

/** Retrato IMUTÁVEL de uma odd num instante (histórico p/ CLV/movimento de linha).
 * `lineup_status` = situação da escalação NO momento do retrato (marca a fronteira
 * pré/pós-escalação no tempo). Append-only: nunca atualiza/apaga. */
export interface OddsSnapshotRow {
  entidade_norm: string;
  entidade: string;
  market_type: string;
  linha: number;
  odd_over: number;
  odd_under: number | null;
  book: string;
  lineup_status: string; // 'predicted' | 'confirmed' | 'unknown'
  mark?: string | null;  // marco do agendador: 'base'|'deriva'|'salto'|'fechamento' (null = manual)
  origem?: string;       // 'manual' (botão) | 'scheduler' (agendador 24h)
  coletado_em: string;
}

/** 1 linha do diário de bordo do agendador 24h (tabela scheduler_runs). */
export interface SchedulerRunRow {
  event_id?: string | null;
  jogo?: string | null;
  job_type: string;      // 'collect'|'lineup_watch'|'forward_log'|'settle'|'discover'
  mark?: string | null;  // 'base'|'deriva'|'salto'|'fechamento' p/ coletas (null nas varreduras)
  status: string;        // 'ok'|'erro'|'pulado'
  detalhe?: any;         // {retratos, lineup_status, erro, ...} — formato livre
  criado_em: string;
}

export interface OddsEventSummary {
  event_id: string;
  total_linhas: number;
  ultimo_coletado_em: string | null;
}

export interface ManualResult { result: any; analisado_em: string; }

export interface Repo {
  saveAnalysis(eventId: string, payload: any): Promise<void> | void;
  // Resultado COMPLETO da análise manual (fonte de verdade; o front recupera daqui).
  saveManualResult(eventId: string, result: any, analisadoEm: string): Promise<void> | void;
  getManualResult(eventId: string): Promise<ManualResult | null> | (ManualResult | null);
  // Apaga TODA análise do jogo (deriva das odds → fica órfã quando elas somem).
  deleteAnalysis(eventId: string): Promise<void> | void;
  saveOdds(eventId: string, lines: OddsRow[]): Promise<void> | void;
  getOdds(eventId: string): Promise<OddsRow[]> | OddsRow[];
  // engajamento (agendador): o evento tem odds? query DIRECIONADA (indexada) — não varre a
  // tabela inteira (listOddsEvents estoura o cap de 1000 do Supabase com 56k+ linhas).
  hasOdds(eventId: string): Promise<boolean> | boolean;
  deleteOdds(eventId: string, filter?: Partial<OddsRow>): Promise<void> | void;
  listOddsEvents(): Promise<OddsEventSummary[]> | OddsEventSummary[];
  // odds_unificadas (espelho): saveOddsUnificadas SUBSTITUI todas as linhas do evento.
  saveOddsUnificadas(eventId: string, rows: UnifiedOddsRow[]): Promise<void> | void;
  getOddsUnificadas(eventId: string): Promise<UnifiedOddsRow[]> | UnifiedOddsRow[];
  deleteOddsUnificadas(eventId: string): Promise<void> | void;
  // odds_snapshots (histórico imutável p/ CLV/movimento de linha): append-only.
  appendOddsSnapshot(eventId: string, rows: OddsSnapshotRow[]): Promise<void> | void;
  getOddsSnapshots(eventId: string): Promise<OddsSnapshotRow[]> | OddsSnapshotRow[];
  // scheduler_runs (diário de bordo do agendador 24h): append-only, leitura recente.
  appendSchedulerRun(row: SchedulerRunRow): Promise<void> | void;
  getRecentSchedulerRuns(limit?: number): Promise<SchedulerRunRow[]> | SchedulerRunRow[];
  // dedup DIRECIONADO (restart-safe independente da janela): existe run (event,mark,job,status)?
  hasSchedulerRun(eventId: string, mark: string, jobType: string, status: string): Promise<boolean> | boolean;
  getAnalysis(eventId: string): Promise<any | null> | (any | null);
  saveLedger(rows: any[]): Promise<void> | void;
  getLedger(eventId: string): Promise<any[]> | any[];
  allLedger(): Promise<any[]> | any[];
  updateClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number, resultado: number): Promise<void> | void;
  // Settle só-resultado (player prop não tem odd de fechamento automática na BSD).
  settleResult(eventId: string, jogador: string, linha: number, marketType: string | null, resultado: number): Promise<void> | void;
  saveCrosswalk(canonicalId: number, normalizedName: string, sourceIds: any, confidence: number, manuallyVerified?: boolean): Promise<void> | void;
  getCrosswalk(canonicalId: number): Promise<any | null> | (any | null);
  listCrosswalk(): Promise<Record<string, string>> | Record<string, string>;
  snapshotClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number): Promise<void> | void;
}

export class InMemoryRepo implements Repo {
  analyses = new Map<string, any>();
  manualResults = new Map<string, ManualResult>();
  ledger: any[] = [];
  crosswalk = new Map<number, any>();
  odds = new Map<string, OddsRow[]>();
  oddsUnificadas = new Map<string, UnifiedOddsRow[]>();
  snapshots = new Map<string, OddsSnapshotRow[]>();

  saveAnalysis(eventId: string, payload: any) { this.analyses.set(eventId, payload); }
  getAnalysis(eventId: string) { return this.analyses.get(eventId) ?? null; }
  saveManualResult(eventId: string, result: any, analisadoEm: string) {
    this.manualResults.set(eventId, { result, analisado_em: analisadoEm });
  }
  getManualResult(eventId: string): ManualResult | null { return this.manualResults.get(eventId) ?? null; }
  deleteAnalysis(eventId: string) { this.analyses.delete(eventId); this.manualResults.delete(eventId); }

  private ledgerKey(r: any): string {
    return `${r.event_id}|${r.jogador}|${r.linha}|${r.market_type}`;
  }
  // Upsert idempotente por (event,jogador,linha,market): re-análise do mesmo jogo
  // não duplica e o MERGE preserva campos já gravados (ex.: resultado liquidado).
  saveLedger(rows: any[]) {
    const byKey = new Map(this.ledger.map((r) => [this.ledgerKey(r), r]));
    for (const r of rows) {
      const k = this.ledgerKey(r);
      byKey.set(k, { ...byKey.get(k), ...r });
    }
    this.ledger = [...byKey.values()];
  }
  getLedger(eventId: string): any[] { return this.ledger.filter((r) => r.event_id === eventId); }
  allLedger(): any[] { return this.ledger; }
  settleResult(eventId: string, jogador: string, linha: number, marketType: string | null, resultado: number) {
    for (const row of this.ledger) {
      if (!(row.event_id === eventId && row.jogador === jogador && row.linha === linha)) continue;
      if (marketType != null && row.market_type !== marketType) continue;
      row.resultado = resultado; break;
    }
  }

  private oddsKey(r: OddsRow): string {
    return `${r.entidade}|${r.market_type}|${r.linha}|${r.book}`;
  }

  saveOdds(eventId: string, lines: OddsRow[]) {
    const cur = this.odds.get(eventId) ?? [];
    const byKey = new Map(cur.map((r) => [this.oddsKey(r), r]));
    for (const l of lines) byKey.set(this.oddsKey(l), { ...l, event_id: eventId });
    this.odds.set(eventId, [...byKey.values()]);
  }

  getOdds(eventId: string): OddsRow[] {
    return this.odds.get(eventId) ?? [];
  }

  hasOdds(eventId: string): boolean {
    const r = this.odds.get(eventId);
    return !!r && r.length > 0;
  }

  deleteOdds(eventId: string, filter?: Partial<OddsRow>) {
    if (!filter || Object.keys(filter).length === 0) { this.odds.delete(eventId); return; }
    const cur = this.odds.get(eventId) ?? [];
    const entries = Object.entries(filter);
    this.odds.set(eventId, cur.filter((r) => !entries.every(([k, v]) => (r as any)[k] === v)));
  }

  // Espelho: substitui TODAS as linhas unificadas do evento (lista [] limpa).
  saveOddsUnificadas(eventId: string, rows: UnifiedOddsRow[]) {
    this.oddsUnificadas.set(eventId, rows.map((r) => ({ ...r, event_id: eventId })));
  }
  getOddsUnificadas(eventId: string): UnifiedOddsRow[] { return this.oddsUnificadas.get(eventId) ?? []; }
  deleteOddsUnificadas(eventId: string) { this.oddsUnificadas.delete(eventId); }

  appendOddsSnapshot(eventId: string, rows: OddsSnapshotRow[]) {
    const cur = this.snapshots.get(eventId) ?? [];
    this.snapshots.set(eventId, [...cur, ...rows]);
  }
  getOddsSnapshots(eventId: string): OddsSnapshotRow[] {
    return [...(this.snapshots.get(eventId) ?? [])].sort((a, b) => a.coletado_em.localeCompare(b.coletado_em));
  }

  schedulerRuns: SchedulerRunRow[] = [];
  appendSchedulerRun(row: SchedulerRunRow) { this.schedulerRuns.push(row); }
  getRecentSchedulerRuns(limit = 50): SchedulerRunRow[] {
    return [...this.schedulerRuns].sort((a, b) => b.criado_em.localeCompare(a.criado_em)).slice(0, limit);
  }
  hasSchedulerRun(eventId: string, mark: string, jobType: string, status: string): boolean {
    return this.schedulerRuns.some((r) => r.event_id === eventId && r.mark === mark && r.job_type === jobType && r.status === status);
  }

  listOddsEvents(): OddsEventSummary[] {
    const out: OddsEventSummary[] = [];
    for (const [event_id, rows] of this.odds) {
      const times = rows.map((r) => r.coletado_em ?? "").filter(Boolean).sort();
      out.push({ event_id, total_linhas: rows.length, ultimo_coletado_em: times.length ? times[times.length - 1]! : null });
    }
    return out;
  }

  updateClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number, resultado: number) {
    for (const row of this.ledger) {
      if (!(row.event_id === eventId && row.jogador === jogador && row.linha === linha)) continue;
      if (marketType != null && row.market_type !== marketType) continue;
      row.odd_fechamento = closingOdd;
      row.resultado = resultado;
      row.clv = clv(row.odd_flag, closingOdd);
      break;
    }
  }

  saveCrosswalk(canonicalId: number, normalizedName: string, sourceIds: any, confidence: number, manuallyVerified = false) {
    this.crosswalk.set(canonicalId, {
      id_canonico: canonicalId, nome_normalizado: normalizedName,
      fontes_ids: sourceIds, confianca: confidence, verificado_manual: manuallyVerified,
    });
  }
  getCrosswalk(canonicalId: number) { return this.crosswalk.get(canonicalId) ?? null; }

  listCrosswalk(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of this.crosswalk.values()) out[row.nome_normalizado] = String(row.id_canonico);
    return out;
  }

  snapshotClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number) {
    for (const row of this.ledger) {
      if (!(row.event_id === eventId && row.jogador === jogador && row.linha === linha)) continue;
      if (marketType != null && row.market_type !== marketType) continue;
      row.odd_fechamento = closingOdd;
      row.clv = clv(row.odd_flag, closingOdd);
      break;
    }
  }

}

/** Persiste no Supabase via @supabase/supabase-js. Tabelas em store/schema.sql. */
export class SupabaseRepo implements Repo {
  private client: any;
  constructor(client?: any) {
    if (client == null) {
      // import dinâmico evita carregar supabase-js nos testes que usam InMemoryRepo
      throw new Error("SupabaseRepo requer client (use createSupabaseRepo() p/ montar com env)");
    }
    this.client = client;
  }

  /** Escrita (upsert/update/delete): se o Supabase devolver `error`, LOGA com
   * contexto e RELANÇA — antes o erro era engolido e a linha sumia em silêncio
   * (bug do loop forward, 2026-06-12). Fail-loud. */
  private async mutate(label: string, q: any, ctx?: Record<string, unknown>): Promise<any> {
    const { data, error } = await q;
    if (error) {
      logError(`db:${label}`, error, ctx);
      throw new Error(`${label} falhou: ${error.message ?? error}`);
    }
    return data;
  }

  /** Leitura: se vier `error`, LOGA e devolve o fallback (uma leitura que falha não
   * deve derrubar a requisição inteira — mas não pode mais ser silenciosa). */
  private async query<T>(label: string, q: any, fallback: T, ctx?: Record<string, unknown>): Promise<T> {
    const { data, error } = await q;
    if (error) { logError(`db:${label}`, error, ctx); return fallback; }
    return (data ?? fallback) as T;
  }

  async saveAnalysis(eventId: string, payload: any) {
    await this.mutate("saveAnalysis", this.client.from("analises").upsert({ event_id: eventId, ...payload }), { eventId });
  }

  async saveManualResult(eventId: string, result: any, analisadoEm: string) {
    await this.mutate("saveManualResult", this.client.from("analises").upsert({
      event_id: eventId, market_type: "manual_todos",
      jogo: result?.jogo ?? null, resultado: result, data: analisadoEm,
    }), { eventId });
  }
  async getManualResult(eventId: string): Promise<ManualResult | null> {
    const data = await this.query<any[]>("getManualResult", this.client.from("analises")
      .select("resultado, data").eq("event_id", eventId).eq("market_type", "manual_todos"), [], { eventId });
    const row = data && data.length ? data[0] : null;
    return row && row.resultado ? { result: row.resultado, analisado_em: row.data } : null;
  }
  async deleteAnalysis(eventId: string) {
    // Apaga TODAS as linhas de `analises` do jogo (inclui manual_todos + por-mercado).
    await this.mutate("deleteAnalysis", this.client.from("analises").delete().eq("event_id", eventId), { eventId });
  }

  async saveOdds(eventId: string, lines: OddsRow[]) {
    if (!lines.length) return;
    const rows = lines.map((l) => ({ ...l, event_id: eventId }));
    await this.mutate("saveOdds", this.client.from("odds").upsert(rows, { onConflict: "event_id,entidade,market_type,linha,book" }), { eventId, linhas: rows.length });
  }
  async getOdds(eventId: string): Promise<OddsRow[]> {
    // PostgREST corta em 1000 linhas por padrão. Coleta multi-casa passa de 1000 num só
    // jogo (Betnacional ~587 + KTO + Betano) → linhas sumiam em SILÊNCIO. Pagina com
    // .range() até a página vir incompleta. .order() pela PK p/ paginação determinística.
    const PAGE = 1000;
    const out: OddsRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await this.query<OddsRow[]>(
        "getOdds",
        this.client.from("odds").select("*").eq("event_id", eventId)
          .order("entidade").order("market_type").order("linha").order("book")
          .range(from, from + PAGE - 1),
        [], { eventId, from },
      );
      out.push(...page);
      if (page.length < PAGE) break;
    }
    return out;
  }
  async hasOdds(eventId: string): Promise<boolean> {
    const data = await this.query<any[]>("hasOdds",
      this.client.from("odds").select("event_id").eq("event_id", eventId).limit(1), []);
    return Array.isArray(data) && data.length > 0;
  }
  async deleteOdds(eventId: string, filter?: Partial<OddsRow>) {
    let q = this.client.from("odds").delete().eq("event_id", eventId);
    for (const [k, v] of Object.entries(filter ?? {})) q = q.eq(k, v);
    await this.mutate("deleteOdds", q, { eventId, filter });
  }

  // Espelho canônico: SUBSTITUI todas as linhas do evento (delete + insert) — nunca
  // upsert parcial, p/ não deixar lixo de uma coleta anterior. [] só limpa.
  // CONCORRÊNCIA: delete+insert NÃO é atômico. Dois reprojects do MESMO evento em
  // paralelo poderiam colidir (uso single-operador → não ocorre; e o próximo reproject
  // se auto-cura). Se virar multiusuário, envolver numa transação/RPC.
  async saveOddsUnificadas(eventId: string, rows: UnifiedOddsRow[]) {
    await this.deleteOddsUnificadas(eventId);
    if (!rows.length) return;
    const out = rows.map((r) => ({ ...r, event_id: eventId }));
    await this.mutate("saveOddsUnificadas", this.client.from("odds_unificadas").insert(out), { eventId, linhas: out.length });
  }
  async getOddsUnificadas(eventId: string): Promise<UnifiedOddsRow[]> {
    const PAGE = 1000;
    const out: UnifiedOddsRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await this.query<UnifiedOddsRow[]>(
        "getOddsUnificadas",
        this.client.from("odds_unificadas").select("*").eq("event_id", eventId)
          .order("entidade_norm").order("market_type").order("linha")
          .range(from, from + PAGE - 1),
        [], { eventId, from },
      );
      out.push(...page);
      if (page.length < PAGE) break;
    }
    return out;
  }
  async deleteOddsUnificadas(eventId: string) {
    await this.mutate("deleteOddsUnificadas", this.client.from("odds_unificadas").delete().eq("event_id", eventId), { eventId });
  }

  async appendOddsSnapshot(eventId: string, rows: OddsSnapshotRow[]) {
    if (!rows.length) return;
    const out = rows.map((r) => ({ ...r, event_id: eventId }));
    await this.mutate("appendOddsSnapshot", this.client.from("odds_snapshots").insert(out), { eventId, linhas: out.length });
  }
  async getOddsSnapshots(eventId: string): Promise<OddsSnapshotRow[]> {
    const PAGE = 1000;
    const out: OddsSnapshotRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const page = await this.query<OddsSnapshotRow[]>(
        "getOddsSnapshots",
        this.client.from("odds_snapshots").select("*").eq("event_id", eventId)
          .order("coletado_em").range(from, from + PAGE - 1),
        [], { eventId, from },
      );
      out.push(...page);
      if (page.length < PAGE) break;
    }
    return out;
  }
  async appendSchedulerRun(row: SchedulerRunRow) {
    await this.mutate("appendSchedulerRun", this.client.from("scheduler_runs").insert(row), { job: row.job_type, status: row.status });
  }
  async getRecentSchedulerRuns(limit = 50): Promise<SchedulerRunRow[]> {
    return this.query<SchedulerRunRow[]>("getRecentSchedulerRuns",
      this.client.from("scheduler_runs").select("*").order("criado_em", { ascending: false }).limit(limit), []);
  }
  async hasSchedulerRun(eventId: string, mark: string, jobType: string, status: string): Promise<boolean> {
    // query DIRECIONADA (usa o índice por event_id) — não varre 200 linhas; dedup confiável
    // mesmo depois que o diário cresce além da janela recente (restart-safe de verdade).
    const data = await this.query<any[]>("hasSchedulerRun",
      this.client.from("scheduler_runs").select("id")
        .eq("event_id", eventId).eq("mark", mark).eq("job_type", jobType).eq("status", status).limit(1), []);
    return Array.isArray(data) && data.length > 0;
  }
  async listOddsEvents(): Promise<OddsEventSummary[]> {
    const data = await this.query<any[]>("listOddsEvents", this.client.from("odds").select("event_id, coletado_em"), []);
    const map = new Map<string, { total: number; last: string | null }>();
    for (const r of data) {
      const cur = map.get(r.event_id) ?? { total: 0, last: null };
      cur.total++;
      if (r.coletado_em && (!cur.last || r.coletado_em > cur.last)) cur.last = r.coletado_em;
      map.set(r.event_id, cur);
    }
    return [...map].map(([event_id, v]) => ({ event_id, total_linhas: v.total, ultimo_coletado_em: v.last }));
  }
  async getAnalysis(eventId: string) {
    const data = await this.query<any[]>("getAnalysis", this.client.from("analises").select("*").eq("event_id", eventId), [], { eventId });
    return data && data.length ? data[0] : null;
  }
  async saveLedger(rows: any[]) {
    if (!rows.length) return;
    // DEDUP in-batch por chave (event,jogador,linha,market): o upsert do Postgres
    // recusa atualizar a MESMA linha 2x no mesmo comando ("ON CONFLICT DO UPDATE
    // command cannot affect row a second time"). Last-wins, igual ao InMemoryRepo —
    // blinda contra qualquer bug upstream que gere chave repetida (ex.: 1X2 mal-mapeado).
    const byKey = new Map<string, any>();
    for (const r of rows) byKey.set(`${r.event_id}|${r.jogador}|${r.linha}|${r.market_type}`, r);
    const deduped = [...byKey.values()];
    if (deduped.length !== rows.length) {
      logWarn("db:saveLedger", "lote tinha chaves duplicadas — colapsadas (last-wins)", { recebidas: rows.length, apos_dedup: deduped.length });
    }
    await this.mutate("saveLedger", this.client.from("paper_ledger").upsert(deduped, { onConflict: "event_id,jogador,linha,market_type" }), { linhas: deduped.length });
  }
  async getLedger(eventId: string): Promise<any[]> {
    return this.query<any[]>("getLedger", this.client.from("paper_ledger").select("*").eq("event_id", eventId), [], { eventId });
  }
  async allLedger(): Promise<any[]> {
    return this.query<any[]>("allLedger", this.client.from("paper_ledger").select("*"), []);
  }
  async settleResult(eventId: string, jogador: string, linha: number, marketType: string | null, resultado: number) {
    let upd = this.client.from("paper_ledger").update({ resultado })
      .eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) upd = upd.eq("market_type", marketType);
    await this.mutate("settleResult", upd, { eventId, jogador, linha, marketType });
  }
  async updateClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number, resultado: number) {
    let q = this.client.from("paper_ledger").select("odd_flag").eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) q = q.eq("market_type", marketType);
    const data = await this.query<any[]>("updateClosing:select", q, [], { eventId, jogador, linha, marketType });
    if (!data || !data.length) return;
    if (data.length > 1) throw new Error(`paper_ledger duplicado (${eventId}, ${jogador}, ${linha}, ${marketType})`);
    const c = clv(data[0].odd_flag, closingOdd);
    let upd = this.client.from("paper_ledger").update({ odd_fechamento: closingOdd, resultado, clv: c })
      .eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) upd = upd.eq("market_type", marketType);
    await this.mutate("updateClosing", upd, { eventId, jogador, linha, marketType });
  }
  async saveCrosswalk(canonicalId: number, normalizedName: string, sourceIds: any, confidence: number, manuallyVerified = false) {
    await this.mutate("saveCrosswalk", this.client.from("jogadores_crosswalk").upsert({
      id_canonico: canonicalId, nome_normalizado: normalizedName,
      fontes_ids: sourceIds, confianca: confidence, verificado_manual: manuallyVerified,
    }), { canonicalId, normalizedName });
  }
  async getCrosswalk(canonicalId: number) {
    const data = await this.query<any[]>("getCrosswalk", this.client.from("jogadores_crosswalk").select("*").eq("id_canonico", canonicalId), [], { canonicalId });
    return data && data.length ? data[0] : null;
  }
  async listCrosswalk(): Promise<Record<string, string>> {
    const data = await this.query<any[]>("listCrosswalk", this.client.from("jogadores_crosswalk").select("nome_normalizado,id_canonico"), []);
    const out: Record<string, string> = {};
    for (const row of data) out[row.nome_normalizado] = String(row.id_canonico);
    return out;
  }
  async snapshotClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number) {
    let sel = this.client.from("paper_ledger").select("odd_flag").eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) sel = sel.eq("market_type", marketType);
    const data = await this.query<any[]>("snapshotClosing:select", sel, [], { eventId, jogador, linha, marketType });
    if (!data || !data.length) return;
    const c = clv(data[0].odd_flag, closingOdd);
    let upd = this.client.from("paper_ledger").update({ odd_fechamento: closingOdd, clv: c })
      .eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) upd = upd.eq("market_type", marketType);
    await this.mutate("snapshotClosing", upd, { eventId, jogador, linha, marketType });
  }

}

/** Monta um SupabaseRepo lendo URL/key do ambiente. */
export async function createSupabaseRepo(): Promise<SupabaseRepo> {
  const { createClient } = await import("@supabase/supabase-js");
  const { getRequired } = await import("../config.js");
  const client = createClient(getRequired("SUPABASE_URL"), getRequired("SUPABASE_SERVICE_KEY"));
  return new SupabaseRepo(client);
}
