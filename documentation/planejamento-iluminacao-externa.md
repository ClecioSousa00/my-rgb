# Planejamento — iluminação externa (OpenRGB, Razer e Corsair)

> **Estado: não implementado, e sem previsão.** Este documento existe para que
> a decisão de adiar fique registrada, e para que quem retomar o assunto saiba
> o motivo, o que já está pronto, o que falta e como terminar. O que já foi
> feito está no commit `0a946b2` (roteador de iluminação); o resto é plano.

Este é o restante da **Fase 8** do plano mestre
(`/home/developer/.opencode/plan/reset-explode-no-myrgb.md`), que traz as
funcionalidades do Reset Explode para o MyRGB. As fases 0 a 7 já estão no
código; esta é a única que mexe em hardware que o projeto nunca tocou.

---

## 1. O motivo

O MyRGB fala com **um** dispositivo: o controlador ASUS AURA USB
(`0b05:19af`). Tudo o que não estiver pendurado nele fica de fora — e num PC
comum isso é a maior parte das luzes.

- **Memória RAM com RGB, teclado, mouse, headset, cooler, ventoinhas e fitas
  ligadas em headers de outra marca não são controlados.** Quem tem esses
  componentes precisa manter Armoury Crate, iCUE ou Synapse abertos, cada um
  com a sua programação, e o resultado é um gabinete com metade das luzes
  sincronizadas e a outra metade fazendo outra coisa.
- **O efeito para na borda do controlador.** Um "respirar" configurado no
  MyRGB anima a placa-mãe e os headers ARGB, mas não a RAM que está a dois
  centímetros dela.
- **O Reset Explode original tinha esse recurso**, e o plano mestre previa a
  Fase 8 justamente para fechá-lo. Sem ela, o MyRGB é um controlador de AURA
  muito bom com um painel de diagnóstico em volta — não um controlador de
  iluminação do PC.

### Por que não agora

A decisão de adiar é consciente, e os motivos são técnicos:

1. **Custo alto para o ganho imediato.** São 6 a 9 dias de trabalho efetivo
   para três integrações e uma página nova, e nenhum usuário do MyRGB se
   beneficia disso se só tem o controlador AURA — que é exatamente o caso que
   o projeto atende hoje.
2. **Hardware de teste inexistente nesta máquina.** Só há um AURA aqui. Sem
   OpenRGB instalado, sem teclado Razer e sem iCUE, cada backend seria escrito
   "no escuro" e verificado por fixtures — o que é honesto, mas não é o mesmo
   que ver o LED acender.
3. **Dependência de software de terceiros que muda sozinho.** OpenRGB já está
   no protocolo 6 (não lançado) com mudanças de formato em relação ao 4/5;
   Chroma e iCUE trocam de SDK entre versões. Cada integração é uma superfície
   de manutenção permanente, não um código que se escreve uma vez.
4. **Risco de regressão no que funciona.** Dividir o controlador com o OpenRGB
   é o cenário clássico de cintilação. Hoje o app detecta conflito com Armoury
   Crate/Aura Sync; com um backend externo, essa lógica precisa cobrir também
   "outro programa tomou o AURA" antes de qualquer escrita.
5. **O roteador já foi entregue.** O trabalho caro e arriscado — tirar a
   escrita do motor e dar um lugar para o próximo backend — está pronto e
   testado. Adiar o resto não deixa dívida técnica: deixa uma porta aberta.

---

## 2. De onde se parte

O primeiro passo da Fase 8 está implementado (commit `0a946b2`):

| Peça | Onde | Estado |
|---|---|---|
| Roteador (throttle, acquire/release, isolamento de erro) | `src/main/light/router.ts` | pronto |
| Backend AURA | `src/main/light/backends/aura.ts` | pronto |
| Alvos de iluminação e migração implícita do perfil | `src/shared/features/light.ts` | pronto |
| `Profile.targets` opcional, versão 1 preservada | `src/shared/types.ts`, `store/profileStore.ts` | pronto |
| Motor escrevendo pelo roteador | `src/main/engine/engine.ts` | pronto |
| Testes (alvos, migração, regras do roteador, paridade do quadro) | `tests/light.test.ts`, `tests/output.test.ts` | 20 + 7 |

