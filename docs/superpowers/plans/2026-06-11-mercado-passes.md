# Mercado de PASSES — Plano de Implementação

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: `superpowers:subagent-driven-development`.
> Tarefas em ordem; passos com checkbox. **Tarefa 1 é GATE** — Tarefas 2+ só se ela passar.

**Goal:** adicionar o mercado `passes` (jogador) como aposta de valor validada na seleção, com
de-vig de escada one-sided e fator de posse gated.

**Architecture:** motor puro intacto; `passes` = nova entrada em `MARKETS` + `opp_mode:"none"`
(neutraliza oppMult de sinal invertido) + módulo novo `ladderDevig` (money-path) + wiring no
fluxo manual que agrupa os 7 degraus por jogador. Settlement = `total_pass` (Opta).

**Tech:** Node/TS strict, Vitest, NB2 (`probOverLine`), `playerMuFromGames` reusado.

**Design:** [`docs/superpowers/specs/2026-06-11-passes-design.md`](../specs/2026-06-11-passes-design.md).

---

## Task 1 (GATE): Calibrar passes na seleção — decide se vira aposta ⭐ ou diagnóstico

**Files:**
- Create: `scripts/recalibrate-passes.mts` (molde: `scripts/recalibrate-faltas-defesas.mts`)

Mede `prior_rate`, varre `prior_strength` e `nb_dispersion`, leave-one-out anti-espiada em
thresholds **ancorados no μ** (região realista de aposta), na população de seleção (ligas
31,58–67). Também checa o settlement (`total_pass` vs `total_cross`).

- [ ] **Step 1: Escrever `scripts/recalibrate-passes.mts`** — espelha o de faltas, com estas diferenças:
  - `FIELD="total_pass"`, `LEAGUES=[31,58,59,60,61,62,64,65,66,67]`, alvo `minutes_played>=60`,
    histórico `>=10` jogos (excluindo o jogo-alvo).
  - **μ no minuto REAL do alvo** (isola o modelo de TAXA do erro de previsão de minutos —
    passe é sensível a minutos): `playerMuFromGames(games,"total_pass",prior,ps,1.0,ha, actualMin)`
    onde `actualMin = Number(r.minutes_played)`.
  - **`prior_rate`** = mediana de `total_pass/90` (ponderado por minutos) sobre as amostras —
    imprimir.
  - **Varredura `PRIOR_STRENGTH ∈ [3,5,8,12]`** e **`R_SWEEP=[20,40,80,160,320]` + Poisson(null)**
    (contagem alta ⇒ R grande; medir empiricamente Var/μ e reportar `r_emp = μ²/(Var−μ)`).
  - **Thresholds ancorados no μ:** para cada amostra avaliar em `k = round(μ)+off`,
    `off ∈ {−10,−5,0,+5,+10}`; `prob=probOverLine(μ, k−0.5, R)`, `actual = total_pass≥k?1:0`.
    Pool por `off` (banda) e geral. Reportar Brier/ECE/BrierSkill por banda × (ps,R).
  - **Settlement check:** imprimir, em 30 amostras, `total_pass`, `total_cross`,
    `total_pass − total_cross` e a fração `total_cross/total_pass` — para julgar se `total_pass`
    do BSD já exclui cruzamento (Opta) ou se há viés a tratar.
- [ ] **Step 2: Rodar** `npx tsx scripts/recalibrate-passes.mts` (pode demorar; rede). Capturar saída.
- [ ] **Step 3: VEREDITO (controller decide).** Critério = bar do faltas: **BrierSkill>0** e ECE
  comparável aos mercados que prestam, na banda de aposta (offsets perto de 0).
  - **PASSA** → anota `prior_rate`/`prior_strength`/`nb_dispersion` escolhidos; segue p/ Task 2.
  - **REPROVA** → passes vira **diagnóstico**: cataloga em `docs/features/mercados-nao-validados/`
    com os números e a hipótese; **pula Tasks 3–5 do money-path-com-estrela** (ainda implementa o
    mercado SEM `validated_lines`, p/ análise/forward), avisa o dono. Não apaga o trabalho.
