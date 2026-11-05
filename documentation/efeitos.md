# Efeitos

<!-- Arquivo gerado. Para atualizar: npm run docs. As mudanças feitas à mão são perdidas. -->

O MyRGB tem **50 efeitos** em **6 categorias**. Cada efeito é um *padrão de movimento*: ele diz como a luz se distribui ao longo da fita. As cores vêm do gradiente, que é uma peça separada — por isso dá para combinar qualquer efeito com qualquer paleta.

## Como um efeito é montado

Um padrão recebe, para cada LED da fita, o seu índice, o total de LEDs da zona, a posição normalizada (0 no começo, 1 no fim), o tempo em segundos e os parâmetros que você ajustou. Ele devolve um número entre 0 e 1 — a posição no gradiente — e o MyRGB transforma esse número na cor.

Isso significa que o mesmo efeito com gradientes diferentes dá resultados bem diferentes: "Onda" com o gradiente *Arco-íris* dá uma onda colorida, e com *Monocromático* dá uma onda que acende e apaga. Nenhum dos dois é "mais certo" que o outro.

## Resumo

| Categoria | Efeitos |
|---|---|
| **Básicos** | Sólido · Gradiente · Gradiente pulsante · Respiração · Fade · Ciclo de cores · Batida · Estrobo · Preenchimento |
| **Ondulação** | Onda · Onda dupla · Interferência · Água · Plasma · Pulso · Pulso central · Ondulações · Onda de gradiente · Mapa de ruído |
| **Movimento** | Chase · Chase suave · Cometa · Meteoros · Chuva · Ponta a ponta · Varredura · Túnel · Espiral · Bola quicando · Visor · Letreiro · Sinelon · Pipoca · Bolhas |
| **Atmosfera** | Aurora · Fogo · Campo de estrelas · Cintilação · Dissolve · Névoa · Relâmpago · Fogos de artifício · Vela · Amanhecer |
| **Espectro** | Arco-íris · Arco-íris pulsante · Varredura de matiz |
| **Pontos** | Dot chase · Caça aos pontos · Rastro |

## Paletas

As 12 paletas embutidas são gradientes multi-parada, com interpolação em RGB ou HSV. O botão ⧉ no painel **Gradiente** duplica a paleta escolhida, para você poder mexer sem perder a original.

| Paleta | Interpolação | Paradas |
|---|---|---|
| Arco-íris | HSV | 0% #ff0040 · 25% #ffd000 · 50% #00ff66 · 75% #00c8ff · 100% #ff0040 |
| Pôr do sol | RGB | 0% #ff2d55 · 35% #ff7a18 · 70% #ffd166 · 100% #4a1f8f |
| Oceano | RGB | 0% #03045e · 50% #0077b6 · 100% #00f5d4 |
| Fogo | RGB | 0% #7a0000 · 40% #ff4500 · 75% #ffb703 · 100% #fff3b0 |
| Neon | HSV | 0% #00fff0 · 50% #ff00e5 · 100% #7000ff |
| Pastel | RGB | 0% #ffd6e0 · 50% #c7f9cc · 100% #bde0fe |
| Monocromático | RGB | 0% #000000 · 100% #ffffff |
| Gaming vermelho | RGB | 0% #3b0000 · 50% #e10600 · 100% #ff6b6b |
| Matrix | RGB | 0% #001100 · 60% #00ff41 · 100% #aaffaa |
| Cyan / Magenta | HSV | 0% #00ffff · 100% #ff00ff |
| Lava | RGB | 0% #0b0b0b · 50% #8b0000 · 100% #ff8c00 |
| Gelo | RGB | 0% #001f3f · 50% #4cc9f0 · 100% #caf0f8 |

## Básicos

### Sólido — `solid`

Uma cor única, retirada do gradiente numa posição fixa.

**Parâmetros**

- **Ponto do gradiente** (`point`, 0 – 1, padrão 0) — Qual cor do gradiente é usada. 0 é a primeira parada e 1 é a última; no meio fica a cor do meio.

### Gradiente — `gradient`

