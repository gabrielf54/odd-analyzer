# Coleta automática de odds de casas (casas moles) — spec v1

> **Estado:** PENDENTE (não implementado). Doc de brainstorming → vira plano de implementação no próximo chat.
> **Data:** 2026-06-13 · **Escopo:** prop de jogador (foco) + partida (line shopping extra) das 4 casas moles BR.
> **Regra do repo:** isto vive em `docs/features/` só enquanto a feature não shipou. Ao mergear: mover a essência pro `docs/CORE.md` §3 e **apagar esta pasta** (git preserva).

---

## 0. Resumo em uma frase

Hoje a odd entra **manual** (gero um prompt, colo no Claude do Chrome que captura UMA casa, colo o JSON de volta). O v1 troca isso por: o backend **busca sozinho** a odd de **prop de jogador** nas 4 casas moles (Betano, Superbet, Betnacional, KTO) **quando eu analiso o jogo**, normaliza, e deixa o motor atual achar valor no **melhor preço** entre as casas.

---

## 1. O QUE EU QUERO (objetivo do dono)

- **Parar de coletar à mão.** Coleta interna, a aplicação busca.
- **Prop de jogador é o coração — não abro mão.** SOT, finalizações, desarmes (estrela) + faltas, passes (diagnóstico).
- **O diferencial é VÁRIAS casas.** A mesma linha varia muito entre casas (vi bet365 1.20 vs betano 1.65 no mesmo passe). Comparar casas = pegar odd boa = **line shopping**.
- **O modelo decide, a casa é só o preço a bater.** Caça o melhor preço; aposta na casa que paga mais.

---

## 2. O QUE APRENDEMOS (as paredes duras — não re-pesquisar)

1. **Não existe API barata de prop de jogador de casa BR.** 7 rodadas de pesquisa + teste ao vivo (ver `memory/apis-pesquisadas-odds-stats` e `docs/apis/`): prop de jogador de casa BR-legal, automático, multi-casa, **não existe por API < $99/mês**. BSD (grátis) só dá **mercado de partida** (17 casas). The Odds API só dá prop de casa **US**, liga de clube, nunca Copa. bet365 com prop = só SGO **Pro $299/mês**.
2. **Logo: a única via barata pra prop multi-casa é coletar a gente mesmo.** Não é escolha de gosto — é a única porta.
3. **JSON interno > ler a tela.** Bater no endpoint JSON que o próprio site da casa usa por baixo (dado estruturado, estável) é melhor que scraping de DOM (frágil, quebra quando muda layout). **É scraping**, mas o tipo bom. **Não é API oficial/autorizada** → ToS-cinza (uso pessoal, odd pública, volume baixo — risco assumido, não ignorado).
4. **bet365 fica FORA do v1.** É a casa mais blindada da indústria (WebSocket criptografado + fingerprint + geoblock). Server-side puro = guerra de manutenção. **E** é casa **sharp** → quase nunca dá valor (o valor mora na casa mole). Pior troca de esforço que existe. Continua **manual** (o fluxo do Chrome que já existe), como fallback.
5. **A dispersão entre casas é REAL** (não há "validador de diferença fake"). Nasce de (a) modelo/trader diferente e (b) margem diferente. Provado nos testes de hoje (§12).
6. **Normalização é vida-ou-morte.** A casa escreve a mesma aposta de N jeitos (`2+`, `+1,5`, `Mais de 1.5`) e mercados que PARECEM iguais são DIFERENTES (`faltas cometidas` ≠ `faltas sofridas`; `chutes a gol`=SOT vs `finalizações`=chutes totais). Errar isso = motor come laranja achando que é maçã = **EV fantasma = dinheiro perdido**.
7. **Em prop de jogador NÃO há âncora sharp.** Pinnacle/Betfair não cotam esses props barato; bet365 saiu. Então **o MODELO é o juiz do "justo"** — as casas são só o preço a bater. (Em **partida** há âncora: Pinnacle via BSD.)

---

## 3. DECISÕES TRAVADAS

