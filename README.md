# BIZUTECA 9MM

Anote. Organize. Revise. Domine.

Caderno pessoal de resumos, anotações e bizus para Windows, com biblioteca por matérias e consulta offline ao material salvo.

## Recursos do código atual

- Pastas e subpastas: estrutura inicial do TEC com 16 matérias e 2.165 pastas.
- Editor de anotações com formatação, favoritos, lixeira e versões recuperáveis.
- Pesquisa e consulta por enunciado para localizar e abrir anotações; não gera gabaritos.
- Seleção da pasta de dados, exportação, importação e cópias de segurança.
- 36 temas, sem animações.

## Baixar o programa

As compilações de Windows ficam em [Releases](https://github.com/wesley9mm-dev/BIZUTECA-9MM/releases). Baixe `BIZUTECA-9MM-Portatil.exe`. A geração depende da conclusão do fluxo de compilação em [Actions](https://github.com/wesley9mm-dev/BIZUTECA-9MM/actions).

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

Os 15 testes do núcleo passaram em 04/11/2026, incluindo organização, notas, lixeira, versões, pesquisa, pacotes de backup, estrutura do TEC e temas. O teste de interface em `test/e2e.cjs` ainda apresentou falha ao iniciar o Electron no ambiente local; portanto, a abertura e o funcionamento visual do executável ainda precisam de validação. O fluxo do GitHub executa os testes do núcleo antes de gerar a versão preliminar.

## Dados pessoais

Bibliotecas de estudo, anexos pessoais, bancos de dados e backups de uso não fazem parte deste repositório. A pasta de dados é escolhida no aplicativo.
