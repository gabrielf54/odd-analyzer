# APIs — valor e investimento (índice)

Uma ficha por API em `docs/apis/<api>.md`. Este índice **não cresce**: cada API nova é um arquivo novo + uma linha aqui.

Critério de impacto (1-10): quanto o dado destrava a meta — achar **valor (EV)** em odds de **Shots on Target (SOT)** por jogador —, **descontando** alternativa grátis. Insumos do produto: **(1) odds SOT** · **(2) stats** · **(3) escalação/minutos** · **(4) persistência**.

## Scorecard

| API | Insumo | Impacto | Menor tier útil | Preço | Ficha |
|-----|--------|:------:|-----------------|-------|-------|
| BSD / Bzzoiro | **stats+lineups+odds partida (bet365/betano/pinnacle)+WC2026 (104 jogos)** | **8/10** (sonda ok) | Free | **$0** | [bsd-bzzoiro.md](bsd-bzzoiro.md) |
| StatsBomb Open Data | stats event-level (backtest offline) | 6/10 | Free | $0 | — (GitHub raw, sem API) |
| API-Football | stats + escalação (2/4) | 9/10 (fallback) | Pro | $19/mês | [api-football.md](api-football.md) |
| Highlightly | stats jogador + WC2026 | a validar | Pro | $9.49/mês | — (a sondar) |
| OddsPapi | odds backup (370 casas, **sem player prop soccer**; redundante c/ BSD) | 4/10 | Free | $0 (250 req/mo) | [oddspapi.md](oddspapi.md) |
| Betfair Exchange | de-vig/CLV margem~0 (BR) | 6/10 | Free | $0 (£499 live key) | [betfair-exchange.md](betfair-exchange.md) |
| The Odds API | odds SOT (casas US) | **3/10** | Free | $0 | [the-odds-api.md](the-odds-api.md) |
| SportsGameOdds | odds SOT da bet365 | **8/10** | Pro | **$299/mês** | [sportsgameodds.md](sportsgameodds.md) |
| Supabase | persistência | **3/10** | Free | $0 | [supabase.md](supabase.md) |

## Ordem de investimento (revisada — workflow 2026-06-02)

**Mudança de doutrina: existe um caminho $0 pra destravar o MVP. Validar ANTES de pagar qualquer coisa.**

> **Atualização (sonda ao vivo 2026-06-02, keys do usuário):** **BSD passou o sanity** — entrega stats de jogador+time, lineups e **odds de partida (bet365/betano/pinnacle/consensus, com `implied_probability` + movimento de linha)** + **WC2026 (league 27, 104 jogos)** num só ID space, grátis. **API-Football $19 provavelmente desnecessário** — falta só **cross-validar a precisão do BSD vs API-Football** (script jogador-a-jogador) antes de dinheiro real. Mercados de partida (gols/vitória/escanteios) = 100% operacionais a $0 contra Pinnacle de-vig; mercados de jogador modelam mas a odd de prop continua sem fonte barata. **OddsPapi** sondado = 370 casas mas **sem player prop de futebol** → redundante c/ BSD, fica backup. Betfair Exchange: **.com bloqueia IP BR** → parqueado (Pinnacle do BSD assume a âncora de de-vig).

0. **$0 — testar o grátis primeiro:**
   - **Stats ao vivo:** **BSD/Bzzoiro** (free, documenta SOT+desarmes+minutos+lineups, 65 ligas incl. WC2026). **Smoke-test obrigatório** contra fonte de verdade antes de confiar (indie, proveniência desconhecida — se entregar número errado em silêncio, o motor de EV gera sinal lixo com falsa confiança).
   - **Backtest offline:** **StatsBomb Open Data** (free, event-level SOT+tackles via GitHub raw JSON, só `requests`). Ressalva: WC2026 não está no repo (só até 2022) → valida em clube/histórico, não na Copa ao vivo.
   - **Odds (mercado de partida, casa BR):** **OddsPapi** free (250 req/mo; Betano BR/KTO/EstrelaBet/Betnacional confirmados) + **Betfair Exchange** free delayed key (margem ~0 = melhor âncora de de-vig/CLV).
1. **API-Football Pro — $19/mês.** Fallback garantido SE o BSD falhar a validação. 3 ângulos confirmam `/fixtures/players` (shots.on, tackles.total, minutos) + lineups + WC2026 (league=1 season=2026) + top-5 + histórico, 7.5k req/dia. Maior confiança da comunidade. Pagar ~1 sem antes (~11/jun).
   - Meio-termo: **Highlightly PRO $9.49/mês** (WC2026 + 950 ligas) — mas SOT/tackles por jogo **não confirmados** nos docs; exige teste ao vivo antes de confiar.
