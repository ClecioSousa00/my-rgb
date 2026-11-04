# Desenvolvimento

Como o MyRGB é construído, testado e publicado.

---

## A regra das branches

O projeto tem três tipos de branch:

| Branch | Para quê |
|---|---|
| `dev` | **o trabalho do dia a dia acontece aqui** |
| `feat/...` | trabalho grande, criado a partir da `dev` (ex.: o dashboard) |
| `main` | só recebe o que já está pronto e testado |

O fluxo normal é:

```bash
git checkout dev
# ... trabalha, commita, testa ...
git push origin dev
```

Mudanças grandes vão para uma branch própria, criada a partir da `dev`:

```bash
git checkout dev
git checkout -b feat/nome-da-mudanca
# ... fases, commits pequenos, tudo verde ...
```

Ela volta para a `dev` **só quando aprovada**. Nada de merge direto na `main`.

E, **só quando o trabalho estiver pronto e testado**:

```bash
git checkout main
git merge dev          # ou: git merge --no-ff dev
git push origin main
```

`main` nunca recebe um commit de trabalho pela metade. Se algo ainda está em
experimento, ele fica na `dev` (ou na branch `feat/...`).

---

## A stack

| | |
|---|---|
| Runtime | Electron 45 |
| Bundler | electron-vite 6 + Vite 8 |
| Interface | React 19 + TypeScript 5.9 |
| Estilo | Tailwind CSS v4 |
| Estado | zustand |
| Testes | vitest 5 |
| Empacotamento | electron-builder 26 |
| Hardware | node-hid 3.4 |
| Diagnóstico | systeminformation 5 (SO, CPU, RAM, GPU e discos) + hwmon/nvidia-smi (sensores) |
| FPS (Windows) | helper .NET 8 + ETW (`Microsoft.Diagnostics.Tracing.TraceEvent`) |

Uma coisa que economiza muito trabalho: **o caminho da iluminação não tem
código específico de sistema operacional**. O node-hid fala HID puro, que se
comporta igual no Linux (`hidraw`) e no Windows (`hid.dll`). O mesmo binário
funciona nos dois. A única exceção é a leitura de FPS, que depende do ETW do
Windows e fica isolada em `src/main/features/overlay/` e no helper .NET.

---

## Comandos

```bash
npm install          # instala e confere o binário nativo do node-hid
npm run dev          # electron-vite dev, com hot reload
npm run typecheck    # tsc nos dois projetos (node + web)
npm test             # vitest — 318 testes em 18 arquivos
npm run build        # build de produção em out/
npm run build:helper # helper de FPS do Windows (precisa do .NET 8 SDK)
npm run selftest     # build + UI real, conferindo páginas, IPC e quadros
```

### Empacotamento

```bash
npm run build:linux      # AppImage + .deb em release/
npm run build:win        # instalador NSIS (precisa do Windows ou do wine)
npm run build:win:dir    # release/win-unpacked/ — funciona em qualquer sistema
```

Rode `npm run build:helper` **antes** do `build:win` para incluir o helper de
FPS no instalador. Sem ele, o instalador continua válido: o overlay abre, só o
FPS fica "indisponível" e a página oferece **Tentar novamente**.

Os recursos extras são declarados **por plataforma** no `electron-builder.yml`,
não no topo: um bloco de plataforma (`linux:`, `win:`) substitui a lista
global em vez de somar. Por isso cada um repete os ícones e acrescenta o que é
seu — a regra udev no Linux, o helper no Windows. Deixar os ícones só no topo
faz o pacote do Windows sair sem eles (bandeja e notificações sem imagem), e
foi o que aconteceu até o CI passar a conferir o conteúdo do pacote.

### Modos de linha de comando

O programa aceita algumas flags, que são exatamente as ferramentas de
diagnóstico:

| Flag | O que faz |
|---|---|
| `--selftest` | sobe a interface e confere que ela montou e está recebendo quadros |
| `--write-test` | escreve um arco-íris em todas as zonas (teste de hardware) |
| `--dump-frames <dir>` | grava os quadros em disco, para comparar entre sistemas |
| `--dump-offline` | junto com o de cima, não abre o dispositivo |
| `--gen-docs <arquivo>` | regera o catálogo de efeitos |
| `--hidden` | sobe sem janela (usado pelo autostart) |

