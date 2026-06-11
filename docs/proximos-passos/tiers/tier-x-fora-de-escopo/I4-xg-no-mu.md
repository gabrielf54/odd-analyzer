# I4 — xG/xA do jogador no μ de SOT/finalizações

## 1. TL;DR
Em tese, usar **`expected_goals`/`expected_assists`** (o "chute sem ruído") para de-noisar o μ de
**sot** e **finalizações** seria mais preditivo que a contagem crua. **Na prática está fora de escopo
para a Copa agora:** a sondagem provou que `expected_goals` vem **`NULL` em seleção** (jogador *e*
time), e as Copas passadas têm player-stats **vazio** — não há xG nem para usar ao vivo nem para calibrar.

## 2. Status
- **Ajuda à meta:** seria **Médio/Alto** *se o dado existisse* — mas é **inalcançável agora**.
- **Pronto p/ Copa:** ❌ **Não** (dado ausente em seleção).
- **Esforço:** **N/A agora**; **Médio-Alto** quando/se reabrir (recalibração + re-freeze de paridade).
- **Risco de calibração/paridade:** **Alto** se implementado (mudar o μ quebra a golden EPL → re-congelar + recalibrar tudo).
- **Custo de dado:** $0 em tese (a BSD já entrega o campo) — mas **vem vazio para seleção**, então o
  custo real é "comprar uma fonte com xG de seleção", o que **fura o orçamento ~$20** e está fora de escopo.

## 3. Problema / fundamento
A contagem crua de finalizações/SOT é **ruidosa**: um jogo o jogador chutou 1× de longe, no outro
acertou 4 finalizações claras — a contagem trata os dois como "1" e "4" sem qualificar. O **xG** mede
a **qualidade** de cada chance (probabilidade de virar gol), então é o "chute sem ruído": teoricamente
um μ ancorado em xG **acumulado por 90min** convergiria mais rápido e seria mais preditivo do volume
real de finalização/SOT do que a média de contagem. É um insumo melhor **para o número** — não muda o
critério de valor (`prob_modelo > prob_devig`) nem a IA, que continua sem calcular nada.

**Por que não viola os princípios:** xG entraria como **insumo do μ no código** (money-path puro), não
como filtro de "prob alta" nem como cálculo da IA. O problema **não é doutrinário** — é **dado**: o
insumo não existe para a população que vamos apostar.

