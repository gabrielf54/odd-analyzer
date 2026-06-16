# 🔁 RUNBOOK — Loop forward da Copa (validar gols/vitória ao vivo)

> **PARA O CLAUDE (futuras sessões / cron):** este é um **procedimento operacional**, não uma
> feature a construir. Quando o dono falar de **"loop", "forward", "validar gols/vitória",
> "conferir a Copa", "rodar o relógio"** — ou numa execução agendada — **siga os passos abaixo**.
> O dono **não vai lembrar dos comandos**; você lembra por ele (este doc está linkado no
> `CLAUDE.md` e no `CORE §4 ①`). NÃO peça confirmação pra rodar os 3 comandos — eles são idempotentes
> e só leem/gravam o `paper_ledger` (papel, sem dinheiro real).

## Por que este loop existe

Gols e vitória (1X2) usam o motor de **ratings de força** (productionizado 2026-06-12) — calibram bem
**offline** (ECE 0.04). Mas a doutrina (CORE §1) exige **validação forward** antes da ⭐: prever
**ANTES** do jogo + o jogo acontecer + juntar amostra. Este loop faz isso automático na Copa 2026
(liga 27). **Não dá pra adiantar** — depende dos jogos serem jogados; o loop só **coleta a prova** ao
longo do torneio.

## Os 3 comandos (rode nesta ordem, a cada execução)

```bash
# 1. LOGA as previsões dos jogos que vêm (próximas 72h da Copa) + ANEXA odds da BSD
#    (odd_flag de abertura + de-vig + edge/ev, Fase 2). Idempotente (upsert; odd_flag travado).
npx tsx src/cli/forwardLog.ts

# 2. (PERTO DO APITO) grava a odd de FECHAMENTO das linhas de partida pendentes → CLV.
#    SEM args = bulk automático (todas as linhas com abertura travada e sem fechamento).
npx tsx src/cli/snapshotClosing.ts

# 3. LIQUIDA os jogos que já terminaram (sem arg = todos com linha pendente no ledger).
#    Gols/vitória pelo placar; player props (sot/desarme/etc.) pelo player-stats.
npx tsx src/cli/settle.ts

# 4. RELATÓRIO de calibração/CLV por mercado (só linhas liquidadas).
npx tsx src/cli/report.ts
```

> **Timing do CLV:** o passo 1 trava a odd de ABERTURA; o passo 2 (perto do apito) grava o
> FECHAMENTO. Rodar o passo 2 logo após o 1 (jogo distante) daria CLV≈0 falso → o bulk só deve rodar
> **perto do kickoff**. Por isso é passo separado, não junto do forwardLog.

Depois do passo 3, **leia a tabela** e aplique o **critério de graduação** abaixo.

### Opcional — registro-sombra da finalização (diagnóstico, NÃO toca produção)

```bash
# Mede AO VIVO se combinar a forma com o MISMATCH de força afia a finalização (a calibração
# offline provou isso no CLUBE; na Copa o dado não existe → só forward decide). Isolado:
# recomputa do BSD, não grava no ledger, não muda nenhum prob_modelo. Idempotente; acumula.
npx tsx src/cli/forwardShadowFinalizacao.ts
```

Veredito (forma vs forma×mismatch) só quando `n≥30` na banda. Se a **sombra** vencer consistente
(BrierSkill↑, ECE↓) ao longo da Copa → vira candidata a fator calibrado na finalização (com re-freeze
de paridade). Contexto: [`mercados-nao-validados`](../mercados-nao-validados/) (exp. 12f).

## Critério de GRADUAÇÃO (quando dar a ⭐ a gols/vitória)

Flipar `validated_lines` em `src/model/markets.ts` para um `(mercado, população)` **só quando**, no
relatório forward:

1. **Amostra suficiente:** `n ≥ 30` linhas liquidadas daquele mercado (idealmente na banda de aposta).
2. **Tem skill:** `BrierSkill > 0` (melhor que chutar a média).
3. **Calibrado:** `ECE ≤ ~0.05` (não super/sub-prevê).
4. **(Fase 2 — CLV) `CLVm ≥ 0`** quando as odds estiverem entrando (ver abaixo). Sem CLV, no máximo
   marque como **"calibrado forward"** no CORE — a ⭐ plena de aposta-de-valor pede o CLV.

