# Documentação do MyRGB

O MyRGB controla a iluminação RGB de placas ASUS com o controlador **AURA USB**
(`0b05:19af`) — **o mesmo programa, os mesmos efeitos, no Linux e no Windows**.

Esta pasta é a referência do projeto: como o programa funciona por dentro, o que
cada parte da interface faz, quais efeitos existem, como as zonas e os perfis se
comportam, e como desenvolver.

| Página | O que tem nela |
|---|---|
| [como-funciona.md](como-funciona.md) | A arquitetura, o protocolo HID, o motor de efeitos e a prova de paridade entre Linux e Windows |
| [funcionalidades.md](funcionalidades.md) | O programa tela por tela: barra superior, zonas, pré-visualização, efeitos, gradiente e parâmetros |
| [efeitos.md](efeitos.md) | O catálogo dos 50 efeitos, com todos os parâmetros e o que cada um faz |
| [zonas-e-perfis.md](zonas-e-perfis.md) | Zonas, quantidade de LEDs, nomes, o botão "aplicar a todas" e o workings de perfis |
| [windows.md](windows.md) | O passo a passo no Windows, o Armoury Crate e o diagnóstico de cintilação |
| [desenvolvimento.md](desenvolvimento.md) | A stack, os scripts, os testes, as ferramentas e como adicionar um efeito novo |

## Em uma página

O programa faz quatro coisas:

1. **Fala com o hardware.** Abre o controlador AURA USB por HID e escreve
   diretamente os valores RGB de cada LED. É uma implementação própria do
   protocolo, não um wrapper do OpenRGB — por isso o comportamento é idêntico
   nos dois sistemas operacionais.
2. **Desenha os quadros.** Um motor de efeitos gera, a cada quadro, a cor de
   cada LED. O motor é uma função pura de `(tempo, perfil)`: nenhum efeito usa
   `Math.random` nem lê o relógio.
3. **Mostra exatamente o que vai acontecer.** A pré-visualização consome o
   mesmo buffer de pixels que vai para os LEDs. O que você vê é o que acende.
4. **Guarda o seu trabalho.** Cada perfil é um JSON com as zonas, os efeitos,
   os gradientes e as configurações globais. O mesmo arquivo abre no Linux e
   no Windows.

## Por que dois sistemas operacionais ao mesmo tempo

O protocolo AURA USB é o mesmo em toda plataforma: são frames HID de 65 bytes
começando por `0xEC`. Não existe diferença de driver entre Linux e Windows
para esse controlador — existe, no máximo, diferença de permissão de acesso ao
dispositivo. Por isso o mesmo código, o mesmo motor e o mesmo arquivo de perfil
funcionam nos dois sistemas, e por isso dá para **provar** que funciona igual:
o MyRGB grava os quadros em disco e compara os arquivos byte a byte
(veja [como-funciona.md](como-funciona.md#prova-de-paridade-linux--windows)).

## Onde ficam os arquivos

| | Linux | Windows |
|---|---|---|
| Perfis | `~/.config/my-rgb/profiles/` | `%APPDATA%\my-rgb\profiles\` |
| Configurações | `~/.config/my-rgb/settings.json` | `%APPDATA%\my-rgb\settings.json` |

O formato é o mesmo: um arquivo JSON por perfil, com o mesmo esquema. Dá para
copiar um perfil de uma máquina para a outra.

## Mantendo esta documentação em dia

O catálogo de efeitos ([efeitos.md](efeitos.md)) é **gerado** a partir do
registro de padrões do código:

```bash
npm run docs        # regera documentation/efeitos.md
```

E `npm test` falha se o arquivo estiver desatualizado — não dá para adicionar
um efeito e esquecer de documentar. O mesmo vale para o índice desta pasta: o
teste confere que toda página aqui está listada e que nenhum link quebrou.
