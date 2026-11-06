# BIZUTECA 9MM — NOTA TÉCNICA DE ATUALIZAÇÃO v1.3.0

**Tipo:** especificação para implementação por IA/desenvolvedor  
**Versão de referência:** v1.2.0  
**Próxima versão planejada:** v1.3.0  
**Data de elaboração:** 06/11/2026  
**Status:** PLANEJADO — NÃO IMPLEMENTADO  
**Repositório:** https://github.com/wesley9mm-dev/BIZUTECA-9MM

## 1. OBJETIVO

Corrigir e tornar confiáveis a importação, a exportação e a restauração de bibliotecas e anotações; preservar todos os dados, anexos e recursos de edição; implementar uma opção segura de **RESTAURAR PADRÃO DE FÁBRICA**. A versão v1.3.0 deve priorizar integridade, compatibilidade, recuperação após falhas e testes reais.

**IMPORTANTE PARA A IA EXECUTORA:** Este documento é uma lista de requisitos, não um relato de alterações já executadas. Antes de modificar arquivos, confira o estado atual da branch principal, examine os pontos referenciados e adapte a implementação ao código efetivamente encontrado. Não considere nenhum defeito corrigido sem teste demonstrável.

## 2. REGRAS INEGOCIÁVEIS

1. Não apagar, sobrescrever nem recriar silenciosamente a biblioteca do usuário (`biblioteca.db`), as pastas ou os anexos.
2. Não alterar o visual geral, a identidade, as cores, o logotipo ou o slogan oficial **“Anote. Organize. Revise. Domine.”**, exceto pelos controles necessários à atualização.
3. Manter o suporte ao formato principal **`.b9mm`** e à importação dos formatos legados **`.bizuteca`** e **`.tvbackup`**, quando seu conteúdo for compatível. A extensão não define, sozinha, a validade: conferir assinatura, formato, versão, estrutura e integridade.
4. Não criar um segundo banco permanente para o funcionamento normal. Arquivos temporários de validação, instantâneos e cópias de segurança são permitidos; eliminá-los de forma segura após o uso. Preservar a arquitetura SQLite vigente.
5. Toda operação destrutiva deve ser precedida por backup `.b9mm` concluído e validado; se backup ou validação falhar, não iniciar alteração destrutiva.
6. Usar gravação atômica, transações SQLite e estratégia de recuperação/rollback. Em qualquer falha, a biblioteca anterior deve continuar íntegra e acessível.
7. Nunca declarar sucesso ao usuário antes da confirmação da operação e da validação de seu resultado.
8. Não incluir módulos ou funcionalidades estranhas ao escopo desta nota.

## 3. DIAGNÓSTICO DO CÓDIGO ATUAL

Arquivos prioritários:

- `src/core/storage.js`: `encodePackage`, `decodePackage`, `validateDatabase`, `mergeLibraries`.
- `src/core/export.js`: `sanitizeExportHtml`, `makeHtmlExport`.
- `src/core/backups.js`: criação e retenção de backups.
- `src/core/library.js`: criação de pastas/notas, versões, etiquetas, favoritos e vínculos.
- `src/main.js`: `exportPackage`, `importPackage`, `exportMaterial`, `importText`, `changeData`, inicialização da biblioteca e integração IPC.
- `src/renderer/app.js`: interface de configurações, botões e notificações.
- `test/core.test.js` e `test/e2e.cjs`: testes automatizados.

**Problemas identificados por inspeção de código da v1.2.0:**

A. A mesclagem de bibliotecas não preserva integralmente vínculos entre anotações, configurações e metadados como favoritos de pastas.

B. Notas são tratadas como duplicadas quando coincidem pasta, título e HTML, mesmo que etiquetas, favoritos, anexos e histórico de versões exijam conciliação.

C. O histórico de versões é listado do mais novo ao mais antigo e copiado nessa ordem, de modo que IDs novos podem inverter a cronologia exibida.

D. A exportação para HTML/PDF retira atributos de formatação, incluindo estilos de cor, marca-texto e apresentação de blocos especiais.

