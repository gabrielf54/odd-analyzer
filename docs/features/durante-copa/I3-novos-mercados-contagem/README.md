# I3 — Novos mercados de contagem reusando o motor

> **Índice/estado vivo:** [`docs/CORE.md`](../../../CORE.md) (esta pasta é o detalhe da feature). Refs a `ROADMAP`/`PITCH`/`proximos-passos` abaixo são **históricas** — unificados no CORE (conteúdo no git). Ao mexer no estado, atualize o **CORE**.
>
> **STATUS (2026-06-11):** o piloto **faltas SHIPOU** (validou over 0.5 na seleção — ver CORE §3.1).
> **defesas foi ADIADA** após reprovar a calibração → [`mercados-nao-validados`](../../mercados-nao-validados/).
> Esta ficha cobre agora só o **leque restante NÃO implementado**: dribles (`total_contest`),
> cruzamentos (`total_cross`), duelos aéreos (`aerial_won`), interceptações (`interception`) e passes
> (`total_pass` — cobertura de casa ~zero, provável só diagnóstico). A mecânica genérica abaixo vale
> pra todos. `PLANO-faltas-defesas.md` e `I9-extra-mercados.md` foram removidos (faltas/defesas já
> resolvidos; o git guarda o detalhe técnico).

## 1. TL;DR
O motor de contagem (per90 → shrink → oppMult → NB2 → de-vig → EV) é **genérico sobre qualquer
campo de contagem**. A BSD entrega ~40 campos por jogador e a maioria está **ociosa**. Adicionar
mercados de **confronto limpo** (dribles, faltas, cruzamentos, duelos aéreos, interceptações) é, no
código, **só configuração** — o trabalho real é **baseline + calibração + cobertura da casa** por mercado.

## 2. Status
- **Ajuda à meta:** **Médio-Alto** (mais oportunidades; alguns confrontos são limpíssimos na Copa).
- **Pronto p/ Copa:** ⏳ Só com prova (baseline + calibração por mercado; forward na Copa).
- **Esforço:** **Baixo por mercado** (config) **+** calibração (o custo real).
- **Risco de calibração/paridade:** **Médio** — cada mercado novo é um μ novo; não toca os mercados
  existentes (golden de `test/parity/` ficam intactas), mas o **novo** mercado precisa da sua própria prova.
- **Custo de dado:** **$0** (BSD já entrega os campos). Custo lateral: **cobertura da casa** (nem todo
  prop é precificado pela bet365).

## 3. Problema / fundamento (confronto × concessão × EV)
O produto procura **valor = `prob_modelo > prob_devig`** no encaixe **oferta × concessão no mesmo
eixo**. Hoje só explora 3 eixos de jogador (SOT, finalizações, desarmes). Mas há eixos com
**confronto ainda mais limpo**, que a Copa (jogos desiguais, estilos contrastantes) torna frequentes:

- **Dribles** (`total_contest`) do driblador × **volume de desarmes/duelos** que o adversário força.
- **Faltas** (`fouls`) × **árbitro** (média de faltas marcadas) + **pressão no terço final** sofrida.
- **Cruzamentos** (`total_cross`) do ala/ponta × **cruzamentos concedidos** pelo flanco adversário.
- **Duelos aéreos vencidos** (`aerial_won`) do zagueiro/centroavante × **aéreo concedido** pelo adversário.
- **Interceptações** (`interception`) do volante × volume ofensivo que passa pela zona dele.

Cada um é `μ_base(quem produz) × multiplicador_concessão(adversário no mesmo eixo) → P(X≥linha) →
compara com odd de-vig`. **O mesmo motor**, campo diferente.

## 4. Evidência real (números + file:line)
- **Jogador tem o dado:** a sondagem do amistoso 9099 trouxe **40 campos por jogador** (`total_cross`,
  `won_tackle`, dribles/`total_contest`, duelos, `interception`, `key_pass`, `fouls`…) — ver README
  mestre §1.2 (`docs/proximos-passos/README.md:40`). O motor lê **só 4** desses (`docs/proximos-passos/README.md:117`).
