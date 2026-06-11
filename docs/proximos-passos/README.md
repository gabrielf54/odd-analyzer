# Próximos passos — melhorias de qualidade das indicações (Copa 2026)

> **Para que serve este diretório:** retomar, numa nova sessão, o trabalho de melhorar a
> qualidade das recomendações de aposta. Cada melhoria tem uma **ficha** própria, detalhada
> o suficiente para outra sessão **validar e aplicar** sem re-investigar. Leia este README
> primeiro (contexto + princípios + mapa do código), depois abra o tier que vai atacar.

**Criado em:** 2026-06-11 (dia de abertura da Copa). **Autor da investigação:** sessão de análise de produto/engenharia.
**Base factual:** sondagem real da BSD + Supabase + leitura do código (não suposição).

---

## 0. Contexto e meta

**Meta do dono:** "melhorar ao máximo as análises e ter as melhores indicações de aposta" para os
jogos da Copa do Mundo 2026, que **começa hoje (2026-06-11)**, com **dinheiro real a partir de hoje**.

**O que o produto faz (1 frase):** para um jogo, compara a **probabilidade do nosso modelo**
(calculada em código) com a **odd da casa sem a margem** (de-vig) e **só sinaliza quando o modelo
está claramente à frente** (EV/edge positivo). A IA explica em linguagem leiga — **nunca inventa o número**.

---

## 1. Veredito: a análise funciona na Copa? (com evidência)

**Resumo:** o **motor roda** na Copa, mas com **dois buracos** que atacam direto a qualidade das
indicações. A desconfiança do dono ("você se baseou no Brasileirão, vai funcionar na Copa?")
está correta — e é mais profunda do que parecia.

### 1.1 Correções de premissa (provadas na sondagem)
- **Não era Brasileirão.** Os priors/dispersão do modelo foram **"Calibrados no backtest EPL 2023"**
  (`src/model/params.ts:1`) — clubes ingleses.
- **Os jogos 9099/206719 eram AMISTOSOS** (liga 31: England×Costa Rica, Portugal×Nigéria, 10/06),
  **não** a Copa.

### 1.2 O que a sondagem provou (números reais)
| Pergunta | Achado |
|---|---|
| Copa existe e começa hoje? | ✅ **Liga 27, season_id 188**, 104 jogos. Hoje: **México × África do Sul (event 8287, 19:00 UTC, Grupo A)**, times reais. `/events/{id}/lineups/` já responde cheio (`lineup_status`, `beta`, `unavailable_players`). Mata-mata ainda é placeholder (W101×W102). |
| Seleção tem o dado rico? | ⚠️ **Parcial.** Amistoso 9099: 46 jogadores com **40 campos** (cross, won_tackle, dribles, duelos, interceptação, key_pass…) + `average_positions` + `shotmap`. **MAS `expected_goals`/`expected_assists` = NULL** (jogador *e* time). **xG não serve para seleção.** |
| Dá para calibrar nas Copas passadas? | ❌ **Não.** Seasons 189 (2022) e 382 (2018) têm 48+48 jogos `finished`, mas `/player-stats/` e `/stats/` vêm **VAZIOS** (sem player-stats, sem shotmap). Sem Brier/ECE/leave-one-out na população Copa. |
| De onde vem a "forma" do jogador? | `/players/{id}/stats/` traz todos os jogos, **sem `league_id` no payload**, majoritariamente **CLUBE** (Rice: **47 Arsenal + 3 England** = 94% clube). O μ é **forma-de-clube × concessão-de-seleção** (mistura de populações). |
| Odds automáticas da BSD? | Só **mercado de partida** (1x2, over/under gols, BTTS — com os 2 lados → de-vig real possível). **ZERO player prop.** Desarmes/sot/finalizações/escanteios = odds **manuais coladas, tipicamente só over** → de-vig inerte (`sem_devig=true` confirmado no Rice). |

