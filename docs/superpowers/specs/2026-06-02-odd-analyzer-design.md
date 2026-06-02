# odd-analyzer — Design (v1)

> Data: 2026-06-02 · Status: aprovado para implementação
> Ferramenta de **uso pessoal** para achar odds de **valor** (mal precificadas) no mercado de **chutes a gol de jogador (Shots on Target / SOT)**, validada na **Copa do Mundo 2026** e depois escalada para ligas de clube.

---

## 1. Objetivo e princípio

Achar odds em que a casa **errou o preço** de uma linha de SOT de jogador — e só sinalizar quando há **valor real**, não quando a probabilidade é alta.

**Definição de valor (inegociável):**

```
valor existe  ⟺  prob_do_modelo  >  prob_justa_da_casa (de-vig, sem margem)
edge = prob_modelo − prob_devig
EV   = prob_modelo × odd_decimal − 1
```

Filtramos por **edge/EV positivo**, **nunca** por "probabilidade alta". Probabilidade alta e valor são dimensões ortogonais: um favorito a 75% precificado pela casa em 80% é aposta **perdedora** (EV negativo). Filtrar por prob alta enviesa a seleção para favoritos eficientemente precificados — exatamente onde a casa já tirou o valor.

A IA **não inventa o número**: a probabilidade vem de cálculo estatístico em código. A IA entra no fim como **analista** que lê os números prontos e decide/explica (ver §7).

**Filosofia de produto:** poucas oportunidades, todas fortes. "Nenhuma oportunidade clara" é uma resposta correta e esperada na maioria dos jogos.

---

## 2. Escopo v1

**Entra:**
- Um único mercado: **SOT de jogador**, pré-jogo.
- Competição: **Copa do Mundo 2026** (arena de validação).
- Lista de jogos → análise sob demanda de um jogo → candidatos de valor → recomendação da IA.
- Arnês de validação (paper-trade + calibração + CLV).
- Dashboard mínimo (sem capricho visual).

**NÃO entra (vai pro planner — §13):** desarmes, faltas, apostas ao vivo, line-shopping entre casas, ligas de clube (Fase 3), UI sofisticada.

---

## 3. Decisões travadas (com o porquê)

| Decisão | Escolha | Por quê |
|---|---|---|
| Mercado v1 | SOT de jogador | Pedido do usuário; dado farto e Opta-alinhado com settlement. |
| Definição de valor | edge/EV de-vig, não prob alta | Prob alta ≠ EV+; filtrar por prob alta gera -EV sistemático. |
| Modelo | Binomial Negativa + shrinkage + minutos + adversário | SOT é overdispersed; minutos é o maior driver; média bruta é insuficiente. |
| Papel da IA | Analista final sobre números do código | Dá a recomendação pedida sem deixar o LLM fazer conta (alucina). |
| Objetivo | Uso pessoal, apostar de verdade | Sem compliance de loja; foco em estar correto. |
| Sequência | Validar (grátis) antes de pagar/apostar | Bater SOT é difícil; não queimar dinheiro numa tese não comprovada. |
| Banco | Supabase (Postgres) | Hospedado, JSONB, editor de tabelas, escala pra Fase 3. |
| Stack núcleo | Python | `soccerdata`, `scipy`/`statsmodels`, `rapidfuzz` são Python. |

---

## 4. Achados de pesquisa que moldam o design

Pesquisa web em 2026-06-02 (fontes em §12).

