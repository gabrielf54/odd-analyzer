# Coletar Odds v2 — persistência, layout em fases, detalhe do jogador, métricas → IA

**Data:** 2026-06-10 · **Status:** aprovado (dono delegou decisões de UX)
**Repos afetados:** `odd-analyzer` (backend, este repo) + `odd-analyzer-frontend` (Next.js)

## Problema

A tela `/coletar` do front é a única usada hoje pra analisar jogos, e tem quatro dores:

1. **F5 perde tudo** — liga, jogo, lote colado (176 linhas), resultado da análise. Estado é `useState` puro em `app/coletar/page.tsx`.
2. **Formulário infinito** — coluna única de ~2000px; Passo 1 + Passo 2 + recomendação + 9 candidatos + recusadas, tudo empilhado e expandido. Cada feature nova alonga o corredor.
3. **Sem camada de detalhe do jogador** — não dá pra ver *por que* o número saiu (médias recentes, casa×fora, o que o adversário cede), em linguagem leiga.
4. **Métricas detalhadas não chegam na IA revisora** — o motor calcula janelas w3/w5/w10 (`src/model/assemble.ts`) mas descarta após virar o rate; o revisor (`src/ai/reviewer.ts`) recebe só agregados (`amostra_jogos`, `concedido_adversario`, `concedido_posicao`, etc.), nunca "média de 2,8 desarmes nos últimos 5 jogos" ou casa×fora.

**Restrição do dono:** linguagem 100% leiga na UI e na explicação ("média de X desarmes em X jogos"), nunca jargão ("edge > 0", "money-path"). O design system atual (terminal quant, verde=valor, mono) **agrada e não muda**.

## Achado que molda o design

O backend **já gera** narrativa leiga passo-a-passo: `trace.passos[].frase` (ex.: *"Nos últimos 5 jogos fez 14 desarmes em 390 min — ritmo de 3.23 por 90 min"*) e `veredito_leigo` (`src/model/trace.ts`). O detalhe do jogador reusa isso — não se inventa uma segunda camada de explicação.

## Design

### 1. Persistência (front)

- **Liga + jogo → URL** (`?league=&match=`), reusando `useUrlState` de `lib/urlState.ts` (a tela "Buscar Valor" já usa). F5 e compartilhamento de link restauram a seleção.
- **Lote colado → localStorage** por jogo: chave `oa:coletar:lote:<eventId>`, via `useLocalStorage` existente.
- **Resultado da análise → localStorage** por jogo: `oa:coletar:resultado:<eventId>` (payload completo de `/analise/manual` + `coletado_em`). F5 num jogo já analisado cai direto na fase resultado.
- "Limpar lote" limpa lote **e** resultado do jogo. Trocar de jogo não apaga nada — cada evento tem suas chaves.
- Sem mudança de backend para persistência. (Cache Supabase `analises` existe mas não tem GET; fica como evolução futura, fora deste escopo.)

### 2. Layout em fases (front)

- Mesma rota `/coletar`, duas fases internas: **coleta** e **resultado**. Fase derivada do estado: tem resultado → `resultado`; senão → `coleta`.
- Pós-análise, Passo 1 + Passo 2 **colapsam numa barra compacta**: `LOTE · 176 linhas · analisado 17:00 · [editar] [re-analisar]`. Clicar em editar reexpande a coleta (resultado continua abaixo, colapsado).
- Na fase resultado, a recomendação abre no topo da viewport — zero scroll por formulário usado.
- Regra de evolução: feature nova entra como seção colapsada ou tab dentro da fase certa — o corredor não volta a crescer.

### 3. Candidatos com densidade controlada (front)

- Agrupamento por jogador mantido, mas **colapsado por padrão**: header do jogador mostra a melhor linha + badge de risco + badge de escalação; expandir revela as demais linhas.
- **Filtros em chips** acima da lista: por mercado (desarmes / SOT / finalizações) e por risco (seguro / moderado / tiro-longo). Toggle, combináveis.
- Reprovados e linhas recusadas atrás de collapse com contagem no título (ex.: `LINHAS RECUSADAS · 1`).
- **Tradução de jargão na UI:**
  - `EDGE > 0` → "vantagem a favor"
  - `FORA DO MONEY-PATH` → "fora da análise"
  - Motivo de recusa: mapa motivo→frase leiga (ex.: `odd_over deve ser > 1.01` → "a odd veio inválida (1.01 ou menor) — confira o que a IA copiou"); JSON cru fica atrás de um `<details>` "ver dado bruto".