### 1.3 O risco central (em linguagem do dono)
A **calibração** é o detector de mentira do modelo — a prova de que, quando ele diz "73%", acontece
~73% das vezes. Hoje essa prova foi feita com **clubes da Premier League**. A Copa é outra população
(seleção joga pouco, ritmo de torneio, jogos muito desiguais), e **não dá para refazer a prova no
passado da Copa** (a BSD não guardou os detalhes de 2018/2022).

**Conclusão dura:** a única forma de saber se as indicações acertam nas seleções é **medir ao vivo,
daqui para frente, na própria Copa** (prova forward / CLV). Isso transforma o **loop de validação**
(`paper_ledger`) de "importante" em **pré-requisito #1** — antes de arriscar dinheiro hoje. Sem ele,
você aposta um número calibrado noutra população **sem medir** se ele mente.

---

## 2. Princípios inegociáveis (toda ficha respeita)

Copiados do `CLAUDE.md` — qualquer melhoria que os viole está errada:
1. **Valor = `prob_modelo > prob_devig`** (EV/edge positivo). **NUNCA** filtrar por "probabilidade
   alta" (selecionar favoritos = −EV sistemático, **proibido**).
2. **A IA explica e julga; NÃO inventa nem calcula número.** O número vem do código.
3. **Validação-primeiro:** calibração offline (Brier/ECE/leave-one-out) → CLV → só então dinheiro
   real. Ideia que não dá para validar **não entra no money-path**.
4. **GATE DE PARIDADE 1e-9** (`test/parity/`): mudança no money-path não pode quebrar as golden
   files sem re-congelar de propósito. **Não quebrar os testes Vitest** (`npm test`).
5. **Ports & Adapters:** o domínio (`model/`, `value/`, `candidates/`) **não importa** express/
   supabase/fetch. Dependências externas entram por interface; em teste, por fakes.
6. **Nomes:** identificadores de código em **inglês**; chaves de dados no fio em **snake_case PT**
   (`prob_modelo`, `prob_devig`, `market_type`, `candidatos`, `reprovados`, `motivos`…).
7. **Custo ~$20:** não pagar fonte cara. O dado BSD já assinado é o que temos. Diga o custo de
   qualquer ideia que dependa de dado novo.

---

## 3. Mapa do código (money-path) — referência central

Toda probabilidade passa por aqui. **A IA nunca calcula número.**

```
ENTRADA
  manual (usado na Copa): src/manual/analyze.ts:39  analyzeManual()
                          src/manual/analyze.ts:101 playerCandidates()
  pipeline (por mercado): src/pipeline.ts:20 analyzeMatch() → runCount:66 → playerCount:133 / matchCount:88 / runMatch:105

MONEY-PATH (motor, funções puras)
  per90 (janela 3/5/10, ponderado por minutos): src/model/assemble.ts  windowedRate / playerMuFromGames / expectedMinutes
  shrinkage (encolhimento bayesiano):            src/model/shrinkage.ts shrinkRate
  ajustes de matchup:                            src/model/adjustments.ts opponentMultiplier / homeAwayMultiplier / positionalTilt
  NB2 P(X≥linha) (contagem):                     src/model/sotModel.ts  probOverLine / nbinomPmf
  modelo de partida (gols→1x2/totais):           src/model/matchModel.ts scoreMatrix / probs1x2 / probTotalOver
  de-vig (tirar margem):                         src/value/devig.ts impliedProb / fairProbOver / devigMultiplicative / devigPower
  edge & EV:                                     src/value/ev.ts edgeEv
  monta o dossiê do candidato (sem_devig em :34):src/candidates/builder.ts buildCandidate
  cortes (edge≥0.04, ev≥0.05, amostra≥10, titular):src/candidates/filter.ts evaluateCandidates / CUTS_DEFAULT
  ranking + recomendado + risco:                 src/candidates/rank.ts rankCandidates

PROVIDER (I/O — adapter BSD)
  src/providers/stats.ts BSDStatsProvider.entityRate:149 · teamConceded:49 · oppMult:129 · xiIds:224 · teamConcededByPosition:100
                         CrosswalkStatsProvider:300 (resolve lineup-id→stats-id por nome)
  src/bsd/client.ts endpoints: events/getEvent/eventStats/eventPlayerStats/playerStats/lineups/eventOdds

IA (uma chamada, só explica/julga)
  src/ai/reviewer.ts PROMPT_REVISOR:5 · reviewCandidates:72

CONFIGURAÇÃO DE MERCADO
  src/model/markets.ts MARKETS:21 · baselineFor:64 · NATIONAL_LEAGUE_IDS:61 (inclui 27=Copa, 31=amistoso)
  src/model/params.ts  NB_DISPERSION/PRIOR_* (EPL 2023) · POSITIONAL_TILT_ENABLED=false:21 · POSITIONAL_SHARE_NACIONAL:11

PERSISTÊNCIA / VALIDAÇÃO
  src/store/repo.ts saveLedger:35,182 · updateClosing:185 · snapshotClosing:213 · clv():2 · saveManualResult
  src/store/schema.sql paper_ledger:16 (unique event_id,jogador,linha,market_type) · odds:37 · analises:4
  GATE: test/parity/  (golden EPL congeladas)
```

