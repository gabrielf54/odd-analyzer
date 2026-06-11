# Mercado de PASSES — Design

> Spec de brainstorming. Vira plano via `superpowers:writing-plans`. Estado vivo final
> sobe pro [`docs/CORE.md`](../../CORE.md) ao shipar; esta pasta é histórico (git).

**Objetivo:** adicionar o mercado **passes de jogador** (Betano cota, ex.: Coréia×Tcheca
11/06) como **aposta de valor** — `prob_modelo(X≥linha) > prob_justa_de-vig` — validado na
população de seleção, com **de-vig de escada one-sided** pra extrair o máximo de valor.

**Doutrina (inegociável):** o número vem do código; a IA explica/julga, não calcula. Só
mercado/linha **validado na população do jogo** ganha ⭐. Calibração-primeiro: se passes não
calibrar (BrierSkill>0), NÃO vira aposta — vira diagnóstico catalogado (igual defesas).

---

## 0. Contexto & decisões já travadas

- **Cobertura confirmada:** Betano cota "Passes" por jogador, **escada de 7 degraus** `X+`
  (só over, sem under). Ex. Min-jae Kim: 85+ @1.67 … 115+ @3.10.
- **Settlement = `total_pass` (TENTADOS), via Opta.** Pesquisado: Betano liquida "Total de
  Passes" pela Opta; def. Opta de passe = "attempted delivery… includes open play, goal kicks,
  corners, free kicks played as pass; **excludes crosses, keeper throws, throw-ins**". Logo
  `settle_field = total_pass` (não `accurate_pass`).
  - ⚠️ **Verificação de settlement (Fase 1):** confirmar que o `total_pass` do BSD **exclui
    cruzamento** igual à Opta (BSD tem `total_cross` separado). Se incluir, há viés sistemático
    em alas/pontas — mesma lição `won_tackle`. Documentar; se divergir, decompor/ajustar.
- **De-vig = ESCADA** (decisão do dono: máximo valor). A odd one-sided crua é inflada pela
  margem → comparar com ela subestima edge. Os 7 degraus reconstroem a curva e tiram a margem.
- **μ:** base **forma × minutos** (sólida, calibrável); **posse como tempero gated** (liga no
  número só se a calibração provar; senão, só texto pra IA).
- **Distribuição:** **NB2 mantido** (contagem alta ⇒ NB2≈Normal); `nb_dispersion`/priors
  **re-medidos** dos dados de passe.
- **População:** seleção (Copa = liga 27; calib offline em ligas 31/58–67, que existem).

## 1. Arquitetura (Ports & Adapters intacto)

Domínio puro (`model/`) não importa I/O. Peças:

| Unidade | Arquivo | Responsabilidade |
|---|---|---|
| Spec do mercado | `src/model/markets.ts` | entrada `passes` em `MARKETS`; novo campo `opp_mode` |
| Neutralizar oppMult | `src/providers/stats.ts` (`entityRate`) | `opp_mode:"none"` ⇒ `oppMult=1.0` |
| Fator de posse (puro) | `src/model/adjustments.ts` | `possessionMultiplier(posse, market)` — gated |
| Posse esperada (adapter) | `src/providers/stats.ts` | derivar do `ball_possession` histórico dos 2 times |
| **De-vig de escada** | `src/value/ladderDevig.ts` (NOVO) | 7 degraus `(linha,odd)` → `P_fair(X≥linha)` |
| Wiring manual | `src/manual/analyze.ts` | agrupar degraus por jogador → de-vig → candidatos |
| Calibração | `scripts/recalibrate-passes.mts` (NOVO) | baseline + leave-one-out na seleção |

**Schema da borda já aceita passes** — `MARKET_TYPES`/`PLAYER_MARKETS` derivam de `MARKETS`
(fix da borda 2026-06-11). Adicionar a `key` em `MARKETS` basta; nada a re-listar no schema.

## 2. O número (μ) — detalhe

`μ = (passes/90 ponderado por minutos, encolhido) × minutos_esperados × oppMult × haMult × [possMult?]`

