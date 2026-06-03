# Design — Motor + calibração validados, pronto pro front

> **Data:** 2026-06-03 · **Meta (goal):** deixar o motor numericamente correto e **validado com veredito honesto**, com a base sem dívida, de forma que o **front** (projeto seguinte) comece sobre algo provado. **Custo:** $0 (tudo offline, dado vivo do BSD).

## Objetivo em uma frase

Antes de construir qualquer UI, **consertar o que corrompe o número → medir honesto se o modelo presta → só alargar a superfície (Fase 3) se prestar**, e fechar os pré-requisitos de operação que a validação destrava.

## Princípio ordenador (não re-litigar)

A doutrina é **validação-primeiro, sem auto-engano** ([../../../CLAUDE.md](../../../CLAUDE.md)). Logo a ordem **não** é "construir mais → front". É:

1. Corrigir entradas erradas do `mu` (per-90, baseline de concessão) — calibrar com número torto = medir lixo.
2. Medir confiabilidade honesta por mercado de contagem.
3. Construir o modelo de partida (Fase 3) **só se** a contagem calibrar.
4. Fechar dívida de operação (xi_confirmado, crosswalk, CLV forward).

Construir Fase 3 ou o front antes do veredito é alargar superfície não-provada — proibido pela doutrina.

## Barra de "validado" (decisão travada com o usuário)

**Rodar + veredito honesto.** A calibração roda em todo o dado free do BSD, as métricas (Brier / ECE / BrierSkill / reliability bins) são gravadas no ROADMAP, e o veredito é escrito por mercado: **presta / não presta / amostra insuficiente**. O front libera com diagnóstico claro, **não** com um número mágico. Dado free não garante ECE<0.05; forçar esse alvo seria auto-engano ao contrário.

## Fonte de dados: BSD/Bzzoiro (não API-Football)

Decisão do usuário (2026-06-03): calibrar no **BSD**, mesmo ID space do motor de produção, sem player-matching entre fontes. Rotas e exemplos reais sondados em [../../apis/bsd-bzzoiro/examples/](../../apis/bsd-bzzoiro/examples/) (README + `*.json`). Resumo do que o BSD entrega:

- **Universo de finalizados:** `GET /events/?league_id=&status=finished` (3474 no Brasileirão A), paginado `limit=50&offset=N`, cada item com `event_date` + `home_team_id/away_team_id` + placar.
- **Actuals:** `GET /events/{id}/player-stats/` → `player_stats[]` com `player_id`, `minutes_played`, `shots_on_target`, `total_shots`, `total_tackle`, `interception`.
- **Histórico:** `GET /players/{id}/stats/` → linhas com `event_id` + mesmos campos. **Sem `event_date` na linha** → exige join `event_id→event_date`.
- **Stats de time:** `GET /events/{id}/stats/` (escanteios etc).
- **Odds:** `GET /events/{id}/odds/` de finalizado vem **flat, só consensus, só mercado de partida** (1x2/over_under_gols/btts).

### Verdade dura: dois tipos de validação, não um

| Validação | Precisa de | Mercado jogador | Mercado partida |
|-----------|------------|-----------------|-----------------|
| **Confiabilidade** (Brier/ECE/reliability) | `prob_modelo` + `actual` | ✅ viável agora, $0 | ✅ viável |
| **CLV / edge** | odd de fechamento do mercado | ❌ impossível (sem prop-odd, nem retroativo) | ⚠️ só forward, ao vivo |

**Implicação:** "validado" para mercado de jogador = **só confiabilidade**. CLV de jogador nunca sai de backtest — fica para o paper-mode ao vivo. CLV histórico é impossível (odds só populam perto do kickoff) → CLV vira **captura forward** (Fase D), não fase de backtest.

## Fases

### Fase A — Consertar o número (entra direto no `mu`)

**A1. Per-90 ponderado por minutos.** Hoje `windowed_rate` (`src/odd_analyzer/model/assemble.py`) e `BSDStatsProvider.entity_taxa` (`src/odd_analyzer/providers/stats.py:~117`) usam média por-jogo, ignorando `minutes_played` → inflam suplente/substituído. Trocar para `Σstat / Σmin × 90` por janela (3/5/10). Atualizar testes de `assemble`.