| # | Decisão | Escolha | Porquê |
|---|---------|---------|--------|
| 1 | **Gatilho** | **Sob demanda, junto da análise** | Escolho o jogo no front → backend busca as odds das casas pra aquele jogo, sem colar JSON. Sem scheduler. |
| 2 | **Casas v1** | **Betano, Superbet, Betnacional, KTO** | Já validadas à mão (têm os mercados). Funcionou → adiciona mais no mesmo molde. |
| 3 | **Uso das N odds** | **Modelo decide + caça melhor preço** | De-viga cada casa, valor = modelo vs melhor preço (line shop). Dispersão entre casas = detector de mentira (outlier extremo = avisa, não aposta cego). |
| 4 | **CLV / fechamento** | **Fora do v1** | Decorre do #1 (sem captura de fechamento). Loop forward trata CLV à parte. |
| 5 | **Bloqueio de casa** | **Pula e avisa** | Coleta as que deram certo, marca a bloqueada como "sem odd", avisa. Nunca trava a análise por 1 casa. |
| 6 | **Mercados** | **Prop (SOT/fin/desarmes/faltas/passes) + partida** | Prop = foco. Partida (gols/resultado/escanteios) = **fetch dedicado** das 4 (line shopping onde a BSD não cobre superbet/KTO/betnacional). |
| 7 | **bet365** | **Fora do v1, manual como fallback** | Ver §2.4. |

---

## 4. DESENHO / ARQUITETURA

### 4.1 Fluxo (sob demanda)

```
Escolho jogo no front
  → backend pega event_id (BSD) + jogadores-candidato (do motor)
  → para cada casa [Betano, Superbet, Betnacional, KTO]:
        acha o jogo na casa (times + data)
        acha o jogador (nome, fail-closed)
        puxa odds de prop (e de partida, fetch dedicado)
  → NORMALIZA cru → linha canônica
  → FALHA-ALTO: descarta o que não bate definição → linhas_rejeitadas
  → grava na tabela `odds` (book='betano'|'superbet'|...)
  → motor atual: de-vig + modelo + EV, agora sobre o MELHOR preço entre casas
  → marca valor (estrela só em mercado/linha validado por população)
```

### 4.2 O grande achado: o coletor NÃO reinventa nada

O fluxo manual de hoje (`src/manual/schema.ts::parseManualOdds`) **já tem** tudo que o coletor precisa entregar:
- **A forma da linha:** `{ market_type, entidade, linha, odd_over, odd_under, book }` (idêntica à tabela `odds`).
- **O falha-alto:** `linhas_rejeitadas[]` (linha crua + motivo) — o operador inspeciona o que veio torto; **o que não passa nunca entra no money-path**.
- **A coluna `book`** já é multi-casa (PK inclui `book`).

➡️ **O coletor só gera AUTOMATICAMENTE o mesmo `odds[]` que hoje eu colo à mão, por casa.** Tudo a jusante (validação → store → de-vig → motor → valor) **já existe e não muda**. O fluxo manual continua vivo como fallback (bet365, ou quando uma casa cair).

### 4.3 Camadas novas (Ports & Adapters — segue o padrão do repo)

| Peça | Tipo | Responsabilidade | Depende de |
|------|------|------------------|-----------|
| `OddsCollector` | **porta** (interface) | Dado (event_id + jogadores), devolve linhas cruas por casa | — |
| `BetanoAdapter`, `SuperbetAdapter`, `BetnacionalAdapter`, `KtoAdapter` | adapter | Sabe o **endpoint JSON** e o **formato cru** daquela casa; HTTP injetável (testável offline) | `get`/`post` injetados |
| `OddsNormalizer` | **função pura** | Cru da casa → `{market_type, entidade, linha, odd_over, odd_under, book}` canônico. **O coração.** | tabelas de-para (§5) |
| Matching de jogo + jogador | função pura | Casa o jogo (times+data) e o jogador (nome, **Dice, fail-closed**, igual `jogadores_crosswalk`) | — |

