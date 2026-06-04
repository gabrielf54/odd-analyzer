# Spec — Migração odd-analyzer para Node/TypeScript + front Next

**Data:** 2026-06-04
**Status:** design aprovado (brainstorming) — próximo passo: plano de implementação (writing-plans)

## Contexto e motivação

O projeto hoje é Python (~3.100 linhas de fonte, 45 arquivos de teste). O dono **não programa em Python** — vibecodou até aqui e agora precisa **debugar e dar suporte ao código**, o que ficou inviável na stack atual. Decisão: **migrar para uma stack que ele consiga manter** (JS/TS).

A meta de "dinheiro real a partir de 11/06/2026" passou a ser **flexível** — aposta real só depois que o port estiver validado por paridade (ver abaixo). Sem rush de prazo.

## Achado-chave que viabiliza a migração

O núcleo estatístico do projeto (`model/`, `odds_math`, `backtest/calibration`) é **Python puro** — usa só `import math`, **zero numpy/scipy/sklearn/statsmodels**. Único uso de `pandas` é em um probe diagnóstico (descartável). Logo, nada do motor "trava em Python": traduz para TS linha a linha.

A única primitiva de `math` sem equivalente nativo no JS é **`math.lgamma`** (usada na binomial negativa NB2, que alimenta todos os mercados de contagem: SOT, finalizações, desarmes, escanteios).

### Prova de viabilidade já executada (2026-06-04)

Implementação de `lgamma` via aproximação de **Lanczos** (g=7, 9 coeficientes, ~15 linhas de JS — código próprio, **sem dependência externa**) foi comparada contra o motor Python real do projeto em 96 casos (Poisson e NB2, variando μ, linha e dispersão r):

```
max |Δ lgamma| : 5.684e-14
max |Δ prob|   : 1.110e-15  (96 casos)
PARIDADE OK (< 1e-9)
```

Diferença na ordem de 1e-15 = limite de precisão do float. **O motor inteiro porta para Node sem perder precisão.** A parte mais arriscada da migração está de-riscada antes do plano.

## Decisões travadas

| Eixo | Decisão |
|---|---|
| Estratégia | **Full port** para TypeScript. O projeto Python é descontinuado ao final. |
| Backend runtime | Node LTS |
| Backend framework | **Express + REST + Zod** (escolhido por máxima cobertura de material/IA para debug) |
| Backend repo | `odd-analyzer` (atual, esvaziado do Python) |
| Frontend | **Next.js** (App Router), replicando o fluxo do Streamlit (2 telas / 2 modos) |
| Frontend repo | `odd-analyzer-frontend` (hoje vazio, só `.git`) |
| Banco | Supabase **mantido**; troca `supabase-py` → `@supabase/supabase-js` (resolve a dor da key JWT legado) |
| Contrato | REST com Zod validando entrada/saída; tipos compartilhados copiados/gerados do schema Zod |
| Testes | **Vitest**, espelhando 1-pra-1 os 45 arquivos do pytest |
| Prazo | 11/06 flexível — sem dinheiro real até paridade verde |

### Fora de escopo (YAGNI)

tRPC, monorepo, Bun, Docker, autenticação, CI elaborado, e **qualquer refatoração "melhor" durante o port**. Primeiro reproduzir idêntico (paridade verde), refatorar só depois.

## Arquitetura — dois repos, fronteira limpa

```
odd-analyzer/  (backend Node/TS — substitui o Python)
  src/
    model/        ← motor: poisson, nbinom, dixon-coles, shrinkage  (math puro)
    odds/         ← de-vig, american→decimal, EV/edge
    candidates/   ← builder + filtro (cortes edge/EV)
    providers/    ← BSD client, odds, IA (OpenRouter) — fetch nativo
    crosswalk/    ← lineup-id → stats-id (casamento por nome)
    service/      ← service.ts: funções que a API expõe (espelha service.py)
    backtest/     ← calibração (Brier/ECE/logloss/BrierSkill) + coletores
    store/        ← SupabaseRepo + InMemoryRepo
    lib/mathx.ts  ← lgamma (Lanczos), factorial — primitivas que faltam no Math
  api/            ← Express: rotas REST finas, Zod valida, chamam service/
  test/           ← vitest (espelha os 45 arquivos do pytest)

odd-analyzer-frontend/  (Next.js)
  app/            ← 2 telas (pré-jogo, pós-jogo)
  lib/api.ts      ← cliente REST tipado, único ponto que fala com o backend
```

### Design pattern central: Ports & Adapters

O motor não conhece HTTP, banco, nem fornecedor de dados. Tudo entra por **interfaces** (`StatsProvider`, `OddsProvider`, `Repo`, `Analista`). Em produção entram os adapters reais (BSD, OpenRouter, Supabase); em teste, fakes (`InMemoryRepo`, `ManualOdds`, `OnlyPlayer` — já existem no Python e se preservam 1-pra-1).

```
Express (api/)  →  service/  →  pipeline  →  model/ (math puro)
                      ↓             ↑
                   Repo        Providers (interfaces)
                      ↓             ↑
                 Supabase     BSD / OddsAPI / OpenRouter (adapters)
```

### Regra de ouro do port

Tradução **1-pra-1, arquivo por arquivo**, preservando nomes de domínio e a fronteira do `service`. Nada de "melhorar enquanto traduz". Isso é o que permite o gate de paridade funcionar.

## Gate de paridade — protege o "detector de mentira" (calibração)

O port só é confiável quando provar que **não mudou os números**:

1. **Fixtures douradas (golden files):** rodar o backtest Python atual e exportar as saídas (probabilidades por candidato e Brier/ECE/logloss/BrierSkill por mercado) para JSON commitado.
2. **Teste de paridade em TS:** o backtest TS lê os mesmos dados de entrada e tem que reproduzir as golden files dentro de tolerância (**1e-9** nas probabilidades; métricas idênticas).
3. **Regra rígida:** enquanto a paridade não bater em SOT/finalizações/desarmes (os 3 mercados que "prestam" na calibração), **nenhum dinheiro real**. Gols não calibra → continua selado em validação, igual hoje.

Equivalente, em código, ao princípio inegociável do CLAUDE.md: validação-primeiro, sem auto-engano.

### Teste dedicado de `lgamma`

Uma tabela de valores `lgamma(x)` do Python vira fixture; o TS tem que reproduzi-la. Se essa tabela passar, o motor de contagem inteiro passa (já validado no spike acima).

## Contrato da API REST (Express → service/)

Rotas finas; Zod valida entrada/saída; a lógica fica no `service/`.

| Método | Rota | Service | Uso |
|---|---|---|---|
| GET | `/ligas` | `listarLigas` | catálogo de ligas |
| GET | `/ligas/:id/jogos?status=` | `listarJogos` | jogos pré (`notstarted`) / pós (`finished`) |
| GET | `/jogos/:eventId/escalacao` | `escalacaoProvavel` | picker de jogador (crosswalk lineup→stats-id) |
| POST | `/analisar` | `analisar` | varredura do elenco → candidatos com edge/EV/IA |
| POST | `/paper` | `apostarPaper` | grava aposta-papel (bloqueia mercado em validação) |
| GET | `/jogos/:eventId/resultado?market=&linha=` | `resultadoRealJogador` | modo pós-jogo (actuals) |

**Erros:** classe `AppError` (status + código + mensagem) → middleware único traduz para JSON `{erro, codigo}`. Erros de domínio (mercado desconhecido, jogador fora do elenco) viram 400 com mensagem clara.

## Entregável: CLAUDE.md em cada repo (primeiras tarefas do plano)

### `odd-analyzer/CLAUDE.md` (reescrito — backend Node/TS)

Preserva a doutrina de **Produto** e o **Glossário** que já existem (são independentes de linguagem). Substitui a parte técnica Python pela do backend Node/TS. Convenções a documentar:

- **TS estrito** (`strict: true`), sem `any` solto; ESM; nomes de domínio em PT (`candidatos`, `edge`, `prob_devig`).
- **Ports & Adapters:** domínio (`model/`, `candidates/`, `odds/`) **não importa** `express`, `supabase`, nem `fetch`. Dependências entram por interface.
- **Funções puras no motor** — sem I/O, sem estado global. Determinístico = testável.
- Toda probabilidade passa pelas funções do `model/` — money-path nunca confia em float frouxo.
- Validação de borda só com **Zod**; nada de checagem manual espalhada.
- Gate de paridade é obrigatório antes de qualquer dinheiro real.
- Supabase: ver tabelas/MCP (preservar seção existente, adaptando a key para `@supabase/supabase-js`).
- Doc viva: manter ROADMAP.md e PITCH.md atualizados (preservar regra existente).

### `odd-analyzer-frontend/CLAUDE.md` (criado do zero — front Next)

- **Next App Router** + TS. Server Components para dados; Client Components só onde há interação (pickers).
- **`lib/api.ts`** = único ponto que fala com o backend (fetch tipado). Nenhum componente faz `fetch` solto.
- 2 telas: **Pré-jogo** (liga→jogo→mercado→`/analisar`→tabela de candidatos com edge/EV; sela mercado em validação) e **Pós-jogo** (jogo→mercado→linha→resultado real).
- Visual **simples e limpo** (CSS/Tailwind básico, sem libs pesadas). Foco em funcionar ponta-a-ponta.
- Incluir o **Glossário do dono** (linguagem leiga) — o dono não lê código.
- URL do backend via variável de ambiente.

## Testes

- **Vitest** espelhando os 45 arquivos do pytest (cobertura 1-pra-1).
- **Fixtures douradas + teste de paridade** (já provado que passa no spike).
- Fakes em vez de rede/banco (`InMemoryRepo`, `ManualOdds`, `OnlyPlayer` portados).

## Ordem de execução (alto nível — detalhe no plano)

1. CLAUDE.md de ambos os repos (padrão antes de codar).
2. `lib/mathx.ts` + teste de `lgamma` contra fixture Python.
3. Motor (`model/`, `odds/`, `candidates/`) com testes espelhados.
4. Golden files do backtest Python + teste de paridade em TS. **Gate.**
5. Providers + crosswalk + store (adapters).
6. `service/` + API Express + Zod.
7. Front Next (2 telas) consumindo a API.
8. Descontinuar o Python; atualizar ROADMAP/PITCH.

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| `lgamma` divergir e quebrar calibração | **Já testado**: Δ 1e-15. Teste de paridade trava regressão. |
| Port introduzir mudança silenciosa de número | Tradução 1-pra-1 + golden files + tolerância 1e-9. |
| Diferença de arredondamento entre engines | Tolerância explícita nos testes; nenhuma "melhoria" antes da paridade. |
| Front e back desincronizarem o contrato | Tipos derivados do schema Zod; `lib/api.ts` como ponto único. |
| Calibração liga-clube não transferir p/ seleções da Copa | Pré-existente, fora desta migração; segue como validação forward. |
```