```bash
npx electron . --selftest
npx electron . --write-test
npx electron . --dump-frames frames-linux --dump-count 60
node tools/compare-frames.mjs frames-linux frames-windows
npx electron . --gen-docs documentation/efeitos.md
```

### Scripts à parte

```bash
npm run probe      # lê a config table do hardware real e mostra o layout
npm run icons      # regenera os ícones do app e da bandeja
npm run docs       # regera documentation/efeitos.md
npm run games:data # baixa e normaliza a base de FPS (precisa de rede)
```

---

## Ferramentas

| Arquivo | Para quê |
|---|---|
| `tools/probe-aura.mjs` | Lê a config table do hardware real e mostra o layout |
| `tools/gen-icons.mjs` | Regenera os ícones do app e da bandeja |
| `tools/compare-frames.mjs <a> <b>` | Compara dois dumps de frames byte a byte |
| `tools/check-hid-binary.mjs` | Confere se o binário nativo do node-hid existe para esta plataforma |
| `tools/build-games-data.mjs` | Baixa, valida e normaliza a base de FPS distribuída com o app |

---

## Como os sensores são lidos

A página Sensores é a única que se atualiza sozinha, e o caminho é curto:

- `src/main/features/sensors/hwmon.ts` — lê `/sys/class/hwmon` (só Linux),
  converte a unidade do driver e descarta valores implausíveis;
- `src/main/features/sensors/nvidia.ts` — `nvidia-smi` nos dois sistemas,
  com cache de falha para não abrir um processo por segundo à toa;
- `src/main/features/sensors/system.ts` — carga, clocks e memória pelo
  `systeminformation`;
- `src/main/features/sensors/index.ts` — junta as três fontes, ordena e
  transforma cada falha em uma nota;
- `src/main/features/sensors/cooling.ts` — `buildCooling`: o resumo de
  refrigeração (bomba, ventoinhas, alarmes e notas). É uma função pura sobre
  as leituras já ordenadas, chamada depois do merge, para o cartão carregar o
  mín/máx da sessão sem recalcular nada;
- `src/main/features/sensors/store.ts` — `SensorsStore`: poll de 1 s,
  contador de assinantes, mínimo/máximo/histórico (60 amostras) e pausa
  quando a janela está escondida.

### O papel de um canal de ventoinha

O kernel não distingue bomba de ventoinha: é tudo tachômetro. O papel
(`role: 'pump'`) só é marcado quando o **driver** publica um rótulo com
"pump" (`AIO Pump`, `W_PUMP+`); sem rótulo, o canal fica `Ventoinha N`. A
regra de alarme também é deliberadamente simples: bomba abaixo de 100 RPM
avisa sempre; ventoinha parada só avisa quando o hardware que ela refrigera
passa de 80 °C — 0 RPM no modo passivo é normal. Nenhum RPM é derivado de
percentual (a ventoinha da GPU NVIDIA só existe em %).

O renderer não coleta nada: chama `startSensors` ao abrir a página, recebe os
lotes por `onSensors` e chama `stopSensors` ao sair. Como o histórico fica no
processo principal, fechar e reabrir a página continua a sessão.

---

## Como a saúde dos discos é lida

A coleta é sob demanda (a página pede, o main responde), sem poll:

- `src/main/features/health/smartctl.ts` — executa `smartctl -a -j` e lê o
  JSON; entende NVMe (`nvme_smart_health_information_log`) e ATA
  (`ata_smart_attributes`), traduz os atributos 5/9/12/187/194/197/198 e a
  vida restante dos 177/202/231/232/233. O código de saída do `smartctl` é
  ignorado de propósito: ele é uma máscara de problemas (disco reprovado,
  atributo no limite) e o JSON continua válido. `smartctlDevice` converte
  `/dev/nvme0n1` em `/dev/nvme0`, que é o endereço que o `smartctl` aceita.
- `src/main/features/health/verdict.ts` — o único lugar que decide o veredito,
  usado pelo Linux e pelo Windows. Um disco sem métrica nenhuma é `unknown`,
  nunca `good`.