O que isso significa na prática: **acrescentar um backend não encosta no
motor**. Ele continua renderizando um quadro por zona; o roteador decide quem
recebe. Um backend novo é uma classe com quatro métodos (`available`,
`acquire`, `release`, `write`) e uma linha no registro.

---

## 3. O que a feature vai fazer

### 3.1 OpenRGB (Windows e Linux)

O OpenRGB tem um servidor TCP local (porta **6742** — "ORGB" no teclado de
telefone) com um protocolo binário próprio, documentado no repositório dele.
É o backend de maior alcance: cobre MSI, Gigabyte, ASUS, RAM, teclados, fitas
e o que mais o OpenRGB souber controlar.

- **Transporte:** `net.Socket` do Node, sem dependência nativa — coerente com
  a regra do projeto de não compilar nada além do `node-hid`.
- **Handshake:** negociar a versão do protocolo, apresentar-se com
  `SetClientName` ("MyRGB"), pedir a contagem de controladores e os dados de
  cada um (nome, zonas, LEDs, modos).
- **Escrita:** `UpdateZoneLEDs` por zona (ou `UpdateLEDs` quando o dispositivo
  não separa zonas), em modo direto. A ordem dos LEDs de cada zona vem do
  servidor; o MyRGB só preenche as cores.
- **Throttle:** `minIntervalMs` de ~40 ms por alvo. O OpenRGB não acompanha
  30 quadros por segundo em todos os dispositivos, e o roteador já sabe
  descartar o que chega cedo demais.
- **Descoberta:** a lista de dispositivos é do servidor. Se ele avisar que
  mudou (`DeviceListUpdated`), a lista é refeita; se a conexão cair, o backend
  fica indisponível e **os outros continuam**.
- **Conflito com o AURA:** se o OpenRGB listar o `0b05:19af`, ele já tomou o
  controlador. O roteador precisa **avisar e não escrever por cima**, com a
  mesma lógica que já existe em `src/main/platform/conflict.ts` para o
  Armoury Crate. Este é o item mais delicado da fase.

Resumo do protocolo (para quem for implementar; os nomes são os do SDK do
OpenRGB):

| Item | Valor |
|---|---|
| Porta padrão | 6742 |
| Cabeçalho | `"ORGB"` + device id (u32) + packet id (u32) + tamanho (u32) = 16 bytes |
| `RequestControllerCount` | 0 |
| `RequestControllerData` | 1 |
| `RequestProtocolVersion` | 40 |
| `SetClientName` | 50 |
| `UpdateLEDs` | 1050 (data: tamanho u32 + num_colors u16 + cores) |
| `UpdateZoneLEDs` | 1051 (data: tamanho u32 + zone_idx u32 + num_colors u16 + cores) |
| `SetCustomMode` | 1100 |
| `DeviceListUpdated` (servidor) | 100 |
| Cor | 4 bytes por LED (R, G, B, 0) |
| Strings | tamanho u16 + bytes com terminador nulo |

A versão a pedir deve ser a menor entre a do cliente e a do servidor
(**4** é a que o plano mestre fixa; 5 e 6 acrescentam campos que este uso não
precisa). O cliente precisa saber distinguir respostas por `packet id`, e o
servidor pode enviar pacotes que ninguém pediu — por isso o parser é por
comprimento declarado, nunca por "leu até o fim do buffer".

### 3.2 Razer Chroma

Não existe um caminho único; são dois, e nenhum é opcional:

- **Windows:** REST local em `127.0.0.1:54235`, com o token que o Chroma SDK
  instala junto com o Synapse. Depende do Synapse estar rodando.
- **Linux:** D-Bus do **OpenRazer** (`org.openrazer`), que exige o daemon
  instalado e o usuário no grupo certo.

