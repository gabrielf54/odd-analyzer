# Melhorias da Análise Manual — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Titularidade tri-state com estrela inteligente, posição no dossiê/IA, prompt revisor ancorado, `escopo_historico` na rota manual e concessão por posição no money-path com guarda-corpo de backtest.

**Architecture:** Funções puras novas em `model/` (tilt posicional, clampado); I/O posicional no `BSDStatsProvider` com fail-closed (tilt=1.0 = comportamento atual); campos novos no fio via `buildCandidate`; estrela movida no `rankCandidates`; front espelha tipos e adiciona badges. Gate de paridade intocado (nenhuma função pura existente muda de contrato).

**Tech Stack:** Node/TS strict ESM, Vitest, Zod (borda API), Next.js no front (`C:\Users\gabri\Documents\projects\odd-analyzer-frontend`).

**Spec:** `docs/superpowers/specs/2026-06-10-melhorias-analise-manual-design.md`

**Convenções da casa (CLAUDE.md):** identificadores em INGLÊS; chaves de DADOS no fio em snake_case PT; validação de borda só com Zod; rodar `npm test` e `npm run typecheck` da raiz. Backend = este repo; front = repo separado acima.

---

### Task 1: `positionalTilt` (função pura)

**Files:**
- Modify: `src/model/adjustments.ts`
- Test: `test/adjustments.test.ts`

- [ ] **Step 1: Write the failing tests** — append em `test/adjustments.test.ts`:

```ts
import { positionalTilt, TILT_MIN, TILT_MAX } from "../src/model/adjustments.js";

describe("positionalTilt", () => {
  it("razão share_adv/share_base, clampada em [0.85, 1.20]", () => {
    expect(positionalTilt(0.50, 0.45)).toBeCloseTo(0.50 / 0.45, 12);
    expect(positionalTilt(0.90, 0.45)).toBe(TILT_MAX);
    expect(positionalTilt(0.10, 0.45)).toBe(TILT_MIN);
    expect(TILT_MIN).toBe(0.85);
    expect(TILT_MAX).toBe(1.20);
  });
  it("neutro (1.0) quando share ausente ou baseline não-positivo", () => {
    expect(positionalTilt(null, 0.45)).toBe(1.0);
    expect(positionalTilt(0.5, null)).toBe(1.0);
    expect(positionalTilt(0.5, 0)).toBe(1.0);
  });
});
```

(O arquivo já importa de `adjustments.js`; ajuste o import existente para incluir os novos símbolos.)

- [ ] **Step 2: Run to verify FAIL** — `npm test -- adjustments` → erro "positionalTilt is not exported".

- [ ] **Step 3: Implement** — append em `src/model/adjustments.ts`:

```ts
export const TILT_MIN = 0.85;
export const TILT_MAX = 1.20;

/** Tilt posicional: o adversário concede desproporcionalmente a esta posição?
 * share_adv/share_base clampado. Neutro (1.0) se faltar dado — fail-closed. */
export function positionalTilt(shareAdv: number | null, shareBase: number | null): number {
  if (shareAdv == null || shareBase == null || shareBase <= 0) return 1.0;
  return Math.max(TILT_MIN, Math.min(TILT_MAX, shareAdv / shareBase));
}
```

- [ ] **Step 4: Run to verify PASS** — `npm test -- adjustments`.

- [ ] **Step 5: Commit** — `git add src/model/adjustments.ts test/adjustments.test.ts && git commit -m "feat: positionalTilt puro (clamp 0.85-1.20, fail-closed)"`

---

### Task 2: Script de baseline posicional + medição

**Files:**
- Create: `scripts/measure-positional-baseline.mts`

- [ ] **Step 1: Create script** (sem teste — é ferramenta one-off de medição, não money-path):

```ts
// Mede a participação típica de cada posição (D/M/F) no total CONCEDIDO por
// jogo, por mercado, em jogos de seleção. Saída vira constante em params.ts.
// Uso: npx tsx scripts/measure-positional-baseline.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";

const LEAGUES = [31, 58, 59, 60, 61, 62, 64, 65, 66, 67];
const EVENTS_PER_LEAGUE = 12;
const STAT_FIELDS = ["total_tackle", "shots_on_target", "total_shots"] as const;

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const posCache = new Map<string, string>();

async function positionOf(pid: unknown): Promise<string> {
  const key = String(pid);
  const hit = posCache.get(key);
  if (hit) return hit;
  let pos = "?";
  try { pos = String((await client.player(pid))?.position ?? "?"); } catch { /* sem posição */ }
  posCache.set(key, pos);
  return pos;
}

const totals: Record<string, Record<string, number>> = {};
for (const f of STAT_FIELDS) totals[f] = { D: 0, M: 0, F: 0 };
let gamesUsed = 0;

for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); }
  catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    let ps: any;
    try { ps = await client.eventPlayerStats(ev.id); } catch { continue; }
    const rows: any[] = Array.isArray(ps?.player_stats) ? ps.player_stats : [];
    if (rows.length === 0) continue;
    gamesUsed++;
    for (const r of rows) {
      let pos: string | null = null;
      for (const f of STAT_FIELDS) {
        const v = Number(r[f] ?? 0);
        if (!(v > 0)) continue;
        pos = pos ?? await positionOf(r.player_id);
        if (pos === "D" || pos === "M" || pos === "F") totals[f]![pos] = (totals[f]![pos] ?? 0) + v;
      }
    }
    console.error(`liga ${lg} evento ${ev.id} ok (${gamesUsed} jogos acumulados)`);
  }
}

console.log(`\n// Medido em ${gamesUsed} jogos de seleção (ligas ${LEAGUES.join("/")}), ${new Date().toISOString().slice(0, 10)}:`);
for (const f of STAT_FIELDS) {
  const t = totals[f]!;
  const sum = t.D! + t.M! + t.F!;
  const share = (x: number) => (sum > 0 ? (x / sum).toFixed(3) : "0");
  console.log(`  ${f}: { D: ${share(t.D!)}, M: ${share(t.M!)}, F: ${share(t.F!)} },`);
}
```

- [ ] **Step 2: Run** — `npx tsx scripts/measure-positional-baseline.mts` (demora minutos; progresso no stderr). Guardar a saída final (3 linhas de shares + contagem de jogos) para a Task 3.

- [ ] **Step 3: Commit** — `git add scripts/measure-positional-baseline.mts && git commit -m "feat: script one-off de baseline posicional (seleções)"`

---

### Task 3: Constantes posicionais em `params.ts`

**Files:**
- Modify: `src/model/params.ts`
- Test: `test/markets.test.ts` (ou novo `test/params.test.ts`)

- [ ] **Step 1: Write the failing test** — novo arquivo `test/params.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { POSITIONAL_SHARE_NACIONAL, POSITIONAL_TILT_ENABLED, POSITIONAL_MIN_GAMES } from "../src/model/params.js";

