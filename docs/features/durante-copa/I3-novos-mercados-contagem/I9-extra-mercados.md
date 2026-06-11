# I9 — Mercados de jogador: faltas, passes e defesas de goleiro

> **Índice/estado vivo:** [`docs/CORE.md`](../../../CORE.md) (sub-ideia do I3). Refs a `ROADMAP`/`PITCH`/`proximos-passos` abaixo são **históricas** — unificados no CORE (conteúdo no git).

> **Esta ficha é a aplicação concreta da [I3](I3-novos-mercados-contagem.md) a 3 mercados pedidos.**
> Leia a I3 primeiro: ela prova que o motor de contagem é **genérico sobre qualquer campo** e que
> adicionar mercado de **confronto limpo** é, no código, **só config** — o custo real é baseline +
> calibração + cobertura da casa. Esta ficha NÃO repete a mecânica genérica; ela diz **o que cada um
> dos 3 mercados tem de específico** e — importante — onde **um deles (defesas) NÃO é só config** e
> precisa de código novo no motor.

## 1. TL;DR

- **Faltas (`fouls`)** — encaixa **limpo** na máquina de concessão existente. É **só config** (spec +
  `PLAYER_MARKETS` + `TEAM_STAT_FIELD`) + baseline + calibração. Casa **precifica** (faltas/cartões) →
  de-vig possível. **Melhor candidato dos três.**
- **Passes (`total_pass`)** — encaixa no código, mas **μ é enorme** (~30–60/jogo) → `nb_dispersion=3.0`
  herdado de chutes **não serve** (medir o `r`), e a **casa quase nunca precifica** passe de linha →
  cobertura fraca = na prática **só diagnóstico**. **Menor prioridade.**
- **Defesas de goleiro (`saves`)** — **NÃO é só config.** Quebra dois pressupostos do motor: (a) roda
  só pra **1 posição** (goleiro), mas o fluxo hoje processa **todos** os jogadores; (b) o eixo de
  confronto é **invertido** — defesa do goleiro depende de quanto o adversário **PRODUZ** de chute a
  gol, não de quanto **concede**. Exige **2 mudanças de código** no motor antes da config. Casa
  **precifica** defesas → vale o esforço se feito certo.

## 2. Status

- **Ajuda à meta:** **Médio** (faltas/defesas têm cobertura de casa boa e confronto real; passes ~zero).
- **Pronto p/ Copa:** ⏳ Só com prova por mercado (baseline + calibração; forward na Copa). **Nenhum**
  nasce `validated=true`.
- **Esforço:** **Faltas** = Baixo (config). **Passes** = Baixo (config) mas provável beco-sem-saída
  (cobertura). **Defesas** = Médio (2 patches de motor) + config.
- **Risco de paridade:** **Baixo** — cada mercado é um μ novo; **não toca** os mercados existentes
  (golden de `test/parity/` ficam intactas). O patch do filtro de posição/eixo do goleiro é **aditivo**
  (só dispara pra `nivel: "jogador"` + flag novo), não muda o caminho de sot/finalizações/desarmes.
- **Custo de dado:** **$0** (BSD já entrega os campos). Custo lateral: confirmar nome exato do campo de
  **time** (concessão) e a definição de **settlement** da casa por mercado.

## 3. Problema / fundamento (confronto × concessão × EV) — por mercado

O produto procura **valor = `prob_modelo > prob_devig`** no encaixe **oferta × concessão no mesmo
eixo** (princípio inegociável do CLAUDE.md). Os 3 mercados pedidos têm encaixes **diferentes**:

- **Faltas** — `μ(faltas que o jogador comete) × concessão(faltas que o adversário PROVOCA)`. O eixo de
  concessão é "faltas sofridas / provocadas pelo adversário por jogo" (quanto o adversário arranca
  falta). Encaixe **direto** na máquina `teamConceded`. O **árbitro** (rigor) é um 2º fator → entra como
  **texto pra IA** (ficha I5), **fora** do número (não inventamos multiplicador de árbitro sem calibrar).
