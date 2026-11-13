# Tarefas para MyRGB

> Documento vivo com ideias, melhorias, bugs e funcionalidades a implementar. Atualizar conforme necessário.

## Status

- [ ] Pendente
- [x] Concluído
- [~] Em andamento
- [!] Bloqueado

---

## 1. Desempenho

- [x] **Reduzir uso de CPU no renderer** - Otimizar re-renders desnecessários nos componentes React
- [x] **Otimizar engine de efeitos** - Avaliar se há cálculos redundantes em loops críticos
- [x] **Melhorar debouncing de salvamento** - Ajustar `WRITE_DEBOUNCE_MS` conforme necessidade
- [x] **Lazy loading de componentes** - Carregar painéis pesados sob demanda
- [x] **Verificar uso de GPU no preview** - Otimizar renderização do canvas de preview

---

## 2. Novas Funcionalidades

- [x] **Modo "Ao iniciar" por perfil** - Escolher perfil padrão ao abrir app

- [x] **Sincronizar com sistema de bandeja** - Melhorar integração com tray (ícone dinâmico, menu contextual)
- [x] **Notificações** - Avisos sobre conflitos com outros programas (Armoury Crate, OpenRGB)

---

## 3. Novos Efeitos

- [x] **Aurora Boreal** - Efeito tipo northern lights com camadas de cores
- [x] **Chuva de meteoros** - Cometas caindo aleatoriamente
- [x] **Matriz digital** - Estilo Matrix com caracteres caindo
- [x] **Fogos de artifício** - Explosões em posições aleatórias
- [x] **Ondas sonoras (simulado)** - Efeito reativo baseado em tempo
- [x] **Ciclo de estações** - Transição entre paletas ao longo do tempo
- [x] **Vórtice espiral** - Movimento em espiral ao redor
- [x] **Heartbeat/Pulsação cardíaca** - Pulso irregular mais orgânico

---

## 4. Bugs a Corrigir

- [x] **Preview não atualiza em alguns casos** - Verificar sincronização entre store e canvas
- [x] **Dropdown de perfis não atualiza após importar** - Já parcialmente corrigido, testar melhor
- [x] **window.prompt não funciona em alguns contextos** - Substituído por modais, verificar edge cases
- [x] **Conflito com Armoury Crate no Windows** - Melhorar detecção e instruções para usuário. **Corrigido:** watcher a cada 5 s, faixa de conflito na barra superior, entrada na lista de atenção da Visão geral e passo a passo em `documentation/windows.md`. Continua sem notificação do sistema operacional (ver 9.4).
- [x] **FPS fixo pode não ser ideal para todos os casos** - Avaliar se realmente necessário expor. **Resolvido por decisão:** o seletor foi removido e o motor usa `profile.global.fps` (padrão 30); quem precisa de outro valor edita o perfil. O FPS real do overlay é outra coisa e não interfere.
- [x] **Salvamento automático vs manual** - Clarificar comportamento atual

### Novos bugs encontrados na revisão de 26/10/2026

- [x] **Popover de configurações aparecia atrás do preview** - Corrigido: o `header` agora cria contexto de empilhamento (`relative z-30`), então o dropdown não fica mais sob os painéis.

**Críticos**

- [x] **Perfil é apagado quando o controlador não é encontrado** - Em `MyRgbApp.openDevice`, se o dispositivo não abrir, `zones` fica vazio e `reconcileProfile(profile, [])` remove todas as zonas do perfil e grava em disco. Acontece ao abrir sem o cabo/regra udev ou ao reconectar com o controlador desconectado; perde nomes de zonas, efeitos e contagem de LEDs. Não reconciliar quando não houver zonas de hardware. **Corrigido:** `reconcileProfile` preserva as zonas do perfil quando a lista de hardware está vazia.
- [x] **Motor continua com o perfil antigo depois de reconciliar** - `reconcile()` salva o perfil atualizado, mas `engine.setProfile()` não é chamado em `openDevice()`. Na primeira execução o motor fica com o perfil padrão sem zonas e renderiza tudo preto; zonas novas do hardware também ficam apagadas até qualquer alteração. **Corrigido:** `openDevice()` envia o perfil reconciliado ao motor antes de aplicar o dispositivo.
- [x] **"Abrir com as luzes apagadas" esconde a janela e não apaga as luzes** - `createWindow` usa `startWithLightingOff` no `ready-to-show` para não mostrar a janela, mas a opção nunca altera `outputEnabled` do motor. Com ela ligada o app abre só na bandeja e os LEDs continuam acesos. O comportamento documentado é abrir visível com o output desligado. **Corrigido:** a opção agora grava `outputEnabled = false` antes de abrir o dispositivo; só `--hidden` (autostart) esconde a janela.
- [x] **Quantidade de LEDs fracionária derruba o processo principal** - O campo numérico aceita `1.5`; isso chega ao motor e `new Array(ledCount)` lança `RangeError: Invalid array length` dentro do timer, derrubando o app. Validar como inteiro (0..máximo) no renderer e no store. **Corrigido:** renderer arredonda e limita ao máximo da zona; store normaliza em `setZoneConfig`/`reconcileProfile`; o motor tem uma última defesa.
- [x] **Renomear/salvar como não atualiza o último perfil usado** - `renameProfile` não atualiza `settings.lastProfile` (nem `startupProfile`, se apontar para o nome antigo). No próximo início o app procura o arquivo antigo, não encontra e cai no perfil padrão. **Corrigido:** renomear, duplicar, salvar com outro nome e importar atualizam `lastProfile` (e `startupProfile` quando aponta para o nome antigo).
- [x] **Nomes de perfil com acento não batem com o seletor** - `sanitize` grava `Padrão` como `Padr_o.json` e `list()` devolve o nome do arquivo; o perfil carregado mantém `Padrão`. O select fica com um valor que não existe nas opções, a checagem de nome duplicado falha e um rename pode sobrescrever outro perfil. Separar o identificador de arquivo do nome exibido (ou ler o `name` do JSON). **Corrigido:** `list()` lê o `name` do JSON e `load`/`delete`/rename resolvem tanto pelo nome exibido quanto pelo identificador de arquivo (`profileFileId`), com fallback para arquivos antigos.

