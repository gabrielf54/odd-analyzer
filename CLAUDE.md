# CLAUDE.md — odd-analyzer

> **Este é o BACKEND.** Fornece dados (API REST) para o frontend, que fica em: `C:\Users\gabri\Documents\projects\odd-analyzer-frontend`

Guia para o Claude trabalhar neste projeto. **Leia a seção "Produto" primeiro** — ela define a mentalidade que todo trabalho aqui deve ter. Depois: boas práticas de banco (**MCP do Supabase**).

## Produto — o que é e como pensa

**Em uma frase:** para um jogo escolhido, o sistema compara a **probabilidade do nosso modelo** (calculada em **código**) com a **odd da casa sem a margem** (de-vig) e **só sinaliza quando o modelo está claramente à frente**. A IA escreve a explicação em linguagem natural — **nunca inventa o número**.

**Princípio inegociável — o que é "valor":**
- Valor = `prob_modelo > prob_justa_da_casa_sem_margem`. Filtra-se por **EV/edge positivo**.
- **NUNCA** se filtra por "probabilidade alta". Selecionar favoritos (prob ≥ 0.75) escolhe odds eficientemente precificadas = **−EV sistemático**. Isso é erro de categoria e está proibido.
- A IA/LLM **não calcula** probabilidade. O número vem de cálculo estatístico no código. A IA entra só no fim para (a) aplicar o filtro de decisão e (b) explicar. Threshold é proposital e **rígido**: poucas oportunidades fortes > muitas fracas.

**Mentalidade de entrega da análise — o diferencial (TODO prompt futuro deve ter isto):**
O modelo **não olha média bruta — olha o CONFRONTO**. Todo sinal nasce do encaixe **oferta × concessão no mesmo eixo**: quem *produz* a ação encontra quem *permite* aquela ação.

> `μ_base(quem produz a ação) × multiplicador_concessão(adversário no mesmo eixo) → P(evento) → compara com odd de-vig`

Exemplos canônicos que o produto deve conseguir entregar:
- **Time A ataca muito pela esquerda** + **lateral-direito do Time B desarma muito** → o volume defensivo daquele lateral sobe → **over desarmes do lateral-direito** tem valor.
- **Time A cruza muito / gera muitos escanteios** + **Time B sofre muitos escanteios** → **over escanteios do Time A** tem valor.

Quando for analisar/gerar candidatos, **raciocine sempre nesse formato confronto** (produção de um lado × vulnerabilidade específica do outro), não em médias isoladas.

**Mercados (MVP):**
- **Jogador:** chutes a gol (Shots on Target) · finalizações totais · **desarmes**.
- **Partida:** gols · vitória (resultado) · escanteios.
- Mercados de contagem (SOT, finalizações, desarmes, escanteios) usam o modelo de contagem (NB2/Poisson sobre rate × multiplicadores de matchup). Gols/vitória usam um modelo de partida (Poisson de gols do time → deriva 1X2/totais).

**Inteligência de matchup — dois níveis (não prometer o que o dado free não dá):**
- **Por-mercado (base):** multiplicador de concessão do adversário por mercado (o `src/model/adjustments.ts::opponentMultiplier` já faz isso para SOT; replicar para desarmes/escanteios/gols).
- **Direcional/zonal (alvo):** lado de ataque (esquerda/direita) × posição específica do defensor. Precisa de dado posicional rico (zonas Opta/StatsBomb/SofaScore). **Depende de um spike de viabilidade de dado free antes de implementar**; se o dado não existir de graça, cai para o nível por-mercado. Documentado como norte, condicionado a dado.

**Arena & validação:**
- Alvo: **Copa do Mundo 2026** (validação forward, ao vivo) → depois **top ligas europeias de clube**.
- **Validação-primeiro, sem auto-engano:** calibração offline (Brier/log-loss/ECE em replay de jogos passados) → CLV (Closing Line Value) → só então o mercado é marcado como **validado** e suas odds podem virar **aposta de valor recomendada**. Bater a bet365 em props é difícil (margem 7-10%, settlement Opta) — assumido e mitigado, não ignorado.

