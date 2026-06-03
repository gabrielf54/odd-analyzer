# Minutos esperados (parar de assumir 90) — Design

> **Status:** spec aprovado em brainstorming (2026-06-03). Arena: Copa do Mundo 2026; dinheiro real começa **11/06**.
> **Origem:** o diagnóstico `scripts/diag_minutos_selecao.py` (commit 17c543e) provou que o gap de calibração na população de seleção é **minutos, não a taxa** — com minutos reais o ECE cai pra <0.05 e o BrierSkill vira +0.08..+0.20. Doutrina: [../../../CLAUDE.md](../../../CLAUDE.md).

## Problema

A produção (`entity_taxa`) projeta **todo titular pra 90 minutos** ao montar o `mu`. Em jogo de seleção há muito rodízio/substituição → quem joga <90 produz menos que a projeção → **super-estimação sistemática** (ECE 0.10–0.19). A taxa por-90 está validada; o erro é assumir 90 min pra todos.

## Objetivo

Estimar os **minutos esperados** de cada jogador (pré-jogo) e escalar o `mu` por eles, ligar isso em produção, e **re-validar** o backtest da população de seleção com minutos **estimados** (não reais). Mercado que atingir o crivo (ECE<0.08 + BrierSkill>0 nas linhas úteis) com minutos estimados fica **money-ready** pra Copa; o resto segue paper.

## Princípio inegociável herdado

- Valor = `prob_modelo > prob_justa_de-vig` (EV/edge). NUNCA filtrar por prob alta.
- A prova mede o que a produção calcula: o backtest usa minutos **estimados** (o que produção terá pré-jogo), não minutos reais (que produção não conhece).
- **NÃO re-tunar os priors da taxa** — a taxa transfere bem; mexer nela seria consertar o que não está quebrado.

## Decisões travadas no brainstorming

1. **Estimador = média recente de `minutes_played`** na mesma janela que produz a taxa (w5, senão w3, senão w10). Sem teto/piso (média pura). Captura rodízio sozinho, não depende de lineup confirmado, zero dado novo.
2. A nova conta: `mu = taxa_por90 × (min_esperados / 90) × opp_mult × ha_mult`.
3. Prova e produção usam a MESMA estimativa (média recente). O backtest NÃO usa minutos reais (esses são só o "teto" de referência já medido no diagnóstico).
4. Conserta a super-estimação **também no clube** (liga 9 também projetava 90) → melhoria geral, sem regressão (fixtures de 90 min não mudam).

## Arquitetura e fluxo

`expected_minutes(games)` devolve a média de `minutes_played` na janela recente (reusa `windowed_rate(games, "minutes_played")` com `minutes_field=None`, mesma seleção w5/w3/w10 da taxa). Esse valor entra como `minutos_esperados` em `player_mu_from_games` (que já recebe esse parâmetro), substituindo o `90.0` chumbado.

- **Produção** (`entity_taxa`): após montar `games` (revertidos + filtrados por escopo), calcula `min_esp = expected_minutes(games)`; passa `minutos_esperados=min_esp` à conta pura; retorna `minutos_esperados=min_esp` (não 90).
- **Backtest** (`score_targets`): para cada jogador-alvo, calcula `min_esp = expected_minutes(older)` (os jogos anteriores ao alvo, já filtrados por escopo) e usa como `minutos_esperados` — minutos ESTIMADOS, espelhando produção.

`min_esp is None` (sem jogos) → o caminho já retorna None antes (sem amostra), igual hoje.

## Componentes e arquivos

| Arquivo | O quê | Ação |
|---|---|---|
| `src/odd_analyzer/model/assemble.py` | `expected_minutes(games)` → média de minutos na janela (w5→w3→w10) ou None | modificar |
| `src/odd_analyzer/providers/stats.py` | `entity_taxa` usa `expected_minutes` e passa/reporta minutos estimados em vez de 90 | modificar |
| `src/odd_analyzer/backtest/run_national_backtest.py` | `score_targets` usa `expected_minutes(older)` em vez de 90 | modificar |
| `app/streamlit_app.py` | caption ⚠️ condicional ao veredito (money-ready nos mercados que passarem) | modificar |
| `docs/ROADMAP.md` | veredito da re-validação com minutos estimados | modificar |
| `tests/test_assemble.py` | `expected_minutes` | modificar |
| `tests/test_stats_provider.py` | `entity_taxa` escala por minutos + reporta estimado | modificar |
| `tests/test_collect_national.py` | `score_targets` usa minutos estimados | modificar |

**Reuso intacto:** `player_mu_from_games` (já aceita `minutos_esperados`), `windowed_rate`, métricas de `calibration.py`, specs de `markets.py`. Não há re-tune de prior.

## Re-validação e critério money-ready

1. Re-rodar `run_national_backtest` (agora minutos estimados) nos 3 mercados → ECE/LogLoss/BrierSkill por linha, escopo só-seleção+amistoso.
2. **Critério:** mercado passa se **ECE<0.08 + BrierSkill>0** nas linhas úteis (o1.5/o2.5). Comparar com teto (minutos reais, diagnóstico) e piso (90).
3. **Por mercado:** passa → money-ready na Copa (caption verde); não passa → paper. Registrar veredito honesto no ROADMAP.

## Testes (TDD, fakes, sem rede)

- `expected_minutes`: histórico com minutos variados → média da janela correta; pega w5 senão w3 senão w10; lista vazia → None.
- `entity_taxa`: dois fakes com a MESMA taxa por-90 mas minutos diferentes (um 90/jogo, outro 50/jogo) → o de 50 dá `mu` ~ 50/90 do outro; o retorno reporta `minutos_esperados` ≈ a média real (não 90).
- `score_targets`: o mu usado vem dos minutos estimados (ex.: histórico de 60 min → mu escalado por 60/90), não 90 nem real.
- Regressão: suíte verde. Fixtures existentes usam `minutes_played=90` → `expected_minutes=90` → comportamento idêntico (os asserts de mu/`minutos_esperados=90` continuam válidos).

## Não-objetivos (YAGNI)

- **Não** re-tunar priors da taxa.
- **Não** usar lineup-aware nem teto/piso (média pura, decisão travada).
- **Não** mexer em gols/escanteios (partida) nem automatizar odds.
- **Não** usar minutos reais no backtest (só estimados; reais são referência-teto).

## Riscos

- **Estimativa < teto:** minutos estimados (média recente) ≠ minutos reais → ECE provavelmente entre o teto (~0.03) e o piso (~0.13). Se ficar acima de 0.08 em algum mercado, ele NÃO vira money-ready (resultado honesto válido) — possível próximo passo seria estimador melhor (lineup-aware), fora deste escopo.
- **Amostra de minutos rala** em jogador com poucos jogos → média instável; o gate de amostra (`amostra_jogos`) e a incerteza já sinalizam.
- **Settlement BSD vs casa:** risco pré-dinheiro independente de calibração.
