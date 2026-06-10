# Coletar Odds v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistência no F5, layout em fases, drawer de detalhe do jogador em linguagem leiga, e `stats_detalhadas` fluindo pro front e pra IA revisora.

**Architecture:** Backend (este repo) ganha um bloco descritivo `stats_detalhadas` por candidato — função pura em `src/model/`, computada no `BSDStatsProvider` a partir dos mesmos jogos que já busca (+1 chamada `/events/` por time, cacheada, pra mapear casa/fora), passando por `buildCandidate` até a API e o JSON do revisor. Frontend (repo `odd-analyzer-frontend`) refatora `/coletar`: liga+jogo na URL (`useUrlState` existente), lote+resultado em localStorage por evento, fases coleta/resultado com barra compacta, candidatos colapsados com filtros, e drawer lateral de detalhe.

**Tech Stack:** Node/TS strict ESM (backend, Vitest), Next.js 16 + React 19 + Tailwind v4 (front, Vitest env node).

**Spec:** `docs/superpowers/specs/2026-06-10-coletar-odds-v2-design.md`

---

## Contexto pro executor (leia antes)

- **Dois repos.** Backend: `C:\Users\gabri\Documents\projects\odd-analyzer` (Tasks 1–5). Frontend: `C:\Users\gabri\Documents\projects\odd-analyzer-frontend` (Tasks 6–12). Commits em cada repo separadamente.
- **NÃO troque de branch** (sem `git checkout`/`switch`/`reset`) — trabalhe na branch atual dos dois repos. Subagentes compartilham o working tree.
- **Convenção inegociável:** identificadores de código em INGLÊS camelCase; chaves de DADOS no fio (JSON) em snake_case PT (`stats_detalhadas`, `media_5`...). Leia o `CLAUDE.md` de cada repo.
- Comandos backend (da raiz do repo): `npm test` (Vitest), `npm run typecheck`. Frontend: `npm test`, `npx tsc --noEmit`, `npm run build`.
- **Money-path intocado:** `stats_detalhadas` é descritivo. Não toque em `src/model/sotModel.ts`, `shrinkage.ts`, `devig.ts`, `ev.ts` nem em `test/parity/`.
- **Fato verificado ao vivo (2026-06-10):** o histórico por-jogo do BSD (`/players/{id}/stats/`) traz `event_id`, `team_id`, `minutes_played` e os stat fields, mas **não** traz mando. O endpoint `/events/?team_id=X&status=finished` devolve `id` + `home_team_id` por evento → mapa `event_id → home_team_id` resolve casa/fora com 1 chamada por time distinto (cache TTL 300s já existente no client).

---

## Backend — `C:\Users\gabri\Documents\projects\odd-analyzer`

### Task 1: Função pura `detailedStats`

**Files:**
- Create: `src/model/detailedStats.ts`
- Test: `test/detailedStats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/detailedStats.test.ts
import { describe, it, expect } from "vitest";
import { detailedStats } from "../src/model/detailedStats.js";

// jogos em ordem CRESCENTE (recente no fim), como o resto do motor
const g = (tackles: number, min: number, eventId: string, teamId = "T1") => ({
  total_tackle: tackles, minutes_played: min, event_id: eventId, team_id: teamId,
});

describe("detailedStats", () => {
  it("médias 5/10, últimos valores (recente primeiro) e minutos médios", () => {
    const games = [g(1, 90, "e1"), g(2, 90, "e2"), g(3, 80, "e3"), g(4, 90, "e4"), g(5, 70, "e5"), g(6, 90, "e6")];
    const s = detailedStats(games, "total_tackle");
    expect(s.media_5).toBeCloseTo((2 + 3 + 4 + 5 + 6) / 5, 9); // últimos 5
    expect(s.media_10).toBeCloseTo((1 + 2 + 3 + 4 + 5 + 6) / 6, 9); // só 6 jogos
    expect(s.ultimos_valores).toEqual([6, 5, 4, 3, 2]); // recente primeiro
    expect(s.minutos_medios).toBeCloseTo((90 + 90 + 80 + 90 + 70 + 90) / 6, 9);
  });

  it("split casa/fora vem do homeMap; jogo fora do mapa fica de fora do split", () => {
    const games = [g(2, 90, "e1"), g(4, 90, "e2"), g(6, 90, "e3")];
    const homeMap = new Map([["e1", "T1"], ["e2", "OUTRO"]]); // e3 desconhecido
    const s = detailedStats(games, "total_tackle", homeMap);
    expect(s.media_casa).toBeCloseTo(2, 9);
    expect(s.jogos_casa).toBe(1);
    expect(s.media_fora).toBeCloseTo(4, 9);
    expect(s.jogos_fora).toBe(1);
  });

  it("sem mapa → casa/fora null (nunca estima); sem jogos → tudo null/vazio", () => {
    const s1 = detailedStats([g(2, 90, "e1")], "total_tackle");
    expect(s1.media_casa).toBeNull();
    expect(s1.media_fora).toBeNull();
    const s0 = detailedStats([], "total_tackle");
    expect(s0.media_5).toBeNull();
    expect(s0.media_10).toBeNull();
    expect(s0.ultimos_valores).toEqual([]);
    expect(s0.minutos_medios).toBeNull();
  });

  it("stat ausente num jogo conta como 0 (não NaN)", () => {
    const games = [{ minutes_played: 90, event_id: "e1", team_id: "T1" }, g(4, 90, "e2")];
    const s = detailedStats(games, "total_tackle");
    expect(s.media_10).toBeCloseTo(2, 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/detailedStats.test.ts`
Expected: FAIL — `Cannot find module '../src/model/detailedStats.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/model/detailedStats.ts
type Game = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface StatsDetalhadas {
  media_5: number | null;
  media_10: number | null;
  ultimos_valores: number[];
  minutos_medios: number | null;
  media_casa: number | null;
  media_fora: number | null;
  jogos_casa: number;
  jogos_fora: number;
}

/** Estatísticas DESCRITIVAS pro detalhe do jogador e pro JSON da IA revisora.
 * NÃO entra no money-path (prob/edge/EV seguem em assemble/sotModel).
 * `games` em ordem CRESCENTE (recente no fim). `homeMap`: event_id → home_team_id;
 * jogo ausente do mapa fica de fora do split casa/fora — nunca estimar mando. */
export function detailedStats(
  games: Game[], statField: string, homeMap: Map<string, string> = new Map(),
): StatsDetalhadas {
  const mean = (xs: number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const last10 = games.slice(-10);
  const last5 = games.slice(-5);
  const vals = (gs: Game[]) => gs.map((g) => num(g[statField]));

  const casa: number[] = [];
  const fora: number[] = [];
  for (const g of last10) {
    const home = homeMap.get(String(g["event_id"]));
    if (home === undefined) continue;
    (home === String(g["team_id"]) ? casa : fora).push(num(g[statField]));
  }

  return {
    media_5: mean(vals(last5)),
    media_10: mean(vals(last10)),
    ultimos_valores: vals(last5).reverse(),
    minutos_medios: mean(last10.map((g) => num(g["minutes_played"]))),
    media_casa: mean(casa),
    media_fora: mean(fora),
    jogos_casa: casa.length,
    jogos_fora: fora.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/detailedStats.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/model/detailedStats.ts test/detailedStats.test.ts
git commit -m "feat: detailedStats — bloco descritivo por jogador (fora do money-path)"
```