E. A importação TXT/HTML cria uma nota por arquivo, sem reconstruir automaticamente várias notas anteriormente exportadas em um único documento; formatos de leitura não devem ser apresentados como backups reversíveis.

F. Mensagens de erro de pacote inválido ainda citam apenas extensões antigas, sem `.b9mm`.

**Atenção:** os pontos acima têm evidência no código, mas a causa exata de qualquer erro observado pelo usuário deve ser confirmada com testes. Não inferir corrupção de arquivos reais sem inspecioná-los.

## 4. CORREÇÃO P0 — EXPORTAR BIBLIOTECA `.b9mm`

1. Gerar um instantâneo SQLite consistente, incluindo dados recentes ainda em WAL, pastas, subpastas, notas normais/arquivadas, histórico, lixeira, etiquetas, favoritos, vínculos, sinônimos, eventos do calendário, configurações, temas e referências a anexos.
2. Incluir os arquivos binários referenciados e verificar existência, tamanho, hash e integridade de cada um; não criar pacote parcialmente válido.
3. Preservar a assinatura/formato atual `BIZUTECA9MM1` para pacotes v1 compatíveis; só mudar versão interna se indispensável e implementar leitura retrocompatível.
4. Após gravação do `.b9mm`, reler e validar o pacote no disco antes de exibir **“Biblioteca exportada com sucesso”**.
5. Em falha, informar o motivo em linguagem compreensível, sem apagar o pacote anterior válido nem os dados locais. Retirar arquivos temporários incompletos.
6. Avaliar limites de tamanho e memória. Não tentar carregar pacotes excessivos ou aceitar conteúdos descompactados sem limites.
7. Informar nome e caminho do arquivo criado ao concluir.

## 5. CORREÇÃO P0 — IMPORTAR / ACRESCENTAR MATERIAIS

A ação **“Acrescentar materiais”** deve mesclar informações sem remover conteúdo existente.

1. Validar totalmente o pacote antes de alterar o banco atual. Verificar integridade SQLite, hierarquias, ciclos, caminhos, anexos, hashes e versões suportadas.
2. Fazer backup completo validado da biblioteca atual imediatamente antes da mesclagem.
3. Reconstituir hierarquia de pastas em ordem consistente, preservando o mapeamento dos IDs antigos para os novos.
4. Conservar anotações, etiquetas, favoritos, estado de arquivamento, versões anteriores e anexos vinculados.
5. Recriar relações entre notas (`note_links`) mapeando os dois IDs para as notas de destino; evitar links quebrados ou autorreferências.
6. Mesclar eventos, sinônimos e demais dados compartilháveis sem duplicatas indevidas. Para configurações/temas, definir política explícita: preservar os ajustes atuais por padrão; oferecer importação seletiva apenas se implementada de maneira segura.
7. Para notas iguais, não apagar metadados relevantes: conciliar etiquetas e anexos, evitar repetição de versões e documentar exatamente o tratamento de favoritos e divergências.
8. Para colisões de nomes de arquivo de anexo com conteúdos diferentes, gerar um nome interno exclusivo e reescrever todas as referências afetadas nas notas e versões importadas; nunca sobrescrever anexos existentes.
9. Mesclar banco e arquivos sem deixar estado intermediário inconsistente. Se falhar, restaurar o estado anterior e comunicar o erro.
10. Exibir relatório final com quantidades de pastas, notas adicionadas, duplicatas, versões, anexos e eventos importados, além de conflitos tratados.
11. Manter os itens apagados da biblioteca importada na lixeira apenas quando a opção for explicitamente prevista; não ressuscitar exclusões automaticamente.

## 6. CORREÇÃO P0 — RESTAURAR BIBLIOTECA A PARTIR DE `.b9mm`

Diferenciar **“Restaurar biblioteca de arquivo”** de **“Restaurar padrão de fábrica”**.

