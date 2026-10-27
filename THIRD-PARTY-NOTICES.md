# Avisos de terceiros

O MyRGB é distribuído sob a licença MIT — veja [LICENSE](LICENSE).

Este arquivo reúne o que veio de fora: a lógica derivada de outro projeto, o
texto da licença dela e as dependências que o aplicativo carrega em execução.

---

## Reset Explode

Partes da lógica de diagnóstico, o catálogo de jogos e as fórmulas de
estimativa derivam do Reset Explode
(<https://github.com/GustavoReset/ResetExplode>), MIT © 2026 Gustavo.

Nada foi copiado como binário: a lógica foi reescrita em TypeScript (no
processo principal) e em C# (no helper do Windows). Os arquivos que carregam
essa lógica têm o aviso no cabeçalho:

| Arquivo | O que veio de lá |
|---|---|
| `src/main/features/games/catalog.ts` | O catálogo dos 32 jogos, os índices de GPU/CPU e a fórmula `min(gpu, cpu, cap)` |
| `src/main/features/games/index.ts` | O casamento entre o nome do hardware e a chave do catálogo |
| `src/main/features/games/howManyFps.ts` | A chave de cache `cpu\|gpu\|game\|resolution\|upscaling`, o TTL de 7 dias e o formato das respostas |
| `src/main/features/bottleneck/classify.ts` | A ordem das regras do limitador, os limites e os textos |
| `src/main/features/bottleneck/sample.ts` | A escolha de qual leitura alimenta cada regra |
| `src/main/features/bottleneck/session.ts` | A distribuição do relatório de sessão |
| `src/main/features/health/verdict.ts` | Os limites do veredito de disco |
| `src/main/features/network/verdict.ts` | A árvore de decisão do veredito de rede |
| `src/main/features/network/ping.ts` | A leitura do `ping` do sistema e o piso de 1 ms |
| `src/main/features/network/speed.ts` | Os endpoints e o método de medição (`speed.cloudflare.com`) |

### Texto da licença do Reset Explode

```
MIT License

Copyright (c) 2026 Gustavo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Dependências em execução

O pacote leva só o que o aplicativo usa em tempo de execução. Cada uma mantém
o próprio texto de licença dentro do pacote instalado.

| Pacote | Versão | Licença |
|---|---|---|
| [Electron](https://github.com/electron/electron) | 45.x | MIT |
| [node-hid](https://github.com/node-hid/node-hid) | 3.4.x | MIT **ou** X11 |
| [systeminformation](https://github.com/sebhildebrandt/systeminformation) | 5.33.x | MIT |
| [electron-updater](https://github.com/electron-userland/electron-builder) | 6.8.x | MIT |
| [React](https://github.com/facebook/react) / React DOM | 19.3.x | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 4.3.x | MIT |
| [zustand](https://github.com/pmndrs/zustand) | 5.0.x | MIT |
| [Microsoft.Diagnostics.Tracing.TraceEvent](https://github.com/microsoft/perfview) (helper .NET) | 3.2.x | MIT |

Ferramentas de build (TypeScript, Vite, electron-vite, electron-builder,
vitest) são MIT e não são redistribuídas — ficam no repositório, não no
instalador.

## Protocolo e nomes de terceiros

- O mapa de canais do AURA USB segue o driver `AuraUSBController` do
  [OpenRGB](https://gitlab.com/CalcProgrammer1/OpenRGB) (GPL-2.0). Só o
  **comportamento do protocolo** foi reimplementado a partir da documentação
  pública e da observação do dispositivo; nenhum código do OpenRGB foi
  copiado nem linkado.
- As tabelas de FPS de referência citam nomes de jogos, fabricantes e modelos
  de hardware que são marcas dos respectivos donos, usados apenas para
  identificação.
- O helper do Windows lê eventos ETW do próprio sistema; não inclui o
  PresentMon da Intel.