Escopo mínimo: teclado, mouse e headset como **um alvo por zona lógica**
(`keyboard`, `mouse`, `headset`), com o mesmo efeito do MyRGB. Sem usar os
efeitos nativos do Chroma — o MyRGB entrega cores, como faz com o AURA.

A página precisa dizer **o que falta** quando o Synapse/OpenRazer não está
presente, em vez de mostrar um dispositivo que não responde.

### 3.3 Corsair iCUE

Só no Windows, e só pelo helper .NET que já existe: o SDK da Corsair é uma DLL
(`iCUESDK.x64.dll`) sem versão pública para Linux, então o caminho é
P/Invoke dentro do `helper/MyRgb.Helper`.

- O helper já fala JSON por linha e já é elevado sob demanda; ganha dois
  comandos, `corsair.devices` e `corsair.set`, sem mudar o transporte.
- Sem o iCUE instalado, o backend responde `available: false` e a página
  explica.
- No Linux, o cartão do Corsair aparece como "não suportado" — e é a verdade,
  não uma falha.

### 3.4 Página Integrações

Hoje é um `PagePlaceholder`. Vira uma página de cartões, um por backend:

- **Estado**: não instalado / detectado / conectado / erro (com o motivo).
- **Dispositivos e zonas**: nome do dispositivo, backend, quantidade de LEDs.
- **"Usar no MyRGB"**: cria o `LightTarget`, salva no perfil e a zona passa a
  aparecer no `ZoneRail`, agrupada por dispositivo e com o chip do backend.
- **Nada de botão mágico**: cada cartão diz o que instalar (OpenRGB aberto,
  Synapse, OpenRazer, iCUE) e o que acontece se não estiver.

Canais novos, no mesmo padrão dos outros: `light:devices`, `light:setTarget`,
`light:status` (com push quando um backend muda de estado).

### 3.5 Zonas, perfis e conflito

- Zonas externas entram no seletor de zonas e nos perfis como qualquer outra:
  efeito, paleta, "seguir zona" e o botão "aplicar a todas" funcionam igual,
  porque o motor não sabe de onde vem a zona.
- Um perfil salvo com backend externo e aberto numa máquina sem ele **não
  perde a configuração**: o alvo continua no arquivo e a zona aparece
  indisponível, com o motivo.
- O perfil continua na **versão 1**; `targets` já é opcional e a migração
  implícita já existe. Não há passo de migração a escrever.
- Conflito: OpenRGB/Armoury Crate com o AURA aberto → aviso na barra e na
  página, e nenhuma escrita AURA enquanto durar.

---

## 4. Decisões já tomadas

1. **Protocolo em Node puro**, sem libopenrgb nem binding nativo.
2. **O throttle é do backend**, não do motor: cada dispositivo tem o seu ritmo.
3. **Só o AURA é crítico.** Falha em backend externo vira aviso; o quadro
   continua e o motor não para.
4. **Ordem de entrega:** OpenRGB → Razer → Corsair → página Integrações. Cada
   backend é um commit isolado, e a página só entra quando houver o que
   mostrar nela.
5. **O usuário instala o software do fabricante.** O MyRGB detecta e explica;
   não baixa nem instala SDK.
6. **Sem escrita em disco por backend** e sem elevação nova: o Corsair herda o
   UAC do helper que já existe.
7. **Nada de efeitos nativos** dos outros softwares: o MyRGB entrega cores
   quadra a quadro, como faz com o AURA.

---

## 5. Critérios de aceite

- **AURA idêntico.** O `dump:frames` continua byte a byte igual; nenhum quadro
  do AURA muda de canal, ordem ou cor.
- **Mesmos frames nos outros backends.** OpenRGB e Razer recebem as cores que
  a pré-visualização mostra, na ordem da zona (com o atraso do throttle).
- **Um backend caído não derruba os outros.** Desligar o OpenRGB no meio de um
  efeito não para o motor nem apaga o AURA.
- **Perfil antigo abre sem alteração**, e perfil com backend ausente abre com
  aviso em vez de erro.
