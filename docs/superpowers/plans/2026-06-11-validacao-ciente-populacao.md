# Validação ciente de população (Fatia 0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o trinco `validated_lines` ciente de população (seleção × clube), roteado automaticamente pela liga, para não travar o clube ao apertar a seleção (anti-lock-in) — e documentar a virada pós-Copa.

**Architecture:** Um helper único `populacaoFor(leagueId)` (NATIONAL_LEAGUE_IDS → "selecao"; resto e desconhecida → "clube") vira a fonte única de verdade de população; `baselineFor` passa a usá-lo (refactor sem mudar comportamento) e `isValidated(market, linha, leagueId)` roteia por ele. `validated_lines` no `MarketSpec` vira um mapa `Partial<Record<Populacao, number[]>>`. Um badge `populacao`+`populacao_motivo` (texto, fora do money-path) entra no resultado. **Não toca `prob_modelo`/edge → paridade intacta.**

**Tech Stack:** TypeScript strict (ESM), Vitest. Arquivos: `src/model/markets.ts`, `src/candidates/rank.ts`, `src/manual/analyze.ts`, testes `test/markets.test.ts`, `test/rank.test.ts`.

**Decisão revisada vs spec:** o default de liga desconhecida é **clube** (não seleção), p/ ter UM só roteador consistente com `baselineFor` e p/ ligas de clube novas caírem em clube sem cadastro. Atualizar a spec §3/§7 no Task 6.

---

## File Structure

- `src/model/markets.ts` — tipo `Populacao`, `populacaoFor`, refactor `baselineFor`, novo `MarketSpec.validated_lines` (mapa), `isValidated(market,linha,leagueId)`, `populacaoMotivo`. **Responsabilidade:** registro de mercados + roteamento de população.
- `src/candidates/rank.ts` — `rankCandidates(approved, leagueId?)` repassa a liga ao gate. **Responsabilidade:** ordenação + estrela.
- `src/manual/analyze.ts` — passa `leagueId` ao rank; injeta `populacao`/`populacao_motivo` no resultado. **Responsabilidade:** orquestração da análise manual.
- Docs: `docs/pos-copa-ligas-nacionais.md` (novo), `ROADMAP.md`, `PITCH.md`, `CLAUDE.md`, `docs/proximos-passos/` (N4 descartado + mapa das fatias).

---

## Task 1: Tipo `Populacao` + `populacaoFor` + refactor `baselineFor`

**Files:**
- Modify: `src/model/markets.ts` (NATIONAL_LEAGUE_IDS ~107, baselineFor ~110)
- Test: `test/markets.test.ts`

- [ ] **Step 1: Escrever os testes que falham** (adicionar ao `describe("markets")` em `test/markets.test.ts`):

```ts
import { MARKETS, baselineFor, populacaoFor } from "../src/model/markets.js";

it("populacaoFor: liga de seleção (27) → selecao; clube (9) e desconhecida (null) → clube", () => {
  expect(populacaoFor(27)).toBe("selecao");
  expect(populacaoFor(31)).toBe("selecao");
  expect(populacaoFor(9)).toBe("clube");
  expect(populacaoFor(null)).toBe("clube");
  expect(populacaoFor("27")).toBe("selecao");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/markets.test.ts -t populacaoFor`
Expected: FAIL — `populacaoFor is not a function`.

- [ ] **Step 3: Implementar** em `src/model/markets.ts`. Adicionar o tipo no topo (perto do `MarketSpec`) e a função junto do `NATIONAL_LEAGUE_IDS`; refatorar `baselineFor`:

```ts
export type Populacao = "selecao" | "clube";

/** População do jogo pela liga: NATIONAL_LEAGUE_IDS → seleção; o resto (e liga
 * desconhecida/inválida) → clube. Fonte ÚNICA de verdade de população — usada por
 * baselineFor (concessão) e isValidated (gate de estrela). Ligas de clube novas
 * caem em "clube" sem precisar cadastro (serve o pós-Copa). */
export function populacaoFor(leagueId: unknown): Populacao {
  const lid = typeof leagueId === "number" ? leagueId : parseInt(String(leagueId), 10);
  if (Number.isNaN(lid)) return "clube";
  return NATIONAL_LEAGUE_IDS.has(lid) ? "selecao" : "clube";
}
```