### 4.1 Odds — fonte resolvida: SportsGameOdds, casa = bet365
- **bet365** é a única casa que satisfaz as três condições: (a) legal no Brasil (licenciada SPA, Lei 14.790/2023), (b) oferece mercado de SOT, (c) é lida por API rastreável.
- **SportsGameOdds (SGO)** expõe `statID=shots_on_target` no padrão `oddID = {statID}-{playerID}-{periodID}-{betTypeID}-{sideID}` (ex.: `shots_on_target-PLAYER_ID-game-ou-over`), cobre bet365 + Pinnacle + casas US, e inclui player props **em todos os planos**.
- **The Odds API foi descartada** para este caso: player props de futebol só de casas US e em 6 ligas de clube — sem Copa, sem casa brasileira.
- **Custo:** validação roda **de graça** no tier Amateur lendo casas US (DraftKings/FanDuel). **bet365 exige o plano Pro (~$299/mês**; mês-a-mês ~$149 — confirmar em `/pricing`). Cobrança por "object" = item retornado.
- **Risco residual:** a presença concreta de SOT por jogador em jogos da Copa sob `leagueID=INTERNATIONAL_SOCCER` **não foi confirmada ao vivo** (sinal histórico forte: DraftKings teve SOT na Euro 2024 e já lista SOT da Copa 2026). → **Verificar com chave grátis na Fase 0.**

### 4.2 🚨 Dados de estatística — FBref perdeu o Opta (20/jan/2026)
- A Stats Perform cortou o feed do FBref (após fechar exclusividade com a FIFA para dados de aposta). **xG e métricas avançadas sumiram** do FBref gratuito.
- **Se chutes/SOT por jogador sobreviveram como stat "básica" não foi confirmado.** Esta é a peça que sustenta o modelo. → **Verificar numa página de shooting do FBref ao vivo na Fase 0.**
- **Fallback** se SoT não sobreviveu: **Sofascore / Understat / WhoScored** via `soccerdata`.
- **Boa notícia:** a definição de SOT do FBref (Opta) é **idêntica** à do settlement das casas (bet365/Betfair settlam em Opta). Ressalva: o settlement da Copa usa o feed Opta-FIFA ao vivo, enquanto as base rates seriam FBref-Opta pré-20/jan — mesma definição, proveniência diferente. Variância irredutível de Opta (chute vs cruzamento, bloqueio do último defensor) adiciona ruído de settlement.

### 4.3 Escalação — janela apertada
- API-Football (`league=1, season=2026`): escalação **20-40 min antes** do apito (quando a competição é coberta; endpoint atualiza a cada ~15 min). Sportmonks: oficial **~60 min antes**.
- Casas **suspendem/reprecificam/anulam** player props quando o team news sai (~1h antes); regras de void variam por casa.
- **Conclusão:** XI confirmado é melhor usado como **filtro de risco** (confirmar titularidade) do que como gatilho com folga de tempo. Contar com poucos minutos úteis.

### 4.4 Modelagem — abordagem correta, edge fino
- NegBin + shrinkage + minutos esperados + proxy de adversário é a abordagem **padrão e correta**.
- Força de seleção: usar **Elo** (não ranking FIFA bruto). Adversário SOT-concedido: combinar Elo + xGA/chutes-concedidos do ciclo + agregado defensivo de clube, todos encolhidos para uma baseline.
- **Edge é fino e frágil**, não máquina de dinheiro: minutos pré-escalação são o maior vazamento; SOT-concedido por seleção tem erro grande; SOT de craques é mercado dos mais batidos; settlement Opta é ruidoso.
- **Pitfalls da Copa:** jogos de grupo decididos (rodada 3 do formato de 48 = rotação pesada); prorrogação (props geralmente liquidam em 90 min — confirmar por casa); calor/midday em 6 sedes quentes (ajuste pra baixo); altitude Cidade do México (~2.240m); estilo por confederação (rates de clube são majoritariamente europeus); cold-start (encolher forte no início).

### 4.5 Legal / casas
- Mercado regulado no Brasil pela SPA (Lei 14.790/2023, vigente desde 01/jan/2025); bet365, Betano, Superbet, KTO, Bet7k, Esportes da Sorte e Pinnacle estão licenciadas.
- Uso pessoal, sem distribuição → **sem regras de loja de app** (+18/disclaimer/geo não se aplicam ao produto). ToS da SGO: exibir/usar OK; revender/redistribuir o feed bruto é proibido (irrelevante para uso pessoal).
- FBref ToS proíbe uso comercial/recriar base e impõe ≤10 req/min com anti-bot (403). Uso pessoal leve, com cache e rate limit respeitoso, é o caminho.