- **Conflito detectado antes de escrever**, com o mesmo aviso claro que existe
  hoje para o Armoury Crate.
- **Testes sem hardware e sem rede:** parser de pacotes OpenRGB com fixtures
  binárias, throttle, acquire/release, conflito e isolamento de erro.

---

## 6. Riscos

| Risco | Mitigação |
|---|---|
| O protocolo do OpenRGB muda (v5/v6) | Negociar versão no handshake e pedir a 4; o parser ignora campos que não conhece |
| O OpenRGB pode não estar aberto | Detectar a porta, mostrar "servidor não encontrado" e o que fazer |
| OpenRGB tomou o AURA | Conflito visível e bloqueio da escrita AURA, como já é feito com o Armoury Crate |
| Throttle muda a fase do efeito entre dispositivos | Aceito e documentado: a cor é a mesma, o instante pode diferir em dezenas de ms |
| Chroma/iCUE exigem software proprietário | Cartão com estado "não instalado" e instrução, nunca erro genérico |
| Sem hardware para validar | Fixtures + testes puros agora; validação manual registrada no README quando alguém tiver o dispositivo |
| Escopo cresce (modos, efeitos, matrizes) | Fora de escopo: só cores diretas por zona |

---

## 7. Esforço estimado

| Etapa | Dias | Entrega |
|---|---|---|
| OpenRGB: cliente, parser, zonas, throttle, conflito | 3–4 | Backend utilizável, testes com fixtures |
| Razer: REST (Windows) + OpenRazer (Linux) | 2–3 | Dois caminhos, com detecção |
| Corsair: comandos no helper + P/Invoke | 1–2 | Só Windows, sem iCUE = indisponível |
| Página Integrações + IPC + docs | 1–2 | Cartões, "usar no MyRGB", capturas |

Total: **6–9 dias**, como no plano mestre.

---

## 8. Fora de escopo

- FPS no Linux (MangoHud/gamescope) — assunto da fase do overlay.
- Temperaturas e ventoinhas no Windows pelo helper — pendente de outra fase.
- Sincronizar os efeitos nativos do iCUE/Synapse/OpenRGB.
- Dispositivos OpenRGB em outra máquina da rede (o protocolo permite; o
  produto não precisa).
- Configurar zonas/matrizes do OpenRGB: o MyRGB usa o que o servidor informa.

---

## 9. Como retomar

1. Ler `src/main/light/router.ts`, `src/shared/features/light.ts` e
   `tests/light.test.ts` — é o contrato inteiro, e ele já está testado.
2. Criar `src/main/light/backends/openrgb.ts` implementando `LightBackend`
   (`critical: false`, `minIntervalMs: 40`).
3. Registrar em `src/main/index.ts` ao lado do `AuraBackend`, sem tocar no
   motor.
4. Testar o parser com fixtures binárias (nada de socket nos testes) e o
   conflito com um `AuraUsbDevice` falso.
5. Só então IPC (`light:*`), página Integrações e documentação
   ([funcionalidades.md](funcionalidades.md), [desenvolvimento.md](desenvolvimento.md)).
6. `npm run typecheck && npx vitest run && npm run build` antes de cada commit.

O roteador aceita um backend novo sem nenhuma alteração no motor: se em algum
momento for preciso mexer em `engine.ts` para encaixar um backend, é sinal de
que a divisão está sendo furada — vale parar e reavaliar.

### Referências

- [OpenRGB SDK documentation](https://github.com/CalcProgrammer1/OpenRGB/blob/master/Documentation/OpenRGBSDK.md) — o protocolo descrito acima.
- [OpenRazer](https://openrazer.github.io/) — daemon D-Bus usado no Linux.
- [Corsair iCUE SDK](https://github.com/CorsairOfficial/cue-sdk) — a DLL do helper.
- Plano mestre: `/home/developer/.opencode/plan/reset-explode-no-myrgb.md` (§5, Fase 8; §3.4).
- Commit do roteador: `0a946b2`.