1. Conferir validade do pacote antes de qualquer mudança.
2. Informar claramente que restaurar um arquivo troca a biblioteca ativa pelo conteúdo do backup selecionado.
3. Criar e validar um backup de segurança da biblioteca atualmente aberta.
4. Preparar a biblioteca restaurada em diretório de staging, conferir SQLite e anexos e só então alternar para o novo conjunto.
5. Preservar o conjunto anterior para recuperação; registrar o caminho do backup e permitir retorno em caso de falha.
6. Verificar depois da troca quantidades e integridade de notas, pastas, relações, imagens, anexos, eventos e configurações.
7. Ao cancelar, não deixar a biblioteca atual modificada.

## 7. CORREÇÃO P1 — EXPORTAÇÃO DE NOTAS HTML, TXT E PDF

1. **HTML:** preservar com segurança títulos, parágrafos, listas, tabelas, negrito, itálico, sublinhado, citações, links, alinhamento, cores de texto, marca-texto, estrutura de blocos de BIZU/PEGADINHA e imagens locais.
2. Aplicar sanitização com lista de tags, atributos e propriedades CSS permitidos; bloquear scripts, eventos `on*`, URLs perigosas, conteúdo remoto executável e CSS malicioso.
3. **PDF:** produzir impressão fiel ao HTML seguro, sem cortar tabelas ou imagens arbitrariamente; tratar quebra de página e imagens embutidas.
4. **TXT:** exportar apenas conteúdo textual legível, com separadores e títulos claros, explicando que estilos e imagens não são preservados nesse formato.
5. **Importar TXT/Markdown/HTML:** sanitizar HTML; preservar quebras de linha e o máximo de estrutura que cada formato suporta. Para arquivo contendo várias notas, oferecer separação somente quando existir um marcador/metadado inequívoco; não adivinhar limites.
6. Não alegar que HTML, TXT ou PDF substituem o backup completo `.b9mm`.

## 8. NOVA FUNCIONALIDADE P0 — RESTAURAR PADRÃO DE FÁBRICA

Adicionar em **Configurações > Dados e configurações** um botão separado chamado **“Restaurar padrão de fábrica”**. Este recurso não importa arquivo: reinicializa o caderno ativo no estado padrão da versão instalada.

**O que será removido da biblioteca ativa:**

- Pastas e subpastas criadas ou modificadas pelo usuário.
- Anotações, resumos, etiquetas, favoritos, versões anteriores, links, lixeira e históricos.
- Imagens e anexos pertencentes à biblioteca ativa.
- Eventos do calendário, sinônimos personalizados, temas personalizados e preferências do usuário.

**O que deve existir após o reset:**

- Banco e estrutura-base inicializados com as mesmas rotinas de uma primeira instalação da versão atual, inclusive conteúdo padrão que essa versão realmente instala (por exemplo, BizuLanguage quando pertinente).
- Tema, aparência e configurações iniciais oficiais.
- Aplicativo funcional, sem referências quebradas, com interface atualizada e sem solicitar criação de biblioteca desnecessariamente.

**Proteções obrigatórias da interface e dos dados:**

1. Mostrar aviso explícito de que a operação retira todos os conteúdos pessoais da biblioteca ativa.
2. Oferecer salvamento de backup `.b9mm` em pasta acessível ao usuário, de preferência fora da biblioteca ativa; gerar e verificar o backup antes de prosseguir.
3. Exigir confirmação reforçada (por exemplo, digitar `RESTAURAR`) com opção **Cancelar** destacada.
4. Preparar um conjunto-base novo e validá-lo antes de trocar a biblioteca ativa. Não esvaziar as tabelas da base em uso diretamente.
5. Executar a troca de modo recuperável; reverter qualquer falha e manter cópia anterior disponível.
6. Nunca apagar backups externos, o executável nem arquivos que não pertençam ao armazenamento gerenciado do aplicativo.
7. Mostrar ao final **“Padrão de fábrica restaurado”**, informar onde está o backup e garantir que o usuário possa importar seu material novamente.

## 9. MELHORIAS DE EXPERIÊNCIA E DIAGNÓSTICO