**Restrição de custo (atual):** orçamento ~$20. **Não** pagar SportsGameOdds Pro ($299). Não existe fonte confirmada de odds de SOT da Copa por <$20 — o plano valida o motor offline ($0) e gasta no máximo **API-Football Pro $19** (stats, ~1 semana antes da Copa). Detalhes em [docs/apis/README.md](docs/apis/README.md).

**Estado:** backend **Node/TS** (raiz do repo, `src/`+`test/`), motor+adapters+API rodando, **279 testes Vitest verdes** com gate de paridade (1e-9) protegendo a calibração. **E2E ao vivo provado** (análise real via BSD → value bet coerente). Front **Next** no repo `odd-analyzer-frontend`. Python legado **removido** (2026-06-04). **Estado de produto / features / roadmap: [docs/CORE.md](docs/CORE.md)** (doc vivo único). Specs/planos históricos foram removidos do `docs/` — estão no **git** se precisar re-derivar.

## Glossário — conceitos em linguagem simples (o dono é leigo em código)

> O dono entende o PRODUTO mas **não lê código**. Ao explicar qualquer coisa pra ele, use analogias do dia a dia, não jargão. Estes são os termos que mais aparecem:

- **Calibração** = o "detector de mentira" do nosso modelo. Igual homem do tempo: se ele diz "70% de chuva", junta todos os dias que ele falou 70% e vê se choveu em ~70% deles. Nosso modelo diz "Kaiki 73% de fazer 2+ desarmes"; calibrar = em centenas de jogos passados, quando o modelo disse ~73%, aconteceu mesmo ~73% das vezes? Se sim, o número é confiável; se não, a "vantagem" que ele aponta é fantasma e perde dinheiro. **É a prova de que o modelo não mente, feita ANTES de arriscar dinheiro — por isso vem primeiro.**
- **CLV (Closing Line Value) / CLV-forward** = "comprei antes do preço subir". A odd final, segundos antes do jogo, é a mais esperta de todas (muito dinheiro a empurrou). Se você apostou antes numa odd melhor que essa, "bateu o fechamento" — sinal forte de que é bom de verdade, não sorte. **Forward** = só dá pra medir ao vivo, daqui pra frente (jogo velho não guardou como a odd mexeu).
- **Lineup** = lista confirmada dos 11 titulares. Time só anuncia ~1h antes do jogo. Antes disso não há certeza de quem joga — não recomendar aposta em quem pode ficar no banco.
- **Leave-one-out** = "prova sem colar". Pra testar se o modelo teria acertado um jogo, escondemos ESSE jogo, deixamos ele aprender só com os outros, ele chuta, e comparamos com o que aconteceu de verdade. Repete escondendo um de cada vez. Igual professora testando o aluno com questão fora da lista de estudo: prova que aprendeu, não decorou.
- **Backtest** = rodar o modelo "no passado" (em jogos já acontecidos) pra ver como ele teria se saído. É onde a calibração é medida.
- **De-vig (tirar a margem)** = a casa de aposta embute um lucro garantido no preço (a "vig"/"juice"). De-vig = remover esse lucro pra achar a probabilidade "justa" que a casa realmente acredita. A gente compara NOSSO número com esse número justo, não com a odd crua.
- **Edge / EV** = Edge é o tamanho da nossa vantagem (nosso número − número justo da casa). EV (valor esperado) é quanto se ganha em média por R$1 apostado, no longo prazo. Só aposta quando os dois são positivos.
- **Brier / ECE / BrierSkill** = notas da prova de calibração. Quanto menor o Brier e o ECE, melhor (modelo mais certeiro/honesto). BrierSkill > 0 significa "melhor que chutar a média" — abaixo de 0 o modelo não presta naquele mercado.
- **Shift de população** = calibrar num grupo (ex.: clubes do Brasileirão) e usar em outro (ex.: seleções da Copa). Os grupos jogam diferente, então a calibração de um pode não valer no outro — tem que re-medir no grupo certo.

## Documentação viva — SEMPRE atualizar `docs/CORE.md`

[docs/CORE.md](docs/CORE.md) é o **documento vivo ÚNICO** — o cérebro do produto: objetivo +
doutrina + features que existem + próximas features (Copa/pós-Copa) + cemitério (o que não
re-tentar). **Toda mudança que altere estado, veredito ou escopo deve atualizar o `CORE.md` no
MESMO trabalho** (idealmente no mesmo commit) — não deixe divergir do código/realidade.