---

## 5. Arquitetura e componentes

Abordagem: **pipeline magro em Python + arnês de validação + dashboard mínimo**. Cada componente é uma unidade isolada e testável.

```
[Streamlit UI] → escolhe jogo
      │
      ▼
[Orquestrador] (carregamento lazy de UM jogo)
      ├─ (1) Ingestão/Cache ──→ odds (SGO) · escalação (API-Football) · taxa-base clube (cache) · Elo
      ├─ (2) Crosswalk de jogador (fail-closed)
      ├─ (3) Motor do modelo (puro/determinístico)
      ├─ (4) Filtro de candidatos (edge/EV/XI/amostra)
      ├─ (5) IA analista (decide melhor aposta + explica)
      └─ (6) Arnês de validação (grava no paper_ledger)
      │
      ▼
[Supabase (Postgres)]  ←→  análises · crosswalk · paper_ledger · stats_clube · times_forca
```

| # | Componente | O que faz | Depende de |
|---|---|---|---|
| 1 | **Ingestão/Cache** | Puxa e persiste odds, escalação, stats de clube e Elo, respeitando rate limits. Lista de jogos em cache de memória (5-10 min). | SGO, API-Football, soccerdata, fonte Elo, Supabase |
| 2 | **Crosswalk de jogador** | Liga o jogador da odd ao da base de stats. NFKD→ASCII + `rapidfuzz` + tabela manual dos ~1.250 convocados. **Fail-closed**: sem match confiável, descarta (nunca chuta). | Supabase (`jogadores_crosswalk`) |
| 3 | **Motor do modelo** | Funções puras: estima λ, gera P(SOT≥linha) via NegBin, faz de-vig, calcula edge/EV. Sem efeitos colaterais → testável. | scipy/statsmodels |
| 4 | **Filtro de candidatos** | Mantém só `edge>corte E EV>corte E XI_confirmado E amostra≥piso`. | — |
| 5 | **IA analista** | Recebe candidatos + contexto, compara, escolhe a melhor aposta, dá veredito+confiança+explicação. Proibida de inventar número/fato (§7). | provedor LLM |
| 6 | **Arnês de validação** | Grava (prob, linha no flag, linha de fechamento, resultado) → calibração + CLV + Brier. Portão antes de dinheiro real. | Supabase (`paper_ledger`) |
| 7 | **UI (Streamlit)** | Lista de jogos → "Analisar" → candidatos + chamada da IA + status de validação. | tudo acima |

---

## 6. Motor do modelo (detalhe)

1. **Minutos esperados:** `min_esp = P(titular) × E[min | titular]`. Sem XI confirmado em jogos de rotação provável (ex.: rodada 3 decidida), **não emite sinal**.
2. **Lambda (taxa esperada de SOT na partida):**
   ```
   λ = sot90_clube × (min_esp / 90) × mult_adversário × ajustes_contexto
   ```
   - `sot90_clube`: SOT/90 do jogador no clube, com **shrinkage bayesiano** para um prior por posição/tier de liga (amostra pequena → encolhe forte).
   - `mult_adversário`: blend de Elo + xGA/chutes-concedidos do ciclo + agregado defensivo de clube, encolhido para baseline do torneio.
   - `ajustes_contexto`: calor/midday (↓), altitude (↓/estrutural), estilo por confederação.