- **Passes** — `μ(passes do jogador) × concessão(posse que o adversário cede)`. Funciona em tese, mas a
  variância de passes é dominada por **posse e papel tático**, não por confronto pontual → sinal fraco e
  ruidoso. Some-se a **falta de odd** → fica como diagnóstico, não aposta.
- **Defesas de goleiro** — **eixo invertido.** A defesa não nasce de "o adversário concede defesas";
  nasce de **quanto o adversário CHUTA A GOL** (produção ofensiva de SOT do adversário) × a qualidade do
  goleiro. Ou seja: `μ(defesas/90 do goleiro) × produção_SOT(adversário)`. A máquina atual mede
  **concessão** (o que o time **permite**), não **produção** (o que o time **faz**) — por isso é a peça
  que não cabe sem código (ver §5/§6).

## 4. Evidência real (números + file:line)

- **Os 3 campos existem no player-stats da BSD:** a sondagem do amistoso 9099 trouxe **40 campos por
  jogador** (`fouls`, passes, e — pro goleiro — `saves`), ver I3 §4 e README mestre §1.2
  (`docs/proximos-passos/README.md:40`). **Confirmar o nome exato** de cada um no payload com o sonar da
  I3 §12 antes de codar (não chutar nome de campo).
- **O motor lê só 4 campos hoje:** `TEAM_STAT_FIELD` em `src/providers/stats.ts:14-19` só mapeia
  `corners`, `total_tackle`, `shots_on_target`, `total_shots`. Pra qualquer outro, `entityRate` cai no
  fallback `TEAM_STAT_FIELD[x] ?? x` (`src/providers/stats.ts:184`) → se não houver entrada, `oppMult`
  vira **1.0 (neutro)** e o mercado perde a inteligência de confronto que é o ponto.
- **A máquina de concessão sabe agregar campo sem-contagem-de-time:** quando o campo não está em
  `TEAM_STAT_FIELD`, `entityRate` liga `byPlayer=true` (`src/providers/stats.ts:186`) e
  `teamConceded` soma o stat dos **jogadores adversários** por jogo (`src/providers/stats.ts:61-73`) —
  é assim que `won_tackle` já é agregado. **Faltas usa exatamente esse caminho.**
- **A posição do jogador JÁ vem no elenco:** `squad()` popula `posicao: p.position`
  (`src/providers/stats.ts:161`) e `playerCandidates` já a passa adiante (`entity.posicao` em
  `src/manual/analyze.ts:146` e `:156`). **O dado pro filtro de goleiro já está na mão** — falta o
  filtro em si.
- **Baseline de seleção é mensurável:** molde pronto — `scripts/measure-positional-baseline.mts` agrega
  por jogo/mercado em jogos de seleção (ligas 31/58–67). Trocar o `STAT_FIELDS` pelo campo novo e ele
  imprime as constantes (`prior_rate`, `concede_baseline_*`).

## 5. Estado atual no código (o que falta, file:line)

**Para faltas e passes — nada de motor falta, é config (igual I3 §5):**
- Spec novo em `MARKETS` (`src/model/markets.ts:42`), fábrica `spec()` (`:26`, default `validated=false`).
- `key` no `PLAYER_MARKETS` (`src/manual/analyze.ts:21`) — sem isso o mercado **não é processado**.
- Entrada em `TEAM_STAT_FIELD` (`src/providers/stats.ts:14`) **ou** confiar no caminho `byPlayer`
  (`:186`) se não houver agregado de time direto (faltas-sofridas costuma vir por jogador).

**Para defesas de goleiro — DUAS lacunas de motor (não é config pura):**

