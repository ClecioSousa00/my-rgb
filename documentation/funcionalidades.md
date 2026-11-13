# Funcionalidades

O MyRGB tem uma navegação lateral com onze páginas: a de **Iluminação** (a tela
original, descrita abaixo) e dez outras de diagnóstico, desempenho e
integrações, no visual monocromático inspirado no Reset Explode. Este documento
começa pela navegação e depois detalha cada tela.

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
│  Registos    │                                                        │
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
| Visão geral | Hardware, limitador ao vivo, discos, saúde, rede e atalhos — **pronta** |
| Sistema | SO, placa-mãe/BIOS, CPU, RAM, GPU e discos — **pronta** |
| Sensores | Temperatura, clock, carga, voltagem, ventoinhas e consumo — **pronta** |
| Discos | Unidades, Saúde e Análise — **prontas** |
| Rede | Latência, DNS, velocidade e bufferbloat — **pronta** |
| Registos | Os ficheiros de log, com filtro por nível e exportação em texto — **pronta** |
| Jogos | FPS medido ou estimado por jogo, com fonte e confiança — **pronta** |
| Gargalo | Equilíbrio GPU × CPU, leitura ao vivo e sessão — **pronta** |
| Overlay | Métricas por cima do jogo — **pronta** |
| Integrações | OpenRGB, Razer Chroma e Corsair iCUE — **não implementada** |

> **Nota:** todas as páginas funcionam, menos **Integrações**, que ainda mostra
> o que vai conter — com motivo e plano em
> [planejamento-iluminacao-externa.md](planejamento-iluminacao-externa.md).

---

## Acessibilidade

- **Contraste:** os cinzas usados como texto ficam acima do mínimo AA da WCAG
  sobre o fundo dos cartões (`#0e0e0e`) — cerca de 4,9:1 no tom mais fraco e
  7,3:1 no seguinte. O cinza mais escuro que restou serve só para traços,
  trilhos e ícones decorativos.
- **Foco visível:** todo elemento acionável ganha um anel branco quando
  alcançado pelo teclado. Campos, itens da navegação e o slider de brilho
  mantêm o anel próprio, desenhado para caber na forma deles, em vez de dois
  anéis sobrepostos.
- **Nada de cor como informação:** os estados aparecem por inversão do selo,
  não por verde/vermelho — o que também resolve o daltonismo. A única cor fora
  da paleta que existia (o anel índigo da parada ativa do gradiente) virou
  branco.
- **Movimento reduzido:** com `prefers-reduced-motion`, os pontos "ao vivo"
  param de pulsar e as transições são desligadas. A pré-visualização da fita
  continua rodando de propósito: ela é a imagem do que sai no hardware, não
  decoração da interface.
- **Teclado:** as abas (Discos, Sensores) respondem às setas, o **?** abre no
  clique e fecha com Esc, e o overlay tem atalho global.
- **Lacuna conhecida:** as paradas do gradiente só se movem com o ponteiro —
  ainda não há setas do teclado para posicioná-las.

---

## A tela de Visão geral

É a primeira página da lista e resume as outras em cinco blocos:

- **A máquina** — processador, placa de vídeo e VRAM, memória (tipo e
  velocidade), placa-mãe e BIOS, sistema operacional, quantidade de discos
  físicos, driver da GPU, slots de memória e UEFI/Legacy. É a mesma leitura da
  página Sistema, só que em nove valores.
- **Iluminação** — perfil ativo, motor rodando ou pausado, luzes ligadas ou
  desligadas, zonas ativas, brilho, velocidade e o controlador com o firmware.
  O botão **Abrir** leva para a tela de iluminação.
- **Agora** — o mesmo limitador da página Gargalo: carga da GPU e da CPU, o
  núcleo mais ocupado, VRAM, RAM e as temperaturas, atualizados a cada segundo.
  Vem da mesma coleta (não há um segundo leitor de sensores). O botão
  **Gargalo** abre a análise completa.
