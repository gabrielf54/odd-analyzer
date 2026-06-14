# Superbet — 🟠 2ª onda (a mapear)

| | |
|---|---|
| **Status** | 🟠 Não implementada. Candidata da **2ª onda** (dificuldade média). |
| **Plataforma** | **Betler** (plataforma própria da Superbet). |
| **Anti-bot (intel inicial)** | Odds servidas via **Fastly** aparentemente **sem WAF**; porém o **api-gateway tem geoblock**. |
| **Geoblock** | Provável — **mitigar rodando local no BR** (como nas outras). |
| **Como buscar (hipótese)** | Provavelmente `fetch` puro (Fastly permissivo); se houver challenge, cair pro headless. |

> ⚠️ A intel acima é da **avaliação de viabilidade** (agentes, possivelmente de fora do BR — pessimista).
> Nada foi capturado/confirmado ainda. Tratar como ponto de partida, não como verdade.

## O que falta (seguir o Playbook do [README](../README.md#6-playbook--adicionar-uma-casa-nova-ex-betano))

1. **Capturar** o endpoint de prop de jogador (deslogado, no BR): abrir um jogo da Copa, aba de prop,
   F12 → Network (ou headless gravando a rede, como fizemos na Betnacional). Anotar URL + params +
   shape + onde estão jogador/linha/odd + liquidação.
2. Confirmar se o `fetch` puro do BR passa (Fastly) ou se precisa do headless.
3. Achar a **lista de jogos** do torneio (pro crosswalk) — endpoint que liste os jogos com id + times.
4. Parser `src/collect/adapters/superbet.ts` + de-para em `tables.ts` + registrar no `collectOdds.ts`.

## Perguntas a responder na captura

- Os props de jogador vêm no **mesmo** endpoint dos mercados de partida ou num separado?
- A linha é campo numérico (como a KTO) ou está no **nome** do mercado (escada "N+", como a Betnacional)?
- Como a casa **liquida** desarme (ganho vs tentativa) e falta (cometida vs sofrida)?
- O id do jogo é Sportradar (`sr:match:`), interno, ou outro? (define o crosswalk)