O gradiente estendido ao longo de toda a fita.

**Parâmetros**

- **Repetições** (`spread`, 0.25 – 6, padrão 1) — Quantas vezes o gradiente cabe na fita. 1 mostra o gradiente inteiro uma vez; 2 mostra duas cópias.

### Gradiente pulsante — `gradient-pulse`

Gradiente fixo com respiração de intensidade.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Intensidade da pulsação** (`depth`, 0 – 1, padrão 0.70) — O quanto a luz apaga e acende a cada ciclo. 0 mantém o brilho fixo; 1 faz a fita sumir e voltar.

### Respiração — `breathe`

Cor fixa que expande e contrai suavemente.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Ponto do gradiente** (`point`, 0 – 1, padrão 0) — Qual cor do gradiente respira. 0 é a primeira parada e 1 é a última; no meio fica a cor do meio.
- **Brilho mínimo** (`floor`, 0 – 1, padrão 0.08) — O ponto mais apagado do ciclo. 0 apaga de vez; acima de 0 a fita nunca chega a ficar preta.

### Fade — `fade`

Percorre o gradiente ida e volta, sem movimento espacial.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Ponto do gradiente** (`point`, 0 – 1, padrão 0) — De qual cor do gradiente a varredura parte. A cor muda ao longo do tempo, mas o ponto na fita é sempre o mesmo.

### Ciclo de cores — `color-cycle`

Percorre todo o gradiente em ciclo contínuo.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.

### Batida — `heartbeat`

Pulsação em dois tempos, como o batimento do coração.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Ponto do gradiente** (`point`, 0 – 1, padrão 0.50) — Qual cor do gradiente pulsa. 0 é a primeira parada e 1 é a última; no meio fica a cor do meio.
- **Brilho mínimo** (`floor`, 0 – 0.50, padrão 0.04) — O brilho que fica entre as batidas. 0 deixa a fita completamente apagada no intervalo.
- **Pausa** (`rest`, 0 – 0.70, padrão 0.42) — Fração de cada ciclo sem batida, como o intervalo de descanso entre um batimento e o próximo.

### Estrobo — `strobe`

Piscadas rápidas e regulares, com pausa entre os disparos.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Ponto do gradiente** (`point`, 0 – 1, padrão 0.50) — Qual cor do gradiente aparece em cada piscada.
- **Duração da piscada** (`duty`, 0.03 – 0.60, padrão 0.18) — Quanto de cada ciclo fica aceso. Valores baixos dão flashes curtos; altos deixam quase tudo aceso.
- **Variação de cor** (`spread`, 0 – 1, padrão 0) — O quanto a cor muda a cada piscada. 0 mantém sempre a mesma cor; 1 percorre o gradiente inteiro.

### Preenchimento — `fill`

A cor preenche a fita LED a LED e depois se apaga.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Ponto do gradiente** (`point`, 0 – 1, padrão 0.50) — Qual cor do gradiente preenche a fita.
- **Brilho do fundo** (`background`, 0 – 0.40, padrão 0.05) — O brilho da parte ainda não preenchida. 0 apaga de vez o resto da fita até a cor chegar.
- **Movimento** (`mode`, Preencher e apagar | Preencher e recomeçar, padrão Preencher e apagar) — O que acontece quando o preenchimento chega ao fim: ele volta apagando ou recomeça do início de uma vez.

## Ondulação

### Onda — `wave`

Onda senoidal que atravessa a fita.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Comprimento de onda** (`wavelength`, 2 – 144 LEDs, padrão 16) — Quantos LEDs ocupa uma onda completa. Menor dá ondas curtas e agitadas; maior dá ondas largas e calmas.
- **Amplitude** (`amplitude`, 0 – 1, padrão 1) — O quanto a onda se afasta da cor do meio do gradiente. 0 deixa a fita com uma cor só.
- **Definição** (`sharpness`, 0 – 1, padrão 0) — 0 = onda suave, 1 = onda em picos

### Onda dupla — `wave-double`

