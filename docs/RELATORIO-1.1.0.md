# Validação do Bizuteca 9MM 1.1.0

A atualização partiu da revisão `32976b0e21bf0ff137f4231956e25337df77aca9`. O aplicativo mantém uma biblioteca SQLite local, com os 36 temas, e cria uma cópia do banco antes da migração de uma biblioteca existente.

## Mudanças

- Abertura com a arte oficial sem barra fictícia e brasão oficial como ícone. A interface confirma quando está pronta.
- Histórico de navegação, caminhos de pastas clicáveis, seletor pesquisável e barra lateral redimensionável.
- Editor com ferramentas de formatação, tabelas, modelos, símbolos, leitura, busca na nota, navegação pelos títulos e ações para copiar, salvar e redimensionar imagens.
- Calendário local com próximo evento na Home. Os eventos entram nos pacotes e na restauração.
- Bibliotecas novas começam vazias. O modelo TEC é opcional e mantém 2.165 pastas com as hierarquias identificadas corrigidas.
- Exportações em `.b9mm`, leitura dos formatos anteriores, importação aditiva e restauração preparada em outra pasta. Backups automáticos preservam até sete cópias diárias, quatro semanais e três mensais. O usuário pode indicar um destino adicional.

## Testes locais

27 testes automatizados de núcleo passaram. Os testes de interface executados no Windows com uma cópia isolada do runtime local passaram pela abertura, seletor de pastas, histórico, editor, área de transferência nativa, exportação de imagem, calendário, importação legada, restauração e busca em janela compacta. Os dados usados eram sintéticos. Os testes locais adicionais confirmaram a persistência após reabrir, a rejeição de um pacote danificado sem trocar a biblioteca ativa e a presença de uma nota antiga na cópia prévia à migração.

A inclusão e exclusão de linhas e colunas foi implementada para tabelas simples. Os 36 temas foram aplicados na interface local de teste, com a nota de exemplo preservada. Os testes de retenção usaram pastas locais. A operação em pendrive físico e a colagem em aplicativos externos específicos ficaram fora da validação. O guia de atualização está no [manual](MANUAL.md).

## Compilação Windows

O GitHub Actions passou nos 27 testes, executou os cenários de interface na aplicação empacotada e abriu o arquivo portátil final em uma biblioteca vazia. As capturas de teste e o checksum SHA-256 acompanham a compilação. [Execução no GitHub](https://github.com/wesley9mm-dev/BIZUTECA-9MM/actions/runs/42159833267).

## Referências técnicas

- [Electron — webContents e menu de contexto](https://www.electronjs.org/docs/latest/api/web-contents)
- [Electron — Clipboard](https://www.electronjs.org/docs/latest/api/clipboard)
- [Electron — NativeImage](https://www.electronjs.org/docs/latest/api/native-image)
- [Tiptap — Regras de colagem](https://tiptap.dev/docs/editor/api/paste-rules)
- [Joplin — Editor de texto rico](https://joplinapp.org/help/apps/rich_text_editor/)
- [Obsidian — Estrutura da nota](https://help.obsidian.md/plugins/outline)
