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