Duas ondas cruzadas em direções opostas.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Comprimento de onda** (`wavelength`, 2 – 144 LEDs, padrão 20) — Quantos LEDs ocupa uma onda completa em cada uma das duas direções.
- **Separação** (`separation`, 0 – 1, padrão 0.50) — O quanto as duas ondas se misturam. 0 mostra só a primeira; 0.5 mostra as duas em partes iguais; 1 junta as duas numa só.

### Interferência — `interference`

Ondas de frequências diferentes criam um padrão de moiré.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Comprimento de onda** (`wavelength`, 2 – 144 LEDs, padrão 14) — Quantos LEDs ocupa a onda mais lenta, que serve de base do desenho.
- **Razão de frequência** (`ratio`, 0.20 – 3, padrão 1.37) — Quantas vezes a segunda onda é mais rápida que a primeira. Razões como 1.5 ou 2 criam padrões geométricos; 2.5 e 3 ficam caóticas.

### Água — `water`

Ondulação irregular, como ondas em um lago.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Escala** (`scale`, 1 – 24, padrão 6) — Tamanho das ondulações. Valores altos deixam a fita agitada; valores baixos deixam ondas largas.
- **Profundidade** (`depth`, 0 – 1, padrão 0.60) — O quanto as ondas mudam de cor. 0 deixa a fita com uma cor só; 1 faz as ondas aparecerem com todo o contraste do gradiente.

### Plasma — `plasma`

Soma de várias senoides, com aparência de plasma.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Escala** (`scale`, 1 – 20, padrão 5) — Quantas ondas cabem na fita. Maior escala dá um desenho mais apertado.
- **Complexidade** (`complexity`, 1 – 6, padrão 3) — Quantas ondas são somadas para formar o plasma. Poucas dão formas simples; seis dão um desenho confuso e cheio de detalhes.

### Pulso — `pulse`

Onda circular que se expande a partir do início da fita.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Largura do pulso** (`width`, 1 – 72 LEDs, padrão 14) — Quantos LEDs tem a onda de luz que atravessa a fita.

### Pulso central — `pulse-center`

Respiração que nasce no centro da fita e se espalha.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Alcance** (`width`, 0.10 – 1, padrão 0.60) — Que parte da fita respira. 0.2 só o miolo acende; 1 a fita inteira acende ao mesmo tempo.

### Ondulações — `ripple`

Anéis que nascem em pontos aleatórios e se espalham pela fita.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Quantidade de anéis** (`count`, 1 – 8, padrão 3) — Quantos anéis existem ao mesmo tempo. Cada um nasce em um ponto e em um ritmo diferentes.
- **Largura do anel** (`width`, 0.01 – 0.40, padrão 0.08) — Espessura de cada anel, em fração da fita. Valores baixos dão ondas finas; altos dão faixas largas.
- **Desvanecimento** (`fade`, 0 – 1, padrão 0.70) — O quanto o anel perde força enquanto se afasta do centro. 0 mantém o brilho até o fim.

### Onda de gradiente — `gradient-wave`

O próprio gradiente ondula enquanto escorrega pela fita.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Repetições** (`stretch`, 0.25 – 4, padrão 1) — Quantas vezes o gradiente cabe na fita. 1 mostra uma cópia; 4 mostra quatro cópias encolhidas.
- **Ondulação** (`sway`, 0 – 1, padrão 0.35) — O quanto as faixas do gradiente se curvam. 0 deixa as faixas retas; 1 exagera a onda.
- **Direção** (`direction`, Para a direita | Para a esquerda, padrão Para a direita) — Para que lado o gradiente escorrega pela fita.

### Mapa de ruído — `noise-map`

Manchas de ruído suave que mudam de cor ao longo do tempo.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Escala** (`scale`, 0.50 – 16, padrão 4) — Tamanho das manchas. Escala baixa dá nuvens largas; escala alta dá um desenho miúdo.
- **Detalhe** (`detail`, 1 – 4, padrão 2) — Quantas camadas de ruído são somadas. Mais camadas dão um desenho mais rico e irregular.
- **Contraste** (`contrast`, 0.20 – 1, padrão 0.70) — O quanto as manchas se afastam da cor do meio do gradiente. Valores altos usam as pontas do gradiente.