**A2. League-sweep do `concede_baseline`.** Hoje `MarketSpec.concede_baseline` (`src/odd_analyzer/model/markets.py`) é prior estático chutado (sot 4.5 / finalizações 12 / desarmes 16 / escanteios 5), denominador do `opponent_multiplier`. Medir a concessão média real por mercado no BSD (mesmo paginador da Fase B) e substituir. Documentar os valores medidos.

### Fase B — Medir honesto (o gate)

**B1. Coletor BSD** (`src/odd_analyzer/backtest/collect_bsd.py`, novo). Pagina `/events/?status=finished` para uma liga, constrói o mapa `event_id→event_date`, puxa `player-stats` (actuals) e `players/{id}/stats` (histórico), e emite os mesmos `records`/`meta` que o `score_records` atual consome. Cache agressivo (TTL já existe no client).

**B2. Reaproveitar `score_records`** (`src/odd_analyzer/backtest/run_backtest.py`) — função pura, leave-one-out cronológico (treina só com jogos **antes** da data do alvo), shrinkage + adjustments + `prob_over_line`. Só troca a origem dos dados (BSD em vez de API-Football). API-Football sai do caminho de validação (vira fallback dormindo).

**B3. Rodar calibração por mercado de contagem** (SOT, finalizações, desarmes; escanteios via `event_stats`). Calcular Brier / log-loss / ECE / BrierSkill / reliability bins (`src/odd_analyzer/backtest/calibration.py`, já existe). **Gravar resultados + veredito escrito no ROADMAP.**

### Fase C — Bifurcação (decidida pelo veredito de B)

- **Se contagem calibra bem** → construir `src/odd_analyzer/model/match_model.py` (Poisson bivariado + Dixon-Coles → `probs_1x2` + `prob_total_over`; `team_rates`), ligar o dispatch `kind="partida_*"` no `pipeline.analisar_jogo`, e calibrar 1X2/gols pelo mesmo caminho.
- **Se NÃO calibra** → parar, reportar o diagnóstico, ajustar o modelo de contagem antes de qualquer Fase 3 ou front. Fase 3 não é incondicional.

### Fase D — Pronto-pro-front (fechar dívida de operação)

- **D1. `xi_confirmado` populado:** pipeline passa a popular `xi_team_ids` a partir de `/events/{id}/lineups/` (`lineup_status:"confirmed"`), tornando o gate do filtro vivo (hoje sempre `True`).
- **D2. Persistência `jogadores_crosswalk`:** loader/saver ligando `crosswalk/match.py` à tabela existente no `schema.sql` (hoje só função standalone, sem persistência).
- **D3. Logger de CLV forward:** snapshot da odd de fechamento pré-kickoff no `paper_ledger` — porque CLV histórico é impossível. Sem isto, CLV nunca existe.
- **D4. Slot odds-corners documentado:** registrar o caminho para odds automáticas de escanteios (testar `/odds/?market=total_corners` num jogo futuro) sem implementar agora.

## Fora de escopo (projeto seguinte: o front)

UI Streamlit religada, tela-de-jogos, modo pré-jogo ao vivo, gastar os $19 do API-Football. Também ficam fora desta meta (residuais conhecidos, aceitos): fallback wired, matchup direcional/zonal, implementação de odds-corners automáticas, acúmulo de CLV ao vivo, cross-check de proveniência do BSD, e dinheiro real. Esses dependem de tempo de runtime ou de dado que A→D não cobre.

## Critério de pronto da meta

1. `mu` correto (per-90 + baseline medido) com testes verdes.
2. Calibração rodada no BSD por mercado de contagem, métricas + veredito gravados no ROADMAP.
3. Fase 3 construída **ou** decisão documentada de não construir (com o diagnóstico que justifica).
4. Dívida de operação fechada (D1–D4) com testes verdes.
5. Suíte inteira verde.