- **Precisa de atenção** — a lista do que está errado ou vale uma olhada:
  controlador desconectado, conflito com outro programa, motor pausado, luzes
  desligadas, alterações não salvas, disco com problema, unidade acima de 90 %
  de uso, veredito da rede e limitador de GPU/CPU/VRAM/temperatura. Cada item é
  um botão que abre a página que explica ou resolve. Sem nada na lista, o cartão
  mostra o que foi verificado — e não um espaço vazio.
- **Armazenamento** — cada unidade com o anel de ocupação, usado, total e
  livre; o selo mostra o pior veredito de saúde entre os discos.
- **Rede** — o último diagnóstico (adaptador, latência, download, upload,
  latência sob carga e o primeiro motivo do veredito). Nenhum teste roda ao
  abrir a página: o diagnóstico satura a conexão por 30 segundos e só acontece
  quando você pede, na página Rede.

Nada aqui é inventado: um sensor que não respondeu vira "—", e os discos que não
entregaram S.M.A.R.T. dizem "sem dados" com o motivo — nunca "saudável" por
suposição.

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
- **Refrigeração**, o primeiro cartão: a bomba e as ventoinhas em uma linha
  cada, com RPM, mín/máx da sessão e o último minuto. O veredito é uma frase
  com os números reais ("Bomba a 2 780 RPM · processador a 58 °C") e só
  inverte para o estado de alerta quando há um problema de verdade:
  - **bomba parada** avisa sempre — um water cooler sem fluxo não refrigera,
    mesmo que o processador ainda esteja frio naquele instante;
  - **ventoinha parada** só avisa quando o hardware que ela refrigera passa de
    80 °C; a 0 RPM com o processador frio é modo passivo, e a página diz isso
    em vez de alarmar;
  - **sem canais** a página não inventa: explica que o driver de sensores não
    foi carregado (com o comando), que um water cooler ligado por USB só
    expõe RPM no software do fabricante, ou que o Windows ainda não lê a
    placa-mãe.
  - A bomba só é chamada de bomba quando o **driver** rotula o canal como pump
    (`AIO Pump`, `W_PUMP+`). Sem rótulo, o canal continua "Ventoinha N" e o
    cartão avisa que o header não foi identificado — adivinhar pela ordem dos
    headers seria inventar.
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
- **Os cartões da mesma linha terminam na mesma altura**, e um hardware com
  muitas leituras não estica a linha inteira: o cartão para em cerca de uma
  tela e rola por dentro, então o resto da página não desce junto. O cabeçalho
  (Sensor · agora · mín · máx) fica preso no topo enquanto as leituras rolam.
- **O mínimo, o máximo e o histórico vivem no processo principal**, não na
  página: fechar e reabrir Sensores continua a sessão em vez de recomeçar.
- **De onde vêm os números:**
  - Linux — `/sys/class/hwmon` para temperaturas, ventoinhas (RPM), bombas,
    tensões, consumo e clocks; o kernel já entrega cada leitura com a unidade
    do driver, que é convertida aqui. Rótulos de header (`AIO Pump`, `CPU
    Fan`, `Chassis Fan 2`) são traduzidos, e um canal sem rótulo permanece
    genérico;
  - Windows — carga, clocks e memória pelo `systeminformation`; temperatura,
    ventoinhas, bomba, tensões e consumo da placa-mãe pelo **helper** .NET
    (LibreHardwareMonitor), no mesmo processo elevado que mede o FPS. O helper
    é compartilhado pelas duas funções e só sobe quando alguma delas pede;
    se ele não estiver instalado ou o UAC for recusado, a página explica o
    motivo em vez de mostrar zeros. Sem leitura do helper, o cartão de
    refrigeração e as observações dizem exatamente o que faltou;
  - NVIDIA — `nvidia-smi` nos dois sistemas, quando instalado. A ventoinha da
    GPU vem em **percentual**, não em RPM, e o cartão avisa que não converte
    uma coisa na outra. Campos que o driver não responde (`[N/A]`)
    simplesmente não aparecem.
