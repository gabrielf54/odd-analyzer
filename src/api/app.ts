import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AppError } from "./errors.js";
import * as service from "../service.js";
import { logError } from "../lib/log.js";
import type { ReviewerFn } from "../ai/reviewer.js";

export interface Deps {
  client: any;
  repo: any;
  reviewerFn?: ReviewerFn;
}

const analyzeSchema = z.object({
  event_id: z.string(),
  market_key: z.string(),
  linha: z.number().default(0),
  odd_over: z.number().default(0),
  odd_under: z.number().default(0),
  usar_ia: z.boolean().optional(),
  escopo_historico: z.string().optional(),
  league_id: z.union([z.string(), z.number()]).nullish(),
  player_ref: z.string().nullish(),
  diagnostico: z.boolean().optional(),
});

const paperSchema = z.object({
  event_id: z.string(),
  candidato: z.record(z.string(), z.unknown()),
  em_validacao: z.boolean().optional(),
});

const matchesQuery = z.object({ status: z.enum(["finished", "notstarted"]) });
const resultQuery = z.object({ market: z.string(), linha: z.coerce.number() });
const promptQuery = z.object({ event_id: z.string(), market: z.string() });
const crosswalkSchema = z.object({ nome_casa: z.string(), player_id: z.string() });
const oddsFilterQuery = z.object({
  entidade: z.string().optional(),
  market_type: z.string().optional(),
  linha: z.coerce.number().optional(),
  book: z.string().optional(),
});

