# Jogos: de onde vêm os FPS

A página **Jogos** responde a uma pergunta só:

> Com o hardware instalado neste computador, qual desempenho posso esperar em
> determinado jogo, na resolução e nas configurações escolhidas?

Ela funciona **offline**. A base normalizada viaja com o aplicativo e é lida do
disco; nenhuma consulta depende de um servidor estar no ar. O que a página não
faz é fingir que sabe: quando as fontes não sustentam um número, ela mostra
**Dados insuficientes**.

---

## Fontes

Duas bases públicas, ambas em **CC BY 4.0**, com papéis diferentes.

### PCGameBenchmarks — estimativas

| | |
|---|---|
| Site | <https://pcgamebenchmarks.com> |
| Dados | <https://github.com/emilioagustin83/pc-game-fps-dataset> |
| Licença | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Versão incorporada | 5 de outubro de 2026 |
| O que oferece | 17.427 linhas de jogos (17.230 títulos após deduplicar), requisitos de sistema, trava de motor e **FPS estimado em 1080p/Alto em 12 GPUs de referência**; 1.381 GPUs com score G3D (PassMark) |
| Natureza | **Estimativa** — a própria fonte modela o FPS a partir dos requisitos de Steam e do score G3D, calibrada contra benchmarks medidos. Não é uma medição desta máquina |

As 12 GPUs de referência, da mais fraca para a mais forte, e os scores usados
para colocar cada placa na curva:

| GPU | G3D |
|---|---:|
| Intel Iris Xe | 2.610 |
| Radeon 780M | 6.866 |
| GeForce GTX 1650 | 7.873 |
| GeForce GTX 1660 SUPER | 12.683 |
| Radeon RX 7600 | 16.548 |
| GeForce RTX 3060 | 17.008 |
| GeForce RTX 4060 | 19.530 |
| GeForce RTX 5060 | 20.836 |
| Radeon RX 7800 XT | 24.322 |
| GeForce RTX 4070 | 26.918 |
| GeForce RTX 5070 | 28.771 |
| GeForce RTX 4090 | 38.081 |

A fonte publica **apenas 1080p/Alto** por GPU. As tabelas completas de
1440p/4K por jogo existem no site, mas as páginas estão atrás de proteção
Cloudflare; o projeto não faz scraping delas. A base distribuída é o CSV
público, sem invenção de colunas.

### Open GPU Benchmarks — medições

| | |
|---|---|
| Site | <https://opengpubenchmarks.com> |
| API | <https://opengpubenchmarks.com/api/v1/official.json> |
| Licença | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Versão incorporada | `metadata.generated_at` do JSON, guardado em `catalog.json` |
| O que oferece | Execuções reais com **FPS médio, 1% low, mínimo e máximo**, além de CPU, testbench, resolução, preset, upscaling, driver e data |
| Natureza | **Medido**, mas só nas combinações que o projeto publicou |

Na versão incorporada há **9 combinações medidas**, todas de **Cyberpunk 2077
em uma GeForce RTX 5080 Founders Edition**, com CPU Ryzen 9 9950X3D:
1080p/1440p/4K em Alto nativo, Alto com FSR Quality e Ultra com FSR Quality.
Presets de ray tracing, Steam Deck, DLSS/FSR Auto e Balanced ficaram de fora:
não são comparáveis com os presets que a página oferece.

O snapshot é pequeno (dezenas de KB), então é distribuído inteiro.

### HowManyFPS

A integração com o HowManyFPS foi **removida**. A página não depende de chave,
de conta nem de rede. Nenhuma funcionalidade da página atual ficou presa a ela.

---

## O que é distribuído

| Arquivo | Papel |
|---|---|
| `src/main/features/games/data/catalog.json` | Base normalizada (≈1,4 MB), gerada; **não editar à mão** |
| `tools/build-games-data.mjs` | Gera a base a partir das duas fontes |
| `src/main/features/games/dataset.ts` | Valida a base e monta os índices de busca e de GPU |
| `src/main/features/games/query.ts` | Ordem de prioridade: medido → estimativa → sem dados |
| `src/main/features/games/estimate.ts` | Matemática pura da estimativa |
| `src/main/features/games/index.ts` | Serviço: hardware, lista em destaque, busca, notas |