## Movimento

### Chase — `chase`

Um bloco de cor que percorre a fita deixando um rastro.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Tamanho do bloco** (`size`, 1 – 72 LEDs, padrão 8) — Quantos LEDs tem o bloco de luz que corre pela fita.
- **Comprimento do rastro** (`trail`, 0.20 – 4, padrão 1) — O quanto o rastro se apaga atrás do bloco. Valores altos deixam um rabo longo e suave; valores baixos deixam o rastro curto e marcado.

### Chase suave — `chase-soft`

Como o Chase, mas com transição contínua entre os blocos.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Tamanho do bloco** (`size`, 1 – 72 LEDs, padrão 10) — Quantos LEDs tem o bloco de luz que corre pela fita.
- **Suavidade** (`softness`, 0 – 1, padrão 0.50) — O quanto as bordas do bloco ficam suaves. 0 dá um bloco com corte seco; 1 dá uma transição contínua, sem nenhuma borda.

### Cometa — `comet`

Uma cabeça brilhante com cauda longa que desvanece.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Tamanho da cabeça** (`head`, 1 – 24 LEDs, padrão 3) — Quantos LEDs tem a parte mais brilhante da cometa.
- **Comprimento da cauda** (`tail`, 2 – 144 LEDs, padrão 36) — Quantos LEDs a cauda percorre antes de sumir.

### Meteoros — `meteor`

Vários meteoros independentes cruzando a fita.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Quantidade** (`count`, 1 – 12, padrão 3) — Quantos meteoros correm ao mesmo tempo. Cada um tem sua própria velocidade.
- **Comprimento do rastro** (`tail`, 2 – 72 LEDs, padrão 18) — Quantos LEDs cada meteoro deixa para trás.

### Chuva — `rain`

Gotas que caem em posições aleatórias.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Quantidade de gotas** (`count`, 1 – 20, padrão 6) — Quantas gotas caem ao mesmo tempo, cada uma em um ponto e uma velocidade diferentes.
- **Largura da gota** (`width`, 0.50 – 12, padrão 2) — Quantos LEDs cada gota ocupa.

### Ponta a ponta — `ping-pong`

Um ponto que vai de uma ponta à outra e volta.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Largura do ponto** (`width`, 1 – 36 LEDs, padrão 4) — Quantos LEDs tem o ponto de luz que vai e volta.

### Varredura — `scan`

Uma barra de luz que varre a fita de ponta a ponta.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Largura da barra** (`width`, 1 – 72 LEDs, padrão 6) — Quantos LEDs tem a barra de luz que percorre a fita.

### Túnel — `tunnel`

Perspectiva de túnel, como se os LEDs se aproximassem.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Profundidade** (`depth`, 0.50 – 8, padrão 2) — Quantas voltas o gradiente dá do centro até a ponta da fita. Mais profundidade deixa o túnel mais fechado.

### Espiral — `spiral`

Gradiente que gira ao longo da fita.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Torção** (`twist`, 0 – 8, padrão 1.50) — Quantas voltas o gradiente dá da ponta à outra. Valores altos deixam o desenho apertado.

### Bola quicando — `bounce`

Uma bola cai, quica e perde altura a cada toque no chão.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Tamanho da bola** (`size`, 1 – 24 LEDs, padrão 4) — Quantos LEDs a bola ocupa.
- **Elasticidade** (`elasticity`, 0.30 – 1, padrão 0.72) — Quanta altura a bola recupera a cada quique. 1 quica sempre na mesma altura; 0.3 morre rápido.

### Visor — `visor`

Uma barra varre a fita de um lado ao outro, com rastro nas duas pontas.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Largura da barra** (`width`, 1 – 36 LEDs, padrão 5) — Quantos LEDs tem o núcleo brilhante que varre a fita.
- **Rastro** (`trail`, 0.50 – 8, padrão 3) — O quanto o brilho se espalha para os lados da barra. Valores altos dão um rastro longo e suave.

