# BIZUTECA 9MM

Anote. Organize. Revise. Domine.

Caderno pessoal de resumos, anotações e bizus para Windows, com biblioteca por matérias e consulta offline ao material salvo.

[![Baixar BIZUTECA 9MM para Windows](https://img.shields.io/badge/BAIXAR_PARA_WINDOWS-v1.0.1-2e7d32?style=for-the-badge)](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/download/preliminar-41948016045-1/BIZUTECA-9MM-Portatil.exe)

**Windows 64 bits · Portátil · Sem instalação · Versão preliminar 1.0.1**

## Recursos do código atual

- Pastas e subpastas: estrutura inicial do TEC com 16 matérias e 2.165 pastas.
- Editor de anotações com formatação, favoritos, lixeira e versões recuperáveis.
- Pesquisa e consulta por enunciado para localizar e abrir anotações; não gera gabaritos.
- Seleção da pasta de dados, exportação, importação e cópias de segurança.
- 36 temas, sem animações.

## Baixar o programa

Clique no botão **BAIXAR PARA WINDOWS** acima ou use o [download direto do executável](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases/download/preliminar-41948016045-1/BIZUTECA-9MM-Portatil.exe). Depois, abra `BIZUTECA-9MM-Portatil.exe`.

Para compartilhar, envie esta página: **https://github.com/wesley9mm-dev/BIZUTECA-9MM**. O download contém o programa; seus resumos e dados pessoais não são incluídos.

Outras versões ficam em [Releases](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases).

As versões são marcadas como preliminares enquanto a validação visual e a abertura do executável não forem concluídas. Antes de usar com material importante, confirme o salvamento e a reabertura usando uma biblioteca de teste. Feche o programa antes de ejetar o pendrive e mantenha um backup em outro dispositivo.

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

## Estado da validação

Os 20 testes automatizados passaram em 04/11/2026, incluindo organização, notas, lixeira, versões, pesquisa, pacotes de backup, estrutura do TEC, temas, separação do cache e compatibilidade da configuração antiga. O teste de interface em `test/e2e.cjs` ainda apresentou falha ao iniciar o Electron no ambiente local; portanto, a abertura e o funcionamento visual do executável ainda precisam de validação. O fluxo do GitHub executa os testes do núcleo antes de gerar a versão preliminar.

## Dados pessoais

Bibliotecas de estudo, anexos pessoais, bancos de dados e backups de uso não fazem parte deste repositório. A pasta de dados é escolhida no aplicativo.

## Atualização 1.0.1: logo e arquivos internos

A logo oficial aparece no cabeçalho e no ícone do Windows. A versão portátil usa uma única pasta `BIZUTECA-Suporte` para configurações; uma biblioteca nova fica em `BIZUTECA-Suporte/dados` até você escolher outro local. Caches de sessão ficam na pasta temporária do Windows, com limpeza ao encerrar quando os arquivos já estão liberados pelo sistema.

Bibliotecas existentes continuam no local anterior. A versão reconhece o arquivo antigo `bizuteca-local.json` e grava a configuração nova em `BIZUTECA-Suporte/config.json`, mantendo a referência correta à biblioteca. A pasta antiga `perfil` e o arquivo antigo de configuração não são apagados automaticamente. Seus resumos e backups não são tratados como cache.