O catálogo é carregado uma vez no processo principal, na primeira consulta à
página. A interface nunca lê o JSON: recebe apenas as linhas resolvidas por IPC,
o que mantém a thread da UI livre.

### Atualizar a base

```bash
npm run games:data                 # baixa as duas fontes
npm run games:data -- --from DIR   # usa cópias locais (games.csv, gpus.csv, official.json)
```

O script:

1. baixa (ou lê) `games.csv`, `gpus.csv` e `official.json`;
2. valida cada linha — uma linha com FPS ausente, negativo ou fora do formato é
   **descartada e contada**, nunca corrigida com um valor padrão;
3. resolve títulos duplicados pelo ano mais recente (166 nomes apareciam mais
   de uma vez; 17.427 linhas viram 17.230 jogos);
4. converte resoluções e presets para os identificadores internos;
5. agrupa execuções medidas iguais (mesmo jogo/GPU/resolução/preset/upscaling)
   em uma média, somando as amostras;
6. grava `catalog.json` com a origem, a licença e a data de cada bloco.

Sem `--from`, o download vai para `node_modules/.cache/myrgb-games/`. A base
gerada é versionada, então o aplicativo continua funcionando sem rede mesmo que
o script nunca tenha rodado.

---

## Como o resultado é escolhido

A ordem é fixa e está em `query.ts`:

1. **Benchmark medido exato** — mesmo jogo, GPU, resolução, preset e upscaling.
   O valor é exibido como foi publicado, com 1% low e contagem de amostras.
   Não é recalculado com os fatores da estimativa.
2. **Estimativa pública** — a curva das 12 GPUs de referência, ajustada pelos
   fatores documentados pela fonte.
3. **Sem dados** — nenhum número é produzido.

Não há adaptação de um benchmark medido para outra GPU. A única GPU medida é
uma RTX 5080, e as execuções com ray tracing/upscaling não podem ser
convertidas por um score raster sem inventar um número. Quando não há
correspondência exata, a estimativa pública responde e diz que é estimativa.

### A curva

Para um jogo, cada GPU de referência é uma âncora `(score G3D, FPS em
1080p/Alto)`. A interpolação é **log-log** entre âncoras: o FPS cresce de forma
sublinear com o score, e uma reta em escala log evita saltos entre placas
vizinhas.

- **Âncoras na trava são excluídas.** Um valor igual à trava significa “pelo
  menos isto”, não um ponto da curva; usá-lo achataria a curva e subestimaria
  placas rápidas.
- **GPU exatamente igual a uma referência, em 1080p/Alto** usa o valor
  publicado, sem refit.
- **Acima da âncora mais forte**, a inclinação das duas últimas âncoras é
  reutilizada, limitada entre 0,35 e 1,6, e a confiança cai para baixa.
- **Abaixo da âncora mais fraca**, não há estimativa: a resposta é “sem dados”.
- **Todas as âncoras na trava**, em 1080p/Alto: a página mostra “≥ trava”, que é
  o máximo que a base afirma. Em outra configuração, fica sem dados.

### Fatores de resolução e preset

Os fatores vêm da página de metodologia da PCGameBenchmarks — não são os
antigos valores heurísticos do Reset Explode.

| Resolução | Fator |
|---|---:|
| 1080p | 1,00 |
| 1440p | 0,72 |
| 4K | 0,39 |

| Preset (relativo a Alto) | Fator |
|---|---:|
| Baixo | 1,5625 |
| Médio | 1,25 |
| Alto | 1,00 |
| Ultra | 0,8125 |

A fonte descreve os presets em relação a **Médio**: Baixo ≈ +25%, Alto ≈ 80%,
Ultra ≈ 65%. Como a coluna publicada é **Alto**, cada fator foi dividido por
0,80 para ficar relativo a ela.

### Trava de FPS

O valor final é limitado pela trava do motor do jogo e pelo teto de 360 FPS da
fonte. Quando o limite é atingido, a linha mostra `≥` e a explicação diz que o
número é um piso.

### CPU e limitador

A estimativa considera **apenas a GPU**. A CPU detectada aparece como
informação, mas não vira teto de FPS: a base pública não modela CPU por jogo, e
inventar um teto daria uma falsa impressão de diagnóstico. O limitador real
continua nas páginas **Gargalo** e **Overlay**, que medem o uso do hardware.

---

## 1% low

