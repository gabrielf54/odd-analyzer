import { getRequired } from "../config.js";

const URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "anthropic/claude-sonnet-4.6";

export type Msg = { role: string; content: string };
export type PostFn = (url: string, init: RequestInit) => Promise<Response>;

/** Transporte HTTP para o chat do OpenRouter. `post` é injetável p/ testar offline. */
export async function chat(
  messages: Msg[],
  opts: { model?: string; temperature?: number; post?: PostFn } = {},
): Promise<string> {
  const key = getRequired("OPENROUTER_API_KEY");
  const mdl = opts.model ?? process.env["OPENROUTER_MODEL"] ?? DEFAULT_MODEL;
  const post: PostFn = opts.post ?? ((u, init) => fetch(u, init));
  const r = await post(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: mdl, messages, temperature: opts.temperature ?? 0.0 }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}`);
  const data = await r.json();
  return data.choices[0].message.content;
}
