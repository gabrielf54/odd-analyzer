import { getRequired } from "../config.js";
import { logError } from "../lib/log.js";

const URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";

export type Msg = { role: string; content: string };
export type PostFn = (url: string, init: RequestInit) => Promise<Response>;

/** Modelo que SERÁ usado (override → env OPENROUTER_MODEL → default). Exposto p/ que o
 * chamador possa logar QUAL modelo vai rodar antes de disparar a chamada. */
export function resolveModel(model?: string): string {
  return model ?? process.env["OPENROUTER_MODEL"] ?? DEFAULT_MODEL;
}

/** Transporte HTTP para o chat do OpenRouter. `post` é injetável p/ testar offline. */
export async function chat(
  messages: Msg[],
  opts: { model?: string; temperature?: number; post?: PostFn } = {},
): Promise<string> {
  const key = getRequired("OPENROUTER_API_KEY");
  const mdl = resolveModel(opts.model);
  const post: PostFn = opts.post ?? ((u, init) => fetch(u, init));
  const r = await post(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: mdl, messages, temperature: opts.temperature ?? 0.0 }),
  });
  if (!r.ok) {
    // Loga o CORPO da resposta (chave inválida, rate-limit, modelo errado…) — antes
    // só subia "OpenRouter 4xx" e o motivo real ficava invisível no servidor.
    const body = await r.text().catch(() => "");
    logError("openrouter", `HTTP ${r.status}`, { model: mdl, body: body.slice(0, 500) });
    throw new Error(`OpenRouter ${r.status}`);
  }
  const data = await r.json();
  return data.choices[0].message.content;
}
