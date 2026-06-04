// Bootstrap do servidor: lê env, monta deps reais (BSD + Supabase) e sobe a API.
import { createApp } from "./app.js";
import { getRequired } from "../config.js";
import { BSDClient } from "../bsd/client.js";
import { createSupabaseRepo } from "../store/repo.js";

async function main() {
  const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
  const repo = await createSupabaseRepo();
  const app = createApp({ client, repo });
  const port = Number(process.env["PORT"] ?? 3001);
  app.listen(port, () => console.log(`odd-analyzer API ouvindo em http://localhost:${port}`));
}

main().catch((e) => {
  console.error("falha ao subir a API:", e);
  process.exit(1);
});