- `src/main/features/health/windows.ts` — script PowerShell único que consulta
  `MSFT_PhysicalDisk`, `MSFT_StorageReliabilityCounter`,
  `MSStorageDriver_FailurePredictStatus` e `Win32_DiskDrive` (para casar a
  previsão de falha com o disco certo). O parser é separado do `execFile` para
  poder ser testado fora do Windows.
- `src/main/features/health/index.ts` — monta os cartões a partir do
  `si.diskLayout()` + `listDrives()`, chama a leitura normal e, quando falta
  permissão, deixa `needsElevation` para a página oferecer o botão. O lote
  privilegiado é um script fixo (`pkexec sh -c ... sh <devices>`), com os
  dispositivos passados como argumentos e um marcador entre as saídas.

A leitura é cacheada por 60 s: `smartctl -a` acorda um HDD adormecido, e um
refresh a cada abertura de página atrapalharia o disco. O botão **Atualizar**
passa `force` e ignora o cache.

---

## Como a rede é medida

O diagnóstico é uma execução só, sob demanda, e o resultado inteiro volta em um
objeto. A divisão existe para testar as partes sem depender de rede:

- `src/main/features/network/ping.ts` — o Node não manda ICMP sem root, então
  o teste usa o `ping` do sistema, um processo por alvo. `parsePingTimes` lê o
  tempo só em linhas que também têm `TTL`: é a única palavra que o Windows não
  traduz, e as linhas de resumo ("Mínimo = 12ms") não têm TTL, então não viram
  amostra. `time<1ms` vira 1. `summarizePing` fecha mín/média/máx, jitter (média
  da diferença entre pacotes consecutivos) e perda.
- `src/main/features/network/speed.ts` — download e upload pelo
  `speed.cloudflare.com`, com streams paralelos por tempo fixo (4 e 3, 8 s e
  6 s) e `bytes * 8 / segundos`. Um stream que falha é descartado, os outros
  seguem. Quando o servidor responde 429 (limite de testes) nasce um
  `SpeedTestError`, que a página transforma em observação em vez de "0 Mbps".
- `src/main/features/network/verdict.ts` — o veredito, separado em rede local ×
  provedor. Todo caso crítico tem o seu motivo: o original podia mostrar "RUIM"
  ao lado de uma frase elogiando a latência.
- `src/main/features/network/index.ts` — descobre o adaptador padrão pelo
  `systeminformation`, pinga roteador e dois resolvedores em paralelo, resolve
  três domínios, mede o download com um ping concorrente (bufferbloat -
  `loadedMs` só existe se o download foi medido) e depois o upload. Emite
  `NetworkProgress` a cada etapa e guarda o último relatório no processo
  principal, para sair e voltar à página não jogar fora um teste de 30 s.

Nada precisa de privilégio, nada é gravado em disco, e o cancelamento aborta os
pings e os `fetch` de uma vez — a promessa pendente resolve `null` e o relatório
anterior continua intacto. Os destinos e as durações são constantes em
`src/shared/features/network.ts`, importadas pelo main e pela página.

---

## Como o FPS por jogo é calculado

A página não usa o catálogo do Reset Explode. A base é normalizada a partir de
duas fontes públicas em CC BY 4.0 e distribuída com o aplicativo; a metodologia
completa está em [jogos.md](jogos.md).

- `tools/build-games-data.mjs` — gera `src/main/features/games/data/catalog.json`
  a partir de `games.csv`/`gpus.csv` (PCGameBenchmarks) e do
  `official.json` (Open GPU Benchmarks). Valida cada linha, descarta o que não
  encaixa, deduplica títulos pelo ano mais recente e agrupa execuções medidas
  iguais. Rode com `npm run games:data` (ou `-- --from DIR` para cópias locais).
- `src/main/features/games/dataset.ts` — valida a base carregada e monta os
  índices: busca de jogos sem acento/caixa, tabela de GPUs e casamento de nome
  (`canonicalGpu`/`matchGpu`). O casamento preserva `Ti`, `SUPER`, `Laptop` e
  memória e prefere o nome mais longo contido no nome detectado.
