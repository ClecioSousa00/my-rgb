# Como o MyRGB funciona

Este documento explica o MyRGB por dentro: o que acontece entre clicar num
efeito e a fita de LEDs acender, e por que o resultado é exatamente igual no
Linux e no Windows.

---

## A arquitetura em uma figura

```
   ┌───────────────────────────────────────────────────────────┐
   │ renderer (React)                                        │
   │  TopBar · ZoneRail · StripPreview · PatternPicker ·      │
   │  GradientEditor · ParamSliders                           │
   │                                                           │
   │  Não conhece o hardware. Não tem timers. Não escreve       │
   │  nada em disco.                                           │
   └───────────────┬───────────────────────────────────────────┘
                   │  window.myrgb.*  (contextBridge)
   ┌───────────────▼───────────────────────────────────────────┐
   │ preload                                                  │
   │  Typed API: chamada → invoke, evento → onX(callback)     │
   └───────────────┬───────────────────────────────────────────┘
                   │  IPC (invoke / send)
   ┌───────────────▼───────────────────────────────────────────┐
   │ main                                                     │
   │  EffectEngine  ──►  AuraUsbDevice  ──►  HID (node-hid)   │
   │  ProfileStore  ──►  JSON em disco                        │
   │  SettingsStore ──►  JSON em disco                        │
   │  Tray · detecção de conflito                            │
   └───────────────────────────────────────────────────────────┘
```

Três regras que o código respeita:

1. **O renderer nunca fala com o HID.** Ele só pede coisas pela ponte do
   preload. Quem abre o dispositivo é o processo principal.
2. **O motor de efeitos é o dono dos quadros.** O renderer não desenha quadro
   nenhum: ele recebe o buffer que já vai para o hardware e o pinta no canvas.
3. **O processo principal é o dono do disco.** O renderer nunca escreve arquivo;
   ele chama uma API e o processo principal grava.

---

## O caminho de um clique

1. Você clica num padrão no painel **Efeitos**.
2. O renderer chama `window.myrgb.setZoneEffect(zoneId, effect)`.
3. O preload faz `ipcRenderer.invoke('profile:setZone', ...)`.
4. O processo principal aplica a mudança no perfil, **grava o JSON em disco**
   (com um atraso de 250 ms, para agrupar alterações seguidas) e devolve o
   perfil atualizado.
5. O renderer recebe o perfil novo e redesenha.
6. O motor de efeitos, que está no processo principal, passa a usar o perfil
   novo no próximo quadro.

Nenhum passo disso tem uma cópia da verdade: o perfil no disco, o perfil na
memória do processo principal e o perfil no renderer são o mesmo objeto,
sincronizado por IPC.

---

## O motor de efeitos

### Um quadro

A cada quadro (30 fps por padrão), o motor:

1. Calcula o tempo em segundos desde que o motor subiu.
2. Para cada zona, resolve o efeito (se a zona está seguindo outra, usa o
   efeito da outra).
3. Para cada LED da zona, chama o padrão e recebe um número entre 0 e 1.
4. Converte esse número em cor usando o gradiente da paleta.
5. Aplica a intensidade e o brilho global.
6. Entrega o buffer pronto: o hardware recebe o mesmo buffer que a interface
   recebe.

### O contrato com os padrões

Um padrão (`src/main/engine/patterns/*.ts`) recebe um `PatternContext`:

| Campo | O que é |
|---|---|
| `ledIndex` | o índice do LED dentro da zona, começando em 0 |
| `ledCount` | quantos LEDs a zona tem |
| `position` | a posição normalizada, de 0 (primeiro LED) a 1 (último) |
| `time` | segundos desde que o motor subiu |
| `speed` | o multiplicador global de velocidade |
| `params` | os parâmetros do efeito, já preenchidos com os padrões |
| `sampleGradient(u)` | a cor do gradiente na posição `u` |

E devolve uma de duas coisas:

```ts
{ u: 0.42 }                       // a posição no gradiente
{ color: { r, g, b }, intensity }  // uma cor direta
```

Mais `intensity` (0 a 1), que multiplica o resultado — é assim que um padrão
faz "apagar" uma parte da fita sem precisar mexer no gradiente.

### Por que o resultado é idêntico em todo sistema

O render é uma **função pura de `(tempo, perfil)`**:

- Nenhum padrão chama `Math.random`. Quem precisa de aleatoriedade usa `hash()`,
  uma função determinística de hash.
- Nenhum padrão lê o relógio. O tempo vem do contexto.
- Nenhum padrão depende do tamanho da tela, da posição do mouse ou do estado da
  interface.

Como consequência, o quadro 42 é o mesmo no Linux, no Windows e em qualquer
máquina — e dá para provar isso comparando arquivos.

