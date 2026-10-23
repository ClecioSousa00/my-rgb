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
- [ ] **Histórico de alterações (Undo/Redo)** - Desfazer/refazer mudanças no perfil
- [ ] **Agrupar zonas** - Permitir agrupar zonas para aplicar configuração em conjunto
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

---

## 5. Melhorias na Interface

- [ ] **Melhorar visualização de paletas** - Preview maior no seletor de gradiente
- [ ] **Adicionar busca no seletor de efeitos** - Filtrar 34 efeitos por nome/categoria
- [ ] **Tooltips mais informativos** - Expandir descrições em alguns lugares
- [ ] **Melhorar responsividade** - Ajustar layout para diferentes resoluções
- [ ] **Adicionar indicador de zona seguindo outra** - Melhorar UX quando em modo "seguir zona"
- [ ] **Reorganizar painel de configurações** - Agrupar opções por categoria

---

## 6. Documentação

- [ ] **Atualizar README com novas funcionalidades** - Exportar/Importar, salvar único botão, etc.
- [ ] **Adicionar guia de resolução de problemas (Troubleshooting)** - Comum em Linux/Windows
- [ ] **Documentar formato de exportação de perfil** - Especificação do `.myrgb.json`
- [ ] **Criar tutorial em vídeo/galeria de efeitos** - Screenshots dos 34 efeitos
- [ ] **Traduzir documentação para inglês** - Para maior alcance

---

## 7. Testes e Qualidade

- [ ] **Aumentar cobertura de testes** - Adicionar testes para export/import
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

_Última atualização: 23 de Outubro de 2026_