- `src/main/features/games/estimate.ts` — matemática pura: interpolação log-log
  entre as 12 âncoras (excluindo valores na trava), fatores de resolução/preset,
  extrapolação limitada acima da âncora mais forte e `null` abaixo da mínima.
- `src/main/features/games/query.ts` — prioridade medida → estimativa → sem
  dados, com a explicação e os avisos de cada linha. O 1% low só é preenchido
  por uma execução medida; nunca é derivado.
- `src/main/features/games/index.ts` — `GamesService`: usa o `getSystem()` da
  página Sistema, resolve a GPU (detectada ou escolha manual) e devolve as 32
  linhas em destaque ou o resultado da busca. Não toca na rede.
- `src/main/features/games/reference.ts` — tabelas relativas de GPU/CPU do
  Reset Explode, usadas **só** pelo Gargalo; ficaram separadas para o
  diagnóstico não carregar a base de jogos.

A página pede o relatório ao abrir e a cada mudança de opção, busca ou GPU. Cada
linha carrega `measured`, `estimated` ou `none`, além da confiança, para não
misturar medido com calculado. Não há chave, cache de API nem chamada externa.

---

## Como o gargalo é calculado

É um porte direto do `BottleneckAnalyzer` do Reset Explode: a ordem das regras,
os limites e os textos são os originais. A única diferença é a origem do sinal
térmico, explicada abaixo.

- `src/main/features/bottleneck/classify.ts` — `classify()` na mesma ordem:
  VRAM ≥ 97 % → térmico (CPU ≥ 95 °C ou queda térmica da GPU) → GPU ≥ 90 % →
  CPU ou núcleo ≥ 85 % → RAM ≥ 92 % → travado. Também ficam aqui os títulos, os
  conselhos e `balance()`, com as cinco faixas e os textos exatos do original.
  Sem I/O, para que as fixtures fixem cada fronteira.
- `src/main/features/bottleneck/sample.ts` — transforma um lote de sensores em
  uma amostra: a primeira carga da GPU, a leitura `VRAM em uso`, a carga total
  da CPU, o núcleo mais ocupado, a RAM e as temperaturas. Para a CPU vale a
  temperatura **mais alta** (é o sensor que pode limitar); para a GPU, a
  `Temperatura` simples, porque o hotspot esquentaria antes e dispararia a regra
  cedo demais. O que faltou vira uma observação na página.
- `src/main/features/bottleneck/session.ts` — a distribuição dos limitadores
  (empate mantém a ordem de primeira aparição, como o `OrderBy` estável do
  original), as médias e os máximos. O FPS médio só conta valores > 0, então um
  campo ausente não puxa a média para baixo.
- `src/main/features/bottleneck/index.ts` — `BottleneckService`: assina o
  `SensorsStore` em vez de coletar por conta própria (uma coleta por segundo
  serve as duas páginas). `start`/`stop` são contados como referência, e uma
  sessão em andamento mantém uma referência extra — sair da página no meio de
  uma análise não congela a contagem. Um `setTimeout` de segurança fecha a
  sessão quando a janela está escondida e o poll fica bloqueado; ele é limpo ao
  cancelar, ao terminar e ao encerrar.

**A diferença do throttle:** o Reset lê os bits de *thermal slowdown* da NVML;
o `nvidia-smi` não os expõe. Aqui a queda térmica é aproximada pela
temperatura da GPU ≥ 90 °C. A classificação continua recebendo o campo
`gpuThermalCap` como entrada, então as regras são as mesmas — só a fonte do
sinal muda. A página diz isso em uma linha no rodapé.

O relatório fica só na memória do processo principal; não é um documento. O FPS
real vem do helper do Windows (o mesmo do overlay); no Linux a sessão roda sem
FPS, e o campo fica **—**.

---

## Como o overlay e o FPS funcionam

O overlay é uma **janela separada**, não um componente da janela principal. O
processo principal formata cada linha e envia um quadro pronto a cada 500 ms; o
bundle do overlay (`src/renderer/src/overlay/`) só desenha o que recebe, sem
acessar hardware.