- **Sanidade antes de exibir:** um valor absurdo (a leitura de 65 261 850 °C
  que um NVMe pode devolver quando o arquivo falha) é descartado, e um sensor
  que não puder ser lido vira **—**, nunca zero.
- **Observações** no rodapé explicam o que faltou e por quê — por exemplo, que
  o driver `asus` não expôs ventoinhas, que o helper do Windows não foi
  encontrado ou que o utilizador recusou a elevação (UAC).

---

## A tela de Discos

Três abas.

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
  para o aviso de falha do próprio disco. É a mesma leitura do Reset Explode e
  não depende do helper do Windows (que mede FPS); se um dia ele também ler
  sensores, o cartão não muda.
- A leitura fica em cache por 60 s (um HDD adormecido acorda com o `smartctl`);
  **Atualizar** força uma nova.
- Um disco que não responde (pendrive com bridge USB sem suporte, disco sem
  permissão) fica como **sem dados** — nunca como saudável. No Windows o
  "Healthy" que ele dá para qualquer pendrive não conta como métrica.

**Análise** — a varredura é sob demanda, nunca no arranque: escolhe-se uma
unidade ou uma pasta (diálogo do sistema) e ela roda num processo separado
(`utilityProcess`), com progresso agrupado (arquivos, pastas, bytes e pasta
atual), estimativa de andamento quando a pasta é a raiz da unidade e botão
**Cancelar**. Sair da aba não interrompe a análise; voltar mostra o progresso ou
o último resultado. É estritamente de leitura: não segue links simbólicos nem
junctions, não atravessa outras unidades e conta um hard link uma vez só. Pasta
sem permissão não interrompe nada — entra na contagem de ignoradas, fica
nomeada numa nota e o relatório avisa que o total está incompleto.

O resumo mostra o tamanho analisado, arquivos, pastas, duração, o percentual do
espaço usado na unidade e quantas pastas ficaram sem permissão. Abaixo, duas
listas: os **maiores arquivos** (nome, caminho, tamanho, extensão, data e um
botão para mostrar no gerenciador de arquivos), com busca pelo nome, filtro por
extensão e ordenação por tamanho ou nome; e as **maiores pastas**, com tamanho,
percentual do total, quantidade de arquivos e subpastas e data, que se expandem
na própria tela sem reler o disco. Para caber na memória, a árvore guarda as 20
maiores subpastas por pasta e no máximo 200 mil pastas, além dos 500 maiores
arquivos; passando disso, os totais continuam completos e só o detalhe por pasta
desaparece.

**Sugestões** — o diagnóstico não aponta problemas obrigatórios, e sim o que
vale olhar, com a regra escrita ao lado para você poder discordar dela:

- unidade com menos de 10% de espaço livre (o aviso também aparece no cartão da
  unidade, antes da varredura);
- arquivos de 1 GB ou mais entre os 500 maiores;
- pastas temporárias, de Downloads ou de cache com 1 GB ou mais — uma pasta já
  nomeada por uma categoria não entra de novo em outra;
- pasta que cresceu pelo menos 1 GB **e** 10% desde a análise anterior da mesma
  pasta. Isso exige um resumo guardado da varredura anterior
  (`userData/storage/scans.json`); na primeira análise a linha não aparece, e
  uma pasta que estava fora das 1000 maiores da vez anterior não é comparada.
  A pasta analisada só aparece quando o crescimento não está numa subpasta —
  o total dela já está no resumo — e, quando uma pasta e uma subpasta dela
  cresceram, só a de cima é listada, para o mesmo espaço não aparecer duas
  vezes.

Cada sugestão mostra caminho, tamanho e um botão para mostrá-la no gerenciador
de arquivos. Uma lista vazia significa "nada a apontar por estas regras", nunca
"o disco está saudável".

**Jogos** — instalações reconhecidas pelo layout de pastas, sem banco de nomes:

- Steam: `<biblioteca>/steamapps/common/<jogo>`, com o nome do `appmanifest_*.acf`
  quando existe; sem ele, o nome da pasta (não um nome inventado).
