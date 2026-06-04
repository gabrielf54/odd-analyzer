# Plano 3 — Front Next (odd-analyzer-frontend) Implementation Plan

> Executar com executing-plans. Repo: `C:\Users\gabri\Documents\projects\odd-analyzer-frontend` (separado).

**Goal:** Front Next.js básico, limpo, replicando o fluxo do Streamlit (2 telas/2 modos), consumindo a API Express do backend via REST.

**Architecture:** Next App Router + TS + Tailwind. `lib/api.ts` é o único ponto que fala com o backend (fetch tipado). Server Components p/ dados; Client Components só nos pickers/interação.

**Tech Stack:** Next 15 (App Router), TypeScript, Tailwind.

**Backend:** API em `http://localhost:3001` (var `NEXT_PUBLIC_API_URL`).

---

## Task 1: Scaffold Next + CLAUDE.md do front

- [ ] `npx create-next-app@latest . --ts --app --tailwind --eslint --no-src-dir --import-alias "@/*" --use-npm` (não-interativo) no repo do front.
- [ ] Criar `.env.local` com `NEXT_PUBLIC_API_URL=http://localhost:3001`.
- [ ] Criar `CLAUDE.md` do front (1ª tarefa por spec): App Router + TS; `lib/api.ts` único ponto de fetch; 2 telas (pré/pós); visual simples; **Glossário do dono** (leigo) — valor=modelo vs odd de-vig, NUNCA prob alta; calibração/CLV/lineup em linguagem simples; URL do backend via env.
- [ ] Commit.

## Task 2: lib/api.ts + tipos

- [ ] `lib/types.ts`: `Liga`, `Jogo`, `Jogador`, `Escalacao`, `Candidato`, `AnaliseResult`, `ResultadoReal` (espelham o JSON do backend; chaves snake_case).
- [ ] `lib/api.ts`: `getLigas()`, `getJogos(ligaId,status)`, `getEscalacao(eventId)`, `postAnalisar(body)`, `getResultado(eventId,market,linha)`. Cada um faz `fetch(\`${API}/...\`)`, trata `{erro,codigo}` lançando `Error`. Base = `process.env.NEXT_PUBLIC_API_URL`.
- [ ] Commit.

## Task 3: Tela Pré-jogo

- [ ] Rota `/` (ou `/pre`): seleciona Liga → Jogo (notstarted) → Mercado → linha/odds → botão Analisar → tabela de candidatos (jogador, linha, prob_modelo, prob_devig, edge, ev) ordenada por EV. Sela mercado `em_validacao` ("não apostar — em validação").
- [ ] Client Component p/ os selects e o fetch de análise; mostra alertas da IA.
- [ ] Commit.

## Task 4: Tela Pós-jogo

- [ ] Rota `/pos`: Liga → Jogo (finished) → Mercado → linha → mostra resultado real por jogador (valor_real, bateu).
- [ ] Commit.

## Task 5: Nav + polish

- [ ] Layout com nav entre as 2 telas; estados de loading/erro; visual limpo com Tailwind.
- [ ] `npm run build` passa. Commit.

## Self-Review
- 2 telas/2 modos cobertas (Tasks 3,4). lib/api único ponto (Task 2). CLAUDE.md front (Task 1). Visual simples (Task 5). ✓
