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

## As cotações ficam guardadas (2026-06-10)

Antes, toda vez que eu queria analisar um jogo eu precisava **colar de novo** as cotações (as odds) daquele jogo. Cansativo e fácil de perder.

Agora as cotações que eu colo ficam **guardadas no sistema**, presas ao jogo. **Abri o jogo de novo, elas já estão lá** — analiso na hora, sem re-colar. Se eu colar uma cotação nova pra uma linha que já existe, ela **substitui** a antiga; cotações de mercados diferentes (chutes, desarmes...) vão se **somando** no mesmo jogo.

> Por enquanto a entrada das cotações continua sendo o **JSON colado** (estou em construção). No futuro isso vira automático — um robô que lê os preços (scraping) ou uma fonte de odds. A parte de **guardar** já está pronta; só a forma de *trazer* a cotação vai melhorar depois.

> Times, jogos e jogadores **não** são guardados — eles vêm sempre frescos da fonte de dados a cada acesso. Só as **cotações** (que não têm fonte automática ainda) é que o sistema guarda.

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

- ✅ **Validados e prontos pra dinheiro real — mercados de JOGADOR:** **chutes a gol (SOT)** e **finalizações**. O modelo acerta a probabilidade (calibração boa). São o núcleo do MVP.
  - **Provado na população certa:** primeiro a calibração rodou em jogos de clube (Brasileirão, ~3300 jogos). Como o alvo é a **Copa (seleções)**, re-testamos especificamente em **jogos de seleção** (eliminatórias, Nations League, amistosos, Euro, Copa América) — e continuam acertando lá também.
  - **O que descobrimos no caminho (honestidade):** num primeiro teste pareceu que o modelo "errava" pra seleção. Investigando, o erro não era a conta de quanto o jogador produz — era assumir que **todo titular joga 90 minutos**. Ao **estimar os minutos esperados** de cada jogador, o acerto voltou ao normal.
- 🔒 **DESARME — SELADO (descoberta de 2026-06-11):** a casa de apostas paga desarme pelos **desarmes GANHOS**, não pelas **tentativas**. Nosso modelo acerta bem as **tentativas** (é rotina do jogador, dá pra prever do histórico), mas **não** acerta os **ganhos** (ganhar um desarme depende do lance, do adversário, de sorte — o histórico não prevê). Provamos isso em **1738 jogos de seleção**: no alvo que a casa paga, o modelo **não bate nem o chute na média**. Conclusão honesta: **desarme NÃO entra no dinheiro real por enquanto** — fica em observação, sendo medido ao vivo. (O confronto do "Exemplo 1" acima segue valendo como **raciocínio**; só não vira aposta recomendada até a prova ao vivo mudar.)
- ⏳ **Em validação — mercados de PARTIDA:** **gols/vitória** e **escanteios**. O código existe, mas a calibração ainda **não passou no crivo** — então **não** entram como sinal confiável ainda.

> Em uma frase: o produto **estreia com 2 mercados de jogador (chutes a gol e finalizações)**, com **desarme em observação** (a casa paga uma coisa que ainda não sabemos prever) e os de partida **quando — e se — calibrarem**. Cada mercado vira "dinheiro real" **um a um**, só depois de provar. Veredito completo em [ROADMAP.md](ROADMAP.md).

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

**A estrela agora desvia de quem pode ficar no banco (2026-06-10).** Antes do time anunciar a escalação oficial (~1h antes do jogo), tudo é "provável" — e um jogador que costuma entrar só no fim do jogo podia receber a ⭐. Agora a estrela **pula quem tem risco de jogar pouco** (a previsão diz menos de 60 minutos em campo) e vai pra melhor aposta sem esse risco. Ninguém é escondido: o jogador de risco continua na lista, com um selo visível **"escalação prevista — pode começar no banco"**, e o cartão da aposta recomendada avisa quantos minutos esperamos que ele jogue. Se TODAS as apostas aprovadas tiverem esse risco, a melhor delas fica com a estrela — mas com o aviso na cara.

**2. Traz uma segunda opinião da IA.** Para cada oportunidade aprovada, o sistema pede à IA que dê um de três veredictos:
- **Concorda** — a IA confirma a lógica do confronto.
- **Ressalva** — concorda com valor, mas aponta algo para eu avaliar (ex.: escalação ainda não confirmada, pouco tempo esperado em campo).
- **Barra** — a IA enxerga algo que torna aquela aposta arriscada além do que o número mostra.

> A IA **nunca inventa número**. Ela só olha o que o código calculou e dá a opinião como se fosse um analista lendo a análise. Se ela barrar algo que o código aprovou, eu vejo o conflito na tela e decido — o poder de veto é meu.

**A segunda opinião agora enxerga a posição do jogador — e é proibida de "saber das coisas" (2026-06-10).** Cada aposta chega pra IA dizendo se o jogador é goleiro, defensor, meio-campista ou atacante — antes ela adivinhava, e adivinhar funciona com jogador famoso e erra com jogador obscuro. E ficou **proibida de usar qualquer informação de fora**: nada de "o time está em má fase" ou "esse jogo não vale nada" — toda afirmação dela tem que vir dos números que estão na tela. Pegamos a IA inventando um alerta desses num teste real; agora a regra é dura e o teste mais recente confirmou que os alertas batem com os números.

