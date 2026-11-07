'use strict';
// Uso: BIZUTECA_DIR=/caminho/do/projeto node --no-warnings bench.js [--json]
const path = require('node:path');
const R = path.resolve(process.env.BIZUTECA_DIR || process.cwd()) + '/';
const { Library } = require(R + 'src/core/library');
const { search } = require(R + 'src/core/search');
const { consult } = require(R + 'src/core/assistant');

const lib = new Library(':memory:');
const F = {};
const folder = (p) => { let parent = null, key = ''; for (const n of p.split('/')) { key += '/' + n; if (!F[key]) F[key] = lib.createFolder({ name: n, parentId: parent }); parent = F[key]; } return parent; };
const NOTES = [
  [1, 'Princípios da Administração Pública (LIMPE)', 'Direito Administrativo/Princípios', 'Legalidade, Impessoalidade, Moralidade, Publicidade e Eficiência estão previstos no art. 37, caput, da CF/88. A eficiência foi inserida pela EC 19/98.'],
  [2, 'Licitação: modalidades', 'Direito Administrativo/Licitações', 'A Lei 14.133/2021 prevê as modalidades pregão, concorrência, concurso, leilão e diálogo competitivo. A tomada de preços e o convite foram extintos.'],
  [3, 'Dispensa e inexigibilidade de licitação', 'Direito Administrativo/Licitações', 'A contratação direta ocorre por dispensa (art. 75) ou inexigibilidade (art. 74). Na inexigibilidade a competição é inviável.'],
  [4, 'Atos administrativos: elementos', 'Direito Administrativo/Atos', 'Competência, finalidade, forma, motivo e objeto. Vício de finalidade gera desvio de poder. O ato pode ser revogado por conveniência e oportunidade ou anulado por ilegalidade.'],
  [5, 'Revogação e anulação', 'Direito Administrativo/Atos', 'A revogação é feita pela Administração por mérito administrativo e produz efeitos ex nunc. A anulação pode ser feita pela Administração ou pelo Judiciário, com efeitos ex tunc. Súmula 473 do STF.'],
  [6, 'Poderes administrativos', 'Direito Administrativo/Poderes', 'Poder hierárquico, disciplinar, regulamentar e de polícia. O poder de polícia possui atributos: discricionariedade, autoexecutoriedade e coercibilidade.'],
  [7, 'Agentes públicos', 'Direito Administrativo/Agentes', 'Servidores estatutários, empregados públicos e temporários. A estabilidade é adquirida após três anos de efetivo exercício, art. 41 da Constituição Federal.'],
  [8, 'Improbidade administrativa', 'Direito Administrativo/Improbidade', 'A Lei 8.429/92 foi alterada pela Lei 14.230/2021, que passou a exigir dolo. Atos que importam enriquecimento ilícito, prejuízo ao erário e violação de princípios.'],
  [9, 'Processo legislativo: fases', 'Processo Legislativo', 'Fase de iniciativa, discussão, votação, sanção ou veto, promulgação e publicação. O veto pode ser total ou parcial e é relativo. O prazo para vetar é de quinze dias úteis.'],
  [10, 'Espécies normativas (art. 59)', 'Processo Legislativo', 'Emendas à Constituição, leis complementares, leis ordinárias, leis delegadas, medidas provisórias, decretos legislativos e resoluções.'],
  [11, 'Medida provisória', 'Processo Legislativo', 'Editada pelo Presidente da República em caso de relevância e urgência. A vigência é de sessenta dias, prorrogáveis por igual período, art. 62 da CF.'],
  [12, 'Emenda constitucional: quórum', 'Processo Legislativo', 'É aprovada em dois turnos, em cada Casa, por três quintos dos membros. Não pode ser objeto de deliberação proposta tendente a abolir cláusulas pétreas.'],
  [13, 'Lei complementar e lei ordinária', 'Processo Legislativo', 'Lei complementar exige maioria absoluta. Lei ordinária exige maioria simples.'],
  [14, 'Regimento Interno da ALECE', 'Processo Legislativo/ALECE', 'O Regimento Interno da Assembleia Legislativa do Ceará disciplina comissões, sessões, projetos de lei e proposições.'],
  [15, 'Comissões Parlamentares de Inquérito', 'Processo Legislativo/ALECE', 'A CPI tem poderes de investigação próprios das autoridades judiciais, fato determinado e prazo certo, com assinatura de um terço dos membros.'],
  [16, 'Crase', 'Português/Crase', 'Ocorre crase na fusão da preposição a com o artigo a. Não se usa crase antes de verbos, de pronomes pessoais e de palavras masculinas.'],
  [17, 'Concordância verbal', 'Português/Concordância', 'O verbo concorda com o sujeito em número e pessoa. O verbo haver, no sentido de existir, é impessoal e fica no singular.'],
  [18, 'Regência verbal', 'Português/Regência', 'Assistir, no sentido de ver, exige a preposição a. Preferir é preferir uma coisa a outra. Obedecer e desobedecer exigem a.'],
  [19, 'Pontuação: vírgula', 'Português/Pontuação', 'A vírgula separa adjunto adverbial deslocado, aposto e vocativo. Não se separa o sujeito do verbo.'],
  [20, 'Interpretação de texto: inferência', 'Português/Interpretação', 'Inferir é concluir algo a partir do texto sem que esteja escrito. Cuidado com extrapolação e redução.'],
  [21, 'Classes de palavras: pronomes', 'Português/Morfologia', 'Pronomes pessoais, possessivos, demonstrativos, indefinidos, relativos e interrogativos.'],
  [22, 'Excel: fórmulas', 'Informática/Excel', 'A função PROCV procura um valor na primeira coluna de uma tabela. SOMA, MÉDIA, SE e CONT.SE são funções básicas.'],
  [23, 'Segurança: phishing e ransomware', 'Informática/Segurança', 'Phishing é fraude por engano. Backup, antivírus e firewall protegem. Ransomware sequestra dados e cobra resgate.'],
  [24, 'Windows 11: atalhos', 'Informática/Windows', 'Ctrl+C copia, Ctrl+V cola, Win+D mostra a área de trabalho.'],
  [25, 'Arquivologia: ciclo vital', 'Arquivologia', 'Arquivo corrente, intermediário e permanente. É a teoria das três idades.'],
  [26, 'Funções administrativas (PODC)', 'Administração Geral', 'Planejamento, organização, direção e controle formam o processo administrativo.'],
  [27, 'Princípios orçamentários', 'Administração Financeira e Orçamentária', 'Anualidade, unidade, universalidade, exclusividade e legalidade orçamentária. PPA, LDO e LOA.'],
  [28, 'Direitos fundamentais', 'Direito Constitucional', 'Art. 5º da CF: igualdade, liberdade, propriedade. Habeas corpus protege a liberdade de locomoção; mandado de segurança protege direito líquido e certo.'],
  [29, 'Controle da Administração', 'Direito Administrativo/Controle', 'Controle interno, externo e social. O Tribunal de Contas auxilia o Legislativo.'],
  [30, 'Responsabilidade civil do Estado', 'Direito Administrativo/Responsabilidade', 'Teoria do risco administrativo. Responsabilidade objetiva do art. 37, § 6º da CF. Direito de regresso contra o agente em caso de dolo ou culpa.'],
  [31, 'LINDB', 'Direito Administrativo/Normas', 'Lei de Introdução às Normas do Direito Brasileiro, Decreto-Lei 4.657/42.'],
  [32, 'Contratos administrativos: cláusulas exorbitantes', 'Direito Administrativo/Contratos', 'Alteração unilateral, rescisão unilateral, fiscalização, aplicação de sanções e ocupação provisória.'],
  [33, 'Pregão', 'Direito Administrativo/Licitações', 'Modalidade para aquisição de bens e serviços comuns. O critério de julgamento é menor preço ou maior desconto.'],
  [34, 'Serviços públicos', 'Direito Administrativo/Serviços', 'Princípios: continuidade, generalidade, modicidade tarifária e atualidade.'],
  [35, 'Organização administrativa', 'Direito Administrativo/Organização', 'Administração direta e indireta: autarquias, fundações, empresas públicas e sociedades de economia mista. Descentralização e desconcentração.'],
  [36, 'Mérito administrativo e discricionariedade', 'Direito Administrativo/Atos', 'Conveniência e oportunidade. O Judiciário não revê o mérito, apenas controla a legalidade.'],
  [37, 'Acentuação gráfica', 'Português/Acentuação', 'Oxítonas terminadas em a, e, o, seguidas ou não de s. Paroxítonas terminadas em ditongo.'],
  [38, 'Cargo, emprego e função pública', 'Direito Administrativo/Agentes', 'Cargo é o lugar na organização com atribuições e remuneração. Função é atribuição sem cargo.'],
  [39, 'Poder regulamentar', 'Direito Administrativo/Poderes', 'Edição de decretos para fiel execução da lei. Decreto autônomo só nas hipóteses do art. 84, VI da CF.'],
  [40, 'Sessões da Assembleia', 'Processo Legislativo/ALECE', 'As sessões podem ser ordinárias, extraordinárias, solenes e especiais.'],
];
const ids = new Map();
for (const [n, title, f, text] of NOTES) ids.set(lib.createNote({ title, folderId: folder(f), contentHtml: '<p>' + text + '</p>' }), n);

