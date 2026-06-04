# Plano 1 — Motor + Gate de Paridade (Python → Node/TS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar o núcleo estatístico puro do odd-analyzer (model/, value/, candidates/, backtest/calibration) de Python para TypeScript, com testes espelhados 1-pra-1 e um gate de paridade que prova que os números não mudaram.

**Architecture:** Ports & Adapters. Este plano cobre só a camada de domínio PURA (sem HTTP, sem banco, sem rede). Tudo são funções determinísticas testáveis isoladamente. A primitiva `lgamma` (ausente no `Math` do JS) é implementada via Lanczos em `lib/mathx.ts` — já provado bater o Python em 1e-15.

**Tech Stack:** Node LTS, TypeScript (strict, ESM), Vitest. Sem dependências de runtime no motor (math puro).

**Convenção de nomes:** funções em camelCase (`probOverLine`, `fairProbOver`); **chaves de dados em snake_case PT** idênticas ao Python (`prob_devig`, `prob_modelo`, `amostra_jogos`, `market_type`) — elas fluem para API/DB/IA e não podem divergir.

**Fonte de verdade da tradução:** os arquivos Python em `src/odd_analyzer/`. Cada tarefa cita o arquivo de origem. O teste espelhado trava o comportamento.

---

## File Structure (este plano)

```
odd-analyzer/
  package.json            ← Create (scripts, deps de dev)
  tsconfig.json           ← Create (strict, ESM, NodeNext)
  vitest.config.ts        ← Create
  CLAUDE.md               ← Modify (reescreve parte técnica p/ Node/TS; preserva Produto+Glossário)
  ts/
    src/
      lib/mathx.ts            ← lgamma (Lanczos), factorial
      model/sotModel.ts       ← expectedLambda, poissonPmf, nbinomPmf, probAtLeast, probOverLine
      model/matchModel.ts     ← scoreMatrix, probs1x2, probTotalOver
      model/shrinkage.ts      ← shrinkRate
      model/adjustments.ts    ← opponentMultiplier, homeAwayMultiplier
      model/params.ts         ← constantes
      model/markets.ts        ← MarketSpec, MARKETS, baselineFor
      model/assemble.ts       ← windowedRate, assembleMu, filterGamesByScope, expectedMinutes, playerMuFromGames
      value/devig.ts          ← impliedProb, devigMultiplicative, devigPower, fairProbOver
      value/ev.ts             ← edgeEv
      candidates/builder.ts   ← buildCandidate
      candidates/filtro.ts    ← Cortes, filterCandidates
      backtest/calibration.ts ← brierScore, reliabilityBins, logLoss, expectedCalibrationError, brierSkillScore
    test/
      (espelha cada módulo: mathx.test.ts, sotModel.test.ts, ...)
      parity/golden/*.json    ← fixtures douradas geradas do Python
      parity/parity.test.ts   ← gate
```

> **Nota:** o código TS vive em `ts/` durante a coexistência com o Python. Ao fim de toda a migração (Plano 3) o Python é removido e `ts/` sobe pra raiz. Manter em `ts/` agora evita conflito de `package.json`/configs com o projeto Python ativo.

---

## Task 1: Scaffolding do projeto TS

**Files:**
- Create: `ts/package.json`
- Create: `ts/tsconfig.json`
- Create: `ts/vitest.config.ts`

- [ ] **Step 1: Criar `ts/package.json`**

```json
{
  "name": "odd-analyzer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "@types/node": "^22.5.0"
  }
}
```

- [ ] **Step 2: Criar `ts/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Criar `ts/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Instalar deps e verificar**

Run: `cd ts && npm install && npx vitest run --passWithNoTests`
Expected: instala sem erro; vitest roda e reporta "no test files found" / passa com 0 testes.

- [ ] **Step 5: Commit**

```bash
git add ts/package.json ts/tsconfig.json ts/vitest.config.ts ts/package-lock.json
git commit -m "chore(ts): scaffolding do projeto TypeScript (vitest, tsconfig strict)"
```

---

## Task 2: `lib/mathx.ts` — lgamma (Lanczos) + factorial

**Origem Python:** `src/odd_analyzer/model/sot_model.py` (usa `math.lgamma`, `math.factorial`).
**Files:**
- Create: `ts/src/lib/mathx.ts`
- Test: `ts/test/mathx.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from "vitest";
import { lgamma, factorial } from "../src/lib/mathx.js";

describe("lgamma", () => {
  it("bate valores conhecidos de math.lgamma do Python", () => {
    // referências geradas com Python: math.lgamma(x)
    const casos: [number, number][] = [
      [0.5, 0.5723649429247001],
      [1.0, 0.0],
      [1.5, -0.12078223763524543],
      [2.3, 0.15418945495963055],
      [5.0, 3.178053830347945],
      [12.7, 19.23304317957009],
      [50.0, 144.5657439463449],
      [100.0, 359.1342053695754],
    ];
    for (const [x, esperado] of casos) {
      expect(lgamma(x)).toBeCloseTo(esperado, 9);
    }
  });
});

describe("factorial", () => {
  it("calcula fatoriais inteiros", () => {
    expect(factorial(0)).toBe(1);
    expect(factorial(1)).toBe(1);
    expect(factorial(5)).toBe(120);
    expect(factorial(10)).toBe(3628800);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd ts && npx vitest run test/mathx.test.ts`
Expected: FAIL — "Cannot find module '../src/lib/mathx.js'".

- [ ] **Step 3: Implementar `ts/src/lib/mathx.ts`**

```typescript
// lgamma via aproximação de Lanczos (g=7, 9 coeficientes).
// Provado bater math.lgamma do Python em ~5e-14 (spike 2026-06-04).
const G = 7;
const C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (x < 0.5) {
    // reflexão: Γ(x)Γ(1-x) = π/sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  }
  x -= 1;
  let a = C[0]!;
  const t = x + G + 0.5;
  for (let i = 1; i < G + 2; i++) a += C[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

export function factorial(k: number): number {
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return f;
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd ts && npx vitest run test/mathx.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/lib/mathx.ts ts/test/mathx.test.ts
git commit -m "feat(ts): lib/mathx com lgamma (Lanczos) + factorial"
```

---

## Task 3: `model/sotModel.ts` — Poisson / NB2

**Origem Python:** `src/odd_analyzer/model/sot_model.py`. Teste espelha `tests/test_sot_model.py`.
**Files:**
- Create: `ts/src/model/sotModel.ts`
- Test: `ts/test/sotModel.test.ts`

- [ ] **Step 1: Escrever o teste que falha (espelha test_sot_model.py)**

