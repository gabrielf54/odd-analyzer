# Betano — 🔴 difícil (hoje: fallback manual)

| | |
|---|---|
| **Status** | 🔴 Não implementada. A mais difícil das 4 "casas moles". Hoje entra **manual** (odds coladas, book `Betano`). |
| **Plataforma** | **Kaizen Gaming** (mesma da Stoiximan). |
| **Anti-bot (intel inicial)** | **Geoblock duro** + **Cloudflare Turnstile** + os **props de jogador ficam numa camada separada ("GameplAI")**, não no mesmo feed dos mercados de partida. |
| **Geoblock** | Forte — **rodar local no BR é obrigatório**, e mesmo assim o Turnstile pode exigir o headless. |

> ⚠️ Intel da avaliação de viabilidade (pessimista, agentes de fora do BR). A realidade no seu IP do BR
> pode ser mais fácil — **só uma captura local confirma**.

## Por que é a mais difícil

- **Turnstile** (challenge da Cloudflare estilo CAPTCHA): o `fetch` puro não passa. O **navegador
  headless** (`browserFetch`, já pronto) é o caminho — ele resolve challenges de Cloudflare; Turnstile
  *invisível* costuma passar, mas o *interativo* pode exigir `HEADFUL=1` (janela real, clique humano).
- **Camada GameplAI separada:** os props de jogador podem vir de um endpoint/serviço diferente dos
  mercados de partida — a captura precisa achar **especificamente** a chamada dos props (abrir a aba de
  jogador e ver qual request dispara), não a dos mercados principais.

## Como atacar (quando for a hora)

Seguir o [Playbook](../README.md#6-playbook--adicionar-uma-casa-nova-ex-betano), com atenção a:

1. **Captura no BR, deslogado**, com o headless gravando a rede (`page.on('request')`) **enquanto abre
   a aba de props de jogador** — o objetivo é isolar a chamada da camada GameplAI. (Foi assim que
   achamos a lista da Betnacional.)
2. Se o Turnstile bloquear o headless silencioso → `HEADFUL=1` e resolver o challenge na janela uma vez
   (o `cf_clearance`/sessão fica no contexto do navegador para as chamadas seguintes).
3. Mapear o shape dos props (jogador/linha/odd), a **liquidação** e o **id do jogo** (crosswalk).
4. Se a captura confirmar que é inviável de forma estável → **manter no balde manual** (book `Betano`,
   coladas), que já convive no banco com as automáticas. Não é fracasso: é a decisão de custo/benefício.

## Situação atual no produto

As odds do Betano hoje entram **manualmente** (você cola; book = `Betano`) e **já convivem** no mesmo
jogo com `kto`/`betnacional` no line shopping — ex.: no evento 8295, havia 369 linhas manuais do Betano
junto das automáticas. Ou seja: automatizar a Betano é **otimização**, não bloqueio.