- `src/shared/features/overlay.ts` — catálogo das 24 métricas (mesma ordem e
  mesmos padrões do Reset Explode), `OverlayConfig`, normalização e o formato do
  quadro. É a única fonte para a página e para o overlay.
- `src/main/features/overlay/manager.ts` — `OverlayService`: cria a janela
  (`transparent`, `frame: false`, `alwaysOnTop` em `screen-saver`,
  `skipTaskbar`, `focusable: false`, `setIgnoreMouseEvents(true)` e
  `showInactive()`), registra o atalho global, grava a configuração em
  `settings.json` e mantém uma referência no `SensorsStore` e no `FpsService`
  enquanto a janela existe — por isso a coleta continua com a janela principal
  escondida atrás do jogo.
- `src/main/features/overlay/position.ts` — só a matemática dos quatro cantos,
  com margem de 12 px e limite na borda; testável sem Electron.
- `src/main/features/overlay/frame.ts` — transforma o lote de sensores e a
  amostra de FPS em textos. Ausente é **—**, nunca 0; RAM e VRAM em GB usam o
  total do `SystemSnapshot`.
- `src/main/features/overlay/fps.ts` — `FpsService`, contado como referência
  (overlay e sessão do Gargalo). Começa sob demanda, desiste depois de três
  falhas e considera a amostra velha depois de 3 s (jogo fechado ou menu).
- `src/main/features/overlay/helper.ts` — ponte com o helper: servidor de named
  pipe, `Start-Process -Verb RunAs`, uma linha JSON por comando e um `ping`
  antes de pedir frames.

### O helper do Windows

`helper/MyRgb.Helper` é um executável .NET 8 (`net8.0-windows`) que lê os
eventos "Present" do DXGI (evento 42) e do D3D9 (evento 1) via ETW — a mesma
técnica do PresentMon, sem injetar nada no jogo. Ele responde com o processo em
primeiro plano:

```json
{"pid":4242,"process":"Cyberpunk2077","fps":143.8,"frameTimeMs":6.94,"low1Fps":121.2,"recent":[6.9,7.1]}
```

- O app **não** roda elevado: o helper é iniciado sob demanda com UAC. Como um
  processo elevado não herda o stdout do pai, o protocolo usa um named pipe
  (`\\.\pipe\myrgb-helper-<aleatório>`) em que o Electron é o servidor e o
  helper o cliente. Sem `--pipe`, ele também aceita stdio, para depuração.
- O FPS é calculado pelo relógio dos eventos (imune ao atraso de entrega do
  ETW); o 1% low é o percentil 99 do frametime dos últimos 10 s.
- Esta versão lê **só FPS**. Temperaturas, ventoinhas e tensões no Windows
  continuam pendentes (a página Sensores diz isso).
- `npm run build:helper` publica um executável único e autossuficiente em
  `helper/publish/win-x64/`; o electron-builder copia para `resources/helper/`.
  Sem ele, nada quebra: só o FPS fica indisponível.

---

## Como os registos funcionam

O processo principal escreve tudo o que imprime (`console.log/warn/error`) num
ficheiro em `<userData>/logs/my-rgb.log`. O espelho é instalado uma vez por
`startLogging` (`src/main/logging/index.ts`), antes do `app.whenReady()`, para
que uma falha no arranque também deixe rasto — o terminal não existe quando o
programa é aberto pelo menu.

Três decisões mantêm isto ligado sem risco:

- **Rotação, não crescimento infinito.** Ao passar de 2 MB o arquivo vira
  `my-rgb.log.1`; até três arquivos antigos são mantidos (`keep: 3`), sempre
  menos de 8 MB no total.
- **Registar nunca derruba o programa.** `append()` engole o erro e marca o
  logger como quebrado; a partir daí o console continua sozinho, em vez de
  tentar e falhar a cada linha.
- **Nível filtrável.** `LogLevel` vive em `src/shared/logging.ts` e é usado
  pelo escritor e pelo selector da interface. `MYRGB_LOG_LEVEL` sobrepõe a
  configuração salva (é o escape para suporte); a opção da interface vale
  imediatamente, sem reiniciar (`applyLogLevel`).