```typescript
import { describe, it, expect } from "vitest";
import { expectedLambda, probAtLeast, probOverLine } from "../src/model/sotModel.js";

describe("sotModel", () => {
  it("expectedLambda: 2.0 SoT/90 em 45 min -> 1.0", () => {
    expect(expectedLambda(2.0, 45)).toBeCloseTo(1.0, 9);
  });

  it("poisson probAtLeast: mu=2, P(X>=2) = 1 - 3*e^-2", () => {
    const esperado = 1 - 3 * Math.exp(-2);
    expect(probAtLeast(2.0, 2)).toBeCloseTo(esperado, 9);
  });

  it("probAtLeast em 0 e 1", () => {
    expect(probAtLeast(1.5, 0)).toBe(1.0);
    expect(probAtLeast(1.5, 1)).toBeCloseTo(1 - Math.exp(-1.5), 9);
  });

  it("probOverLine 1.5 == P(X>=2)", () => {
    expect(probOverLine(2.0, 1.5)).toBeCloseTo(probAtLeast(2.0, 2), 12);
  });

  it("NB com r grande ~ Poisson", () => {
    expect(probAtLeast(2.0, 3, 100000)).toBeCloseTo(probAtLeast(2.0, 3), 3);
  });

  it("NB mais disperso (r pequeno) engrossa a cauda", () => {
    expect(probAtLeast(2.0, 5, 2)).toBeGreaterThan(probAtLeast(2.0, 5));
  });

  it("mu=0 não quebra e dá zero", () => {
    expect(probAtLeast(0.0, 1)).toBe(0.0);
    expect(probAtLeast(0.0, 1, 4.0)).toBe(0.0);
    expect(probOverLine(0.0, 0.5, 4.0)).toBe(0.0);
    expect(probAtLeast(0.0, 0)).toBe(1.0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ts && npx vitest run test/sotModel.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `ts/src/model/sotModel.ts`**

```typescript
import { lgamma, factorial } from "../lib/mathx.js";

/** Taxa esperada de SOT na partida = SoT/90 * minutos/90. */
export function expectedLambda(sotPer90: number, expectedMinutes: number): number {
  return (sotPer90 * expectedMinutes) / 90.0;
}

function poissonPmf(k: number, mu: number): number {
  return (Math.exp(-mu) * mu ** k) / factorial(k);
}

function nbinomPmf(k: number, r: number, mu: number): number {
  // NB2: média mu, dispersão r (>0). p = r/(r+mu).
  const p = r / (r + mu);
  const log =
    lgamma(k + r) - lgamma(r) - lgamma(k + 1) +
    r * Math.log(p) + k * Math.log(1 - p);
  return Math.exp(log);
}

/** P(X >= k). r=null -> Poisson; r>0 -> Binomial Negativa (overdispersion). */
export function probAtLeast(mu: number, k: number, r: number | null = null): number {
  if (k <= 0) return 1.0;
  if (mu <= 0) return 0.0; // média 0 => X sempre 0 (evita log(0))
  const pmf = r === null ? (i: number) => poissonPmf(i, mu) : (i: number) => nbinomPmf(i, r, mu);
  let cum = 0;
  for (let i = 0; i < k; i++) cum += pmf(i); // P(X <= k-1)
  return Math.max(0.0, 1.0 - cum);
}

