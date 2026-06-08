import express, { type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { AppError } from "./errors.js";
import * as service from "../service.js";

export interface Deps {
  client: any;
  repo: any;
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

/** Monta a app Express. `deps` injeta client/repo (reais no server, fakes no teste). */
export function createApp(deps: Deps): express.Express {
  const app = express();
  app.use(express.json());

  // CORS permissivo (front Next em outra origem, ex.: localhost:3000).
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });
  app.options(/.*/, (_req, res) => { res.sendStatus(204); });

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

  app.get("/jogos/:eventId/resultado", wrap(async (req, res) => {
    const q = resultQuery.safeParse(req.query);
    if (!q.success) throw new AppError(400, "query_invalida", "market e linha são obrigatórios");
    res.json(await service.realPlayerResult(deps.client, req.params.eventId, q.data.market, q.data.linha));
  }));

  // Middleware de erro: AppError → status/codigo; erro de domínio → 400; senão 500.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ erro: err.message, codigo: err.codigo });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(400).json({ erro: msg, codigo: "erro_requisicao" });
  });

  return app;
}
