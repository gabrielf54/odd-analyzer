# O que é o produto (em linguagem simples)

## A ideia em uma frase

Um aplicativo que analisa um jogo de futebol, olha as **odds das casas de apostas**, calcula a **probabilidade real** de cada coisa acontecer com base em **estatísticas atualizadas dos times** e me diz, no final, **quais apostas valem a pena** — com uma explicação clara do porquê.

---

## O problema que ele resolve

Apostar no "achismo" ou no favorito quase sempre dá errado. A casa de apostas já cobra uma margem e precifica bem os favoritos. Quem aposta sem método perde no longo prazo.

O produto vira esse jogo: em vez de adivinhar, ele **compara o número da casa com o número do nosso modelo** e só aponta quando o nosso lado está claramente na frente.

> Não é "essa aposta tem chance alta de acontecer".
> É "essa aposta está **mal precificada** pela casa — o preço está bom".

---

## Como ele pensa — o confronto, não a média

O segredo não é olhar a média de um time isolado. É olhar o **encaixe entre os dois times**: quem **produz** uma ação contra quem **permite** aquela ação.

### Exemplo 1 — desarmes de um jogador

- Time A ataca **muito pelo lado esquerdo**.
- Time B tem um **lateral-direito que desarma muito**.
- Resultado: esse lateral-direito vai ter um volume defensivo alto nesse jogo específico.
- A odd para ele fazer **2+ desarmes** está boa.
- O modelo aponta essa oportunidade.

### Exemplo 2 — escanteios de um time

- Time A **cruza muita bola na área** e gera muitos escanteios.
- Time B **sofre muitos escanteios**.
- Resultado: tendência de muitos escanteios para o Time A.
- A odd de **escanteios do Time A** está boa.
- O modelo aponta essa oportunidade.

A lógica é sempre a mesma: **produção de um lado × vulnerabilidade do outro, no mesmo eixo.**

---

## Dados precisam ser atualizados

Estatística velha não serve. A análise usa **dados recentes e atualizados dos times e jogadores** — forma atual, não números de temporadas passadas. Sem dado fresco, não tem análise confiável.

---

## Como eu uso (a experiência)

1. **Tela de jogos.** Abro o app e vejo uma lista de jogos disponíveis.
2. **Escolho um jogo.** Clico no confronto que quero analisar.
3. **O sistema pesquisa.** Ele cruza as estatísticas dos dois times e procura as melhores oportunidades de aposta.
4. **A matemática monta o caso.** Modelo calcula as probabilidades e compara com as odds (já tirando a margem da casa).
5. **A IA dá o veredito final.** Com todos os números na mão, montamos **o prompt perfeito** e a IA escreve a recomendação em linguagem natural.
6. **Vejo a resposta + os dados.** A IA me explica **qual mercado**, **qual odd** e **por que** está boa, mostrando os números que sustentam aquilo.

> Importante: a **IA nunca inventa o número**. O cálculo é feito no código. A IA só aplica o filtro final e **explica** de um jeito que eu entendo.

**Nos mercados de jogador (chutes/finalizações/desarmes)** o sistema me mostra a **escalação provável** do jogo (mandante × visitante); se ainda não houver escalação, lista quem **jogou os últimos 3 jogos**. Eu escolho o jogador, vejo a média recente dele e coloco a odd real dele — a análise roda só pra ele.

> Detalhe técnico resolvido (2026-06-03): a fonte de dados usa "dois crachás" diferentes para o mesmo jogador — um na lista da escalação, outro no histórico de estatísticas. O sistema agora **traduz um no outro automaticamente** (casando pelo nome), então a análise de jogos **futuros** funciona de ponta a ponta. Testado num jogo real da próxima rodada (Argentina × Islândia, 10/06): os 11 titulares de cada lado foram reconhecidos corretamente.

---

## O que o produto entrega

- **Lista de jogos** para eu escolher o que analisar.
- **Oportunidades de aposta** filtradas por valor (não por "favorito").
- Para cada oportunidade: **mercado + odd + probabilidade do modelo + explicação da IA**.
- Raciocínio no formato **confronto** (quem produz × quem concede).
- Dados **atualizados** dos times e jogadores.
- Transparência: sempre mostra os números por trás da recomendação.

---

## Mercados que o produto cobre (início)

**Jogador:** chutes a gol · finalizações totais · desarmes.
**Partida:** gols · vitória (resultado) · escanteios.

### Status de validação (2026-06-03)

O motor não entra no ar por fé — cada mercado passou (ou não) por uma calibração honesta em dados reais. Estado atual:

- ✅ **Validados e prontos — mercados de JOGADOR:** **chutes a gol (SOT)**, **finalizações** e **desarmes**. O modelo acerta a probabilidade (calibração boa). São o núcleo do MVP.
  - **Provado na população certa:** primeiro a calibração rodou em jogos de clube (Brasileirão, ~3300 jogos). Como o alvo é a **Copa (seleções)**, re-testamos especificamente em **jogos de seleção** (eliminatórias, Nations League, amistosos, Euro, Copa América) — e os três mercados continuam acertando lá também.
  - **O que descobrimos no caminho (honestidade):** num primeiro teste pareceu que o modelo "errava" pra seleção. Investigando, o erro não era a conta de quanto o jogador produz — era assumir que **todo titular joga 90 minutos**. Seleção troca/roda muito; quem joga menos produz menos. Ao **estimar os minutos esperados** de cada jogador, o acerto voltou ao normal. Lição: a parte difícil (o modelo serve pra seleção?) está respondida **sim**.
- ⏳ **Em validação — mercados de PARTIDA:** **gols/vitória** e **escanteios**. O código existe, mas a calibração ainda **não passou no crivo** — então **não** entram como sinal confiável ainda (não vendemos o que não provamos).

> Em uma frase: o produto **estreia com os 3 mercados de jogador** (provados, inclusive na população de seleção da Copa) e amplia para os de partida **quando — e se — calibrarem**. Veredito completo em [ROADMAP.md](ROADMAP.md).

### De onde vêm as odds (2026-06-03)

As odds da casa são metade da conta (comparamos o nosso número com o da casa). De onde elas chegam:

- **Mercados de time (gols, resultado/1X2):** agora entram **sozinhas, de graça** — puxamos de um serviço gratuito (The Odds API) que cobre os jogos da Copa com dezenas de casas. Não precisa mais digitar.
- **Mercados de jogador (chutes/finalizações/desarmes):** a odd ainda é **colocada à mão**. Pesquisamos fundo (junho/2026) e **nenhum serviço barato vende a odd desses mercados para a Copa** — e "desarmes" não é vendido por preço nenhum. Por enquanto eu pego a odd na casa (betano/bet365) e colo. **Achar um jeito automático para as odds de jogador é um objetivo em aberto** (no ROADMAP como `odds-prop-jogador`); só vale gastar nisso se aparecer fonte barata ou se o orçamento subir.
- **Escanteios:** ainda sem fonte automática barata; fica à mão também.

---

## Em resumo

> Eu escolho um jogo. O sistema cruza as estatísticas atualizadas dos dois times, calcula a probabilidade real, compara com a odd da casa sem a margem, e a IA me entrega o veredito final explicado: **qual aposta vale a pena e por quê.**