### Letreiro — `marquee`

Blocos acesos correndo com espaços iguais, como um letreiro de teatro.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Bloco aceso** (`block`, 1 – 12 LEDs, padrão 1) — Quantos LEDs ficam acesos em cada bloco.
- **Espaçamento** (`gap`, 1 – 24 LEDs, padrão 3) — Quantos LEDs apagados ficam entre um bloco e o próximo.
- **Brilho do fundo** (`background`, 0 – 0.40, padrão 0) — O brilho dos LEDs apagados. 0 deixa o fundo totalmente escuro.

### Sinelon — `sinelon`

Um ponto oscila pela fita deixando um rastro na direção do movimento.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Comprimento do rastro** (`trail`, 4 – 144 LEDs, padrão 48) — Quantos LEDs o rastro ocupa atrás do ponto.
- **Imprevisibilidade** (`wander`, 0 – 1, padrão 0.35) — O quanto o vaivém foge do compasso regular. 0 vai e volta sempre no mesmo ritmo; 1 fica imprevisível.

### Pipoca — `popcorn`

Estouros curtos em pontos aleatórios da fita.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Quantidade** (`count`, 1 – 20, padrão 6) — Quantos estouros acontecem em paralelo, cada um com seu próprio ritmo.
- **Tamanho do estouro** (`width`, 1 – 12 LEDs, padrão 3) — Quantos LEDs cada estouro ocupa.

### Bolhas — `bubbles`

Bolhas que sobem pela fita oscilando de um lado para o outro.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Quantidade** (`count`, 1 – 16, padrão 6) — Quantas bolhas sobem ao mesmo tempo.
- **Tamanho da bolha** (`size`, 1 – 16 LEDs, padrão 4) — Quantos LEDs cada bolha ocupa. O tamanho ainda pulsa levemente enquanto ela sobe.

## Atmosfera

### Aurora — `aurora`

Cortinas de luz ondulante, como as auroras boreais.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Camadas** (`layers`, 1 – 6, padrão 3) — Quantas cortinas de luz se sobrepõem. Poucas dão uma aurora limpa; seis dão um céu cheio de camadas.
- **Intensidade** (`intensity`, 0.10 – 1, padrão 0.80) — O brilho geral das cortinas. Valores baixo deixam tudo apagado.

### Fogo — `fire`

Chamas subindo, com tremulação irregular.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Escala** (`scale`, 1 – 16, padrão 4) — Tamanho das labaredas. Escala alta dá chamas miúdas; escala baixa, chamas grandes.
- **Altura** (`height`, 0.20 – 1, padrão 0.70) — O quanto a chama se estica pela fita. 1 deixa o fogo baixo e concentrado; valores baixos esticam a chama por quase toda a fita.

### Campo de estrelas — `starfield`

Estrelas que acendem e apagam aleatoriamente.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Densidade** (`density`, 0.05 – 1, padrão 0.25) — Que fração da fita tem uma estrela acesa ao mesmo tempo.
- **Cintilação** (`twinkle`, 0 – 1, padrão 0.70) — O quanto as estrelas piscam. 0 deixa tudo aceso sem mudar; 1 faz cada estrela acender e apagar depressa.

### Cintilação — `sparkle`

Pisca-pisca aleatório, como glitter.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Densidade** (`density`, 0.02 – 1, padrão 0.15) — Que fração da fita pisca ao mesmo tempo.

### Dissolve — `dissolve`

A cor se desfaz em fragmentos granulados.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Granulação** (`grain`, 1 – 40, padrão 12) — Quantos pedaços a fita é dividida. Poucos pedaços dão blocos grandes; muitos dão um grão fino.

### Névoa — `fog`

Nuvens lentas e sobrepostas.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Escala** (`scale`, 0.50 – 12, padrão 2.50) — Tamanho das nuvens. Escala baixa dá manchas largas e lentas.

### Relâmpago — `lightning`