// tipo, consulta, esperados (números das notas; o primeiro é o ideal)
const Q = [
  ['plural-ao', 'licitações', [2, 3, 33]], ['sem-acento', 'licitacao', [2, 3, 33]], ['verbo', 'licitar', [2, 3]], ['verbo', 'revogar', [5, 4]],
  ['plural-curto', 'atos', [4, 5]], ['singular-curto', 'ato', [4, 5]], ['plural-curto', 'leis', [8, 13, 10]], ['plural-curto', 'poderes', [6, 39]],
  ['genero', 'administrativos', [4, 5, 6]], ['plural-ao', 'emendas', [12, 10]], ['verbo', 'vetar', [9]], ['verbo', 'vetado', [9]],
  ['plural-ao', 'servidores', [7]], ['sigla', 'Constituição Federal', [7, 1, 11]], ['sigla', 'CF', [1, 7, 11, 28, 30]], ['sigla', 'CF/88', [1]],
  ['numero', '14.133', [2]], ['numero', 'Lei 14133', [2]], ['numero', 'art 37', [1, 30]], ['numero', 'artigo 37', [1, 30]], ['numero', '8429', [8]],
  ['numero-extenso', '15 dias úteis', [9]], ['numero-extenso', '60 dias', [11]], ['numero-extenso', '3/5 dos membros', [12]], ['numero-extenso', 'três anos', [7]], ['numero-extenso', '2 turnos', [12]],
  ['erro-digitacao', 'adminstração', [26, 29, 35]], ['erro-digitacao', 'ransonware', [23]], ['erro-digitacao', 'improbidade administrativa', [8]], ['erro-digitacao', 'inexigibilidade', [3]],
  ['frase', 'poder de polícia', [6]], ['frase', 'efeitos ex nunc', [5]], ['frase', 'dois turnos', [12]], ['frase', 'princípios da administração', [1]],
  ['sigla-titulo', 'LIMPE', [1]], ['sigla', 'PODC', [26]], ['sigla', 'CPI', [15]], ['sigla', 'MP', [11]], ['sigla', 'LC', [13]], ['sigla', 'STF', [5]],
  ['sinonimo', 'anulação por vício de legalidade', [5, 4]], ['sinonimo', 'prazo para sancionar ou vetar', [9]], ['sinonimo', 'Presidente da República', [11]],
  ['palavra-rara', 'procv', [22]], ['palavra-rara', 'phishing', [23]], ['ausente', 'fotossíntese', []], ['ausente', 'cloroplasto', []],
  ['enunciado', 'Acerca dos atos administrativos, assinale a alternativa correta. A) A revogação é realizada pela Administração com fundamento na ilegalidade do ato. B) A anulação produz efeitos ex nunc. C) A revogação decorre de juízo de conveniência e oportunidade e não retroage. D) O Judiciário pode revogar atos da Administração. E) O ato discricionário não possui motivo.', [5, 36, 4]],
  ['enunciado', 'Segundo a Constituição Federal, a medida provisória terá vigência de', [11]],
  ['enunciado', 'O prazo para o Presidente da República vetar projeto de lei é de', [9]],
  ['enunciado', 'Quanto à concordância verbal, o verbo haver, no sentido de existir, deve ficar', [17]],
  ['enunciado', 'Em qual das frases a crase é obrigatória? A) Fui à escola. B) Voltei a casa. C) Vou a pé.', [16]],
  ['enunciado', 'A modalidade de licitação destinada à aquisição de bens e serviços comuns é', [33, 2]],
  ['enunciado', 'Assinale a alternativa que apresenta corretamente o quórum de aprovação de emenda à Constituição', [12]],
  ['enunciado', 'A função do Excel utilizada para buscar um valor na primeira coluna de uma tabela é', [22]],
  ['enunciado', 'Os poderes da Administração incluem o poder de polícia, cujos atributos são', [6]],
  ['enunciado', 'A teoria das três idades classifica os arquivos em', [25]],
  ['enunciado', 'Quanto ao ato de improbidade, a Lei de Improbidade Administrativa, alterada em 2021, exige', [8]],
  ['enunciado', 'o q é inexigibilidade de licitação', [3]],
  ['enunciado', 'A fotossíntese ocorre nos cloroplastos das células vegetais e produz glicose. Assinale a correta.', []],
  ['enunciado', 'Considerando a responsabilidade civil do Estado, assinale a alternativa correta: A) A responsabilidade é subjetiva. B) Adota-se a teoria do risco administrativo. C) Não cabe regresso contra o agente.', [30]],
  ['enunciado', 'São princípios expressos da Administração Pública previstos no caput do art. 37 da CF, EXCETO', [1]],
];