O 1% low **nunca é derivado do FPS médio**. Não existe uma proporção universal
entre os dois.

- Execução medida com 1% low → mostra o valor medido.
- Execução medida sem 1% low → mostra “Não disponível” e avisa.
- Estimativa → “Não disponível”, sempre.

O 1% low também não é o FPS mínimo: são métricas diferentes, e a página não as
mistura.

---

## Hardware

A GPU vem da detecção existente (`systeminformation` no Linux e no Windows).
O nome é normalizado removendo apenas palavras de fabricante (`NVIDIA`,
`GeForce`, `AMD`, `Radeon`, `Intel`); o resto é preservado, porque `Ti`,
`SUPER`, `Laptop`, `Max-Q` e a memória mudam o desempenho.

O casamento tenta, nesta ordem:

1. nome canónico exato;
2. o nome mais longo da tabela contido no nome detectado — é o que faz
   `AD104 [GeForce RTX 4070]` cair na 4070 sem confundir `RTX 4070 Ti SUPER`
   com `RTX 4070`.

Se a GPU não for encontrada, a página diz isso explicitamente e oferece uma
busca manual entre as 1.381 placas. A escolha manual:

- não altera a detecção do sistema;
- aparece identificada como manual;
- pode ser desfeita com **Voltar à detecção**.

Não existe índice padrão de GPU ou CPU. Sem correspondência, não há número.

---

## Níveis de confiança

| Nível | Quando aparece |
|---|---|
| **Alta** | Valor publicado para a GPU de referência exata em 1080p/Alto (sem trava), ou benchmark medido |
| **Média** | Interpolação entre referências em 1080p/Alto; valor publicado que atinge a trava |
| **Baixa** | Resolução ou preset ajustados por fator; extrapolação acima da GPU mais forte; curva totalmente travada |
| **Sem dados** | A base não sustenta uma previsão |

A confiança é qualitativa e descreve **o suporte dos dados**, não a margem de
erro. A fonte estima que seus valores ficam tipicamente a cerca de 30% do FPS
medido (mais em GPUs integradas).

---

## Limitações conhecidas

- **A base de estimativas é 1080p/Alto.** 1440p, 4K e outros presets são
  derivados por fatores globais, não medidos jogo a jogo.
- **Upscaling não é modelado.** A página oferece Nativo/Qualidade/Desempenho,
  mas a estimativa é de rasterização nativa; escolher DLSS/FSR não aumenta o
  número. O aviso aparece no cartão de resultado. A única exceção são as
  execuções medidas que usaram FSR Quality.
- **Ray tracing e geração de quadros não entram.**
- **A CPU não é considerada** na estimativa, só exibida.
- **A cobertura medida é mínima:** um jogo, uma GPU. Não é possível comparar
  marcas ou gerar médias por hardware.
- **Não há géneros na base.** A tabela mostra o ano de lançamento; filtros por
  género não existem porque o dado não existe.
- **A lista inicial é de 32 jogos em destaque.** A busca cobre os 17.230
  títulos; a lista inicial não é uma seleção de “melhores” nem tem relação com
  o hardware.
- **Títulos duplicados** (edições/relançamentos) foram resolvidos pelo ano mais
  recente; isso pode escolher uma versão diferente da que o usuário tem.
- **O hardware é o detectado pelo sistema.** Drivers, patches, mods, VRAM,
  RAM, cena e número de jogadores não são modelados.
- **Windows e Linux usam a mesma base e o mesmo código**; a diferença fica na
  detecção do hardware e nos privilégios de leitura, não nos FPS.

---

## Atribuição

Os dados foram **adaptados** ao formato interno do MyRGB (normalização de
nomes, resolução, preset e upscaling; deduplicação; agrupamento de execuções).
A autoria e a licença originais permanecem:

- **PCGameBenchmarks** — <https://pcgamebenchmarks.com> — dados em
  <https://github.com/emilioagustin83/pc-game-fps-dataset>, CC BY 4.0.
- **Open GPU Benchmarks** — <https://opengpubenchmarks.com> — API em
  <https://opengpubenchmarks.com/api/v1/official.json>, CC BY 4.0. Os textos do
  blog do projeto **não** estão cobertos pela licença e não foram usados.

A página **Fontes e licenças** repete os links e a versão de cada base dentro do
aplicativo. Veja também [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).
