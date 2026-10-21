# Zonas e perfis

Duas das decisões mais importantes do MyRGB moram aqui: **como as zonas da
placa são tratadas** e **como o seu trabalho é guardado**.

---

## O que é uma zona

Uma zona é um conjunto de LEDs que o controlador AURA USB sabe endereçar
separadamente. A placa que motivou o projeto (ASUS TUF GAMING B650M-E WIFI)
tem quatro:

| Zona | Tipo | O que é na prática |
|---|---|---|
| `mainboard` — *LEDs onboard* | fixo | os LEDs da placa: chipset, cobertura do I/O, logo |
| `argb0` — *Header ARGB 1* | endereçável | o primeiro header 5V de 3 pinos |
| `argb1` — *Header ARGB 2* | endereçável | o segundo header 5V |
| `argb2` — *Header ARGB 3* | endereçável | o terceiro header 5V |

As zonas **não são fixas no código**. O número de headers e a quantidade de
LEDs onboard são lidos da *tabela de configuração* do controlador, toda vez que
o programa abre o dispositivo. Trocar de placa não exige recompilar nada.

### Endereçável × fixo

| | Endereçável (5V ARGB, 3 pinos) | Fixo (onboard) |
|---|---|---|
| Cada LED tem seu próprio canal | sim | não — é um bloco de uma cor só |
| Quantos LEDs são | **você informa** | o hardware informa |
| Efeitos podem correr ao longo | sim | o efeito aparece na cor do bloco |

Os headers **RGB 12V de 4 pinos não são suportados** por este controlador — é
uma limitação do AURA USB, não do MyRGB. A maioria das placas ASUSmodernas tem
os dois tipos: use os de 5 V.

### A quantidade de LEDs

O controlador não conta os LEDs de um header: ele só sabe que existe um
header ali. Quantos LEDs você colocou nele é uma informação que só você tem.

Por isso é um campo numérico, por zona, com o padrão de **72** e o limite
técnico do hardware em **120** por canal.

O OpenRGB 1.0 faz exatamente o mesmo, pelo mesmo motivo — não é uma limitação
do MyRGB, é como o hardware é.

Uma zona com 0 LEDs é ignorada: nada é escrito naquele canal.

---

## O que cada zona guarda

Cada zona do perfil tem:

```jsonc
{
  "zoneId": "argb0",
  "enabled": true,          // liga e desliga a zona
  "name": "Frente da caixa", // opcional: o nome que você deu
  "ledCount": 72,           // quantos LEDs este header tem
  "effect": { … },          // o efeito desta zona
  "followZoneId": null      // quando preenchido, esta zona espelha outra
}
```

### `enabled`: desligar de verdade

Uma zona desligada **não é pulada** — ela é levada a preto explicitamente, LED
por LED. Se fosse apenas pulada, os LEDs ficariam com a última cor que
receberam, e a zona desligada continuaria acesa.

### `name`: o nome que você dá

O hardware só sabe dizer *o que* a zona é ("Header ARGB 1"). O nome que você
dá é o que ela é **para você** — "Frente da caixa", "Ventoinha da esquerda",
"Traseira".

- É um campo livre, de até 40 caracteres.
- Vale **por perfil**: o perfil "Gamer" pode chamar uma zona de "Frontal" e o
  perfil "Filme" de chamar de "Cinema".
- Campo em branco = voltar ao nome do hardware.
- Aparece no cartão de zonas, na pré-visualização, no seletor "Seguir zona" e
  na mensagem do "aplicar a todas".

### `followZoneId`: espelhar outra zona

Quando preenchido, a zona **não usa o próprio efeito**: ela usa o efeito da
zona apontada — mesmo padrão, mesma paleta, mesmos parâmetros. Alterar o
efeito na zona de origem muda nas duas.

O que continua independente: o ligado/desligado, a quantidade de LEDs e o
próprio nome.

É o jeito de manter duas ventoinhas sincronizadas sem duplicar o trabalho de
ajustar.

---