Os eventos de ciclo de vida são registados explicitamente porque o console não
os tem: conexão/desconexão do controlador (com firmware e número de zonas),
início/paragem do motor pedidos pelo utilizador, `child-process-gone` e o
`before-quit`. `uncaughtException` e `unhandledRejection` também vão para o
ficheiro e **não** encerram o processo: as luzes continuam a funcionar e a
causa fica escrita.

O relatório de crash é opcional (`src/main/logging/crash.ts`). Quando ligado,
`crashReporter.start({ uploadToServer: false })` corre antes do `app.whenReady()`
— só processos criados depois disso são monitorados — e `app.setPath('crashDumps')`
aponta os minidumps para `logs/crash/`, ao lado do registo. Nada é enviado para
servidor nenhum: o app não tem um, e inventar um seria pior que o problema.
`MYRGB_CRASH_REPORTER=0` ou `--no-crash-reporter` desligam-no, e uma falha ao
iniciar não impede o arranque (devolve `false`).

O `--selftest` confirma as duas pontas: `logReady` verifica que o ficheiro
existe e tem conteúdo, e `logsUi` verifica que o selector de nível e o botão
"Abrir pasta de registos" chegaram ao build.

---

## Como a iluminação é roteada

O motor não conhece hardware: ele renderiza o quadro e entrega cada zona ao
**roteador** (`src/main/light/router.ts`). Hoje existe um backend só — o
controlador AURA —, então o caminho é o mesmo de antes; a divisão existe para
que o segundo backend não encoste no motor.

Um **alvo** (`LightTarget`, em `src/shared/features/light.ts`) é uma zona
endereçável de um backend: `aura:argb0`, `openrgb:0:2`, `razer:keyboard`.
Cada alvo guarda o backend, o dispositivo, o índice da zona dentro dele, o nome,
a quantidade de LEDs e se faz parte da saída.

O perfil continua na **versão 1** e ganhou um campo opcional `targets`:

- Perfil antigo (sem `targets`) abre igual: `reconcileProfile` sintetiza os
  alvos AURA a partir do layout do controlador, e `ZoneConfig.zoneId` segue
  sendo a chave curta que o app sempre usou (`argb0`, `mainboard`). Nada é
  migrado no arquivo.
- Zona desligada no perfil **continua sendo escrita**, em preto: o `enabled` do
  alvo diz se ele faz parte da saída, não se o efeito está ligado.
- Alvos de outros backends são preservados quando a reconciliação refaz os da
  AURA, e um arquivo importado passa por uma sanitização (backend conhecido,
  índice inteiro e não negativo, ids sem repetição).

Três regras fazem um backend externo ser seguro de acrescentar:

1. **Um backend não derruba os outros.** Só o AURA é crítico: se a escrita nele
   falha, o motor para e a interface mostra o mesmo erro de sempre. OpenRGB,
   Razer e Corsair devolvem o erro por `onError` e o quadro continua.
2. **Intervalo mínimo por alvo.** O backend declara `minIntervalMs`, para um
   dispositivo que engasga com 30 atualizações por segundo.
3. **Acquire/Release.** O backend é "segurado" enquanto tem alvos ligados e
   liberado quando o último alvo some. O AURA já é aberto pelo processo
   principal, então o `acquire` dele só confirma que o dispositivo responde.

`tests/light.test.ts` cobre os alvos, a migração implícita e essas três regras;
`tests/output.test.ts` continua provando que o quadro que chega ao hardware é
byte a byte o mesmo que aparece na prévia.

---

## Os testes

318 testes em 18 arquivos, todos rodando em alguns segundos.