- [ ] **Step 4: Commit** `git add scripts/recalibrate-passes.mts && git commit -m "feat(passes): script de calibração na seleção (gate)"`

## Task 2: `normalSf` + módulo `ladderDevig` (de-vig de escada) — puro, money-path

**Files:**
- Create: `src/value/ladderDevig.ts`
- Test: `test/ladderDevig.test.ts`

Reconstrói a curva justa de uma escada one-sided de overs e devolve `prob_devig` por degrau.

- [ ] **Step 1: Teste que falha** (`test/ladderDevig.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { ladderDevig, normalSf } from "../src/value/ladderDevig.js";

describe("normalSf", () => {
  it("S(0)=0.5, decai monotônico", () => {
    expect(normalSf(0)).toBeCloseTo(0.5, 3);
    expect(normalSf(1)).toBeCloseTo(0.1587, 2);
    expect(normalSf(-1)).toBeCloseTo(0.8413, 2);
  });
});

describe("ladderDevig", () => {
  it("recupera m,s de uma escada Normal(70,12) com margem c=1.08 e remove a margem", () => {
    const m = 70, s = 12, c = 1.08;
    const rungs = [60, 65, 70, 75, 80, 85, 90].map((L) => ({
      linha: L - 0.5, odd: 1 / (c * normalSf((L - m) / s)),
    }));
    const out = ladderDevig(rungs);
    expect(out.ok).toBe(true);
    expect(out.m).toBeCloseTo(70, 0);
    expect(out.s).toBeCloseTo(12, 0);
    // prob justa em 70+ ≈ S(0)=0.5 (sem a margem c que inflava p/ 0.54)
    const r70 = out.rungs.find((r) => r.linha === 69.5)!;
    expect(r70.prob_devig).toBeCloseTo(0.5, 2);
    expect(r70.prob_devig).toBeLessThan(1 / rungs[2]!.odd); // de-vig < implícita crua
    expect(r70.sem_devig).toBe(false);
  });
  it("K<3 → fallback sem_devig (implícita crua)", () => {
    const out = ladderDevig([{ linha: 84.5, odd: 1.8 }, { linha: 89.5, odd: 2.0 }]);
    expect(out.ok).toBe(false);
    expect(out.rungs[0]!.sem_devig).toBe(true);
    expect(out.rungs[0]!.prob_devig).toBeCloseTo(1 / 1.8, 6);
  });
  it("odds não-monótonas → fallback sem_devig", () => {
    const out = ladderDevig([
      { linha: 60, odd: 2.0 }, { linha: 65, odd: 1.5 }, { linha: 70, odd: 3.0 },
    ]);
    expect(out.ok).toBe(false);
    expect(out.rungs.every((r) => r.sem_devig)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar, ver falhar** (`npx vitest run test/ladderDevig.test.ts`) → módulo inexistente.
- [ ] **Step 3: Implementar** `src/value/ladderDevig.ts`:

```ts
import { impliedProb } from "./devig.js";

/** Sobrevivência da Normal padrão S(z)=P(Z>z)=1-Φ(z), via erf (Abramowitz-Stegun 7.1.26). */
export function normalSf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erfAbs = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  const erf = z < 0 ? -erfAbs : erfAbs;
  return 0.5 * (1 - erf);
}

export interface Rung { linha: number; odd: number; }
export interface DevigRung { linha: number; odd: number; prob_devig: number; sem_devig: boolean; }
export interface LadderResult { ok: boolean; m: number | null; s: number | null; c: number | null; rungs: DevigRung[]; }

/** De-vig de escada one-sided: ajusta Normal(m,s) + margem c às implícitas dos degraus
 * (q_k = c·S((L_k−m)/s)), por grid em (m,s) com c em forma fechada, e devolve a prob
 * JUSTA S((L_k−m)/s) por degrau. Fail-safe: K<3 / odds não-monótonas / ajuste ruim →
 * fallback sem_devig (implícita crua, conservadora). `linha` = convenção interna
 * (degrau "N+" ⇒ linha N−0.5 ⇒ probOverLine dá P(X≥N)); o de-vig usa o limiar N=linha+0.5. */