Clarões brancos rápidos e irregulares, como uma tempestade.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Frequência** (`frequency`, 0.20 – 4 x/s, padrão 1.20) — Quantos relâmpagos por segundo, em média. Valores altos deixam a tempestade violenta.
- **Brilho do céu** (`background`, 0 – 0.30, padrão 0.04) — O brilho que fica entre os relâmpagos. 0 deixa a fita apagada até o próximo clarão.

### Fogos de artifício — `fireworks`

Explosões que se abrem em anéis e caem apagando.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Quantidade** (`count`, 1 – 10, padrão 3) — Quantos fogos existem ao mesmo tempo, cada um com seu próprio ritmo.
- **Alcance da explosão** (`spread`, 0.10 – 1, padrão 0.45) — Que parte da fita a explosão cobre até desaparecer. 1 toma a fita inteira.

### Vela — `candle`

Brilho quente e trêmulo, como a chama de uma vela.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Tremulação** (`flicker`, 0 – 1, padrão 0.55) — O quanto a chama oscila. 0 dá uma luz constante; 1 dá uma tremulação forte e irregular.
- **Ponto do gradiente** (`point`, 0 – 1, padrão 0.35) — Qual cor do gradiente a chama usa. Nos gradientes quentes, valores baixos ficam alaranjados.

### Amanhecer — `sunrise`

A fita clareia devagar, atravessando o gradiente em minutos.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Duração** (`duration`, 30 – 900 s, padrão 240) — Quantos segundos leva um ciclo completo, do escuro ao claro e de volta.
- **Brilho mínimo** (`floor`, 0 – 0.40, padrão 0.03) — O brilho no ponto mais escuro do ciclo. 0 deixa a fita apagar por completo antes de clarear de novo.

## Espectro

### Arco-íris — `rainbow`

Todas as cores do gradiente lado a lado, rolando com o tempo.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Repetições** (`spread`, 0.25 – 8, padrão 1) — Quantas vezes o gradiente se repete na fita. Com 1 cada cor aparece uma vez; com 4 o arco-íris fica bem fechado.

### Arco-íris pulsante — `rainbow-pulse`

Arco-íris com respiração de brilho por cima.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Repetições** (`spread`, 0.25 – 8, padrão 1) — Quantas vezes o gradiente se repete na fita.
- **Intensidade da pulsação** (`depth`, 0 – 1, padrão 0.60) — O quanto o brilho cai no fundo de cada ciclo. 0 mantém o arco-íris sempre igual; 1 faz a fita escurecer entre um ciclo e outro.

### Varredura de matiz — `hue-sweep`

Uma única cor que varre a fita, deixando rastro.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Repetições** (`spread`, 0.25 – 8, padrão 1) — Quantas vezes a varredura de cor se repete na fita. Acima de 1 mais de uma cor viaja junto.

## Pontos

### Dot chase — `dot-chase`

Pontos equidistantes correndo pela fita.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Quantidade de pontos** (`dots`, 1 – 16, padrão 4) — Quantos pontos correm pela fita, sempre com o mesmo espaço entre eles.
- **Largura do ponto** (`width`, 0.50 – 12, padrão 1.50) — Quantos LEDs tem cada ponto de luz.

### Caça aos pontos — `dot-hunt`

Pontos que se movem e mudam de direção de forma imprevisível.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Quantidade de pontos** (`dots`, 1 – 10, padrão 3) — Quantos pontos correm pela fita. Cada um escolhe um caminho diferente.
- **Largura do ponto** (`width`, 0.50 – 8, padrão 2) — Quantos LEDs tem cada ponto de luz.

### Rastro — `trail`

Um ponto que deixa um rastro suave que se dissipa.

**Parâmetros**

- **Velocidade** (`rate`, 0.05 – 4, padrão 1) — Quão rápido o efeito se move. 1.00x é o passo normal; acima disso acelera, abaixo disso desacelerá.
- **Largura do rastro** (`width`, 2 – 72 LEDs, padrão 20) — Quantos LEDs o rastro ocupa antes de sumir.
