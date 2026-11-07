# Formato de exportação de perfil — `.myrgb.json`

> **Versão do formato:** 1  
> **Extensão sugerida:** `.myrgb.json`  
> **Envelope:** nenhum — o ficheiro é o próprio objeto `Profile` da versão 1.

O MyRGB guarda perfis como ficheiros JSON simples na pasta `profiles/` do
diretório de dados do utilizador. O mesmo ficheiro funciona no Linux e no
Windows: basta copiá-lo de um para o outro.

## Esquema

```json
{
  "version": 1,
  "name": "Padrão",
  "zones": [
    {
      "zoneId": "argb0",
      "enabled": true,
      "name": "Frente da caixa",
      "ledCount": 72,
      "effect": {
        "patternId": "wave",
        "paletteId": "rainbow",
        "params": {
          "rate": 1,
          "wavelength": 16,
          "amplitude": 1,
          "sharpness": 0
        }
      },
      "followZoneId": null
    }
  ],
  "palettes": [
    {
      "id": "arco-iris",
      "name": "Arco-íris",
      "interpolation": "hsv",
      "stops": [
        { "position": 0, "color": "#ff0040" },
        { "position": 0.25, "color": "#ffd000" },
        { "position": 0.5, "color": "#00ff66" },
        { "position": 0.75, "color": "#00c8ff" },
        { "position": 1, "color": "#ff0040" }
      ]
    }
  ],
  "global": {
    "brightness": 1,
    "speed": 1,
    "fps": 30,
    "outputEnabled": true,
    "applyToAllZones": false
  },
  "targets": [
    {
      "id": "aura:argb0",
      "backend": "aura",
      "deviceId": "aura",
      "zoneIndex": 0,
      "label": "LEDs onboard",
      "ledCount": 72,
      "enabled": true
    }
  ]
}
```

## Campos de nível superior

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `version` | `1` | sim | Versão do esquema. Só `1` é aceito; qualquer outro valor rejeita a importação. |
| `name` | string | sim | Nome do perfil, como aparece no seletor. |
| `zones` | array | sim | Uma entrada por zona do controlador. |
| `palettes` | array | sim | Pelo menos uma paleta; sem ela o importador usa as 12 paletas embutidas. |
| `global` | objeto | sim | Configurações globais: brilho, velocidade, FPS, outputEnabled. |
| `targets` | array | não | Onde cada zona é escrita. Ausente = alvos AURA são sintetizados pelo hardware ao abrir. |

## Zona

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `zoneId` | string | sim | Identificador da zona (`argb0`, `mainboard`, ...). Único dentro do perfil. |
| `enabled` | boolean | sim | Zona ligada ou desligada. |
| `name` | string | não | Nome que o usuário deu à zona. Vazio = nome do hardware. |
| `ledCount` | número | sim | Quantidade de LEDs da zona. No AURA USB o hardware não informa; é configurável. |
| `effect` | objeto ou `null` | sim | Efeito da zona. `null` só faz sentido com `followZoneId` preenchido. |
| `followZoneId` | string ou `null` | sim | Zona cuja cópia esta zona espelha. `null` = efeito próprio. |

### Efeito

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `patternId` | string | sim | Identificador do padrão (`wave`, `chase`, `aurora`, ...). |
| `paletteId` | string | sim | Identificador da paleta usada. |
| `params` | objeto | sim | Parâmetros do padrão, chave → valor (número, string ou booleano). |

## Paleta

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | sim | Identificador da paleta. Único dentro do perfil. |
| `name` | string | sim | Nome exibido no seletor de gradientes. |
| `interpolation` | `"rgb"` \| `"hsv"` | sim | Espaço de cor da interpolação. |
| `stops` | array | sim | Pelo menos uma parada. Ordenada por posição. |

### Parada de paleta

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `position` | número (0 a 1) | sim | Posição no gradiente. |
| `color` | string | sim | Cor em formato hex (`#rrggbb` ou `#rgb`). |