2. **Supabase Free — $0.** Subir p/ Pro ($25) só quando o `paper_ledger` justificar backup gerido.
3. **SGO Pro — $299/mês.** Caro; fecha o loop de EV (bet365). Só com edge já provado.

**Caminho mais barato real:** validar tese + operar mercado de partida da Copa = **$0** (BSD + StatsBomb + OddsPapi + Betfair) · fallback se BSD furar = **$9.49–19/mês** · loop de EV em SOT na bet365 = **~$343/mês**.

> ⚠️ **Buraco que NENHUM dinheiro barato tampa:** odd de **SOT por jogador de casa LEGAL no Brasil NÃO existe** via API a < $99/mês (4 ângulos confirmaram). The Odds API tem o mercado `player_shots_on_target` mas só de casas US e nunca p/ WC2026; SOT da Betfair vive no **Sportsbook** (API só p/ afiliado), não na Exchange; SGO confirma o mercado mas é $99+ e US-cêntrico. Para validar SOT na Copa cedo: **coletar à mão** de betano.bet.br / betfair.bet.br, OU validar o motor contra de-vig de **mercado de partida** (free) e provar CLV ali primeiro. O caminho $0 prova o motor offline — **não** de-risca o edge real em props.

## Riscos cruzados (valem p/ +de uma API)
- **Mismatch de settlement:** SOT da API-Football (feed possível não-Opta) pode ≠ Opta-FIFA da bet365 → **edge ilusório**. Calibrar antes de apostar.
- **Timing de props:** casas postam SOT perto do kickoff → poll próximo ao jogo. *(SGO + The Odds API)*
- **Armadilha `/odds`:** o `/odds` da API-Football é 1X2/totais, **não** player props. Não substitui SGO.

## Exemplos de retorno (referência de dados — para a próxima sessão)

Sondagem ao vivo (2026-06-02) com as chaves do `.env`: shape real dos retornos + dicionário de tipos + anomalias. Use para saber **quais tipos de dado cada API entrega** sem gastar quota redescobrindo.

| API | Referência de dados | Achado-chave da sonda |
|-----|---------------------|-----------------------|
| The Odds API | [the-odds-api.examples.md](the-odds-api.examples.md) | Player props (`player_shots_on_target`/`player_shots`) retornam `bookmakers: []` em **TODA** liga hoje (não só Copa) — só `h2h`/`totals` populados. Jogador só por **nome** (sem `player_id`). Chamada vazia custa **0 crédito**. |
| API-Football | [api-football.examples.md](api-football.examples.md) | Tem o que o modelo precisa: `/fixtures/players` → `shots.{total,on}`, `games.minutes`, **`tackles.{total,blocks,interceptions}`**; `/fixtures/statistics` → `Corner Kicks`/`Total Shots`/`Shots on Goal` por time. `last` bloqueado no Free (usar `from`/`to`). |
| SGO | [sportsgameodds.examples.md](sportsgameodds.examples.md) | Free só dá mercados de **time** (sem player props); `INTERNATIONAL_SOCCER` (Copa) = **HTTP 400** bloqueado. `oddID = statID-entity-period-betType-side`; entrega `fairOdds` (de-vig) + `bookOdds`, ambos **americano string**. |

> **Implicação reforçada:** confirma o blocker — não há odd de SOT por jogador disponível hoje. The Odds API entrega só odds de partida; stats de jogador (SOT/desarmes/minutos) e de time (escanteios) vêm da API-Football.

## Dados da análise (o que o produto consome)

Spec vivo dos **dados que a análise precisa** (schema por jogador/time, fluxo seleção→clube→retrospecto,
receita por mercado, o que entra no prompt, comparação com odds): **[../dados-necessarios-analise.md](../dados-necessarios-analise.md)**. Fonte = BSD (validado ao vivo + conferido no SofaScore).

## Adicionar uma API nova
1. Criar `docs/apis/<nome>.md` a partir do mesmo esqueleto das fichas (headline · papel · tiers · free dá/nega · menor tier · impacto+justificativa · riscos · fontes).
2. Adicionar 1 linha no Scorecard acima e, se mudar prioridade, reordenar a lista de investimento.
3. Regra do impacto: **9-10** essencial sem alternativa grátis · **5-7** essencial mas substituível/barato · **1-4** commodity ou falha no caso central.
