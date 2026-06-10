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

### De onde vêm as odds (2026-06-09)

As odds da casa são metade da conta (comparamos o nosso número com o da casa). De onde elas chegam:

- **Mercados de time (gols, resultado/1X2):** entram **sozinhas, de graça** — puxamos de um serviço gratuito (The Odds API) que cobre os jogos da Copa com dezenas de casas. Não precisa digitar.
- **Mercados de jogador (chutes/finalizações/desarmes) e escanteios:** não existe serviço barato que venda essas odds da Copa (pesquisa de junho/2026; "desarmes" não é vendido por preço nenhum). Então criamos um **atalho esperto pra coletar à mão sem digitar uma por uma:** o app me dá um **texto pronto pra copiar** (um por aba/mercado, já com a lista de jogadores do jogo); eu colo numa IA externa (o Claude na extensão do navegador), ela lê o site da casa e me devolve as odds num **bloco organizado (JSON)**; eu colo esse bloco no app e ele **analisa todos os mercados do jogo de uma vez**. Achar um jeito 100% automático segue como objetivo em aberto (`odds-prop-jogador`), mas isso já destrava a validação **de graça**.

> **Duas observações honestas deste atalho:** (1) nas props de jogador a casa quase sempre só mostra o lado "mais de" (over), sem o "menos de" — sem os dois lados não dá pra "limpar a margem" como nos mercados de time, então aí o app usa o preço cru e faz uma conta **mais exigente** (passa menos aposta, mas nunca aponta valor falso). (2) Quando o nome do jogador no site da casa não bate na hora com a nossa base, o app **não chuta** — ele me mostra os parecidos pra eu confirmar com um clique, e guarda pra acertar sozinho da próxima.

---

## A tela de coleta diz "aposte NESTA" — e ainda traz uma segunda opinião (2026-06-09)

Depois de colar o JSON das odds, o app não devolve mais uma lista solta. Ele:

**1. Mostra primeiro a mais sólida.** As oportunidades aprovadas são organizadas em três grupos antes de aparecerem na tela:
- **Sólida** — o modelo diz que acontece mais vezes que não (≥ 50%). A ⭐ marca a melhor dentro desse grupo.
- **Moderada** — 35–50% de chance segundo o modelo; ainda positiva em valor, mas menor certeza.
- **Tiro-longo** — acontece menos de 35% das vezes, mas a odd paga tão bem que ainda vale matematicamente.

Ninguém desaparece: mesmo o tiro-longo fica visível, porque passou no filtro de valor. A organização é só pra eu saber em qual depositar mais confiança — o produto **nunca** esconde uma aposta de valor só porque a probabilidade é baixa.

**2. Traz uma segunda opinião da IA.** Para cada oportunidade aprovada, o sistema pede à IA que dê um de três veredictos:
- **Concorda** — a IA confirma a lógica do confronto.
- **Ressalva** — concorda com valor, mas aponta algo para eu avaliar (ex.: jogador em fase ruim, jogo sem importância).
- **Barra** — a IA enxerga algo que torna aquela aposta arriscada além do que o número mostra.

> A IA **nunca inventa número**. Ela só olha o que o código calculou e dá a opinião como se fosse um analista lendo a análise. Se ela barrar algo que o código aprovou, eu vejo o conflito na tela e decido — o poder de veto é meu.

**3. Se a IA estiver fora do ar** (sem chave ou conexão), o app não trava — ele mostra só o veredito do código com um aviso "segunda opinião indisponível". A análise segue funcionando.

**Os números viram linguagem do dia a dia.** Em vez de "EV +0.275", a tela traduz: "+R$ 2,75 a cada R$ 10 apostados, no longo prazo". Em vez de "prob_modelo 0.58", aparece "o modelo diz que isso acontece em 58 de 100 jogos similares".

---

## Em resumo

> Eu escolho um jogo. O sistema cruza as estatísticas atualizadas dos dois times, calcula a probabilidade real, compara com a odd da casa sem a margem, e a IA me entrega o veredito final explicado: **qual aposta vale a pena e por quê** — com a mais sólida na frente, os tiros-longos sinalizados, e uma segunda opinião que pode concordar, ressalvar ou barrar cada uma.
