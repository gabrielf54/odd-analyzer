# Re-calibração dos mercados de jogador na população de SELEÇÃO (Copa) — Design

> **Status:** spec aprovado em brainstorming (2026-06-03). Arena: Copa do Mundo 2026.
> **Gate:** dinheiro real começa **11/06/2026** → o motor precisa estar validado na população certa antes disso. Doutrina: [../../../CLAUDE.md](../../../CLAUDE.md). Spike de viabilidade: [../../apis/bsd-bzzoiro/wc-validation-spike.md](../../apis/bsd-bzzoiro/wc-validation-spike.md).

## Problema

O motor (SOT · finalizações · desarmes) foi calibrado em **liga 9 (Brasileirão, CLUBES)**. A Copa é **SELEÇÕES** — população diferente (seleção finaliza menos: SOT soma ~5-6/jogo vs Brasileirão). **Calibração de clube não transfere cega.** O spike confirmou que o BSD tem >1300 jogos de seleção finalizados com player-stats completos, no mesmo formato → dá pra **re-calibrar na população certa**, não só fazer sanity.

## Objetivo

Produzir um **veredito honesto por mercado** (SOT, finalizações, desarmes) na população de seleção, validando **exatamente a conta que o app roda ao vivo**, e ligar na produção o modo que prestar — com o usuário podendo escolher o escopo de histórico. Mercado que não calibrar em nenhum modo entra selado "em validação" pra Copa.

## Princípio inegociável herdado

- Valor = `prob_modelo > prob_justa_de-vig` (EV/edge positivo). **NUNCA** filtrar por probabilidade alta.
- A prova tem que medir **o que a produção realmente calcula** (anti-auto-engano). Por isso a "conta pura" é compartilhada por prova e app.
- Veredito honesto: ECE e BrierSkill mandam; não vender o que não prova.

## Decisões travadas no brainstorming

1. **Abordagem A — espelhar a produção.** A calibração replica o caminho ao vivo: por jogo-alvo de seleção, puxa o histórico real de cada titular, monta a forma recente como o app faz, compara com o actual.
2. **Testar os dois escopos de histórico** (só-seleção vs misto clube+seleção) **× medir amistoso** (com vs sem liga 31) = varredura 4×, veredito por mercado×modo.
3. **Escopo de histórico vira escolha do usuário** no app: "Seleção + clube (todos)" / "Só seleção" / "Só clube".
4. **`concede_baseline` ciente da população** — guarda baseline de clube e de seleção; app escolhe pela liga do jogo.
5. **Anti-espiada sem mapa de datas:** o histórico vem mais-novo→mais-velho; pra cada jogo-alvo usa só os jogos que vêm **depois** dele na lista (mais antigos).

## Arquitetura e fluxo

### Universo de jogos-alvo (população de seleção)
Ligas com player-stats confirmados no spike: eliminatórias **58, 59, 60, 61, 62**, Nations League **64, 65**, **Euro 66**, **Copa América 67**, amistosos **31**. Foco em jogos recentes (cap por liga; recência ~12-18 meses, os que cabem no histórico e mais parecidos com a Copa). Liga 30 (AFCON 2023) **excluída** (0 player-stats). Liga 27 (WC2026) **não é fonte de calibração** (jogos `notstarted`/placeholders de chave).

### Por jogo-alvo, por titular (minutos > 0 nos player-stats = actual)
1. Puxa `/players/{id}/stats/` (histórico real, paginado, mais-novo→mais-velho).
2. Recorta para os jogos **mais antigos que o alvo** (entradas após o índice do alvo na lista) → sem leakage.
3. Aplica o escopo de histórico (filtro por `team_id`, ver abaixo).
4. Aplica o multiplicador de confronto (concessão da seleção adversária no eixo) usando o **baseline de seleção**.
5. Gera `prob_over` por linha → compara com o actual.

### Varredura 4× (matriz de modos)
| escopo \ amistoso | com liga 31 | sem liga 31 |
|---|---|---|
| **só-seleção** (`team_id == time-do-jogo-alvo`) | ✓ | ✓ |
| **misto** (todos os `team_id`) | ✓ | ✓ |

> O toggle de amistoso remove os eventos da liga 31 **tanto dos alvos quanto do histórico só-seleção** (consistência).

### Saída
Tabela por mercado × modo: `n`, `freq_real`, `Brier`, `LogLoss`, `ECE`, `BrierSkill`, reliability bins. Veredito honesto por mercado (qual modo presta, ou nenhum).

### Baseline de seleção (paralelo)
Re-mede `concede_baseline` na população de seleção (pool multi-liga) por mercado. Número de seleção ≠ clube.

## Componentes e arquivos

