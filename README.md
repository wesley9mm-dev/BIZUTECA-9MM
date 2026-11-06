# BIZUTECA 9MM

Anote. Organize. Revise. Domine.

Caderno pessoal de resumos, anotações e bizus para Windows, com biblioteca por matérias e consulta offline ao material salvo.

[![Baixar BIZUTECA 9MM para Windows](https://img.shields.io/badge/BAIXAR_PARA_WINDOWS-v1.1.0-2e7d32?style=for-the-badge)](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/download/v1.1.0-rc.42159833267.1/BIZUTECA-9MM-Portatil.exe)

**Windows 64 bits · Portátil · Sem instalação · Versão preliminar 1.1.0**

## Downloads para Windows

Todas as versões publicadas são **preliminares**, portáteis e para Windows de 64 bits. Baixe o executável da versão desejada e abra `BIZUTECA-9MM-Portatil.exe`.

| Versão | Novidades | Download direto | Detalhes |
| --- | --- | --- | --- |
| **1.1.0** · Mais recente | Abertura com a identidade oficial, calendário, melhorias no editor e backups `.b9mm`. | [Baixar .exe](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/download/v1.1.0-rc.42159833267.1/BIZUTECA-9MM-Portatil.exe) · [SHA-256](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/download/v1.1.0-rc.42159833267.1/SHA256.txt) | [Publicação](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/tag/v1.1.0-rc.42159833267.1) |
| **1.0.1** | Logotipo oficial e cache temporário separado da pasta do programa. | [Baixar .exe](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/download/preliminar-41948016045-1/BIZUTECA-9MM-Portatil.exe) | [Publicação](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/tag/preliminar-41948016045-1) |
| **1.0.0** | Primeira versão portátil publicada para Windows. | [Baixar .exe](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/download/preliminar-41943973547-1/BIZUTECA-9MM-Portatil.exe) | [Publicação](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/tag/preliminar-41943973547-1) |

Para atualizar, faça um backup, feche o Bizuteca e substitua o executável na mesma pasta. Preserve `BIZUTECA-Suporte` e a pasta da biblioteca. [Manual de atualização](docs/MANUAL.md)

[Histórico completo de publicações](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases)

## O que mudou na versão 1.1.0

- **Identidade visual.** Brasão oficial no programa e no ícone do Windows. A tela de abertura exibe o slogan e o crédito a Wesley9mm.
- **Navegação.** Botões Voltar e Avançar, caminhos de pastas clicáveis, seletor pesquisável e barra lateral redimensionável.
- **Editor.** Tabelas, sumário, busca na nota e ações para copiar, salvar e redimensionar imagens.
- **Calendário.** O próximo compromisso aparece na Home. Os eventos ficam salvos na biblioteca e entram nos backups.
- **Backups.** Exportação em `.b9mm`, leitura de `.bizuteca` e `.tvbackup`, importação que acrescenta conteúdo e restauração em uma pasta separada.

A compilação passou em 27 testes automatizados, no teste de interface e na abertura do executável final no Windows. [Relatório técnico](docs/RELATORIO-1.1.0.md) · [Resultados e capturas](https://github.com/wesley9mm-dev/BIZUTECA-9MM/actions/runs/42159833267)

## Recursos

- Navegação com histórico, caminhos clicáveis e seletor pesquisável.
- Editor de notas com tabelas, imagens, modos de edição e leitura e histórico de versões.
- Calendário local e próximo evento na Home.
- Pesquisa offline por conteúdo e enunciado.
- 36 temas e modelo TEC opcional com 2.165 pastas.
- Exportações em .b9mm, importação aditiva e backups automáticos.

## Código-fonte

`src/main.js` contém a integração com Electron; `src/core` reúne biblioteca, pesquisa e armazenamento; `src/renderer` contém a interface e os temas; `src/data/tec-folders.json` contém as pastas iniciais; `test` contém as verificações automatizadas.

Requer Node.js 24 e npm para desenvolvimento:

```powershell
npm install
npm test
npm start
```

Para gerar o executável portátil no Windows:

```powershell
npm run dist
```

O resultado fica em `dist/BIZUTECA-9MM-Portatil.exe`. O executável e as bibliotecas do Electron são gerados no processo de compilação; não são incluídos no histórico do código.

## Guia e testes

- [Manual de uso e atualização](docs/MANUAL.md)
- [Relatório técnico da versão 1.1.0](docs/RELATORIO-1.1.0.md)

## Dados pessoais

Bibliotecas de estudo, anexos pessoais, bancos de dados e backups de uso não fazem parte deste repositório. A pasta de dados é escolhida no aplicativo.

## Arquivos locais e compatibilidade

A logo oficial aparece no cabeçalho e no ícone do Windows. A versão portátil usa uma única pasta `BIZUTECA-Suporte` para configurações; uma biblioteca nova fica em `BIZUTECA-Suporte/dados` até você escolher outro local. Caches de sessão ficam na pasta temporária do Windows, com limpeza ao encerrar quando os arquivos já estão liberados pelo sistema.

Bibliotecas existentes continuam no local anterior. A versão reconhece o arquivo antigo `bizuteca-local.json` e grava a configuração nova em `BIZUTECA-Suporte/config.json`, mantendo a referência correta à biblioteca. A pasta antiga `perfil` e o arquivo antigo de configuração não são apagados automaticamente. Seus resumos e backups não são tratados como cache.