1. **Filtro de posição (goleiro).** `playerCandidates` itera **todos** os jogadores casados
   (`src/manual/analyze.ts:136`, loop `for (const od of casados)`). Não há filtro por posição. Pra um
   mercado "só goleiro", processar zagueiro/atacante gera μ sem sentido e candidatos-lixo. Precisa de um
   campo opcional no `MarketSpec` (ex.: `posicao_filtro?: string` = `"G"`) e um `continue` quando
   `entity.posicao` não casa. A posição **já está disponível** (`entity.posicao`, `src/manual/analyze.ts:146`).
2. **Eixo invertido (produção, não concessão).** Toda a máquina de matchup mede **concessão**:
   `teamConceded` lê `stats[concededSide][teamField]` (`src/providers/stats.ts:75-80`) = o que o time
   **permitiu**. Defesa precisa do oposto — quanto o adversário **PRODUZ** de SOT (lado ofensivo dele).
   Hoje **não há** caminho que leia o lado de produção do adversário pro multiplicador. Precisa de uma
   flag no spec (ex.: `eixo_producao?: true`) que, em `entityRate`, troque a consulta para a **produção
   de SOT do adversário** (o lado do próprio adversário, não o `concededSide`) e use isso no `oppMult`.

> **Por que isso é importante e não um detalhe:** sem (2), o goleiro de um time que enfrenta um
> adversário super ofensivo (muitos SOT) seria tratado como **neutro** (oppMult=1.0) — exatamente o
> confronto que dá valor seria invisível. Ligar defesas só com o filtro de posição e **sem** o eixo de
> produção entrega um mercado **cego ao confronto** = contra a doutrina do produto.

## 6. Proposta de implementação

**Ports & Adapters (igual I3):** nada de I/O novo no domínio. O patch do goleiro é **aditivo** e
gateado por flags no `MarketSpec`, então não toca o caminho dos mercados existentes.

### 6.1 Faltas (`fouls`) — config, fazer primeiro
1. Spec em `MARKETS`:
   ```ts
   faltas: spec({
     key: "faltas", nivel: "jogador", kind: "contagem", stat_field: "fouls", // confirmar nome
     prior_rate: /* medir */ 1.0, prior_strength: 12.0,
     nb_dispersion: /* MEDIR r de fouls, não herdar 3.0 */ 3.0,
     lines: [0.5, 1.5, 2.5],
     eixo_concessao: "faltas_provocadas_por_jogo", label: "Faltas (Cometidas)",
     concede_baseline: /* medir clube */ 0, concede_baseline_nacional: /* medir seleção */ 0,
   }),
   ```
2. `"faltas"` no `PLAYER_MARKETS` (`src/manual/analyze.ts:21`).
3. Concessão: provável que **não** haja agregado de time direto → confiar no caminho `byPlayer`
   (soma faltas-sofridas dos adversários por jogo). **Confirmar no payload** se há `was_fouled`/
   equivalente; senão, mapear o que representa "faltas provocadas".
4. **Settlement:** confirmar que a casa liquida **faltas COMETIDAS** (não sofridas) — alinhar
   `settle_field` se divergir (lição I8 `total_tackle`/`won_tackle`).
5. Medir baseline + calibrar (§7).

### 6.2 Passes (`total_pass`) — config, mas só se houver cobertura
Mesmos passos da 6.1 com `stat_field: "total_pass"`. **Antes de qualquer código**, checar se a
bet365/casa **precifica** prop de passes — se não, o mercado nasce `sem_devig=true` (de-vig inerte,
`src/candidates/builder.ts`) e é **só diagnóstico**. **Medir o `r` é obrigatório** (μ alto muda muito a
NB2). Recomendação: **deixar por último** ou pular até haver demanda real.

### 6.3 Defesas de goleiro (`saves`) — 2 patches de motor, depois config
1. **`MarketSpec`** (`src/model/markets.ts:1`): adicionar campos opcionais
   `posicao_filtro?: string` e `eixo_producao?: boolean`.