**Médios**

- [x] **Importar perfil sobrescreve perfil existente sem confirmação e sem validar o conteúdo** - `profileImport` chama `duplicateProfile(parsed.name)` e `save(full)` sem validar `global`, `palettes`, `zones`, `ledCount` e efeitos. Nome existente perde o perfil anterior; arquivo inválido pode quebrar o motor. Validar e perguntar/gerar sufixo. **Corrigido:** `validateImportedProfile` valida/repara o JSON antes de qualquer escrita e o import recebe o primeiro nome livre (`Nome (2)`), sem sobrescrever nada.
- [x] **Renomear perfil pode sobrescrever outro sem aviso** - `ProfileStore.renameProfile` apaga o arquivo antigo e grava no novo sem verificar se ele já existe; o botão ✎ chama direto. **Corrigido:** o store recusa o rename quando o arquivo de destino existe; a interface pergunta antes de sobrescrever e mostra o erro no modal.
- [x] **Alternar luzes pela bandeja deixa a interface dessincronizada** - `onToggle` altera perfil e motor, mas não emite `profileGet`; o primeiro clique em "Luzes" na UI parece não fazer nada. O menu da bandeja também fica com o nome antigo após renomear/carregar perfil. **Corrigido:** o toggle da bandeja emite o perfil para o renderer e rename/load/import atualizam o menu da bandeja.
- [x] **Erros de hardware e desconexão não chegam ao usuário** - `pushError` envia `EngineState.error`, mas o renderer em `onEngineState` só lê `running`. Não há watcher de hotplug: se o cabo for removido, o motor para no primeiro erro, o preview congela e o status continua "conectado". **Corrigido:** o renderer mostra `EngineState.error`; um watcher de 3 s detecta desconexão/conexão, atualiza dispositivo e zonas na UI e restaura o perfil ao reconectar.
- [x] **Efeito "Bolhas" desenha bolhas de 1–2 LEDs** - Em `motion.ts`, `halfWidth` é calculado em fração da fita (`size * 0.5 / ledCount`), mas comparado com distância em LEDs (`x - pos`). Com `size=4` o teste encontrou no máximo 2 LEDs acesos; deveria usar `size * 0.5`. **Corrigido:** `halfWidth` agora está em LEDs, como a distância.
- [x] **Efeito "Respiração" usa parâmetro que não existe** - Lê `ctx.params.point`, mas `point` não está declarado na lista de parâmetros; a cor fica sempre na primeira parada do gradiente. Adicionar o slider ou remover a leitura. **Corrigido:** o efeito ganhou o slider "Ponto do gradiente" (padrão 0) e a documentação foi regenerada.

**Menores**

- [x] **Falha ao gravar perfil/settings pode derrubar o processo** - `writeFileSync` dentro do timer de debounce (`ProfileStore.writeNow` e `SettingsStore.write`) não tem tratamento; disco cheio ou falta de permissão gera exceção não capturada. **Corrigido:** as duas gravações capturam o erro, repetem o aviso só quando a mensagem muda e enviam um toast ao renderer por `app:error` (as falhas de startup ficam em fila até a janela abrir).
- [x] **`profileDelete` está inconsistente** - Reseta para um perfil sem zonas e não atualiza motor, UI nem `lastProfile`. Hoje não há botão na interface, mas o IPC existe. **Corrigido:** apagar o perfil atual passa para outro perfil salvo (ou mantém as zonas sob o nome "Padrão" se não sobrar nenhum), atualiza motor/bandeja/renderer, grava `lastProfile` e limpa `startupProfile` quando ele apontava para o perfil apagado.
- [x] **Campo de cor do gradiente aceita texto inválido** - Digitar um valor que não é hexadecimal quebra o CSS do gradiente (o motor usa magenta como fallback); validar/formatar no `onChange`. **Corrigido:** o campo usa um rascunho local, mostra borda de erro enquanto o texto é inválido e só grava no perfil valores válidos (`normalizeHexColor`, aceita `#abc`, `abc`, `#aabbcc`); ao sair ou apertar Enter com texto inválido, volta à última cor válida.

---

## 5. Melhorias na Interface

- [x] **Melhorar visualização de paletas** - Preview maior no seletor de gradiente
- [x] **Adicionar busca no seletor de efeitos** - Filtrar 34 efeitos por nome/categoria (não necessário)
- [x] **Tooltips mais informativos** - Expandir descrições em alguns lugares
- [x] **Melhorar responsividade** - Ajustar layout para diferentes resoluções
- [x] **Adicionar indicador de zona seguindo outra** - Melhorar UX quando em modo "seguir zona"
- [x] **Reorganizar painel de configurações** - Agrupar opções por categoria

---

## 6. Documentação

- [x] **Atualizar README com novas funcionalidades** - Exportar/Importar, salvar único botão, etc. **Feito em 29/10/2026:** README, `documentation/funcionalidades.md`, `desenvolvimento.md` e `jogos.md` refletem o dashboard, o cartão de refrigeração e os 295 testes. Falta apenas a especificação do formato de exportação (item seguinte).
- [~] **Adicionar guia de resolução de problemas (Troubleshooting)** - Comum em Linux/Windows. **Parcial:** `documentation/windows.md` cobre AURA/Armoury Crate, cintilação e dispositivo não encontrado. Falta o equivalente Linux (udev, AppImage, `brightness`/`asus_ec_sensors`, `hwmon`).
- [x] **Documentar formato de exportação de perfil** - `documentation/formato-exportacao-perfil.md` (pt) e `documentation/profile-export-format.md` (en): esquema completo do `.myrgb.json` (versão 1, sem envelope), regras de importação e paridade Linux/Windows.
- [~] **Traduzir documentação para inglês** - Iniciado: `documentation/en/README.md`, `how-it-works.md` e `windows.md` traduzidos. Falta: funcionalidades.md, efeitos.md, zonas-e-perfis.md, jogos.md, desenvolvimento.md, planejamento-iluminacao-externa.md.

---

## 7. Testes e Qualidade

