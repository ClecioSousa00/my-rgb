# Notas de release

Cada versão pode ter um ficheiro `vX.Y.Z.md` nesta pasta, escrito no commit que
vai receber a tag. O job `publish` do
[release.yml](../.github/workflows/release.yml) usa-o como descrição da release
no GitHub.

Sem o ficheiro, o GitHub gera as notas (`--generate-notes`). Como o projeto
integra na `main` por merge, sem um pull request por versão, essas notas ficam
quase vazias — por isso as notas curadas são o caminho normal.

Um exemplo do resultado: a
[release v0.3.0](https://github.com/ClecioSousa00/my-rgb/releases/tag/v0.3.0).

Sugestão de estrutura (adaptar à versão):

```markdown
## Destaques

- ...

## Downloads

| Plataforma | Ficheiro |
|---|---|
| Windows x64 | `MyRGB-X.Y.Z-setup.exe` |
| Linux x64 (AppImage) | `MyRGB-X.Y.Z.AppImage` |
| Linux x64 (Debian/Ubuntu) | `my-rgb_X.Y.Z_amd64.deb` |

## Notas

- ...

**Changelog completo**: https://github.com/ClecioSousa00/my-rgb/commits/vX.Y.Z
```

O ficheiro fica só no repositório: não entra no pacote do aplicativo.