- Epic Games: `Program Files/Epic Games/<jogo>` (ou qualquer pasta
  `Epic Games/`).
- Riot Games: `Riot Games/<jogo>`.
- Layouts que não são jogo — Proton, SteamVR, Steamworks Shared, Launcher,
  Riot Client — não são listados.
- Battle.net, Xbox/Microsoft Store e outras bibliotecas não são lidos: um jogo
  instalado por elas continua aparecendo nas maiores pastas pelo tamanho, mas
  sem nome de jogo.

A lista é limitada a 300 instalações; se houver mais, o relatório avisa quantas
ficaram de fora. Cada jogo mostra tamanho, número de arquivos, fonte do nome
(manifesto ou pasta) e um botão para mostrá-lo no gerenciador de arquivos.

**Duplicados** — análise separada e opcional, nunca disparada sozinha:

- O usuário escolhe a pasta e inicia; nada é apagado, movido ou alterado.
- A detecção ocorre em três estágios: agrupamento por tamanho, hash parcial
  (cabeça + cauda do arquivo) e hash completo apenas nos candidatos. Arquivos
  com tamanho único são descartados sem ler o conteúdo.
- O nome sozinho não prova nada: dois arquivos só são duplicados quando o
  conteúdo é idêntico, confirmado por hash.
- O resultado mostra cada conjunto com caminhos, tamanho, número de cópias e
  espaço que seria liberado mantendo apenas uma cópia. Cabe ao usuário decidir
  o que remover.
- Corre num `utilityProcess` próprio, com progresso ao vivo e **Cancelar**.
  Pastas sem permissão são ignoradas e não interrompem a análise.

---

## A tela de Rede

Um teste sob demanda de cerca de 30 segundos: ele só roda quando você clica,
porque satura a conexão e não faria sentido disparar ao abrir a página. Durante
o teste o botão vira **Cancelar**; recusar mantém o último resultado na tela.

- **Progresso por etapa** no topo: procurar a conexão, medir latência, DNS,
  download e upload, com a fração concluída. O teste roda no processo
  principal: sair da página e voltar mostra o mesmo progresso e o botão
  **Cancelar**, em vez de fingir que nada está acontecendo.
- **Latência, jitter e perda** de três alvos em paralelo: o **roteador**
  (gateway do sistema) e dois servidores públicos (1.1.1.1 e 8.8.8.8). São 20
  pacotes no Linux e 12 no Windows, onde o ping é de um em um segundo.
- **DNS** — tempo de resolução de três domínios. A média entra no veredito; um
  domínio que não resolve aparece como "falhou".
- **Velocidade** — download e upload pelo speed.cloudflare.com, com 4 e 3
  conexões em paralelo por 8 s e 6 s. Durante o download um ping roda junto,
  medindo a **latência sob carga** (bufferbloat).
- **O veredito compara a rede local com a internet**, para dizer onde está o
  atraso:
  - perda acima de 5% ou latência média acima de 150 ms: **ruim**;
  - perda acima de 1%, média acima de 80 ms, jitter acima de 20 ms, latência
    sob carga mais de 100 ms acima da ociosa, DNS acima de 150 ms ou download
    abaixo de 10 Mbps: **atenção**;
  - um roteador que bloqueia ping, sozinho, não é problema: a página diz isso e
    o resultado segue **estável**;
  - sem conexão ativa o cartão diz **sem rede**; se o comando `ping` não
    existir, **sem dados** — a página explica em vez de culpar a internet.
- **De onde vêm os números:** o `ping` do sistema (Node não manda ICMP sem
  root), o resolvedor do próprio sistema e o Cloudflare. Nada precisa de
  privilégio e nada é gravado em disco.
- Quando o Cloudflare recusa a medição (HTTP 429, por excesso de testes), o
  download aparece como **—** e uma observação explica o motivo, em vez de um
  zero falso.

---

## A tela de Registos