- **Base:** `playerMuFromGames(games, "total_pass", prior_rate, prior_strength, oppMult, haMult,
  minutos)` — reuso **intacto**. `minutos = expectedMinutes(games)` (já existe; driver #1 de passe).
- **`prior_strength` BAIXO** (≈3–5, medir): passe é alto-volume/estável → confiar na taxa do
  próprio jogador; `prior_strength=12` global arrastaria zagueiro (~70) pra mediana (~50) =
  viés por posição. **Medido na Fase 1.**
- **`prior_rate`** = mediana de `total_pass`/90 da população de seleção. **Medido na Fase 1.**
- **`nb_dispersion`** = ajustado de var/média de `total_pass` (contagem alta ⇒ r grande/levemente
  superdisperso). **Medido na Fase 1** (varredura como nos outros mercados).
- **oppMult NEUTRALIZADO:** novo `opp_mode: "none" | "concession"` em `MarketSpec` (default
  `"concession"` = comportamento atual). `passes` usa `"none"` ⇒ `entityRate` põe `oppMult=1.0`,
  pulando `teamConceded`. Motivo: pra passe o eixo de concessão tem **sinal invertido** (somaria
  posse do rival).
- **haMult:** mantido (efeito pequeno, já calibrado, barato).
- **`possMult` (gated):** `possessionMultiplier(posseEsperadaNosso, "passes") =
  clamp(1 + K_PASS·(posse − 0.50), 0.85, 1.20)`, sinal correto (mais posse nossa → mais passe).
  - `posseEsperadaNosso` = `clamp(média ball_possession do nosso time nos últimos N jogos /100,
    0.30, 0.70)`; sem dado → `0.50` (⇒ mult 1.0, **fail-closed**).
  - **Gate:** `K_PASS` calibrado por leave-one-out; aplica no μ **só se** ECE↓ e BrierSkill↑ vs
    base. Senão `K_PASS=0` (off no número). **Sempre** emite `posse_esperada` como texto p/ IA.

## 3. De-vig de escada — `src/value/ladderDevig.ts` (NOVO, money-path)

Entrada: degraus de UM jogador `{linha:L_k, odd:o_k}`, k=1..K (K≈7), L crescente.
`q_k = 1/o_k` = `P_book(X≥L_k)` inflada pela margem.

**Método (paramétrico, robusto em contagem alta):**
1. Modela o implícito do book como **Normal**: `q_k ≈ c · S((L_k−m)/s)`, `S=1−Φ` (sobrevivência
   normal), `c≥1` = fator de over-round (margem média do lado over, ~constante na escada).
2. Ajusta `(m, s, c)` por **mínimos quadrados** em `Σ_k (q_k − c·S((L_k−m)/s))²` (3 params,
   7 pontos → estável/sobre-determinado).
3. **Curva justa:** `S_fair(L) = S((L−m)/s)` (descarta `c` = a margem).
4. Pra a linha L* (cada degrau): `prob_devig = S_fair(L*)`; o de-vig devolve isso por degrau.

**Fail-safe:** K<3, odds não-monótonas, ou ajuste sem convergir → **fallback `sem_devig`**
(usa `q_k` cru como conservador, marca `sem_devig=true`). Nunca quebra; degrada honesto.

**Saída:** `{ linha, prob_devig, sem_devig, m, s, c }` por degrau → alimenta `buildCandidate`
(que já aceita `prob_devig`/`sem_devig`). Edge/EV seguem o caminho normal.

> v1 assume margem multiplicativa ~constante no over. CLV-forward dirá se precisa refinar
> (additiva / por-degrau). Documentado, não escondido.

## 4. Wiring manual (`src/manual/analyze.ts`)

Hoje `playerCandidates` casa **1 odd por jogador** (mercados de linha única). Passe vem em
**escada** (7 degraus/jogador). Mudança localizada:

- `groupByMarket` já separa `passes`. Dentro de `playerCandidates` (ou ramo dedicado), **agrupar
  os degraus por jogador casado**, rodar `ladderDevig` uma vez por jogador, e emitir **um
  candidato por degrau** (linha+odd+prob_devig), todos com o mesmo `μ`/forma do jogador.
- `prob_modelo(X≥L_k) = probOverLine(μ, L_k − 0.5, nb_dispersion)` (degrau `85+` ⇒ X≥85 ⇒
  `probOverLine` com linha 84.5). Confirmar a convenção `X+` ⇒ `≥X` no casamento.
- Resto (`evaluateCandidates`, `rankCandidates`, IA) **genérico** — não muda. `posse_esperada`
  entra no contexto da IA.
- `matchPlayerOdds`: casa por nome (já existe). Cada degrau do mesmo jogador casa o mesmo id.

**Contrato no fio (snake_case PT) inalterado:** candidato sai com `prob_modelo`, `prob_devig`,
`edge`, `ev`, `market_type:"passes"`, `linha`, `amostra_jogos`, `incerteza`, `sem_devig`,
`trace`, `stats_detalhadas`. Front/IA já espelham — mercado novo aparece sozinho.

## 5. Calibração & graduação (Fase 1 — GATE, roda PRIMEIRO)

`scripts/recalibrate-passes.mts` (molde: `recalibrate-faltas-defesas.mts` +
`backtest-tilt.mts`, leave-one-out anti-espiada: prediz jogo N com jogos < N):
1. Medir `prior_rate`, `prior_strength`, `nb_dispersion` na população de seleção (ligas 31/58–67).
2. Leave-one-out: para cada (jogador, jogo), `prob_modelo(X≥k)` vs realizado `(total_pass≥k?1:0)`
   em **vários thresholds** representativos (perto da mediana do jogador ± degraus), **pooled**.
   Métricas: **Brier, ECE, BrierSkill** por faixa de linha.
3. **Sub-teste posse:** comparar base (sem posse) vs base×`possMult` varrendo `K_PASS` — ligar só
   se ECE↓ e BrierSkill↑.
4. **Verificar settlement** (§0): checagem de que `total_pass` BSD ≈ def. Opta (excl. cruzamento).

**Critério de graduação (= bar do faltas):** `BrierSkill>0` e `ECE` comparável aos mercados que
prestam ⇒ `validated_lines.selecao` recebe as linhas que passam (`[]` se calibra na faixa toda,
como finalizações; faixa restrita se só perto da mediana). **Se reprovar** (igual defesas):
passes fica **analisado, sem ⭐** → cataloga em `mercados-nao-validados/` com o porquê, e o
money-path do de-vig **só serve de diagnóstico** (ainda construído, mas sem estrela). O dono é
avisado do veredito.

**Forward (pós-build):** loop I7 (`paper_ledger`) acumula passes na Copa; `settle` por `total_pass`;
`report` Brier/ECE/CLV por `market_type`. É o que confirma ao vivo.

## 6. Testes & paridade

- **Gate de paridade 1e-9 INTACTO:** passes não toca os μ dos mercados existentes; golden de
  `test/parity/` inalteradas. `probOverLine` é genérico (testado com μ hardcoded) — linha alta
  (84.5) só exercita o mesmo código.
- **`ladderDevig`:** teste com **exemplo sintético** — gerar degraus de uma Normal conhecida +
  margem `c` conhecida; o ajuste recupera `m,s` e remove `c` dentro de tolerância. Testar
  fail-safe (K<3 → `sem_devig`; odds não-monótonas → fallback).
- **`possessionMultiplier`:** puro; testar sinal (posse>0.5 ⇒ >1), clamps, fail-closed (0.5 ⇒ 1.0).
- **`opp_mode:"none"`:** teste que `entityRate` de passes não chama `teamConceded` e usa `oppMult=1.0`.
- **Borda:** `parseManualOdds` aceita `passes` (regressão; já deve passar pelo fix de borda).
- **Wiring:** teste de `analyzeManual` com escada de passes fake (OnlyPlayer/ManualOdds) → emite
  1 candidato por degrau com `prob_devig` do `ladderDevig`.
- `npm test` verde; `npm run typecheck` limpo.

## 7. Riscos & armadilhas

- **Settlement total vs Opta-cross:** o maior risco silencioso (§0). Verificar na Fase 1.
- **Posse posse-confundida / dupla contagem:** mitigado por `opp_mode:"none"` (oppMult fora) +
  gate de calibração no `possMult`. Não empilha dois sinais de posse.
- **Sensibilidade a minutos:** passe despenca com substituição. `minutos_esperados` trata o
  esperado; risco de jogo (sub cedo) fica no `incerteza`/texto. (Betano tem "Substituição
  Segura" — reduz risco pro apostador, não é nossa conta.)
- **Margem de escada mal-modelada:** v1 multiplicativa; CLV-forward valida/refina.
- **Reprovar calibração:** possível (contagem alta, NB2 pode não pegar). Tratado: vira diagnóstico,
  não some o trabalho — o de-vig fica pronto pra quando regradar forward.

## 8. Escopo (YAGNI)

**Dentro:** spec passes, `opp_mode`, `possessionMultiplier` (gated), `ladderDevig`, wiring manual,
calibração+graduação, testes, docs (CORE §3.1 + remover passes da lista do I3; NÃO apagar a pasta
I3, que ainda lista dribles/cruzamentos/etc.).
**Fora:** outros mercados do I3 (dribles/cruzamentos/aéreos/intercept); refino da margem da escada
além do v1; fator de posse para sot/finalizações (só passes aqui); front (já espelha o contrato).