O **domínio não importa** `fetch`/`express`/`supabase` (regra do repo). Adapters recebem HTTP por injeção → testes rodam offline com fixtures do JSON cru de cada casa.

---

## 5. NORMALIZAÇÃO (o coração) — checklist de-para

Mapear o cru da casa para as **chaves canônicas de `src/model/markets.ts`** (fonte de verdade — `MARKET_KEYS`). Hoje: `sot`, `finalizacoes`, `desarmes`, `faltas`, `passes` (jogador); `escanteios`, `gols`, `vitoria` (partida).

### 5.1 Linha (notação → chave única)

Regra geral: **`N+` = `≥N` = over `(N−0.5)`**. Sempre lado **over** (a casa cota o over do prop).

| A casa escreve | Vira `linha` (over) | Observação |
|----------------|---------------------|------------|
| `0,5+` / `1+` | 0.5 | "1 ou mais" = over 0.5 |
| `+1,5` / `Mais de 1,5` / `2+` | 1.5 | "2 ou mais" = over 1.5 |
| `+2,5` / `Mais de 2,5` / `3+` | 2.5 | "3 ou mais" = over 2.5 |

⚠️ **Cuidado com `+2` / "Mais de 2" puro** — pode ser `≥2` (=over 1.5) OU `>2` (=over 2.5) dependendo da casa. **Confirmar por casa na Fase 0**; na dúvida, **rejeitar**.

### 5.2 Mercado (rótulo da casa → chave canônica + o que a casa LIQUIDA)

A chave certa importa porque o motor liquida pelo `settle_field` (o que a casa paga), não pela base interna:

| Rótulo típico da casa | Chave canônica | Casa liquida (`settle_field`) | Armadilha |
|-----------------------|----------------|-------------------------------|-----------|
| "Chutes a gol" / "Finalizações no alvo" | `sot` | `shots_on_target` | **≠** finalizações totais |
| "Finalizações" / "Chutes" (totais) | `finalizacoes` | `total_shots` | **≠** chutes a gol |
| "Desarmes" | `desarmes` | `won_tackle` (desarmes **ganhos**) | casa paga o ganho, não a tentativa |
| "Faltas cometidas" | `faltas` | `fouls` | **`faltas sofridas` NÃO é `faltas`** → rejeitar |
| "Passes (certos)" | `passes` | `total_pass` | mercado **escada** (`ladder:true`) — cota N+ crescente; usa `src/value/ladderDevig.ts` |

### 5.3 Jogador

Nome da casa → `entidade`/id via **coeficiente de Dice (bigramas), fail-closed** (na dúvida descarta — no máximo perde um jogador, nunca casa errado). Reusa o padrão de `jogadores_crosswalk`.

### 5.4 Regra anti-armadilha (o detector de mentira)

Mesmo evento canônico (mesmo jogador + mercado + linha) divergindo **demais** entre casas (acima de um limiar a calibrar) → **marca pra revisão**, não confia cego. É **ou valor real, ou bug de normalização** (a armadilha das faltas, §12). Surge como aviso, não como aposta automática.

---

## 6. FALHA-ALTO (guarda-corpo) — reusa `linhas_rejeitadas`

O normalizer alimenta a MESMA validação do `parseManualOdds`. Descarta a linha (→ `linhas_rejeitadas` com motivo, loga) se:
- `odd_over ≤ 1.01` ou `odd_under ≤ 1.01` (absurda);
- `market_type` desconhecido (fora de `MARKET_KEYS`);
- mercado de jogador sem `entidade` ou sem `linha`;
- mercado de partida (totais) sem os dois lados ou sem linha (precisa pra de-vig);
- jogador não casou (Dice abaixo do threshold);
- mercado/linha ambíguo (ex.: `+2` indefinido, "faltas" sem saber se cometidas).

**Nunca empurra lixo pro motor.** Odd errada em silêncio = EV fantasma = dinheiro perdido (mesmo princípio que o repo já grita sobre proveniência de dado).

---

## 7. STORAGE — tabela `odds` (JÁ PRONTA, não mexer no schema)