**O que o motor lê hoje:** só **4 campos de jogador** (`shots_on_target`, `total_shots`,
`total_tackle`, `minutes_played`) + campos de time para concessão (`corner_kicks`, `total_tackles`,
`shots_on_target`, `total_shots`) e gols. **~75 campos da BSD ficam ociosos** (cross, dribles,
duelos, interceptação, key_pass, faltas, `won_tackle`, `average_positions`, `shotmap`…).

---

## 4. Os tiers (ordem de ataque)

Reordenado pela meta (melhores indicações **hoje**), não por elegância. Legenda de status:
**✅ pronto p/ Copa agora** · **⏳ só com prova forward acumulada** · **❌ fora de escopo agora**.

### 🔴 [Tier 0 — pré-requisitos](tiers/tier-0-pre-requisitos/) (fazer ANTES de apostar)
Sem isto, as indicações são fé cega. São rápidos e de baixo risco (não recalibram o número).
- **[I7 — Loop de validação forward (paper_ledger + CLV + settle)](tiers/tier-0-pre-requisitos/I7-loop-forward-paper-ledger-clv.md)** — única validação possível na população Copa.
- **[N1 — Gate de lineup confirmado](tiers/tier-0-pre-requisitos/N1-gate-de-lineup.md)** — não recomendar quem pode ficar no banco (a maior perda real).
- **[I8 — Settlement do desarme (`won_tackle` vs `total_tackle`)](tiers/tier-0-pre-requisitos/I8-settlement-desarme.md)** — mirar o alvo que a casa liquida.

### 🟡 [Tier 1 — precisão segura](tiers/tier-1-precisao-segura/) (melhora o número sem recalibrar)
- **[I1 — De-vig honesto + flag one-sided](tiers/tier-1-precisao-segura/I1-devig-honesto-one-sided.md)** — comparar com o número justo, não com o inflado pela margem.
- **[I5 — Dossiê da IA enriquecido (confronto como TEXTO)](tiers/tier-1-precisao-segura/I5-dossie-ia-enriquecido.md)** — melhora veto/explicação sem tocar no número protegido.
- **[N4 — Odds automáticas da BSD (mercado de partida)](tiers/tier-1-precisao-segura/N4-odds-bsd-mercado-partida.md)** — de-vig e CLV automáticos onde a BSD dá os dois lados.

### 🟢 [Tier 2 — diferencial / mais oportunidades](tiers/tier-2-diferencial/) (só LIGAR com prova forward)
- **[I3 — Novos mercados de contagem](tiers/tier-2-diferencial/I3-novos-mercados-contagem.md)** — cross, dribles, faltas, duelos, interceptações (reusa o motor).
- **[I2 — Matchup direcional dentro do μ (average_positions)](tiers/tier-2-diferencial/I2-matchup-direcional.md)** — o diferencial #1.
- **[N5 — Mismatch / posse (favorito × zebra)](tiers/tier-2-diferencial/N5-mismatch-posse.md)** — Copa tem muito jogo desigual.
- **[N2 — Prior/shrinkage por força de liga](tiers/tier-2-diferencial/N2-prior-por-forca-de-liga.md)** — forma de seleção fraca é mais ruidosa.
- **[I6 — Segunda chamada de IA (confronto / promotor×cético)](tiers/tier-2-diferencial/I6-segunda-chamada-ia.md)** — IA propõe hipótese, código decide.

