# Backend (API + agendador 24h + coletores Playwright headless).
# Base oficial do Playwright (já traz Node + Chromium + libs do headless) casando com ^1.60.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# Deps primeiro (cache de camada). package-lock.json existe → npm ci (instala devDeps também:
# o runtime usa `tsx`, que é devDependency — NÃO omitir dev).
COPY package.json package-lock.json ./
RUN npm ci
# Garante o browser na versão exata do playwright instalado (idempotente; respeita
# PLAYWRIGHT_BROWSERS_PATH do base image).
RUN npx playwright install chromium

COPY . .

# Roda LOCAL no BR (geoblock). PW_NO_SANDBOX liga --no-sandbox no Chromium (root em container).
ENV PORT=5926 \
    SCHEDULER_ENABLED=true \
    PW_NO_SANDBOX=1

EXPOSE 5926

# Liveness: o endpoint do agendador. Node 20 (base) tem fetch global.
HEALTHCHECK --interval=60s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:5926/scheduler/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
