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
- [ ] **Conflito com Armoury Crate no Windows** - Melhorar detecção e instruções para usuário
- [ ] **FPS fixo pode não ser ideal para todos os casos** - Avaliar se realmente necessário expor
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

- [ ] **Atualizar README com novas funcionalidades** - Exportar/Importar, salvar único botão, etc.
- [ ] **Adicionar guia de resolução de problemas (Troubleshooting)** - Comum em Linux/Windows
- [ ] **Documentar formato de exportação de perfil** - Especificação do `.myrgb.json`
- [ ] **Traduzir documentação para inglês** - Para maior alcance

---

## 7. Testes e Qualidade

- [ ] **Aumentar cobertura de testes** - Adicionar testes para export/import
- [ ] **Corrigir CI** - O workflow referencia `tests/color.test.ts`, `tests/effects.test.ts` e `tests/zone-apply.test.ts`, que não existem. O `npm run typecheck` já passa.
- [ ] **Testes E2E com Playwright** - Já tem setup, expandir cobertura
- [ ] **Testar paridade Linux/Windows** - Validar mesmo comportamento
- [ ] **Testar com diferentes configurações de hardware** - Validar com outras placas ASUS
- [ ] **Verificar build para Windows (.exe/.msi)** - Testar instalador NSIS

---

## 8. Infraestrutura

- [x] **CI/CD** - GitHub Actions para build/test
- [x] **Versionamento semântico** - Adotar semver corretamente
- [x] **Auto-update** - Implementar electron-updater
- [ ] **Logs estruturados** - Melhorar sistema de logs para debug
- [ ] **Crash reporting** - Adicionar report de crashes (opcional)

---

## Notas

- **Foco atual**: Estabilizar funcionalidades existentes antes de adicionar muitas novas
- **Prioridade**: Bugs críticos > Desempenho > Novas funcionalidades > Melhorias cosméticas
- **Compatibilidade**: Manter suporte apenas para ASUS AURA USB (`0x0B05:0x19AF`)
- **Branch**: Trabalhar sempre em `dev`, merge para `main` apenas sob solicitação explícita

_Última atualização: 26 de Outubro de 2026_
