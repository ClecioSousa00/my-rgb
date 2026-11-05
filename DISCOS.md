Expansão do módulo de discos e armazenamento — MyRGB

Quero expandir essa funcionalidade para transformá-la em um módulo completo de gerenciamento de armazenamento e diagnóstico de discos.

O principal objetivo é permitir que o usuário entenda não apenas quanto espaço está sendo utilizado, mas também o que está ocupando esse espaço, onde estão os arquivos maiores e quais diretórios mais contribuem para o consumo de armazenamento.

2. Análise de armazenamento — principal funcionalidade

Esta deve ser a funcionalidade de maior prioridade.

O usuário precisa conseguir analisar o armazenamento de uma unidade e descobrir exatamente quais pastas e arquivos estão consumindo mais espaço.

2.1. Análise de diretórios

Implemente um analisador capaz de percorrer os diretórios de uma unidade ou caminho selecionado e calcular o consumo de armazenamento.

O sistema deve apresentar:

Tamanho total de cada pasta.

Quantidade de arquivos.

Quantidade de subpastas.

Tamanho dos arquivos individuais.

Data da última modificação, quando disponível.

Percentual de ocupação em relação à unidade analisada.

Permita navegar pela estrutura de diretórios, entrando nas pastas para descobrir onde está concentrado o consumo.

Exemplo:

Disco C:
850 GB utilizados

Users/
280 GB
├── Downloads/ 45 GB
├── Videos/ 80 GB
├── Documents/ 15 GB
└── AppData/ 140 GB

Program Files/
180 GB

Games/
250 GB

Windows/
65 GB

Os valores acima são apenas ilustrativos.

2.2. Ranking dos maiores arquivos

Crie uma visualização que liste os maiores arquivos encontrados na análise.

Informações:

Nome do arquivo.

Caminho completo.

Tamanho.

Extensão.

Data de modificação.

Unidade onde está localizado.

Permita:

Ordenar por tamanho.

Ordenar por nome.

Filtrar por extensão.

Pesquisar pelo nome.

Abrir a localização do arquivo no gerenciador de arquivos do sistema.

2.3. Ranking das maiores pastas

Crie uma lista das pastas que mais ocupam armazenamento.

Permita expandir cada pasta e visualizar suas subpastas, facilitando a identificação do consumo.

A navegação deve ser intuitiva e não exigir que o usuário abra manualmente o explorador de arquivos para investigar cada diretório.

3.1. Identificação de jogos

Como o MyRGB também possui uma página de jogos, seria interessante identificar instalações de jogos e apresentar quanto espaço elas ocupam.

Considere:

Steam.

Epic Games.

Riot Games.

Battle.net.

Xbox / Microsoft Store.

Outras bibliotecas identificáveis.

Mostre o nome do jogo, tamanho ocupado e localização da instalação quando for possível identificá-los com segurança.

Não dependa exclusivamente de uma plataforma específica.

Se um jogo não puder ser identificado, apresente a pasta correspondente sem inventar seu nome.

4. Diagnóstico de espaço

Implemente uma seção que ajude o usuário a identificar situações que merecem atenção.

Exemplos:

Disco com menos de 10% de espaço disponível.

Pastas que cresceram muito entre duas análises.

Arquivos muito grandes.

Pastas temporárias com consumo elevado.

Downloads acumulados.

Caches ocupando espaço significativo.

Arquivos duplicados, quando houver uma identificação confiável.

Apresente os resultados como sugestões, e não como problemas obrigatórios.

4.1. Arquivos duplicados

Como funcionalidade adicional, considere detectar arquivos duplicados.

A identificação deve utilizar critérios confiáveis:

Comparação inicial por tamanho.

Comparação por hash para confirmar duplicidade.

Evite calcular hash de todos os arquivos durante a análise inicial, pois isso pode consumir muito tempo e recursos.

Implemente a identificação como uma análise separada e opcional.

Mostre:

Nome.

Localizações.

Tamanho.

Quantidade de cópias.

Espaço potencialmente recuperável.

Não considere arquivos com nomes iguais como duplicados sem verificar seu conteúdo.

10. Requisitos técnicos e cuidados importantes

A análise de armazenamento pode envolver milhares ou milhões de arquivos. Portanto, a implementação precisa considerar desempenho e segurança.

10.1. Análise sob demanda

Não faça uma varredura completa do sistema automaticamente ao abrir o MyRGB.

O usuário deve escolher a unidade ou diretório e iniciar a análise.

Apresente:

Progresso.

Quantidade de arquivos analisados.

Diretório atual, quando apropriado.

Estimativa de andamento, se for possível calculá-la.

Opção para cancelar.

10.2. Desempenho

A análise não pode bloquear a interface.

Execute operações pesadas em processos, workers ou threads apropriados à arquitetura do projeto.

Considere:

Processamento incremental.

Atualizações de progresso agrupadas.

Limites de uso de memória.

Cancelamento seguro.

Cache de resultados.

Reaproveitamento de dados quando possível.

Evite enviar milhares de atualizações individuais para a interface.

10.3. Permissões

O sistema deve lidar corretamente com diretórios sem permissão de leitura.

Não interrompa toda a análise quando um diretório for inacessível.

Registre os caminhos ignorados.

Informe que a análise pode estar incompleta.

Não solicite privilégios administrativos sem necessidade.

Não tente contornar permissões do sistema operacional.

10.4. Segurança

A análise deve ser estritamente de leitura.

Não exclua, modifique ou mova arquivos durante a varredura.

Tenha cuidado com:

Links simbólicos.

Junctions do Windows.

Diretórios recursivos.

Pontos de montagem.

Arquivos protegidos.

Arquivos em uso.

Unidades removíveis.

Evite seguir links que possam causar ciclos ou fazer a análise sair do escopo selecionado.

10.5. Compatibilidade

O MyRGB precisa funcionar em Windows e Linux.

Analise quais recursos possuem APIs diferentes entre os sistemas.

Crie abstrações para operações específicas de cada plataforma, mantendo uma interface comum para o restante do aplicativo.

Não implemente funcionalidades que funcionem somente no Windows sem informar isso na interface.

---

## Progresso da implementação

Cada secção só é marcada depois de `npm run typecheck`, `npx vitest run`,
`npm run build` e o `--selftest` passarem. O que está `[ ]` não existe ainda —
não há número inventado nem tela pela metade.

### 1. Núcleo da análise (2.1) — concluído

- [x] Contratos em `src/shared/features/storage.ts` (relatório, árvore, ranking,
      progresso, limites).
- [x] Percurso puro em `src/main/features/storage/walk.ts`: totais por pasta,
      contagem de arquivos e subpastas, data de modificação, ranking dos maiores
      arquivos, abort.
- [x] `utilityProcess` próprio (`src/main/features/storage/worker.ts` →
      `out/main/storageWorker.js`), para não roubar quadros ao motor.
- [x] Gestor com scan única, progresso agrupado, cancelamento e último
      relatório em memória (`src/main/features/storage/index.ts`).
- [x] IPC `storage:*`, preload e API tipada.
- [x] Regras de 10.1 a 10.5: sob demanda, nunca no arranque; read-only; não
      bloqueia a interface; cancelar; permissões viram nota; links e junctions
      não seguidos; outras unidades não atravessadas; hard link contado uma vez.
- [x] Limites de memória: 20 subpastas por pasta, 200 mil pastas, 500 maiores
      arquivos — acima do limite os totais continuam completos.
- [x] `tests/storage.test.ts` — 14 testes com árvores reais (sizes, árvore,
      ranking, symlink, hard link, pasta sem permissão, cap de filhos, limite de
      nós, progresso ao vivo, fração, cancelamento, caminho inválido).
- [x] Medição com `--storage-bench`: 378 mil arquivos / 56 mil pastas / 13,3 GB
      em 3,2 s, FPS 8,6 → 8,6 (motor limitado pelo HID). O `fork` do worker
      custa ~1 s.
- [ ] Interface da aba **Análise**: navegar pela árvore, percentual da unidade,
      data de modificação — entra na secção 2.3, junto do ranking.
- [ ] Escolha da pasta pela interface (hoje só pela API/linha de comando) —
      mesma secção.

### 2. Maiores arquivos (2.2) — pendente

- [ ] Lista com nome, caminho, tamanho, extensão, data e unidade.
- [ ] Ordenar por tamanho/nome, filtrar por extensão, pesquisar por nome.
- [ ] Abrir a localização no gerenciador de arquivos.

### 3. Maiores pastas (2.3) — pendente

- [ ] Ranking com expandir/recolher por pasta (a árvore do núcleo já tem os
      totais; falta só a tela).

### 4. Diagnóstico de espaço (4) — pendente

- [ ] Disco com menos de 10% livre (já dá para calcular com `listDrives`).
- [ ] Arquivos muito grandes e pastas temporárias/Downloads/caches.
- [ ] Crescimento entre análises — exige guardar o resumo do scan anterior em
      `userData`; sem scan anterior a linha não aparece.

### 5. Jogos (3.1) — pendente

- [ ] Steam, Epic e Riot por pasta, com tamanho e localização.
- [ ] Battle.net e Xbox/MS Store ficam de fora (ACL de `WindowsApps` e formato
      interno não documentado); a tela diz isso em vez de inventar nomes.

### 6. Duplicados (4.1) — pendente

- [ ] Análise separada e opcional: tamanho → hash parcial → hash completo.
- [ ] Mostrar cópias, locais e espaço potencialmente recuperável; nada é
      apagado.
