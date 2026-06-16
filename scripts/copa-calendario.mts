import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const CUT = Date.parse("2026-06-10T00:00:00Z");
const seen = new Map<string, any>();
for (const st of ["notstarted", "finished", "inplay"]) {
  let r: any; try { r = await client.events({ league_id: 27, status: st, limit: 200 }); } catch { continue; }
  for (const e of (r?.results ?? [])) seen.set(String(e.id), e);
}
const dOf = (e: any) => e?.event_date ?? e?.date ?? e?.start_time ?? "";
const rows = [...seen.values()].filter((e) => { const t = Date.parse(dOf(e)); return Number.isFinite(t) && t >= CUT; })
  .sort((a, b) => (dOf(a) < dOf(b) ? -1 : 1));
// horário de Brasília = UTC-3 (sem horário de verão em 2026)
function brt(iso: string): { dia: string; hora: string } {
  const t = Date.parse(iso); const d = new Date(t - 3 * 3600 * 1000);
  const wd = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][d.getUTCDay()];
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { dia: `${dd}/${mm} ${wd}`, hora: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` };
}
const isPH = (s: any) => { const x = String(s ?? "").toLowerCase(); return !x || x.includes("winner") || x.includes("runner") || x.includes("group ") || x.includes("vencedor") || x.includes("/") || x.includes("tbd") || /\b[a-d]1\b/.test(x); };
console.log(`Copa 2026 (liga 27): ${rows.length} jogos a partir de 11/06\n`);
let curDia = "";
for (const e of rows) {
  const { dia, hora } = brt(dOf(e));
  const h = e.home_team ?? e.home ?? "?", a = e.away_team ?? e.away ?? "?";
  const ph = isPH(h) || isPH(a) ? " [a definir]" : "";
  if (dia !== curDia) { console.log(`\n=== ${dia} ===`); curDia = dia; }
  console.log(`  ${hora} BRT | ${e.status?.padEnd(11) ?? "?"} | ${h} x ${a}${ph}`);
}