/** P de bater uma linha over/under. Ex.: over 1.5 == P(X >= 2). */
export function probOverLine(mu: number, line: number, r: number | null = null): number {
  const k = Math.floor(line) + 1;
  return probAtLeast(mu, k, r);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd ts && npx vitest run test/sotModel.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/model/sotModel.ts ts/test/sotModel.test.ts
git commit -m "feat(ts): model/sotModel (Poisson/NB2) espelhado"
```

---

## Task 4: `model/matchModel.ts` — Dixon-Coles

**Origem Python:** `src/odd_analyzer/model/match_model.py`. Teste espelha `tests/test_match_model.py`.
**Files:**
- Create: `ts/src/model/matchModel.ts`
- Test: `ts/test/matchModel.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from "vitest";
import { scoreMatrix, probs1x2, probTotalOver } from "../src/model/matchModel.js";

describe("matchModel", () => {
  it("scoreMatrix normaliza para soma ~1", () => {
    const m = scoreMatrix(1.4, 1.1);
    const total = m.flat().reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 9);
  });

  it("probs1x2 somam ~1 e mandante mais forte vence mais", () => {
    const m = scoreMatrix(1.8, 0.9);
    const p = probs1x2(m);
    expect(p.home + p.draw + p.away).toBeCloseTo(1.0, 9);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it("probTotalOver decresce com a linha", () => {
    const m = scoreMatrix(1.5, 1.3);
    expect(probTotalOver(m, 1.5)).toBeGreaterThan(probTotalOver(m, 3.5));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ts && npx vitest run test/matchModel.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `ts/src/model/matchModel.ts`**

```typescript
const MAX_GOLS = 10; // trunca a matriz (P de >10 gols é desprezível)
const RHO = -0.05; // correção Dixon-Coles

function poissonPmf(k: number, lam: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lam) * lam ** k) / fact;
}

function dcTau(i: number, j: number, lh: number, la: number, rho: number): number {
  if (i === 0 && j === 0) return 1.0 - lh * la * rho;
  if (i === 0 && j === 1) return 1.0 + lh * rho;
  if (i === 1 && j === 0) return 1.0 + la * rho;
  if (i === 1 && j === 1) return 1.0 - rho;
  return 1.0;
}

export function scoreMatrix(lambdaHome: number, lambdaAway: number, rho: number = RHO): number[][] {
  const m: number[][] = Array.from({ length: MAX_GOLS + 1 }, () => new Array(MAX_GOLS + 1).fill(0));
  let total = 0;
  for (let i = 0; i <= MAX_GOLS; i++) {
    for (let j = 0; j <= MAX_GOLS; j++) {
      let p = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway) * dcTau(i, j, lambdaHome, lambdaAway, rho);
      p = Math.max(p, 0.0);
      m[i]![j] = p;
      total += p;
    }
  }
  if (total > 0) {
    for (let i = 0; i <= MAX_GOLS; i++) {
      for (let j = 0; j <= MAX_GOLS; j++) m[i]![j]! /= total;
    }
  }
  return m;
}

export function probs1x2(matrix: number[][]): { home: number; draw: number; away: number } {
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i]!.length; j++) {
      const p = matrix[i]![j]!;
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  return { home, draw, away };
}

export function probTotalOver(matrix: number[][], linha: number): number {
  let s = 0;
  for (let i = 0; i < matrix.length; i++) {
    for (let j = 0; j < matrix[i]!.length; j++) {
      if (i + j > linha) s += matrix[i]![j]!;
    }
  }
  return s;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd ts && npx vitest run test/matchModel.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/model/matchModel.ts ts/test/matchModel.test.ts
git commit -m "feat(ts): model/matchModel (Dixon-Coles) espelhado"
```

---

## Task 5: `model/shrinkage.ts` + `model/adjustments.ts`

**Origem Python:** `src/odd_analyzer/model/shrinkage.py`, `src/odd_analyzer/model/adjustments.py`. Teste espelha `tests/test_shrinkage.py` e `tests/test_adjustments.py`.
**Files:**
- Create: `ts/src/model/shrinkage.ts`
- Create: `ts/src/model/adjustments.ts`
- Test: `ts/test/shrinkage.test.ts`
- Test: `ts/test/adjustments.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`ts/test/shrinkage.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { shrinkRate } from "../src/model/shrinkage.js";

describe("shrinkRate", () => {
  it("apps=0 retorna o prior", () => {
    expect(shrinkRate(5.0, 0, 0.4, 12.0)).toBeCloseTo(0.4, 12);
  });
  it("média ponderada entre taxa e prior", () => {
    // (10*1.0 + 12*0.4)/(10+12) = 14.8/22
    expect(shrinkRate(1.0, 10, 0.4, 12.0)).toBeCloseTo(14.8 / 22, 12);
  });
});
```

`ts/test/adjustments.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { opponentMultiplier, homeAwayMultiplier } from "../src/model/adjustments.js";

describe("adjustments", () => {
  it("opponentMultiplier: >1 quando adversário concede mais que a média", () => {
    expect(opponentMultiplier(6.0, 4.5)).toBeCloseTo(6.0 / 4.5, 12);
  });
  it("opponentMultiplier: neutro (1.0) sem dado de liga", () => {
    expect(opponentMultiplier(6.0, 0)).toBe(1.0);
  });
  it("homeAwayMultiplier escolhe pelo mando", () => {
    expect(homeAwayMultiplier(true, 1.1, 0.9)).toBe(1.1);
    expect(homeAwayMultiplier(false, 1.1, 0.9)).toBe(0.9);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ts && npx vitest run test/shrinkage.test.ts test/adjustments.test.ts`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implementar os dois módulos**

`ts/src/model/shrinkage.ts`:
```typescript
/** Média ponderada entre a taxa do jogador (peso = nº de jogos) e o prior
 * (peso = priorStrength). Com apps=0, retorna o prior. */
export function shrinkRate(rate: number, apps: number, priorRate: number, priorStrength: number): number {
  return (apps * rate + priorStrength * priorRate) / (apps + priorStrength);
}
```

`ts/src/model/adjustments.ts`:
```typescript
/** Ajuste pela defesa do adversário. >1 = defesa vazada; <1 = sólida.
 * Neutro (1.0) se a média da liga não for positiva. */
export function opponentMultiplier(oppConcededPerGame: number, leagueAvgConceded: number): number {
  if (leagueAvgConceded <= 0) return 1.0;
  return oppConcededPerGame / leagueAvgConceded;
}

/** Ajuste de mando. homeFactor/awayFactor normalizados em torno de 1. */
export function homeAwayMultiplier(isHome: boolean, homeFactor: number, awayFactor: number): number {
  return isHome ? homeFactor : awayFactor;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd ts && npx vitest run test/shrinkage.test.ts test/adjustments.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/model/shrinkage.ts ts/src/model/adjustments.ts ts/test/shrinkage.test.ts ts/test/adjustments.test.ts
git commit -m "feat(ts): model/shrinkage + model/adjustments espelhados"
```

---

## Task 6: `model/params.ts` + `model/markets.ts`

**Origem Python:** `src/odd_analyzer/model/params.py`, `src/odd_analyzer/model/markets.py`. Teste espelha `tests/test_markets.py`.
**Files:**
- Create: `ts/src/model/params.ts`
- Create: `ts/src/model/markets.ts`
- Test: `ts/test/markets.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from "vitest";
import { MARKETS, baselineFor } from "../src/model/markets.js";

describe("markets", () => {
  it("registry tem os 6 mercados do MVP", () => {
    expect(Object.keys(MARKETS).sort()).toEqual(
      ["desarmes", "escanteios", "finalizacoes", "gols", "sot", "vitoria"]
    );
  });

  it("sot é nível jogador, contagem, campo shots_on_target", () => {
    const m = MARKETS["sot"]!;
    expect(m.nivel).toBe("jogador");
    expect(m.kind).toBe("contagem");
    expect(m.stat_field).toBe("shots_on_target");
  });

  it("baselineFor: liga de seleção (27=WC2026) usa baseline nacional", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, 27)).toBeCloseTo(4.28, 9);
  });

  it("baselineFor: liga de clube (9) usa baseline de clube", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, 9)).toBeCloseTo(4.55, 9);
  });

  it("baselineFor: league_id inválido cai no baseline de clube", () => {
    const m = MARKETS["sot"]!;
    expect(baselineFor(m, null)).toBeCloseTo(4.55, 9);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ts && npx vitest run test/markets.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar os módulos**

`ts/src/model/params.ts`:
```typescript
// Parâmetros do modelo de contagem, em UM lugar. Calibrados no backtest EPL 2023.
export const NB_DISPERSION = 3.0; // r da Binomial Negativa
export const PRIOR_RATE = 0.4; // SoT/90 do prior
export const PRIOR_STRENGTH = 12; // peso do prior em "jogos equivalentes"
export const MIN_OTHER_MINUTES = 60; // mínimo de minutos leave-one-out
export const LINHAS = [0.5, 1.5]; // linhas over/under no backtest
```

`ts/src/model/markets.ts`:
```typescript
export interface MarketSpec {
  key: string;
  nivel: "jogador" | "partida";
  kind: "contagem" | "partida_totais" | "partida_1x2";
  stat_field: string;
  prior_rate: number;
  prior_strength: number;
  nb_dispersion: number;
  lines: number[];
  eixo_concessao: string;
  label: string;
  concede_baseline: number;
  concede_baseline_nacional: number;
}

function spec(p: Omit<MarketSpec, "concede_baseline" | "concede_baseline_nacional"> &
  { concede_baseline?: number; concede_baseline_nacional?: number }): MarketSpec {
  return { concede_baseline: 0.0, concede_baseline_nacional: 0.0, ...p };
}

export const MARKETS: Record<string, MarketSpec> = {
  sot: spec({
    key: "sot", nivel: "jogador", kind: "contagem", stat_field: "shots_on_target",
    prior_rate: 0.4, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "chutes_a_gol_concedidos_por_jogo", label: "Chutes a Gol (SOT)",
    concede_baseline: 4.55, concede_baseline_nacional: 4.28,
  }),
  finalizacoes: spec({
    key: "finalizacoes", nivel: "jogador", kind: "contagem", stat_field: "total_shots",
    prior_rate: 1.2, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "finalizacoes_concedidas_por_jogo", label: "Finalizações Totais",
    concede_baseline: 13.46, concede_baseline_nacional: 12.22,
  }),
  desarmes: spec({
    key: "desarmes", nivel: "jogador", kind: "contagem", stat_field: "total_tackle",
    prior_rate: 1.3, prior_strength: 12.0, nb_dispersion: 3.0, lines: [0.5, 1.5, 2.5],
    eixo_concessao: "desarmes_concedidos_por_jogo", label: "Desarmes",
    concede_baseline: 14.64, concede_baseline_nacional: 13.97,
  }),
  escanteios: spec({
    key: "escanteios", nivel: "partida", kind: "contagem", stat_field: "corners",
    prior_rate: 5.0, prior_strength: 10.0, nb_dispersion: 3.0, lines: [8.5, 9.5, 10.5],
    eixo_concessao: "escanteios_concedidos_por_jogo", label: "Escanteios (Total)",
    concede_baseline: 4.79,
  }),
  gols: spec({
    key: "gols", nivel: "partida", kind: "partida_totais", stat_field: "goals",
    prior_rate: 1.3, prior_strength: 10.0, nb_dispersion: 3.0, lines: [1.5, 2.5, 3.5],
    eixo_concessao: "gols_concedidos_por_jogo", label: "Gols (Total)",
    concede_baseline: 1.3,
  }),
  vitoria: spec({
    key: "vitoria", nivel: "partida", kind: "partida_1x2", stat_field: "goals",
    prior_rate: 1.3, prior_strength: 10.0, nb_dispersion: 3.0, lines: [1.5, 2.5, 3.5],
    eixo_concessao: "gols_concedidos_por_jogo", label: "Resultado (1X2)",
    concede_baseline: 1.3,
  }),
};

// Ligas de seleção (Copa e correlatas) → baseline nacional. WC2026 = 27.
const NATIONAL_LEAGUE_IDS = new Set([58, 59, 60, 61, 62, 64, 65, 66, 67, 31, 27]);

/** Escolhe o concede_baseline certo pela liga: seleção → nacional; senão → clube. */
export function baselineFor(market: MarketSpec, leagueId: unknown): number {
  const lid = typeof leagueId === "number" ? leagueId : parseInt(String(leagueId), 10);
  if (Number.isNaN(lid)) return market.concede_baseline;
  if (NATIONAL_LEAGUE_IDS.has(lid)) return market.concede_baseline_nacional || market.concede_baseline;
  return market.concede_baseline;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd ts && npx vitest run test/markets.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/model/params.ts ts/src/model/markets.ts ts/test/markets.test.ts
git commit -m "feat(ts): model/params + model/markets (registry MVP) espelhados"
```

---

## Task 7: `model/assemble.ts`

**Origem Python:** `src/odd_analyzer/model/assemble.py`. Teste espelha `tests/test_assemble.py`.
**Files:**
- Create: `ts/src/model/assemble.ts`
- Test: `ts/test/assemble.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from "vitest";
import {
  windowedRate, assembleMu, filterGamesByScope, expectedMinutes, playerMuFromGames,
} from "../src/model/assemble.js";

type Game = Record<string, unknown>;

describe("assemble", () => {
  it("windowedRate por-jogo (minutesField=null) usa média", () => {
    const games: Game[] = [{ x: 2 }, { x: 4 }, { x: 6 }];
    const r = windowedRate(games, "x");
    expect(r["w3"]).toBeCloseTo((2 + 4 + 6) / 3, 12);
  });

  it("windowedRate per-90 ponderado por minutos", () => {
    const games: Game[] = [
      { x: 1, minutes_played: 90 },
      { x: 2, minutes_played: 45 },
    ];
    const r = windowedRate(games, "x", [3, 5, 10], null, "minutes_played");
    // (1+2)/(90+45)*90 = 2.0
    expect(r["w3"]).toBeCloseTo(2.0, 12);
  });

  it("assembleMu compõe lambda * mults", () => {
    // expectedLambda(1.0, 90)=1.0 ; *1.2*1.1 = 1.32
    expect(assembleMu(1.0, 90, 1.2, 1.1)).toBeCloseTo(1.32, 12);
  });

  it("filterGamesByScope separa seleção/clube pelo team_id alvo", () => {
    const games: Game[] = [
      { team_id: "10", x: 1 }, { team_id: "20", x: 2 },
    ];
    expect(filterGamesByScope(games, "todos", "10")).toHaveLength(2);
    expect(filterGamesByScope(games, "selecao", "10")).toEqual([{ team_id: "10", x: 1 }]);
    expect(filterGamesByScope(games, "clube", "10")).toEqual([{ team_id: "20", x: 2 }]);
  });

  it("expectedMinutes usa a janela recente", () => {
    const games: Game[] = [
      { minutes_played: 90 }, { minutes_played: 80 }, { minutes_played: 70 },
      { minutes_played: 60 }, { minutes_played: 50 },
    ];
    // w5 = média dos 5 = 70
    expect(expectedMinutes(games)).toBeCloseTo(70, 12);
  });

  it("playerMuFromGames devolve mu/raw_rate/shrunk/n ou null", () => {
    const games: Game[] = [
      { shots_on_target: 1, minutes_played: 90 },
      { shots_on_target: 2, minutes_played: 90 },
    ];
    const out = playerMuFromGames(games, "shots_on_target", 0.4, 12.0, 1.0, 1.0, 90.0);
    expect(out).not.toBeNull();
    expect(out!.n).toBe(2);
    expect(typeof out!.mu).toBe("number");

    expect(playerMuFromGames([], "shots_on_target", 0.4, 12.0, 1.0, 1.0)).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ts && npx vitest run test/assemble.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `ts/src/model/assemble.ts`**

```typescript
import { expectedLambda } from "./sotModel.js";
import { shrinkRate } from "./shrinkage.js";

type Game = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

/** Taxa do statField nas últimas N partidas (janelas 3/5/10). `games` em ordem
 * CRESCENTE (recente no fim). minutesField=null → média por-jogo; str → per-90
 * ponderado por minutos. */
export function windowedRate(
  games: Game[],
  statField: string,
  windows: number[] = [3, 5, 10],
  mando: string | null = null,
  minutesField: string | null = null,
): Record<string, number | null> {
  let source = games;
  if (mando !== null) source = games.filter((g) => g["mando"] === mando);

  const result: Record<string, number | null> = {};
  for (const n of windows) {
    const window = source.length >= 1 ? source.slice(-n) : [];
    if (window.length === 0) {
      result[`w${n}`] = null;
    } else if (minutesField === null) {
      const vals = window.map((g) => num(g[statField]));
      result[`w${n}`] = vals.reduce((a, b) => a + b, 0) / vals.length;
    } else {
      const totStat = window.reduce((a, g) => a + num(g[statField]), 0);
      const totMin = window.reduce((a, g) => a + (num(g[minutesField]) || 0), 0);
      result[`w${n}`] = totMin > 0 ? (totStat / totMin) * 90.0 : null;
    }
  }
  return result;
}

/** mu = expectedLambda(ratePer90, minutos) * oppMult * haMult. ratePer90 já encolhido. */
export function assembleMu(ratePer90: number, minutosEsperados: number, oppMult: number, haMult: number): number {
  return expectedLambda(ratePer90, minutosEsperados) * oppMult * haMult;
}

/** Filtra histórico por escopo comparando team_id de cada jogo com o time alvo. */
export function filterGamesByScope(games: Game[], escopo: string, entityTeamId: unknown): Game[] {
  if (escopo === "todos") return games;
  const alvo = String(entityTeamId);
  if (escopo === "selecao") return games.filter((g) => String(g["team_id"]) === alvo);
  if (escopo === "clube") return games.filter((g) => String(g["team_id"]) !== alvo);
  return games;
}

/** Minutos esperados = janela recente de minutes_played (w5→w3→w10). null se sem jogos. */
export function expectedMinutes(games: Game[]): number | null {
  const rates = windowedRate(games, "minutes_played");
  const w5 = rates["w5"], w3 = rates["w3"], w10 = rates["w10"];
  return w5 !== null && w5 !== undefined ? w5 : w3 !== null && w3 !== undefined ? w3 : w10 ?? null;
}

export interface PlayerMu { mu: number; raw_rate: number; shrunk: number; n: number; }

/** Conta pura compartilhada por produção e backtest. `games` em ordem CRESCENTE. */
export function playerMuFromGames(
  games: Game[], statField: string, priorRate: number, priorStrength: number,
  oppMult: number, haMult: number, minutosEsperados = 90.0,
): PlayerMu | null {
  const rates = windowedRate(games, statField, [3, 5, 10], null, "minutes_played");
  const w5 = rates["w5"], w3 = rates["w3"], w10 = rates["w10"];
  const rawRate = w5 !== null && w5 !== undefined ? w5 : w3 !== null && w3 !== undefined ? w3 : w10 ?? null;
  if (rawRate === null) return null;
  const shrunk = shrinkRate(rawRate, games.length, priorRate, priorStrength);
  const mu = assembleMu(shrunk, minutosEsperados, oppMult, haMult);
  return { mu, raw_rate: rawRate, shrunk, n: games.length };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd ts && npx vitest run test/assemble.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/model/assemble.ts ts/test/assemble.test.ts
git commit -m "feat(ts): model/assemble (windowed rate + mu) espelhado"
```

---

## Task 8: `value/devig.ts` + `value/ev.ts`

**Origem Python:** `src/odd_analyzer/value/devig.py`, `src/odd_analyzer/value/ev.py`. Teste espelha `tests/test_devig.py`.
**Files:**
- Create: `ts/src/value/devig.ts`
- Create: `ts/src/value/ev.ts`
- Test: `ts/test/devig.test.ts`
- Test: `ts/test/ev.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`ts/test/devig.test.ts` (espelha test_devig.py):
```typescript
import { describe, it, expect } from "vitest";
import { impliedProb, devigMultiplicative, devigPower, fairProbOver } from "../src/value/devig.js";

describe("devig", () => {
  it("impliedProb", () => {
    expect(impliedProb(2.0)).toBeCloseTo(0.5, 12);
  });
  it("multiplicativo mercado par 1.91/1.91 -> 0.5/0.5", () => {
    const [po, pu] = devigMultiplicative(1.91, 1.91);
    expect(po).toBeCloseTo(0.5, 9);
    expect(pu).toBeCloseTo(0.5, 9);
    expect(po + pu).toBeCloseTo(1.0, 12);
  });
  it("multiplicativo soma 1 e favorito tem mais prob", () => {
    const [po, pu] = devigMultiplicative(1.5, 3.0);
    expect(po + pu).toBeCloseTo(1.0, 12);
    expect(po).toBeGreaterThan(pu);
  });
  it("power method mercado par", () => {
    const [po, pu] = devigPower(1.91, 1.91);
    expect(po).toBeCloseTo(0.5, 3);
    expect(po + pu).toBeCloseTo(1.0, 6);
  });
  it("fairProbOver é o conservador (max dos dois métodos)", () => {
    const [poM] = devigMultiplicative(1.8, 2.1);
    const [poP] = devigPower(1.8, 2.1);
    expect(fairProbOver(1.8, 2.1)).toBeCloseTo(Math.max(poM, poP), 9);
  });
  it("power desloca prob ao favorito vs multiplicativo", () => {
    const [poP, puP] = devigPower(1.40, 3.20);
    const [poM] = devigMultiplicative(1.40, 3.20);
    expect(poP + puP).toBeCloseTo(1.0, 9);
    expect(poP).toBeGreaterThan(puP);
    expect(poP).toBeGreaterThan(poM);
  });
  it("fairProbOver usa multiplicativo quando over é zebra", () => {
    const [poM] = devigMultiplicative(2.1, 1.8);
    const [poP] = devigPower(2.1, 1.8);
    expect(poM).toBeGreaterThan(poP);
    expect(fairProbOver(2.1, 1.8)).toBeCloseTo(poM, 9);
  });
  it("odd inválida levanta erro", () => {
    expect(() => impliedProb(1.0)).toThrow();
  });
});
```

`ts/test/ev.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { edgeEv } from "../src/value/ev.js";

describe("edgeEv", () => {
  it("edge = modelo - devig; ev = modelo*odd - 1", () => {
    const m = edgeEv(0.6, 0.5, 1.9);
    expect(m.edge).toBeCloseTo(0.1, 12);
    expect(m.ev).toBeCloseTo(0.6 * 1.9 - 1.0, 12);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ts && npx vitest run test/devig.test.ts test/ev.test.ts`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implementar os módulos**

`ts/src/value/devig.ts`:
```typescript
/** Probabilidade implícita de uma odd decimal. Odd deve ser > 1. */
export function impliedProb(odd: number): number {
  if (odd <= 1.0) throw new Error(`odd decimal deve ser > 1.0, recebido ${odd}`);
  return 1.0 / odd;
}

/** Normalização proporcional: p_i = implícita_i / soma. */
export function devigMultiplicative(oddOver: number, oddUnder: number): [number, number] {
  const io = impliedProb(oddOver), iu = impliedProb(oddUnder);
  const s = io + iu;
  return [io / s, iu / s];
}

/** Acha k tal que io^k + iu^k = 1 (bisseção); p_i = implícita_i^k. */
export function devigPower(oddOver: number, oddUnder: number): [number, number] {
  const io = impliedProb(oddOver), iu = impliedProb(oddUnder);
  let lo = 0.1, hi = 20.0, k = (lo + hi) / 2;
  for (let i = 0; i < 100; i++) {
    k = (lo + hi) / 2;
    const f = io ** k + iu ** k - 1.0;
    if (Math.abs(f) < 1e-12) break;
    if (f > 0) lo = k; // f decresce com k (io,iu<1) -> f>0 ⇒ k sobe
    else hi = k;
  }
  return [io ** k, iu ** k];
}

/** Prob justa do OVER, conservadora: a MAIOR entre os dois métodos. */
export function fairProbOver(oddOver: number, oddUnder: number): number {
  const [poM] = devigMultiplicative(oddOver, oddUnder);
  const [poP] = devigPower(oddOver, oddUnder);
  return Math.max(poM, poP);
}
```

`ts/src/value/ev.ts`:
```typescript
/** edge = prob_modelo - prob_devig; ev = prob_modelo * odd - 1. */
export function edgeEv(probModelo: number, probDevig: number, oddDecimal: number): { edge: number; ev: number } {
  return {
    edge: probModelo - probDevig,
    ev: probModelo * oddDecimal - 1.0,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd ts && npx vitest run test/devig.test.ts test/ev.test.ts`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/value/devig.ts ts/src/value/ev.ts ts/test/devig.test.ts ts/test/ev.test.ts
git commit -m "feat(ts): value/devig (multiplicativo+power) + value/ev espelhados"
```

---

## Task 9: `candidates/builder.ts` + `candidates/filtro.ts`

**Origem Python:** `src/odd_analyzer/candidates/builder.py`, `src/odd_analyzer/candidates/filtro.py`. Teste espelha `tests/test_builder.py` e `tests/test_filtro.py`.
**Files:**
- Create: `ts/src/candidates/builder.ts`
- Create: `ts/src/candidates/filtro.ts`
- Test: `ts/test/builder.test.ts`
- Test: `ts/test/filtro.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

`ts/test/builder.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { buildCandidate } from "../src/candidates/builder.js";

describe("buildCandidate", () => {
  it("calcula prob_devig/edge/ev e monta o dossiê (a IA nunca calcula)", () => {
    const c = buildCandidate({
      jogador: "Kaiki", linha: 1.5, odd_over: 1.9, odd_under: 2.0,
      prob_modelo: 0.6, mu: 1.8, minutos_esperados: 88, xi_confirmado: true,
      amostra_jogos: 12, concedido_adversario: 5.0, incerteza: "baixa",
      market_type: "desarmes", player_id: "42",
    });
    expect(c["jogador"]).toBe("Kaiki");
    expect(c["market_type"]).toBe("desarmes");
    expect(c["prob_devig"]).toBeGreaterThan(0);
    expect(c["edge"]).toBeCloseTo(0.6 - (c["prob_devig"] as number), 12);
    expect(c["ev"]).toBeCloseTo(0.6 * 1.9 - 1.0, 12);
  });
});
```

`ts/test/filtro.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { filterCandidates, CORTES_DEFAULT } from "../src/candidates/filtro.js";

const cand = (over: Partial<Record<string, unknown>>) => ({
  edge: 0.05, ev: 0.06, xi_confirmado: true, amostra_jogos: 12, ...over,
});

describe("filterCandidates", () => {
  it("mantém só quem passa edge/ev/xi/amostra e ordena por ev desc", () => {
    const cands = [
      cand({ ev: 0.06 }),
      cand({ ev: 0.10 }),
      cand({ edge: 0.01 }),          // reprovado: edge baixo
      cand({ xi_confirmado: false }), // reprovado: não confirmado
      cand({ amostra_jogos: 5 }),     // reprovado: amostra pequena
    ];
    const out = filterCandidates(cands, CORTES_DEFAULT);
    expect(out).toHaveLength(2);
    expect(out[0]!["ev"]).toBe(0.10); // ordenado desc
  });

  it("lista vazia é resultado válido", () => {
    expect(filterCandidates([cand({ edge: 0.0, ev: 0.0 })], CORTES_DEFAULT)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ts && npx vitest run test/builder.test.ts test/filtro.test.ts`
Expected: FAIL — módulos não encontrados.

- [ ] **Step 3: Implementar os módulos**

`ts/src/candidates/builder.ts`:
```typescript
import { fairProbOver } from "../value/devig.js";
import { edgeEv } from "../value/ev.js";

export interface BuildCandidateArgs {
  jogador: unknown;
  linha: number;
  odd_over: number;
  odd_under: number;
  prob_modelo: number;
  mu: number;
  minutos_esperados: number;
  xi_confirmado: boolean;
  amostra_jogos: number;
  concedido_adversario: unknown;
  incerteza: unknown;
  market_type: string;
  player_id?: unknown;
}

/** Monta o dossiê de UM candidato. Toda a matemática (de-vig, edge, EV) vem daqui
 * — a IA nunca calcula. Chaves em snake_case (fluem p/ API/DB/IA). */
export function buildCandidate(a: BuildCandidateArgs): Record<string, unknown> {
  const prob_devig = fairProbOver(a.odd_over, a.odd_under);
  const m = edgeEv(a.prob_modelo, prob_devig, a.odd_over);
  return {
    jogador: a.jogador,
    player_id: a.player_id ?? null,
    linha: a.linha,
    odd: a.odd_over,
    prob_modelo: a.prob_modelo,
    prob_devig,
    edge: m.edge,
    ev: m.ev,
    lambda: a.mu,
    minutos_esperados: a.minutos_esperados,
    xi_confirmado: a.xi_confirmado,
    amostra_jogos: a.amostra_jogos,
    concedido_adversario: a.concedido_adversario,
    incerteza: a.incerteza,
    market_type: a.market_type,
  };
}
```

`ts/src/candidates/filtro.ts`:
```typescript
export interface Cortes {
  edge_min: number;
  ev_min: number;
  amostra_min: number;
}

export const CORTES_DEFAULT: Cortes = { edge_min: 0.04, ev_min: 0.05, amostra_min: 10 };

/** Mantém só candidatos com valor real (edge/ev acima do corte, titular confirmado,
 * amostra suficiente). Ordena por EV desc. Lista vazia é resultado válido. */
export function filterCandidates(
  candidatos: Record<string, unknown>[],
  cuts: Cortes = CORTES_DEFAULT,
): Record<string, unknown>[] {
  const keep = candidatos.filter(
    (c) =>
      (c["edge"] as number) >= cuts.edge_min &&
      (c["ev"] as number) >= cuts.ev_min &&
      (c["xi_confirmado"] as boolean) === true &&
      ((c["amostra_jogos"] as number) ?? 0) >= cuts.amostra_min,
  );
  return keep.sort((a, b) => (b["ev"] as number) - (a["ev"] as number));
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd ts && npx vitest run test/builder.test.ts test/filtro.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/candidates/builder.ts ts/src/candidates/filtro.ts ts/test/builder.test.ts ts/test/filtro.test.ts
git commit -m "feat(ts): candidates/builder + candidates/filtro espelhados"
```

---

## Task 10: `backtest/calibration.ts`

**Origem Python:** `src/odd_analyzer/backtest/calibration.py`. Teste espelha `tests/test_calibration.py`.
**Files:**
- Create: `ts/src/backtest/calibration.ts`
- Test: `ts/test/calibration.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```typescript
import { describe, it, expect } from "vitest";
import {
  brierScore, reliabilityBins, logLoss, expectedCalibrationError, brierSkillScore,
} from "../src/backtest/calibration.js";

describe("calibration", () => {
  it("brierScore: erro quadrático médio", () => {
    // preds=[1,0], actuals=[1,0] -> 0 ; preds=[0.5,0.5] actuals=[1,0] -> 0.25
    expect(brierScore([1, 0], [1, 0])).toBeCloseTo(0, 12);
    expect(brierScore([0.5, 0.5], [1, 0])).toBeCloseTo(0.25, 12);
  });

  it("brierScore preds vazio levanta erro", () => {
    expect(() => brierScore([], [])).toThrow();
  });

  it("logLoss penaliza erro confiante", () => {
    const certo = logLoss([0.9, 0.1], [1, 0]);
    const errado = logLoss([0.1, 0.9], [1, 0]);
    expect(errado).toBeGreaterThan(certo);
  });

  it("reliabilityBins agrupa e mede pred vs real", () => {
    const bins = reliabilityBins([0.05, 0.95], [0, 1], 10);
    expect(bins).toHaveLength(2);
    expect(bins[0]!.count).toBe(1);
  });

  it("expectedCalibrationError perfeito ~0", () => {
    // modelo perfeito: prob 1 quando 1, prob 0 quando 0
    const ece = expectedCalibrationError([1, 1, 0, 0], [1, 1, 0, 0], 10);
    expect(ece).toBeCloseTo(0, 9);
  });

  it("brierSkillScore: >0 quando bate a climatologia", () => {
    // modelo perfeito tem skill 1
    expect(brierSkillScore([1, 0, 1, 0], [1, 0, 1, 0])).toBeCloseTo(1.0, 9);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd ts && npx vitest run test/calibration.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar `ts/src/backtest/calibration.ts`**

```typescript
export interface ReliabilityBin {
  bin: number;
  mean_pred: number;
  mean_actual: number;
  count: number;
}

/** Erro quadrático médio entre prob prevista e resultado (0/1). Menor = melhor. */
export function brierScore(preds: number[], actuals: number[]): number {
  if (preds.length === 0) throw new Error("preds vazio");
  let s = 0;
  for (let i = 0; i < preds.length; i++) s += (preds[i]! - actuals[i]!) ** 2;
  return s / preds.length;
}

/** Agrupa previsões em nBins faixas [0,1] e mede prob média vs frequência real. */
export function reliabilityBins(preds: number[], actuals: number[], nBins = 10): ReliabilityBin[] {
  const buckets: [number, number][][] = Array.from({ length: nBins }, () => []);
  for (let i = 0; i < preds.length; i++) {
    const idx = Math.min(Math.floor(preds[i]! * nBins), nBins - 1);
    buckets[idx]!.push([preds[i]!, actuals[i]!]);
  }
  const out: ReliabilityBin[] = [];
  for (let i = 0; i < nBins; i++) {
    const b = buckets[i]!;
    if (b.length === 0) continue;
    out.push({
      bin: i,
      mean_pred: b.reduce((a, [p]) => a + p, 0) / b.length,
      mean_actual: b.reduce((a, [, ac]) => a + ac, 0) / b.length,
      count: b.length,
    });
  }
  return out;
}

/** Entropia cruzada média. Menor = melhor. Clipa p em [eps, 1-eps]. */
export function logLoss(preds: number[], actuals: number[], eps = 1e-15): number {
  if (preds.length === 0) throw new Error("preds vazio");
  let total = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = Math.min(Math.max(preds[i]!, eps), 1 - eps);
    const a = actuals[i]!;
    total += -(a * Math.log(p) + (1 - a) * Math.log(1 - p));
  }
  return total / preds.length;
}

/** ECE = soma ponderada por bin de |mean_pred - mean_actual|. */
export function expectedCalibrationError(preds: number[], actuals: number[], nBins = 10): number {
  if (preds.length === 0) throw new Error("preds vazio");
  const n = preds.length;
  return reliabilityBins(preds, actuals, nBins).reduce(
    (acc, b) => acc + (b.count / n) * Math.abs(b.mean_pred - b.mean_actual),
    0,
  );
}

/** 1 - Brier/Brier_base (base = prever sempre a freq média). >0 = tem skill. */
export function brierSkillScore(preds: number[], actuals: number[]): number {
  if (preds.length === 0) throw new Error("preds vazio");
  const base = actuals.reduce((a, b) => a + b, 0) / actuals.length;
  const brierBase = actuals.reduce((a, x) => a + (base - x) ** 2, 0) / actuals.length;
  if (brierBase === 0) return 0.0;
  return 1.0 - brierScore(preds, actuals) / brierBase;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd ts && npx vitest run test/calibration.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add ts/src/backtest/calibration.ts ts/test/calibration.test.ts
git commit -m "feat(ts): backtest/calibration (Brier/ECE/logloss/skill) espelhado"
```

---

## Task 11: GATE DE PARIDADE — golden files do Python + teste TS

**Objetivo:** provar que o motor TS reproduz os números do Python. Gera um conjunto amplo de entradas, computa no Python (fonte de verdade) e no TS, exige diferença < 1e-9.

**Files:**
- Create: `scripts/gen_golden_parity.py` (Python — gera as fixtures)
- Create: `ts/test/parity/golden/engine.json` (gerado)
- Create: `ts/test/parity/parity.test.ts`

- [ ] **Step 1: Escrever o gerador Python `scripts/gen_golden_parity.py`**

```python
"""Gera fixtures douradas do motor Python p/ o gate de paridade do port TS.
Saída: ts/test/parity/golden/engine.json. Roda com a .venv do projeto."""
import json, os, sys
sys.path.insert(0, "src")
from odd_analyzer.model.sot_model import prob_over_line
from odd_analyzer.model.match_model import score_matrix, probs_1x2, prob_total_over
from odd_analyzer.value.devig import fair_prob_over
from odd_analyzer.value.ev import edge_ev

count = []
for mu in [0.3, 0.8, 1.5, 2.7, 4.2, 7.1]:
    for line in [0.5, 1.5, 2.5, 3.5]:
        for r in [None, 1.5, 4.0, 12.0]:
            count.append({"mu": mu, "line": line, "r": r, "prob": prob_over_line(mu, line, r)})

match = []
for lh in [0.7, 1.1, 1.8, 2.5]:
    for la in [0.6, 1.0, 1.5]:
        m = score_matrix(lh, la)
        p = probs_1x2(m)
        match.append({
            "lh": lh, "la": la,
            "home": p["home"], "draw": p["draw"], "away": p["away"],
            "over15": prob_total_over(m, 1.5), "over25": prob_total_over(m, 2.5),
        })

value = []
for oo in [1.4, 1.8, 1.91, 2.1, 3.2]:
    for ou in [1.8, 1.91, 2.0, 2.5]:
        fp = fair_prob_over(oo, ou)
        m = edge_ev(0.55, fp, oo)
        value.append({"oo": oo, "ou": ou, "fair_over": fp, "edge": m["edge"], "ev": m["ev"]})

out = {"count": count, "match": match, "value": value}
dest = os.path.join("ts", "test", "parity", "golden", "engine.json")
os.makedirs(os.path.dirname(dest), exist_ok=True)
with open(dest, "w", encoding="utf-8") as f:
    json.dump(out, f)
print(f"golden: {len(count)} count, {len(match)} match, {len(value)} value -> {dest}")
```

- [ ] **Step 2: Gerar as fixtures**

Run: `.venv\Scripts\python.exe scripts\gen_golden_parity.py`
Expected: imprime `golden: 96 count, 12 match, 20 value -> ts\test\parity\golden\engine.json` e cria o arquivo.

- [ ] **Step 3: Escrever o teste de paridade `ts/test/parity/parity.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { probOverLine } from "../../src/model/sotModel.js";
import { scoreMatrix, probs1x2, probTotalOver } from "../../src/model/matchModel.js";
import { fairProbOver } from "../../src/value/devig.js";
import { edgeEv } from "../../src/value/ev.js";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, "golden", "engine.json"), "utf8"));
const TOL = 1e-9;

describe("GATE de paridade Python↔TS", () => {
  it("mercados de contagem (Poisson/NB2) batem em 1e-9", () => {
    for (const c of golden.count) {
      const got = probOverLine(c.mu, c.line, c.r);
      expect(Math.abs(got - c.prob)).toBeLessThan(TOL);
    }
  });

  it("modelo de partida (Dixon-Coles) bate em 1e-9", () => {
    for (const c of golden.match) {
      const m = scoreMatrix(c.lh, c.la);
      const p = probs1x2(m);
      expect(Math.abs(p.home - c.home)).toBeLessThan(TOL);
      expect(Math.abs(p.draw - c.draw)).toBeLessThan(TOL);
      expect(Math.abs(p.away - c.away)).toBeLessThan(TOL);
      expect(Math.abs(probTotalOver(m, 1.5) - c.over15)).toBeLessThan(TOL);
      expect(Math.abs(probTotalOver(m, 2.5) - c.over25)).toBeLessThan(TOL);
    }
  });

  it("de-vig + EV batem em 1e-9", () => {
    for (const c of golden.value) {
      const fair = fairProbOver(c.oo, c.ou);
      const m = edgeEv(0.55, fair, c.oo);
      expect(Math.abs(fair - c.fair_over)).toBeLessThan(TOL);
      expect(Math.abs(m.edge - c.edge)).toBeLessThan(TOL);
      expect(Math.abs(m.ev - c.ev)).toBeLessThan(TOL);
    }
  });
});
```

- [ ] **Step 4: Rodar o gate e ver passar**

Run: `cd ts && npx vitest run test/parity/parity.test.ts`
Expected: PASS (3 testes). Se algum falhar, o port divergiu — investigar a função citada antes de prosseguir (NÃO seguir com gate vermelho).

- [ ] **Step 5: Rodar a suíte TS inteira**

Run: `cd ts && npx vitest run`
Expected: PASS — todos os testes do motor + gate.

- [ ] **Step 6: Commit**

```bash
git add scripts/gen_golden_parity.py ts/test/parity/
git commit -m "test(ts): gate de paridade Python<->TS (golden files) verde"
```

---

## Task 12: Reescrever `CLAUDE.md` do backend (Node/TS)

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Reescrever a parte técnica preservando Produto + Glossário**

Mantém INTACTAS as seções "Produto — o que é e como pensa", "Glossário", "Documentação viva", "Supabase — contexto". Substitui a seção "Geral" (Python) e adiciona uma seção "Backend Node/TS" com:

```markdown
## Backend — Node/TypeScript (substitui o Python)

- Runtime Node LTS, TypeScript **strict** (ESM, NodeNext). Código em `ts/src/`, testes em `ts/test/`.
- Rodar testes: `cd ts && npm test` (Vitest). Typecheck: `npm run typecheck`.
- **Design pattern: Ports & Adapters.** O domínio (`model/`, `value/`, `candidates/`) **não importa** `express`, `supabase`, nem `fetch`. Dependências externas entram por interface (`StatsProvider`, `OddsProvider`, `Repo`, `Analista`); em teste, entram fakes (`InMemoryRepo`, `ManualOdds`, `OnlyPlayer`).
- **Funções puras no motor** — sem I/O, sem estado global. Determinístico = testável.
- **Convenção de nomes:** funções em camelCase (`probOverLine`); **chaves de dados em snake_case PT** idênticas ao legado (`prob_devig`, `prob_modelo`, `amostra_jogos`, `market_type`) — fluem p/ API/DB/IA, não podem divergir.
- **Validação de borda só com Zod** (na camada API), nunca checagem manual espalhada.
- **lib/mathx.ts** tem o `lgamma` (Lanczos) que falta no `Math` — base da NB2.
- **GATE DE PARIDADE (inegociável):** o motor TS tem que reproduzir os números do Python em 1e-9 (`ts/test/parity/`). Enquanto SOT/finalizações/desarmes não baterem, **nenhum dinheiro real**. Gols não calibra → segue selado em validação.
- Money-path: toda probabilidade passa pelas funções do `model/`/`value/`; a IA nunca calcula número.
```

- [ ] **Step 2: Verificar coerência**

Ler o `CLAUDE.md` inteiro e confirmar que Produto/Glossário/Supabase continuam, e que nenhuma referência a `pytest`/`.venv`/`src/odd_analyzer` sobrou como instrução primária (pode ficar como nota histórica da coexistência).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md do backend reescrito p/ Node/TS (preserva Produto+Glossário)"
```

---

## Self-Review (preenchido)

**Spec coverage:**
- Motor puro (model/value/candidates/calibration) → Tasks 3–10. ✓
- `lib/mathx` lgamma → Task 2. ✓
- Gate de paridade (golden files + tolerância 1e-9) → Task 11. ✓
- Teste dedicado de lgamma → Task 2. ✓
- CLAUDE.md backend → Task 12. ✓ (CLAUDE.md frontend → início do Plano 3, repo separado.)
- Ports & Adapters / convenção de nomes → documentado na Task 12; aplicado nos módulos.
- Providers/crosswalk/store/service/API → **Plano 2** (fora deste plano, por decomposição). ✓
- Front Next → **Plano 3**. ✓

**Placeholder scan:** nenhum TBD/TODO; todo passo tem código ou comando concreto.

**Type consistency:** `probOverLine(mu, line, r)`, `fairProbOver(oddOver, oddUnder)`, `edgeEv(probModelo, probDevig, oddDecimal)`, `playerMuFromGames(...)→{mu,raw_rate,shrunk,n}`, `Cortes{edge_min,ev_min,amostra_min}` consistentes entre tasks e usados no gate (Task 11) com as mesmas assinaturas. ✓

**Escopo:** plano coeso (uma camada — motor puro), entrega testável independente (suíte verde + gate). ✓