2. **Filtro de posição** em `playerCandidates` (`src/manual/analyze.ts:136`): `if
   (market.posicao_filtro && entity.posicao !== market.posicao_filtro) continue;`. Confirmar o valor da
   BSD pra goleiro (provável `"G"`).
3. **Eixo de produção** em `entityRate` (`src/providers/stats.ts:167`): quando `market.eixo_producao`,
   o multiplicador usa a **produção de SOT do adversário** (lê o lado **do próprio adversário** no
   `/events/{id}/stats/`, não o `concededSide`) em vez de `teamConceded`. Clamp segue o mesmo
   `OPP_MULT_MIN/MAX` (0.7–1.4, `src/providers/stats.ts:29-30`).
4. Spec:
   ```ts
   defesas: spec({
     key: "defesas", nivel: "jogador", kind: "contagem", stat_field: "saves", // confirmar nome
     prior_rate: /* medir */ 3.0, prior_strength: 12.0,
     nb_dispersion: /* MEDIR r de saves */ 3.0, lines: [1.5, 2.5, 3.5, 4.5],
     eixo_concessao: "sot_produzido_pelo_adversario_por_jogo", eixo_producao: true,
     posicao_filtro: "G", label: "Defesas (Goleiro)",
     concede_baseline: /* medir */ 0, concede_baseline_nacional: /* medir */ 0,
   }),
   ```
5. `"defesas"` no `PLAYER_MARKETS`. **Settlement:** confirmar definição da casa (defesa "save" Opta).

**Contrato/wire (snake_case PT) — não muda:** os candidatos novos saem com as **mesmas chaves**
(`prob_modelo`, `prob_devig`, `edge`, `ev`, `market_type`, `linha`, `amostra_jogos`, `incerteza`,
`concedido_adversario`, `trace`, `stats_detalhadas`) — `buildCandidate` é genérico. Front e IA já
espelham → **mercado novo aparece sozinho**, sem mudança de schema no fio.

## 7. Plano de validação (cada mercado calibra SEPARADO)

- **Não herda a credencial dos outros.** Cada um precisa de Brier / ECE / leave-one-out próprios.
- **Offline:** Copa passada está **vazia** (não dá). Calibrar nos **amistosos/eliminatórias recentes de
  seleção** (ligas 31/58–67) adaptando `scripts/backtest-tilt.mts` (leave-one-out anti-espiada: prediz
  jogo N só com jogos < N) — trocar `FIELDS` pro campo novo, comparar `prob_modelo` vs
  `resultado` (`valorReal > linha ? 1 : 0`).
- **Forward (obrigatório):** o loop I7 (`paper_ledger`) acumula o mercado na Copa; o relatório de
  calibração/CLV por `market_type` diz se presta nas seleções.
- **Critério para virar money-path (`validated=true`):** **BrierSkill > 0** e **ECE** comparável aos
  mercados que prestam, **CLV ≥ 0** forward, **e** cobertura da casa confirmada (existe odd p/ de-vig).
  Enquanto não, fica **diagnóstico**, fora do veredito. (Política de graduação gradual do CLAUDE.md —
  vira `true` um a um.)

## 8. Riscos & armadilhas

- **`nb_dispersion=3.0` é de chutes (EPL).** Faltas, passes e defesas têm variância própria. **Medir o
  `r`** (variância/média) de cada campo e ajustar `nb_dispersion` por mercado — herdar cego desajusta a
  NB2 (risco maior em passes, μ alto).
- **Concessão mal-mapeada vira neutro silencioso.** Sem entrada em `TEAM_STAT_FIELD` nem o caminho
  `byPlayer` correto, `oppMult` cai pra 1.0 e o confronto some. **Verificar no `trace`** que o
  `concedido_adversario` saiu numérico, não `"n/d (neutro)"`.
- **Defesas sem o eixo de produção = mercado cego.** (Ver §5.) É o erro mais fácil de cometer: ligar só
  o filtro de posição e achar que acabou.
