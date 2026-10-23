# Funcionalidades

O MyRGB tem seis painéis. Este documento diz o que cada um faz, o que cada
botão faz e o que dá para combinar.

> **Dica:** todos os painéis têm um **?** ao lado do título. Passando o mouse
> por cima (ou clicando) aparece uma explicação curta do que aquele painel
> controla.

---

## A tela

```
┌──────────────────────────────────────────────────────────────────────┐
│ MyRGB  ● AULA3-AR32-0309   Perfil [Padrão ▾] [Salvar como…] [✎] ✓ salvo │
│         Brilho ▬▬▬ 100%   Veloc. ▬▬▬ 1.00x   [30 fps ▾]  [Luzes ligadas] │
├────────────────┬──────────────────────────────┬──────────────────────┤
│ ZONAS      ?   │  PRÉ-VISUALIZAÇÃO          ? │  EFEITOS          ?  │
│                │                              │  ┌────┬────┬────┐    │
│ ⇉ Aplicar a    │  ┌────────────────────────┐  │  │    │    │    │    │
│    todas as    │  │ LEDs onboard           │  │  ├────┼────┼────┤    │
│    zonas       │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │  │    │    │    │    │
│                │  │ Header ARGB 1   72 LEDs  │  │  └────┴────┴────┘    │
│ ● LEDs onboard │  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │                      │
│   ✎            │  │ Header ARGB 2   72 LEDs  │  │  GRADIENTE        ?  │
│ ● Header ARGB 1│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │  [Arco-íris ▾] ⧉ ✕  │
│   ✎  [72]      │  │ Header ARGB 3   72 LEDs  │  │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│ ● Header ARGB 2│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  │                      │
│   ✎  [72]      │                              │  PARÂMETROS        ?  │
│ ● Header ARGB 3│                              │  Velocidade      ?   │
│   ✎  [72]      │                              │  ▬▬▬▬▬▬▬  1.00x      │
│                │                              │  Amplitude       ?   │
│ SEGUIR ZONA    │                              │  ▬▬▬▬▬▬▬  1.00      │
│ [— próprio —]  │                              │                      │
└────────────────┴──────────────────────────────┴──────────────────────┘
```

---

## A barra superior

### O status do dispositivo

Um ponto e o nome do **firmware** do controlador (`AULA3-AR32-0309` é o
código de firmware do AURA USB das placas ASUS). O ponto verde pulsa quando o
dispositivo está conectado e aceso; vermelho quando não está.

Se aparecer a etiqueta **conflito**, outro programa (Armoury Crate no Windows,
OpenRGB no Linux) provavelmente também está escrevendo no mesmo controlador —
e isso é a causa número um de cintilação. A checagem roda a cada 5 segundos,
então o aviso aparece mesmo que o outro programa tenha começado depois.

### Perfil

O seletor abre e fecha a lista de perfis salvos. Trocar de perfil carrega a
configuração inteira: zonas, efeitos, gradientes e as opções globais.

**Salvar como…** guarda a configuração atual em um **perfil novo**, com o nome
que você digitar. O novo perfil passa a ser o perfil editado e aparece no
seletor; o original continua intacto.

> O perfil é gravado **sozinho**, a cada alteração. O botão existe para criar
> uma cópia com outro nome, não para "commitar" — por isso o indicador ao lado.

**✎** renomeia o perfil atual. O arquivo antigo é apagado e o novo é escrito.

O indicador **✓ salvo / ● não salvo** mostra a situação real:

| | Significado |
|---|---|
| **✓ salvo** | tudo que você mudou está no disco |
| **● não salvo** | há mudanças que ainda não chegaram ao disco |

Ele é preciso porque a gravação é agrupada: alterações seguidas dentro de
250 ms viram uma única escrita. O processo principal avisa a interface quando
a escrita acontece de fato, e só aí o indicador vira "salvo".

### Brilho e velocidade globais

Dois sliders que valem para **todas** as zonas:

- **Brilho** (0 a 100%) — multiplica a intensidade de todos os LEDs.
- **Veloc.** (0.1x a 3x) — multiplica a velocidade de todos os efeitos.

A velocidade global se soma à velocidade de cada efeito: um efeito em 1.00x com
a global em 2.00x corre em 2.00x.

### FPS

Quantos quadros por segundo o motor gera: 15, 20, 30 (padrão) ou 60.

- **15 fps** economiza CPU e deixa tudo mais suave (e some bem melhor).
- **30 fps** é o padrão: indistinguível de 60 fps numa fita de LEDs.
- **60 fps** é para efeitos muito rápidos. Cada quadro custa 13 escritas HID,
  então vale a pena conferir se o computador acompanha.

### Luzes ligadas / desligadas

O botão grande. **Desligado** apaga os LEDs de verdade — cada zona é levada a
preto uma vez, e não a cada quadro. A pré-visualização continua rodando, para
você poder ajustar o efeito com as luzes apagadas e acender só quando quiser.

### Pausar / Retomar

Pausa o motor de efeitos: os LEDs ficam com a última cor e o programa para de
escrever no hardware. Não desliga as luzes — para isso, use **Luzes desligadas**.

### ⚙ Configurações

| Opção | O que faz |
|---|---|
| **Iniciar o motor ao abrir** | começa a animação assim que o programa abre |
| **Iniciar com o sistema** | autostart no login do sistema (em modo oculto, `--hidden`) |
| **Minimizar para a bandeja** | fechar a janela não encerra o programa |
| **Abrir com as luzes apagadas** | começa com o output desligado |

---

## Zonas (a barra da esquerda)

Cada zona é uma parte física da placa. O cartão de cada zona mostra:

- o **nome** — o que você deu (✎) ou, se não deu nada, o nome do hardware
  (`LEDs onboard`, `Header ARGB 1`…);
- a **caixa de marcação** — liga e desliga a zona. Desligada, a zona é levada
  a preto explicitamente, e não simplesmente ignorada;
- a **quantidade de LEDs**, nos headers endereçáveis.

### ✎ Renomear a zona

Clique no ✎ e digite o nome. **Enter** confirma, **Esc** cancela, e clicar
fora também confirma. Deixar o campo em branco volta ao nome do hardware.

O nome vale **para o perfil**: cada perfil pode chamar as zonas do jeito que
faz sentido para ele. Ele aparece em todo lugar onde a zona aparece — no cartão
de zonas, na pré-visualização, no seletor "Seguir zona" e na mensagem do
botão de aplicar a todas.

### A quantidade de LEDs

O controlador **não informa** quantos LEDs há em cada header: isso depende do
que você conectou fisicamente. Por isso é um campo numérico, com o padrão de
**72** e o limite do hardware em **120**.

O valor é por zona e por perfil. Uma zona com 0 LEDs é simplesmente ignorada.

### ⇉ Aplicar a todas as zonas

Copia o efeito da zona selecionada (padrão, paleta e todos os parâmetros) para
**todas** as outras zonas. É o atalho para quando você quer o mesmo efeito em
todo lugar e não quer repetir o trabalho quatro vezes.

O que **não** é copiado:

- a **quantidade de LEDs** de cada zona — ela descreve o que está conectado;
- o **ligado/desligado** de cada zona.

O vínculo **Seguir zona** é desfeito em todas: uma zona que espelha outra
ignoraria a cópia.

Depois de aplicar, uma mensagem curta confirma no canto da janela.

### Seguir zona

No rodapé da barra de zonas. Faz a zona selecionada **espelhar** o efeito de
outra zona: ela passa a usar o mesmo padrão, a mesma paleta e os mesmos
parâmetros da zona escolhida, sem duplicar nada.

Útil quando duas partes da placa precisam ficar iguais — por exemplo, duas
ventoinhas que você quer sincronizadas — mas precisam poder ser desligadas
independentemente.

---

## Pré-visualização

A fita grande é **a zona que você está editando**. As fitas finas são as
outras. Cada fita traz o nome da zona e, nos headers endereçáveis, a
quantidade de LEDs.

O que aparece aqui é **exatamente** o que vai para o hardware: é o mesmo
buffer de pixels, desenhado no canvas. Nada é recalculado para a interface.

A pré-visualização continua funcionando com as luzes desligadas e com o motor
pausado.

---

## Efeitos

A grade com os 34 padrões, agrupados por categoria. Clicar num padrão aplica
ele na zona selecionada.

O nome de cada padrão é o identificador interno dele (`wave`, `chase`,
`aurora`…). O catálogo completo, com a descrição e todos os parâmetros de
cada um, está em [efeitos.md](efeitos.md).

---

## Gradiente

A paleta define as **cores**. Cada LED do efeito pega uma cor do gradiente — o
padrão escolhe qual ponto.

### A barra do gradiente

- **Clique** numa barra vazia para adicionar uma parada. A cor nova é a cor do
  gradiente naquele ponto.
- **Arraste** as bolinhas para mover as paradas.
- A parada selecionada aparece com a borda branca.

### Interpolação

`RGB` ou `HSV`.

- **RGB** interpola os canais direto. Entre azul e vermelho passa por roxo,
  escuro.
- **HSV** interpola matiz, saturação e valor. Entre azul e vermelho passa pelo
  magenta, e a cor se mantém viva na passagem.

### ⧉ Duplicar e ✕ Remover

**⧉** copia a paleta atual com um nome novo (`Arco-íris cópia`) e passa a usar
a cópia. É o jeito de experimentar sem perder a original — as paletas são
globais ao perfil, então mexer nelas afeta todas as zonas que a usam.

**✕** remove a paleta do perfil. Só some com a paleta; as zonas que a usavam
passam a usar a primeira da lista. O botão fica desabilitado quando só existe
uma paleta.

---

## Parâmetros

Os controles do efeito escolhido aparecem sozinhos, montados a partir da
definição do padrão. Não há lista fixa de sliders: cada efeito declara os
seus.

Cada rótulo tem um **?** ao lado que explica o que aquele parâmetro faz e o
que muda quando você mexe nele. As explicações completas estão em
[efeitos.md](efeitos.md).

O botão **?** existe em todos os painéis (Zonas, Pré-visualização, Efeitos,
Gradiente e Parâmetros). Ele abre no mouse e no clique, e fecha ao clicar fora
ou apertar Esc.

---

## A bandeja do sistema

O ícone na bandeja continua o programa vivo quando a janela é fechada (se a
opção **Minimizar para a bandeja** estiver ligada). O menu dá acesso rápido a
ligar/desligar as luzes, pausar e retomar o motor, e abrir a janela.

---

## Resumo do que dá para fazer

| | |
|---|---|
| **Zonas** | ligar, desligar, renomear, escolher a quantidade de LEDs, espelhar outra zona |
| **Efeitos** | 34 padrões em 6 categorias, com parâmetros próprios |
| **Cores** | 12 paletas prontas, gradientes multi-parada, interpolação RGB ou HSV, paletas duplicáveis |
| **Pré-visualização** | o quadro real de todas as zonas, com o nome de cada uma |
| **Perfis** | quantos quiser, com nome; troca instantânea; salvo automático |
| **Global** | brilho, velocidade, FPS, ligar/desligar as luzes |
| **Sistema** | autostart, bandeja, abrir escondido, aviso de conflito |