Mostra os mesmos registos descritos em **Registos e relatórios de crash**, mas
sem precisar abrir a pasta no gerenciador de arquivos. É a página para consultar
o que aconteceu e **exportar** o texto quando for pedir ajuda.

- **Lista de ficheiros** — `my-rgb.log` (o atual) e os rotacionados
  `my-rgb.log.1` a `.3`, com nome, tamanho e data da última alteração. O atual
  leva a etiqueta **atual**.
- **Conteúdo** — ao abrir a página, o registo atual (`my-rgb.log`) já é lido;
  ao selecionar outro ficheiro, ele substitui o conteúdo. Cada linha é
  separada em data e hora, nível (**Erro**, **Aviso**, **Info** ou
  **Depuração**) e mensagem. As datas aparecem no formato local; o texto da
  mensagem é exibido como está, inclusive traços de pilha.
- **Filtro por nível** — Todos, Erro, Aviso, Info ou Depuração. O filtro vale só
  para a exibição: o ficheiro não é alterado.
- **Exportar .txt** — abre o diálogo do sistema para escolher onde salvar. O
  texto exportado é uma linha por evento, no formato
  `data hora NÍVEL mensagem`; o utilizador decide para quem enviar.
- **Abrir pasta** — o ícone no cabeçalho abre `logs/` no gerenciador de
  arquivos, onde também estão os minidumps de `logs/crash/`.
- As linhas de continuação de um traço de pilha ficam anexadas ao evento que
  as originou, então exportar o registo não perde a explicação da falha. Só
  uma linha sem evento antes dela é descartada, e o rodapé informa quantas
  foram ignoradas.
- Nada é enviado para servidor nenhum. A página apenas lê os ficheiros que o
  próprio programa já grava em `<userData>/logs`; exportar é uma cópia local,
  e os registos continuam sujeitos à rotação de 2 MB.

---

## A tela de Jogos

Responde "quantos FPS eu faço neste jogo?" com o hardware que está na máquina.
A base normalizada (PCGameBenchmarks + Open GPU Benchmarks) viaja com o
aplicativo: a página abre preenchida e funciona **sem internet**.

- **Opções** no topo: resolução (1080p, 1440p, 4K), gráficos (Baixo a Ultra) e
  upscaling (Nativo, Qualidade, Desempenho). Mudar qualquer uma recalcula a
  tabela inteira.
- **Hardware considerado** mostra a GPU e a CPU detectadas, o modelo em que a
  GPU foi encontrada na base e o score G3D. Se a detecção não corresponder a
  nenhuma das 1.381 placas, a página diz isso e oferece uma **busca manual**;
  a escolha não altera a detecção do sistema e pode ser desfeita.
- **Catálogo**: 32 jogos em destaque na abertura; a busca alcança os 17.230
  títulos da base. A tabela traz FPS médio, 1% low, fonte e confiança, e pode
  ser ordenada por FPS, fonte ou nome.
- **Resultado**: o cartão do jogo selecionado mostra o valor, o tipo de
  resultado, a GPU/CPU consideradas, a confiança, o teto aplicado, a contagem
  de amostras e a explicação de como o número foi obtido.
- **Fontes e licenças**: nome, link, licença (CC BY 4.0), versão de cada base e
  a data da normalização, além da atribuição obrigatória.

### Medido e estimado não se misturam

- **Benchmark medido**: uma execução real para aquela combinação de jogo, GPU,
  resolução, preset e upscaling. É exibida como publicada, com 1% low e número
  de amostras. A base incorporada tem 9 combinações medidas (Cyberpunk 2077 em
  uma RTX 5080).
- **Estimativa pública**: quando não há execução exata, a página coloca a GPU
  na curva das 12 GPUs de referência (interpolação log-log por score G3D) e
  aplica os fatores de resolução e preset documentados pela fonte. O cartão
  avisa que é estimativa e reduz a confiança.
- **Dados insuficientes**: GPU fora da base, placa mais fraca que a referência
  mínima ou configuração que a base não sustenta. Nenhum índice padrão é usado
  para preencher a lacuna.

