# BSD/Bzzoiro — rotas para CALIBRAÇÃO (exemplos reais)

> Sonda real 2026-06-03 via `scripts/probe_calibration_routes.py` (key do usuário).
> Base `https://sports.bzzoiro.com/api/v2`, auth `Authorization: Token <key>`.
> Os `*.json` desta pasta são respostas reais **trimadas** (listas cortadas em 3 itens).
> Visão geral da API: [../../bsd-bzzoiro.md](../../bsd-bzzoiro.md).

## Por que esta pasta existe

Migrar a calibração de **API-Football → BSD** (decisão do usuário, 2026-06-03): mesmo
ID space do motor de produção, sem player-matching entre fontes, dado garantido pelo dono.
Aqui ficam os exemplos das rotas que o backtest precisa para montar o dataset em dado vivo.

## Rotas que geram valor para calibração

| Rota | Cliente | Para quê | Exemplo |
|------|---------|----------|---------|
| `/events/?league_id=&status=finished` | `client.events(league_id=9, status="finished")` | **Universo de jogos finalizados** (3474 no Brasileirão A). Paginado `limit=50&offset=N`. Ordem = mais recente primeiro. Cada item traz `event_date`, `home_team_id/away_team_id`, placar | [`events_status_finished.json`](events_status_finished.json) |
| `/events/{id}/` | `client.get_event(id)` | Detalhe do jogo. **`event_date`** (ISO) é a chave do join `event_id→data` para ordenar o histórico do jogador | [`event_detail.json`](event_detail.json) |
| `/events/{id}/player-stats/` | `client.event_player_stats(id)` | **ACTUALS** (o que aconteceu): `player_stats[]` (46/jogo) com `player_id`, `minutes_played`, `shots_on_target`, `total_shots`, `total_tackle`, `interception` | [`event_player_stats.json`](event_player_stats.json) |
| `/players/{id}/stats/` | `client.player_stats(id)` | **HISTÓRICO** do jogador p/ montar a rate leave-one-out. Linhas com `event_id` + mesmos campos. **Sem `event_date` na linha** → join via `event_id` | [`player_stats_history.json`](player_stats_history.json) |
| `/events/{id}/stats/` | `client.event_stats(id)` | Stats de TIME (escanteios etc) + shotmap/momentum/xg_per_minute. Para calibrar mercado de partida (escanteios) | [`event_stats_team.json`](event_stats_team.json) |
| `/events/{id}/odds/` | `client.event_odds(id)` | Odds **só de PARTIDA**, consensus flat (1x2/over_under_gols/btts). Ver caveat abaixo | [`event_odds.json`](event_odds.json) |

## Descobertas que mudam o plano

1. **Filtro de finalizado = `status="finished"`** (NÃO `finished=true` nem `season=`; esses não filtram, devolvem os 3692 com `notstarted` no topo). Confirmado: `status=finished` → 3474, primeiro = 7166 `status:"finished"`.

2. **Histórico do jogador não tem data na linha** — só `event_id`. Para leave-one-out cronológico (treinar só com jogos ANTES do alvo) é preciso mapear `event_id → event_date`. Fontes do mapa: a lista `/events/?status=finished` (já traz data + id em lote) ou `/events/{id}/` por jogo.

3. **De-vig de mercado de jogador é impossível retroativo.** `/events/{id}/odds/` de jogo finalizado vem **flat, só consensus, só mercado de partida** — sem player-prop, sem corners, sem Pinnacle, sem movimento. Implicação dura:
   - **Calibração de confiabilidade (Brier/ECE/reliability)** de mercado de jogador = precisa só de `prob_modelo` + `actual`. **BSD entrega os dois → viável agora, offline, $0.**
   - **CLV / validação de edge** = precisa de odd de fechamento daquele mercado. Player-prop não existe barato em lugar nenhum; e mesmo as odds de partida **só populam perto do kickoff** (não há retrospecto). → **CLV tem que ser capturado pra frente (ao vivo), não dá backtest histórico.**

4. **`total_tackle` vem 0 (não null)** quando o jogador não desarmou — mais limpo que API-Football. Bom para a média.

## Como reproduzir

```
.venv\Scripts\python.exe scripts\probe_calibration_routes.py
```
Reescreve os `*.json` desta pasta. Read-only (só GET).