| Arquivo | O que garante |
|---|---|
| `tests/protocol.test.ts` | Os frames do AURA USB são montados byte a byte como esperado |
| `tests/output.test.ts` | A divisão em pacotes do stream direto bate com a do OpenRGB |
| `tests/palette.test.ts` | A matemática de cor (RGB, HSV, amostragem de gradiente) |
| `tests/engine.test.ts` | O motor é determinístico, e todo padrão renderiza sem estourar |
| `tests/conflict.test.ts` | A detecção de conflito encontra os processos certos |
| `tests/store.test.ts` | Os perfis: salvar, recarregar, renomear, reconciliar, aplicar a todas |
| `tests/patterns.test.ts` | Todo padrão tem nome, categoria, descrição e todos os parâmetros descritos |
| `tests/documentation.test.ts` | A documentação está em dia e não tem link quebrado |
| `tests/system.test.ts` | As unidades filtram pseudo-filesystems e acham o disco físico da partição |
| `tests/sensors.test.ts` | O mapeamento dos drivers hwmon, os rótulos de bomba, o parser do nvidia-smi, as estatísticas da sessão e o resumo de refrigeração |
| `tests/health.test.ts` | O parser do `smartctl` (NVMe e ATA), a divisão da leitura privilegiada, os limites do veredito e a junção do CIM no Windows |
| `tests/network.test.ts` | O parser do `ping` (Linux e Windows pt-BR), jitter e perda, e os limites do veredito de rede |
| `tests/games.test.ts` | Validação da base, casamento de GPU, interpolação log-log, trava, 1% low nunca derivado, hardware desconhecido e a cobertura dos 32 destaques |
| `tests/bottleneck.test.ts` | A ordem e os limites das regras, os textos do equilíbrio, a amostragem, o relatório, a contagem de referência e o timer da sessão |
| `tests/overlay.test.ts` | O catálogo e a normalização do overlay, os quatro cantos, o formatador de métricas, o protocolo do helper e a contagem de referência/falhas do serviço de FPS |
| `tests/light.test.ts` | Os alvos de iluminação, a migração implícita dos perfis antigos e as regras do roteador (throttle, acquire/release, isolamento de erro por backend) |
| `tests/format.test.ts` | Bytes, clocks, datas de BIOS, sensores e tempo relativo são formatados sem inventar valor |
| `tests/logging.test.ts` | O nível filtra como esperado, a rotação mantém três arquivos, uma pasta sem permissão nunca derruba o programa, o relatório de crash não envia nada e as configurações reparam um nível inválido |

```bash
npm test                  # tudo
npm run test:watch        # durante o desenvolvimento
npx vitest run tests/store.test.ts
```

### O teste que protege a documentação

`tests/documentation.test.ts` compara o `documentation/efeitos.md` com o que o
gerador produziria. Se você adicionar um efeito e não rodar `npm run docs`, o
teste falha. É o que garante que a documentação "sempre esteja atualizada".

---

## Como adicionar um efeito novo

1. Crie (ou edite) o arquivo do padrão em `src/main/engine/patterns/`:

   ```ts
   {
     id: 'meu-efeito',
     name: 'Meu efeito',
     category: 'Básicos',
     description: 'Uma frase explicando o que ele faz.',
     params: [
       RATE,
       {
         key: 'intensity',
         label: 'Intensidade',
         type: 'number',
         min: 0,
         max: 1,
         step: 0.01,
         default: 0.8,
         description: 'O que este parâmetro faz. Este texto aparece no "?" da interface.'
       }
     ],
     render: (ctx) => ({ u: ctx.position })
   }
   ```

2. **A descrição do parâmetro é obrigatória.** O teste `tests/patterns.test.ts`
   falha sem ela — é o texto que aparece no "?".
3. Registre o padrão no arquivo do grupo (`basicPatterns`, `wavePatterns`, …).
   A lista em `src/main/engine/patterns/index.ts` já reúne todos os grupos, então
   não precisa mexer lá.
4. Rode `npm run docs` para atualizar o catálogo.
5. Rode `npm run typecheck && npm test`.

A interface não precisa de nenhuma alteração: o slider aparece sozinho, com o
rótulo, o intervalo e a explicação que você declarou.

### Regras do motor

Um padrão **precisa** respeitar estas regras, senão a paridade entre Linux e
Windows quebra:

- **Nunca** chamar `Math.random`. Use `hash(n)` — é determinístico.
- **Nunca** ler o relógio. O tempo vem de `ctx.time`.
- **Nunca** depender do tamanho da tela ou do estado da interface.
- Devolver `u` entre 0 e 1 (a posição no gradiente) ou uma cor direta.