**Quando atualizar:**
- Calibração rodada / veredito de mercado mudou (passou, falhou, virou validado, foi selado).
- Mercado entrou/saiu do MVP; feature concluída; item movido pro cemitério; novo bloqueio.
- Decisão de produto/arquitetura travada; número-chave medido (baseline, ECE, contagem de testes).

**Como manter coerente:**
1. **Um "ESTADO ATUAL" único e sempre verdadeiro** no cabeçalho do CORE (data + contagem de testes).
2. **Veredito superado = mover pro Cemitério (§5)** com o porquê — não apague o aprendizado (e o git
   guarda o histórico). Nunca deixe um veredito antigo lido como o atual.
3. **Feature nova:** atualize a tabela de features (§3) + crie/atualize a pasta de detalhe em
   [docs/features/](docs/features/) (uma pasta por feature). Linguagem leiga onde tocar o dono
   (o dono não lê código — ver Glossário no CORE).
4. **Validação ciente de população:** ao graduar um mercado, diga em QUAL população (seleção/clube).
5. Detalhe de engenharia (este arquivo) e referência de dado ([docs/apis/](docs/apis/)) **não** vão
   pro CORE — o CORE é produto/estado/roadmap.

## Supabase — contexto

- **Project ref:** `pepizcpowzhtawzjnzui` · região `us-east-1`
- **URL:** `https://pepizcpowzhtawzjnzui.supabase.co`
- Persistência fica em [src/store/repo.ts](src/store/repo.ts) (`SupabaseRepo`). Fonte de verdade do schema: [src/store/schema.sql](src/store/schema.sql).
- Tabelas: `analises` (análise por `event_id`+`market_type`; a linha `market_type='manual_todos'` guarda o **resultado COMPLETO** da análise manual na coluna `resultado jsonb` — fonte de verdade que o front recupera via `GET /jogos/:id/analise`, sobrevive a localStorage falho/cache limpo), `paper_ledger` (registro de apostas-papel + CLV), `jogadores_crosswalk` (mapeamento de IDs de jogador entre fontes), `odds` (odds coletadas — fonte de verdade das odds; PK `event_id,entidade,market_type,linha,book`; liga/jogo/jogador seguem vivos da BSD, não duplicados).

## Duas chaves diferentes — não confundir

| Onde | Variável / campo | Formato | Para quê |
|------|------------------|---------|----------|
| `.env` | `SUPABASE_SERVICE_KEY` | **JWT legado** `eyJ...` (3 segmentos) | App Python (`supabase-py`) |
| `.mcp.json` | `SUPABASE_ACCESS_TOKEN` | **PAT** `sbp_...` | MCP server (Management API) |

- `supabase-py` **2.9.1** valida a key contra regex de JWT. A chave de API nova (`sb_secret_...` / `sb_publishable_...`) é rejeitada com `SupabaseException: Invalid API key`. Use o **service_role legado** (`eyJ...`, aba "Legacy API keys" do dashboard) no `.env`. (Alternativa: atualizar `supabase-py`.)
- O MCP **não** usa o service_role; usa um **Personal Access Token** (`sbp_...`, em Account → Access Tokens).

## MCP do Supabase

- Configurado em `.mcp.json` (server `supabase`, pacote `@supabase/mcp-server-supabase`), escopo do projeto.
- **Modo read-write** (sem `--read-only`): expõe escrita — `apply_migration`, `execute_sql`, `deploy_edge_function`, `create_branch`/`merge_branch`/`reset_branch`/`rebase_branch`.
- Windows: roda via `cmd /c npx`.
- Para carregar/aprovar na sessão: `/mcp`.

### Boas práticas de uso