- [~] **Aumentar cobertura de testes** - Adicionar testes para export/import. Já existem testes de `validateImportedProfile` (`tests/store.test.ts:165`), mas nenhum cobre o fluxo IPC com o diálogo, o `exportProfile` ou o import de um ficheiro real.
- [x] **Corrigir CI** - O workflow referencia `tests/color.test.ts`, `tests/effects.test.ts` e `tests/zone-apply.test.ts`, que não existem. O `npm run typecheck` já passa. **Corrigido:** o CI roda todos os ficheiros de teste existentes (exceto `conflict.test.ts`, instável em runner partilhado), mais `typecheck`, `build` e o job Windows com o helper .NET e o pacote `win-unpacked`.
- [~] **Testes E2E com Playwright** - **Pulado por decisão do utilizador (06/11/2026).** Continua sem setup: `playwright` não está em `devDependencies`, não há `playwright.config.ts` nem `tests/e2e/`. O `--selftest` embutido no Electron continua a validar o caminho main → IPC → renderer → DOM.
- [x] **Testar paridade Linux/Windows** - Validar mesmo comportamento. **Concluído:** `tests/parity.test.ts` renderiza 60 quadros pelo mesmo caminho do `--dump-frames --dump-offline` (layout sintético fixo, sem hardware) e compara os hashes com `tests/fixtures/parity-frames.json`. O CI roda o teste nos jobs Linux e Windows; `tools/compare-frames.mjs` agora também compara o `manifest.json` e é exercitado pelo teste (dump igual passa, byte alterado falha). Regeneração: `npm run parity:golden`.
- [ ] **Testar com diferentes configurações de hardware** - Validar com outras placas ASUS. Todo o desenvolvimento é validado num único controlador `0x0B05:0x19AF`.
- [~] **Verificar build para Windows (.exe/.msi)** - **Parcial (12/11/2026):** a primeira release `v0.3.0` foi publicada pelo `release.yml` (NSIS + helper .NET + `latest.yml` + checksums + proveniência); o instalador de uma build local anterior já foi executado numa máquina Windows. Falta assinatura e uma instalação/execução automática do instalador publicado numa VM limpa.

---

## 8. Infraestrutura

- [x] **CI/CD** - GitHub Actions para build/test
- [x] **Versionamento semântico** - Adotar semver corretamente
- [x] **Auto-update** - Implementar electron-updater. Configurado contra GitHub Releases (`publish` no `electron-builder.yml`), UI nas Configurações com verificar/baixar/instalar e reiniciar. `updater.ts` gerencia estado, eventos e push via IPC para o renderer.
- [ ] **Logs estruturados** - Melhorar sistema de logs para debug. Hoje são ~15 `console.*` no main, sem ficheiro, sem nível e sem timestamp; um problema em campo não deixa rasto.
- [ ] **Crash reporting** - Adicionar report de crashes (opcional). `crashReporter` não é inicializado em lado nenhum.
- [ ] **Assinatura de código no Windows** - O instalador NSIS sai sem assinatura, então o SmartScreen mostra "Windows protegeu o seu PC". Caminho escolhido (12/11/2026): **SignPath Foundation** (gratuito para OSS); alternativa Azure Trusted Signing. Passos em `documentation/release.md`.
- [x] **Corrigir o `.deb` no Debian/Ubuntu** - **Concluído na 0.3.1 (13/11/2026):** a 0.3.0 instalava o `chrome-sandbox` em `0755` e o Electron abortava no arranque ("The SUID sandbox helper binary was found, but is not configured correctly"). O `afterInstall` próprio substituía o template do electron-builder e não repetia o `chmod 4755`; o script voltou a criar o link `/usr/bin/my-rgb` e a instalar o perfil AppArmor. Para a 0.3.0 já instalada: `sudo chmod 4755 /opt/MyRGB/chrome-sandbox`. Detalhes em `documentation/desenvolvimento.md` (seção **O pacote .deb**).
- [ ] **Ignorar artefactos de teste** - `.vitest/` (cache do reporter JSON) não está no `.gitignore` e aparece como untracked.

---

## 9. Revisão de 29/10/2026

> Auditoria feita na branch `feat/fps-estimates` (`ff59f9a`), depois dos Jogos e do cartão de Refrigeração. Estado verificado: `npm run typecheck` limpo, **295 testes em 17 ficheiros**, `npm run build` ok e `--selftest` **PASS** (`sensorsReady`, `gamesReady`, `cardsAligned`).
>
> "Confirmado" significa que o caminho foi lido no código indicado; nem todos os itens foram reproduzidos em execução. Nada aqui foi inferido de memória: quando um item depende de hardware que esta máquina não tem, está dito.

### 9.1 O que já foi corrigido ou esclarecido

- **CI** — o workflow já não referencia ficheiros de teste inexistentes; roda 16 dos 17 ficheiros (só `conflict.test.ts` fica de fora, por ser instável em runner partilhado), mais `typecheck`, `build` e o job Windows.
- **README e documentação** — atualizados para o dashboard, os Jogos e a Refrigeração; contagem de testes corrigida para 295.
- **Conflito com Armoury Crate** — deteção contínua (5 s), faixa na barra, entrada na Visão geral e guia em `documentation/windows.md`.
- **FPS fixo** — o seletor foi removido por decisão; o motor usa `profile.global.fps`.
- **Refrigeração (Fase A)** — cartão com bomba/ventoinhas, mín/máx, sparkline, alarmes e notas acionáveis; papel de bomba só quando o driver rotula o canal.

### 9.2 Bugs confirmados

#### Críticos

1. [x] **Trocar de perfil descarta alterações não salvas, sem aviso** — `TopBar.tsx:62-65` e `:209` chamam `loadProfile` direto; `store.ts:262-265` não olha `dirty`; `profileStore.ts:388-401` substitui `current` e agenda a escrita no ficheiro **novo**, cancelando o timer do antigo. Mexer no brilho → trocar de perfil → voltar: a alteração desapareceu. O mesmo `loadProfile` não limpa `dirty`, então a Visão geral (`Overview.tsx:249-257`) passa a acusar "alterações não salvas" num perfil recém-carregado. **Corrigido (02/11/2026):** `load()` faz `flush()` do perfil que está a ser deixado antes de trocar (quando há escrita pendente ou já gravada), e o renderer limpa `dirty` ao carregar e ao importar. Teste: "flushes pending edits before switching to another profile".