3. **Distribuição:** **Binomial Negativa** (overdispersion; testar VMR — se ≈1, Poisson serve) → `P(SOT ≥ linha) = 1 − CDF(linha−1)`.
4. **De-vig:** remover a margem da linha over/under (2-way) — **multiplicativo** como base, **power method** como checagem; usar o pior caso para EV conservador.
5. **Edge/EV:** `edge = prob_modelo − prob_devig`; `EV = prob_modelo × odd − 1`.
6. **Incerteza:** propagar incerteza de parâmetro (intervalo de credibilidade), não só ponto; suprimir sinal quando a amostra efetiva é baixa.

---

## 7. Camada de IA analista

A matemática (prob, de-vig, edge, EV) é **sempre** do código. A IA é um analista lendo um dossiê pronto.

**Entrada (JSON, tudo calculado em código):**
```json
{ "jogo": "...", "mercado": "SOT", "candidatos": [
  { "jogador":"", "linha":"≥2 SOT", "odd":2.10, "prob_modelo":0.55,
    "prob_devig":0.46, "edge":0.09, "ev":0.155, "lambda":1.9,
    "minutos_esperados":88, "xi_confirmado":true, "amostra_jogos":24,
    "sot_concedido_adversario":"alto", "incerteza":"média" } ] }
```

**Saída (JSON):**
```json
{ "melhor_aposta": { "jogador":"", "linha":"", "veredito":"APOSTAR", "confianca":"alta", "motivo":"" },
  "outras": [], "alertas": [] }
```

**Núcleo do prompt:** analista conservador; usar **só** os números dados; **nunca** inventar número/stat/lesão; só "APOSTAR" se `edge>0 E EV>corte E xi_confirmado E amostra≥piso`; comparar e indicar a melhor; na dúvida, não recomendar; explicar em 1-2 frases ancoradas só nos campos recebidos; responder **apenas** em JSON. Saída validada por schema; se inventar campo, rejeita e re-tenta.

---

## 8. Esquema do banco (Supabase / Postgres)

- **`analises`** — `event_id`, `jogo`, `data`, `ttl`, `candidatos jsonb`, `llm_resultado jsonb`. Cache do resultado de um jogo (serve do cache se reabrir dentro do TTL).
- **`jogadores_crosswalk`** — `id_canonico`, `nome_normalizado`, `fontes_ids jsonb`, `confianca`, `verificado_manual bool`.
- **`paper_ledger`** — `event_id`, `jogador`, `linha`, `odd_flag`, `prob_modelo`, `prob_devig`, `edge`, `ev`, `linha_fechamento`, `resultado`, `clv`, `criado_em`. **Coração da validação.**
- **`stats_clube`** — `jogador_id`, `sot_90`, `jogos_amostra`, `fonte`, `atualizado_em`. Evita re-scrapear o FBref.
- **`times_forca`** — `time`, `elo`, `xga_ciclo`, `atualizado_em`.

Não guardamos: calendário completo, odds de jogos não analisados, histórico bruto. Cache curto da lista de jogos fica em memória. Service key no `.env`, fora do git.

---

## 9. Fluxo de dados (lazy)

1. App pede a lista de jogos da Copa à SGO → cache de memória (5-10 min), não persiste.
2. Usuário clica num jogo → puxa **só para aquele jogo**: odds de SOT (SGO) + escalação (API-Football) + lê taxa-base de clube cacheada.
3. Crosswalk → modelo → filtro → candidatos.
4. Usuário clica "Buscar oportunidades" → IA analista decide a melhor aposta + explica.
5. Grava no `paper_ledger` (modo paper) e cacheia a análise (`analises`).
6. Mostra candidatos + recomendação, ou "nenhuma oportunidade clara".

---

## 10. Fases (de-risk primeiro)

| Fase | O que | Portão de saída | Custo |
|---|---|---|---|
| **0 — Spike** | Provar com chave grátis que (a) SGO retorna SOT da Copa e (b) FBref/alternativa tem SoT por jogador. | Se ambos falharem → parar/pivotar. | $0 |
| **1 — Modelo + validação** | Pipeline completo em **modo paper** na Copa; medir calibração + CLV + Brier. | Calibração boa **e** CLV positivo consistente. | $0 |
| **2 — Ao vivo** | Pagar SGO Pro, ler bet365, apostar pequeno (0.5-1u), seguir logando. | — | ~$299/mês |
| **3 — Escala** | Ligas de clube (dado mais rico), pós-Copa. | — | — |