**3. Se a IA estiver fora do ar** (sem chave ou conexão), o app não trava — ele mostra só o veredito do código com um aviso "segunda opinião indisponível". A análise segue funcionando.

**Os números viram linguagem do dia a dia.** Em vez de "EV +0.275", a tela traduz: "+R$ 2,75 a cada R$ 10 apostados, no longo prazo". Em vez de "prob_modelo 0.58", aparece "o modelo diz que isso acontece em 58 de 100 jogos similares".

---

## O experimento da posição — testado e, por enquanto, fora (2026-06-10)

Testamos uma ideia promissora: refinar o confronto perguntando "esse adversário concede mais ações justamente pra POSIÇÃO desse jogador (defensor, meio-campista, atacante)?". Antes de ligar, fizemos a prova honesta: rodamos o modelo com e sem o refinamento em centenas de jogos passados e comparamos os acertos. Resultado: em dois dos três mercados (desarmes e chutes a gol) a previsão ficou **pior**, não melhor — então o refinamento **fica desligado** (o produto nunca liga o que não se provou). Em finalizações ele melhorou, e pode voltar só pra esse mercado depois de um re-teste com mais jogos.

---

## Agora dá pra ver de onde veio o número (2026-06-10)

O sistema **calcula e entrega** o histórico real de cada jogador: a média dele nos últimos 5 e 10 jogos, os resultados jogo a jogo, quanto tempo em média ele jogou, e como ele se sai em casa versus fora. A **IA explica com esses dados reais** — nunca inventa o número.

**A tela está sendo atualizada agora** (hoje 2026-06-10) para mostrar esse histórico num painel de detalhes, mas o sistema **já faz a conta com esses números de verdade**:
1. **A probabilidade é feita a partir do histórico real.** Em vez de uma média genérica da temporada, o modelo usa os últimos 5 e 10 jogos: "nos últimos 5 jogos ele deu 3, 2, 4, 3, 3 chutes — a média é 3 por jogo". Esse número virou 64% no modelo, que comparamos com a odd da casa.
2. **A segunda opinião usa os mesmos números.** A IA não inventa — ela pega o histórico que o código calculou e explica por quê aquilo vale (ou não vale). Se o histórico estiver fraco, ela diz; se estiver forte, ela confirma. Continua proibida de "saber das coisas" de fora — tudo que ela afirma tem que estar nos dados reais do jogador na tela.

---

## Os jogos da Copa já aparecem na lista (2026-06-10)

Tinha um defeito chato: ao pedir os jogos da Copa, a lista vinha **vazia de jogos de verdade** — só aparecia a fase final ("vencedor do jogo X contra vencedor do jogo Y"), sem times definidos, e o **jogo de abertura (México × África do Sul, 11/06) sumia**.

O motivo: a fonte de dados entrega os jogos na ordem errada (os de chave primeiro) e o sistema só pegava os 50 primeiros — então os jogos da fase de grupos, que é o que interessa agora, ficavam de fora. **Corrigido:** agora o sistema puxa a janela inteira, joga fora os jogos sem time definido e ordena por data. Resultado: a lista da Copa passou de 50 jogos-fantasma para **72 jogos reais**, com a abertura no topo.

---

## Agora o sistema mede a si mesmo ao vivo (2026-06-11)

A Copa é população nova (seleções), e não dá pra provar o modelo no passado da Copa (a fonte não guardou os detalhes dos Mundiais antigos). Então a prova tem que ser **daqui pra frente, ao vivo**. Ligamos esse "detector de mentira ao vivo":

- **Toda análise é registrada** num caderninho (o `paper_ledger`): o que o modelo disse, com qual odd, qual vantagem.
- **Depois do jogo, o sistema confere sozinho** o que de fato aconteff — lendo as estatísticas reais do jogo — e marca acertou/errou. **No desarme, ele confere pelo número que a casa paga (ganhos), não pelas tentativas** — é assim que vamos saber se o desarme um dia presta.
- **Um relatório** mostra, por mercado, se o modelo está sendo honesto (as notas Brier/ECE) e se pegamos preço bom (CLV).

E uma trava nova de segurança: **só mercado já provado pode receber a estrela de "aposte nesta"**. Hoje são chutes a gol e finalizações. Os outros (desarme, gols, escanteios, vitória) aparecem na análise mas **não** saem como aposta recomendada — vão sendo **liberados um a um**, só quando a medição ao vivo provar que prestam. Nada de apostar dinheiro real numa "vantagem" que a gente ainda não confirmou.

---

## Em resumo

> Eu escolho um jogo. O sistema cruza as estatísticas atualizadas dos dois times, calcula a probabilidade real, compara com a odd da casa sem a margem, e a IA me entrega o veredito final explicado: **qual aposta vale a pena e por quê** — com a mais sólida na frente, os tiros-longos sinalizados, e uma segunda opinião que pode concordar, ressalvar ou barrar cada uma.
