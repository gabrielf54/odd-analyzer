# Spec — Docker local sempre ligado (odd-analyzer)

**Data:** 2026-06-22 · **Status:** aprovado (dono autorizou seguir até a implementação)

## Objetivo

Rodar backend + front em containers que **sobem no boot e se reerguem sozinhos** (Docker Desktop
"iniciar ao logar" + `restart: unless-stopped`), sem `npm run dev` manual. **Roda LOCAL na máquina
do dono (BR)** — restrição inegociável: os coletores precisam de IP brasileiro (casas dão 403 fora
do BR; Stake/Betano exigem headless por JA3/TLS). Cloud estrangeira quebraria a coleta → fora.

## Arquitetura

`docker-compose.yml` (no repo backend) com 2 serviços, ambos `restart: unless-stopped`:

### backend (Playwright + scheduler 24h)
- Base **`mcr.microsoft.com/playwright:v1.60.0-jammy`** (Node + Chromium + libs do headless;
  casa com Playwright ^1.60). `npm ci` (tem `package-lock.json`) + `npx playwright install chromium`
  (garante o browser na versão certa). Roda via **`tsx`** (`npm start` novo = `node --import tsx
  src/api/server.ts`) — sem passo de build; o daemon é longo.
- Env: `PORT=5926`, `SCHEDULER_ENABLED=true`, `PW_NO_SANDBOX=1`; segredos via **`env_file: .env`**
  (NÃO assados na imagem — `.env` no `.dockerignore`). Porta `5926:5926`.
- **Chromium em container:** `browserFetch.launchWithRetry` ganha `args` condicionais — quando
  `PW_NO_SANDBOX=1` passa `--no-sandbox --disable-dev-shm-usage` (necessário rodando como root em
  Docker; gateado por env → local Windows inalterado).
- **Healthcheck:** `node -e fetch('http://localhost:5926/scheduler/status')` (auto-restart se travar).

### frontend (Next)
- Base **`node:20-slim`**: `npm ci` → `next build` → `next start -p 5927` (`npm start` novo). Porta
  `5927:5927`. **`NEXT_PUBLIC_API_URL=http://localhost:5926`** como build-arg (Next inlina no build;
  o navegador roda na máquina do dono → `localhost:5926` cai no backend via porta mapeada). Sem segredo.

## Arquivos
- Backend (novos): `Dockerfile`, `.dockerignore`, `docker-compose.yml` (front via `context:
  ../odd-analyzer-frontend`). Edit: `package.json` (+script `start`); `src/cli/browserFetch.ts`
  (`--no-sandbox` por env).
- Front (novos): `Dockerfile`, `.dockerignore`. Edit: `package.json` (`start` → `next start -p 5927`).

## Operar
- Subir/atualizar: `docker compose up -d --build` (uma vez; re-roda pra deploy de código novo).
- Sempre-ligado: Docker Desktop em "iniciar ao logar" + `restart: unless-stopped` → containers no boot.

## Fora de escopo (YAGNI)
Sem cloud/registry/CI; sem live-reload (imagem buildada = correto p/ daemon 24/7); TZ irrelevante
(scheduler usa epoch UTC); persistência segue no Supabase (sem volume/DB local).

## Pronto quando
`docker compose build` passa nos 2 · `up -d` sobe os 2 · `GET localhost:5926/scheduler/status`
responde · front carrega em `localhost:5927` · gate de paridade/testes intactos (mudança de código
mínima e gateada).