### O 1% low

Só aparece quando foi **medido**. Uma estimativa nunca o deriva do FPS médio —
não existe uma percentagem universal. Sem medição, a linha diz "Não
disponível". O 1% low também não é apresentado como FPS mínimo.

### Limitações na própria página

A tabela não tem coluna de limitador: a estimativa considera apenas a GPU, e
afirmar "gargalo de CPU" a partir dela seria inventar um diagnóstico. O
limitador real continua nas páginas Gargalo e Overlay. Upscaling, ray tracing e
geração de quadros não são modelados; a página avisa quando a configuração
escolhida depende deles.

A metodologia completa, as licenças e o processo de atualização estão em
[jogos.md](jogos.md).

---

## A tela de Gargalo

Responde "o que está segurando o FPS?" em três blocos, do mais teórico ao mais
concreto: o equilíbrio entre processador e placa de vídeo, o limitador do
momento e o que aconteceu durante uma sessão.

### Equilíbrio teórico

Compara o desempenho relativo dos dois sem medir jogo nenhum, com as tabelas
de referência do Reset Explode (RTX 4070 e Ryzen 7 7700X valem 100).

- **GPU ÷ CPU** é a razão entre os índices, marcada numa escala logarítmica de
  0,4× a 2,5× — a mesma do Reset Explode.
- As cinco faixas de texto são as originais: GPU muito mais forte que a CPU,
  GPU um pouco à frente, hardware equilibrado, CPU mais forte que a GPU e GPU
  muito fraca para a CPU.
- Quando o processador ou a placa não estão na tabela, o índice padrão (GPU 50,
  CPU 80) aparece com o selo **fora da tabela** e uma observação — a razão
  continua ali, mas serve só como referência.

### Leitura ao vivo

Uma amostra por segundo, vinda da mesma coleta da página Sensores: carga da
GPU, carga total da CPU, núcleo mais ocupado, VRAM, RAM e temperaturas.

- O **limitador** é classificado na ordem do Reset Explode: VRAM ≥ 97 % →
  temperatura (CPU ≥ 95 °C ou GPU em queda térmica) → GPU ≥ 90 % → CPU ou
  núcleo ≥ 85 % → RAM ≥ 92 % → nada no limite (trava de FPS, V-Sync ou menu).
- O título e o conselho mudam com o limitador. Quando ele é CPU, VRAM, RAM ou
  temperatura, o bloco **inverte** — o mesmo tratamento de alerta do original.
- Uma leitura que não existe aparece como **—** e a regra que dependia dela
  fica de fora, com uma observação. Sem `nvidia-smi`, por exemplo, carga e
  temperatura da GPU não entram no veredito; a página diz isso em vez de supor
  zero.
- A **queda térmica** da GPU é aproximada pela temperatura ≥ 90 °C. O Reset
  Explode lê os bits de throttle da NVML, que o `nvidia-smi` não expõe; a regra
  em si continua sendo a original, com o campo como entrada.

### Análise de sessão

Uma sessão de **1, 3 ou 5 minutos** classifica cada amostra e guarda a
distribuição, as médias e os máximos.

- O progresso mostra o tempo decorrido, a contagem de amostras e qual
  limitador está na frente até ali. **Cancelar** termina na hora e não deixa
  timer para trás.
- No fim, a página mostra o limitador predominante, a **distribuição do tempo**
  (barra e legenda, com a fatia de cada um), GPU/CPU médias, núcleo mais
  ocupado, VRAM e RAM máximas, temperaturas máximas e o número de amostras.
- A sessão mantém a coleta viva mesmo se você sair da página; fechar o app
  encerra tudo. O resultado fica só na memória do processo principal — nada é
  gravado em disco.
- O **FPS real** vem do mesmo helper do overlay, no Windows. No Linux a
  sessão roda sem FPS — o campo fica **—** e a página não inventa um número.

---

## A tela de Overlay