### Task 2: Provider computa `stats_detalhadas` (com mapa casa/fora)

**Files:**
- Modify: `src/providers/types.ts` (interface `EntityRate`)
- Modify: `src/providers/stats.ts` (`BSDStatsProvider.entityRate` + novo helper privado `homeAwayMap`)
- Test: `test/providersStats.test.ts` (adicionar bloco)

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `test/providersStats.test.ts` (siga o estilo dos fakes existentes no arquivo — client objeto com métodos async):

```ts
describe("stats_detalhadas", () => {
  it("computa médias e casa/fora via mapa de eventos do time", async () => {
    const client: any = {
      playerStats: async () => ({ results: [ // BSD entrega recente-primeiro
        { total_tackle: 6, minutes_played: 90, event_id: "e3", team_id: "100" },
        { total_tackle: 4, minutes_played: 90, event_id: "e2", team_id: "100" },
        { total_tackle: 2, minutes_played: 90, event_id: "e1", team_id: "100" },
      ] }),
      events: async (filtros: any) => {
        if (String(filtros.team_id) === "100") {
          return { results: [
            { id: "e3", home_team_id: "100" }, // casa
            { id: "e2", home_team_id: "999" }, // fora
            { id: "e1", home_team_id: "100" }, // casa
          ] };
        }
        return { results: [] }; // adversário (teamConceded) sem dado → neutro
      },
      eventStats: async () => ({ stats: {} }),
    };
    const provider = new BSDStatsProvider(client, { positionalTilt: false });
    const market = MARKETS["desarmes"]!;
    const rate = await provider.entityRate("p1", market, {
      event: { home_team: { id: "100" }, away_team: { id: "200" } },
      entity_team_id: "100", is_home: true, league_avg_conceded: 1.0,
    });
    expect(rate).not.toBeNull();
    const s = rate!.stats_detalhadas!;
    expect(s.media_5).toBeCloseTo(4, 9);          // (2+4+6)/3
    expect(s.ultimos_valores).toEqual([6, 4, 2]); // recente primeiro
    expect(s.media_casa).toBeCloseTo(4, 9);       // e1=2, e3=6
    expect(s.jogos_casa).toBe(2);
    expect(s.media_fora).toBeCloseTo(4, 9);       // e2=4
    expect(s.jogos_fora).toBe(1);
    expect(s.minutos_medios).toBeCloseTo(90, 9);
  });

  it("client.events falhando → split null, resto preenchido (degrada, não quebra)", async () => {
    const client: any = {
      playerStats: async () => ({ results: [
        { total_tackle: 3, minutes_played: 90, event_id: "e1", team_id: "100" },
      ] }),
      events: async () => { throw new Error("rede"); },
      eventStats: async () => ({ stats: {} }),
    };
    const provider = new BSDStatsProvider(client, { positionalTilt: false });
    const rate = await provider.entityRate("p1", MARKETS["desarmes"]!, {
      event: { home_team: { id: "100" }, away_team: { id: "200" } },
      entity_team_id: "100", is_home: true, league_avg_conceded: 1.0,
    });
    const s = rate!.stats_detalhadas!;
    expect(s.media_5).toBeCloseTo(3, 9);
    expect(s.media_casa).toBeNull();
    expect(s.media_fora).toBeNull();
  });
});
```