## 4. Evidência real (sondagem 2026-06-11)
- **Seleção (amistoso, event 9099):** `expected_goals` e `expected_assists` vieram **`NULL` em TODOS os
  46 jogadores** — **0/46 com xG**. O `expected_goals` de **time** também veio `undefined`. Confirmado
  pela tabela do [README raiz §1.2](../../README.md#12-o-que-a-sondagem-provou-números-reais):
  *"46 jogadores com 40 campos (cross, won_tackle, dribles, duelos, interceptação, key_pass…) MAS
  `expected_goals`/`expected_assists` = NULL (jogador e time). xG não serve para seleção."*
- **Clube (Brasileirão, event 7166):** `expected_goals` do **jogador** **VEM preenchido** (ex.: `0.0207`).
  Ou seja, o campo existe e é populado para clube — a ausência em seleção é da **cobertura do dado**, não do schema.
- **Copas passadas (calibração):** seasons **189 (2022)** e **382 (2018)** têm 48+48 jogos `finished`,
  mas `/player-stats/` e `/stats/` vêm **VAZIOS** (sem player-stats, sem shotmap) — ver
  [README raiz §1.2](../../README.md#12-o-que-a-sondagem-provou-números-reais). Logo **não há xG de
  seleção nem ao vivo nem no passado** → nada para alimentar o μ e nada para calibrar.

**Conclusão factual:** não existe xG de seleção (a) para usar ao vivo na Copa, nem (b) para medir se o
μ-com-xG melhora o Brier/ECE na população Copa. Sem nenhum dos dois, a ideia **não tem como entrar no
money-path** (princípio validação-primeiro).

## 5. Estado atual no código (file:line)
- `src/model/markets.ts:23` — **sot** usa `stat_field: "shots_on_target"` (contagem crua).
- `src/model/markets.ts:29` — **finalizacoes** usa `stat_field: "total_shots"` (contagem crua).
- `src/model/markets.ts:35` — **desarmes** usa `stat_field: "total_tackle"` (contagem; fora do escopo de I4, mas idem padrão de contagem).
- O μ é montado a partir desse `stat_field` em `src/model/assemble.ts:61` (`playerMuFromGames` →
  `windowedRate` per-90 → `shrinkRate` → `assembleMu`). **Não há uso de `expected_goals`/`expected_assists`
  em lugar nenhum do motor** — uma busca por `expected_goals` no `src/` não retorna nada no money-path.
- Incorporar xG exigiria: novo campo no `MarketSpec`, novo caminho em `playerMuFromGames`/`windowedRate`
  para ler xG-per-90, e **re-priorizar/recalibrar** `prior_rate`/`prior_strength`/`nb_dispersion`
  (`src/model/params.ts`, "Calibrados no backtest EPL 2023"). Isso **muda o μ** → **quebra o gate de
  paridade 1e-9** (`test/parity/`, golden EPL) e força recalibração completa.

## 6. Por que está fora de escopo AGORA (e quando reabrir)
**Por que fora de escopo agora — três razões independentes, qualquer uma basta:**
1. **Dado ausente em seleção.** `expected_goals` = `NULL` em 46/46 jogadores no event 9099. Sem insumo,
   não há o que implementar para a Copa.
2. **Custo alto e certo.** Mudar o `stat_field`/μ quebra a golden EPL (paridade 1e-9) e obriga
   recalibração + re-freeze — trabalho Médio-Alto, contra ganho **zero** hoje.
3. **Não validável na população Copa.** Copas passadas (189/382) têm player-stats vazio → impossível
   medir offline (Brier/ECE/leave-one-out) se o μ-com-xG melhora **nas seleções**. Princípio
   validação-primeiro **proíbe** entrar no money-path sem essa prova.

**Gatilho exato para reabrir (e só então):**
> Um jogo da **Copa (liga 27)** **JÁ FINALIZADO** trouxer `expected_goals` **preenchido** nos
> `/events/{id}/player-stats/`.

A cobertura da Copa **ao vivo** pode diferir da de amistosos (o provedor às vezes só popula xG em
torneios majoritários, não em fogueiras de pré-temporada). **Verificar isso depois dos primeiros jogos
da Copa.** Se um número material de jogadores vier com `expected_goals != null` num jogo da liga 27
finalizado, a ficha **sai do Tier X** (provavelmente para o Tier 2 — diferencial, por exigir recalibração).
Mesmo então, só avança com **plano de validação offline** (Brier/ECE/leave-one-out em jogos de seleção
recentes com xG) — não direto para dinheiro.

## 7. Plano de validação (quando/se reabrir — não agora)
Só se aplica **após** o gatilho disparar:
- **Cobertura primeiro:** confirmar que xG de seleção vem em **N jogos** suficientes (não 1 jogo isolado).
- **Offline:** recalibrar o μ-com-xG e medir **Brier/ECE/leave-one-out** em jogos de seleção com xG
  disponível; **critério de aceite:** Brier/ECE **não pioram** vs o μ-contagem, idealmente melhoram.
- **Paridade:** re-congelar as golden de `test/parity/` **de propósito** (nunca silenciosamente),
  documentando a troca no ROADMAP.
- **Forward:** só depois, observar via `paper_ledger`/CLV (I7) se o sinal-com-xG bate o fechamento.

## 8. Riscos & armadilhas
- **Falso positivo de cobertura:** um único jogo da Copa com xG **não** basta — pode ser exceção.
  Exigir N jogos antes de mover a ficha.
- **`expected_goals` é fração pequena** (ex.: 0.0207 por evento de chute) — somar/normalizar errado
  (por-jogo vs per-90 vs por-chute) gera μ absurdo. Definir a unidade com cuidado.
- **Quebra de paridade é certa** ao mudar o `stat_field`/μ → tratar como recalibração formal, não patch.
- **Shift de população:** mesmo com xG, calibrar em "seleções com xG disponível" e aplicar na Copa
  inteira ainda é shift — re-medir na população certa.
- **Tentação de re-tentar sem ler isto:** o sintoma é "vou usar xG, é melhor que contagem" → **pare**,
  rode o comando do §12; se vier `NULL`, a resposta já está aqui.

## 9. Dependências
- **Gatilho de dado:** xG de seleção preenchido num jogo da Copa finalizado (§6/§12).
- **Se reaberto:** depende do protocolo de recalibração/paridade (mesmo de N2/Tier 2) e do loop forward
  (I7) para a fase de CLV.

## 10. Esforço
- **Agora:** **N/A** (decisão de não-fazer; só este registro).
- **Se/quando reabrir:** **Médio-Alto** — recalibração completa + re-freeze das golden de paridade +
  validação offline na população com xG (~1-2 dias, dependendo da cobertura do dado).

## 11. Checklist (de reabertura — não há aceite a fazer agora)
- [ ] Comando do §12 rodado num jogo da **Copa (liga 27) finalizado** e **quantos jogadores têm
      `expected_goals != null`** registrado (não suposição).
- [ ] Cobertura confirmada em **N jogos** (não 1 isolado).
- [ ] Se confirmado: ficha movida do Tier X para o tier correto no [README raiz](../../README.md#4-os-tiers-ordem-de-ataque) + ROADMAP/PITCH atualizados.
- [ ] (Implementação) Brier/ECE não pioram vs contagem; golden de paridade re-congeladas de propósito; `npm test` verde.

## 12. Como verificar (rodar o gatilho)
Conta **quantos jogadores** de um jogo têm `expected_goals` não-nulo (usa `BZZOIRO_API_KEY` do `.env`).
Troque `EVENT_ID` por um jogo da **Copa (liga 27) já finalizado** depois dos primeiros jogos:

```bash
# Cobertura de xG num jogo (substitua EVENT_ID por um jogo da Copa FINALIZADO):
node -e 'const id=process.argv[1]; fetch("https://sports.bzzoiro.com/api/v2/events/"+id+"/player-stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>{const ps=j.player_stats||[]; const comXg=ps.filter(p=>p.expected_goals!=null); console.log("event",id,"jogadores=",ps.length,"com expected_goals!=null=",comXg.length); console.log("exemplos:",comXg.slice(0,3).map(p=>p.player_id+":"+p.expected_goals).join(", ")||"(nenhum)")})' EVENT_ID
```

**Leitura do resultado:**
- `com expected_goals!=null = 0` → **mantém fora de escopo** (estado atual; é o que deu no 9099).
- `com expected_goals!=null` material (ex.: a maioria do elenco) **e** repetível em N jogos da Copa →
  **gatilho disparou**, reabrir a ficha pelo §6.

```bash
# (referência) prova de que o campo existe para CLUBE — event 7166 (Brasileirão) traz xG de jogador:
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/7166/player-stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>(j.player_stats||[]).slice(0,5).forEach(p=>console.log(p.player_id,"xg=",p.expected_goals,"xa=",p.expected_assists)))'
```
