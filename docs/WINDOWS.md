# MyRGB no Windows

O Windows precisa de um passo extra que o Linux não precisa: **desligar o
Armoury Crate / Aura Sync**.

## Por que isso é necessário

O Armoury Crate instala um serviço (`LightingService`) que fica com o
controlador AURA USB e escreve frames nele continuamente. O MyRGB escreve
frames no mesmo dispositivo. Dois escritores no mesmo controlador = o
hardware alterna entre os dois conjuntos de cores, e você vê **cintilação**.

Não dá para dividir o controle por zonas: o protocolo não tem arbitragem, e o
serviço do Armoury Crate volta a escrever o canal inteiro assim que ele
percebe a atividade.

A solução é desligar a iluminação do Armoury Crate e deixar o MyRGB como
único dono do controlador.

## Passo a passo

### 1. Instalar o MyRGB

Execute `MyRGB-<versão>-setup.exe`. O instalador é NSIS e não exige
administrador por padrão (instala na sua pasta de usuário).

### 2. Desligar a iluminação do Armoury Crate

1. Abra o **Armoury Crate**.
2. Entre em **Dispositivos → AURA**.
3. Em cada dispositivo com iluminação, selecione **Todos desligados**
   (*All off*).
4. Feche o Armoury Crate.

> Se você nunca usa o Armoury Crate, pode desinstalá-lo. Mas atenção: outros
> recursos dele (perfis de ventoinha, overclock) dependem de serviços
> próprios — o que o MyRGB precisa desligar é só a *iluminação*.

### 3. Desligar o serviço de iluminação (recomendado)

Para evitar que o Armoury Crate reative a iluminação sozinho, encerre o
serviço de iluminação. Abra um **PowerShell como Administrador**:

```powershell
Get-Service | Where-Object { $_.Name -like "*Lighting*" -or $_.DisplayName -like "*Aura*" }
```

Se aparecer um serviço `LightingService` (ou `AsusOptimization`), pare-o e
desabilite a inicialização automática:

```powershell
Stop-Service -Name LightingService
Set-Service -Name LightingService -StartupType Disabled
```

> O nome exato do serviço varia entre versões do Armoury Crate. O comando
> acima lista o que existe na sua máquina.

Se preferir não desabilitar o serviço, basta matá-lo antes de abrir o MyRGB:

```powershell
Stop-Process -Name LightingService -Force -ErrorAction SilentlyContinue
```

### 4. Manter a opção AURA da BIOS ligada

O BIOS precisa continuar com a iluminação por AURA habilitada (o padrão da
placa). Se a opção estiver desligada, o hardware não acende os LEDs mesmo
recebendo frames.

Na sua placa: **Advanced → Onboard Devices → Aura** (o nome exato varia).

### 5. Conferir

Abra o MyRGB. A barra superior deve mostrar o firmware do controlador e o
status **sem** a etiqueta de conflito.

A checagem de conflito roda o tempo todo (a cada 5 segundos), então se você
abrir o Armoury Crate depois de o MyRGB estar rodando, a etiqueta
**conflito** aparece na barra superior sem precisar reiniciar nada.

---

## Diagnóstico

### Está cintilando

1. Confira se o serviço de iluminação está parado:
   ```powershell
   Get-Process LightingService -ErrorAction SilentlyContinue
   ```
2. Se aparecer, o Armoury Crate ainda está no comando. Encerre-o.
3. Se não aparecer e ainda houver cintilação, provavelmente outro programa
   está mexendo (iCUE, RGB Fusion, um overlay). O MyRGB mostra um aviso
   "conflito" na barra superior quando detecta processos conhecidos.

### O MyRGB não encontra o dispositivo

- Verifique com o Gerenciador de Dispositivos que o "AURA LED Controller"
  aparece. Em `Gerenciador de Dispositivos → Controladoras de bus USB`, ele
  lista como dispositivo USB com o ID `VID_0B05&PID_19AF`.
- Feche o Armoury Crate completamente (ícone na bandeja) e tente de novo — ele
  pode manter o handle do dispositivo aberto.
- Reinicie o Windows depois de instalar: às vezes o serviço de iluminação
  precisa ser reiniciado para liberar o dispositivo.

### As luzes não acendem, mas o MyRGB diz que está conectado

- A opção AURA da BIOS pode estar desligada.
- Se a sua placa tem headers **12V RGB** (4 pinos, não endereçável) em vez de
  **5V ARGB** (3 pinos), esses headers **não** são suportados por este
  controlador — o AURA USB só controla os endereçáveis e os LEDs onboard.
  Seu controlador reporta 2 headers 12V e 3 headers 5V, então use os 5V.

### Como confirmar que é o MyRGB controlando

Use a ferramenta de dump de frames — ela não depende do que está rodando:

```powershell
MyRGB.exe --dump-frames frames-windows --dump-count 60
```

E compare com o dump do Linux:

```powershell
node tools\compare-frames.mjs frames-linux frames-windows
```

O resultado esperado é `IDENTICAL: 60 frames match byte for byte`.

---

## Instalação em modo portável

O instalador NSIS é opcional. Para uma instalação sem registro, extraia o
`.exe` gerado pelo electron-builder com o 7-Zip e rode o `MyRGB.exe` de
dentro da pasta extraída. O autostart e a bandeja funcionam igual.
