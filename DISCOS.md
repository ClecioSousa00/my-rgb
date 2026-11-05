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
- [x] Entry do worker em `asarUnpack`, porque `utilityProcess.fork` precisa de
      um arquivo real (validado com `npm run build:dir`).

### 2. Maiores arquivos (2.2) — concluído

- [x] Lista com nome, caminho, tamanho, extensão e data; a unidade aparece no
      resumo da análise (todos os arquivos vêm da mesma varredura).
- [x] Ordenar por tamanho/nome, filtrar por extensão e pesquisar pelo nome
      (sem diferenciar maiúsculas nem acentos).
- [x] Abrir a localização no gerenciador de arquivos (`storage:reveal`,
      somente leitura).
- [x] Lista limitada aos 500 maiores, com o limite escrito na própria tela.
- [x] `tests/storage-view.test.ts` cobre busca, filtro, ordenação natural e o
      percentual sem alterar o relatório.

### 3. Maiores pastas (2.3) — concluído

- [x] Ranking com expandir/recolher por pasta, tamanho, percentual do total,
      quantidade de arquivos/subpastas e data de modificação.
- [x] Navegação dentro da própria tela, sem abrir o gerenciador de arquivos e
      sem reler o disco.
- [x] Escolha da pasta pela interface (`storage:pick`) e reanálise da mesma
      raiz pelo botão **Atualizar**.
- [x] Aba **Análise** em Discos com progresso, tempo, pasta atual e
      **Cancelar**; reabrir a aba retoma a varredura em andamento em vez de
      iniciar outra.
- [x] Selftest varre uma árvore temporária real e confere o relatório na tela
      (`storageTab`).

### 4. Diagnóstico de espaço (4) — concluído

- [x] Disco com menos de 10% livre (`STORAGE_LOW_SPACE_PERCENT`), com a
      porcentagem livre ao lado do caminho; o mesmo aviso aparece no cartão da
      unidade antes da varredura.
- [x] Arquivos de 1 GB ou mais entre os 500 maiores e pastas temporárias,
      Downloads e caches com 1 GB ou mais (`STORAGE_NOTABLE_BYTES`). Uma pasta
      já nomeada por uma categoria não é contada de novo em outra.
- [x] Crescimento entre análises: 1 GB **e** 10% (`STORAGE_GROWTH_MIN_BYTES`,
      `STORAGE_GROWTH_PERCENT`). O resumo de cada raiz fica em
      `userData/storage/scans.json` (total + 1000 maiores pastas, 12 raízes,
      escrita atômica); sem análise anterior a sugestão não aparece, e pastas
      fora do top-1000 anterior não são comparadas. A raiz analisada só entra
      quando o crescimento não está numa subpasta (o total dela já está no
      resumo), e uma pasta não é contada junto com a subpasta dela.
- [x] Sugestões calculadas no processo principal (`diagnose.ts`) e anexadas ao
      relatório; a tela não recalcula nada.
- [x] Cartão **Sugestões** com caminho, tamanho e botão para mostrar no
      gerenciador de arquivos, mais as regras escritas no rodapé: é conselho,
      não obrigação.
- [x] `tests/storage-diagnose.test.ts` (20 casos) fixa os limites, a ordem, a
      deduplicação e a ausência de sugestão; `tests/storage-history.test.ts`
      (12 casos) cobre round-trip, substituição por raiz, limite de 12,
      ficheiro corrompido e gravações concorrentes.
- [x] `--storage-growth-bench` faz duas varreduras com um arquivo esparso de
      2 GB no meio e prova o crescimento de ponta a ponta.

### 5. Jogos (3.1) — concluído

- [x] Steam, Epic e Riot por pasta, com tamanho e localização.
      Steam usa o `appmanifest_*.acf` para o nome verdadeiro; sem manifesto,
      mostra o nome da pasta (não inventa). Battle.net, Xbox/MS Store e outras
      bibliotecas não são lidos — o jogo continua visível nas maiores pastas.
- [x] Deteção pelo layout de instalação (`steamapps/common`,
      `Epic Games/`, `Riot Games/`), nunca por banco de nomes.
- [x] Limite de 300 jogos, lista ao lado dos maiores arquivos e das sugestões,
      com botão para mostrar no gerenciador de arquivos.
- [x] `tests/storage-games.test.ts` (13 casos) cobre tamanho, ordem, limite,
      pastas que não são jogo (Proton, SteamVR, launcher, runtimes) e o teto de
      300.
- [x] Selftest varre uma biblioteca Steam real da árvore temporária e confere
      o nome vindo do manifesto na tela (`storageTab`).

### 6. Duplicados (4.1) — pendente

- [ ] Análise separada e opcional: tamanho → hash parcial → hash completo.
- [ ] Mostrar cópias, locais e espaço potencialmente recuperável; nada é
      apagado.