2. [x] **Loop infinito de S.M.A.R.T. quando a leitura falha** — `Disks.tsx:366-369` depende de `[tab, health, loadingHealth, loadHealth]`; no erro, `health` continua `null` e `loadingHealth` volta a `false`, reexecutando o efeito imediatamente. Resultado: um IPC + `smartctl` por ciclo, sem limite, e a aba Saúde nunca sai do erro. **Corrigido (02/11/2026):** o efeito ganhou a guarda `!healthError` e o `loadHealth` limpa o erro ao iniciar; a repetição passa a ser só pelo botão "Tentar de novo".

3. [x] **`renameProfile` apaga o ficheiro antigo antes de gravar o novo** — `profileStore.ts:626-641` faz `unlinkSync(oldPath)` e só depois `save()`, que agenda a escrita para `WRITE_DEBOUNCE_MS` (150 ms) mais tarde. Se a escrita falhar (disco cheio, home só-leitura) ou o processo morrer nesse intervalo, o perfil desaparece do disco sem rollback. **Corrigido (02/11/2026):** o ficheiro novo é escrito de forma síncrona antes de remover o antigo; numa falha, o antigo fica intacto e o erro chega à UI. Teste: rename com acentos continua a deixar um único ficheiro.

4. [x] **Dois nomes diferentes caem no mesmo ficheiro e um apaga o outro** — `profileFileId` (`profileStore.ts:51-53`) usa `sanitize` (`:719-721`), que troca tudo fora de `[a-zA-Z0-9 _-]` por `_`. `"Setup:2024"` e `"Setup*2024"` viram ambos `Setup_2024.json`; `availableName` (`:604-615`) compara só nomes visíveis, então o segundo é gravado por cima sem o prompt que a UI promete. **Corrigido (02/11/2026):** `resolvePath` procura primeiro pelo `name` do JSON e `pathFor` acrescenta um hash FNV-1a estável quando o nome desinfetado já pertence a outro perfil. Nomes antigos (`Padr_o`) continuam a resolver. Teste: "keeps two names that sanitise to the same file apart".

#### Médios

5. [x] **`SensorsStore.stop()` não tem posse por assinante** — `sensors/store.ts:110-122` decrementa um contador global; pausar em Sensores (`Sensors.tsx:219-229`) e sair da página (cleanup em `:185-189`) chama `stop` duas vezes. Com o overlay ou uma sessão do Gargalo a segurar uma referência, o poll do outro é morto e nada o reinicia. **Corrigido (02/11/2026):** a página guarda em `pausedRef` se já libertou a sua referência e o cleanup só chama `stopSensors()` quando não pausou; o Gargalo passou a pedir uma referência por assinante (ver item 6).

6. [x] **Sessão do Gargalo pode deixar uma referência órfã no poll** — `bottleneck/index.ts:107-121` e `:225-230`: página (+1) → sessão (+1) → sair da página (não liberta, porque há sessão) → fim da sessão (−1) deixa `subscribers = 1`. O `hwmon` + `nvidia-smi` continuam a correr a cada segundo com todas as páginas fechadas, e cada repetição acumula mais uma. **Corrigido (02/11/2026):** `BottleneckService.start/stop` pedem e libertam a referência do `SensorsStore` uma a uma; a sessão tem a sua própria referência (`sessionHold`) e a página liberta a dela ao sair. Testes: "counts one poll reference per start and releases each on stop" e "keeps the poll alive while a session runs, even if the page leaves".

7. [x] **Reconectar o cabo não religa o motor** — depois de uma desconexão, `index.ts:296-315` reabre o dispositivo e reaplica o perfil (`openDevice`, `:185-208`), mas nunca chama `engine.start()`; `syncOutput` só repinta preto se o output estiver desligado. As luzes ficam congeladas no último frame até o utilizador premir "Iniciar", e `openDevice` limpa `lastEngineError` (`:192`), apagando a explicação. **Corrigido (02/11/2026):** `engineWanted` guarda a intenção do utilizador; `openDevice()` religa o motor quando o dispositivo volta (sem desfazer um "Parar" explícito), e a desconexão já não limpa o último erro do motor.

8. [x] **Bootstrap sem `.catch`** — `index.ts:1172-1205` faz `void app.whenReady().then(async () => … await instance.start())`. Qualquer exceção em `start()` (registar IPC, abrir o dataset dos Jogos, criar o tray num ambiente sem appindicator) deixa o processo vivo, sem janela, sem tray e sem diálogo. **Corrigido (02/11/2026):** a cadeia ganhou `.catch` que escreve o erro no terminal, mostra um diálogo com a mensagem e a pasta de dados, e termina o processo com código 1.

9. [x] **Importar perfil sem `try/catch` nem limite** — `ipc/register.ts:194-220` lê o ficheiro com `readFileSync` e faz `JSON.parse` dentro do handler. Ficheiro errado devolve a mensagem crua do Electron ("Error invoking remote method…"), e um ficheiro enorme bloqueia o processo principal. `validateImportedProfile` já tem mensagens em português; elas nunca chegam ao utilizador. **Corrigido (02/11/2026):** o handler limita o ficheiro a 2 MB, trata JSON inválido e devolve uma mensagem em português; o renderer mostra essa mensagem sem o prefixo do Electron.

10. [x] **FPS do Windows pode ficar morto até reiniciar** — `HelperBridge.dispose()` (`helper.ts:274-289`) destrói o socket e limpa `pending` sem rejeitar as promessas; o `await request('fps.poll')` em `fps.ts:199-220` nunca assenta, `polling` fica `true` e nenhuma amostra volta. Acontece ao fechar o overlay ou cancelar uma sessão com um pedido em voo (janela de até 5 s, a cada 500 ms). **Corrigido (02/11/2026):** `dispose()`/`teardown()` rejeitam todos os pedidos pendentes com "O helper foi encerrado." e abortam a espera de ligação, então o `poll` sai sempre e `polling` volta a `false`.