**Não pular fases.** Sem Fase 1 com CLV positivo, não há dinheiro real (Fase 2). Backtest de torneios passados (Copa 2022, Euro 2024) antes de apostar, se houver dado.

---

## 11. Riscos e mitigações

| Risco | Severidade | Mitigação |
|---|---|---|
| FBref sem SOT por jogador (pós-Opta) | alto | Fase 0 verifica ao vivo; fallback Sofascore/Understat/WhoScored. |
| SGO não traz SOT da Copa | alto | Fase 0 verifica com chave grátis antes de qualquer build/pagamento. |
| Crosswalk de jogador errado (join silencioso) | alto | Normalização + fuzzy + tabela manual; **fail-closed**, log de auditoria. |
| Janela de escalação curta / props suspensos | médio | XI como filtro de titularidade; aceitar poucos minutos úteis; ler regras de void. |
| Edge fino / variância alta | médio | Banca 0.5-1u; só apostar acima de corte folgado; validar por CLV antes. |
| LLM alucina | médio | IA só lê números do código; saída validada por schema; sem fato fora do payload. |
| Custo SGO Pro antes de provar edge | médio | Fase 0/1 inteiras de graça; pagar só na Fase 2. |
| Settlement Opta ruidoso | baixo | Definição de SOT = Opta nas base rates; tratar como variância irredutível. |

---

## 12. Itens a verificar empiricamente (Fase 0 — antes de codar o resto)

1. Chave grátis SGO → consultar um jogo real da Copa com `leagueID=INTERNATIONAL_SOCCER` filtrando `oddID` `shots_on_target-*-game-ou-over/under`; confirmar que retorna odds (DraftKings/bet365).
2. Abrir página de shooting do FBref ao vivo → confirmar se `Sh`/`SoT` por jogador ainda populam pós-20/jan/2026.
3. API-Football `/leagues` → confirmar `coverage.fixtures.lineups=true` para `league=1, season=2026`.
4. Confirmar preço vigente da SGO em `/pricing` e estimar volume de "objects".

---

## 13. Fora de escopo (planner futuro)

Desarmes (o diferencial, mercado mais mole) · faltas (exige fator-árbitro) · line-shopping · apostas ao vivo · UI sofisticada · ligas de clube (Fase 3) · backtesting histórico automatizado.

---

## 14. Referências (pesquisa 2026-06-02)

- SportsGameOdds: docs/markets/pricing — sportsgameodds.com/docs, /pricing, /bookmakers
- The Odds API (descartada): the-odds-api.com/sports-odds-data/betting-markets.html, /bookmaker-apis.html
- API-Football lineups: api-football.com/documentation-v3
- FBref/Opta removal: sports-reference.com/blog/2026/01/fbref-stathead-data-update, awfulannouncing.com
- soccerdata: soccerdata.readthedocs.io, github.com/probberechts/soccerdata
- Opta SOT definition: theanalyst.com/articles/opta-football-stats-definitions, help.bet365.com/s/en/sports/soccer-stats-markets
- Devig: Clarke & Kovalchik 2017 (power method); pena.lt/y/2025/09/14
- EV vs prob / CLV: betstamp, oddsindex, unabated.com, vsin.com
- Elo > FIFA rank: Hvattum & Arntzen 2009 (sciencedirect); en.wikipedia.org/wiki/World_Football_Elo_Ratings
- WC heat/altitude: espn.com club-world-cup-heat, ftnnews.com 2026-world-cup heat-humidity-altitude
- Brasil regulação SPA: igamingbrazil.com, lance.com.br/sites-de-apostas/bets-autorizadas.html