Nota: confira os imports já presentes no topo do arquivo (`BSDStatsProvider`, `MARKETS`) e adicione o que faltar (`import { MARKETS } from "../src/model/markets.js";`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/providersStats.test.ts`
Expected: FAIL — `stats_detalhadas` undefined (e/ou erro de tipo)

- [ ] **Step 3: Implement**

Em `src/providers/types.ts`:

```ts
import type { StatsDetalhadas } from "../model/detailedStats.js"; // junto aos imports

export interface EntityRate {
  mu: number;
  minutos_esperados: number;
  xi_confirmado: boolean;
  amostra_jogos: number;
  concedido_adversario: string;
  incerteza: string;
  trace?: RateTrace;
  concedido_posicao?: string | null;
  stats_detalhadas?: StatsDetalhadas;
}
```

Em `src/providers/stats.ts`:

1. Import: `import { detailedStats } from "../model/detailedStats.js";`
2. Novo método privado na classe `BSDStatsProvider` (perto de `teamConceded`):

```ts
/** event_id → home_team_id pros jogos do histórico do jogador. 1 chamada
 * /events/ por time distinto (cacheada no client). Falha → mapa parcial:
 * o split casa/fora degrada pra null, nunca estima mando. */
private async homeAwayMap(games: any[], window = 10): Promise<Map<string, string>> {
  const teamIds = [...new Set(games.slice(-window).map((g) => String(g?.team_id ?? "")))]
    .filter((t) => t && t !== "undefined" && t !== "null");
  const map = new Map<string, string>();
  for (const tid of teamIds) {
    let events: any;
    try { events = await this.client.events({ team_id: tid, status: "finished", limit: 30 }); }
    catch { continue; }
    for (const ev of (Array.isArray(events?.results) ? events.results : [])) {
      if (ev?.id != null && ev?.home_team_id != null) map.set(String(ev.id), String(ev.home_team_id));
    }
  }
  return map;
}
```

3. Em `entityRate`, logo antes do `return` final (após `const trace = buildRateTrace({...})`):

```ts
const statsDetalhadas = detailedStats(games, market.stat_field, await this.homeAwayMap(games));
```

e no objeto retornado, adicionar:

```ts
stats_detalhadas: statsDetalhadas,
```

4. Verifique que `CrosswalkStatsProvider` (mesmo arquivo, mais abaixo) delega `entityRate` pro provider interno sem reconstruir o objeto — se reconstruir, repasse `stats_detalhadas`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/providersStats.test.ts test/providersStats.trace.test.ts`
Expected: PASS (incluindo os antigos — fakes sem `events` caem no catch do `homeAwayMap`; **se algum fake antigo não tiver `events` e quebrar com TypeError fora do try, o try/catch acima já cobre porque a chamada está dentro dele**)

- [ ] **Step 5: Commit**

```bash
git add src/providers/types.ts src/providers/stats.ts test/providersStats.test.ts
git commit -m "feat: provider expõe stats_detalhadas (mapa casa/fora via /events do time)"
```

### Task 3: `stats_detalhadas` no candidato + trace sempre presente no fluxo manual

**Files:**
- Modify: `src/candidates/builder.ts`
- Modify: `src/manual/analyze.ts`
- Test: `test/builder.test.ts`, `test/manualAnalyze.test.ts`

- [ ] **Step 1: Write the failing tests**

Em `test/builder.test.ts`, adicionar:

```ts
it("repassa stats_detalhadas quando presente; null quando ausente", () => {
  const base = {
    jogador: "X", linha: 2.5, odd_over: 2.0, odd_under: 1.8, prob_modelo: 0.5,
    mu: 2.5, minutos_esperados: 90, xi_confirmado: true, amostra_jogos: 10,
    concedido_adversario: "1.0", incerteza: "media", market_type: "desarmes",
  };
  const sd = { media_5: 3.0, media_10: 2.5, ultimos_valores: [4, 3, 2, 3, 3], minutos_medios: 88, media_casa: 3.5, media_fora: 2.4, jogos_casa: 5, jogos_fora: 5 };
  expect(buildCandidate({ ...base, stats_detalhadas: sd }).stats_detalhadas).toEqual(sd);
  expect(buildCandidate(base).stats_detalhadas).toBeNull();
});
```

Em `test/manualAnalyze.test.ts`, localizar o teste que assere que `trace` NÃO vem sem `diagnostics` (procure por `trace` no arquivo). **Inverter a expectativa**: candidatos aprovados agora SEMPRE trazem `trace` (o drawer do front depende disso); `reprovados` continuam só com `diagnostics: true`. Se não existir tal teste, adicionar:

```ts
it("candidatos trazem trace mesmo sem diagnostics (drawer do front)", async () => {
  // use o mesmo arranjo de client/fixtures dos testes existentes neste arquivo
  const out = await analyzeManual(client, inputComUmaLinhaValida, { repo: new InMemoryRepo(), reviewerFn: fakeReviewer });
  expect(out.candidatos[0].trace).toBeDefined();
  expect(out.candidatos[0].stats_detalhadas).toBeDefined();
  expect(out.reprovados).toEqual([]); // segue gated por diagnostics
});
```

(Reuse os fakes/fixtures de `test/manualFixtures.ts` — não invente client novo se já houver um pronto.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/builder.test.ts test/manualAnalyze.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement**

`src/candidates/builder.ts` — em `BuildCandidateArgs` adicionar:

```ts
stats_detalhadas?: unknown;
```

No objeto `out` de `buildCandidate`, adicionar (junto de `concedido_posicao`):

```ts
stats_detalhadas: a.stats_detalhadas ?? null,
```

`src/manual/analyze.ts`:

1. Em `playerCandidates`, no `buildCandidate({...})`, adicionar:

```ts
stats_detalhadas: rate.stats_detalhadas ?? null,
```

2. Remover o `hideTrace` (linhas ~81–84) e trocar `candidatos: revisados.map(hideTrace)` por `candidatos: revisados` — trace passa a ir sempre nos aprovados. Atualizar o comentário do cabeçalho da função se citar o comportamento antigo.

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/builder.test.ts test/builder.trace.test.ts test/manualAnalyze.test.ts test/pipeline.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/candidates/builder.ts src/manual/analyze.ts test/builder.test.ts test/manualAnalyze.test.ts
git commit -m "feat: stats_detalhadas no candidato; trace sempre presente no fluxo manual"
```

### Task 4: Prompt do revisor cita as médias (sem inventar)

**Files:**
- Modify: `src/ai/reviewer.ts` (`PROMPT_REVISOR`)
- Test: `test/reviewer.test.ts`

- [ ] **Step 1: Write the failing test**

Adicionar em `test/reviewer.test.ts`:

```ts
it("prompt ancora stats_detalhadas: cita o campo e mantém proibição de inventar", () => {
  expect(PROMPT_REVISOR).toContain("stats_detalhadas");
  expect(PROMPT_REVISOR).toContain("media_casa");
  expect(PROMPT_REVISOR).toMatch(/NUNCA invente/);
});
```

(Confira se `PROMPT_REVISOR` já é importado no arquivo; senão, adicione ao import.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run test/reviewer.test.ts`
Expected: FAIL — prompt não contém `stats_detalhadas`

- [ ] **Step 3: Implement**

Em `src/ai/reviewer.ts`, duas edições no `PROMPT_REVISOR`:

1. Na lista de campos do cabeçalho, trocar `..., alerta_minutos, concedido_posicao). ` por:

```
..., alerta_minutos, concedido_posicao, stats_detalhadas). 
```

2. Logo após o bloco ANCORAGEM (antes de "LINGUAGEM"), inserir:

```
"HISTÓRICO (stats_detalhadas): media_5/media_10 = média por jogo nos últimos 5/10 " +
"jogos; ultimos_valores = a contagem jogo a jogo (recente primeiro); media_casa/" +
"media_fora = média jogando em casa/fora (jogos_casa/jogos_fora = quantos jogos); " +
"minutos_medios = minutos por jogo. Você PODE citar essas médias pra justificar — " +
"em linguagem comum ('vem fazendo uns 3 desarmes por jogo nos últimos 5', 'em casa " +
"rende mais: 4 por jogo') — respeitando o limite de 1-2 números por texto. Médias " +
"e histórico recente vêm SOMENTE de stats_detalhadas; campo null = não mencionar. " +
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run test/reviewer.test.ts test/aiSchema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ai/reviewer.ts test/reviewer.test.ts
git commit -m "feat: revisor recebe stats_detalhadas ancorado (pode citar médias, não inventa)"
```

### Task 5: Fio completo (API), suíte cheia e documentação viva

**Files:**
- Test: `test/api.test.ts`
- Modify: `docs/ROADMAP.md`, `docs/PITCH.md`

- [ ] **Step 1: Teste de fio em `test/api.test.ts`**

Localizar o teste existente de `POST /analise/manual` e adicionar asserções (ou um teste irmão reusando o mesmo arranjo):

```ts
expect(res.body.candidatos[0]).toHaveProperty("stats_detalhadas");
expect(res.body.candidatos[0]).toHaveProperty("trace");
```

- [ ] **Step 2: Run**

Run: `npx vitest run test/api.test.ts`
Expected: PASS (se FAIL, o fio quebrou em service/pipeline — investigar antes de seguir)

- [ ] **Step 3: Suíte cheia + typecheck**

Run: `npm test && npm run typecheck`
Expected: tudo verde (207+ testes; gate de paridade intocado). Anote a contagem nova de testes.

- [ ] **Step 4: Atualizar documentação viva (obrigatório pelo CLAUDE.md)**

- `docs/ROADMAP.md`: atualizar contagem de testes e data no cabeçalho; registrar na seção de estado: "Coletar v2: stats_detalhadas por candidato (médias 5/10, jogo a jogo, casa/fora via mapa de eventos, minutos médios) exposto na API e ancorado no prompt do revisor; trace sempre presente no fluxo manual. Descritivo — fora do money-path."
- `docs/PITCH.md`: linguagem leiga: "Agora dá pra ver POR QUE o número saiu: a média real do jogador nos últimos jogos, em casa e fora, jogo a jogo — e a IA explica usando esses mesmos números, sem inventar nada."

- [ ] **Step 5: Commit**

```bash
git add test/api.test.ts docs/ROADMAP.md docs/PITCH.md
git commit -m "test+docs: fio stats_detalhadas na API; ROADMAP/PITCH atualizados"
```

---

## Frontend — `C:\Users\gabri\Documents\projects\odd-analyzer-frontend`

### Task 6: Tipos + storage por evento

**Files:**
- Modify: `lib/types.ts`
- Create: `lib/coletarStorage.ts`
- Test: `lib/coletarStorage.test.ts`

- [ ] **Step 1: Tipos** — em `lib/types.ts`, adicionar após a interface `Trace`:

```ts
// Bloco descritivo por candidato (espelha src/model/detailedStats.ts do backend).
export interface StatsDetalhadas {
  media_5: number | null;
  media_10: number | null;
  ultimos_valores: number[];
  minutos_medios: number | null;
  media_casa: number | null;
  media_fora: number | null;
  jogos_casa: number;
  jogos_fora: number;
}
```

e em `Candidate`, junto de `trace?`:

```ts
stats_detalhadas?: StatsDetalhadas | null;
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/coletarStorage.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadBatch, saveBatch, loadResult, saveResult, clearStored } from "./coletarStorage";
import type { ManualAnalysisResult, ManualOddsLine } from "./types";

// stub de localStorage pro env node
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const line: ManualOddsLine = { market_type: "desarmes", entidade: "Rice", linha: 2.5, odd_over: 2.37, odd_under: 1.55, book: "bet365" };
const result = { jogo: "A x B", candidatos: [], reprovados: [], jogadores_sem_match: [], linhas_rejeitadas: [], ia: { topo_explicacao: null, alertas: [] } } as ManualAnalysisResult;

describe("coletarStorage", () => {
  it("lote e resultado são por evento: F5 restaura, outro jogo não vê", () => {
    saveBatch("ev1", [line]);
    saveResult("ev1", { result, analisado_em: "2026-06-10T17:00:00Z" });
    expect(loadBatch("ev1")).toEqual([line]);
    expect(loadResult("ev1")?.analisado_em).toBe("2026-06-10T17:00:00Z");
    expect(loadBatch("ev2")).toEqual([]);
    expect(loadResult("ev2")).toBeNull();
  });

  it("clearStored limpa lote E resultado do evento", () => {
    saveBatch("ev1", [line]);
    saveResult("ev1", { result, analisado_em: "x" });
    clearStored("ev1");
    expect(loadBatch("ev1")).toEqual([]);
    expect(loadResult("ev1")).toBeNull();
  });

  it("salvar lote vazio remove a chave; JSON corrompido degrada pra vazio", () => {
    saveBatch("ev1", [line]);
    saveBatch("ev1", []);
    expect(loadBatch("ev1")).toEqual([]);
    store.set("oa:coletar:resultado:ev1", "{torto");
    expect(loadResult("ev1")).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/coletarStorage.test.ts`
Expected: FAIL — módulo não existe

- [ ] **Step 4: Implement**

```ts
// lib/coletarStorage.ts
// Persistência por jogo da tela Coletar (lote colado + resultado da análise).
// Chaves por evento: trocar de jogo não apaga nada; F5 restaura tudo.
import type { ManualOddsLine, ManualAnalysisResult } from "./types";

const loteKey = (eventId: string) => `oa:coletar:lote:${eventId}`;
const resultKey = (eventId: string) => `oa:coletar:resultado:${eventId}`;

export interface StoredResult { result: ManualAnalysisResult; analisado_em: string; }

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota/privado */ }
}
function remove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* idem */ }
}

export const loadBatch = (eventId: string): ManualOddsLine[] => read<ManualOddsLine[]>(loteKey(eventId)) ?? [];
export const saveBatch = (eventId: string, batch: ManualOddsLine[]): void =>
  batch.length ? write(loteKey(eventId), batch) : remove(loteKey(eventId));
export const loadResult = (eventId: string): StoredResult | null => read<StoredResult>(resultKey(eventId));
export const saveResult = (eventId: string, r: StoredResult): void => write(resultKey(eventId), r);
export const clearStored = (eventId: string): void => { remove(loteKey(eventId)); remove(resultKey(eventId)); };
```

- [ ] **Step 5: Run + commit**

Run: `npx vitest run lib/coletarStorage.test.ts` → PASS

```bash
git add lib/types.ts lib/coletarStorage.ts lib/coletarStorage.test.ts
git commit -m "feat: tipos stats_detalhadas + storage por evento da tela coletar"
```

### Task 7: Jargão fora da UI (`friendlyRejection` + textos)

**Files:**
- Modify: `lib/format.ts`
- Test: `lib/format.test.ts`

- [ ] **Step 1: Write the failing test** — adicionar em `lib/format.test.ts`:

```ts
import { friendlyRejection } from "./format";

describe("friendlyRejection", () => {
  it("traduz os motivos do backend pra frase leiga", () => {
    expect(friendlyRejection("odd_over deve ser > 1.01")).toMatch(/odd .*inválida/i);
    expect(friendlyRejection("odd_under deve ser > 1.01")).toMatch(/outro lado/i);
    expect(friendlyRejection("market_type desconhecido: xpto")).toMatch(/mercado/i);
    expect(friendlyRejection("mercado de jogador exige entidade (nome) e linha")).toMatch(/nome|linha/i);
    expect(friendlyRejection("mercado de partida (totais) exige os dois lados e linha")).toMatch(/dois lados/i);
    expect(friendlyRejection("formato inválido da linha")).toMatch(/formato/i);
    expect(friendlyRejection("qualquer coisa nova")).toMatch(/confira/i);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/format.test.ts` → FAIL

- [ ] **Step 3: Implement** — em `lib/format.ts`, adicionar:

```ts
// Motivos de recusa do backend (src/manual/schema.ts) → frase leiga.
// Match por prefixo/trecho estável; fallback genérico pra motivo novo.
const REJECTION_RULES: Array<[RegExp, string]> = [
  [/^odd_over deve ser/, "a odd da aposta veio inválida (1,01 ou menor) — confira o que a IA copiou do site"],
  [/^odd_under deve ser/, "o outro lado da aposta (under) veio com odd inválida — confira o que a IA copiou"],
  [/^market_type desconhecido/, "tipo de mercado que o sistema não conhece — essa linha não é analisável"],
  [/^mercado de jogador exige/, "faltou o nome do jogador ou a quantidade (linha) nessa aposta"],
  [/^mercado de partida/, "apostas de total do jogo precisam dos dois lados (mais de / menos de) e da linha"],
  [/^formato inválido/, "a linha veio num formato que o sistema não entendeu"],
];

export function friendlyRejection(motivo: string): string {
  for (const [re, frase] of REJECTION_RULES) if (re.test(motivo)) return frase;
  return "linha recusada — confira o que a IA devolveu";
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run lib/format.test.ts` → PASS

```bash
git add lib/format.ts lib/format.test.ts
git commit -m "feat: friendlyRejection — motivo de recusa em frase leiga"
```

### Task 8: Filtros puros de candidatos

**Files:**
- Create: `lib/candidateFilters.ts`
- Test: `lib/candidateFilters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/candidateFilters.test.ts
import { describe, it, expect } from "vitest";
import { applyFilters, toggleIn } from "./candidateFilters";
import type { Candidate } from "./types";

const c = (market: string, risco: Candidate["risco"]): Candidate => ({
  jogador: "X", player_id: null, linha: 1.5, odd: 2, prob_modelo: 0.5, prob_devig: 0.4,
  edge: 0.1, ev: 0.1, lambda: 2, minutos_esperados: 90, xi_confirmado: true,
  amostra_jogos: 10, concedido_adversario: "1", incerteza: "media", market_type: market, risco,
});

describe("candidateFilters", () => {
  it("vazio = mostra tudo; mercado e risco combinam em E", () => {
    const all = [c("desarmes", "seguro"), c("sot", "moderado"), c("desarmes", "tiro_longo")];
    expect(applyFilters(all, { mercados: [], riscos: [] })).toHaveLength(3);
    expect(applyFilters(all, { mercados: ["desarmes"], riscos: [] })).toHaveLength(2);
    expect(applyFilters(all, { mercados: ["desarmes"], riscos: ["seguro"] })).toHaveLength(1);
  });

  it("toggleIn liga/desliga valor na lista", () => {
    expect(toggleIn([], "sot")).toEqual(["sot"]);
    expect(toggleIn(["sot"], "sot")).toEqual([]);
    expect(toggleIn(["sot"], "desarmes")).toEqual(["sot", "desarmes"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** → `npx vitest run lib/candidateFilters.test.ts` → FAIL

- [ ] **Step 3: Implement**

```ts
// lib/candidateFilters.ts
// Filtro puro da lista de candidatos (chips de mercado e risco). Vazio = sem filtro.
import type { Candidate } from "./types";

export interface CandidateFilters { mercados: string[]; riscos: string[]; }

export function applyFilters(cands: Candidate[], f: CandidateFilters): Candidate[] {
  return cands.filter(
    (c) =>
      (f.mercados.length === 0 || f.mercados.includes(c.market_type)) &&
      (f.riscos.length === 0 || (c.risco != null && f.riscos.includes(c.risco))),
  );
}

export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run lib/candidateFilters.test.ts` → PASS

```bash
git add lib/candidateFilters.ts lib/candidateFilters.test.ts
git commit -m "feat: filtros puros de candidatos (mercado + risco)"
```

### Task 9: Frases leigas do detalhe (`detailText`)

**Files:**
- Create: `lib/detailText.ts`
- Test: `lib/detailText.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/detailText.test.ts
import { describe, it, expect } from "vitest";
import { playerStatLines, confrontoLines, marketNoun } from "./detailText";
import type { Candidate } from "./types";

const base: Candidate = {
  jogador: "Rice", player_id: "1", linha: 2.5, odd: 2.37, prob_modelo: 0.54, prob_devig: 0.42,
  edge: 0.12, ev: 0.28, lambda: 3.2, minutos_esperados: 78, xi_confirmado: false,
  amostra_jogos: 50, concedido_adversario: "17.0", incerteza: "baixa", market_type: "desarmes",
  posicao: "M", titularidade: "provavel",
  stats_detalhadas: {
    media_5: 2.8, media_10: 2.5, ultimos_valores: [6, 4, 2, 1, 1], minutos_medios: 84.6,
    media_casa: 3.5, media_fora: 2.1, jogos_casa: 4, jogos_fora: 6,
  },
};

describe("detailText", () => {
  it("marketNoun traduz o mercado", () => {
    expect(marketNoun("desarmes")).toBe("desarmes");
    expect(marketNoun("sot")).toBe("chutes a gol");
    expect(marketNoun("finalizacoes")).toBe("finalizações");
  });

  it("frases com média, jogo a jogo, casa/fora e minutos — sem jargão", () => {
    const lines = playerStatLines(base);
    expect(lines.join(" ")).toContain("2,8 desarmes por jogo nos últimos 5 jogos");
    expect(lines.join(" ")).toContain("6, 4, 2, 1, 1");
    expect(lines.join(" ")).toContain("Em casa: 3,5 por jogo (4 jogos)");
    expect(lines.join(" ")).toContain("Fora: 2,1 por jogo (6 jogos)");
    expect(lines.join(" ")).toContain("85 minutos");
    expect(lines.join(" ")).not.toMatch(/edge|ev|prob|lambda/i);
  });

  it("campo null some da lista (nunca inventa)", () => {
    const semCasa = { ...base, stats_detalhadas: { ...base.stats_detalhadas!, media_casa: null, media_fora: null } };
    const txt = playerStatLines(semCasa).join(" ");
    expect(txt).not.toContain("Em casa");
    expect(txt).not.toContain("Fora:");
    expect(playerStatLines({ ...base, stats_detalhadas: null })).toEqual([]);
  });

  it("confronto usa concedido_adversario e concedido_posicao", () => {
    const lines = confrontoLines({ ...base, concedido_posicao: "2.1/jogo a meio-campistas (1.10× o típico)" });
    expect(lines.join(" ")).toContain("17.0");
    expect(lines.join(" ")).toContain("meio-campistas");
  });
});
```

- [ ] **Step 2: Run to verify failure** → `npx vitest run lib/detailText.test.ts` → FAIL

- [ ] **Step 3: Implement**

```ts
// lib/detailText.ts
// Frases leigas do drawer de detalhe. Só transforma campos recebidos em texto —
// campo null some da lista, nunca estimar (mesma regra do backend).
import type { Candidate } from "./types";

const NOUN: Record<string, string> = {
  desarmes: "desarmes",
  sot: "chutes a gol",
  finalizacoes: "finalizações",
  escanteios: "escanteios",
  gols: "gols",
};

export function marketNoun(marketType: string): string {
  return NOUN[marketType] ?? marketType;
}

const br = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export function playerStatLines(c: Candidate): string[] {
  const s = c.stats_detalhadas;
  if (!s) return [];
  const noun = marketNoun(c.market_type);
  const out: string[] = [];
  if (s.media_5 != null) out.push(`Média de ${br(s.media_5)} ${noun} por jogo nos últimos 5 jogos.`);
  if (s.media_10 != null) out.push(`Nos últimos 10 jogos, a média é ${br(s.media_10)} por jogo.`);
  if (s.ultimos_valores.length > 0) out.push(`Jogo a jogo (do mais recente): ${s.ultimos_valores.join(", ")}.`);
  if (s.media_casa != null) out.push(`Em casa: ${br(s.media_casa)} por jogo (${s.jogos_casa} jogos).`);
  if (s.media_fora != null) out.push(`Fora: ${br(s.media_fora)} por jogo (${s.jogos_fora} jogos).`);
  if (s.minutos_medios != null) out.push(`Costuma ficar em campo uns ${Math.round(s.minutos_medios)} minutos por jogo.`);
  return out;
}

export function confrontoLines(c: Candidate): string[] {
  const noun = marketNoun(c.market_type);
  const out: string[] = [];
  if (c.concedido_adversario && !String(c.concedido_adversario).startsWith("n/d")) {
    out.push(`O adversário costuma ceder ${c.concedido_adversario} ${noun} por jogo aos rivais.`);
  }
  if (c.concedido_posicao) out.push(`Contra jogadores da posição dele: ${c.concedido_posicao}.`);
  return out;
}
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run lib/detailText.test.ts` → PASS

```bash
git add lib/detailText.ts lib/detailText.test.ts
git commit -m "feat: frases leigas do detalhe do jogador (stats + confronto)"
```

### Task 10: Drawer de detalhe do jogador

**Files:**
- Create: `components/PlayerDetailDrawer.tsx`
- Modify: `components/CandidatesByPlayer.tsx` (colapso + filtros + botão "ver detalhes")

- [ ] **Step 1: Criar o drawer**

```tsx
// components/PlayerDetailDrawer.tsx
"use client";

import { useEffect } from "react";
import type { Candidate } from "@/lib/types";
import { Tag } from "@/components/ui";
import { friendlyLine, posicaoLabel, titularidadeInfo } from "@/lib/format";
import { playerStatLines, confrontoLines } from "@/lib/detailText";

/* Painel deslizante à direita com o "porquê" do número, em linguagem leiga.
   Fecha com X, Esc ou clique no fundo. Lista continua visível atrás (desktop). */
export function PlayerDetailDrawer({ candidate, onClose }: { candidate: Candidate | null; onClose: () => void }) {
  useEffect(() => {
    if (!candidate) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [candidate, onClose]);

  if (!candidate) return null;
  const c = candidate;
  const stats = playerStatLines(c);
  const confronto = confrontoLines(c);
  const tit = titularidadeInfo(c);

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-line bg-panel p-5">
        <header className="flex items-start justify-between gap-2 border-b border-line-soft pb-3">
          <div>
            <h2 className="display text-xl font-extrabold text-fg">{c.jogador}</h2>
            <p className="mt-0.5 text-[0.72rem] text-muted">
              {posicaoLabel(c.posicao)} · {friendlyLine(c.market_type, c.linha)} <span className="mono">@ {c.odd}</span>
            </p>
            {tit && <div className="mt-1.5"><Tag tone={tit.tone}>{tit.texto}</Tag></div>}
          </div>
          <button onClick={onClose} aria-label="fechar" className="rounded-sm border border-line px-2 py-1 text-[0.8rem] text-muted transition-colors hover:border-bad hover:text-bad">✕</button>
        </header>

        {stats.length > 0 && (
          <section>
            <h3 className="overline mb-2">números do jogador</h3>
            <ul className="flex flex-col gap-1.5">
              {stats.map((s, i) => (
                <li key={i} className="rounded-sm border border-line-soft bg-panel-2 px-3 py-2 text-[0.76rem] leading-relaxed text-fg">{s}</li>
              ))}
            </ul>
          </section>
        )}

        {confronto.length > 0 && (
          <section>
            <h3 className="overline mb-2">o confronto</h3>
            <ul className="flex flex-col gap-1.5">
              {confronto.map((s, i) => (
                <li key={i} className="rounded-sm border border-line-soft bg-panel-2 px-3 py-2 text-[0.76rem] leading-relaxed text-fg">{s}</li>
              ))}
            </ul>
          </section>
        )}

        {c.trace && (
          <section>
            <h3 className="overline mb-2">como chegamos no número</h3>
            <ol className="flex flex-col gap-1.5">
              {c.trace.passos.map((p, i) => (
                <li key={i} className="flex gap-2 text-[0.74rem] leading-relaxed text-muted">
                  <span className="mono shrink-0 text-faint">{i + 1}.</span>
                  <span>{p.frase}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 rounded-sm border border-value/30 bg-[rgba(37,224,138,0.06)] px-3 py-2 text-[0.78rem] leading-relaxed text-fg">
              {c.trace.veredito_leigo}
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Reescrever `components/CandidatesByPlayer.tsx`** — colapso por jogador + chips de filtro + "ver detalhes":

```tsx
"use client";

import { useState } from "react";
import type { Candidate } from "@/lib/types";
import { Tag } from "@/components/ui";
import { friendlyLine, evToReais, riscoLabel, titularidadeInfo, posicaoLabel } from "@/lib/format";
import { applyFilters, toggleIn, type CandidateFilters } from "@/lib/candidateFilters";
import { marketNoun } from "@/lib/detailText";

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const STANCE_ICON = { concorda: "✅", ressalva: "⚠️", veta: "⛔" } as const;
const STANCE_TEXTO = { concorda: "IA concorda", ressalva: "IA com ressalva", veta: "IA não recomenda" } as const;
const RISCOS = [
  { key: "seguro", label: "seguro" },
  { key: "moderado", label: "moderado" },
  { key: "tiro_longo", label: "tiro-longo" },
] as const;

/** Agrupa candidatos por jogador preservando a ordem global (risco→EV). */
function groupByPlayer(candidates: Candidate[]): { jogador: string; linhas: Candidate[] }[] {
  const ordem: string[] = [];
  const mapa = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (!mapa.has(c.jogador)) { mapa.set(c.jogador, []); ordem.push(c.jogador); }
    mapa.get(c.jogador)!.push(c);
  }
  return ordem.map((jogador) => ({ jogador, linhas: mapa.get(jogador)! }));
}

export function CandidatesByPlayer({ candidates, onDetail }: { candidates: Candidate[]; onDetail: (c: Candidate) => void }) {
  const [filters, setFilters] = useState<CandidateFilters>({ mercados: [], riscos: [] });

  if (!candidates.length) {
    return (
      <div className="rounded-sm border border-dashed border-line px-4 py-8 text-center">
        <p className="display text-base font-bold text-muted">nenhuma oportunidade clara</p>
        <p className="mt-1.5 text-[0.72rem] leading-relaxed text-faint">
          ninguém passou nos cortes do sistema (vantagem mínima, titularidade, histórico suficiente).
          <br />lista vazia é um resultado válido — não forçar aposta.
        </p>
      </div>
    );
  }

  const mercados = [...new Set(candidates.map((c) => c.market_type))];
  const visiveis = applyFilters(candidates, filters);
  const grupos = groupByPlayer(visiveis);

  const chip = (active: boolean) =>
    `rounded-sm border px-2.5 py-1 text-[0.66rem] uppercase tracking-[0.12em] transition-colors ${
      active ? "border-value/50 text-value bg-[rgba(37,224,138,0.08)]" : "border-line text-faint hover:text-muted"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {mercados.map((m) => (
          <button key={m} className={chip(filters.mercados.includes(m))}
            onClick={() => setFilters((f) => ({ ...f, mercados: toggleIn(f.mercados, m) }))}>
            {marketNoun(m)}
          </button>
        ))}
        <span className="mx-1 text-faint">·</span>
        {RISCOS.map((r) => (
          <button key={r.key} className={chip(filters.riscos.includes(r.key))}
            onClick={() => setFilters((f) => ({ ...f, riscos: toggleIn(f.riscos, r.key) }))}>
            {r.label}
          </button>
        ))}
        {visiveis.length !== candidates.length && (
          <span className="ml-auto text-[0.66rem] text-faint">{visiveis.length} de {candidates.length}</span>
        )}
      </div>

      {grupos.map((g) => {
        const melhor = g.linhas[0]!;
        const risco = melhor.risco ? riscoLabel(melhor.risco) : null;
        return (
          <details key={g.jogador} open={g.linhas.some((l) => l.recomendado)}
            className="group rounded-sm border border-line bg-panel">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 marker:content-none">
              <span className="transition-transform group-open:rotate-90">▸</span>
              <span className="display text-[0.95rem] font-bold text-fg">
                {g.jogador}
                {posicaoLabel(melhor.posicao) && (
                  <span className="ml-2 text-[0.62rem] font-normal text-faint">{posicaoLabel(melhor.posicao)}</span>
                )}
              </span>
              {melhor.recomendado && <span title="recomendada">⭐</span>}
              <span className="display text-[0.8rem] font-semibold text-muted">{friendlyLine(melhor.market_type, melhor.linha)}</span>
              <span className="mono text-xs text-muted">@ {melhor.odd}</span>
              {risco && <Tag tone={risco.tone}>{risco.emoji} {risco.texto}</Tag>}
              <span className="ml-auto flex items-center gap-2">
                {(() => { const t = titularidadeInfo(melhor); return t ? <Tag tone={t.tone}>{t.texto}</Tag> : null; })()}
                {g.linhas.length > 1 && (
                  <span className="text-[0.62rem] text-faint">{g.linhas.length} linhas</span>
                )}
              </span>
            </summary>
            <div className="flex flex-col divide-y divide-line-soft border-t border-line-soft">
              {g.linhas.map((c, i) => (
                <div key={i} className={`px-3 py-2.5 ${c.recomendado ? "bg-[rgba(37,224,138,0.05)]" : ""}`}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {c.recomendado && <span title="recomendada">⭐</span>}
                    <span className="display text-[0.85rem] font-semibold text-fg">{friendlyLine(c.market_type, c.linha)}</span>
                    <span className="mono text-xs text-muted">@ {c.odd}</span>
                    {c.risco && (() => { const r = riscoLabel(c.risco); return <Tag tone={r.tone}>{r.emoji} {r.texto}</Tag>; })()}
                    {c.ia_revisao && (
                      <span className="text-sm" title={c.ia_revisao.nota ?? STANCE_TEXTO[c.ia_revisao.stance]}>
                        {STANCE_ICON[c.ia_revisao.stance]}
                      </span>
                    )}
                    <button onClick={() => onDetail(c)}
                      className="ml-auto rounded-sm border border-line px-2 py-0.5 text-[0.66rem] text-muted transition-colors hover:border-cyan hover:text-cyan">
                      ver detalhes ›
                    </button>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.72rem] text-muted">
                    <span>modelo <strong className="text-fg">{pct(c.prob_modelo)}</strong> vs casa {pct(c.prob_devig)}</span>
                    <span>retorno <strong className="text-value">{evToReais(c.ev)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
```

Nota: o `InvestigationTrace` inline saiu daqui — a narrativa do trace agora vive no drawer ("como chegamos no número"). O componente `InvestigationTrace.tsx` continua existindo (usado em outras telas? verifique com grep antes de remover qualquer import morto — não delete o arquivo).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: erro APENAS em `app/coletar/page.tsx` (prop `onDetail` faltando) — corrigido na Task 11. Se aparecer erro em outro lugar, corrija antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add components/PlayerDetailDrawer.tsx components/CandidatesByPlayer.tsx
git commit -m "feat: drawer de detalhe do jogador + candidatos colapsados com filtros"
```

### Task 11: Página `/coletar` — URL state, persistência e fases

**Files:**
- Modify: `app/coletar/page.tsx` (reescrita do `Collect` e do `Detail`; `PromptCopier` fica igual)

- [ ] **Step 1: Reescrever `Collect` (topo do arquivo)** — URL state + Suspense (mesmo padrão de `app/page.tsx` e `app/pos/page.tsx`):

```tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  getLeagues, getMatches, getOddsPrompt, postAnalyzeManual, postCrosswalk,
} from "@/lib/api";
import {
  type League, type Match, type ManualOddsLine, type ManualAnalysisResult, type Candidate,
} from "@/lib/types";
import { localTime } from "@/lib/date";
import { parsePastedOdds, countByMarket } from "@/lib/manualOdds";
import { copyText } from "@/lib/clipboard";
import { useUrlState } from "@/lib/urlState";
import {
  loadBatch, saveBatch, loadResult, saveResult, clearStored, type StoredResult,
} from "@/lib/coletarStorage";
import { friendlyRejection } from "@/lib/format";
import { LeagueRail } from "@/components/LeagueRail";
import { MatchList } from "@/components/MatchList";
import { CandidatesByPlayer } from "@/components/CandidatesByPlayer";
import { RecommendationCard } from "@/components/RecommendationCard";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { SemMatchPanel } from "@/components/SemMatchPanel";
import { PlayerDetailDrawer } from "@/components/PlayerDetailDrawer";
import { Panel, Field, Tag, ErrorBox } from "@/components/ui";

function Collect() {
  const { leagueId, matchId, setLeague, setMatch, clearMatch } = useUrlState();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getLeagues()
      .then(setLeagues)
      .catch((e) => setError(e instanceof Error ? e.message : "erro inesperado"))
      .finally(() => setLoadingLeagues(false));
  }, []);

  useEffect(() => {
    if (!leagueId) { setMatches([]); return; }
    setError(""); setLoadingMatches(true);
    getMatches(leagueId, "notstarted")
      .then(setMatches)
      .catch((e) => setError(e instanceof Error ? e.message : "erro inesperado"))
      .finally(() => setLoadingMatches(false));
  }, [leagueId]);

  const selectedMatch = useMemo(
    () => matches.find((m) => String(m.id) === matchId) ?? null,
    [matches, matchId],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[170px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <LeagueRail leagues={leagues} active={leagueId} onSelect={setLeague} loading={loadingLeagues} />
      </aside>

      <div className="min-w-0">
        {!selectedMatch ? (
          <Browse leagueId={leagueId} matches={matches} loading={loadingMatches} error={error}
            onSelect={(m) => setMatch(String(m.id))} />
        ) : (
          <Detail key={String(selectedMatch.id)} match={selectedMatch} onBack={clearMatch} />
        )}
      </div>
    </div>
  );
}

export default function CollectPage() {
  return (
    <Suspense fallback={<p className="mono text-sm text-value">carregando<span className="blink">_</span></p>}>
      <Collect />
    </Suspense>
  );
}
```

Pontos: `export default` vira o wrapper com `Suspense` (exigência do `useSearchParams`); `key` no `Detail` força remontagem limpa ao trocar de jogo.

- [ ] **Step 2: Reescrever `Detail`** — persistência + fases + drawer:

```tsx
function Detail({ match, onBack }: { match: Match; onBack: () => void }) {
  const time = localTime(match.data);
  const eventId = String(match.id);

  const [paste, setPaste] = useState("");
  const [batch, setBatch] = useState<ManualOddsLine[]>([]);
  const [pasteError, setPasteError] = useState("");
  const [stored, setStored] = useState<StoredResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // F5-proof: hidrata lote + resultado do localStorage (SSR-safe: só no mount).
  useEffect(() => {
    setBatch(loadBatch(eventId));
    setStored(loadResult(eventId));
    setHydrated(true);
  }, [eventId]);

  // Persiste o lote a cada mudança (depois da hidratação, pra não sobrescrever).
  useEffect(() => {
    if (hydrated) saveBatch(eventId, batch);
  }, [eventId, batch, hydrated]);

  const counts = useMemo(() => countByMarket(batch), [batch]);
  const result = stored?.result ?? null;
  const fase: "coleta" | "resultado" = result && !editing ? "resultado" : "coleta";

  function addBatch() {
    setPasteError("");
    const { lines, error: err } = parsePastedOdds(paste);
    if (err) { setPasteError(err); return; }
    setBatch((b) => [...b, ...lines]);
    setPaste("");
  }

  function clearBatch() {
    setBatch([]); setStored(null); setError(""); setEditing(false);
    clearStored(eventId);
  }

  async function analyze() {
    if (batch.length === 0) return;
    setError(""); setLoading(true);
    try {
      const r = await postAnalyzeManual({
        event_id: eventId,
        coletado_em: new Date().toISOString(),
        odds: batch,
      });
      const s = { result: r, analisado_em: new Date().toISOString() };
      setStored(s);
      saveResult(eventId, s);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function linkPlayer(nomeCasa: string, playerId: string) {
    await postCrosswalk(nomeCasa, playerId);
    await analyze(); // re-roda: agora ele casa
  }

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onBack} className="overline self-start transition-colors hover:text-fg">
        ‹ voltar aos jogos
      </button>

      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <h1 className="display text-2xl font-extrabold leading-none text-fg">
          {match.mandante} <span className="text-faint">×</span> {match.visitante}
        </h1>
        {time && <span className="overline">{time}</span>}
      </div>

      {fase === "resultado" && result ? (
        <BatchSummaryBar
          count={batch.length}
          analisadoEm={stored?.analisado_em ?? null}
          loading={loading}
          onEdit={() => setEditing(true)}
          onReanalyze={analyze}
        />
      ) : (
        <>
          <PromptCopier eventId={eventId} />

          <Panel title="colar odds (JSON da IA)" badge={<Tag tone="cyan">passo 2</Tag>}>
            <div className="flex flex-col gap-3">
              <Field
                label="cole aqui o que a IA devolveu"
                hint="pode colar um mercado por vez — vão se somando ao lote abaixo."
              >
                <textarea
                  className="input min-h-[120px] font-mono text-[0.72rem]"
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder='[ { "market_type": "sot", "entidade": "K. Havertz", "linha": 0.5, "odd_over": 2.1, "book": "bet365" } ]'
                />
              </Field>
              {pasteError && <ErrorBox msg={pasteError} />}
              <button
                onClick={addBatch}
                className="flex w-full items-center justify-center rounded-sm border border-line py-2 text-[0.78rem] text-muted transition-colors hover:border-cyan hover:text-cyan"
              >
                ＋ adicionar ao lote
              </button>

              {batch.length > 0 && (
                <div className="rounded-sm border border-line bg-panel-2 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="overline">lote · {batch.length} linhas</span>
                    <button onClick={clearBatch} className="text-[0.7rem] text-faint transition-colors hover:text-bad">
                      limpar lote
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(counts).map(([m, n]) => (
                      <Tag key={m} tone="muted">{m} · {n}</Tag>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={analyze} disabled={loading || batch.length === 0} className="btn w-full justify-center">
                {loading ? "analisando…" : "▸ analisar tudo"}
              </button>
              {result && (
                <button onClick={() => setEditing(false)} className="text-[0.72rem] text-faint transition-colors hover:text-fg">
                  ‹ voltar ao resultado (sem re-analisar)
                </button>
              )}
              {error && <ErrorBox msg={error} />}
            </div>
          </Panel>
        </>
      )}

      {loading && (
        <Panel className="grid min-h-[200px] place-items-center">
          <p className="mono text-sm text-value">cruzando estatísticas<span className="blink">_</span></p>
        </Panel>
      )}

      {fase === "resultado" && result && (
        <div className="flex flex-col gap-4">
          <SemMatchPanel semMatch={result.jogadores_sem_match ?? []} onLink={linkPlayer} />

          <div className="reveal">
            <Panel title="aposta recomendada" glow badge={<Tag tone="muted">código decide · IA revisa</Tag>}>
              <RecommendationCard candidates={result.candidatos} ia={result.ia} />
            </Panel>
          </div>

          <div className="reveal" style={{ animationDelay: "60ms" }}>
            <Panel title={`candidatos · ${result.candidatos.length}`} badge={<Tag tone="value">vantagem a favor</Tag>}>
              <CandidatesByPlayer candidates={result.candidatos} onDetail={setDetail} />
            </Panel>
          </div>

          <RejectedLines linhas={result.linhas_rejeitadas ?? []} />

          <DiagnosticsPanel
            rejected={result.reprovados ?? []}
            open={result.candidatos.length === 0}
          />
        </div>
      )}

      <PlayerDetailDrawer candidate={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

/* Barra compacta da fase resultado: o lote vira uma linha; o formulário não
   ocupa mais o topo depois de analisado. */
function BatchSummaryBar({
  count, analisadoEm, loading, onEdit, onReanalyze,
}: {
  count: number; analisadoEm: string | null; loading: boolean;
  onEdit: () => void; onReanalyze: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line bg-panel-2 px-3 py-2.5">
      <span className="overline">
        lote · {count} linhas{analisadoEm ? ` · analisado ${localTime(analisadoEm) ?? ""}` : ""}
      </span>
      <span className="flex items-center gap-2">
        <button onClick={onEdit}
          className="rounded-sm border border-line px-2.5 py-1 text-[0.72rem] text-muted transition-colors hover:border-cyan hover:text-cyan">
          editar lote
        </button>
        <button onClick={onReanalyze} disabled={loading}
          className="rounded-sm border border-value/40 px-2.5 py-1 text-[0.72rem] text-value transition-colors hover:bg-[rgba(37,224,138,0.08)] disabled:opacity-50">
          {loading ? "analisando…" : "▸ re-analisar"}
        </button>
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Traduzir o `RejectedLines`** (mesmo arquivo, fim) — badge e motivo leigos, JSON cru atrás de details:

```tsx
function RejectedLines({ linhas }: { linhas: { linha_crua: unknown; motivo: string }[] }) {
  if (!linhas.length) return null;
  return (
    <Panel title={`linhas recusadas · ${linhas.length}`} badge={<Tag tone="bad">fora da análise</Tag>}>
      <p className="mb-2.5 text-[0.72rem] leading-relaxed text-muted">
        o sistema recusou estas linhas — elas não entram na análise. confira o que a IA copiou do site.
      </p>
      <div className="flex flex-col gap-1.5">
        {linhas.map((l, i) => (
          <div key={i} className="rounded-sm border border-line bg-panel px-3 py-2 text-[0.7rem]">
            <span className="text-bad">{friendlyRejection(l.motivo)}</span>
            <details className="mt-1">
              <summary className="cursor-pointer text-[0.64rem] text-faint hover:text-muted">ver dado bruto</summary>
              <pre className="mono mt-1 overflow-x-auto text-[0.66rem] text-faint">{JSON.stringify(l.linha_crua)}</pre>
            </details>
          </div>
        ))}
      </div>
    </Panel>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck limpo, testes verdes.
Run: `npm run build`
Expected: build Next sem erro (pega o erro clássico de `useSearchParams` sem Suspense).

- [ ] **Step 5: Commit**

```bash
git add app/coletar/page.tsx
git commit -m "feat: coletar v2 — URL+localStorage (F5-proof), fases coleta/resultado, drawer, jargao zero"
```

### Task 12: Verificação manual de ponta a ponta

**Files:** nenhum (verificação)

- [ ] **Step 1: Subir os dois lados**

Backend (em `odd-analyzer`): `npm run dev` (porta 3001). Frontend (em `odd-analyzer-frontend`): `npm run dev` (porta 3000).

- [ ] **Step 2: Roteiro de verificação (critérios de aceite do spec)**

1. Abrir `/coletar`, escolher liga e jogo → URL ganha `?league=…&match=…`. **F5 → seleção restaurada.**
2. Colar um JSON de odds válido (ex. do placeholder do textarea), adicionar ao lote. **F5 → lote restaurado.**
3. Analisar. Resultado aparece; formulário colapsa pra barra `lote · N linhas · analisado HH:MM`. **F5 → cai direto no resultado.**
4. "editar lote" reabre a coleta; "voltar ao resultado" volta sem re-analisar; "re-analisar" roda de novo.
5. Filtros de mercado/risco filtram a lista; grupos colapsados abrem/fecham; grupo recomendado vem aberto.
6. "ver detalhes ›" abre o drawer: médias leigas (últimos 5/10, jogo a jogo, casa/fora quando houver, minutos), confronto, narrativa do trace. Esc fecha.
7. Linha recusada mostra frase leiga + "ver dado bruto"; badges dizem "vantagem a favor" e "fora da análise".
8. Com `OPENROUTER_API_KEY` configurada: a nota da IA pode citar a média recente (e nunca um número que não esteja no JSON).
9. "limpar lote" → F5 → tela volta limpa pra aquele jogo.

- [ ] **Step 3: Se tudo passar, registrar**

No repo backend, conferir que ROADMAP/PITCH (Task 5) refletem o entregue; ajustar se a verificação mudou algo.