11. [x] **`powershell.exe` sem timeout e "Tentar novamente" a correr com `starting = true`** — `helper.ts:103-114` lança o PowerShell sem `timeout`; se o UAC ficar preso, `bridge.start()` nunca retorna e `FpsService.begin()` fica preso (`fps.ts:149`). `retry()` (`fps.ts:107-115`) destrói a ponte e chama `begin()`, que sai logo porque `starting` ainda é `true`, enquanto o `begin()` antigo continua e publica um erro de ligação. **Corrigido (02/11/2026):** o `execFile` tem `timeout` de 45 s (com mensagem própria quando é o UAC que não responde) e o `FpsService` usa um contador de tentativas: `retry()` invalida a tentativa em curso, começa outra de imediato e a antiga já não altera o estado. Teste: "retries while the previous start is still waiting for UAC".

12. [x] **Servidor do pipe perde o listener de `error`** — `helper.ts:194-207` remove o handler assim que `listen` conclui. Um erro posterior do `net.Server` (pipe removido/substituído) emite `error` sem listener, o que no Node é `uncaughtException` no processo principal. **Corrigido (02/11/2026):** depois do `listen` fica um handler permanente que chama `fail()` e `teardown()`, rejeitando os pedidos em vez de derrubar o processo.

13. [x] **`si.fsSize()` sem `.catch()` derruba a página de Unidades** — `features/system/drives.ts:190-194`: as outras duas chamadas (blocos e layout) têm fallback; esta não. Qualquer rejeição (WMI lento no Windows, `df` ausente) faz `drives:list` inteiro rejeitar e a página fica sem dados, em vez de "—" + nota. **Corrigido (02/11/2026):** a leitura dos volumes tem `catch` e devolve uma mensagem em português com contexto; a página mostra o cartão de erro e o botão "Tentar de novo" em vez de um *reject* cru.

14. [x] **`pkexec`/`smartctl` 126/127 reportado como "cancelado pelo utilizador"** — `health/smartctl.ts:223` e `:299` tratam 126 e 127 como cancelamento. Num sistema sem `smartctl` instalado, ou com polkit sem agente, a página diz sempre "cancelado", volta a marcar `needsElevation` e oferece o botão outra vez — um ciclo enganoso. **Corrigido (02/11/2026):** só o código 126 (diálogo dispensado) conta como cancelamento; 127 vira "autorização recusada ou polkit sem agente", `ENOENT` diz que falta o `pkexec`, e uma leitura sem qualquer dispositivo avisa que o `smartmontools` pode não estar instalado.

15. [x] **`onTrayCommand` ligado ao canal errado** — `preload/index.ts:157` assina `IPC.engineState` para um `callback: (command: string) => void`; não existe emissor de comandos da bandeja no main. A função promete algo que, se usada, entrega `EngineState` como se fosse `string` e duplica `onEngineState`. **Corrigido (02/11/2026):** a API morta foi removida de `shared/api.ts` e do preload; a bandeja já usa os handlers diretos (mostrar, iniciar/parar, sair).

16. [x] **`init()` sem guarda nem cleanup, e tudo-ou-nada** — `store.ts:127-207` regista seis listeners sem `initialized` nem unsubscribe; com `StrictMode` (`main.tsx:7`) ficam duplicados — dois repaints por frame e `__myRgbFrameCount` a dobrar em dev. Além disso, os seis `invoke` estão num único `Promise.all` antes de qualquer listener: se um falhar, o banner aparece mas `onFrame`/`onEngineState`/`onDeviceChange` nunca são assinados, e "Reconectar" (`store.ts:304-317`) não os assina. **Corrigido (02/11/2026):** `init()` tem guarda `initialized` e regista os listeners (com os `unsubscribe` guardados) antes das leituras, portanto uma falha de um `invoke` já não deixa a UI surda. Como as subscrições passam a existir sempre, o "Reconectar" também as tem.

17. [x] **Seletor de monitor mostra um monitor diferente do que está em uso** — `Overlay.tsx:271-282` usa `value={config.displayId}` com o padrão `0` (`shared/features/overlay.ts:128-141`), mas as opções só têm ids reais. O browser mostra a primeira opção, que pode não ser a primária; escolhê-la de novo não dispara `onChange`. O main resolve `0` como primário (`manager.ts:328-336`), então a posição está certa e o rótulo mente. **Corrigido (02/11/2026):** o select tem uma opção explícita `0` ("Primário") e mapeia um id desconhecido para `0`, o mesmo fallback do main.

18. [x] **Busca de GPU em Jogos repõe resultados antigos** — `Games.tsx:128-155`: o ramo `trimmed.length < 2` limpa `results` mas não incrementa `seq.current`; uma resposta em voo passa no teste e volta a preencher a lista debaixo do campo vazio. **Corrigido (02/11/2026):** o ramo invalida a pesquisa em curso (`seq.current++`) antes de limpar.

19. [x] **Contador de LEDs grava e trunca a cada tecla** — `ZoneRail.tsx:197-215` faz `round`/clamp no `onChange`. Digitar "12" grava 1 e depois 12 (a fita pisca com 1 LED), apagar o campo vira `0`, e um valor acima do máximo é cortado no meio da digitação. Falta estado local/debounce como o campo de cor do gradiente já tem. **Corrigido (02/11/2026):** o campo tem um rascunho local e só grava no `blur`/Enter; Escape descarta. Campo vazio mantém o valor guardado e o clamp a `maxLedCount` acontece uma vez, na confirmação.

20. [x] **Captura do atalho do overlay engole Tab** — `Overlay.tsx:235-247` faz `preventDefault()` antes de validar a tecla; `Tab`/`Shift+Tab` não geram acelerador, mas o foco fica preso no botão até `Escape`. **Corrigido (02/11/2026):** só as teclas que produzem um acelerador (e o Escape) são consumidas; Tab e as setas voltam a navegar.

