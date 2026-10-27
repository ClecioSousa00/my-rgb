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

Uma coisa que economiza muito trabalho: **não existe código específico de
sistema operacional**. O node-hid fala HID puro, que se comporta igual no
Linux (`hidraw`) e no Windows (`hid.dll`). Não há caminho de código para
"apenas no Windows" — o mesmo binário funciona nos dois.

---

## Comandos

```bash
npm install          # instala e confere o binário nativo do node-hid
npm run dev          # electron-vite dev, com hot reload
npm run typecheck    # tsc nos dois projetos (node + web)
npm test             # vitest
npm run build        # build de produção em out/
```

### Empacotamento

```bash
npm run build:linux      # AppImage + .deb em release/
npm run build:win        # instalador NSIS (precisa do Windows ou do wine)
npm run build:win:dir    # release/win-unpacked/ — funciona em qualquer sistema
```

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
```

---

## Ferramentas

| Arquivo | Para quê |
|---|---|
| `tools/probe-aura.mjs` | Lê a config table do hardware real e mostra o layout |
| `tools/gen-icons.mjs` | Regenera os ícones do app e da bandeja |
| `tools/compare-frames.mjs <a> <b>` | Compara dois dumps de frames byte a byte |
| `tools/check-hid-binary.mjs` | Confere se o binário nativo do node-hid existe para esta plataforma |

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
- `src/main/features/sensors/store.ts` — `SensorsStore`: poll de 1 s,
  contador de assinantes, mínimo/máximo/histórico (60 amostras) e pausa
  quando a janela está escondida.

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

## Os testes

159 testes em 12 arquivos, todos rodando em alguns segundos.

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
| `tests/sensors.test.ts` | O mapeamento dos drivers hwmon, o parser do nvidia-smi e as estatísticas da sessão |
| `tests/health.test.ts` | O parser do `smartctl` (NVMe e ATA), a divisão da leitura privilegiada, os limites do veredito e a junção do CIM no Windows |
| `tests/format.test.ts` | Bytes, clocks, datas de BIOS, sensores e tempo relativo são formatados sem inventar valor |

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
npm run build:win        # release/MyRGB-0.1.0-setup.exe
```

O `build:win:dir` funciona em qualquer sistema e serve para conferir o
empacotamento (estrutura do asar, binário nativo, ícones) antes de ir para o
Windows.

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
