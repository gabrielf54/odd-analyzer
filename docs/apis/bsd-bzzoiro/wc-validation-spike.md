# Spike de viabilidade — calibrar/validar o motor para a COPA (seleções)

> Sonda ao vivo 2026-06-03 (8 dias antes do dinheiro real em 11/06). Scripts:
> `scripts/probe_wc_validation.py` + `scripts/probe_wc_history.py` (só GET, reproduzíveis).
> Dumps reais em `examples/wc_*.json`.

## Pergunta

O motor foi calibrado em **liga 9 (Brasileirão, CLUBES)**. A Copa é **SELEÇÕES** →
shift de população (estilo, ritmo, menos jogos/seleção). Dá pra **validar na população
certa** antes de apostar dinheiro, ou estaríamos confiando cego numa calibração de clube?

## Veredito: VIÁVEL — e melhor que o temido

O BSD tem **dado rico de SELEÇÃO, finalizado, com player-stats completos**, no MESMO
ID-space e formato da liga 9. Dá pra rodar **exatamente o mesmo backtest leave-one-out**
apontado para a população de seleções. A ameaça de população **deixa de ser bloqueio e
vira algo mensurável/mitigável**.

## Achados duros

### 1. Universo de SELEÇÃO finalizado com actuals (player-stats 46/jogo, mesmos campos)

Todas as ligas abaixo retornam `status=finished` com `player_stats[]` populado
(`player_id, minutes_played, shots_on_target, total_shots, total_tackle, interception, ...`):

| liga_id | competição | finished | recência | relevância p/ Copa |
|---------|-----------|----------|----------|--------------------|
| 58 | World Cup Qualification UEFA | 204 | 2026-03 | **alta** (seleções europeias da Copa) |
| 59 | World Cup Qualification CONMEBOL | 90 | 2025-09 | **alta** (Brasil, Argentina, Uruguai…) |
| 60 | World Cup Qualification CAF | 260 | 2025-11 | alta (africanas) |
| 61 | World Cup Qualification AFC | 225 | 2025-11 | alta (asiáticas) |
| 62 | World Cup Qualification CONCACAF | 100 | 2025-11 | alta (México, EUA…) |
| 64 | UEFA Nations League | 187 | 2026-03 | alta (seleções europeias, jogo recente) |
| 65 | CONCACAF Nations League | 110 | 2025-03 | média |
| 31 | International Friendly Games | 147 | **2026-06-03 (hoje)** | **alta** (amistosos pré-Copa, populando AGORA) |
| 66 | UEFA Euro 2024 | 51 | 2024-07 | média (mesmos jogadores, torneio) |
| 67 | Copa America 2024 | 32 | 2024-07 | alta (Sul-América, torneio) |
| 30 | Africa Cup of Nations 2023 | 104 | antigo | **0 player-stats** (não usar) |

> Soma: **>1300 jogos de seleção finalizados com stats**. Amostra de calibração de seleção
> farta — não precisa cair pra clube.

### 2. Histórico do jogador é montável na população certa

`/players/{id}/stats/` (ex.: pid 3724, 8135): **paginado** (`count`/`next`; 50 linhas/página),
cada linha tem `event_id` + **`team_id`** + todos os campos de stat. **Não tem campo de liga/
competição na linha**, MAS o **`team_id` separa clube de seleção** (pid 3724: team 125=clube
38 jogos, 932/197=outros; pid 8135: 272 + 480). E a API devolve **mais-recente-primeiro** →
"forma recente excluindo o jogo-alvo" (leave-one-out) sai por filtro de `event_id`, **sem
precisar do mapa de datas** para a janela recente.

### 3. Sinal confirma o shift de população (por isso re-calibrar importa)

Jogos de seleção têm **muito menos finalização** que o Brasileirão: Kosovo×Türkiye
SOT soma=5 (22 titulares); Chile×Uruguai SOT soma=6. Confirma que **NÃO dá pra reusar a
calibração da liga 9 cega** — mas dá pra **re-calibrar aqui**, que é o ponto.

### 4. Liga 27 (World Cup 2026)

`count=248` eventos; amostra `notstarted` com nomes-placeholder de chave (`W101`,`L102` =
vencedor/perdedor de mata-mata → confronto ainda não sorteado). `finished count=144`
(provável dado histórico/legado sob o mesmo id — **não confiar como Copa-2026 real**).
**Odds de PARTIDA já populadas** num evento futuro (`event_odds` retornou preenchido 6 semanas
antes) — bom p/ CLV-forward de mercado de partida mais tarde. **Lineup `unavailable`** (popula
perto do kickoff, esperado). `/players/?national_team_id=` deu **vazio** para o placeholder
de chave (team_id não é seleção real) — usar seleção real (das eliminatórias) até o sorteio.

## Implicação para o plano (8 dias)

1. **Calibração-Copa é viável agora, offline, $0.** Reusar `backtest/collect_bsd.py` +
   `run_bsd_backtest.py` apontando para as ligas de seleção (58/59/64/31/66/67…) →
   Brier/ECE/BrierSkill na **população certa**. Decisão honesta por mercado, como na liga 9.
2. **Decisão de design da rate:** histórico misto (clube+seleção) vs só-seleção (filtro
   `team_id`). Testar os dois; o backtest diz qual calibra melhor p/ prever jogo de seleção.
3. **`concede_baseline` de seleção** ≠ liga 9 (menos finalização). Re-medir com
   `scripts/measure_concede_baseline.py` apontado para liga de seleção.
4. **Amistosos (liga 31) populando agora** = amostra forward fresca até o dia 11.