### A "conta pura" (seam de fidelidade)
Hoje a conta da taxa mora dentro de `BSDStatsProvider.entity_taxa` (acoplada ao IO). Extrair a parte pura (recebe lista de jogos do histórico + concessão do adversário + baseline + specs → devolve taxa/mu/prob) para `model/assemble.py`. **Prova e produção chamam a mesma função.** A prova passa o histórico recortado; a produção passa o histórico ao vivo. `entity_taxa` passa a ser um wrapper fino (busca + chama a conta pura) — **comportamento idêntico ao atual** (regressão coberta por teste).

### Escopo de histórico (filtro por `team_id`)
Semântica geral (vale p/ jogo de seleção e de clube): compara o `team_id` de cada jogo passado com o time que o jogador defende **neste** jogo-alvo (`event_team_id`).
- **todos**: sem filtro.
- **só-seleção**: `team_id == event_team_id` (num jogo de Copa = só jogos pela seleção).
- **só-clube**: `team_id != event_team_id` (os jogos das outras camisas).

### Tabela de arquivos
| Arquivo | O quê | Ação |
|---|---|---|
| `src/odd_analyzer/model/assemble.py` | extrair a conta pura da taxa (função compartilhada prova↔produção) + parâmetro de escopo | modificar |
| `src/odd_analyzer/providers/stats.py` | `entity_taxa` vira wrapper fino sobre a conta pura; aceita `escopo_historico` | modificar |
| `src/odd_analyzer/backtest/collect_national.py` | pool multi-liga de jogos-alvo + recorte "histórico até o alvo" por jogador, nos 4 modos | **criar** |
| `src/odd_analyzer/backtest/run_national_backtest.py` | orquestra a varredura 4×, chama a conta pura, imprime tabela por mercado×modo | **criar** |
| `scripts/measure_concede_baseline.py` | aceitar lista de ligas (pool de seleção) | modificar |
| `src/odd_analyzer/model/markets.py` | guardar baseline de seleção além do de clube (ciente de população) | modificar |
| `src/odd_analyzer/service.py` | `analisar` aceita `escopo_historico` | modificar |
| `src/odd_analyzer/runner.py` / `pipeline.py` | encaminhar `escopo_historico` + escolher baseline pela liga do jogo | modificar |
| `app/streamlit_app.py` | seletor de escopo de histórico na tela de análise | modificar |
| `docs/ROADMAP.md` | seção de calibração: veredito da população de seleção | modificar |

**Reuso intacto (só consumidos):** `score_records`/`calibration.py` (métricas), specs de `markets.py`.

## Produção — comportamento

1. **Seletor no app**: "Seleção + clube (todos)" / "Só seleção" / "Só clube". Default = modo vencedor da prova por mercado.
2. **Baseline pela liga**: liga de seleção → baseline de seleção; liga de clube → baseline de clube.
3. **Selagem**: mercado que não calibra em nenhum modo na população de seleção entra "em validação" pra Copa (não carrega dinheiro), igual gols/escanteios.

## Testes (TDD, fakes, sem rede)

`FakeBSDClient` devolve a forma real do BSD de seleção (fixtures baseadas nos dumps `wc_*.json`).

- **Conta pura:** mesma entrada → mesma taxa chamada por prova e produção (não divergem). Filtros de escopo (só-seleção/só-clube/todos) contam os jogos certos por `team_id`.
- **Anti-espiada:** dado um alvo no meio do histórico, a taxa usa só jogos mais antigos; jogo posterior ao alvo nunca entra.
- **Coletor multi-liga:** junta alvos de várias ligas sem duplicar; toggle de amistoso muda o conjunto de alvos como esperado.
- **Baseline de seleção:** `measure_concede_baseline` com lista de ligas agrega as duas seleções por jogo e tira a média.
- **Produção fim-a-fim (fake):** `service.analisar` com cada `escopo_historico` produz candidatos coerentes; baseline escolhido pela liga; mercado não-calibrado entra selado.

## Não-objetivos (YAGNI)

- **Não** automatizar odds (segue manual — não existe feed barato de prop).
- **Não** mexer em gols/escanteios (seguem em validação).
- **Não** tocar no front além do seletor de escopo.
- **Não** calibrar liga 27 (WC) como fonte (jogos ainda não jogados).

## Riscos

- **Amostra rala por jogador** em "só-seleção" (poucos jogos/seleção) → a taxa apoia no prior (shrinkage). Mitigado: o modo misto existe e a prova diz qual presta.
- **Histórico capado a 50/página** → restringir alvos a jogos recentes garante que o alvo e os jogos anteriores cabem na(s) primeira(s) página(s); paginar se preciso.
- **Settlement do BSD vs casa** (definição de stat) → continua sendo risco pré-dinheiro; calibração mede confiabilidade, não settlement.
- **Veredito pode ser "nenhum modo presta" em algum mercado** → resultado honesto válido; aquele mercado não carrega dinheiro na Copa.