E trocar o corpo de `baselineFor` por:

```ts
export function baselineFor(market: MarketSpec, leagueId: unknown): number {
  return populacaoFor(leagueId) === "selecao"
    ? (market.concede_baseline_nacional || market.concede_baseline)
    : market.concede_baseline;
}
```

- [ ] **Step 4: Rodar e ver passar** (incl. os testes antigos de `baselineFor`, que não podem quebrar)

Run: `npx vitest run test/markets.test.ts`
Expected: PASS (populacaoFor + baselineFor 27→4.28, 9→4.55, null→4.55).

- [ ] **Step 5: Commit**

```bash
git add src/model/markets.ts test/markets.test.ts
git commit -m "refactor(markets): populacaoFor como fonte unica de populacao; baselineFor usa ele"
```

---

## Task 2: `validated_lines` por população + `isValidated(market, linha, leagueId)`

**Files:**
- Modify: `src/model/markets.ts` (MarketSpec ~27-31, spec() ~33-36, isValidated ~41-46, specs sot/finalizacoes/desarmes)
- Test: `test/markets.test.ts`

- [ ] **Step 1: Escrever os testes que falham**:

```ts
import { isValidated } from "../src/model/markets.js";

describe("isValidated — por população", () => {
  it("seleção (27): finalizações todas; SOT só 0.5; desarme 0.5/1.5", () => {
    expect(isValidated("finalizacoes", 2.5, 27)).toBe(true);
    expect(isValidated("sot", 0.5, 27)).toBe(true);
    expect(isValidated("sot", 1.5, 27)).toBe(false);
    expect(isValidated("sot", 2.5, 27)).toBe(false);
    expect(isValidated("desarmes", 1.5, 27)).toBe(true);
    expect(isValidated("desarmes", 2.5, 27)).toBe(false);
  });
  it("clube (9): SOT e finalizações todas; desarme NÃO validado (aguarda Fatia 1)", () => {
    expect(isValidated("sot", 1.5, 9)).toBe(true);
    expect(isValidated("sot", 2.5, 9)).toBe(true);
    expect(isValidated("finalizacoes", 2.5, 9)).toBe(true);
    expect(isValidated("desarmes", 0.5, 9)).toBe(false);
    expect(isValidated("desarmes", 1.5, 9)).toBe(false);
  });
  it("liga desconhecida → clube", () => {
    expect(isValidated("sot", 1.5, null)).toBe(true);
    expect(isValidated("desarmes", 0.5, null)).toBe(false);
  });
  it("gols/vitória/escanteios: nunca validados", () => {
    expect(isValidated("gols", 2.5, 9)).toBe(false);
    expect(isValidated("escanteios", 9.5, 27)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/markets.test.ts -t "por população"`
Expected: FAIL (assinatura antiga ignora leagueId; sot 1.5 global = true etc).

- [ ] **Step 3: Implementar** em `src/model/markets.ts`:

(a) No `MarketSpec`, **remover** `validated: boolean;` e trocar `validated_lines?: number[];` por:

```ts
  // Linhas validadas POR POPULAÇÃO (gate da estrela). Roteado por populacaoFor(leagueId).
  //   chave ausente  → NÃO validado nessa população.
  //   []             → validado em TODAS as linhas.
  //   [a, b]         → validado só nessas linhas.
  validated_lines?: Partial<Record<Populacao, number[]>>;
```

(b) No helper `spec(...)`, **remover** o default `validated: false`:

```ts
function spec(p: Omit<MarketSpec, "concede_baseline" | "concede_baseline_nacional"> &
  { concede_baseline?: number; concede_baseline_nacional?: number }): MarketSpec {
  return { concede_baseline: 0.0, concede_baseline_nacional: 0.0, ...p };
}
```

(c) Reescrever `isValidated`:

```ts
/** Mercado/linha validado p/ a POPULAÇÃO do jogo (pela liga) → pode ganhar estrela.
 * Default de liga desconhecida = clube (ver populacaoFor). */
export function isValidated(marketType: string, linha?: number, leagueId?: unknown): boolean {
  const m = MARKETS[marketType];
  if (!m) return false;
  const lines = m.validated_lines?.[populacaoFor(leagueId)];
  if (lines === undefined) return false;
  if (lines.length === 0) return true;
  return linha != null && lines.includes(linha);
}
```

(d) Nos 3 specs de jogador, trocar os campos `validated`/`validated_lines` antigos por:

```ts
  // sot:
    validated_lines: { selecao: [0.5], clube: [] },
  // finalizacoes:
    validated_lines: { selecao: [], clube: [] },
  // desarmes (clube ausente = não validado até Fatia 1):
    validated_lines: { selecao: [0.5, 1.5] },
```

(remover `validated: true` e `validated_lines: [...]` antigos desses 3; escanteios/gols/vitoria não têm o campo).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/markets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/model/markets.ts test/markets.test.ts
git commit -m "feat(markets): validated_lines por populacao; isValidated roteia pela liga"
```

---

## Task 3: `rankCandidates` recebe `leagueId` + wiring no analyze

**Files:**
- Modify: `src/candidates/rank.ts` (prontoParaApostar ~23-29, rankCandidates ~36-56)
- Modify: `src/manual/analyze.ts:79`
- Test: `test/rank.test.ts`

- [ ] **Step 1: Atualizar/escrever os testes** em `test/rank.test.ts`.

(a) Trocar o teste `"sot: recomenda na linha validada (0.5) e NÃO nas de atenção (1.5/2.5)"` por uma versão ciente de população:

```ts
it("sot por população: seleção só 0.5; clube libera 1.5/2.5", () => {
  // seleção (liga 27): só 0.5 ganha estrela
  const s05 = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "sot", linha: 0.5 }], 27);
  expect(s05[0]!.pronto_para_apostar).toBe(true);
  for (const linha of [1.5, 2.5]) {
    const r = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "sot", linha }], 27);
    expect(r[0]!.pronto_para_apostar).toBe(false);
  }
  // clube (liga 9): 1.5 ganha estrela (anti-lock-in)
  const c15 = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "sot", linha: 1.5 }], 9);
  expect(c15[0]!.pronto_para_apostar).toBe(true);
  expect(c15[0]!.recomendado).toBe(true);
});
```

(b) O teste do desarme passa a exigir liga de seleção (desarme só valida em seleção agora):

```ts
it("desarme (seleção): recomenda 1.5 e NÃO 2.5", () => {
  const r15 = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "desarmes", linha: 1.5 }], 27);
  expect(r15[0]!.pronto_para_apostar).toBe(true);
  expect(r15[0]!.recomendado).toBe(true);
  const r25 = rankCandidates([{ prob_modelo: 0.7, ev: 0.4, titularidade: "confirmado", market_type: "desarmes", linha: 2.5 }], 27);
  expect(r25[0]!.pronto_para_apostar).toBe(false);
});
```

(c) Substituir o teste antigo `"desarme: recomenda nas linhas validadas (1.5)..."` pelo (b). Os demais testes (`finalizacoes`/`gols`/alerta/pré-lineup) seguem válidos sem leagueId (default clube): finalizações valida, gols não, alerta barra.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/rank.test.ts`
Expected: FAIL — `rankCandidates` ainda não aceita 2º arg (TS) / sot 1.5 seleção ainda true.

- [ ] **Step 3: Implementar** em `src/candidates/rank.ts`:

```ts
function prontoParaApostar(c: Record<string, unknown>, leagueId?: unknown): boolean {
  return (
    c["titularidade"] === "confirmado" &&
    c["alerta_minutos"] !== true &&
    isValidated(String(c["market_type"] ?? ""), c["linha"] as number | undefined, leagueId)
  );
}

export function rankCandidates(
  approved: Record<string, unknown>[],
  leagueId?: unknown,
): Record<string, unknown>[] {
  const withRisk = approved.map((c) => ({
    ...c,
    risco: classifyRisk((c["prob_modelo"] as number) ?? 0),
  }));
  withRisk.sort((a, b) => {
    const d = ORDEM[a.risco as Risco] - ORDEM[b.risco as Risco];
    if (d !== 0) return d;
    return ((b as Record<string, unknown>)["ev"] as number ?? -Infinity) -
           ((a as Record<string, unknown>)["ev"] as number ?? -Infinity);
  });
  const starIdx = withRisk.findIndex((c) => prontoParaApostar(c as Record<string, unknown>, leagueId));
  return withRisk.map((c, i) => ({
    ...c,
    pronto_para_apostar: prontoParaApostar(c as Record<string, unknown>, leagueId),
    recomendado: starIdx !== -1 && i === starIdx,
  }));
}
```

E em `src/manual/analyze.ts:79`, trocar:

```ts
  const ranked = rankCandidates(approved, leagueId);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run test/rank.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/candidates/rank.ts src/manual/analyze.ts test/rank.test.ts
git commit -m "feat(rank): rankCandidates roteia validacao pela liga do jogo"
```

---

## Task 4: Badge `populacao` + `populacao_motivo` no resultado

**Files:**
- Modify: `src/model/markets.ts` (novo `populacaoMotivo`)
- Modify: `src/manual/analyze.ts` (result ~91-99)
- Test: `test/markets.test.ts`

- [ ] **Step 1: Teste que falha** (em `test/markets.test.ts`):

```ts
import { populacaoMotivo } from "../src/model/markets.js";

it("populacaoMotivo: texto leigo por população", () => {
  expect(populacaoMotivo("selecao")).toMatch(/sele[çc]ão/i);
  expect(populacaoMotivo("selecao")).toMatch(/0\.5|1\+/);
  expect(populacaoMotivo("clube")).toMatch(/clube/i);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run test/markets.test.ts -t populacaoMotivo`
Expected: FAIL — `populacaoMotivo is not a function`.

- [ ] **Step 3: Implementar** `populacaoMotivo` em `src/model/markets.ts`:

```ts
/** Texto leigo (fora do money-path) explicando o gate de estrela da população. */
export function populacaoMotivo(pop: Populacao): string {
  return pop === "selecao"
    ? "Jogo de seleção: chutes a gol só viram aposta de valor na linha de 1+ (over 0.5) — linhas altas seguem analisadas, sem estrela. Finalizações (todas as linhas) e desarmes (1+/2+) valem."
    : "Jogo de clube: chutes a gol e finalizações viram aposta de valor em todas as linhas; desarme aguarda calibração de clube (ainda sem estrela).";
}
```

E em `src/manual/analyze.ts`, importar `populacaoFor, populacaoMotivo` de `../model/markets.js` (junto do `baselineFor` já importado em `playerCandidates`) e injetar no `result`:

```ts
  const populacao = populacaoFor(leagueId);
  const result = {
    jogo: event.jogo,
    populacao,
    populacao_motivo: populacaoMotivo(populacao),
    pendente_lineup,
    candidatos: revisados,
    reprovados: opts.diagnostics ? rejected : [],
    jogadores_sem_match: semMatchUnico,
    linhas_rejeitadas: input.linhas_rejeitadas,
    ia,
  };
```

(Verificar o import no topo de `analyze.ts`: a linha 1 importa `MARKETS, baselineFor, type MarketSpec`; adicionar `populacaoFor, populacaoMotivo`.)

- [ ] **Step 4: Rodar e ver passar** (suíte inteira p/ pegar regressão de analyze)

Run: `npm test`
Expected: PASS (≥ 273 + novos).

- [ ] **Step 5: Commit**

```bash
git add src/model/markets.ts src/manual/analyze.ts test/markets.test.ts
git commit -m "feat(analyze): badge populacao + populacao_motivo no resultado (texto, fora do numero)"
```

---