`src/store/schema.sql` (migração `create_odds_table`, 2026-06-10):

```sql
odds (
  event_id text, entidade text, market_type text, linha numeric,
  odd_over numeric not null, odd_under numeric,
  book text not null default 'manual', coletado_em timestamptz default now(),
  primary key (event_id, entidade, market_type, linha, book)
)
```

- `book` recebe o slug da casa (`betano`/`superbet`/`betnacional`/`kto`); `manual` segue pro fallback.
- `entidade` = nome do jogador (prop) ou `"partida"` (mercado de partida).
- PK com `book` → as 4 casas coexistem na mesma linha. **Fonte de verdade das odds** (sobrevive a localStorage/cache do front).

---

## 8. DESCOBERTA POR CASA (Fase 0 — 1º passo da implementação)

Pra cada casa, achar e documentar o endpoint JSON antes de escrever o adapter. **Receita:**

1. Abrir a casa no jogo-alvo (logado, IP BR), ir na aba de prop do jogador.
2. DevTools → **Network** → filtrar **XHR/Fetch** → achar a request que devolve o JSON com a odd do prop.
3. Documentar numa ficha por casa: **URL** · **parâmetros** (id do jogo, id do mercado) · **auth** (cookie/token? precisa sessão?) · **shape da resposta** (onde moram jogador + linha + odd over/under) · precisa **JS render** ou bate "pelado"?
4. Repetir pro endpoint de **partida** (decisão #6 = fetch dedicado).

Saída = 4 fichas → alimentam os 4 adapters. **Sem isso o adapter é chute.** (Os testes manuais de hoje, §12, já provam que os mercados existem nessas casas — falta só o endpoint.)

---

## 9. BLOQUEIO · CUSTO · ToS

- **Bloqueio (decisão #5):** casa deu Cloudflare/geoblock → **pula, marca "sem odd", avisa**, segue com as outras. Sem unblocker automático no v1.
- **Custo alvo: $0.** JSON interno é grátis. **Se** uma casa específica bloquear e eu quiser recuperá-la depois, a opção barata é **unblocker pago-por-uso** (Bright Data Web Unlocker, ~$1,5/1k req, sem piso mensal — cabe nos ~$20). **ScrapingBee descartado** ($49/mês de piso > orçamento, e overkill pra casa mole). Decisão de pagar fica pro futuro, não no v1.
- **ToS:** scraping fere o ToS das casas; zona cinza no BR regulado. Uso pessoal, odd pública, **volume baixo** (poucos jogos), rate-limit educado. Risco assumido e documentado.

---

## 10. COLETA LARGA, MARCA ESTREITA

- **Coleta larga:** pega TODOS os mercados de prop que a casa mostrar (sot, finalizacoes, desarmes, faltas, passes) + partida.
- **Marca estreita:** a **estrela de valor** só sai em mercado/linha **validado na população do jogo** (`validated_lines` + `populacaoFor`, regra que já existe). Faltas/passes entram como **diagnóstico, sem estrela**. Não muda o trinco existente.

---

## 11. FORA DO v1 (YAGNI)

- **bet365** (manual, fallback).
- **Captura de fechamento / CLV** (loop forward trata à parte).
- **Scheduler** (é sob demanda).
- **Casas além das 4** (adiciona depois no mesmo molde).
- **Consenso de-vig** (modelo já é a âncora — refinamento futuro).
- **Unblocker automático** (só se uma casa bloquear e justificar).

---

## 12. DADOS DE REFERÊNCIA (testes do dono — 2026-06-13)

Coleta manual nos jogos de hoje (Catar×Suíça, Brasil×Marrocos). **Prova viva** de que (a) dispersão é real e (b) normalização é vida-ou-morte.

**Cobertura de mercado por casa:** Superbet ✅ · Betano ✅ · Betnacional ✅ (sem passes) · KTO ✅ (sem passes).

**CHUTES A GOL — Lucas Paquetá** (dispersão saudável, real):

| Linha canônica | Betano | Superbet | KTO | Betnacional |
|---|---|---|---|---|
| over 0.5 (`1+`/`0,5+`) | 1.78 | 1.77 | **2.08** | 1.67 |
| over 1.5 (`2+`/`1,5+`) | 4.7 | 4.55 | **6.5** | 4.2 |

→ **KTO é a mole** (paga mais = acha menos provável). over 1.5: KTO 6.5 (15%) vs Betnacional 4.2 (24%). Se o modelo disser > 15%, **KTO 6.5 é valor**. Line shopping funcionando.

**FALTAS — Igor Thiago** (a ARMADILHA — gap grande demais):

| Linha canônica | Betano | Superbet | KTO | Betnacional |
|---|---|---|---|---|
| over 1.5 (`2+`/`+1,5`/`+2`) | **2.4** (42%) | 1.47 (68%) | 1.87 (53%) | 1.44 (69%) |

→ Betano sozinha diz 42%, as outras 53–69%: **gap de ~27 pontos**. Grande demais pra shopping normal. **Suspeito de "faltas cometidas" vs "faltas sofridas"** (atacante sofre mais do que comete) **ou** linha disfarçada. **Confirmar a definição em TODAS as casas antes de confiar** — é exatamente o caso que a regra anti-armadilha (§5.4) e o falha-alto (§6) existem pra pegar.

> **Faltas e passes "mesma coisa" — over 1.5 = 2+:** sim, pra contagem `over N.5` = `(N+1)+`. O dono mapeou certo. O risco não é esse — é a **definição do mercado** (cometidas vs sofridas) e o `+2` ambíguo.

---

## 13. PLANO DE IMPLEMENTAÇÃO (alto nível — detalhar no próximo chat)

1. **Fase 0 — descoberta** (§8): 4 fichas de endpoint (prop + partida). **Gate:** sem ficha, não escreve adapter.
2. **`OddsNormalizer`** (função pura, TDD): tabelas de-para (§5) + regra anti-armadilha. Testar com fixtures cruas das 4 casas. **Primeiro**, porque é o coração e o maior risco.
3. **4 adapters** (`Betano/Superbet/Betnacional/Kto`), HTTP injetável, fixtures offline.
4. **`OddsCollector`** (porta) + orquestração sob demanda: recebe `event_id` + jogadores, dispara as 4 casas em paralelo, agrega, "pula e avisa" no bloqueio.
5. **Matching** jogo + jogador (Dice, fail-closed).
6. **Ligar no fluxo de análise:** coletor → mesmo `odds[]` do `parseManualOdds` → store → motor. Manual segue como fallback.
7. **Front:** botão "buscar odds" no jogo (ou automático ao analisar) + mostrar `linhas_rejeitadas` pro operador + destaque do outlier.

---

## 14. RISCOS / QUESTÕES ABERTAS (resolver na Fase 0 / implementação)

- ~~**Endpoint pode exigir login**~~ **RESOLVIDO (2026-06-13):** o dono confirmou que viu a odd de prop **deslogado nas 4 casas** → a odd é **pública, sem auth de usuário**. Maior risco técnico **eliminado**. Ressalva menor: o site pode ainda obter um **token anônimo** no carregamento (handshake público, não login) e usá-lo na chamada JSON — se for o caso, o adapter reproduz esse handshake (barato). Login de usuário está **fora da equação**.
- **Geoblock continua valendo** (deslogar não muda IP): server-side fora do BR pode tomar bloqueio por região → medir na Fase 0; se bater, IP/proxy BR (decisão #5: pula e avisa; recuperação via unblocker fica pro futuro).
- **`+2` ambíguo** por casa (over 1.5 vs over 2.5) — confirmar por casa.
- **Limiar da regra anti-armadilha** (quanto de divergência = "revisar") — calibrar com dado real.
- **Quão estável é o JSON interno** (pode mudar sem aviso) — adapter tem que falhar alto, não em silêncio.
- **Re-checar cobertura na Copa real** — casa rasa hoje pode abrir mais prop no torneio (e vice-versa).