1. **Olhe antes de mexer.** Antes de qualquer mudança, use `list_tables`, `list_migrations`, `get_advisors`, `get_logs` para entender o estado atual.
2. **DDL via `apply_migration`, não `execute_sql`.** `apply_migration` registra a migration (nome descritivo, ex.: `create_analises_table`). Use `execute_sql` só para leitura/consulta ad-hoc.
3. **`schema.sql` é a fonte de verdade.** Toda mudança de schema aplicada no banco deve ser refletida em [schema.sql](src/store/schema.sql) no mesmo commit — não deixe o arquivo divergir do banco.
4. **Rode `get_advisors` depois de mudar schema** (lints de segurança e performance — RLS faltando, índices, etc.) e trate o que aparecer.
5. **Confirme antes de destrutivo.** `DROP`, `DELETE`, `TRUNCATE`, `reset_branch` — pare e confirme com o usuário antes. Prefira `create_branch` para mudanças arriscadas e só faça `merge_branch` após validar.
6. **Não exponha segredos.** `.env` e `.mcp.json` estão no `.gitignore` — mantenha assim. Nunca cole PAT/service_role em commits, logs ou mensagens.

## Backend — Node/TypeScript (substitui o Python)

> **Migração concluída (2026-06-04):** o backend foi portado de Python para Node/TS (motivo: manutenibilidade — o dono dá suporte em JS/TS, não em Python). O Python legado **foi removido** e o código TS vive na **raiz do repo** (`src/`, `test/`). O front Next fica em repo separado (`odd-analyzer-frontend`). (Specs/planos da migração foram removidos do `docs/`; estão no git.)

- Runtime Node LTS, TypeScript **strict** (ESM, NodeNext). Código em `src/`, testes em `test/`.
- Rodar testes: `npm test` (Vitest). Typecheck: `npm run typecheck`. (rodar da raiz do repo)
- **Design pattern: Ports & Adapters.** O domínio (`model/`, `value/`, `candidates/`) **não importa** `express`, `supabase`, nem `fetch`. Dependências externas entram por interface (`StatsProvider`, `OddsProvider`, `Repo`, `Analista`); em teste, entram fakes (`InMemoryRepo`, `ManualOdds`, `OnlyPlayer`).
- **Funções puras no motor** — sem I/O, sem estado global. Determinístico = testável.
- **Convenção de nomes (INEGOCIÁVEL):**
  - **Identificadores de código em INGLÊS** — funções/variáveis camelCase (`probOverLine`, `fairProbOver`, `evaluateCandidates`), tipos/classes PascalCase (`RejectedCandidate`, `CutReason`), arquivos. **Nada de PT-BR em identificador.**
  - **Exceção única — chaves de DADOS no fio (JSON req/resp) em snake_case PT**, idênticas ao legado (`prob_devig`, `prob_modelo`, `amostra_jogos`, `market_type`, `candidatos`, `event_id`, `reprovados`, `motivos`). Fluem p/ API/DB/IA e o front espelha — não podem divergir. Valores de enum no fio seguem o mesmo estilo (`incerteza: "baixa"`, `motivos: ["titular"]`).