Se cruzar → edite `validated_lines` de `gols`/`vitoria` (ex.: `{ selecao: [], clube: [] }` p/ todas as
linhas, ou só as que passaram), **rode `npm test`** (gate de paridade), e **atualize o CORE §3.1** +
**apague esta pasta** (a essência sobe pro CORE; o git guarda o detalhe). Se NÃO cruzar, só siga
rodando — o loop acumula.

> **Mesma máquina regrada os mercados de jogador demovidos** (sot 1.5, desarme 1.5, finalizações 2.5
> seleção…): eles já entram no `paper_ledger` pela análise manual (`/analise/manual`, com odds
> coladas) → `settle.ts` os liquida pelo player-stats → `report.ts` os mede. Se cruzarem o critério no
> forward, regrade igual.

## Duas fases

- **Fase 1 — CALIBRAÇÃO (automática, SEM odds):** `forwardLog.ts` loga a `prob_modelo`. O
  `report.ts` dá Brier/ECE. Responde: *"o modelo acerta a probabilidade?"*
- **Fase 2 — CLV — LIGADA (2026-06-15):** o `forwardLog` agora busca as odds de **partida** da BSD
  (`/events/{id}/odds/`) e **anexa** `odd_flag` (linha de ABERTURA, travada na 1ª observação) +
  `prob_devig` (de-vig) + `edge` + `ev`. Perto do apito, `snapshotClosing.ts` (modo **bulk**, sem
  args) grava a odd de **fechamento** → `clv = odd_flag/odd_fechamento − 1`. O `report.ts` então
  mostra `CLVm`. **Detalhe técnico:** o payload real é PLANO (`{odds:{home_win,draw,away_win,
  over_15_goals,…}}`), nada do estilo bookmakers/outcomes — parser puro em
  `src/odds/bsdMatchOdds.ts` (gols = de-vig 2-vias over/under; vitória = de-vig **3-vias**
  mandante/empate/visitante, `devigThreeWay`). Money-path de jogador NÃO tocado (gate de paridade
  intacto, 445 testes). **Falta só TEMPO:** o CLV honesto exige abertura cedo + fechamento no apito —
  acumula ao longo da Copa. Critério de graduação (n≥30, BrierSkill>0, ECE≤0.05, **CLVm≥0**) inalterado.

## Estado atual (atualize a cada rodada)

- **📍 2026-06-15 (tarde) — FASE 2 (CLV) LIGADA + loop rodado:** spike confirmou o formato REAL do
  `/events/{id}/odds/` (PLANO — `home_win/draw/away_win/over_NN_goals/under_NN_goals/btts_*`, **não**
  bookmakers/outcomes; o `BSDMatchOdds` antigo estava cego). Novo parser puro `src/odds/bsdMatchOdds.ts`
  + de-vig 3-vias `devigThreeWay` (15 testes novos, **445 verdes, gate intacto**). `forwardLog` agora
  anexa `odd_flag`(abertura travada)+`prob_devig`+`edge`+`ev`; `snapshotClosing` ganhou modo **bulk**
  (fechamento → CLV). **Run ao vivo:** 48 previsões logadas em 12 jogos, **4/4 com odd** cada (de-vig
  funcionando). `settle`: 8302 Iran×NZ liquidou (0-0). `report`: **gols n=46 BrierSkill +0.128 / ECE
  0.082** (melhorando); **vitória n=21 ainda −0.105/ECE 0.255** (amostra contaminada pelo modelo velho —
  limpa conforme jogos novos liquidam). CLV `n/d` (snapshots de fechamento só acumulam perto dos apitos).
  - **✅ Observação da vitória RESOLVIDA no mesmo dia (investigação a fundo):** o "favorito subestimado"
    era 2 fantasmas, NÃO defeito do modelo. (1) **Artefato de campo** (`investigate-vitoria-calibration.mts`
    n=1133): a amostra de eliminatória é casa/fora (mando 46/30%) mas o modelo usa neutro (correto p/ a
    Copa) → botar mando faz ECE 0.116→0.02; o mecanismo do 1X2 é SÃO. (2) Ao vivo NEUTRO o **modelo BATE
    o mercado** (`copa-model-vs-market.mts` n=15: Brier 0.261<0.282; favoritos-de-mercado venceram 40% vs
    72% precificado) → é o mercado que superprecifica favorito; o conservadorismo do modelo está certo
    (n=15, pista). **NÃO consertar a vitória.** Hipótese forward nova: **FADAR favorito** pode ter valor.
  - **PRÓXIMO:** seguir rodando (1→[apito]2→3→4); o CLV começa a aparecer com os jogos desta semana.
