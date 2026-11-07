'use strict';

function searchFolder() {
  const context=state.folderId ?? (state.view==='search'?searchRoute.folderId:null);
  const chain=folderChain(context);
  const scope=$('#search-scope').value;
  return scope==='folder' ? chain.at(-1)?.id ?? null : scope==='subject' ? chain[0]?.id ?? null : null;
}
async function addBackupControls() {
  const configuration=await api('backupSettings');
  if(state.view!=='settings')return;
  $('#main').insertAdjacentHTML('beforeend',
    '<section class="settings-section"><h2>Backups automáticos</h2><p>As cópias locais usam .b9mm e incluem o calendário. A retenção mantém até sete cópias diárias, quatro semanais e três mensais.</p>'+
    '<label class="field inline"><input id="automatic-backup" type="checkbox" '+(configuration.automatic?'checked':'')+'> Criar cópias periódicas quando houver alterações</label>'+
    '<p class="help">Cópia adicional '+esc(configuration.additional||'não configurada')+'</p>'+
    '<div class="button-row"><button id="pick-backup-directory" class="outline small">Escolher outra pasta ou unidade</button>'+
    '<button id="clear-backup-directory" class="outline small">Remover destino adicional</button></div></section>'+
    '<section class="settings-section"><h2>BizuLanguage</h2><p>Coleção offline de inglês, espanhol, francês e italiano, com explicações, exemplos e exercícios.</p>'+
    '<button id="apply-bizulanguage" class="outline">Acrescentar / atualizar BizuLanguage</button></section>'+
    '<section class="settings-section"><h2>Modelo de biblioteca TEC</h2><p>Adicione a estrutura de matérias e assuntos quando quiser.</p>'+
    '<button id="apply-tec" class="outline">Acrescentar modelo TEC</button></section>');
  const abbreviations=await api('listAbbreviations');
  $('#main').insertAdjacentHTML('beforeend','<section class="settings-section"><h2>Minhas siglas</h2><p>Acrescente equivalências para a pesquisa no seu caderno.</p><div id="abbr-list">'+abbreviations.map(x=>'<p>'+esc(x.sigla)+' — '+esc(x.extenso)+' <button data-abbr="'+esc(x.sigla)+'" class="outline small">Remover</button></p>').join('')+'</div><button id="add-abbr" class="outline">Adicionar ou editar sigla</button></section>');
  $('#add-abbr').onclick=()=>run(async()=>{const r=await openDialog('Sigla de pesquisa','<label class="field">Sigla<input name="sigla" maxlength="20" required></label><label class="field">Significado<input name="extenso" maxlength="250" required></label>');if(r.id==='ok'){await api('saveAbbreviation',r.values.sigla,r.values.extenso);await settings();}});
  for(const button of $('[data-abbr]'))button.onclick=()=>run(async()=>{await api('removeAbbreviation',button.dataset.abbr);await settings();});
  $('#automatic-backup').onchange=event=>run(()=>api('toggleAutomaticBackup',event.target.checked));
  $('#pick-backup-directory').onclick=()=>run(async()=>{if(await api('backupDirectory'))await settings();});
  $('#clear-backup-directory').onclick=()=>run(async()=>{await api('backupDirectory','clear');await settings();});
  $('#apply-bizulanguage').onclick=()=>run(async()=>{
    if(!await confirmAction('Acrescentar / atualizar BizuLanguage?','As novas aulas em texto serão acrescentadas. Aulas anteriores e anotações editadas serão preservadas; um backup será criado antes.'))return;
    const count=await api('applyBizuLanguage');
    if(count)await refresh();
    toast(count?count+' aulas BizuLanguage adicionadas.':'A coleção BizuLanguage já está disponível nesta biblioteca.');
  });
  $('#apply-tec').onclick=()=>run(async()=>{
    if(!await confirmAction('Acrescentar modelo TEC?','As pastas serão acrescentadas à biblioteca atual.'))return;
    const count=await api('applyTecModel');await refresh();toast(count+' pasta(s) adicionada(s).');
  });
}
function editorTarget(selector) {
  const anchor=getSelection().anchorNode;
  const target=(anchor?.nodeType===Node.ELEMENT_NODE?anchor:anchor?.parentElement)?.closest(selector);
  return $('#editor')?.contains(target)?target:null;
}
function clearNoteHighlights(editor) {
  for(const mark of editor.querySelectorAll('.found-text'))mark.replaceWith(...mark.childNodes);
  editor.normalize();
}
function changeTable(kind) {
  selectionRestore();
  const cell=editorTarget('td,th');
  if(!cell){toast('Selecione uma célula da tabela.');return;}
  const row=cell.parentElement,table=cell.closest('table'),column=cell.cellIndex;
  if(Array.from(table.rows).some(r=>r.cells.length!==row.cells.length||
    Array.from(r.cells).some(c=>c.rowSpan!==1||c.colSpan!==1))){
    toast('A edição de linhas e colunas está disponível em tabelas sem células mescladas.');return;
  }
  const empty=c=>{c.append(document.createElement('br'));return c;};
  if(kind==='add-row'){
    const next=table.insertRow(row.rowIndex+1);
    for(let i=0;i<row.cells.length;i++)empty(next.insertCell());
  }else if(kind==='remove-row'){
    if(table.rows.length===1)table.remove();else row.remove();
  }else if(kind==='add-column'){
    for(const current of table.rows)empty(current.insertCell(column+1));
  }else if(row.cells.length===1)table.remove();
  else for(const current of table.rows)current.deleteCell(column);
  state.lastRange=null;markDirty();
}
async function linkEditor() {
  selectionRestore();selectionSave();
  const editor=$('#editor'),current=editorTarget('a');
  const selected=getSelection().toString();
  const actions=[{id:'cancel',text:'Cancelar'},{id:'save',text:'Salvar link',primary:true}];
  if(current)actions.splice(0,0,{id:'remove',text:'Remover link'},{id:'open',text:'Abrir no navegador'});
  const result=await openDialog(current?'Editar link':'Inserir link',
    '<label class="field">Endereço<input name="url" placeholder="https://" value="'+esc(current?.getAttribute('href')||'')+'"></label>',actions);
  if(result.id==='cancel'||!editor.isConnected)return;
  if(result.id==='open'){await api('openReference',current.href);return;}
  if(result.id==='remove'){
    current.replaceWith(...current.childNodes);state.lastRange=null;markDirty();return;
  }
  let url;
  try {url=new URL(result.values.url.trim());}catch{throw Error('Informe um endereço válido.');}
  if(!['https:','http:','mailto:'].includes(url.protocol)||url.username||url.password)throw Error('Informe um endereço http, https ou mailto.');
  if(current){current.setAttribute('href',url.href);markDirty();}
  else if(selected)format('createLink',url.href);
  else insertHtml('<a href="'+esc(url.href)+'">'+esc(url.href)+'</a>');
}
async function imageEditor(image) {
  const result=await openDialog('Imagem da anotação','<p class="help">Escolha uma ação para esta imagem.</p>',[
    {id:'copy',text:'Copiar imagem',primary:true},{id:'save',text:'Salvar imagem como…'},
    {id:'resize',text:'Redimensionar'},{id:'remove',text:'Remover imagem',danger:true},{id:'cancel',text:'Fechar'}
  ]);
  if(!image.isConnected||result.id==='cancel')return;
  if(result.id==='copy'){await api('copyImage',image.getAttribute('src'));toast('Imagem copiada.');}
  if(result.id==='save'&&await api('saveImageAs',image.getAttribute('src')))toast('Imagem salva.');
  if(result.id==='resize'){
    const dimensions=await openDialog('Redimensionar imagem','<label class="field">Largura em pixels<input type="number" name="width" min="24" max="2400" required value="'+Math.round(image.getBoundingClientRect().width)+'"></label><p class="help">A proporção e o arquivo original são preservados.</p>');
    if(dimensions.id==='ok'&&image.isConnected){
      image.removeAttribute('width');image.removeAttribute('height');
      image.style.width=Number(dimensions.values.width)+'px';image.style.height='auto';markDirty();
    }
  }
  if(result.id==='remove'&&await confirmAction('Remover imagem?','A imagem será retirada desta anotação.')){
    await flush();await api('snapshotNote',state.note.id);
    if(image.isConnected){image.remove();markDirty();}
  }
}
async function noteFromTemplate() {
  const templates={
    'Em branco':'',
    'Resumo':'<h2>Conceito</h2><p><br></p><h2>Pontos importantes</h2><p><br></p><h2>Resumo final</h2><p><br></p>',
    'Bizu':'<div class="bizu"><span class="callout-label">BIZU</span><p><br></p></div>',
    'Mnemônico':'<h2>Regra</h2><p><br></p><h2>Macete</h2><p><br></p>',
    'Exercício resolvido':'<h2>Enunciado</h2><p><br></p><h2>Resolução</h2><p><br></p>',
    'Vocabulário':'<h2>Termo</h2><p><br></p><h2>Significado</h2><p><br></p><h2>Exemplo</h2><p><br></p>'
  };
  const result=await openDialog('Nova anotação de modelo','<label class="field">Modelo<select name="template">'+
    Object.keys(templates).map(name=>'<option>'+esc(name)+'</option>').join('')+'</select></label>');
  if(result.id!=='ok')return;
  await flush();
  const id=await api('createNote',{title:'Nova anotação',folderId:state.folderId,contentHtml:templates[result.values.template]||''});
  await refresh();await openNote(id);$('#note-title').select();
}