const rank = (list, exp) => { if (!exp.length) return null; for (let i = 0; i < list.length; i++) if (exp.includes(ids.get(list[i]))) return i + 1; return 0; };
const recall = (list, exp) => exp.length ? exp.filter(e => list.some(id => ids.get(id) === e)).length / exp.length : null;
const rows = [];
for (const [type, q, exp] of Q) {
  const s = search(lib, q, { limit: 30 });
  const sIds = s.results.map(r => r.id);
  const c = consult(lib, { mode: 'statement', text: q, limit: 15 });
  const cIds = c.results.map(r => r.id);
  const t = type === 'enunciado' ? null : consult(lib, { mode: 'theme', text: q, limit: 15 });
  rows.push({ type, q: q.length > 46 ? q.slice(0, 43) + '...' : q, exp, search: { rank: rank(sIds, exp), n: sIds.length, mode: s.mode, rec: recall(sIds, exp) }, consult: { rank: rank(cIds, exp), n: cIds.length, rec: recall(cIds, exp) }, theme: t ? { rank: rank(t.results.map(r => r.id), exp), n: t.results.length } : null });
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(rows)); process.exit(0); }
const cell = (o) => o == null ? '  - ' : o.rank === null ? (o.n === 0 ? 'ok0 ' : 'RUIDO' + o.n) : o.rank === 0 ? 'FALHA' : '#' + o.rank + '/' + o.n;
console.log('tipo'.padEnd(15) + 'consulta'.padEnd(48) + 'search'.padEnd(9) + 'consult'.padEnd(9) + 'tema');
for (const r of rows) console.log(r.type.padEnd(15) + r.q.padEnd(48) + cell(r.search).padEnd(9) + cell(r.consult).padEnd(9) + cell(r.theme));
const withExp = rows.filter(r => r.exp.length);
const stat = (get) => { const x = withExp.map(get).filter(Boolean); const ok = x.length; const f = withExp.filter(r => get(r) && get(r).rank === 0).length; const top1 = withExp.filter(r => get(r) && get(r).rank === 1).length; const top3 = withExp.filter(r => get(r) && get(r).rank >= 1 && get(r).rank <= 3).length; return { consultas: ok, acerto_1: top1, acerto_ate_3: top3, falhas: f }; };
const rec = (get) => { const x = withExp.map(r => get(r) && get(r).rec).filter(v => v != null); return +(x.reduce((a, b) => a + b, 0) / x.length).toFixed(2); };
console.log('\nRECALL medio  search=' + rec(r => r.search) + ' consult=' + rec(r => r.consult));
console.log('RECALL por tipo (search/consult):'); for (const t of [...new Set(withExp.map(r => r.type))]) { const g = withExp.filter(r => r.type === t); const m = (get) => +(g.map(r => get(r).rec).reduce((a, b) => a + b, 0) / g.length).toFixed(2); console.log('  ' + t.padEnd(16) + m(r => r.search) + ' / ' + m(r => r.consult)); }
console.log('\nRESUMO search  ', JSON.stringify(stat(r => r.search)));
console.log('RESUMO consult ', JSON.stringify(stat(r => r.consult)));
const neg = rows.filter(r => !r.exp.length);
console.log('Negativas (devem dar 0 resultados): search=' + neg.map(r => r.search.n) + ' consult=' + neg.map(r => r.consult.n));