Uma janela transparente por cima do jogo, no estilo RTSS/Afterburner: sem
moldura, sempre no topo, que **ignora o mouse** e **não aparece na barra de
tarefas**. Ela aparece em jogos em tela cheia "sem bordas" e na maioria dos
jogos DX11/DX12 em tela cheia; em tela cheia exclusiva antiga o Windows não
deixa nenhuma janela aparecer.

- **Ligar e desligar** pelo interruptor da página ou pelo atalho global
  **Ctrl + Shift + O**. O atalho é configurável (clique nele e pressione a
  combinação) e exige pelo menos um modificador — Ctrl, Alt ou Shift.
- **Monitor**: o overlay fica na tela escolhida, mesmo que o jogo abra em
  outra.
- **Aparência**: tamanho (Pequeno, Médio ou Grande), opacidade só do fundo (o
  texto é sempre opaco) e canto.
- **Métricas**: presets **Padrão**, **Tudo** e **Nada**, mais uma caixa por
  métrica, agrupadas em FPS, GPU, VRAM, CPU, RAM e Outros (nome do jogo e
  hora). A ordem no overlay é a do catálogo, não a ordem em que você marcou.
- Nenhum valor é arredondado para zero: o sensor que não responde aparece como
  **—**. Hotspot, tensão, clock da memória e limitador da NVIDIA só aparecem se
  o driver expuser o dado.
- O overlay usa a **mesma coleta** da página Sensores e o **mesmo serviço de
  FPS** do Gargalo; abrir o overlay não inicia uma segunda leitura de hardware.
- O FPS é o do **jogo em primeiro plano**, lido por ETW (o mesmo método do
  PresentMon): nada é injetado no jogo. Frametime, 1% low (percentil 99 do
  frametime nos últimos 10 s) e o gráfico saem da mesma amostra.
- No Windows, a primeira leitura de FPS pede **um** UAC, porque a sessão de
  ETW é do sistema inteiro. Recusar não quebra nada: o overlay continua com os
  sensores e a página explica o que faltou, com **Tentar novamente**.
- **No Linux** o overlay funciona normalmente com os sensores; o FPS fica
  **—** e a página diz que a leitura de frames do Windows não existe aqui,
  apontando o MangoHud/gamescope.

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
| **Nível de registo** | quanto vai para o ficheiro de registo: só erros, avisos, informação (padrão) ou depuração |
| **Abrir pasta de registos** | abre, no gestor de ficheiros, a pasta com `my-rgb.log` e os relatórios de crash |

### Registos e relatórios de crash

O programa escreve um registo em texto em `logs/my-rgb.log`, dentro da pasta
de dados do utilizador (`~/.config/my-rgb/` no Linux,
`%APPDATA%\my-rgb\` no Windows). Ele guarda o que já aparecia no terminal:
arranque, versão, conexão e desconexão do controlador, início e paragem do
motor, erros de escrita e mensagens do renderer.

- **Rotação:** o ficheiro vira `my-rgb.log.1` ao passar de 2 MB, e são mantidos
  três arquivos antigos — no máximo ~8 MB, sem intervenção.
- **Nunca derruba o programa:** se a pasta não puder ser escrita, o registo é
  abandonado e o programa continua (o terminal continua a receber tudo).
- **Relatórios de crash:** o Crashpad grava minidumps em `logs/crash/`. Nada é
  enviado para nenhum servidor — os relatórios ficam na máquina e só saem se
  você os anexar a um relato. Podem ser desligados com `MYRGB_CRASH_REPORTER=0`
  ou com o argumento `--no-crash-reporter`.
- **Nível por ambiente:** `MYRGB_LOG_LEVEL=debug npm run dev` sobrepõe a opção
  da interface, o que é útil para acompanhar um problema sem mexer nas
  configurações salvas.
- **Ver e exportar sem sair do programa:** a página **Registos** (grupo
  Diagnóstico) lista esses ficheiros, filtra por nível e salva uma cópia em
  `.txt` para anexar a um relato — veja [A tela de Registos](#a-tela-de-registos).

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