- Na tela de configurações, separar três ações com descrições precisas: **Exportar biblioteca completa**, **Acrescentar materiais de backup**, **Restaurar biblioteca de arquivo**; o **Padrão de fábrica** deve estar em uma área de ação destrutiva claramente diferenciada.
- Exibir progresso para pacotes grandes e não travar a interface durante operações prolongadas.
- Registrar erros operacionais sem registrar conteúdo privado de notas; apresentar a causa útil ao usuário.
- Atualizar mensagens de compatibilidade para `.b9mm`, `.bizuteca` e `.tvbackup`.
- Informar quando uma operação foi cancelada, falhou ou terminou com sucesso, sem mensagens enganosas.
- Documentar a diferença entre backup completo e exportação de nota para leitura.

## 10. TESTES AUTOMATIZADOS E MANUAIS OBRIGATÓRIOS

Adicionar testes unitários e ponta a ponta nos arquivos existentes e nos que forem necessários:

**T01 — Ida e volta:** criar biblioteca com notas, pastas profundas, conteúdo formatado, imagens, PDFs, favoritos, etiquetas, versões, sinônimos, links, eventos e temas; exportar `.b9mm`; importar em biblioteca limpa; comparar quantidades, campos, relações e hashes.

**T02 — Compatibilidade:** importar `.b9mm`, `.bizuteca` e `.tvbackup` de versões suportadas; confirmar que renomear extensão isoladamente não substitui a verificação de conteúdo.

**T03 — Mesclagem:** importar duas vezes o mesmo pacote e assegurar idempotência; conferir versões, anexos e relações sem perdas ou duplicações impróprias.

**T04 — Conflitos:** criar dois anexos com mesmo nome interno e bytes distintos; importar sem sobrescrever; validar referências reescritas.

**T05 — Erros:** simular arquivo truncado, hash alterado, pacote malicioso, banco SQLite inválido, permissões insuficientes, unidade removida e falta de espaço. Nenhuma falha deve comprometer biblioteca original.

**T06 — Formatação:** exportar HTML/PDF de nota com destaque, cores, listas, imagens e tabela; inspecionar que estrutura e estilos permitidos permanecem visíveis.

**T07 — História:** importar versões registradas em datas distintas e confirmar ordenação mais recente → mais antiga.

**T08 — Fábrica:** criar dados diversos, fazer reset, conferir estado inicial e ausência de dados pessoais na biblioteca ativa; depois importar o backup de segurança e recuperar integralmente o conteúdo.

**T09 — Cancelamento:** cancelar importação, restauração e reset em cada etapa prevista, garantindo que a biblioteca atual permaneça intacta.

**T10 — Windows:** testar no executável portátil e com diretórios contendo espaços/acentos, sem conexão à internet, e com pasta sem permissão de gravação.

Executar `npm test`, `npm run test:e2e` e o pipeline de compilação Windows existente. Se os testes não puderem ser executados no ambiente disponível, documentar a limitação e **não declarar validação concluída**.

## 11. ENTREGAS DA ATUALIZAÇÃO

A IA executora deverá fornecer:

1. Código alterado com explicação objetiva de cada arquivo modificado.
2. Testes novos e resultados verificáveis; indicar o que foi testado e o que não foi.
3. `package.json` atualizado para **v1.3.0** somente quando os critérios forem atendidos.
4. Documento `CHANGELOG`/notas de versão com correções e recursos realmente implementados.
5. Programa portátil Windows compilado, se houver ambiente e pipeline disponíveis, com hash SHA-256 e link de publicação apenas após validação.
6. Relatório final de compatibilidade de backups antigos e novos e descrição do procedimento de recuperação.
7. Nenhuma publicação ou substituição de versão estável que possa causar perda de dados sem evidência de testes satisfatórios.

## 12. CRITÉRIO DE ACEITAÇÃO FINAL

A atualização só estará concluída quando: (a) exportação `.b9mm` puder ser restaurada integralmente; (b) mesclagem conservar dados e relacionamentos sem duplicação indevida; (c) exportação HTML/PDF preservar formatação permitida; (d) restauração de fábrica funcionar com backup e cancelamento seguros; (e) falhas simuladas não causarem perda da biblioteca existente; e (f) testes automatizados e execução portátil forem registrados com resultados claros.

**Observação final:** O pedido é preparar a v1.3.0, não realizar um reset agora. Até a implementação ser testada, conservar a biblioteca e os backups atuais sem modificá-los.