## Task 5: Verificação global — paridade + typecheck

- [ ] **Step 1:** `npm run typecheck` → Expected: limpo (a assinatura nova de `isValidated`/`rankCandidates` força todos os call sites; se algum faltar leagueId, o TS aceita por ser opcional — buscar usos remanescentes manualmente).
- [ ] **Step 2:** `npx vitest run test/parity` → Expected: golden EPL intactas (não tocamos o número).
- [ ] **Step 3:** `npm test` → Expected: tudo verde.
- [ ] **Step 4: Commit** (se algo ajustado): `git commit -am "test: verificacao global Fatia 0 (paridade intacta)"`.

---

## Task 6: Docs — virada pós-Copa + N4 descartado + mapa das fatias + docs vivas

**Files:** `docs/pos-copa-ligas-nacionais.md` (novo), `docs/ROADMAP.md`, `docs/PITCH.md`, `CLAUDE.md`, `docs/proximos-passos/README.md`, `docs/proximos-passos/tiers/tier-1-precisao-segura/N4-odds-bsd-mercado-partida.md`, `docs/proximos-passos/SESSION-MAP.md` (novo), `docs/superpowers/specs/2026-06-11-validacao-ciente-populacao-design.md` (corrigir default).

- [ ] **Step 1:** Criar `docs/pos-copa-ligas-nacionais.md` com: objetivo (operar em clube pós-Copa, sem seleção), o que muda automático (liga de clube → `populacaoFor`="clube" → SOT 1.5/2.5 re-abrem sozinhos), e o **checklist do pivô** (confirmar liga fora de NATIONAL_LEAGUE_IDS; re-confirmar calibração de clube; medir `desarmes.clube`; acumular forward de clube). Mapa de re-validação por mercado.
- [ ] **Step 2:** ROADMAP — nova seção "Virada pós-Copa (norte permanente)" linkando o doc; atualizar o trinco p/ "por população"; contagem de testes.
- [ ] **Step 3:** PITCH — parágrafo leigo: "depois da Copa, o mesmo produto serve as ligas de clube; chutes a gol 2+/3+ voltam a valer sozinhos lá, porque clube é outra população".
- [ ] **Step 4:** CLAUDE.md — atualizar a nota do trinco p/ "validated_lines por população (seleção × clube), roteado por populacaoFor".
- [ ] **Step 5:** N4 — banner **DESCARTADO (decisão do dono 2026-06-11)** no topo da ficha + no proximos-passos/README (não apagar histórico).
- [ ] **Step 6:** Criar `docs/proximos-passos/SESSION-MAP.md` mapeando **Fatias 1–6** (1=calibrar clube · 2=I3 novos mercados · 3=N2 · 4=N5 · 5=I6 · 6=arbitro_tendencia) — cada uma com: objetivo, dependência, onde mexe, critério de validação, status "PENDENTE (session futura)". I2/I4/nota_confronto marcados BLOQUEADOS POR DADO.
- [ ] **Step 7:** Corrigir a spec (§3/§7): default de liga desconhecida = **clube** (não seleção), com a justificativa do roteador único.
- [ ] **Step 8: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs: virada pos-Copa explicita + mapa das fatias 1-6 + N4 descartado"
```

---

## Self-Review (preenchido)

- **Spec coverage:** §3 roteamento → Task 1+2. §4 valores → Task 2 step 3d. §5 badge → Task 4. §6 migração call sites → Task 2/3. §7 virada pós-Copa → Task 6. §8 N4 → Task 6. §9 validação → Task 5. §12 checklist → coberto. ✔
- **Placeholders:** nenhum — todo step tem código real. ✔
- **Type consistency:** `populacaoFor`/`isValidated(market,linha,leagueId)`/`rankCandidates(approved,leagueId)`/`populacaoMotivo(pop)` usados igual em todos os tasks. `validated_lines` é `Partial<Record<Populacao,number[]>>` em todos. ✔
- **Desvio da spec:** default desconhecida = clube (não seleção) — Task 6 step 7 corrige a spec. ✔