21. [x] **Modais de Salvar/Renomear sem diálogo nem foco** — `TopBar.tsx:324-385`: sem `role="dialog"`/`aria-modal`, sem armadilha de foco (o `Tab` vai para os controlos por baixo do `fixed inset-0`) e sem devolver o foco ao botão que abriu. **Corrigido (02/11/2026):** novo `components/ui/Modal.tsx` com `role="dialog"`, `aria-modal`, `aria-labelledby`, foco inicial, ciclo de Tab, Escape, clique no fundo e devolução do foco. Os dois prompts e a confirmação de sobrescritura usam-no.

22. [x] **Carregar um perfil pode duplicá-lo no disco** — `profileStore.ts:388-401`: se o ficheiro tiver nome diferente do `name` interno (perfil copiado à mão), `load()` chama `writeCurrent()` para `pathFor(name)` e passa a existir duas vezes; `list()` mostra o nome duplicado e apagar um deixa o outro. **Corrigido (02/11/2026):** `load()` já não grava; guarda o caminho em `writtenPath` e as gravações seguintes continuam no mesmo ficheiro. Teste: "does not duplicate a profile whose file was renamed by hand".

23. [x] **`pingAvailable()` em cache para toda a vida do processo** — `network/ping.ts:33-43`; a própria página (`network/index.ts:167-172`) aconselha instalar `iputils-ping`, mas depois de instalado o app continua a dizer que o comando não existe até reiniciar. **Corrigido (02/11/2026):** só o resultado positivo fica em cache; uma ausência é verificada outra vez na chamada seguinte, então instalar o `ping` resolve sem reiniciar.

24. [x] **`getSystem()` sem dedupe de execução em curso** — `system/info.ts:269-283` não tem `in-flight`. Abrir Sistema/Jogos ou premir "Atualizar" pode disparar duas recolhas completas em paralelo (9 chamadas `systeminformation`, incluindo `dmidecode`/WMI); a última a terminar vence a cache, mesmo que não seja a mais recente. **Corrigido (02/11/2026):** `getSystem()` guarda a promessa em `inFlight`; chamadas concorrentes (com ou sem `force`) partilham a mesma recolha e a cache só é escrita por ela.

25. [x] **O overlay oferece métricas que nunca têm fonte** — `frame.ts:145-149` devolve `—` para `gpu_volt` e `gpu_perfcap`, mas `shared/features/overlay.ts:69-71` oferece "Tensão do núcleo" e "Limitador (NVIDIA)" como itens selecionáveis. O `nvidia-smi` usado não expõe nenhum dos dois (a voltagem até pode vir do `amdgpu` no Linux, o limitador não). **Corrigido (02/11/2026):** as duas opções saíram do catálogo (24 métricas), do formatador e dos testes; as configurações guardadas são normalizadas para descartar chaves desconhecidas. Documentação atualizada.

26. [x] **Alarmes de refrigeração não chegam à Visão geral** — `buildCooling` (`sensors/cooling.ts`) produz `alarms`, mas a lista de atenção (`Overview.tsx:205-360`) só olha limitador, discos, rede e conflito. Uma bomba parada só é vista se o utilizador abrir Sensores. **Corrigido (02/11/2026):** a Visão geral ouve `onSensors` (sem iniciar um segundo poll — o `startBottleneck` já o faz) e cada alarme entra na lista de atenção como item de alerta, com ligação para Sensores.

27. [x] **Relatório do Gargalo é apagado antes de saber se a nova sessão começou** — `Bottleneck.tsx:536-563` faz `setReport(null)` antes do `await`; se `startBottleneckSession` falhar, ou se o utilizador cancelar a sessão nova, o resultado anterior (que não é gravado em disco, por desenho) desaparece. **Corrigido (02/11/2026):** o relatório anterior é guardado em `reportBeforeSession` e `setReport(null)` só corre depois de a sessão começar; cancelar restaura-o.

28. [x] **Sair da Rede a meio do teste e voltar esconde que ele continua** — `Network.tsx:273-344`: ao remontar, `running`/`progress` voltam a `false`/`null`, mas o diagnóstico continua no main (`network/index.ts:352-355`) a saturar a ligação. A página mostra o cartão de introdução como se nada estivesse a correr. **Corrigido (02/11/2026):** o main expõe `net:status` (`networkStatus()`, com o último passo guardado) e `net:join`, que espera pela execução em curso sem iniciar outra; a página, ao montar, volta a ligar-se a ela e mostra o progresso e o resultado.

29. [x] **Popover de configurações não fecha ao clicar fora nem ao mudar de página** — `TopBar.tsx:255-322` não tem listener de clique exterior nem reset em `setPage`; fica aberto por cima de qualquer página. **Corrigido (02/11/2026):** um `pointerdown` fora do popover e o `Escape` fecham-no, e mudar de página também; o botão passou a ter `aria-expanded`/`aria-haspopup` e o painel `role="dialog"`.

30. [x] **Sliders sem debounce e com o valor a voltar do IPC** — `LightingControls.tsx:23-50`, `ParamSliders.tsx:127-135`, `GradientEditor.tsx:301-309`: cada `input` envia o perfil inteiro e o `value` só muda quando a resposta volta, então o polegar fica atrás do cursor num arrasto rápido. Em `GradientEditor.tsx:85-93` o `commit` (IPC) corre dentro do updater de estado — em StrictMode grava duas vezes por soltar do rato. **Corrigido (02/11/2026):** novo `useDebouncedNumber` mantém o valor em rascunho local (o polegar segue o ponteiro) e grava 120 ms depois da última alteração; os três sliders usam-no. O arrasto das paradas lê a posição de um `ref`, fora do updater, e grava uma vez ao soltar.

#### Menores