### 4. Detalhe do jogador — drawer lateral (front + backend)

Clicar num candidato abre **drawer à direita** (aproveita largura ociosa do desktop; lista continua visível; fecha com X/Esc). Não é rota nova nem modal. Três seções, tudo leigo:

1. **Números do jogador** — do novo bloco `stats_detalhadas` (backend, abaixo): média nos últimos 5 e 10 jogos, valores jogo a jogo (últimos 5), minutos médios, **casa × fora**.
   - *Casa × fora é condicional:* só aparece se o dado por-jogo do BSD trouxer mando (verificar na implementação inspecionando a resposta real de `playerStats`; `windowedRate` já aceita filtro `mando`). Se o dado não existir, a linha **some** — nunca estimar.
2. **O confronto** — o que o adversário cede naquele mercado e pra posição do jogador, em frase (reusa `concedido_adversario` + `concedido_posicao`).
3. **Como chegamos no número** — as `frases` de `trace.passos` renderizadas como narrativa sequencial + `veredito_leigo` no fim. Requer trace presente na resposta de `/analise/manual` (hoje atrás de flag de diagnóstico — passar a incluir sempre, ou incluir `stats_detalhadas` sempre e trace sob demanda; decidir no plano pelo custo de payload).

### 5. `stats_detalhadas` (backend) e métricas → IA

Novo bloco por candidato em `/analise/manual` (e `/analisar`), chaves no fio em snake_case PT (convenção inegociável):

```
stats_detalhadas: {
  media_5: number | null,        // média por jogo nos últimos 5 (per-jogo, não per-90 — leigo entende "por jogo")
  media_10: number | null,
  ultimos_valores: number[],     // valor da stat nos últimos 5 jogos, recente primeiro
  minutos_medios: number | null,
  media_casa: number | null,     // null se BSD não der mando por jogo
  media_fora: number | null
}
```

- Fonte: os mesmos `games` que `entityRate` já busca (`src/providers/stats.ts`) — é não-jogar-fora, não cálculo novo. Funções puras em `src/model/` (testáveis offline).
- **IA:** o JSON por candidato enviado ao revisor (`src/ai/reviewer.ts`) passa a incluir `stats_detalhadas`. `PROMPT_REVISOR` atualizado: pode citar essas médias na nota; segue **proibido inventar** qualquer número não recebido; segue regra de no máx. 1–2 números traduzidos por texto.
- **Money-path intocado:** `stats_detalhadas` é descritivo, não entra em `prob_modelo`/edge/EV. Gate de paridade (`test/parity/`) não é tocado.

### 6. Fora de escopo / não muda

- Design system (cores, tipografia, componentes base), fluxo copiar-prompt → colar-JSON, motor estatístico, telas Pré-jogo e Pós-jogo.
- Endpoint GET de análise cacheada (Supabase) — evolução futura.
- Dado direcional/zonal (norte condicionado a dado free, ver CLAUDE.md).

## Alternativas descartadas

- **Rotas separadas** (`/coletar/[match]/resultado`): mais navegação sem ganho pra ferramenta de usuário único.
- **Modal de detalhe**: cobre a lista, perde comparação lado a lado.
- **Store global (Zustand/Context)**: localStorage + URL state resolvem com os hooks que o repo já tem.
- **Persistir análise no Supabase com GET**: certo a longo prazo, desnecessário pro F5 — localStorage entrega igual sem tocar backend.

## Critérios de aceite

1. F5 em qualquer ponto do fluxo (jogo selecionado, lote montado, análise feita) restaura o estado completo.
2. Pós-análise, a recomendação aparece sem rolar por formulário; coleta acessível via barra compacta.
3. Drawer de detalhe mostra médias reais do jogador em frases leigas; casa×fora só com dado real.
4. JSON enviado ao revisor contém `stats_detalhadas`; nota da IA pode citar média recente sem inventar número.
5. Zero jargão visível na UI (edge, money-path, mensagens de validação cruas).
6. Testes: funções puras de `stats_detalhadas` com Vitest no backend; parse/persistência no front; suíte existente verde (207+ backend).