### ⚫ [Tier X — fora de escopo agora](tiers/tier-x-fora-de-escopo/) (documentado para não re-tentar à toa)
- **[I4 — xG/xA no μ](tiers/tier-x-fora-de-escopo/I4-xg-no-mu.md)** — ❌ `expected_goals` vem NULL em seleção.
- **[N3 — Escopo histórico (clube+seleção)](tiers/tier-x-fora-de-escopo/N3-escopo-historico.md)** — já é o default certo; manter, validar forward.

---

## 5. Template de cada ficha (manter consistente)

Toda ficha de melhoria segue estas seções, nesta ordem:
1. **TL;DR** — 1-2 linhas: o que é a mudança.
2. **Status** — Ajuda à meta (Alto/Médio/Baixo) · Pronto p/ Copa (✅/⏳/❌) · Esforço · Risco de calibração/paridade · Custo de dado.
3. **Problema / fundamento** — por que melhora a decisão, em termos de **confronto × concessão** e **EV**. A teoria.
4. **Evidência real** — os dados da sondagem/código que sustentam (com números e `file:line`).
5. **Estado atual no código** — `file:line` exatos: o que já existe, o que falta.
6. **Proposta de implementação** — passos concretos, arquivos a tocar, contrato/wire (snake_case PT), pseudo-código. Respeitar Ports & Adapters e o gate de paridade.
7. **Plano de validação** — como provar ANTES de confiar (offline Brier/ECE/leave-one-out **ou** forward/CLV), métrica e **critério de aceite**.
8. **Riscos & armadilhas** — paridade, calibração, custo, gotchas específicos do código.
9. **Dependências** — o que precisa estar pronto antes.
10. **Esforço estimado.**
11. **Checklist de aceite** — itens verificáveis (testes, comportamento).
12. **Como verificar** — comandos (`npm test`, sondagem BSD via node, SQL no Supabase).

---

## 6. Como usar numa nova sessão

1. **Leia este README** (contexto + princípios + mapa do código).
2. **Escolha o tier** pela urgência (Tier 0 primeiro). Abra o `README.md` da pasta do tier e as fichas.
3. **Antes de codar:** rode `superpowers:brainstorming` na ideia escolhida (alinhar requisitos/design),
   depois `superpowers:writing-plans`, depois `superpowers:test-driven-development`.
4. **Respeite o gate de paridade:** se a mudança toca o money-path, rode `npm test` e confirme as
   golden de `test/parity/` antes e depois. Mudança de número exige re-calibração documentada.
5. **Valide antes de confiar:** nenhuma ideia entra no money-path sem o plano de validação da ficha.
6. **Atualize a doc viva:** mudança de estado/veredito/escopo → atualizar `docs/ROADMAP.md` e
   `docs/PITCH.md` no mesmo trabalho (regra do `CLAUDE.md`).

---

## 7. Snapshot do estado (2026-06-11) para a próxima sessão

- **Supabase:** `odds` = 665 linhas · `analises` = 10 (cache) · **`paper_ledger` = 0** · **`jogadores_crosswalk` = 0**. Sem prova forward rodando.
- **Mercados calibrados que prestam:** sot, finalizações, desarmes (player). **Gols não calibra (selado).** Vitória/escanteios derivados.
- **Copa 2026:** liga 27, season 188; abre hoje (event 8287). Lineups saem ~1h antes (até lá tudo "provavel").
- **git:** `src/manual/analyze.ts` e `test/manualAnalyze.test.ts` modificados; `tmp-out-england-v2.json`/`tmp-out-portugal-v2.json` são saídas de análise (dossiês reais de amistoso) — úteis como exemplo, não comitar.