31. [x] **Preview promete um clique que não existe** — `StripPreview.tsx:207` diz "Clique em qualquer faixa para selecioná-la", mas o `<canvas>` (`:213-215`) não tem `onClick`/`onPointerDown`. **Corrigido (02/11/2026):** o `paint` guarda a posição de cada faixa e o `canvas` converte o clique (etiqueta ou faixa) em `selectZone`, com cursor de ponteiro e `title`.
32. [x] **Acessibilidade** — linhas da tabela de Jogos só com rato (`Games.tsx:596-614`); sliders de parâmetros sem `<label>`/`aria-label` (`ParamSliders.tsx:117-135`); toasts sem `role="status"`/`aria-live` (`Toast.tsx:41-51`). **Corrigido (02/11/2026):** o nome do jogo é um botão com `aria-expanded`/`aria-label` (o clique na linha passou a ser só uma área maior para o rato), os três sliders têm `aria-label` (Brilho/Velocidade já estavam dentro de `<label>`) e o host de toasts é `role="status" aria-live="polite"`.
33. [x] **`window.confirm` para sobrescrever perfil** — `TopBar.tsx:89` e `:120`, justamente no fluxo que decide se um ficheiro é substituído; contraria o padrão de modal/toast do resto da app. **Corrigido (02/11/2026):** a confirmação passou a um `Modal` com o nome do perfil e as opções Cancelar/Sobrescrever; cancelar devolve ao prompt anterior.
34. [x] **Selects caem no primeiro item quando o id guardado não existe** — `GradientEditor.tsx:30-32` e `:181-191` (paleta); `ZoneRail.tsx:241-267` (zona seguida). O select mostra uma opção que não corresponde ao que o motor usa. **Corrigido (02/11/2026):** quando o efeito aponta para uma paleta que já não existe, o editor grava a paleta de fallback no efeito (a mesma que o motor já usava), uma vez só; a zona seguida mostra "— efeito próprio —" se a zona de origem desapareceu, que é o que o motor faz, sem apagar o vínculo (ele volta se o controlador for reconectado).
35. [x] **"Reconectar" sem estado nem erro** — `store.ts:304-317` não tem `try/catch` nem progresso; se o IPC falhar, o clique não produz nada. **Corrigido (02/11/2026):** `reconnect()` tem `reconnecting` (botão desativado e com "Reconectando…"), ignora cliques repetidos, tem `try/catch` que mostra a mensagem no banner e limpa o estado no `finally`.
36. [x] **Sensores: Pausar/Retomar sem `catch`** — `Sensors.tsx:219-229` deixa rejeições sem aviso e o rótulo muda como se tivesse funcionado. **Corrigido (02/11/2026):** as duas chamadas têm `catch`; se retomar falhar, a página volta ao estado pausado e mostra o erro em vez de exibir "ao vivo" sobre valores parados.
37. [x] **`lastFrameSeq` é sempre `-1`** — `index.ts:461` e `shared/api.ts:44`; o engine tem o seu próprio `seq` (`engine.ts:148`), então qualquer consumidor deste campo vê um valor morto. **Corrigido (02/11/2026):** `pushFrame` guarda `frame.seq` em `lastFrameSeq` e `engineState` devolve esse valor em vez do `-1` fixo.
38. [x] **Comentários "fase 7" desatualizados** — `sensors/index.ts:10`, `bottleneck/session.ts:102` e `shared/features/bottleneck.ts:66` ainda dizem que o FPS "chega na fase 7"; o overlay já existe e o FPS do Windows já é entregue. **Corrigido (02/11/2026):** os comentários dizem o estado real (FPS do overlay, ausente no Linux/sem helper; no Windows não há sensores de placa-mãe porque o helper mede FPS). Também atualizados `health/windows.ts`, `shared/features/bottleneck.ts:136`, a documentação e a metadata da página Overlay (que já não é placeholder).
39. [x] **`FrameMonitor` nunca limpa PIDs** — `helper/MyRgb.Helper/FrameMonitor.cs:37-38` e `:84-92`: `_presents`/`_lastSeen` ganham uma entrada por cada processo que apresenta frames e nunca removem PIDs mortos. **Corrigido (02/11/2026):** a cada 5 s (relógio do ETW) `PruneDead` remove as entradas cuja fila ficou vazia ou só tem amostras mais velhas que a janela de 10 s; `GetStats` passou a usar `TryGetValue` para não falhar se a entrada desaparecer. Não compilado aqui (o helper exige o SDK .NET no Windows).
40. [x] **AGENTS.md tem o caminho da regra udev errado** — diz `build/linux/udev/99-myrgb.rules`; o ficheiro real é `packaging/linux/udev/60-my-rgb.rules`. (Está untracked, mas é o guia que os agentes leem.) **Corrigido (02/11/2026):** o caminho em `AGENTS.md` (e em `APRESENTACAO.md`, que tinha o mesmo erro) passou a ser o real.

### 9.3 Implementações inacabadas e funcionalidades em falta

| Área | Estado real | O que falta |
|---|---|---|
| **Integrações** — *futuro* | `Integrations.tsx` renderiza `PagePlaceholder`; só existe o backend `aura` em `light/backends/`; nenhum canal `light:*` no IPC | OpenRGB/Razer/Corsair, página, IPC e `LightTarget` de outros backends. O roteador já está pronto para receber |
| **Sensores no Windows** — *futuro* | `sensors/index.ts:95` assume a limitação e mostra nota; o helper é **só FPS** | Temperaturas, ventoinhas e bomba da placa-mãe. Caminho previsto: `LibreHardwareMonitorLib` (MPL-2.0) no helper .NET, empurrado pelo pipe que já existe |
| **FPS no Linux** — *futuro* | `fps.ts:85-86` devolve `supported: false` com nota para MangoHud/gamescope | Ou integrar MangoHud (arquivo/pipe) ou assumir que fica indisponível — hoje é uma nota, não uma funcionalidade |
| **RPM de AIO por USB** — *futuro* | Sem `hwmon` sem driver do fabricante; nenhum `liquidctl` embarcado | Corsair iCUE, muitos Lian Li/Deepcool com LCD. Decisão anterior: não fazer agora |
| **Tensão/limitador no overlay** | **Resolvido (02/11/2026, item 25)** — as duas opções saíram da lista (24 métricas) e configurações antigas são normalizadas | Só a tensão voltaria com NVML nativo; o limitador não tem fonte no `nvidia-smi` usado |
| **Controle de ventoinhas** — *futuro* | Somente leitura, por decisão | Escrever PWM exigiria root/admin e pode parar uma bomba por engano; **não fazer** |
| **Auto-update** — concluído | `electron-updater` contra GitHub Releases, `publish` no `electron-builder.yml`, UI nas Configurações | UI com verificar/baixar/instalar e reiniciar |
| **Logs/crash** | **Implementado (03/11/2026):** `src/main/logging/` espelha o `console.*` em `<userData>/logs/my-rgb.log` (rotação em 2 MB, três arquivos antigos), com nível em `src/shared/logging.ts` (⚙ Configurações → Diagnóstico, ou `MYRGB_LOG_LEVEL`); conexão/desconexão do controlador, início/paragem do motor, FPS/helper, `child-process-gone` e `uncaughtException` ficam registados. `crashReporter` sempre local (`uploadToServer: false`, dumps em `logs/crash/`), desligável com `MYRGB_CRASH_REPORTER=0`. Coberto por `tests/logging.test.ts` (19 testes) e pelo `--selftest` (`logReady`, `logsUi`) | Enviar relatórios automaticamente — não fazer: não existe servidor, e o relatório fica na máquina até o utilizador o anexar |
| **Internacionalização** — *futuro* | Interface e documentação só em português | Textos em inglês; hoje até `localeCompare` está fixo em `pt-BR` |
| **Hardware suportado** | Apenas `0x0B05:0x19AF` | Nenhuma outra placa, RAM ou cooler. É escopo, não bug — mas deve continuar explícito na UI |