export function ladderDevig(rungsIn: Rung[]): LadderResult {
  const rungs = [...rungsIn].sort((a, b) => a.linha - b.linha);
  const fallback = (): LadderResult => ({
    ok: false, m: null, s: null, c: null,
    rungs: rungs.map((r) => ({ linha: r.linha, odd: r.odd, prob_devig: impliedProb(r.odd), sem_devig: true })),
  });
  if (rungs.length < 3) return fallback();
  const L = rungs.map((r) => r.linha + 0.5); // limiar N
  const q = rungs.map((r) => impliedProb(r.odd)); // P_book(X≥N), com margem
  // odds crescentes ⇒ q estritamente decrescente; senão escada inválida
  for (let i = 1; i < q.length; i++) if (q[i]! >= q[i - 1]!) return fallback();

  const lo = L[0]!, hi = L[L.length - 1]!;
  let best = { m: 0, s: 0, c: 1, res: Infinity };
  for (let m = lo - 25; m <= hi + 25; m += 1) {
    for (let s = 3; s <= 40; s += 0.5) {
      const S = L.map((l) => normalSf((l - m) / s));
      const denom = S.reduce((a, v) => a + v * v, 0);
      if (denom <= 0) continue;
      const c = S.reduce((a, v, i) => a + v * q[i]!, 0) / denom; // c* fechado (mínimos quadrados)
      if (c < 1.0) continue; // margem não pode ser <1 (over-round)
      let res = 0;
      for (let i = 0; i < S.length; i++) { const d = q[i]! - c * S[i]!; res += d * d; }
      if (res < best.res) best = { m, s, c, res };
    }
  }
  // ajuste ruim (RMSE relativa alta) → conservador
  const rmse = Math.sqrt(best.res / q.length);
  if (!Number.isFinite(rmse) || rmse > 0.05) return fallback();
  return {
    ok: true, m: best.m, s: best.s, c: best.c,
    rungs: rungs.map((r) => ({
      linha: r.linha, odd: r.odd,
      prob_devig: normalSf((r.linha + 0.5 - best.m) / best.s), sem_devig: false,
    })),
  };
}
```

- [ ] **Step 4: Rodar, ver passar** (`npx vitest run test/ladderDevig.test.ts`).
- [ ] **Step 5: Commit** `feat(passes): de-vig de escada one-sided (ladderDevig + normalSf)`

## Task 3: spec `passes` em MARKETS + `opp_mode` neutraliza oppMult

**Files:**
- Modify: `src/model/markets.ts` (interface `MarketSpec` + entrada `passes`)
- Modify: `src/providers/stats.ts` (`entityRate` respeita `opp_mode`)
- Test: `test/markets.test.ts`, `test/providersStats.test.ts`

- [ ] **Step 1: Testes que falham** — em `test/markets.test.ts`: registro tem 8 mercados incl.
  `passes`; `MARKETS.passes.opp_mode === "none"`, `settle_field === "total_pass"`. Antes do gate
  passar, `isValidated("passes",_,27)` deve ser **false** (sem `validated_lines`); a Task 6
  liga a estrela. Em `test/providersStats.test.ts`: `entityRate` de um mercado `opp_mode:"none"`
  **não** chama `teamConceded` e produz μ com `oppMult=1.0` (espiar via trace/`concedido_adversario` null).
- [ ] **Step 2: Rodar, ver falhar.**
- [ ] **Step 3: Implementar.** Em `MarketSpec` (após `concede_field`):

```ts
  // Modo do multiplicador de concessão. "concession" (default) = comportamento atual
  // (lê teamConceded). "none" = oppMult fixo em 1.0 (passe: o eixo de concessão tem
  // SINAL INVERTIDO — somaria a posse do rival; neutralizado, posse entra gated).
  opp_mode?: "concession" | "none";