- **Validação de borda só com Zod** (na camada API), nunca checagem manual espalhada.
- **`lib/mathx.ts`** tem o `lgamma` (Lanczos) que falta no `Math` do JS — base da NB2 (mercados de contagem).
- **GATE DE PARIDADE (inegociável):** o motor TS tem que reproduzir os números do Python em 1e-9 (`test/parity/`). As golden files estão congeladas (o gerador Python original está no histórico do git). O gate testa **funções puras** (`probOverLine(mu,line,r)` com `mu` hardcoded) — **não lê `stat_field`**; trocar o campo de um mercado **não** quebra a golden.
- **Money-path:** toda probabilidade passa pelas funções de `model/`/`value/`; a IA nunca calcula número (princípio inegociável de Produto, acima).
- **Trinco `validated_lines` CIENTE DE POPULAÇÃO por mercado (`src/model/markets.ts`):** só mercado/linha com calibração **validada na população do jogo** pode ser **aposta de valor que vale a pena** — `rankCandidates(approved, leagueId)` só dá a estrela quando `isValidated(market_type, linha, leagueId)`. **`validated_lines` é um mapa `Partial<Record<Populacao, number[]>>`** (`Populacao = "selecao" | "clube"`): chave ausente = não validado naquela população; `[]` = todas as linhas; `[a,b]` = só essas. A população vem de **`populacaoFor(leagueId)`** (fonte única: `NATIONAL_LEAGUE_IDS` → seleção; resto e liga desconhecida → clube), **espelhando `baselineFor`**. **Anti-lock-in (objetivo do dono — usar o produto pós-Copa nas ligas de clube):** apertar `sot` na seleção **não** trava `sot` no clube. Hoje: `sot` = `{selecao:[0.5], clube:[]}`; `finalizações` = `{selecao:[], clube:[]}` (todas nas duas); `desarmes` = `{selecao:[0.5,1.5]}` (**clube ausente — não validado até a Fatia 1 medir**); `gols`/`vitória`/`escanteios` = não validado. O resultado carrega o badge `populacao`/`populacao_motivo` (texto, fora do número). **Graduação gradual por (mercado, população, linha).** Virada pós-Copa e fatias futuras: ver [docs/CORE.md](docs/CORE.md) (§4 e §5) e [docs/features/](docs/features/) (uma pasta por feature). **SOT/finalizações re-validados na população de SELEÇÃO (2026-06-11):** calibração offline em n=2071 jogos de seleção (ligas 31,58-67 — AFCON/amistoso/quali; a Copa passada é vazia), leave-one-out, `scripts/recalibrate-sot-fin-selecao.mts`: **finalizações transfere limpo do clube** (BrierSkill +0.119/+0.088/+0.084 em 0.5/1.5/2.5) → validado em todas as linhas; **SOT só tem skill em over 0.5** (+0.048; over 1.5 = **−0.047**, over 2.5 = **−0.272** — seleção chuta a gol pouco: base 6.4% fazem 2+, 1.6% fazem 3+) → `validated_lines=[0.5]`; 1.5/2.5 seguem **analisados, sem estrela**, forward pode regraduar. (Varredura de R mostrou seleção preferir `nb_dispersion≈2.0` nos dois mercados — efeito pequeno, follow-up, não aplicado.) **Desarme via DECOMPOSIÇÃO (2026-06-11):** a casa liquida `won_tackle` (Opta "Tackles Won"); prever o ganho **direto** reprovou (motor só prevê tentativas), MAS `μ_ganhos = μ_tentativas(total_tackle) × aproveitamento(won/total, encolhido p/ média da liga)` **PASSA** — `scripts/recalibrate-desarmes-decomp.mts` (n=1746) + `backtest-desarme-25-fino.mts` (n=2710): BrierSkill **+0.085** (over 0.5) e **+0.028** (over 1.5) com **`nb_dispersion=2.0`** (ganho é distribuição diferente de tentativa → R menor calibra melhor; varredura mostrou efeito monotônico, não overfit). Config: `mu_decomp` no spec (base=`total_tackle`, num=`won_tackle`); `settle_field=won_tackle`. **OVER 2.5 robustamente MORTO** (18 combinações R×k todas com BrierSkill<0; evento raro sem sinal — **NÃO re-tentar**) → só observação forward. O `won_tackle` direto (sem decompor) também NÃO presta — não reverter.
- **Subir a API:** `npm run dev` (Express na porta 3001; usa `tsx`). Front Next consome via REST.
- **Variáveis de ambiente** (`.env` na raiz): `BZZOIRO_API_KEY` (BSD), `THE_ODDS_API_KEY` (The Odds API), `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` (IA), `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. O `@supabase/supabase-js` **aceita a key nova** (`sb_secret_...`) — não precisa do JWT legado que o `supabase-py` exigia.
- **Crosswalk:** o port usa **coeficiente de Dice** (bigramas) no lugar do `difflib` do Python. Scores não são idênticos; como é **fail-closed** (descarta na dúvida), divergência = no máximo perder um jogador, nunca casar id errado. Threshold ajustável.
- **HTTP/banco injetáveis:** todos os adapters (BSDClient, OpenRouter, The Odds API, SupabaseRepo) recebem `get`/`post`/`client` por injeção → testes rodam offline com fakes (`InMemoryRepo`, `ManualOdds`, `OnlyPlayer`).

## Geral

- **Python removido (2026-06-04):** o backend agora é exclusivamente Node/TS, na raiz do repo (`src/`, `test/`). As golden files do gate de paridade (`test/parity/golden/`) ficam congeladas; o gerador Python original está no histórico do git se precisar re-derivar.
- Config/segredos via `.env` na raiz, lidos por `src/config.ts::getRequired(NOME)` (levanta erro se ausente).
- Tanto o legado quanto o port TS têm `InMemoryRepo` para testes offline — não precisa de Supabase para a suíte de testes.
