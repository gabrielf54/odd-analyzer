// SMOKE E2E do módulo de arbitragem SEM banco: coleta AO VIVO (dry, pipeline puro) as
// odds de um jogo nas 5 casas, mostra o que entrou de mercado de PARTIDA por casa e roda
// o motor de arbitragem em cima. Prova a cadeia crosswalk→parser→de-para→normalizer→motor
// com payload real — útil como diagnóstico recorrente ("por que não achou arb?").
// Uso: npx tsx scripts/arb-e2e-dry.mts [event_id_BSD]   (default: próximo jogo da Copa)
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { normalizeEvent } from "../src/runner.js";
import { listMatches } from "../src/service.js";
import { buildCollectors } from "../src/collect/houses.js";
import { collectOdds } from "../src/collect/pipeline.js";
import { makeFetchers } from "../src/cli/fetchers.js";
import { findArbs, type ArbOddsRow } from "../src/arb/surebet.js";

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));

let eventId = process.argv[2];
if (!eventId) {
  const jogos = await listMatches(client, "27", "notstarted");
  if (!jogos.length) { console.error("nenhum jogo pré-jogo na liga 27."); process.exit(1); }
  eventId = String(jogos[0]!.id);
}
const ev = normalizeEvent(await client.getEvent(eventId));
const home = ev.home_team?.name ?? "", away = ev.away_team?.name ?? "";
console.log(`jogo: BSD ${eventId} — ${home} x ${away}\n`);

const fetchers = await makeFetchers();
try {
  const ctx = { event_id: eventId, home, away };
  const collectors = await buildCollectors(ctx, fetchers, { log: (m) => console.log(`  ${m}`) });
  const res = await collectOdds(collectors, ctx);

  console.log(`\ncasas: ${res.casas.map((c) => (c.ok ? `${c.book} ✓(${c.n})` : `${c.book} ✗(${c.erro})`)).join(" · ")}`);
  console.log(`linhas normalizadas: ${res.linhas_por_casa.length} | rejeitadas: ${res.linhas_rejeitadas.length}`);

  const partida = res.linhas_por_casa.filter((l) => l.entidade === "partida");
  console.log(`\n— MERCADOS DE PARTIDA capturados (${partida.length}) —`);
  for (const l of partida) {
    const draw = l.odd_draw != null ? ` draw ${l.odd_draw}` : "";
    console.log(`  ${l.book.padEnd(12)} ${l.market_type.padEnd(11)} linha ${String(l.linha).padEnd(5)} over ${l.odd_over}${l.odd_under != null ? ` under ${l.odd_under}` : ""}${draw}`);
  }
  const comUnder = res.linhas_por_casa.filter((l) => l.entidade !== "partida" && l.odd_under != null);
  console.log(`\nprops de jogador com os DOIS lados: ${comUnder.length}`);

  const agora = new Date().toISOString();
  const rows: ArbOddsRow[] = res.linhas_por_casa.map((l) => ({
    event_id: eventId!, entidade: l.entidade, market_type: l.market_type, linha: l.linha,
    odd_over: l.odd_over, odd_under: l.odd_under, odd_draw: l.odd_draw ?? null,
    book: l.book, coletado_em: agora,
  }));
  const opps = findArbs(rows, { total: 200 });
  console.log(`\n— OPORTUNIDADES (motor, banca R$200) — ${opps.length}`);
  for (const o of opps.slice(0, 15)) {
    console.log(`  [${o.tier.toUpperCase()}] ${o.market_type} ${o.linha} S=${o.soma_inversos.toFixed(4)} lucro=${o.lucro_garantido.toFixed(2)}`);
    for (const p of o.pernas) console.log(`     ${p.rotulo} @ ${p.odd} (${p.book}) → R$${p.stake}`);
  }
} finally {
  await fetchers.close();
}
