# Funcionalidades

O MyRGB tem uma navegação lateral com dez páginas: a de **Iluminação** (a tela
original, descrita abaixo) e nove páginas de diagnóstico e desempenho que estão
sendo incorporadas do Reset Explode. Este documento começa pela navegação e
depois detalha a tela de iluminação, que é a que já está completa.

---

## A navegação

```
┌──────────────┬────────────────────────────────────────────────────────┐
│ M MyRGB      │ ILUMINAÇÃO   ● AULA3-AR32-0309   Perfil [Padrão ▾] …   │
├──────────────┼────────────────────────────────────────────────────────┤
│ MYRGB     ▾  │                                                        │
│  Visão geral │                                                        │
│  Iluminação  │                                                        │
│ DIAGNÓSTICO▾ │                                                        │
│  Sistema     │                                                        │
│  Sensores    │                                                        │
│  Discos      │                                                        │
│  Rede        │                                                        │
│ DESEMPENHO▾  │                                                        │
│  Jogos       │                                                        │
│  Gargalo     │                                                        │
│  Overlay     │                                                        │
│ INTEGRAÇÕES▾ │                                                        │
│  Integrações │                                                        │
└──────────────┴────────────────────────────────────────────────────────┘
```

- Os grupos recolhem ao clicar no título. A página aberta e os grupos
  recolhidos ficam gravados em `settings.json`, então o programa abre do jeito
  que você deixou.
- O item ativo é marcado por **uma barra branca à esquerda** e pelo fundo mais
  claro — sem cor, como no Reset Explode.
- O visual é monocromático de propósito: preto, branco e cinzas. Estados
  (bom/atenção/ruim) aparecem por **inversão** do selo, não por cor.
- Enquanto uma página não está implementada, ela mostra o título, o que vai
  conter e a fase do plano — nunca uma tela em branco.

| Página | O que é |
|---|---|
| Iluminação | Efeitos, zonas, gradiente e parâmetros (tela original) |
| Visão geral | Resumo de hardware, desempenho e saúde |
| Sistema | SO, placa-mãe/BIOS, CPU, RAM, GPU e discos — **pronta** |
| Sensores | Temperatura, clock, carga, voltagem, ventoinhas e consumo — **pronta** |
| Discos | Unidades e Saúde — **pronta** |
| Rede | Latência, jitter, perda, DNS, velocidade e bufferbloat |
| Jogos | FPS esperado por jogo, resolução, preset e upscaling |
| Gargalo | Equilíbrio GPU × CPU, leitura ao vivo e sessão |
| Overlay | Métricas por cima do jogo |
| Integrações | OpenRGB, Razer Chroma e Corsair iCUE |

> **Nota:** Iluminação, Sistema, Sensores e as duas abas de Discos já
> funcionam. As outras páginas descrevem o que virá; o plano do projeto tem a
> ordem completa.

---

## A tela de Sistema

Mostra o que está dentro da máquina sem abrir o gabinete. Os dados vêm do
`systeminformation`, que lê WMI no Windows e o kernel/DMI no Linux; a leitura é
guardada por um minuto e o botão **Atualizar** força uma nova.

- Um cartão por categoria, e todos recolhem ao clicar no título:
  - **Sistema** — SO, kernel (ou build), arquitetura, nome do computador, UEFI;
  - **Placa-mãe e BIOS** — fabricante, modelo, revisão, versão/data da BIOS;
  - **Processador** — modelo, núcleos físicos, threads, clock na hora da
    leitura, clock máximo, cache L3 e socket;
  - **Memória** — total, disponível, tipo, velocidade, canais estimados e, por
    pente, slot, tamanho, fabricante e part number;
  - **Placa de vídeo** — nome, VRAM, driver, barramento e se é integrada;
  - **Discos** — modelo, tipo, interface, tamanho, firmware e número de série.
- Cada valor é um par **rótulo / campo** em fonte monoespaçada. Um campo que o
  sistema não respondeu aparece como **—**, nunca como zero.
- **Memória sem detalhes:** no Linux o `dmidecode` exige root e no Windows o
  WMI pode estar bloqueado. Nesse caso o cartão mostra o total e uma nota
  explicando o que falta, em vez de inventar um slot.
- **Placa NVIDIA sem nome:** quando o `nvidia-smi` não está instalado, a GPU
  aparece como `Device 2d05`; o cartão avisa por quê. Com ele instalado, o nome
  comercial, a VRAM e a versão do driver são preenchidos.
- **Observações** reúne o que não pôde ser lido, com o motivo.

---

## A tela de Sensores

A única página que se atualiza sozinha: uma leitura por segundo, enquanto ela
está aberta. O trabalho acontece no processo principal, que só liga a coleta
quando a página assina o stream — e a desliga ao sair, ou quando a janela fica
escondida.

- **Ao vivo · 1 s** no cabeçalho, com um ponto que pulsa. **Pausar** congela a
  tela sem perder os valores; **Retomar** volta a acompanhar.
- **Chips por tipo** (Temperatura, Carga, Clock, Consumo, Tensão, Ventoinha,
  Memória) mostram quantas leituras existem de cada tipo e filtram a tabela.
  A busca ao lado filtra por hardware, sensor ou tipo.