- **Time tem o eixo de concessão:** `/events/{id}/stats/` expõe eixos agregáveis de concessão
  (faltas, interceptações, cruzamentos, duelos aéreos, dribles sofridos). O mapa atual jogador→time
  só cobre 4 campos: `src/providers/stats.ts:14-19` (`TEAM_STAT_FIELD`).
- **xG está FORA:** `expected_goals`/`expected_assists` vêm **NULL em seleção** (jogador e time) —
  README mestre §1.2 (`docs/proximos-passos/README.md:40`) e ficha I4. **Mercados de xG não entram.**
- **Baseline de seleção é mensurável:** existe molde pronto — `scripts/measure-positional-baseline.mts`
  já agrega por jogo, por mercado, em 120 jogos de seleção (ligas 31/58/59/60/61/62/64/65/66/67),
  produzindo as constantes que viraram `POSITIONAL_SHARE_NACIONAL` (`src/model/params.ts:11-15`).

## 5. Estado atual no código (file:line exatos)
- **Interface do mercado:** `src/model/markets.ts:1-14` — `MarketSpec` tem **exatamente** os campos
  que um mercado precisa: `key, nivel, kind, stat_field, prior_rate, prior_strength, nb_dispersion,
  lines, eixo_concessao, label, concede_baseline, concede_baseline_nacional`.
- **Fábrica de spec:** `src/model/markets.ts:16-19` (`spec()`, default dos baselines = 0.0).
- **Registro de mercados:** `src/model/markets.ts:21-58` (`MARKETS`). Os 3 de jogador hoje:
  `sot` (`shots_on_target`, prior 0.4/12, `:22`), `finalizacoes` (`total_shots`, 1.2/12, `:28`),
  `desarmes` (`total_tackle`, 1.3/12, `:34`). Todos `nb_dispersion: 3.0`.
- **Mapa jogador→time (concessão):** `src/providers/stats.ts:14-19` (`TEAM_STAT_FIELD`). Só
  `corners→corner_kicks`, `total_tackle→total_tackles`, `shots_on_target→shots_on_target`,
  `total_shots→total_shots`. **Para o resto, `entityRate` cai no fallback** `TEAM_STAT_FIELD[x] ?? x`
  (`src/providers/stats.ts:166` e `:241`), que só acerta se o campo de jogador tiver o **mesmo nome**
  no payload de time — quase nunca. **Tem que mapear explicitamente.**
- **Quais mercados de jogador o fluxo manual roda:** `src/manual/analyze.ts:21`
  (`PLAYER_MARKETS = new Set(["sot","finalizacoes","desarmes"])`). Um mercado de jogador novo **só
  é processado** se a `key` entrar aqui.
- **O resto já é genérico:** `entityRate` (`src/providers/stats.ts:149`), `playerCandidates`
  (`src/manual/analyze.ts:101`), `buildCandidate`, `evaluateCandidates`, `rankCandidates` e a IA
  **não conhecem mercado específico** — operam sobre `MarketSpec`. **Nada disso muda.**
- **Baseline por liga já roteado:** `baselineFor` (`src/model/markets.ts:64`) escolhe nacional vs
  clube; `NATIONAL_LEAGUE_IDS` (`src/model/markets.ts:61`) inclui 27 (Copa) e 31 (amistoso).

## 6. Proposta de implementação
**Ports & Adapters:** nada de I/O novo no domínio. Só (a) uma entrada em `MARKETS` (domínio puro) e
(b) uma entrada em `TEAM_STAT_FIELD` (adapter BSD). O gate de paridade dos mercados **existentes**
não é afetado — golden de `test/parity/` continuam valendo. O **novo** mercado, quando virar
money-path, ganha sua própria golden.

**Passos para 1 mercado-piloto (sugestão: `dribles` — confronto limpíssimo):**

