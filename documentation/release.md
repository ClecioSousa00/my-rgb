# Publicar uma versão

Uma versão do MyRGB é uma **tag `vX.Y.Z` na `main`**. O workflow
[`.github/workflows/release.yml`](../.github/workflows/release.yml) constrói o
instalador NSIS (Windows) e o AppImage + deb (Linux), verifica os artefactos e
publica-os no GitHub Releases. O auto-update do aplicativo lê essa release.

## Antes de criar a tag

1. A versão em `package.json` tem de ser a mesma da tag. A tag `v0.3.0` exige
   `"version": "0.3.0"`.
2. O commit tem de estar na `main` e com o CI verde. O workflow recusa uma tag
   cujo commit não seja ancestral da `main` e volta a correr `typecheck`,
   `npm run test:ci` e `npm run build` naquele commit.
3. A tag tem de ser **estável**: `vX.Y.Z`, sem `-beta`/`-rc`. Os
   pré-lançamentos são recusados de propósito, porque uma release marcada como
   *latest* chegaria a todos os utilizadores pelo auto-update.
4. A tag tem de existir no GitHub (`git push origin v0.3.0`); o workflow usa
   `--verify-tag` e não cria tags.
5. **Opcional — notas curadas:** crie `release-notes/vX.Y.Z.md` nesse commit.
   O job `publish` usa esse ficheiro como descrição da release. Sem ele, o
   GitHub gera as notas automaticamente (`--generate-notes`), o que num
   repositório sem pull requests produz uma página quase vazia.

## O que acontece depois do push da tag

| Job | O que faz |
|---|---|
| `meta` | Confere o formato da tag, a versão do `package.json` e se o commit está na `main` |
| `verify` | `npm ci`, `typecheck`, `npm run test:ci` e `build` no commit da tag |
| `windows` | Publica o helper .NET x64, gera o NSIS, confere o helper e o `app-update.yml` dentro do pacote e escreve `SHA256SUMS-windows.txt` |
| `linux` | Gera AppImage + deb, confere o `latest-linux.yml` e escreve `SHA256SUMS-linux.txt` |
| `publish` | Confere os checksums, cria a release (ou substitui os assets numa re-execução), usa `release-notes/<tag>.md` quando existe e marca-a como *latest* |

Os jobs de build correm com `contents: read` e sem credenciais guardadas no
checkout. Só o `publish` recebe `contents: write`, e apenas dentro do
environment `release`. O `GITHUB_TOKEN` é efémero e limitado a este
repositório; não é usado nenhum PAT.

Cada build também gera uma **atestação de proveniência** (`actions/attest-build-provenance`),
que permite verificar que o ficheiro saiu deste workflow e deste commit.

## Configuração única no GitHub

Isto não é feito pelo workflow; tem de ser configurado uma vez no repositório:

1. **Environment `release`** — *Settings → Environments → New environment*.
   - Para publicação **automática**, deixe-o sem *Required reviewers*.
   - Para um **gate humano**, adicione-se como *Required reviewer*: o job de
     publicação fica parado até aprovar. (O GitHub cria o environment sem
     proteção na primeira execução, por isso configure-o antes de criar a
     primeira tag.)
2. **Proteção de tags** — *Settings → Rules → Rulesets → New tag ruleset*:
   - alvo `v*`;
   - restringir *creations*, *updates* e *deletions* a administradores.

   Isto impede que uma tag seja movida entre o build e a publicação.
3. **Branch protection na `main`** — já faz parte da regra do projeto: a `main`
   só recebe a `dev` testada. A tag deve ser criada depois do merge.

## Re-executar uma release

Se o build falhar ou for preciso substituir um asset:

- **Actions → Release → Run workflow**, indicando a tag existente; ou
  `gh workflow run release.yml -f tag=v0.3.0`.

O job `publish` deteta que a release já existe e faz `gh release upload
--clobber`, sem duplicar assets. A release é marcada outra vez como *latest*.

## Verificar um download

```bash
# checksums
sha256sum -c SHA256SUMS.txt

# proveniência (GitHub CLI 2.49+)
gh attestation verify MyRGB-0.3.0-setup.exe --repo ClecioSousa00/my-rgb
```

O `latest.yml` (Windows) e o `latest-linux.yml` (AppImage) trazem o `sha512` que
o `electron-updater` confere antes de instalar. Isso protege contra um download
corrompido, **não** contra uma release comprometida no GitHub — para isso é
preciso assinatura de código (abaixo).

## Assinatura de código (pendente)

As releases atuais saem **sem assinatura**. Consequências:

- O SmartScreen mostra "Windows protegeu o seu PC" no instalador.
- O `electron-updater` não consegue validar o *publisher* do `.exe`; a única
  verificação é o `sha512` do `latest.yml`.

O caminho escolhido é o **[SignPath Foundation](https://signpath.org/)**, que
assina gratuitamente projetos open source e tem uma GitHub Action própria.
Alternativa: **Azure Trusted Signing** (pago, integração directa com o
electron-builder). Quando o projeto for aceite:

1. Guardar os segredos do SignPath no environment `release` (nunca nos jobs de
   build, que não têm acesso a segredos).
2. Assinar o `MyRGB.exe` **antes** de o NSIS o empacotar e assinar também o
   instalador final. No electron-builder isto é feito com um *sign hook*
   (`win.sign`) ou com `signAndEditExecutable`.
3. Configurar `publisherName` no `electron-builder.yml` para o
   `electron-updater` validar a assinatura do instalador.
4. Voltar a publicar a versão assinada.

Até lá, a publicação automática continua a ser aceitável para um projeto
pessoal, mas cada release deve ser tratada como **não assinada** na página de
downloads.

## Linux

- **AppImage**: atualiza-se sozinho pelo `latest-linux.yml`.
- **deb**: não tem auto-update; o utilizador instala a versão nova com
  `dpkg -i`. O ficheiro é publicado na mesma release.

## Reverter uma versão

O `electron-updater` não faz downgrade automático. Para retirar uma versão má:

1. Marcar a release anterior como *latest*:
   `gh release edit <tag-anterior> --latest`.
2. Apagar (ou marcar como *prerelease*) a release má e a tag.
3. Quem já instalou a versão má tem de instalar manualmente a anterior.

## O que o workflow não faz

- Não altera a versão do `package.json`; isso é um commit na `dev` antes do
  merge para a `main`.
- Não instala o NSIS numa máquina limpa nem o executa; essa validação continua
  a ser manual (ver [desenvolvimento.md](desenvolvimento.md)).
- Não assina os binários (ver acima).