## Aplicar o mesmo efeito em todas as zonas

O botão **⇉ Aplicar a todas as zonas**, no topo da barra de zonas, copia o
efeito da zona selecionada para todas as outras.

**O que é copiado:** o padrão, a paleta e todos os parâmetros.

**O que não é copiado:**

| | Por quê |
|---|---|
| a quantidade de LEDs | descreve o que está conectado fisicamente |
| o ligado/desligado | cada zona pode querer ficar apagada |
| o nome | é seu, e cada zona tem o seu |
| o "seguir zona" | é desfeito: uma zona que espelha outra ignoraria a cópia |

Depois da cópia, as zonas que estavam seguindo outra voltam a ter o efeito
próprio — que agora é o mesmo da zona de origem.

Uma mensagem curta no canto da janela confirma a operação.

---

## Perfis

Um perfil é um arquivo JSON com tudo: as zonas, os efeitos, os gradientes e as
opções globais.

```
~/.config/my-rgb/profiles/Padrão.json      (Linux)
%APPDATA%\my-rgb\profiles\Padrão.json      (Windows)
```

O esquema é idêntico nos dois sistemas. **Copiar o arquivo de uma máquina para
a outra funciona** — é o mesmo formato, byte a byte.

### Como o salvamento funciona

O perfil é gravado **sozinho**, a cada alteração, com um atraso de 250 ms. O
atraso agrupa alterações seguidas: mexer num slider não gera uma escrita por
pixel de mouse.

Isso responde a pergunta mais comum sobre o programa: *"onde está o botão de
salvar?"*. Ele existe, mas faz outra coisa — ver abaixo.

### Salvar como…

Guarda a configuração atual em um **perfil novo**, com o nome que você digitar.

- O perfil novo passa a ser o perfil editado.
- O original **continua intacto**.
- Os dois aparecem no seletor.

É o botão "criar uma cópia com outro nome" — útil para guardar um estado que
funciona antes de mexer nas coisas.

### ✎ Renomear

Muda o nome do perfil atual. O arquivo antigo é apagado e o novo é escrito. O
perfil continua sendo o mesmo, com o mesmo conteúdo.

### O indicador de salvamento

O chip ao lado dos botões mostra a situação real:

| | |
|---|---|
| **✓ salvo** | tudo que você mudou está no disco |
| **● não salvo** | há mudanças que ainda não chegaram ao disco |

Ele é preciso, e não é só decorativo: o processo principal avisa a interface
quando a gravação acontece de fato (evento `profile:saved`), e o renderer só
limpa a flag quando não há nenhuma alteração em trânsito. Então o "✓ salvo"
significa que dá para fechar o programa sem perder nada.

No encerramento, um `flush()` garante que a última alteração seja gravada.

### Quais são as opções globais do perfil

| | Padrão | O que faz |
|---|---|---|
| `brightness` | 1 | brilho de todos os LEDs (0 a 1) |
| `speed` | 1 | multiplicador global de velocidade |
| `fps` | 30 | quadros por segundo |
| `outputEnabled` | true | se as luzes estão ligadas |

---

## Reconciliação: o que acontece quando o hardware muda

Toda vez que o programa abre o dispositivo, ele compara o perfil com o layout
que o hardware respondeu:

- **Zona nova no hardware** → entra no perfil, com os valores padrão.
- **Zona que sumiu** → some do perfil.
- **Zona que continua** → o efeito, o nome, a quantidade de LEDs e o "seguir
  zona" são preservados.
- **Perfil sem nenhuma zona** → é criado a partir do layout.

Isso quer dizer que você pode trocar a placa, ou trocar um header de fita,
sem perder o seu trabalho.

### A pastilha de LED é um ajuste, não uma leitura

Quando o layout é lido, o número de LEDs dos headers endereçáveis **não vem
do hardware** — não existe essa informação no protocolo. A reconciliação
mantém o valor que está no perfil (ou 72, se for a primeira vez). Por isso o
número sobrevive a todas as trocas de hardware.