```

Entrada em `MARKETS` (valores `prior_rate`/`prior_strength`/`nb_dispersion` vêm do **veredito da Task 1**):

```ts
  // PASSES tentados (`total_pass`). Betano liquida "Total de Passes" pela Opta
  // (tentados; exclui cruzamento/lateral/arremesso de goleiro). Confronto fraco
  // (posse-dominado) → oppMult NEUTRALIZADO (opp_mode:"none"); posse entra como
  // fator gated (ver possessionMultiplier) + texto p/ IA. prior/nb_dispersion
  // MEDIDOS na seleção (Task 1, scripts/recalibrate-passes.mts). validated_lines
  // setado na Task 6 conforme o veredito (vazio aqui = sem estrela até graduar).
  passes: spec({
    key: "passes", nivel: "jogador", kind: "contagem", stat_field: "total_pass",
    opp_mode: "none", settle_field: "total_pass",
    prior_rate: /* Task1 */ 0, prior_strength: /* Task1 */ 0, nb_dispersion: /* Task1 */ 0,
    lines: [], // passe não tem linhas fixas (escada por jogador); vazio
    eixo_concessao: "passes_(posse_dominado)", label: "Passes (Total)",
  }),
```

Em `src/providers/stats.ts::entityRate`, trocar o bloco de oppMult (linhas ~207-212) por:

```ts
    let oppConceded: number | null = null;
    let oppMult = 1.0;
    if ((market.opp_mode ?? "concession") !== "none") {
      const concedeField = market.concede_field ?? market.stat_field;
      const teamField = TEAM_STAT_FIELD[concedeField] ?? concedeField;
      const byPlayer = !(concedeField in TEAM_STAT_FIELD);
      oppConceded = await this.teamConceded(this.oppTeamId(ctx), teamField, 10, { byPlayer });
      oppMult = this.oppMult(oppConceded, leagueAvg);
    }
```

(`concedido_adversario` segue `oppConceded`, agora `null` p/ passes — coerente.)
- [ ] **Step 4: Rodar testes** (`npm test`). **Paridade INTACTA** (passes não toca μ existente).
- [ ] **Step 5: Commit** `feat(passes): spec + opp_mode neutraliza oppMult de sinal invertido`

## Task 4: `possessionMultiplier` (gated) + `posse_esperada` no adapter

**Files:**
- Modify: `src/model/adjustments.ts` (+`possessionMultiplier`)
- Modify: `src/providers/stats.ts` (`teamPossession` esperada do NOSSO time; aplica gated em `entityRate`)
- Test: `test/adjustments.test.ts`
- (Calibração de `K_PASS` reusa `scripts/recalibrate-passes.mts` — seção posse)

- [ ] **Step 1: Teste que falha** (`test/adjustments.test.ts`): `possessionMultiplier(0.5,"passes")===1.0`;
  `>1` p/ posse 0.65; `<1` p/ 0.35; clamp [0.85,1.20]; mercado ≠ passes → 1.0.
- [ ] **Step 2: Rodar, ver falhar.**
- [ ] **Step 3: Implementar** em `adjustments.ts`:

```ts
export const POSS_MULT_MIN = 0.85, POSS_MULT_MAX = 1.20;
/** Fator de posse p/ passes (gated por calibração). Mais posse NOSSA → mais passe.
 * K_PASS calibrado (Task 1, seção posse); 0 = desligado. Fail-closed: posse 0.5 → 1.0. */
