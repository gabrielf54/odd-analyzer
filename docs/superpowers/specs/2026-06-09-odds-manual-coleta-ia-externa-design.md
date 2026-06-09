# Coleta manual de odds via IA externa — design

**Data:** 2026-06-09
**Branch:** `feat/odds-manual-coleta-ia-externa`
**Estado:** spec aprovado (brainstorming), pré-plano

## Problema

Não existe API de odds barata (<$20) para SOT/props de jogador da Copa. Para
**validar o produto agora** sem pagar SGO Pro ($299), o operador coleta odds à
mão usando uma IA externa (Claude na extensão do Chrome) que lê o site da casa e
devolve JSON estruturado. Esse JSON entra na plataforma e dispara a análise GERAL
de todos os mercados do jogo.

Não é o estado final (odd colada envelhece, coleta manual não escala). É o
caminho **$0 para destravar validação forward** antes da Copa.

## Decisões travadas (brainstorming)

1. **Colagem fatiada por mercado/aba**, não tudo-de-uma-vez. A extensão lê o DOM
   visível; pedido único de centenas de linhas (22-30 jogadores × 3 mercados ×
   N linhas) com lazy-load → omissão/alucinação. Pedidos menores = leitura fiel.
   O front acumula os pedaços num array só e manda uma vez.

2. **Jogador = só OVER, sem de-vig.** A casa raramente cota over E under de prop
   de jogador (mostra "1+, 2+ SOT", só o lado over). Sem dois lados, de-vig não
   roda. Decisão: comparar `prob_modelo` contra a **implícita crua** do over.
   - É **conservador e honesto**: odd crua tem margem embutida → implícita
     inflada → teste mais difícil de passar → nunca sinaliza valor-fantasma
     vindo só da margem. E o EV na odd crua é o EV real embolsado.
   - O candidato sai **marcado `sem_devig: true`** para não confundir com os de
     partida (que têm dois lados e de-vig normal).

3. **Matching de jogador = híbrido A+C com persistência.** Auto-casa por nome
   (crosswalk Dice existente); incertos/sem-match **não são descartados calados**
   — sobem para o operador confirmar (1 clique), e o confirmado é salvo em
   `jogadores_crosswalk`. Fail-closed mantido: na dúvida nunca casa errado.
   Cobertura sobe sozinha conforme o crosswalk enche (Copa semeia, ligas enchem).

4. **Backend dono da lógica, front Next dono do pixel.** Prompt e validação moram
   ao lado do `MarketSpec` (um lugar só). Mercado novo = template + spec novos,
   endpoint não muda.

## Arquitetura

Backend **stateless**, dois endpoints:

```
GET  /prompt?event_id=X&market=Y
  → string do prompt pronto pra colar no Claude-extensão.
    Mercado de jogador: embute a lista de jogadores do lineup BSD
    (ancla a IA nos nomes que o crosswalk conhece).

POST /analise/manual
  body: { event_id, odds: OddsLine[], coletado_em }   ← Zod na borda
  → ManualOdds(odds) → runner roda TODOS os 6 mercados
  → { candidatos, reprovados, jogadores_sem_match, linhas_rejeitadas }

POST /crosswalk
  body: { nome_casa, player_id }   ← liga nome da casa ao jogador
  → salva em jogadores_crosswalk
```

`ManualOdds` (já existe em `src/providers/odds.ts`) recebe o array e alimenta o
pipeline. O motor (`model/`, `value/`) **não muda** — gate de paridade 1e-9
intocado. Só muda a entrada de odds e o caminho single-side no `value/`.

## Contrato do JSON (o fio — snake_case PT)

```jsonc
{
  "event_id": "abc123",
  "coletado_em": "2026-06-14T18:30:00Z",
  "odds": [
    { "market_type": "escanteios", "entidade": "partida",
      "linha": 9.5, "odd_over": 1.90, "odd_under": 1.90, "book": "bet365" },
    { "market_type": "vitoria", "entidade": "Germany",
      "odd_over": 1.75, "book": "bet365" },
    { "market_type": "sot", "entidade": "K. Havertz",
      "linha": 0.5, "odd_over": 2.10, "book": "bet365" },
    { "market_type": "desarmes", "entidade": "J. Kimmich",
      "linha": 1.5, "odd_over": 1.95, "book": "bet365" }
  ]
}
```

### Validação Zod (fail-fast, na borda)

- `odd_over` > 1.01; `odd_under` opcional (> 1.01 quando presente).
- `market_type` ∈ {gols, vitoria, escanteios, sot, finalizacoes, desarmes}.
- Mercado de jogador → `entidade` ≠ "partida" e `linha` presente.
- Partida (gols/escanteios) → exige os dois lados; sem eles a linha vai para
  `linhas_rejeitadas` (de-vig impossível).
- `coletado_em` obrigatório (idade da odd).

O que não passa **não entra no money-path** — volta em `linhas_rejeitadas` para
o operador inspecionar o que a IA/casa mandou torto. Essa validação dura é a
defesa contra erro de leitura da IA externa.

## Prompt gerado (exemplo — jogador SOT)

```
Você está na página de apostas do jogo Germany x Scotland na bet365.
Aba: "Jogador - Finalizações no Gol" (Shots on Target).

Colete SOMENTE as odds OVER ("Mais de") de cada jogador desta lista:
- K. Havertz
- J. Kimmich
[...lista do lineup BSD...]

Para CADA jogador e CADA linha visível, devolva uma entrada.
Expanda TODAS as seções/acordeões antes de ler. Se um jogador da lista
não aparecer, OMITA — não invente. Não chute odd que você não viu.

Devolva APENAS JSON neste formato, nada mais:
[ { "market_type": "sot", "entidade": "<nome exato da lista>",
    "linha": <number>, "odd_over": <number>, "book": "bet365" } ]
```

- Lista de jogadores embutida → IA copia o nome que o crosswalk conhece.
- Anti-alucinação explícito ("omita, não invente, não chute").
- "Expanda acordeões" ataca o lazy-load.
- Mercado de partida: prompt pede os DOIS lados (over/under, ou 3 do 1X2).
- Templates em `src/prompts/`, ao lado dos `MarketSpec`.

## Fluxo de matching (POST /analise/manual)

```
pra cada linha de jogador:
  match = crosswalk.casar(entidade, jogadores_do_lineup_BSD)
  ├─ score alto       → casa, segue pro motor
  ├─ score baixo      → NÃO descarta calado → jogadores_sem_match
  └─ já salvo no xwalk → casa direto

resposta:
  jogadores_sem_match: [ { nome_casa, candidatos: [nomes prováveis] } ]
```

Front mostra `jogadores_sem_match` → operador liga 1 clique → `POST /crosswalk`
salva → re-roda análise. Próximo jogo: automático.

## Testes (offline, fakes existentes)

- Zod: rejeita odd ≤ 1.01 / mercado desconhecido / partida sem 2 lados →
  `linhas_rejeitadas`.
- Single-side jogador → candidato com `sem_devig: true`, EV na odd crua.
- Matching: nome óbvio casa; ambíguo → `jogadores_sem_match`; xwalk salvo casa.
- Gerador de prompt: jogador embute lista; partida pede 2 lados.
- Gate de paridade (1e-9) inalterado — motor não é tocado.

## Fora de escopo (YAGNI)

- De-vig por over-round de linhas alternativas (1+/2+/3+) — fica para depois se a
  cobertura "só over" se mostrar insuficiente na validação.
- Atualização ao vivo da odd / re-scrape automático — é coleta manual de foto.
- Persistência de rascunho no backend — front acumula, backend stateless.
```

