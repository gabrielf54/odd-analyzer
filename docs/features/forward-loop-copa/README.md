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
# 1. LOGA as previsões dos jogos que vêm (próximas 72h da Copa). Idempotente (upsert).
npx tsx src/cli/forwardLog.ts

# 2. LIQUIDA os jogos que já terminaram (sem arg = todos com linha pendente no ledger).
#    Gols/vitória pelo placar; player props (sot/desarme/etc.) pelo player-stats.
npx tsx src/cli/settle.ts

# 3. RELATÓRIO de calibração/CLV por mercado (só linhas liquidadas).
npx tsx src/cli/report.ts
```

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

- **Fase 1 — CALIBRAÇÃO (agora, automática, SEM odds):** `forwardLog.ts` loga só a `prob_modelo`. O
  `report.ts` dá Brier/ECE (CLV = `n/d`). Responde: *"o modelo acerta a probabilidade?"*
- **Fase 2 — CLV (precisa de odds):** a BSD dá odds de **partida** (1X2, over/under gols) em
  `/events/{id}/odds/` — 2 lados → de-vig + CLV automáticos. **Ainda NÃO está ligada ao loop**
  (`src/providers/odds.ts::BSDMatchOdds` não bate com o payload flat real — ver
  [[copa-viabilidade-dado-2026]]). **TODO p/ ligar a Fase 2:** (a) confirmar o shape real do
  `/events/{id}/odds/`; (b) ingerir no `forwardLog` (gravar `odd_flag` + `prob_devig` + `edge`); (c)
  `snapshotClosing.ts` perto do kickoff p/ a odd de fechamento → CLV. Só então gols/vitória ganham a
  ⭐ plena.

## Estado atual (atualize a cada rodada)

- **📍 2026-06-22 — FORWARD LIMPO (2 bugs de MEDIÇÃO consertados, TDD, 452 testes, gate intacto):**
  o forward foi rodado (`settle`+`report`) e a investigação expôs que o "modelo ruim" era ~80%
  **medição**, não motor:
  - **BUG 1 — settle da vitória:** `settleMatchRows` liquidava os 3 lados (1/X/2) como "mandante
    venceu?" → as linhas `(2)`/`(X)` recebiam resultado ERRADO. Fix: lê o lado do rótulo
    (`outcome1x2FromLabel`). Vitória forward **BrierSkill −0.33→+0.14** (ECE 0.26→0.10, n=57).
    Re-liquidado o histórico (22 linhas de vitória corrigidas).
  - **BUG 2 — DNP no settle:** o forward logava reserva/banco como aposta (ex.: Berhalter 16'/0
    chutes contava como modelo errado). Fix: `MIN_SETTLE_MINUTES=60` em `settlePlayerRows` (espelha
    a calib offline) + limpeza retroativa de **112 linhas DNP** (anuladas). → **sot +0.016→+0.26**
    (linha validada disse 28%/real 26%, calibrado), **faltas +0.18→+0.31**.
  - **Estado limpo do report:** gols +0.06/ECE 0.11 (n=82) · vitória +0.14/ECE 0.10 (n=57) · faltas
    +0.31 (n=57) · sot +0.26 (n=26) · **finalizações −0.25 (n=66)** · desarmes n=6.
  - **Resíduo REAL único — finalizações over-prediz os picks de edge** (linha validada disse 40%/real
    17%, n=35): **maldição do vencedor** (edge>0 seleciona os exageros do modelo) + viés de zagueiro
    (a casa precifica zagueiro baixo, o modelo infla via prior 1.2 chutes). Offline a banda é ~OK
    (audit 2026-06-11) → **NÃO mexer no μ**; mitigação = corte de edge / shrink do edge, mas precisa de
    forward LIMPO p/ calibrar sem overfitar n=35. **Não implementado** (doutrina: sem validar, não entra).
  - **GRADUAÇÃO:** nada cruza ainda (ECE>0.05 em gols/vitória; n modesto). O loop agora acumula
    HONESTO — seguir rodando os 3 comandos; vitória/sot/faltas são os candidatos mais próximos.
- **📍 2026-06-15 — CHECKPOINT (handoff p/ outro chat):** loop operado (gols **n=43 BrierSkill +0.16**;
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

**LIGADA desde 2026-06-22 — agendador 24h IN-PROCESS** (`src/scheduler/`, ver CORE §3.2). Subir a API
(`npm run dev`) já roda sozinho, por jogo da Copa: coleta de odds nos marcos (abertura/deriva/**salto da
escalação**/fechamento) + `forwardLog` (varredura 6h) + `settle` (varredura 1h). Diário em `scheduler_runs`
e painel **Agendador** no front (`GET /scheduler/status`). Flag `SCHEDULER_ENABLED=false` desliga.

Os 3 comandos abaixo seguem válidos para rodar **à mão** (são as mesmas funções que o agendador chama —
`runForwardLog`/`runSettle` em `src/scheduler/jobs.ts`; os CLIs são cascas finas). **Qualquer sessão** em
que o dono mencione a Copa/forward: rode-os e reporte o `report.ts` em linguagem leiga (o dono não lê código).

## Quando ARQUIVAR esta pasta

Quando gols **e** vitória graduarem (ou forem pro Cemitério §5 com prova forward), mova a essência pro
CORE §3.1 e **apague `docs/features/forward-loop-copa/`** (regra de não-poluição do `CLAUDE.md`).
