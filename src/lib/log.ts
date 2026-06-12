/** Log estruturado mínimo p/ a camada de I/O (adapters + API). O domínio puro
 * (model/ value/ candidates) NÃO loga — só quem fala com o mundo: banco, IA, HTTP,
 * fronteira da API. Sem dependência externa: escreve em stderr (console.error/warn)
 * como UMA linha JSON grep-ável; em erro, a stack vai logo abaixo.
 *
 * Motivação (2026-06-12): o backend estava silencioso — erros de banco e de IA
 * só apareciam como 400 pro front, nada no console do servidor. Aqui é o ponto
 * único onde esses erros viram log visível. */
type Ctx = Record<string, unknown> | undefined;

function emit(stream: "error" | "warn" | "info", level: string, scope: string, msg: string, ctx: Ctx): void {
  const line: Record<string, unknown> = { level, scope, msg };
  if (ctx) for (const [k, v] of Object.entries(ctx)) line[k] = v;
  const text = `[odd-analyzer] ${JSON.stringify(line)}`;
  if (stream === "warn") console.warn(text);
  else if (stream === "info") console.log(text);
  else console.error(text);
}

/** Erro de I/O (banco, IA, fronteira da API). Aceita Error ou qualquer valor.
 * `scope` = origem curta (ex.: "db:saveLedger", "openrouter", "api"). */
export function logError(scope: string, err: unknown, ctx?: Ctx): void {
  const msg = err instanceof Error ? err.message : String(err);
  emit("error", "error", scope, msg, ctx);
  if (err instanceof Error && err.stack) console.error(err.stack);
}

/** Aviso (degradação graciosa, fallback, linha pulada) — não é falha fatal, mas o
 * operador precisa enxergar. */
export function logWarn(scope: string, msg: string, ctx?: Ctx): void {
  emit("warn", "warn", scope, msg, ctx);
}

/** Checkpoint de progresso (stdout) — p/ acompanhar o andamento de uma requisição
 * longa (ex.: análise de jogo: mercado a mercado + chamada de IA). Use com PARCIMÔNIA:
 * uma linha por etapa macro, não por item. */
export function logInfo(scope: string, msg: string, ctx?: Ctx): void {
  emit("info", "info", scope, msg, ctx);
}
