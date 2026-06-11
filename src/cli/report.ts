// Relatório de calibração/CLV do paper_ledger, por mercado. Só linhas liquidadas.
// Uso: npx tsx src/cli/report.ts
import "dotenv/config";
import { createSupabaseRepo } from "../store/repo.js";
import { reportByMarket } from "../backtest/ledgerReport.js";

const repo = await createSupabaseRepo();
const rows = await repo.allLedger();
const rep = reportByMarket(rows);

if (!rep.length) { console.log("sem linhas liquidadas no paper_ledger ainda."); process.exit(0); }

console.log("mercado        n   Brier    ECE   BrierSkill  CLVm");
for (const r of rep) {
  const clv = r.clv_medio == null ? "  n/d" : (r.clv_medio >= 0 ? "+" : "") + r.clv_medio.toFixed(3);
  console.log(
    `${r.market_type.padEnd(12)} ${String(r.n).padStart(3)}  ${r.brier.toFixed(4)} ${r.ece.toFixed(4)}  ${r.brier_skill.toFixed(4).padStart(8)}  ${clv}`,
  );
}
console.log("\nBrierSkill>0 = melhor que chutar a média. Mercado só vira money_ready com prova consistente.");
// Nota: no Windows pode aparecer um "Assertion failed ... async.c" no encerramento —
// artefato do libuv/undici (handle keep-alive do supabase-js) APÓS o resultado; exit 0, benigno.