> **Marcadas como futuro (04/11/2026):** as sete linhas com *futuro* ficam registadas como trabalho planeado — sem data e sem ordem fechada, porque nenhuma bloqueia o uso atual. O que já tinha decisão contrária (**RPM de AIO por USB**, **Controle de ventoinhas**) continua com essa decisão: está na lista como possibilidade a reavaliar, não como compromisso. **Hardware suportado** não é trabalho futuro: é o limite atual do projeto, e deve continuar explícito na interface.

### 9.4 Windows — o que funciona e o que falta

**Funciona:** controlo AURA com deteção contínua de conflito, autostart (`setLoginItemSettings`), bandeja, S.M.A.R.T. por CIM (`health/windows.ts`), GPU por `nvidia-smi`, FPS por ETW no helper, **sensores de placa-mãe** por `LibreHardwareMonitorLib`, overlay sempre no topo e **release automática** (`release.yml`: NSIS + helper + `latest.yml`, com checksums e proveniência; a `v0.3.0` foi publicada em 12/11/2026).

**Falta ou está frágil:**

- **UAC em cada sessão** — melhorado (06/11/2026): FPS e sensores compartilham um único helper elevado (`getSharedHelper` em `overlay/helper.ts`), então abrir o overlay e depois a página Sensores não pede elevação duas vezes. Ainda há um prompt quando o helper já foi fechado por ociosidade (20 s sem sensores e sem sessão de FPS) ou depois de uma falha; eliminar de vez exigiria manter o processo elevado vivo ou instalar um serviço/tarefa agendada.
- **Instalador sem assinatura** — SmartScreen bloqueia. O NSIS já é construído e verificado no CI, mas continua sem assinatura; caminho escolhido: SignPath Foundation (ver `documentation/release.md`).
- **Sem `smartctl`** — a saúde no Windows vem do CIM (`MSFT_PhysicalDisk`, `MSStorageDriver_FailurePredictStatus`), que não dá os atributos S.M.A.R.T. brutos que a página mostra no Linux; o veredito é equivalente, o detalhe não.
- **Só x64** — `electron-builder.yml` declara `arch: [x64]`; não há pacote ARM64.
- **Validar os sensores em hardware real** — o código e o ciclo de vida da bridge estão cobertos por testes, mas falta abrir a página Sensores numa máquina Windows e confirmar os valores e o UAC único.

**Resolvido:** FPS pode morrer até reiniciar (03/11/2026, itens 10-12), logs de campo (03/11/2026, `<userData>/logs/my-rgb.log` com rotação e crash local) e **canal de release** (12/11/2026: `.github/workflows/release.yml` publica Windows + Linux a partir de uma tag `vX.Y.Z` na `main`, com checksums e proveniência; detalhes em `documentation/release.md`).

### 9.5 Prioridades sugeridas

1. **Perda de dados de perfil** (itens 1, 3 e 4) — é o único grupo que faz o utilizador perder trabalho; corrigir antes de qualquer funcionalidade nova.
2. **Loop de S.M.A.R.T.** (item 2) — um erro de permissão transforma a página num gerador de carga.
3. **Posse do poll de sensores** (itens 5 e 6) — corrige o Pausar e impede `hwmon`/`nvidia-smi` a correr para sempre.
4. **Windows: FPS e reconexão** (itens 7, 10 e 11) — são as duas falhas que mais parecem "o app quebrou".
5. **Robustez de arranque e importação** (itens 8 e 9) — barato e evita um app sem janela ou uma mensagem em inglês.
6. **Lote de UI** (itens 17-22, 27-30) — pequenos, mas todos visíveis no uso diário.
7. **Integrações de iluminação externa** — único bloco grande que falta; está pausado e será removido se não for retomado.

### 9.6 Limites que continuam válidos (não são bugs)

- **RPM não prova refrigeração**: o sinal útil é a correlação bomba + temperatura; por isso o cartão mostra as duas coisas e o veredito é textual.
- **Nenhum valor é inventado**: campo ausente vira `—`; um canal de ventoinha sem rótulo continua "Ventoinha N"; um AIO por USB não ganha RPM que o sistema não expõe.
- **Jogos**: só 1080p/Alto tem medição real; 1440p, 4K e os outros presets são estimativa derivada, e a página diz qual é qual.
- **Escopo de hardware**: `0x0B05:0x19AF` apenas.

---

## Notas

- **Foco atual**: Estabilizar funcionalidades existentes antes de adicionar muitas novas
- **Prioridade**: Bugs críticos > Desempenho > Novas funcionalidades > Melhorias cosméticas
- **Compatibilidade**: Manter suporte apenas para ASUS AURA USB (`0x0B05:0x19AF`)
- **Branch**: Trabalhar sempre em `dev`, merge para `main` apenas sob solicitação explícita

_Última atualização: 29 de Outubro de 2026_