/** Monta a app Express. `deps` injeta client/repo (reais no server, fakes no teste). */
export function createApp(deps: Deps): express.Express {
  const app = express();

  // CORS permissivo (front Next em outra origem, ex.: localhost:3000). ANTES do json() de
  // propósito: se o body-parser estoura (ex.: PayloadTooLargeError), o erro pula os
  // middlewares seguintes e cai direto no handler — mas os headers de CORS já estão setados,
  // então o front CONSEGUE LER o erro em vez de "Failed to fetch" com corpo vazio.
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });
  app.options(/.*/, (_req, res) => { res.sendStatus(204); });

  // limit alto: a análise manual manda TODAS as odds coletadas do jogo (~950+ linhas) +
  // stats no corpo — o default de 100kb do express.json estoura (PayloadTooLargeError). 5mb
  // cobre folgado.
  app.use(express.json({ limit: "5mb" }));

  const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

  app.get("/ligas", wrap(async (_req, res) => {
    res.json(await service.listLeagues(deps.client));
  }));

  app.get("/ligas/:id/jogos", wrap(async (req, res) => {
    const q = matchesQuery.safeParse(req.query);
    if (!q.success) throw new AppError(400, "query_invalida", "status deve ser 'finished' ou 'notstarted'");
    res.json(await service.listMatches(deps.client, req.params.id, q.data.status));
  }));

  app.get("/jogos/:eventId/escalacao", wrap(async (req, res) => {
    res.json(await service.probableLineup(deps.client, req.params.eventId));
  }));

  app.post("/analisar", wrap(async (req, res) => {
    const p = analyzeSchema.safeParse(req.body);
    if (!p.success) throw new AppError(400, "body_invalido", p.error.issues.map((i) => i.message).join("; "));
    const b = p.data;
    const out = await service.analyze(deps.client, b.event_id, b.market_key, b.linha, b.odd_over, b.odd_under, {
      useAi: b.usar_ia, repo: deps.repo, historyScope: b.escopo_historico,
      leagueId: b.league_id ?? null, playerRef: b.player_ref ?? null,
      diagnostics: b.diagnostico ?? false,
    });
    res.json(out);
  }));

  app.post("/paper", wrap(async (req, res) => {
    const p = paperSchema.safeParse(req.body);
    if (!p.success) throw new AppError(400, "body_invalido", p.error.issues.map((i) => i.message).join("; "));
    await service.paperBet(deps.repo, p.data.event_id, p.data.candidato, p.data.em_validacao ?? false);
    res.json({ ok: true });
  }));

  app.get("/prompt", wrap(async (req, res) => {
    const q = promptQuery.safeParse(req.query);
    if (!q.success) throw new AppError(400, "query_invalida", "event_id e market são obrigatórios");
    res.json({ prompt: await service.generateOddsPrompt(deps.client, q.data.event_id, q.data.market) });
  }));

  app.post("/analise/manual", wrap(async (req, res) => {
    // A validação fina do JSON é do parseManualOdds (lança → 400 no middleware).
    res.json(await service.analyzeManualService(deps.client, req.body, { repo: deps.repo, reviewerFn: deps.reviewerFn }));
  }));

  app.post("/odds", wrap(async (req, res) => {
    // parseManualOdds dentro do serviço lança em erro estrutural → 400 no middleware.
    res.json(await service.saveOddsService(deps.repo, req.body));
  }));

  // "Obter odds": coleta automática multi-casa (registry) → grava no `odds`. Backend do
  // botão do front. `?dry=1` testa sem gravar. Os fetchers (incl. Chromium headless p/
  // Cloudflare) são montados por import DINÂMICO → o Playwright só carrega aqui, na hora.
  app.post("/jogos/:eventId/coletar-odds", wrap(async (req, res) => {
    const dry = req.query.dry === "1" || req.body?.dry === true;
    const overrides = (req.body?.overrides && typeof req.body.overrides === "object") ? req.body.overrides : {};
    const { makeFetchers } = await import("../cli/fetchers.js");
    const fetchers = await makeFetchers();
    try {
      res.json(await service.coletarOddsService(deps.client, deps.repo, String(req.params.eventId), fetchers, { dry, overrides }));
    } finally {
      await fetchers.close();
    }
  }));

  app.get("/jogos/:eventId/odds", wrap(async (req, res) => {
    res.json(await service.getOddsService(deps.repo, String(req.params.eventId)));
  }));

  // "Unificar odds": re-gera o espelho odds_unificadas (line shopping) a partir do cru e
  // devolve o resumo p/ a tela de conferência. É o que a análise consome.
  app.post("/jogos/:eventId/unificar-odds", wrap(async (req, res) => {
    res.json(await service.unificarOddsService(deps.repo, String(req.params.eventId)));
  }));

  app.get("/jogos/:eventId/odds-unificadas", wrap(async (req, res) => {
    res.json(await service.getOddsUnificadasService(deps.repo, String(req.params.eventId)));
  }));

  app.get("/jogos/:eventId/analise", wrap(async (req, res) => {
    res.json(await service.getManualAnalysisService(deps.repo, String(req.params.eventId)));
  }));

  app.delete("/jogos/:eventId/odds", wrap(async (req, res) => {
    const q = oddsFilterQuery.safeParse(req.query);
    const filter = q.success ? q.data : {};
    res.json(await service.deleteOddsService(deps.repo, String(req.params.eventId), filter));
  }));

  app.post("/crosswalk", wrap(async (req, res) => {
    const p = crosswalkSchema.safeParse(req.body);
    if (!p.success) throw new AppError(400, "body_invalido", p.error.issues.map((i) => i.message).join("; "));
    await service.confirmCrosswalk(deps.repo, p.data.nome_casa, p.data.player_id);
    res.json({ ok: true });
  }));

  app.get("/jogos/:eventId/resultado", wrap(async (req, res) => {
    const q = resultQuery.safeParse(req.query);
    if (!q.success) throw new AppError(400, "query_invalida", "market e linha são obrigatórios");
    res.json(await service.realPlayerResult(deps.client, req.params.eventId, q.data.market, q.data.linha));
  }));

  // Middleware de erro: AppError → status/codigo; erro de domínio → 400; senão 500.
  // LOGA todo erro inesperado (e AppError 5xx) — antes o backend ficava mudo: o erro
  // virava só um 400 pro front e NADA no console do servidor (ex.: o crash do
  // saveLedger por chave duplicada). AppError 4xx (validação) não loga — é esperado.
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      if (err.status >= 500) logError("api", err, { path: req.path, method: req.method, codigo: err.codigo });
      res.status(err.status).json({ erro: err.message, codigo: err.codigo });
      return;
    }
    logError("api", err, { path: req.path, method: req.method });
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ erro: msg, codigo: "erro_requisicao" });
  });

  return app;
}