- **Passes: cobertura quase zero.** Não codar antes de confirmar que a casa precifica — senão é trabalho
  pra um mercado que nunca vira aposta.
- **Settlement (lição I8).** Confirmar que a casa liquida pelo **mesmo evento** que o motor lê: faltas
  **cometidas** vs **sofridas**; defesas como a Opta conta "save". Alinhar `settle_field` antes de gravar
  `resultado`, ou o forward mede a coisa errada.
- **Odds one-sided (depende de I1).** Props de jogador costumam vir só `odd_over` → de-vig inerte →
  comparar com odd inflada. **Fazer I1 (Tier 1) antes** de tratar qualquer um destes como valor.

## 9. Dependências

- **I3** (esta ficha é a aplicação concreta dela) — mecânica genérica de adicionar mercado de contagem.
- **I7** (loop forward) — sem ele não há prova na população Copa.
- **I1** (de-vig honesto / flag one-sided) — pra props raros não serem comparados com odd inflada.
- **I8** (definição de settlement) — padrão a seguir em qualquer mercado novo.
- Spike de payload (~30 min) pra confirmar nome exato de `fouls`/`total_pass`/`saves` e o valor de
  posição do goleiro.

## 10. Esforço estimado

- **Faltas:** ≈ 0.5 dia código (config) + 0.5–1 dia calibração.
- **Passes:** ≈ 0.5 dia código **se** valer (provável não valer por cobertura) + calibração.
- **Defesas:** ≈ 1 dia código (2 patches de motor + testes do filtro/eixo) + 0.5–1 dia calibração.

## 11. Checklist de aceite

**Comum a todos:**
- [ ] Nome do campo confirmado no payload real (sonar I3 §12), **não chutado**.
- [ ] `nb_dispersion` (`r`) **medido** pro campo novo, não herdado.
- [ ] `prior_rate` e baselines **medidos** (`measure-positional-baseline.mts` adaptado).
- [ ] `settle_field` alinhado com a definição da casa (cometidas/sofridas; save Opta).
- [ ] `npm test` verde; golden de `test/parity/` dos mercados **existentes** **inalteradas**.
- [ ] Backtest leave-one-out impresso: Brier/ECE do mercado novo.
- [ ] Cobertura da casa documentada (precifica? de-vig possível?) na ficha/ROADMAP.
- [ ] `validated` permanece **false** até a prova; `docs/ROADMAP.md` + `docs/PITCH.md` atualizados.

**Faltas:**
- [ ] Spec + `PLAYER_MARKETS` + concessão (caminho `byPlayer` ou `TEAM_STAT_FIELD`) verificada no `trace`.

**Passes:**
- [ ] Cobertura da casa confirmada **antes** de codar (se não precifica → marcar como diagnóstico e parar).

**Defesas (além do comum):**
- [ ] `posicao_filtro` no `MarketSpec` + `continue` em `playerCandidates`; valor de goleiro confirmado.
- [ ] `eixo_producao` no `MarketSpec` + leitura da **produção** de SOT do adversário em `entityRate`.
- [ ] Teste do filtro (só goleiro vira candidato) e do eixo (adversário ofensivo → oppMult > 1).
- [ ] `trace` confirma `concedido_adversario` numérico (não neutro) pro confronto do goleiro.

## 12. Como verificar

```bash
npm test                       # suíte verde; paridade dos mercados existentes intacta
npm run typecheck              # MarketSpec satisfeito (incl. campos novos opcionais)

# medir baseline + r do mercado novo (adaptar STAT_FIELDS no script):
npx tsx scripts/measure-positional-baseline.mts

# leave-one-out / calibração do mercado novo (adaptar FIELDS no script):
npx tsx scripts/backtest-tilt.mts

# sondar se o campo existe no player-stats real (usa BZZOIRO_API_KEY do .env):
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/9099/player-stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(Object.keys(j.player_stats?.[0]??{})))'
```