### A pré-visualização não é uma simulação

O `StripPreview` desenha o buffer que o motor acabou de produzir. Ele não roda
uma segunda versão do motor, nem recalcula nada: ele só pinta pixels. Se a
pré-visualização mostra roxo, o LED fica roxo.

A única diferença entre a pré-visualização e o hardware é a **escala**: a fita
grande da interface representa a zona editada, e as fitas finas representam as
outras zonas.

---

## O protocolo AURA USB

O controlador aparece como um dispositivo HID cru (`0b05:19af`). A
implementação está em `src/main/aura/`:

- `auraProtocol.ts` — **só bytes**. Monta e interpreta frames, sem tocar em
  hardware. É puro e testável.
- `auraDevice.ts` — o **transporte**. Abre o dispositivo, faz a sequência de
  inicialização e escreve os frames.

O transporte é HID puro (`node-hid`), que se comporta igual no Linux
(`hidraw`) e no Windows (`hid.dll`). Não existe caminho de código específico
por sistema operacional: **não há como o comportamento divergir**.

### A sequência de inicialização

```
1. EC 52 53 00 01   stop_gen1  — tira o controlador do motor de animação dele
2. EC 82            firmware    — resposta: EC 02 <ascii>
3. EC B0            config      — resposta: EC 30 <60 bytes da tabela>
4. EC 35 <ch> 00 00 FF         — coloca cada canal em modo direto
```

O passo 3 é o mais importante: é a **tabela de configuração** do hardware, e é
dela que o MyRGB tira o layout da placa. Nada é fixo no código — o número de
headers ARGB, o número de LEDs onboard e o número de headers 12V vêm do
próprio controlador.

### O mapa de canais

| Zona | Canal direto (`0x40`) | Canal de efeito (`0x35`) |
|---|---|---|
| LEDs onboard | `0x04` | 0 |
| Header ARGB 1 | `0x00` | 1 |
| Header ARGB 2 | `0x01` | 2 |
| Header ARGB 3 | `0x02` | 3 |

O passo 4 coloca **todos** os canais em modo direto (`0xFF`), o que significa
"quem escreve o byte manda": é o que garante que o MyRGB controle a placa em
vez do firmware.

### O stream direto (`0x40`)

Cada frame tem 65 bytes. O opcode `0x40` leva no máximo 20 LEDs por pacote, e
o bit `0x80` no byte de comando marca o último pacote do canal — o "aplique
agora". A divisão em pacotes está em `buildDirectPackets()`, implementada byte
a byte como no `AuraUSBController::SendDirect()` do OpenRGB, e há um teste que
compara os dois, pacote a pacote.

Com 217 LEDs (1 onboard + 3 headers de 72) são **13 escritas HID por quadro**.

---

## Prova de paridade Linux ↔ Windows

Como o render é uma função pura, dá para gravar os quadros exatos que seriam
enviados ao hardware e comparar os arquivos byte a byte.

```bash
# no Linux
npx electron . --dump-frames frames-linux --dump-count 60

# no Windows
MyRGB.exe --dump-frames frames-windows --dump-count 60

# compare (em qualquer uma das máquinas)
node tools/compare-frames.mjs frames-linux frames-windows
```

Saída esperada:

```
IDENTICAL: 60 frames match byte for byte
```

Cada arquivo `.bin` contém o cabeçalho do formato, a contagem de LEDs por zona
e os trios RGB de todos os LEDs. O `manifest.json` traz o perfil usado, para
garantir que as duas execuções usaram a mesma configuração.

O formato do arquivo:

```
magic    8 bytes  "MYRGBFRM"
u32      versão
u32      índice do quadro
u32      quantidade de zonas
u32[]    LEDs por zona
u32      tamanho do buffer de pixels
bytes    trios RGB
```

### As duas condições que precisam valer

1. **O mesmo perfil.** O `--dump-frames` usa o perfil padrão reconciliado com o
   layout real do hardware. Como o layout vem da tabela de configuração do
   controlador, as duas máquinas precisam ter a mesma placa (ou, no mínimo, o
   mesmo número de headers).
2. **O mesmo relógio.** O dump usa um relógio determinístico: o quadro *n* está
   sempre em exatamente `n / fps` segundos a partir de uma origem fixa. Não
   importa a hora do sistema, nem a carga da máquina.

---

## Zonas: o que é uma zona

Uma zona é uma parte física da placa que o controlador sabe endereçar:

| Tipo | O que é | Canais | LEDs |
|---|---|---|---|
| `fixed` | os LEDs onboard (chipset, cobertura do I/O, logo) | `0x04` | o que a tabela de configuração informar |
| `addressable` | um header 5V ARGB de 3 pinos | `0x00`, `0x01`, ... | **você informa** |

