// Painel de validação do paper_ledger, por mercado. Só linhas liquidadas.
//  • calibração (Brier/ECE/BrierSkill) + IC 95% do skill (bootstrap: real ou ruído?)
//  • MODELO × CASA: quem prevê melhor o resultado real (o que decide o EDGE — bater a
//    média não basta, tem que bater a casa). Só nas linhas com de-vig de 2 lados.
//  • CLV médio quando houver.
// Uso: npx tsx src/cli/report.ts
import "dotenv/config";
import { BSDClient } from "../bsd/client.js";
import { getRequired } from "../config.js";
import { createSupabaseRepo } from "../store/repo.js";
import { validationByMarket } from "../backtest/ledgerReport.js";
import { clvPorMercadoService } from "../service.js";

const repo = await createSupabaseRepo();
const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const rows = await repo.allLedger();
const rep = validationByMarket(rows);

if (!rep.length) { console.log("sem linhas liquidadas no paper_ledger ainda."); process.exit(0); }

const sgn = (x: number) => (x >= 0 ? "+" : "") + x.toFixed(3);

console.log("\n=== CALIBRAÇÃO (acerta a probabilidade?) ===");
console.log("mercado        n   Brier    ECE   BrierSkill  IC95%(skill)      CLVm");
for (const r of rep) {
  const clv = r.clv_medio == null ? "  n/d" : sgn(r.clv_medio);
  const ic = `[${sgn(r.skill_lo)},${sgn(r.skill_hi)}]`;
  console.log(
    `${r.market_type.padEnd(12)} ${String(r.n).padStart(3)}  ${r.brier.toFixed(4)} ${r.ece.toFixed(4)}  ${sgn(r.brier_skill).padStart(8)}  ${ic.padEnd(17)} ${clv}`,
  );
}

console.log("\n=== MODELO × CASA (tem EDGE? só linhas com de-vig de 2 lados) ===");
console.log("mercado       n_casa  Brier_modelo  Brier_casa  vantagem");
const comMercado = rep.filter((r) => r.vantagem != null);
if (!comMercado.length) {
  console.log("  (nenhuma linha com de-vig de 2 lados ainda — colete odds OVER+UNDER p/ medir edge)");
} else {
  for (const r of comMercado) {
    const quem = r.vantagem! > 0 ? "modelo ganha" : "CASA ganha";
    console.log(
      `${r.market_type.padEnd(12)} ${String(r.n_mercado).padStart(5)}   ${r.brier_modelo!.toFixed(4)}      ${r.brier_mercado!.toFixed(4)}     ${sgn(r.vantagem!)} (${quem})`,
    );
  }
}

console.log("\nLeitura: BrierSkill>0 = bate a média (chute burro). Mas o que PAGA é vantagem>0 =");
console.log("bater a CASA. IC95% que cruza o zero = skill ainda pode ser ruído (n pequeno).");

// CLV AGREGADO por mercado (entrada→fechamento), entre TODOS os jogos. Resolve o "CLVm n/d"
// acima: aquele era por-jogo (GET /jogos/:id/clv); este junta o paper_ledger inteiro.
const pct = (x: number) => (x >= 0 ? "+" : "−") + (Math.abs(x) * 100).toFixed(1) + "%";
const clvAgg = await clvPorMercadoService(client, repo);
console.log("\n=== CLV POR MERCADO (entrada→fechamento, jogos liquidados) ===");
console.log("Prova: o preço ANDOU a favor das suas escolhas? (NÃO é EV — pra EV falta odd dos 2 lados.)");
console.log("mercado        n   CLV médio   IC95%");
if (!clvAgg.por_mercado.length) {
  console.log("  (sem CLV ainda — precisa de aposta liquidada com odd de entrada + retratos de odds)");
} else {
  for (const m of clvAgg.por_mercado) {
    const ic = `[${pct(m.lo)}, ${pct(m.hi)}]`;
    console.log(`${m.market_type.padEnd(12)} ${String(m.n).padStart(3)}   ${pct(m.clv_medio).padStart(7)}   ${ic}`);
  }
}
console.log(`\nLimitação: ${clvAgg.limitacao}`);
// Nota: no Windows pode aparecer um "Assertion failed ... async.c" no encerramento —
// artefato do libuv/undici (handle keep-alive do supabase-js) APÓS o resultado; exit 0, benigno.
