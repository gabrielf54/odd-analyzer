// Semeia as odds dos arquivos odds/*.json na tabela `odds` via SupabaseRepo.
// Uso: npm run seed:odds  (precisa de odds/manifest.json com event_id por arquivo)
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createSupabaseRepo } from "../src/store/repo.js";
import { saveOddsService } from "../src/service.js";

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const oddsDir = resolve(here, "../odds");
  const manifest: Record<string, string> = JSON.parse(readFileSync(resolve(oddsDir, "manifest.json"), "utf8"));
  const repo = await createSupabaseRepo();

  for (const [file, eventId] of Object.entries(manifest)) {
    if (!eventId) { console.warn(`pulado (sem event_id): ${file}`); continue; }
    const odds = JSON.parse(readFileSync(resolve(oddsDir, file), "utf8"));
    const out = await saveOddsService(repo, {
      event_id: eventId, coletado_em: new Date().toISOString(), odds,
    });
    console.log(`${file} → event_id=${eventId}: ${out.salvas} salvas, ${out.linhas_rejeitadas.length} rejeitadas`);
  }
}

main().catch((e) => { console.error("falha no seed:", e); process.exit(1); });