- **Um cartão por hardware** — CPU, GPU, SSD, memória, placa-mãe, rede — com
  uma linha por leitura:
  - **agora**, **mín** e **máx** da sessão, em fonte monoespaçada;
  - um **sparkline** com o último minuto;
  - quando a leitura passa do limite do próprio sensor (ex.: a temperatura
    crítica do NVMe), o valor **inverte** para branco sobre preto. Nenhuma cor
    é usada para dizer "ruim".
- **O mínimo, o máximo e o histórico vivem no processo principal**, não na
  página: fechar e reabrir Sensores continua a sessão em vez de recomeçar.
- **De onde vêm os números:**
  - Linux — `/sys/class/hwmon` para temperaturas, ventoinhas, tensões, consumo
    e clocks; o kernel já entrega cada leitura com a unidade do driver, que é
    convertida aqui;
  - Windows — carga, clocks e memória pelo `systeminformation`; os sensores de
    temperatura e ventoinha da placa-mãe chegam com o helper da fase 7;
  - NVIDIA — `nvidia-smi` nos dois sistemas, quando instalado. Campos que o
    driver não responde (`[N/A]`) simplesmente não aparecem.
- **Sanidade antes de exibir:** um valor absurdo (a leitura de 65 261 850 °C
  que um NVMe pode devolver quando o arquivo falha) é descartado, e um sensor
  que não puder ser lido vira **—**, nunca zero.
- **Observações** no rodapé explicam o que faltou e por quê — por exemplo, que
  o driver `asus` não expôs ventoinhas ou que o helper do Windows ainda não
  existe.

---

## A tela de Discos

Duas abas.

**Unidades** — um cartão por volume, com anel de ocupação (branco = usado,
cinza = livre), o ponto de montagem (`/`, `/home`, `C:`), o tipo (SSD, HDD, USB,
Rede, Óptico), o sistema de arquivos e o disco físico correspondente. O rodapé
soma o espaço de todas as unidades. Partições de sistema (EFI, snap) ficam de
fora, como no gerenciador de arquivos.

**Saúde** — um cartão por disco físico, com o veredito (**Saudável**,
**Atenção**, **Crítico** ou **Sem dados**) e os motivos logo abaixo: é o motivo
que explica o selo, não o contrário. Só aparecem as métricas que o disco
realmente informou — temperatura, desgaste e vida restante, horas ligado e em
dias, ciclos liga/desliga, setores realocados/pendentes/não corrigíveis, erros
de mídia do NVMe, reserva (spare), autoteste, total lido e gravado. O veredito
sai das mesmas regras nos dois sistemas:

- o disco reprovar no autoteste, um atributo no limite de falha, um aviso
  crítico do NVMe ou o Windows dizer "não saudável": **crítico**;
- desgaste a partir de 80% (planeje a troca) e 95% (fim da vida); temperatura
  acima de 70 °C em SSD/NVMe (85 °C crítico) e 55 °C em HDD (65 °C crítico);
- qualquer setor realocado, pendente ou não corrigível: no mínimo **atenção**.

De onde vêm os números:

- **Linux** — `smartctl -a -j` do `smartmontools`, a mesma leitura para NVMe e
  SATA. Ele normalmente precisa de root: a página tenta a leitura normal e, se
  faltar permissão, oferece **Ler com privilégio**, que pede a senha uma única
  vez (`pkexec`) e lê todos os discos de uma vez; recusar mantém o que já foi
  lido. Sem `smartctl`, a página mostra os discos com **sem dados** e a nota
  `sudo apt install smartmontools`.
- **Windows** — a API de armazenamento (CIM): `MSFT_PhysicalDisk` para mídia,
  barramento e saúde geral, `MSFT_StorageReliabilityCounter` para temperatura,
  desgaste, horas e contadores de erro, e `MSStorageDriver_FailurePredictStatus`
  para o aviso de falha do próprio disco. É a mesma leitura do Reset Explode,
  sem esperar o helper da fase 7 — quando ele chegar, o cartão não muda.
- A leitura fica em cache por 60 s (um HDD adormecido acorda com o `smartctl`);
  **Atualizar** força uma nova.
- Um disco que não responde (pendrive com bridge USB sem suporte, disco sem
  permissão) fica como **sem dados** — nunca como saudável. No Windows o
  "Healthy" que ele dá para qualquer pendrive não conta como métrica.

---

## A tela de iluminação

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

A grade com os 50 padrões, agrupados por categoria. Clicar num padrão aplica
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
| **Efeitos** | 50 padrões em 6 categorias, com parâmetros próprios |
| **Cores** | 12 paletas prontas, gradientes multi-parada, interpolação RGB ou HSV, paletas duplicáveis |
| **Pré-visualização** | o quadro real de todas as zonas, com o nome de cada uma |
| **Perfis** | quantos quiser, com nome; troca instantânea; salvo automático |
| **Global** | brilho, velocidade, FPS, ligar/desligar as luzes |
| **Sistema** | autostart, bandeja, abrir escondido, aviso de conflito |