describe("parâmetros posicionais", () => {
  it("shares por mercado somam ~1 e cobrem D/M/F", () => {
    for (const f of ["total_tackle", "shots_on_target", "total_shots"]) {
      const s = POSITIONAL_SHARE_NACIONAL[f]!;
      expect(s.D! + s.M! + s.F!).toBeGreaterThan(0.97);
      expect(s.D! + s.M! + s.F!).toBeLessThan(1.03);
    }
  });
  it("flag e mínimo de jogos existem", () => {
    expect(typeof POSITIONAL_TILT_ENABLED).toBe("boolean");
    expect(POSITIONAL_MIN_GAMES).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- params`.

- [ ] **Step 3: Implement** — append em `src/model/params.ts`, **usando os números medidos pela Task 2** (os valores abaixo são a ESTRUTURA; substituir pelos do script):

```ts
// Participação típica de cada posição (D/M/F) no total concedido pelo
// adversário, por mercado. Medido pelo scripts/measure-positional-baseline.mts
// em jogos de seleção — colar aqui a saída do script com data e N de jogos.
export const POSITIONAL_SHARE_NACIONAL: Record<string, Record<string, number>> = {
  // <colar saída do script — ex.: total_tackle: { D: 0.412, M: 0.461, F: 0.127 },>
  total_tackle: { D: 0, M: 0, F: 0 },
  shots_on_target: { D: 0, M: 0, F: 0 },
  total_shots: { D: 0, M: 0, F: 0 },
};
// Liga por padrão SÓ depois do mini-backtest (Task 9) não degradar Brier/ECE.
export const POSITIONAL_TILT_ENABLED = false;
export const POSITIONAL_MIN_GAMES = 5; // jogos do adversário com player-stats
```

- [ ] **Step 4: Run to verify PASS** — `npm test -- params` (com os valores reais colados; o teste de soma ~1 só passa com números de verdade).

- [ ] **Step 5: Commit** — `git add src/model/params.ts test/params.test.ts && git commit -m "feat: baseline posicional nacional medido (constantes datadas)"`

---

### Task 4: Tilt posicional no `BSDStatsProvider` + `concedido_posicao`

**Files:**
- Modify: `src/providers/stats.ts`, `src/providers/types.ts`
- Test: `test/providersStats.test.ts`

- [ ] **Step 1: Write the failing tests** — append em `test/providersStats.test.ts` (seguir o padrão de fake client do arquivo). Cenário: adversário (id "200") com 5 jogos finalizados; em cada jogo, o time que jogou CONTRA ele fez desarmes concentrados em meio-campistas. Jogador-alvo é "M".

```ts
import { BSDStatsProvider } from "../src/providers/stats.js";
import { MARKETS } from "../src/model/markets.js";

function fakePositionalClient() {
  // 5 jogos do adversário 200; em cada, o time 300 (contra) fez:
  // jogador 31 (M): 6 desarmes · jogador 32 (D): 2 · jogador 33 (F): 1.
  const evs = [1, 2, 3, 4, 5].map((i) => ({ id: i, home_team_id: "200", away_team_id: "300" }));
  return {
    events: async (f: any) => {
      if (String(f.team_id) === "200") return { results: evs };
      // histórico do jogador-alvo: time 100
      return { results: [{ id: 90, home_team_id: "100", away_team_id: "200" }] };
    },
    eventStats: async (_id: any) => ({ stats: { home: { total_tackles: 9 }, away: { total_tackles: 9 } } }),
    eventPlayerStats: async (_id: any) => ({
      player_stats: [
        { player_id: 31, team_id: "300", total_tackle: 6 },
        { player_id: 32, team_id: "300", total_tackle: 2 },
        { player_id: 33, team_id: "300", total_tackle: 1 },
        { player_id: 41, team_id: "200", total_tackle: 3 },
      ],
    }),
    player: async (pid: any) =>
      ({ 31: { position: "M" }, 32: { position: "D" }, 33: { position: "F" } } as any)[pid] ?? { position: "?" },
    playerStats: async (_pid: any) => ({
      results: Array.from({ length: 12 }, (_, i) => ({
        event_id: i, team_id: "100", total_tackle: 3, minutes_played: 90,
      })),
    }),
    lineups: async (_id: any) => ({ lineups: {} }),
  };
}

describe("tilt posicional no entityRate", () => {
  const ctx = {
    event: { id: 90 }, entity_team_id: "100", is_home: true,
    opp_team_id: "200", league_avg_conceded: 13.97, xi_team_ids: new Set<string>(),
    escopo_historico: "todos", posicao: "M",
  };

  it("aplica tilt quando habilitado e adversário concede mais à posição", async () => {
    const on = new BSDStatsProvider(fakePositionalClient(), { positionalTilt: true });
    const off = new BSDStatsProvider(fakePositionalClient(), { positionalTilt: false });
    const rOn = await on.entityRate("p1", MARKETS["desarmes"]!, ctx);
    const rOff = await off.entityRate("p1", MARKETS["desarmes"]!, ctx);
    // share_adv M = 6/9 = 0.667 > share_base M → tilt > 1 (clamp 1.20) → mu maior
    expect(rOn!.mu).toBeGreaterThan(rOff!.mu);
    expect(rOn!.concedido_posicao).toMatch(/meio-campo/);
    expect(rOff!.concedido_posicao ?? null).toBeNull();
  });

  it("fail-closed: sem posicao no ctx, tilt neutro (mu igual ao atual)", async () => {
    const on = new BSDStatsProvider(fakePositionalClient(), { positionalTilt: true });
    const off = new BSDStatsProvider(fakePositionalClient(), { positionalTilt: false });
    const noPos = { ...ctx, posicao: undefined };
    expect((await on.entityRate("p1", MARKETS["desarmes"]!, noPos))!.mu)
      .toBeCloseTo((await off.entityRate("p1", MARKETS["desarmes"]!, noPos))!.mu, 12);
  });

  it("fail-closed: menos de POSITIONAL_MIN_GAMES jogos com player-stats → neutro", async () => {
    const c = fakePositionalClient();
    c.events = async (f: any) =>
      String(f.team_id) === "200"
        ? { results: [{ id: 1, home_team_id: "200", away_team_id: "300" }] } // só 1 jogo
        : { results: [{ id: 90, home_team_id: "100", away_team_id: "200" }] };
    const on = new BSDStatsProvider(c, { positionalTilt: true });
    const off = new BSDStatsProvider(c, { positionalTilt: false });
    expect((await on.entityRate("p1", MARKETS["desarmes"]!, ctx))!.mu)
      .toBeCloseTo((await off.entityRate("p1", MARKETS["desarmes"]!, ctx))!.mu, 12);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- providersStats` (construtor não aceita opts; `concedido_posicao` inexistente).

- [ ] **Step 3: Implement** em `src/providers/stats.ts`:

3a. Imports novos:

```ts
import { opponentMultiplier, homeAwayMultiplier, positionalTilt } from "../model/adjustments.js";
import { POSITIONAL_SHARE_NACIONAL, POSITIONAL_TILT_ENABLED, POSITIONAL_MIN_GAMES } from "../model/params.js";
```

3b. Construtor com opts + label de posição:

```ts
const POS_LABEL: Record<string, string> = { D: "defensores", M: "meio-campistas", F: "atacantes" };

export class BSDStatsProvider {
  // ... fatores existentes ...
  private positionalTiltOn: boolean;
  private posCache = new Map<string, string>();

  constructor(private client: any, opts: { positionalTilt?: boolean } = {}) {
    if (client == null) throw new Error("BSDStatsProvider requer um BSDClient");
    this.positionalTiltOn = opts.positionalTilt ?? POSITIONAL_TILT_ENABLED;
  }
```

3c. Métodos privados novos (depois de `teamConceded`):

```ts
  private async playerPosition(pid: unknown): Promise<string> {
    const key = String(pid);
    const hit = this.posCache.get(key);
    if (hit) return hit;
    let pos = "?";
    try { pos = String((await this.client.player(pid))?.position ?? "?"); } catch { /* neutro */ }
    this.posCache.set(key, pos);
    return pos;
  }

  /** Concessão do adversário POR POSIÇÃO (D/M/F) no statField de jogador, nos
   * últimos `window` jogos. null se sem dado — quem chama cai pro neutro. */
  private async teamConcededByPosition(
    oppTeamId: string | null, statField: string, window = 10,
  ): Promise<{ byPos: Record<string, number>; total: number; games: number } | null> {
    if (!oppTeamId) return null;
    const tid = String(oppTeamId);
    let events: any;
    try { events = await this.client.events({ team_id: tid, status: "finished", limit: window }); }
    catch { return null; }
    const results: any[] = Array.isArray(events?.results) ? events.results : [];
    const byPos: Record<string, number> = { D: 0, M: 0, F: 0 };
    let total = 0, games = 0;
    for (const ev of results.slice(0, window)) {
      let rows: any[];
      try { rows = (await this.client.eventPlayerStats(ev.id))?.player_stats ?? []; }
      catch { continue; }
      const against = rows.filter((r) => r.player_id != null && String(r.team_id) !== tid);
      if (against.length === 0) continue;
      games++;
      for (const r of against) {
        const v = Number(r[statField] ?? 0);
        if (!(v > 0)) continue;
        const pos = await this.playerPosition(r.player_id);
        if (pos in byPos) byPos[pos] = byPos[pos]! + v;
        total += v;
      }
    }
    if (games === 0 || total <= 0) return null;
    return { byPos, total, games };
  }
```

3d. Em `entityRate`, logo após `const oppMult = this.oppMult(...)`, computar tilt e fold:

```ts
    let tilt = 1.0;
    let concedidoPosicao: string | null = null;
    const pos = String(ctx.posicao ?? "");
    const shareBase = POSITIONAL_SHARE_NACIONAL[market.stat_field]?.[pos] ?? null;
    if (this.positionalTiltOn && shareBase != null && shareBase > 0) {
      const byPos = await this.teamConcededByPosition(this.oppTeamId(ctx), market.stat_field);
      if (byPos != null && byPos.games >= POSITIONAL_MIN_GAMES) {
        const shareAdv = (byPos.byPos[pos] ?? 0) / byPos.total;
        tilt = positionalTilt(shareAdv, shareBase);
        const perGame = (byPos.byPos[pos] ?? 0) / byPos.games;
        concedidoPosicao = `${perGame.toFixed(1)}/jogo a ${POS_LABEL[pos] ?? pos} (${tilt.toFixed(2)}× o típico)`;
      }
    }
    const oppMultFinal = Math.max(
      BSDStatsProvider.OPP_MULT_MIN,
      Math.min(BSDStatsProvider.OPP_MULT_MAX, oppMult * tilt),
    );
```

Trocar o uso de `oppMult` por `oppMultFinal` na chamada de `playerMuFromGames` e no `buildRateTrace` (campo `oppMult: oppMultFinal`). Incluir no retorno: `concedido_posicao: concedidoPosicao`.

3e. `src/providers/types.ts` — `EntityRate` ganha:

```ts
  concedido_posicao?: string | null;
```

- [ ] **Step 4: Run to verify PASS** — `npm test -- providersStats` (suite inteira do arquivo verde — os testes antigos garantem que o caminho neutro não mudou).

- [ ] **Step 5: Run parity gate** — `npm test -- parity` → verde (funções puras intactas).

- [ ] **Step 6: Commit** — `git add src/providers/stats.ts src/providers/types.ts test/providersStats.test.ts && git commit -m "feat: tilt posicional fail-closed no provider (flag default off) + concedido_posicao"`

---

### Task 5: `posicao`, `titularidade`, `alerta_minutos`, `concedido_posicao` no candidato

**Files:**
- Modify: `src/candidates/builder.ts`, `src/manual/analyze.ts`, `src/pipeline.ts`
- Test: `test/builder.test.ts`, `test/manualAnalyze.test.ts`

- [ ] **Step 1: Write the failing tests** — append em `test/builder.test.ts`:

```ts
it("carrega posicao/titularidade/concedido_posicao e deriva alerta_minutos (<60)", () => {
  const c = buildCandidate({
    jogador: "X", linha: 0.5, odd_over: 2.0, odd_under: null, prob_modelo: 0.5, mu: 1.0,
    minutos_esperados: 31, xi_confirmado: true, amostra_jogos: 20,
    concedido_adversario: "n/d", incerteza: "baixa", market_type: "sot",
    posicao: "M", titularidade: "provavel", concedido_posicao: "2.1/jogo a meio-campistas (1.10× o típico)",
  });
  expect(c.posicao).toBe("M");
  expect(c.titularidade).toBe("provavel");
  expect(c.alerta_minutos).toBe(true);
  expect(c.concedido_posicao).toMatch(/meio-campistas/);
});

it("alerta_minutos=false com 60+ e defaults null/confirmado quando ausentes", () => {
  const c = buildCandidate({
    jogador: "X", linha: 0.5, odd_over: 2.0, odd_under: null, prob_modelo: 0.5, mu: 1.0,
    minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 20,
    concedido_adversario: "n/d", incerteza: "baixa", market_type: "gols",
  });
  expect(c.alerta_minutos).toBe(false);
  expect(c.posicao).toBeNull();
  expect(c.titularidade).toBeNull();
  expect(c.concedido_posicao).toBeNull();
});
```

E em `test/manualAnalyze.test.ts` (usando as fixtures de `test/manualFixtures.ts` — lineup das fixtures é não-confirmado):

```ts
it("pré-lineup: candidato de jogador sai com titularidade=provavel e posicao do squad", async () => {
  // usar o cenário de jogador já existente no arquivo; nos candidatos retornados:
  // expect(c.titularidade).toBe("provavel");
  // expect(typeof c.posicao === "string" || c.posicao === null).toBe(true);
});
```

(Adaptar ao formato real das fixtures do arquivo — o teste deve afirmar `titularidade === "provavel"` num candidato de mercado de jogador.)

- [ ] **Step 2: Run to verify FAIL** — `npm test -- builder manualAnalyze`.

- [ ] **Step 3: Implement**:

3a. `src/candidates/builder.ts` — `BuildCandidateArgs` ganha:

```ts
  posicao?: string | null;
  titularidade?: "confirmado" | "provavel" | "fora_do_xi" | "desconhecido" | null;
  concedido_posicao?: string | null;
```

E no objeto `out`, após `market_type`:

```ts
    posicao: a.posicao ?? null,
    titularidade: a.titularidade ?? null,
    alerta_minutos: a.minutos_esperados < 60,
    concedido_posicao: a.concedido_posicao ?? null,
```

3b. `src/manual/analyze.ts::playerCandidates` — dentro do loop `for (const od of casados)`, antes do `out.push`:

```ts
    const titularidade = xiTeamIds.size > 0
      ? (xiTeamIds.has(od.player_id) ? "confirmado" : "fora_do_xi")
      : "provavel";
```

No `ctx`, adicionar `posicao: entity.posicao ?? ""`. No `buildCandidate`, adicionar:

```ts
      posicao: entity.posicao ?? null, titularidade,
      concedido_posicao: rate.concedido_posicao ?? null,
```

3c. `src/pipeline.ts::playerCount` — mesmo padrão (consistência da rota single-market): no `ctx`, `posicao: entity.posicao ?? ""`; no `buildCandidate`:

```ts
        posicao: entity.posicao ?? null,
        titularidade: xiTeamIds.size > 0
          ? (xiTeamIds.has(String(entity.id)) ? "confirmado" : "fora_do_xi")
          : "provavel",
        concedido_posicao: rate.concedido_posicao ?? null,
```

- [ ] **Step 4: Run to verify PASS** — `npm test -- builder manualAnalyze pipeline`.

- [ ] **Step 5: Commit** — `git add src/candidates/builder.ts src/manual/analyze.ts src/pipeline.ts test/builder.test.ts test/manualAnalyze.test.ts && git commit -m "feat: posicao, titularidade, alerta_minutos e concedido_posicao no dossie do candidato"`

---

### Task 6: Estrela pula candidato com `alerta_minutos`

**Files:**
- Modify: `src/candidates/rank.ts`
- Test: `test/rank.test.ts`

- [ ] **Step 1: Write the failing tests** — append em `test/rank.test.ts`:

```ts
it("estrela vai pro primeiro SEM alerta_minutos; ordem não muda", () => {
  const out = rankCandidates([
    { jogador: "banco", prob_modelo: 0.6, ev: 0.5, alerta_minutos: true },
    { jogador: "limpo", prob_modelo: 0.55, ev: 0.3, alerta_minutos: false },
  ]);
  expect(out.map((c) => c.jogador)).toEqual(["banco", "limpo"]); // ordem intacta
  expect(out[0]!.recomendado).toBe(false);
  expect(out[1]!.recomendado).toBe(true);
});

it("todos com alerta → o primeiro leva a estrela mesmo assim", () => {
  const out = rankCandidates([
    { jogador: "a", prob_modelo: 0.6, ev: 0.5, alerta_minutos: true },
    { jogador: "b", prob_modelo: 0.2, ev: 0.9, alerta_minutos: true },
  ]);
  expect(out[0]!.recomendado).toBe(true);
});

it("candidato sem o campo conta como elegível (compat)", () => {
  const out = rankCandidates([{ jogador: "a", prob_modelo: 0.6, ev: 0.5 }]);
  expect(out[0]!.recomendado).toBe(true);
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- rank`.

- [ ] **Step 3: Implement** — em `src/candidates/rank.ts`, trocar a última linha de `rankCandidates`:

```ts
  // Estrela: primeiro da ordem SEM risco de minutos (pode estar no banco /
  // sair cedo). Se todos tiverem alerta, o primeiro leva a estrela mesmo assim
  // — ninguém é removido; o selo avisa.
  const starIdx = withRisk.findIndex((c) => (c as Record<string, unknown>)["alerta_minutos"] !== true);
  const star = starIdx === -1 ? 0 : starIdx;
  return withRisk.map((c, i) => ({ ...c, recomendado: i === star }));
```

Atualizar o docstring da função (a estrela não é mais "só no primeiro").

- [ ] **Step 4: Run to verify PASS** — `npm test -- rank`.

- [ ] **Step 5: Commit** — `git add src/candidates/rank.ts test/rank.test.ts && git commit -m "feat: estrela pula candidato com alerta_minutos (ninguem some)"`

---

### Task 7: `escopo_historico` na rota manual

**Files:**
- Modify: `src/manual/schema.ts`, `src/manual/analyze.ts`
- Test: `test/manualSchema.test.ts`, `test/manualAnalyze.test.ts`

- [ ] **Step 1: Write the failing tests** — append em `test/manualSchema.test.ts`:

```ts
it("aceita escopo_historico opcional (default todos) e rejeita valor inválido", () => {
  const base = { event_id: "1", coletado_em: "2026-06-10", odds: [] };
  expect(parseManualOdds(base).escopo_historico).toBe("todos");
  expect(parseManualOdds({ ...base, escopo_historico: "selecao" }).escopo_historico).toBe("selecao");
  expect(() => parseManualOdds({ ...base, escopo_historico: "errado" })).toThrow();
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- manualSchema`.

- [ ] **Step 3: Implement**:

3a. `src/manual/schema.ts`:

```ts
const bodySchema = z.object({
  event_id: z.string(),
  coletado_em: z.string(),
  odds: z.array(z.unknown()),
  escopo_historico: z.enum(["todos", "selecao", "clube"]).default("todos"),
});
```

`ManualOddsInput` ganha `escopo_historico: string;` e o return de `parseManualOdds` inclui `escopo_historico: b.escopo_historico`.

3b. `src/manual/analyze.ts` — `playerCandidates` recebe o escopo: trocar `escopo_historico: "todos"` no ctx por `escopo_historico: escopo` e passar `input.escopo_historico` como parâmetro novo da função (threading explícito da assinatura).

- [ ] **Step 4: Run to verify PASS** — `npm test -- manualSchema manualAnalyze`.

- [ ] **Step 5: Commit** — `git add src/manual/schema.ts src/manual/analyze.ts test/manualSchema.test.ts && git commit -m "feat: escopo_historico opcional na rota manual (todos|selecao|clube)"`

---

### Task 8: Prompt revisor ancorado (anti-alucinação) + titularidade

**Files:**
- Modify: `src/ai/reviewer.ts`
- Test: `test/reviewer.test.ts`

- [ ] **Step 1: Write the failing test** — append em `test/reviewer.test.ts`:

```ts
import { PROMPT_REVISOR } from "../src/ai/reviewer.js";

describe("PROMPT_REVISOR ancorado", () => {
  it("proíbe conhecimento externo e ancora posição no campo posicao", () => {
    expect(PROMPT_REVISOR).toMatch(/posicao/);
    expect(PROMPT_REVISOR).toMatch(/conhecimento externo|fora do JSON/i);
    expect(PROMPT_REVISOR).toMatch(/titularidade/);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npm test -- reviewer`.

- [ ] **Step 3: Implement** — em `src/ai/reviewer.ts`, inserir no `PROMPT_REVISOR`, logo após o bloco "JULGAMENTO" e antes de "LINGUAGEM":

```ts
  // — ancoragem (anti-alucinação) —
  "ANCORAGEM (OBRIGATÓRIO): além de não inventar número, NÃO use conhecimento externo " +
  "sobre times/jogadores (fase, importância do jogo, estilo, clima, 'defende bem fora de casa'). " +
  "TODA afirmação deve ser derivável de um campo recebido: posição SOMENTE do campo 'posicao' " +
  "(G=goleiro, D=defensor, M=meio-campo, F=atacante — não invente função além disso); força/fraqueza " +
  "do adversário SOMENTE de 'concedido_adversario' e 'concedido_posicao'; tempo em campo de " +
  "'minutos_esperados'; status de escalação de 'titularidade' (confirmado|provavel|fora_do_xi) e " +
  "'alerta_minutos'. Quando titularidade != 'confirmado' ou alerta_minutos=true, o risco de banco/" +
  "substituição é o alerta PRIORITÁRIO. " +
```

- [ ] **Step 4: Run to verify PASS** — `npm test -- reviewer` (suite inteira do arquivo, inclusive os testes de degradação existentes).

- [ ] **Step 5: Commit** — `git add src/ai/reviewer.ts test/reviewer.test.ts && git commit -m "feat: prompt revisor ancorado (posicao/titularidade, proibe conhecimento externo)"`

---

### Task 9: Mini-backtest do tilt (guarda-corpo) + decisão da flag

**Files:**
- Create: `scripts/backtest-tilt.mts`

- [ ] **Step 1: Create script** (replay anti-espiada com vs sem tilt; usa as métricas existentes):

```ts
// Mini-backtest do tilt posicional: Brier/ECE com vs sem tilt, em jogador-jogos
// de seleção. Anti-espiada: prediz o jogo N usando só jogos anteriores a N.
// Uso: npx tsx scripts/backtest-tilt.mts
import "dotenv/config";
import { BSDClient } from "../src/bsd/client.js";
import { getRequired } from "../src/config.js";
import { playerMuFromGames } from "../src/model/assemble.js";
import { probOverLine } from "../src/model/sotModel.js";
import { opponentMultiplier, homeAwayMultiplier, positionalTilt } from "../src/model/adjustments.js";
import { MARKETS } from "../src/model/markets.js";
import { POSITIONAL_SHARE_NACIONAL, POSITIONAL_MIN_GAMES } from "../src/model/params.js";
import { brierScore, expectedCalibrationError } from "../src/backtest/calibration.js";

const LEAGUES = [31, 58, 59, 60, 61, 62];
const EVENTS_PER_LEAGUE = 10;
const TARGET = 200; // mínimo de jogador-jogos por mercado
const LINE = 1.5;
const FIELDS = ["total_tackle", "shots_on_target", "total_shots"] as const;
const MK: Record<string, string> = { total_tackle: "desarmes", shots_on_target: "sot", total_shots: "finalizacoes" };

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const posCache = new Map<string, string>();
async function positionOf(pid: unknown): Promise<string> {
  const k = String(pid);
  if (posCache.has(k)) return posCache.get(k)!;
  let p = "?";
  try { p = String((await client.player(pid))?.position ?? "?"); } catch { /* neutro */ }
  posCache.set(k, p);
  return p;
}

/** Concessão por posição do adversário usando SÓ jogos antes de `beforeDate`. */
async function concededByPosBefore(oppId: string, statField: string, beforeDate: string) {
  let evs: any;
  try { evs = await client.events({ team_id: oppId, status: "finished", limit: 30 }); } catch { return null; }
  const past = (evs?.results ?? []).filter((e: any) => String(e.event_date ?? "") < beforeDate).slice(0, 10);
  const byPos: Record<string, number> = { D: 0, M: 0, F: 0 };
  let total = 0, games = 0, totalAll = 0;
  for (const ev of past) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    const against = rows.filter((r) => r.player_id != null && String(r.team_id) !== oppId);
    if (!against.length) continue;
    games++;
    for (const r of against) {
      const v = Number(r[statField] ?? 0);
      totalAll += v;
      if (!(v > 0)) continue;
      const pos = await positionOf(r.player_id);
      if (pos in byPos) { byPos[pos] = byPos[pos]! + v; total += v; }
    }
  }
  if (games < POSITIONAL_MIN_GAMES || total <= 0) return null;
  return { byPos, total, games, concededPerGame: totalAll / games };
}

const preds: Record<string, { base: number[]; tilt: number[]; actual: number[] }> = {};
for (const f of FIELDS) preds[f] = { base: [], tilt: [], actual: [] };

outer:
for (const lg of LEAGUES) {
  let evs: any;
  try { evs = await client.events({ league_id: lg, status: "finished", limit: EVENTS_PER_LEAGUE }); } catch { continue; }
  for (const ev of (evs?.results ?? []).slice(0, EVENTS_PER_LEAGUE)) {
    let rows: any[];
    try { rows = (await client.eventPlayerStats(ev.id))?.player_stats ?? []; } catch { continue; }
    const evDate = String(ev.event_date ?? "");
    for (const r of rows) {
      if (r.player_id == null || !(Number(r.minutes_played ?? 0) >= 60)) continue;
      const isHome = String(r.team_id) === String(ev.home_team_id);
      const oppId = String(isHome ? ev.away_team_id : ev.home_team_id);
      let hist: any;
      try { hist = await client.playerStats(r.player_id); } catch { continue; }
      const games = [...(hist?.results ?? [])].reverse()
        .filter((g: any) => String(g.event_id) !== String(ev.id));
      if (games.length < 10) continue;
      const pos = await positionOf(r.player_id);
      const ha = homeAwayMultiplier(isHome, 1.08, 0.92);
      for (const f of FIELDS) {
        const mkt = MARKETS[MK[f]!]!;
        const byPos = await concededByPosBefore(oppId, f, evDate);
        const leagueAvg = mkt.concede_baseline_nacional || mkt.concede_baseline;
        const oppMult = byPos
          ? Math.max(0.7, Math.min(1.4, opponentMultiplier(byPos.concededPerGame, leagueAvg)))
          : 1.0;
        const calc = playerMuFromGames(games, f, mkt.prior_rate, mkt.prior_strength, oppMult, ha, 90);
        if (!calc) continue;
        const shareBase = POSITIONAL_SHARE_NACIONAL[f]?.[pos] ?? null;
        const tilt = byPos && shareBase
          ? positionalTilt((byPos.byPos[pos] ?? 0) / byPos.total, shareBase) : 1.0;
        const muTilt = Math.max(0.7, Math.min(1.4, oppMult * tilt)) / oppMult * calc.mu;
        const actual = Number(r[f] ?? 0) > LINE ? 1 : 0;
        preds[f]!.base.push(probOverLine(calc.mu, LINE, mkt.nb_dispersion));
        preds[f]!.tilt.push(probOverLine(muTilt, LINE, mkt.nb_dispersion));
        preds[f]!.actual.push(actual);
      }
    }
    const n = preds["total_tackle"]!.actual.length;
    console.error(`liga ${lg} evento ${ev.id} — n=${n}`);
    if (n >= TARGET) break outer;
  }
}

for (const f of FIELDS) {
  const p = preds[f]!;
  if (p.actual.length === 0) { console.log(`${f}: sem dados`); continue; }
  const bb = brierScore(p.base, p.actual), bt = brierScore(p.tilt, p.actual);
  const eb = expectedCalibrationError(p.base, p.actual), et = expectedCalibrationError(p.tilt, p.actual);
  console.log(`${f} (n=${p.actual.length}, over ${LINE}):`);
  console.log(`  Brier  sem tilt ${bb.toFixed(4)} | com tilt ${bt.toFixed(4)} | delta ${(((bt - bb) / bb) * 100).toFixed(1)}%`);
  console.log(`  ECE    sem tilt ${eb.toFixed(4)} | com tilt ${et.toFixed(4)} | delta ${(((et - eb) / eb) * 100).toFixed(1)}%`);
}
```

- [ ] **Step 2: Run** — `npx tsx scripts/backtest-tilt.mts` (demorado; progresso no stderr). Anotar Brier/ECE dos 3 mercados.

- [ ] **Step 3: Decidir a flag** — critério do spec: **com tilt não degrada Brier nem ECE além de 5% relativo** em nenhum dos 3 mercados:
  - Não degradou → `POSITIONAL_TILT_ENABLED = true` em `src/model/params.ts`, com comentário datando a medição e os números.
  - Degradou → flag fica `false`; números vão pro ROADMAP (Task 11) e o tilt fica disponível mas desligado.

- [ ] **Step 4: Run full suite** — `npm test` (a mudança da flag pode afetar testes que usam o default — os testes da Task 4 passam flag explícita, então devem seguir verdes).

- [ ] **Step 5: Commit** — `git add scripts/backtest-tilt.mts src/model/params.ts && git commit -m "feat: mini-backtest do tilt posicional + decisao da flag (numeros no commit)"` — incluir os números medidos no corpo do commit.

---

### Task 10: Front — tipos, helpers e badges

**Files (repo `C:\Users\gabri\Documents\projects\odd-analyzer-frontend`):**
- Modify: `lib/types.ts`, `lib/format.ts`, `components/CandidatesByPlayer.tsx`, `components/CandidatesTable.tsx`, `components/RecommendationCard.tsx`
- Test: `lib/format.test.ts`

- [ ] **Step 1: Types** — em `lib/types.ts`, dentro de `interface Candidate`, após `market_type: string;`:

```ts
  posicao?: string | null;
  titularidade?: "confirmado" | "provavel" | "fora_do_xi" | "desconhecido" | null;
  alerta_minutos?: boolean;
  concedido_posicao?: string | null;
```

- [ ] **Step 2: Write the failing tests** — append em `lib/format.test.ts`:

```ts
import { titularidadeInfo, posicaoLabel } from "@/lib/format";

describe("titularidadeInfo", () => {
  it("provavel + alerta de minutos → aviso de banco", () => {
    const t = titularidadeInfo({ titularidade: "provavel", alerta_minutos: true } as never);
    expect(t?.texto).toMatch(/banco/);
    expect(t?.tone).toBe("warn");
  });
  it("provavel sem alerta → escalação prevista", () => {
    const t = titularidadeInfo({ titularidade: "provavel", alerta_minutos: false } as never);
    expect(t?.texto).toMatch(/prevista/);
  });
  it("confirmado → null (o tag 'titular ✓' existente cobre)", () => {
    expect(titularidadeInfo({ titularidade: "confirmado", alerta_minutos: false } as never)).toBeNull();
  });
});

describe("posicaoLabel", () => {
  it("traduz G/D/M/F e devolve null pro resto", () => {
    expect(posicaoLabel("M")).toBe("meio-campo");
    expect(posicaoLabel("F")).toBe("atacante");
    expect(posicaoLabel("?")).toBeNull();
    expect(posicaoLabel(null)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify FAIL** — (no repo do front) `npm test -- format`.

- [ ] **Step 4: Implement helpers** — append em `lib/format.ts`:

```ts
const POSICAO_PT: Record<string, string> = { G: "goleiro", D: "defensor", M: "meio-campo", F: "atacante" };

export function posicaoLabel(pos: string | null | undefined): string | null {
  if (!pos) return null;
  return POSICAO_PT[pos] ?? null;
}

/** Selo de titularidade pro meio-termo pré-lineup: ninguém some, mas o risco de
 * banco fica visível. Confirmado → null (o tag "titular ✓" já cobre). */
export function titularidadeInfo(
  c: Pick<Candidate, "titularidade" | "alerta_minutos">,
): { texto: string; tone: "warn" | "bad" } | null {
  if (c.titularidade === "provavel") {
    return c.alerta_minutos
      ? { texto: "escalação prevista — pode começar no banco", tone: "warn" }
      : { texto: "escalação prevista", tone: "warn" };
  }
  if (c.titularidade === "fora_do_xi") return { texto: "fora do time confirmado", tone: "bad" };
  if (c.titularidade === "desconhecido") return { texto: "sem escalação — confirme antes", tone: "warn" };
  return null;
}
```

- [ ] **Step 5: Run to verify PASS** — `npm test -- format`.

- [ ] **Step 6: Badges nos componentes**:

6a. `components/CandidatesByPlayer.tsx` — importar `titularidadeInfo, posicaoLabel` de `@/lib/format`. No header do grupo (junto ao nome do jogador), usar a primeira linha do grupo:

```tsx
          <div className="flex items-center justify-between border-b border-line-soft px-3 py-2">
            <span className="display text-[0.95rem] font-bold text-fg">
              {g.jogador}
              {posicaoLabel(g.linhas[0]?.posicao) && (
                <span className="ml-2 text-[0.62rem] font-normal text-faint">{posicaoLabel(g.linhas[0]?.posicao)}</span>
              )}
            </span>
            <span className="flex items-center gap-2">
              {(() => { const t = titularidadeInfo(g.linhas[0]!); return t ? <Tag tone={t.tone}>{t.texto}</Tag> : null; })()}
              {g.linhas.length > 1 && (
                <span className="text-[0.62rem] text-faint">{g.linhas.length} linhas — escolha uma</span>
              )}
            </span>
          </div>
```

6b. `components/RecommendationCard.tsx` — importar `titularidadeInfo, posicaoLabel`. Na linha de tags do topo, após o `stance`:

```tsx
        {(() => { const t = titularidadeInfo(best); return t ? <Tag tone={t.tone}>{t.texto}</Tag> : null; })()}
```

E após o parágrafo do nome/odd, quando houver alerta de minutos:

```tsx
      {best.alerta_minutos && (
        <p className="mt-2 rounded-sm border border-warn/40 bg-[rgba(255,193,7,0.07)] px-3 py-2 text-[0.78rem] text-fg">
          ⚠ minutos esperados: <strong>{best.minutos_esperados.toFixed(0)} min</strong> — confirme a escalação oficial antes de apostar.
        </p>
      )}
```

(Se o tema não tiver a cor `warn` em borda, usar as classes do tom "warn" que o `Tag` já usa.)

6c. `components/CandidatesTable.tsx` — trocar o bloco do tag de titularidade:

```tsx
              {c.xi_confirmado && c.titularidade === "confirmado"
                ? <Tag tone="cyan">titular ✓</Tag>
                : (() => { const t = titularidadeInfo(c); return t ? <Tag tone={t.tone}>{t.texto}</Tag> : <Tag tone="warn">provável</Tag>; })()}
              {posicaoLabel(c.posicao) && <Tag tone="muted">{posicaoLabel(c.posicao)}</Tag>}
```

E, junto de `adv. concede {c.concedido_adversario}`:

```tsx
              {c.concedido_posicao && (
                <span className="text-[0.62rem] text-faint">· {c.concedido_posicao}</span>
              )}
```

- [ ] **Step 7: Verify** — `npm test` e `npx tsc --noEmit` no repo do front.

- [ ] **Step 8: Commit (repo do front)** — `git add lib/types.ts lib/format.ts lib/format.test.ts components/CandidatesByPlayer.tsx components/CandidatesTable.tsx components/RecommendationCard.tsx && git commit -m "feat: selo de titularidade, posicao e concessao por posicao nos cards"`

---

### Task 11: Validação final + E2E real + docs

**Files:**
- Modify: `docs/ROADMAP.md`, `docs/PITCH.md`, `docs/superpowers/specs/2026-06-10-melhorias-analise-manual-design.md`

- [ ] **Step 1: Suite + typecheck completos (backend)** — `npm test && npm run typecheck` → tudo verde (anotar a contagem de testes pro ROADMAP).

- [ ] **Step 2: E2E real de regressão** — recriar o runner temporário (mesmo corpo da investigação de 10/06) e rodar nos dois jogos com as odds de `odds/`:

```ts
// tmp-e2e-run.mts (raiz; apagar depois)
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { BSDClient } from "./src/bsd/client.js";
import { getRequired } from "./src/config.js";
import { analyzeManualService } from "./src/service.js";
import { InMemoryRepo } from "./src/store/repo.js";

const client = new BSDClient(getRequired("BZZOIRO_API_KEY"));
const repo = new InMemoryRepo();
for (const j of [
  { event_id: "9099", file: "odds/england-10-06-26.md", out: "tmp-out-england-v2.json" },
  { event_id: "206719", file: "odds/portugal-10-06-26.md", out: "tmp-out-portugal-v2.json" },
]) {
  const odds = JSON.parse(readFileSync(j.file, "utf-8"));
  const out = await analyzeManualService(client, { event_id: j.event_id, coletado_em: new Date().toISOString(), odds }, { repo, diagnostics: true });
  writeFileSync(j.out, JSON.stringify(out, null, 2));
  console.log(j.file, "ok — aprovados:", out.candidatos?.length);
}
```

Conferir nos JSONs: (a) Portugal — Ndidi segue listado mas SEM estrela se houver alternativa limpa (ou com estrela+selo se for o único); `titularidade: "provavel"` e `alerta_minutos: true` presentes; (b) England — Rice segue recomendado; `posicao` presente; se a flag do tilt ligou, `concedido_posicao` aparece nos candidatos de desarme; (c) revisão da IA sem afirmação não-ancorada (leitura manual dos textos). Apagar `tmp-e2e-run.mts` depois.

- [ ] **Step 3: Spec amend** — no spec, seção 1: registrar o 4º valor `"fora_do_xi"` (lineup confirmado exclui o jogador — caso que o corte "titular" já reprova; o valor existe pro dossiê dos reprovados).

- [ ] **Step 4: ROADMAP.md** — seção nova no topo (e varrer o fundo por contradições, regra da casa): melhorias da análise manual (titularidade/estrela, posição na IA, prompt ancorado, escopo na rota manual); tilt posicional com números do mini-backtest e estado da flag; atualizar contagem de testes e data no cabeçalho.

- [ ] **Step 5: PITCH.md** — linguagem leiga: (a) selo "pode começar no banco" e a estrela que pula quem tem risco de minutos (ninguém é escondido); (b) "o confronto agora enxerga a POSIÇÃO: não é só 'a Costa Rica deixa desarmar muito', é 'deixa desarmar muito QUEM JOGA NO MEIO, como o Rice'" (se a flag ligou; senão, contar que foi medido e ficou em espera por honestidade); (c) a segunda opinião da IA agora é proibida de usar "fatos" de fora dos números.

- [ ] **Step 6: Commit final** — `git add docs/ && git commit -m "docs: ROADMAP+PITCH+spec refletem melhorias da analise manual e veredito do tilt"`

---

## Self-review (feito na escrita)

- **Cobertura do spec:** §1 titularidade→Tasks 5/6/10 · §2 posição→Task 5 · §3 prompt→Task 8 · §4 escopo→Task 7 · §5 tilt→Tasks 1–4/9 · §6 front→Task 10 · §7 docs→Task 11. Erros/bordas: fail-closed coberto nos testes da Task 4; escopo inválido na Task 7.
- **Tipos consistentes:** `positionalTilt(shareAdv, shareBase)` (Tasks 1/4/9); `concedido_posicao` string|null (Tasks 4/5/10); `titularidade` união de 4 valores (Tasks 5/10 + spec amend na Task 11); `BSDStatsProvider(client, { positionalTilt })` (Tasks 4/9 — o script da Task 9 usa as funções puras direto, sem o provider, para controlar o anti-espiada).
- **Sem placeholders:** os shares da Task 3 vêm da execução da Task 2 (medição em runtime, estrutura e formato exatos dados); todo o resto tem código completo.
