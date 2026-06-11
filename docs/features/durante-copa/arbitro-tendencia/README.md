# arbitro_tendencia — sinal de árbitro p/ a IA (resto do I5)

> **Índice/estado vivo:** ver [`docs/CORE.md`](../../../CORE.md). Esta pasta é o detalhe da feature.

## TL;DR
Dar à IA um sinal descritivo de **tendência do árbitro** (apita muito / deixa jogar), derivado do
histórico de faltas/cartões do `referee_id`. **TEXTO, fora do money-path** — não toca `prob_modelo`.

## Status
- Ajuda à meta: **Médio** (mais contexto pro veto/ressalva da IA, sobretudo em desarmes/faltas).
- Pronto p/ Copa: ⏳ (implementável, mas valor incerto — fatia de menor prioridade).
- Esforço: **Médio.** Risco de paridade: **nenhum** (não toca o número). Custo de dado: a confirmar.

## Fundamento
Árbitro que apita muito muda o ritmo: mais faltas/cartões → mais paradas, possível efeito em
desarmes/cartões. A IA já recebe `posse_adversario` e `forma_tendencia` (feitos); o árbitro é o
terceiro sinal de contexto. Sempre **descritivo** — a IA explica/julga, não calcula.

## Evidência / dado
- `event.referee_id` **existe** (confirmado: 9099→2401, 8287→1932).
- **NÃO há endpoint de "perfil do árbitro".** Pra ter a tendência é preciso **agregar na mão** os
  jogos passados daquele `referee_id` e mediar `fouls`/`yellow_cards` de `/events/{id}/stats/`.
- **Confirmar ANTES de implementar:** existe filtro `/events/?referee_id=` na BSD? Se não, varrer
  jogos fica caro — **medir o custo primeiro**.

## Proposta de implementação
1. Novo método no provider (`src/providers/stats.ts`): dado `referee_id`, busca jogos anteriores
   do árbitro e calcula `media_faltas`/`media_cartoes`; deriva rótulo `arbitro_tendencia`
   ("apita bastante" / "deixa jogar" / "neutro").
2. Anexa ao candidato (campo descritivo, snake_case PT) e ao `PROMPT_REVISOR`
   (`src/ai/reviewer.ts`) — mesmo padrão de `posse_adversario`.
3. **Fora do `mu`/`prob_modelo`** → paridade intacta.

## Plano de validação
Texto, fora do número → sem Brier/paridade. Critério: a IA cita o árbitro de forma coerente
(sem inventar número) e não piora o veto. Medir se o custo de buscar o histórico vale o sinal.

## Dependência
Nenhuma técnica (a infra de sinais de texto já existe, do I5). Só a confirmação de custo do dado.