Os headers ARGB 5V são endereçáveis: cada LED tem seu próprio canal de cor.
Os headers RGB 12V de 4 pinos **não são endereçáveis** e não são suportados
por este controlador — é uma limitação do AURA USB, não do MyRGB.

A quantidade de LEDs de um header **não é informada pelo hardware**: ela
depende do que você conectou. Por isso é uma configuração, e o padrão é 72.
O OpenRGB 1.0 faz exatamente o mesmo, pelo mesmo motivo.

O layout é lido em tempo de execução e reconciliado com o perfil a cada
início: se você troca a placa, ou troca um header, o programa se ajusta sem
apagar os efeitos.

---

## Conflito com outros programas

Dois programas escrevendo no mesmo controlador produzem **cintilação** — o
hardware alterna entre os dois conjuntos de cores. Não existe arbitragem no
protocolo.

Por isso o MyRGB:

- abre o dispositivo com `nonExclusive: true`, o que permite abrir mesmo com
  outro programa segurando um handle (no Windows);
- **detecta o conflito continuamente**, a cada 5 segundos, e mostra um aviso
  na barra superior.

No Windows, os suspeitos são o `LightingService` e os processos do Armoury
Crate. No Linux, é o OpenRGB. A checagem roda o tempo todo, então se você
abrir o Armoury Crate depois de o MyRGB já estiver rodando, o aviso aparece
sem precisar reiniciar nada.

O passo a passo para resolver está em [windows.md](windows.md).

---

## Onde ficam as coisas

| | Caminho | Conteúdo |
|---|---|---|
| Perfis | `profiles/<nome>.json` | zonas, efeitos, paletas, configuração global |
| Configurações | `settings.json` | autostart, minimizar para a bandeja, último perfil, iniciar com as luzes apagadas |

`profiles/` fica dentro da pasta de dados da aplicação:

- Linux: `~/.config/my-rgb/`
- Windows: `%APPDATA%\my-rgb\`

A gravação do perfil é **debounced em 250 ms**: alterar um slider não gera uma
escrita por pixel de mouse. No encerramento, um `flush()` garante que a última
alteração seja gravada.

O processo principal avisa a interface quando a gravação acontece de fato
(evento `profile:saved`), e é isso que alimenta o indicador **✓ salvo / ● não
salvo** da barra superior.

---

## O arquivo de perfil

```jsonc
{
  "version": 1,
  "name": "Padrão",
  "zones": [
    {
      "zoneId": "argb0",
      "enabled": true,
      "name": "Frente da caixa",   // opcional: o nome que você deu
      "ledCount": 72,
      "effect": {
        "patternId": "wave",
        "paletteId": "rainbow",
        "params": { "rate": 1, "wavelength": 16, "amplitude": 1, "sharpness": 0 }
      },
      "followZoneId": null         // quando preenchido, esta zona espelha outra
    }
  ],
  "palettes": [ /* gradientes multi-parada */ ],
  "global": {
    "brightness": 1,
    "speed": 1,
    "fps": 30,
    "outputEnabled": true
  }
}
```

O esquema é o mesmo no Linux e no Windows: dá para copiar o arquivo de uma
máquina para a outra sem converter nada.

---

## Onde cada coisa mora no código

```
src/
  shared/            tipos + matemática de cor (usados pelos dois lados)
    types.ts         ZoneConfig, ParamSpec, Profile, canais de IPC
    color.ts         HSV, RGB, amostragem de gradiente
    api.ts           a superfície tipada da ponte
  main/
    aura/
      auraProtocol.ts  frames puros, sem hardware
      auraDevice.ts    transporte HID
    engine/
      engine.ts        o laço de quadros
      palette.ts       paletas embutidas + amostragem
      patterns/        os 34 padrões e o registro
    store/
      profileStore.ts  perfis em disco, reconciliação com o hardware
      settings.ts      configurações da aplicação
    platform/
      conflict.ts      detecção de Armoury Crate / OpenRGB
    docs/
      effectsDoc.ts    gerador do catálogo de efeitos
    index.ts           o processo principal, IPC, janela, tray, modos de CLI
    dumpFrames.ts      o gravador de quadros
    zones.ts           monta as zonas a partir do layout do hardware
    tray.ts            ícone e menu da bandeja
  preload/index.ts   a ponte contextBridge
  renderer/src/
    store.ts          estado (zustand) e a ponte com a API
    components/       TopBar, ZoneRail, StripPreview, PatternPicker,
                      GradientEditor, ParamSliders, HelpTip, Toast
tests/               vitest
tools/               scripts de linha de comando
documentation/       esta pasta
```