---

## Como adicionar uma paleta

As paletas embutidas estão em `src/main/engine/palette.ts`:

```ts
palette('meu-id', 'Meu gradiente', 'rgb', [
  [0, '#ff0000'],
  [0.5, '#00ff00'],
  [1, '#0000ff']
])
```

Depois rode `npm run docs` para incluir a paleta no catálogo.

---

## O binário nativo

O `node-hid` 3.x traz binários prontos (N-API v4) para todas as plataformas
que o MyRGB usa. N-API tem ABI estável, então o mesmo binário funciona no Node
e no Electron — **não há compilação envolvida**.

O `postinstall` roda `tools/check-hid-binary.mjs`, que avisa se o binário da
sua plataforma não estiver no lugar.

O binário nativo compilado localmente (`node_modules/node-hid/build`) é
**excluído** do pacote de propósito: em tempo de execução o `pkg-prebuilds`
prefere esse diretório ao prebuild, e ele conteria o binário do Linux dentro do
instalador do Windows. O que vai no pacote são só os prebuilds, cada um com o
binário da plataforma certa.

---

## O instalador do Windows

O instalador NSIS (`MyRGB-<versão>-setup.exe`) precisa ser gerado **no
Windows** ou numa máquina com o `wine` instalado: o alvo NSIS do
electron-builder executa o instalador recém-gerado para extrair o
desinstalador, e isso exige o `wine` no Linux.

```bash
# no Windows
npm run build:win        # release/MyRGB-0.2.0-setup.exe
```

O `build:win:dir` funciona em qualquer sistema e serve para conferir o
empacotamento (estrutura do asar, binário nativo, ícones) antes de ir para o
Windows.

O helper de FPS entra como recurso extra (`resources/helper/MyRgb.Helper.exe`)
quando `helper/publish/win-x64/MyRgb.Helper.exe` existir. Ele é publicado à
parte com `npm run build:helper`, porque precisa do .NET 8 SDK no Windows; o
instalador gerado sem ele continua válido, apenas sem FPS.

---

## Integração contínua

`.github/workflows/ci.yml` roda em dois sistemas:

- **Linux**: `npm run typecheck`, a suíte de testes (menos `conflict.test.ts`,
  que lê processos reais e é instável num runner compartilhado) e
  `npm run build`.
- **Windows**: `npm install`, `npm run build:helper` com o .NET 8 e
  `npm run build:win:dir`. No fim, confere que o pacote gerado tem o
  `MyRGB.exe`, o helper em `resources/helper/`, o `icon.png` e o `tray.png`.
  É essa checagem que impede o pacote de sair sem os ícones de novo.

O instalador NSIS em si não é gerado no CI: ele precisa do Windows (ou do
`wine`) para extrair o desinstalador.

---

## Licença e atribuição

- [LICENSE](../LICENSE): MIT © 2026 ClecioSousa00.
- [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md): o texto MIT do Reset
  Explode, a frase de atribuição, a tabela de arquivos derivados, as
  dependências de runtime e a nota sobre o protocolo do AURA (reimplementado a
  partir do comportamento, sem código do OpenRGB).
- Todo arquivo derivado do Reset carrega o aviso no cabeçalho.

---

## Rodando nesta máquina (Linux, Wayland)

Em Wayland, `xwininfo` e `xwd` **não** enxergam a janela do Electron — isso já
causou uma investigação errada antes. Para inspecionar a interface, use o
protocolo de depuração:

```bash
npm run build
npx electron . --no-sandbox --disable-gpu --remote-debugging-port=9222
```

E depois, em outro terminal:

```bash
curl -s http://127.0.0.1:9222/json/list
```

O `--no-sandbox` é necessário quando
`kernel.apparmor_restrict_unprivileged_userns = 1` e o `chrome-sandbox`
empacotado não tem o bit setuid: sem ele o processo de GPU morre com
`FATAL: GPU process isn't usable`. O `--disable-gpu` (SwiftShader) remove
esse caminho de erro.

A inicialização leva de 20 a 30 segundos: a leitura do dispositivo faz até 8
tentativas de leitura com timeout de 1 segundo cada.