## Configurações globais

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `brightness` | número (0 a 1) | sim | Multiplicador de intensidade de todos os LEDs. |
| `speed` | número (0.05 a 10) | sim | Multiplicador de velocidade de todos os efeitos. |
| `fps` | número inteiro (1 a 240) | sim | Quadros por segundo do motor de efeitos. |
| `outputEnabled` | boolean | sim | Quando falso, o motor renderiza mas não escreve no hardware. |
| `applyToAllZones` | boolean | não | Aplica mudanças de efeito a todas as zonas de uma vez. |

## Targets (opcional)

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `id` | string | sim | Identificador do alvo (`aura:argb0`, ...). Único. |
| `backend` | string | sim | Backend de iluminação (`aura`, `openrgb`, `razer`, `corsair`). |
| `deviceId` | string | sim | Identificador do dispositivo dentro do backend. |
| `zoneIndex` | número inteiro ≥ 0 | sim | Índice da zona dentro do dispositivo. |
| `label` | string | sim | Nome exibido do alvo. |
| `ledCount` | número inteiro ≥ 0 | sim | Quantidade de LEDs do alvo. |
| `enabled` | boolean | sim | O alvo participa da saída ou não. |

## Regras de importação

O importador (`validateImportedProfile`) é defensivo: nada do ficheiro externo é
confiado cegamente.

1. `version` deve ser `1`; caso contrário o ficheiro é rejeitado.
2. `zones` e `palettes` devem ser arrays; caso contrário é rejeitado.
3. `global` deve ser um objeto; caso contrário é rejeitado.
4. Nomes duplicados de zona/paleta são descartados (fica a primeira ocorrência).
5. Paradas de paleta sem posição ou cor válida são descartadas; uma paleta sem
   paradas válidas é substituída pelas paletas embutidas.
6. Parâmetros de efeito que não são número, string ou booleano são ignorados.
7. Um `patternId` que não existe faz o efeito voltar para `null` (zona sem efeito).
8. Um `paletteId` que não existe faz o efeito usar a primeira paleta do perfil.
9. Targets com backend desconhecido ou `zoneIndex` negativo são descartados.
10. Se um perfil com o mesmo nome já existe, o importado recebe um sufixo
    (`"Nome (2)"`) — nunca sobrescreve um perfil existente sem confirmação.

## Paridade Linux ↔ Windows

O esquema é idêntico nos dois sistemas. Um ficheiro exportado no Windows abre
no Linux sem conversão, e vice-versa. O único campo específico de plataforma
é `targets.backend` (`aura` hoje; `openrgb`, `razer` e `corsair` ficam para o
futuro) — e esse campo é opcional.

## Exemplo mínimo válido

```json
{
  "version": 1,
  "name": "Mínimo",
  "zones": [
    {
      "zoneId": "argb0",
      "enabled": true,
      "ledCount": 72,
      "effect": {
        "patternId": "solid",
        "paletteId": "monocromatico",
        "params": {}
      },
      "followZoneId": null
    }
  ],
  "palettes": [
    {
      "id": "monocromatico",
      "name": "Monocromático",
      "interpolation": "rgb",
      "stops": [
        { "position": 0, "color": "#000000" },
        { "position": 1, "color": "#ffffff" }
      ]
    }
  ],
  "global": {
    "brightness": 1,
    "speed": 1,
    "fps": 30,
    "outputEnabled": true
  }
}
```

## Como exportar e importar na interface

- **Exportar:** não há botão de exportação dedicado hoje; o ficheiro de perfil
  está em `profiles/<nome>.json` dentro da pasta de dados da aplicação
  (`~/.config/my-rgb/` no Linux, `%APPDATA%\my-rgb\` no Windows). Copie-o para
  compartilhar.
- **Importar:** use a opção de importar perfil na barra superior; o importador
  valida e nunca sobrescreve um perfil existente.