1. **Definir o spec** em `src/model/markets.ts` dentro de `MARKETS`:
   ```ts
   dribles: spec({
     key: "dribles", nivel: "jogador", kind: "contagem", stat_field: "total_contest",
     prior_rate: /* medir */ 1.5, prior_strength: 12.0, nb_dispersion: 3.0,
     lines: [0.5, 1.5, 2.5],
     eixo_concessao: "dribles_concedidos_por_jogo", label: "Dribles (Tentados)",
     concede_baseline: /* medir clube */ 0, concede_baseline_nacional: /* medir seleção */ 0,
   }),
   ```
2. **Habilitar no fluxo manual:** adicionar `"dribles"` ao `PLAYER_MARKETS` (`src/manual/analyze.ts:21`).
3. **Mapear a concessão jogador→time** em `TEAM_STAT_FIELD` (`src/providers/stats.ts:14-19`), com o
   campo correto do payload de **time** que representa "dribles sofridos/permitidos". Se a BSD não
   expõe um agregado de time direto, usar a soma por-jogo dos adversários (como
   `teamConcededByPosition` já faz por posição em `src/providers/stats.ts:100-127`, mas agregando
   o total) — decidir no spike de dado.
4. **Medir baselines** (`concede_baseline`, `concede_baseline_nacional`) e o `prior_rate` adaptando
   `scripts/measure-positional-baseline.mts` (trocar `STAT_FIELDS` por `["total_contest"]`; ele já
   itera ligas de seleção e imprime as constantes prontas para colar). O `prior_rate` = mediana da
   taxa/90 da população; o `concede_baseline_*` = média do total concedido/jogo.
5. **Calibrar** (ver §7) antes de tratar como dinheiro real.

**Contrato/wire (snake_case PT) — não muda:** o candidato novo sai com as **mesmas chaves**
(`prob_modelo`, `prob_devig`, `edge`, `ev`, `market_type: "dribles"`, `linha`, `amostra_jogos`,
`incerteza`, `concedido_adversario`, `trace`, `stats_detalhadas`), porque `buildCandidate` é genérico.
O front e a IA já espelham essas chaves — **mercado novo aparece sozinho**, sem mudança de schema no fio.

**Mercados candidatos (4-6) com o eixo de concessão de cada:**

| Mercado | `stat_field` (jogador) | Eixo de concessão (time adversário) | Cobertura típica da casa |
|---|---|---|---|
| Dribles (tentados) | `total_contest` | dribles sofridos / desarmes+duelos forçados | **Varia** (alguns books) |
| Faltas cometidas | `fouls` | faltas marcadas pelo **árbitro** + pressão no terço final sofrida | **Geralmente sim** (cartões/faltas) |
| Cruzamentos | `total_cross` | cruzamentos concedidos pelo flanco | **Varia** |
| Duelos aéreos vencidos | `aerial_won` | duelos aéreos concedidos | **Raro/Varia** |
| Interceptações | `interception` | volume ofensivo que entra na zona dele | **Raro** |
| Chutes na área | (campo de área, confirmar no payload) | chances concedidas na área | **Varia** |

> **Documentar cobertura por mercado:** faltas/cartões a bet365 quase sempre precifica → de-vig
> possível; dribles/cruzamentos/aéreos variam → muitas vezes só **over manual** (de-vig inerte,
> `sem_devig=true` em `src/candidates/builder.ts:44`). Mercado sem odd da casa = não há aposta, só
> diagnóstico.

## 7. Plano de validação
- **CADA mercado calibra SEPARADO** (Brier / ECE / leave-one-out). Não herda a credencial dos outros.
- **Offline:** Copa passada está **vazia** (não dá), então calibrar nos **amistosos/eliminatórias
  recentes de seleção** que existem (ligas 31/58–67) adaptando `scripts/backtest-tilt.mts` (ele já
  faz leave-one-out anti-espiada: prediz o jogo N com jogos < N) — trocar `FIELDS` para o novo campo
  e comparar `prob_modelo` vs `resultado` (`valorReal > linha ? 1 : 0`).
- **Forward (obrigatório):** o loop I7 (`paper_ledger`) acumula o mercado na Copa e o relatório de
  calibração/CLV por `market_type` mostra se ele presta nas seleções.