- **📍 2026-06-15 (manhã) — CHECKPOINT (handoff p/ outro chat):** loop operado (gols **n=43 BrierSkill +0.16**;
  vitória **n=20**). O forward **expôs um BUG** e ele foi **CONSERTADO no mesmo dia**:
  - **Bug:** vitória miscalibrava (ECE 0.32, probs extremas — `Iran×NZ 85% over2.5 / vitória 16%`,
    invertido). **Causa-raiz** (diagnóstico `scripts/diag-vitoria-ratings.mts`): time de histórico raso
    (NZ só 2 jogos no pool cross-competição) era **inelegível pelo floor=5 → caía no fallback média-crua
    cego**, que usa stats brutos sem ajuste de adversário e **inverte o mismatch**.
  - **Fix (TDD, 430 testes, gate de paridade intacto, money-path de jogador NÃO tocado):** em
    `pipeline.runMatch` o floor caiu p/ **1** (time presente no pool usa o RATING, não o fallback) +
    `lambdaFromRatings` ganhou **`shrinkK`** (encolhe rating de pouco histórico pro neutro);
    `ratingsShrinkFor("selecao")=3`. **Calibrado** em `scripts/sweep-shrink-selecao.mts` (n=1006, floor=1):
    o floor=1 é o que conserta (vitória full BrierSkill **+0.10**; o Elo de LR lento já regulariza raso),
    `shrinkK=3` é leve (ajuda gols 1.5/2.5, segura o raso de rating inflado). `Iran×NZ` → **60%/50% (são)**.
  - **⚠️ Caveat de leitura:** o report ainda mistura jogos liquidados com o modelo ANTIGO (não dá p/
    mudar retroativo) → a vitória limpa **conforme os novos jogos (corrigidos) liquidarem**. A prova do
    fix é o `Iran×NZ` são + o sweep offline, não o ECE da amostra contaminada.
  - **PRÓXIMOS PASSOS (p/ continuar):** (1) **seguir rodando os 3 comandos** — a amostra corrigida
    acumula e a vitória deve cair pra ECE saudável; (2) **Fase 2 / CLV** segue pendente (ver "Duas
    fases"); (3) **resíduo Modo 2** (NÃO consertado): time de confederação isolada tem att/def numa
    escala não-comparável entre "ilhas" do pool (ex. `Saudi×Uruguay` over2.5 ~25%, baixo) — é problema de
    conectividade de rating, mais profundo; **observar no forward**, decidir fix depois (anchor global /
    mais links inter-confederação) se persistir. (4) painel de frentes restantes em
    [`mercados-nao-validados`](../mercados-nao-validados/) (E passes/N5, F finalização-clube).
- **2026-06-12:** loop criado, provado e **PERSISTINDO**. Bug achado e corrigido: `odd_flag` era
  `NOT NULL` (linha de calibração não tem odd) e o `saveLedger` engolia o erro → previsões NÃO
  gravavam. Fix: migração `paper_ledger_odd_flag_nullable` (odd_flag nullable) + `saveLedger` agora
  **falha alto** (não engole). **13 jogos logados** (2 liquidados — as aberturas; 11 pendentes).
  Liquidados: **gols n=6, vitória n=2**. ⚠️ **Os números do report (BrierSkill/ECE) são RUÍDO a
  n<10 — IGNORAR até a amostra passar de ~30.** O modelo acertou os 2 jogos (resultado 2/2, direção
  dos gols 2/2), mas n=2 é anedota. Fase 1 (calibração) ligada; Fase 2 (CLV) pendente. Nenhum
  mercado de partida graduado.

## Automação

Idealmente um agente agendado (cron) roda os 3 comandos 1×/dia durante a Copa. Se houver um cron
configurado, ele aponta para este runbook. Se não, **qualquer sessão** em que o dono mencione a Copa/
forward: rode os 3 comandos e reporte o `report.ts` em linguagem leiga (lembre: o dono não lê código).

## Quando ARQUIVAR esta pasta

Quando gols **e** vitória graduarem (ou forem pro Cemitério §5 com prova forward), mova a essência pro
CORE §3.1 e **apague `docs/features/forward-loop-copa/`** (regra de não-poluição do `CLAUDE.md`).