export function possessionMultiplier(posseEsperadaNosso: number, market: string, kPass: number): number {
  if (market !== "passes" || kPass === 0) return 1.0;
  return Math.max(POSS_MULT_MIN, Math.min(POSS_MULT_MAX, 1 + kPass * (posseEsperadaNosso - 0.5)));
}
```

`K_PASS` constante em `src/model/params.ts` (valor do veredito; **0 se a posse não passar o gate**).
No `entityRate`, após `haMult`, se `market.key==="passes"`: derivar `posseEsperada` (média
`ball_possession/100` do NOSSO time nos últimos N via `teamPossession`, clamp [0.30,0.70], fallback
0.5) e compor `oppMultFinal *= possessionMultiplier(posseEsperada,"passes",K_PASS)`. Sempre setar
`posse_esperada` no retorno p/ a IA (texto), independente do gate.
- [ ] **Step 4: Calibrar `K_PASS`** (seção posse do script): varrer `K_PASS ∈ {0,1,2,3}` com posse
  esperada derivada do histórico; ligar (≠0) **só se** ECE↓ e BrierSkill↑ vs base. Senão `K_PASS=0`.
- [ ] **Step 5: Rodar testes; commit** `feat(passes): fator de posse gated + posse_esperada p/ IA`

## Task 5: Wiring — agrupar escada por jogador → ladderDevig → candidatos

**Files:**
- Modify: `src/candidates/builder.ts` (override de `prob_devig`)
- Modify: `src/manual/analyze.ts` (`playerCandidates`: ramo escada p/ passes)
- Test: `test/manualAnalyze.test.ts` (ou o de análise manual existente)

- [ ] **Step 1: Teste que falha** — `analyzeManual` com escada de passes fake (mesmo jogador, 5
  degraus) via `OnlyPlayer`/`ManualOdds` → emite 5 candidatos `market_type:"passes"`, cada um com
  `prob_devig` do `ladderDevig` (não a implícita crua; `sem_devig:false` quando a escada ajusta).
- [ ] **Step 2: Rodar, ver falhar.**
- [ ] **Step 3a: `buildCandidate` override.** Em `BuildCandidateArgs` add:
  `devig?: { prob: number; sem_devig: boolean } | null;` e no corpo, antes de calcular:

```ts
  const semDevig = a.devig ? a.devig.sem_devig : (a.odd_under == null || a.odd_under <= 1.0);
  const prob_devig = a.devig ? a.devig.prob : (semDevig ? impliedProb(a.odd_over) : fairProbOver(a.odd_over, a.odd_under as number));
```

- [ ] **Step 3b: Wiring** em `playerCandidates` (`src/manual/analyze.ts`): para o mercado `passes`,
  após casar (`matchPlayerOdds`) e ter `rate` por jogador, **agrupar os degraus casados por
  `player_id`**, rodar `ladderDevig(degraus.map(d=>({linha:d.linha, odd:d.odd_over})))` UMA vez por
  jogador, e emitir um `buildCandidate` por degrau passando `devig:{prob, sem_devig}` do resultado
  e `prob_modelo: probOverLine(rate.mu, d.linha, market.nb_dispersion)`. (Convenção: a UI/colagem
  manda "85+" → `linha=84.5`.) Demais mercados de jogador seguem o caminho atual (1 odd/jogador).
- [ ] **Step 4: Rodar testes** (`npm test`).
- [ ] **Step 5: Commit** `feat(passes): wiring de escada (devig por jogador) no fluxo manual`

## Task 6: Graduação + docs (CORE §3.1, I3 README) + suíte verde

**Files:**
- Modify: `src/model/markets.ts` (`validated_lines.selecao` conforme veredito)
- Modify: `docs/CORE.md` (§3.1 linha de passes; header contagem de testes)
- Modify: `docs/features/mercados-nao-validados/README.md` (se reprovou)

- [ ] **Step 1:** Setar `validated_lines.selecao` em `passes` conforme Task 1 (`[]` se calibrou na
  faixa toda; faixa restrita se só perto da mediana; **omitir** se reprovou → sem estrela). Atualizar
  `populacaoMotivo` se graduou. Teste em `test/markets.test.ts`.
- [ ] **Step 2:** CORE §3.1: adicionar linha **passes** (settlement `total_pass`, veredito, números);
  header testes. Remover passes da lista de "restante" no I3 README (sobe pro CORE). Se reprovou,
  catalogar em `mercados-nao-validados`.
- [ ] **Step 3: `npm test` + `npm run typecheck` verdes.** Commit `feat(passes): graduação + docs`.

## Task 7: Verificação runtime + finish

- [ ] **Step 1:** Subir `npm run dev`; POST `/analise/manual` com a escada real Coréia×Tcheca
  (5 jogadores da imagem) → inspecionar candidatos de passes (prob_devig < implícita crua;
  estrela só se graduou e titular confirmado). Capturar resposta.
- [ ] **Step 2:** `superpowers:finishing-a-development-branch` → merge em `main` (decisão do dono:
  ir até o fim).