- **Critério de aceite (para virar money-path):** **BrierSkill > 0** e **ECE** comparável aos
  mercados que prestam (sot/finalizações/desarmes), **CLV ≥ 0** forward, **e** cobertura da casa
  confirmada (existe odd para de-vig). Enquanto não, fica como **diagnóstico**, fora do veredito.

## 8. Riscos & armadilhas
- **Cada mercado = baseline + calibração próprios.** "Reusa o motor" é verdade no código, **não** na
  estatística. Ligar um mercado novo sem calibrar repete o erro do tilt cru (degradou ECE).
- **`nb_dispersion = 3.0` é herdado de EPL** (`src/model/params.ts:2`). A dispersão de `fouls` ou
  `total_contest` pode ser bem diferente da de chutes → o NB2 pode estar mal-ajustado. Medir o `r`
  do novo campo (variância/média) e ajustar `nb_dispersion` por mercado se preciso.
- **Concessão mal-mapeada:** se `TEAM_STAT_FIELD` não tiver entrada, o fallback `?? stat_field`
  (`src/providers/stats.ts:166`) silenciosamente usa o campo de jogador no payload de time → quase
  sempre `null` → `oppMult` cai para 1.0 (neutro). Resultado: mercado **sem** a inteligência de
  confronto que é o ponto. Sempre mapear explicitamente e verificar no trace.
- **Odds one-sided:** props raros (dribles, aéreos) costumam vir só `odd_over` → de-vig inerte →
  comparar com odd inflada pela margem. (Ver ficha I1 sobre o tratamento honesto do one-sided.)
- **Settlement:** confirmar que a casa liquida pelo **mesmo campo** que o motor lê (lição de I8 com
  `total_tackle` vs `won_tackle`). Faltas "cometidas" vs "sofridas", dribles "tentados" vs
  "completos" — alinhar com a definição da bet365 antes de gravar `resultado`.

## 9. Dependências
- **I7** (loop forward) para validar na Copa — sem ele, não há prova na população certa.
- **I1** (de-vig honesto / flag one-sided) para que props raros não sejam comparados com odd inflada.
- **I8** (definição de settlement) como padrão a seguir em qualquer mercado novo.
- Acesso ao payload real para confirmar o nome exato do campo de **time** (spike de dado de ~30 min).

## 10. Esforço estimado
- **Por mercado:** Baixo no código (≈ 0.5 dia: spec + `PLAYER_MARKETS` + `TEAM_STAT_FIELD` + testes).
- **Calibração:** ≈ 0.5–1 dia por mercado (adaptar os 2 scripts, rodar, ler Brier/ECE) + acúmulo forward.

## 11. Checklist de aceite
- [ ] Spec do mercado-piloto em `MARKETS` (`src/model/markets.ts`) com `prior_rate` e baselines **medidos** (não chute).
- [ ] `key` adicionada a `PLAYER_MARKETS` (`src/manual/analyze.ts:21`).
- [ ] Entrada explícita em `TEAM_STAT_FIELD` (`src/providers/stats.ts:14-19`) com o campo de time correto.
- [ ] `npm test` verde; golden de `test/parity/` dos mercados **existentes** **inalteradas**.
- [ ] Backtest leave-one-out (script adaptado) impresso: Brier/ECE do mercado novo.
- [ ] Cobertura da casa documentada (precifica? de-vig possível?) na própria ficha/ROADMAP.
- [ ] `docs/ROADMAP.md` / `docs/PITCH.md` atualizados (mercado entrou no MVP, com status de validação).

## 12. Como verificar
```bash
npm test                       # suíte verde; paridade dos mercados existentes intacta
npm run typecheck              # MarketSpec satisfeito pelo spec novo

# medir baseline do mercado novo (adaptar STAT_FIELDS no script):
npx tsx scripts/measure-positional-baseline.mts

# leave-one-out / calibração do mercado novo (adaptar FIELDS no script):
npx tsx scripts/backtest-tilt.mts
```
```bash
# sondar se o campo existe no player-stats real (usa BZZOIRO_API_KEY do .env):
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/9099/player-stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(Object.keys(j.player_stats?.[0]??{})))'
```
