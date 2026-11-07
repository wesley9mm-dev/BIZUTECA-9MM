'use strict';
const BizuEditor=(()=>{
 const escapeText=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 let controller,frame,slashIndex=0,lastHighlight;
 const button=(id,label,text,attr='')=>'<button type="button" '+(id?'id="'+id+'"':'')+' title="'+label+'" aria-label="'+label+'" '+attr+'>'+text+'</button>';
 const cmd=(command,label,text)=>button('',label,text,'data-command="'+command+'"');
 function buildToolbar(){
  return '<div class="editor-toolbar" role="toolbar" aria-label="Formatação">'+
   '<select id="text-style" aria-label="Estilo do texto" title="Estilo do texto"><option value="p">Texto</option><option value="h2">Título</option><option value="h3">Subtítulo</option><option value="blockquote">Citação</option></select>'+
   cmd('bold','Negrito (Ctrl B)','<b>B</b>')+cmd('italic','Itálico (Ctrl I)','<i>I</i>')+cmd('underline','Sublinhado (Ctrl U)','<u>U</u>')+
   button('text-color','Cor do texto','Cor ▾')+button('highlight-color','Marca-texto','Marca ▾')+'<span class="toolbar-divider"></span>'+
   cmd('insertUnorderedList','Marcadores (Ctrl Shift 8)','•')+cmd('insertOrderedList','Lista numerada (Ctrl Shift 7)','1.')+button('insert-task','Lista de tarefas (Ctrl Shift 9)','☐')+
   '<span class="toolbar-divider"></span>'+button('insert-table','Inserir tabela','Tabela')+button('insert-image','Inserir imagem','Imagem')+button('insert-link','Link (Ctrl K)','Link')+
   '<select id="insert-block" aria-label="Inserir bloco" title="Inserir bloco"><option value="">+ Bloco</option><option value="bizu">Bizu</option><option value="pegadinha">Pegadinha</option><option value="rule">Separador</option><option value="symbols">Símbolos</option></select>'+
   '<span class="toolbar-divider"></span>'+button('editor-more','Mais formatação','…')+
   '<span class="toolbar-spacer"></span>'+cmd('undo','Desfazer (Ctrl Z)','↶')+cmd('redo','Refazer (Ctrl Y)','↷')+'</div>';
 }
 function sanitize(html){
  const doc=document.createElement('template');doc.innerHTML=String(html||'');const policy=BizuMaterialPolicy;
  for(const el of Array.from(doc.content.querySelectorAll('*'))){
   const tag=el.localName;
   if(policy.dangerous.includes(tag)){el.remove();continue;}
   if(!policy.tags.includes(tag)){el.replaceWith(...el.childNodes);continue;}
   for(const a of Array.from(el.attributes)){
    if(!policy.attr(tag,a.name,a.value)){el.removeAttribute(a.name);continue;}
    if(a.name==='class'){el.className=el.className.split(/\s+/).filter(s=>policy.classes.includes(s)).join(' ');if(!el.className)el.removeAttribute('class');}
    if(a.name==='style'){
     const out=[];for(const [name,rx]of Object.entries(policy.styles)){const value=el.style.getPropertyValue(name).trim();if(value&&rx.test(value))out.push(name+':'+value);}
     if(out.length)el.setAttribute('style',out.join(';'));else el.removeAttribute('style');
    }
   }
   if(tag==='img'&&!el.getAttribute('src'))el.remove();
  }
  return doc.innerHTML;
 }
 function cleanPaste(html){
  const doc=document.createElement('template');doc.innerHTML=sanitize(html);
  const internal=/data-bizuteca\b/.test(html)||!!doc.content.querySelector('.bizu,.pegadinha');
  for(const el of Array.from(doc.content.querySelectorAll('*'))){
   const align=el.style.textAlign,color=el.style.color,background=el.style.backgroundColor;
   el.removeAttribute('style');el.removeAttribute('width');el.removeAttribute('height');
   if(align)el.style.textAlign=align;
   if(internal&&color)el.style.color=color;if(internal&&background)el.style.backgroundColor=background;
   if(el.localName==='font'){if(internal){const span=document.createElement('span');span.style.color=el.getAttribute('color')||'';span.append(...el.childNodes);el.replaceWith(span);}else el.replaceWith(...el.childNodes);}
   if(el.localName==='div'&&!el.className&&!el.querySelector('p,div,table,ul,ol,h1,h2,h3,h4,blockquote')){
    const p=document.createElement('p');p.append(...el.childNodes);el.replaceWith(p);
   }
  }
  return doc.innerHTML.replace(/(?:&nbsp;|\u00a0){2,}/g,' ').replace(/(<p>(?:<br\s*\/?>|\s)*<\/p>)(?:\s*<p>(?:<br\s*\/?>|\s)*<\/p>)+/g,'$1');
 }
 function plainText(text){
  return String(text).replace(/\r\n?/g,'\n').replace(/([^\n.!?:;])\n(?=[a-zà-ÿ])/g,'$1 ').split('\n').map(s=>'<p>'+escapeText(s||'')+'</p>').join('');
 }
 function markdownAction(text){
  return ({'# ':'h2','## ':'h3','- ':'ul','* ':'ul','1. ':'ol','> ':'blockquote','[] ':'task','---':'rule'})[text]||null;
 }
 function lockLabels(editor){for(const label of editor.querySelectorAll('.callout-label'))label.contentEditable='false';}
 function updateToolbarState(){
  const editor=$('#editor'),sel=getSelection();if(!editor?.contains(sel.anchorNode))return;
  for(const b of $$('.editor-toolbar [data-command]')){
   if(!['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'].includes(b.dataset.command))continue;
   const on=document.queryCommandState(b.dataset.command);b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));
  }
  const block=editorTarget('p,h1,h2,h3,h4,blockquote');
  $('#text-style').value=block?.closest('blockquote')?'blockquote':(['h2','h3'].includes(block?.localName)?block.localName:'p');
  floatingBar();
 }
 function floatingBar(){
  const bar=$('#selection-toolbar'),editor=$('#editor'),sel=getSelection();
  if(!bar)return;
  if(!sel.rangeCount||sel.isCollapsed||!editor?.contains(sel.anchorNode)||!editor.isContentEditable){bar.hidden=true;return;}
  selectionSave();const rect=sel.getRangeAt(0).getBoundingClientRect();
  bar.hidden=false;bar.style.left=Math.max(8,Math.min(window.innerWidth-bar.offsetWidth-8,rect.left))+'px';bar.style.top=Math.max(8,rect.top-bar.offsetHeight-8)+'px';
 }
 function applyAction(action){
  if(['h2','h3','p','blockquote'].includes(action))return format('formatBlock',action);
  if(action==='ul')return format('insertUnorderedList');
  if(action==='ol')return format('insertOrderedList');
  if(action==='task')return insertTask();
  if(action==='rule')return insertHtml('<hr><p><br></p>');
  if(action==='bizu'||action==='pegadinha')return callout(action);
  if(action==='table')return $('#insert-table').click();
  if(action==='image')return $('#insert-image').click();
  if(action==='symbols')return run(symbols);
 }
 function callout(kind){
  selectionRestore();const sel=getSelection(),range=sel.rangeCount?sel.getRangeAt(0):null;
  const temp=document.createElement('div');if(range&&!range.collapsed)temp.append(range.cloneContents());
  insertHtml('<div class="'+kind+'"><span class="callout-label">'+(kind==='bizu'?'BIZU':'PEGADINHA')+'</span><p>'+(temp.innerHTML||'<br>')+'</p></div><p><br></p>');
  lockLabels($('#editor'));
 }
 function insertTask(){insertHtml('<ul><li><span class="task-check">☐</span> </li></ul><p><br></p>');lockLabels($('#editor'));}
 function toggleTask(check){
  const li=check.closest('li'),done=check.textContent!=='☑';check.textContent=done?'☑':'☐';
  for(const s of Array.from(li.children).filter(x=>x.tagName==='S'))s.replaceWith(...s.childNodes);
  if(done){const strike=document.createElement('s');while(check.nextSibling)strike.append(check.nextSibling);li.append(strike);}
  markDirty();
 }
 async function symbols(){selectionSave();const r=await openDialog('Inserir símbolo','<label class="field">Símbolo<select name="symbol">'+['→','⇒','≤','≥','≠','±','×','÷','√','∑','∞','π','Δ','∈','∩','∪','°','²','³'].map(x=>'<option>'+x+'</option>').join('')+'</select></label>');if(r.id==='ok')insertHtml(esc(r.values.symbol));}
 function contrastColor(hex,background,foreground=false){
  let col=hex;for(let i=0;i<30;i++){
   const ratio=foreground?BizThemes.contrast(col,background):BizThemes.contrast(background,col);
   if(ratio>=4.5)return col;
   const target=foreground?(BizThemes.contrast('#000000',background)>BizThemes.contrast('#ffffff',background)?'#000000':'#ffffff'):(BizThemes.contrast(background,'#000000')>BizThemes.contrast(background,'#ffffff')?'#000000':'#ffffff');
   col=BizThemes.mix(col,target,0.18);
  }return col;
 }
 async function palette(kind){
  selectionSave();const theme=themeById(state.theme),highlight=kind==='highlight';
  const bases=highlight?['#facc15','#4ade80','#22d3ee','#a78bfa','#fb7185','#fb923c']:['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#3b82f6','#a855f7','#ec4899'];
  const colors=bases.map(x=>contrastColor(x,highlight?theme.text:theme.editor,!highlight));
  const dialog=openDialog(highlight?'Marca-texto':'Cor do texto','<div class="color-palette" role="group" aria-label="Paleta de cores">'+colors.map((color,i)=>'<button type="button" data-palette-color="'+color+'" style="background-color:'+color+'" title="Cor '+(i+1)+'" aria-label="Cor '+(i+1)+'"></button>').join('')+'</div><label class="field">Cor<select name="color"><option value="">Sem cor</option>'+colors.map((x,i)=>'<option value="'+x+'">Cor '+(i+1)+' · '+x+'</option>').join('')+'</select></label>');
  for(const b of $$('[data-palette-color]'))b.onclick=()=>{$('#dialog select[name=color]').value=b.dataset.paletteColor;for(const swatch of $$('[data-palette-color]'))swatch.setAttribute('aria-pressed',String(swatch===b));};
  const r=await dialog;
  if(r.id!=='ok')return;
  selectionRestore();
  if(r.values.color){
   format(highlight?'hiliteColor':'foreColor',r.values.color);
   state.prefs[highlight?'lastHighlight':'lastTextColor']=r.values.color;if(highlight)lastHighlight=r.values.color;soonPrefs();
  }else{
   // Chromium splits the selected style runs and removes only the selected color.
   format(highlight?'hiliteColor':'foreColor',highlight?'transparent':'inherit');
  }
 }
 async function more(){
  selectionSave();const cell=editorTarget('td,th');
  const choices=[['strike','Tachado'],['left','Alinhar à esquerda'],['center','Centralizar'],['right','Alinhar à direita'],['indent','Aumentar recuo'],['outdent','Diminuir recuo'],['clear','Limpar formatação'],['paste','Colar mantendo formatação']];
  if(cell)choices.push(['add-row','Adicionar linha'],['remove-row','Remover linha'],['add-column','Adicionar coluna'],['remove-column','Remover coluna'],['header','Cabeçalho']);
  const r=await openDialog('Mais formatação','',choices.map(([id,text])=>({id,text})).concat({id:'cancel',text:'Fechar'}));
  if(r.id==='cancel')return;
  const commands={strike:'strikeThrough',left:'justifyLeft',center:'justifyCenter',right:'justifyRight',indent:'indent',outdent:'outdent',clear:'removeFormat'};
  if(commands[r.id])format(commands[r.id]);
  else if(r.id==='paste'){selectionRestore();$('#editor').dataset.keepPaste='true';await api('pasteFormatted');}
  else if(r.id==='header'){selectionRestore();const row=editorTarget('td,th')?.parentElement;if(row){for(const cell of Array.from(row.cells)){const tag=document.createElement(cell.tagName==='TH'?'td':'th');for(const a of cell.attributes)tag.setAttribute(a.name,a.value);tag.append(...cell.childNodes);cell.replaceWith(tag);}markDirty();}}
  else changeTable(r.id);
 }
 const slashItems=[['h2','Título'],['h3','Subtítulo'],['ul','Lista'],['task','Tarefa'],['table','Tabela'],['bizu','Bizu'],['pegadinha','Pegadinha'],['blockquote','Citação'],['rule','Separador'],['image','Imagem'],['symbols','Símbolo']];
 function slashMenu(){
  const editor=$('#editor'),block=lineBlock(editor),menu=$('#slash-menu');
  if(!menu||!block||!/^\/[\p{L}\s]*$/u.test(block.textContent)){if(menu)menu.hidden=true;return;}
  const query=normalize(block.textContent.slice(1));const list=slashItems.filter(x=>normalize(x[1]).includes(query));
  if(!list.length){menu.hidden=true;return;}
  if(menu.dataset.query!==query){slashIndex=0;menu.dataset.query=query;}
  menu.hidden=false;menu.innerHTML=list.map(([action,label],i)=>button('',label,label,'data-slash="'+action+'" role="option" aria-selected="'+(i===slashIndex)+'"')).join('');
  const rect=block.nodeType===Node.TEXT_NODE?getSelection().getRangeAt(0).getBoundingClientRect():block.getBoundingClientRect();menu.style.left=Math.min(rect.left,window.innerWidth-220)+'px';menu.style.top=Math.min(rect.bottom,window.innerHeight-menu.offsetHeight-8)+'px';
  slashIndex=Math.max(0,Math.min(slashIndex,list.length-1));
  for(const b of menu.querySelectorAll('button')){b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const range=document.createRange();range.selectNodeContents(block);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);selectionSave();document.execCommand('delete');menu.hidden=true;applyAction(b.dataset.slash);};}
 }
 function selectCell(cell){const range=document.createRange();range.selectNodeContents(cell);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);selectionSave();}
 function exitBlock(block){const p=document.createElement('p');p.append(document.createElement('br'));block.after(p);selectCell(p);markDirty();}
 function lineBlock(editor){
  const sel=getSelection();let node=sel.anchorNode;
  if(node===editor)node=editor.childNodes[sel.anchorOffset]||editor.childNodes[sel.anchorOffset-1];
  return editorTarget('p,div,h1,h2,h3,h4')||(node?.nodeType===Node.TEXT_NODE&&node.parentNode===editor?node:editor.childElementCount===0?editor:null);
 }
 function keydown(e){
  const editor=e.currentTarget,k=e.key.toLowerCase(),ctrl=e.ctrlKey||e.metaKey;
  if(k==='escape'){$('#workspace').classList.remove('focus-writing');$('#note-findbar').hidden=true;$('#slash-menu').hidden=true;$('#selection-toolbar').hidden=true;return;}
  const menu=$('#slash-menu');
  if(!menu.hidden&&['arrowup','arrowdown','enter'].includes(k)){
   e.preventDefault();const buttons=Array.from(menu.querySelectorAll('button'));if(k==='enter'){buttons[slashIndex]?.click();return;}slashIndex=(slashIndex+(k==='arrowdown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===slashIndex)));return;
  }
  if(!editor.isContentEditable)return;
  if(ctrl&&e.shiftKey&&k==='v'){editor.dataset.plainPaste=String(Date.now()+1500);return;}
  const shortcuts={k:()=>run(linkEditor)};
  if(ctrl&&!e.shiftKey&&!e.altKey&&shortcuts[k]){e.preventDefault();e.stopPropagation();shortcuts[k]();return;}
  if(ctrl&&e.altKey&&['1','2','0'].includes(e.key)){e.preventDefault();applyAction({'1':'h2','2':'h3','0':'p'}[e.key]);return;}
  if(ctrl&&e.shiftKey){
   const actions={b:()=>callout('bizu'),p:()=>callout('pegadinha'),h:()=>format('hiliteColor',lastHighlight||state.prefs.lastHighlight||contrastColor('#facc15',themeById(state.theme).text)),x:()=>format('strikeThrough')};
   const list=({'Digit7':'ol','Digit8':'ul','Digit9':'task'})[e.code];
   if(actions[k]||list){e.preventDefault();if(list)applyAction(list);else actions[k]();return;}
  }
  const task=editorTarget('li')?.querySelector('.task-check'),block=editorTarget('.bizu,.pegadinha,blockquote,table');
  if(task&&((ctrl&&k==='enter')||(k===' '&&getSelection().anchorNode===task.firstChild))){e.preventDefault();toggleTask(task);return;}
  if(ctrl&&k==='enter'&&block){e.preventDefault();exitBlock(block);return;}
  if(k==='tab'){
   const cell=editorTarget('td,th');
   if(cell){
    e.preventDefault();const table=cell.closest('table'),cells=Array.from(table.querySelectorAll('td,th')),index=cells.indexOf(cell)+(e.shiftKey?-1:1);
    if(index>=cells.length){if(Array.from(table.rows).some(r=>Array.from(r.cells).some(c=>c.colSpan>1||c.rowSpan>1))){toast('Adicione linhas em uma tabela sem células mescladas.');return;}const row=table.insertRow();for(let i=0;i<cell.parentElement.cells.length;i++)row.insertCell().innerHTML='<br>';selectCell(row.cells[0]);markDirty();}
    else if(index<0){const p=document.createElement('p');p.innerHTML='<br>';table.before(p);selectCell(p);markDirty();}else selectCell(cells[index]);return;
   }
   if(editorTarget('li')){e.preventDefault();format(e.shiftKey?'outdent':'indent');return;}
  }
  if(k==='enter'&&task){
   e.preventDefault();const li=task.closest('li'),text=li.textContent.replace(/[☐☑]/g,'').trim();
   if(!text){const list=li.parentElement;li.remove();exitBlock(list);if(!list.children.length)list.remove();}
   else{
    const sel=getSelection(),r=sel.getRangeAt(0),tail=r.cloneRange();tail.setEnd(li,li.childNodes.length);const rest=tail.extractContents();
    const next=document.createElement('li'),check=document.createElement('span');check.className='task-check';check.textContent='☐';next.append(check,' ',rest);li.after(next);const nr=document.createRange();nr.setStartAfter(check);nr.collapse(true);sel.removeAllRanges();sel.addRange(nr);selectionSave();markDirty();
   }return;
  }
  const p=editorTarget('p');
  if(k==='enter'&&block&&p&&!p.textContent.trim()&&p===block.lastElementChild){e.preventDefault();p.remove();exitBlock(block);return;}
  if(k==='backspace'&&block?.matches('.bizu,.pegadinha')&&p&&p===block.querySelector('p')&&(()=>{const sel=getSelection();if(!sel.rangeCount||!sel.isCollapsed)return false;const prefix=sel.getRangeAt(0).cloneRange();prefix.selectNodeContents(p);prefix.setEnd(sel.anchorNode,sel.anchorOffset);return !prefix.toString();})()){e.preventDefault();block.querySelector('.callout-label')?.remove();block.replaceWith(...block.childNodes);markDirty();return;}
  const current=lineBlock(editor);const action=current?markdownAction(current.textContent.replace(/\u00a0/g,' ')+(k===' '?' ':'')):null;
  if((k===' '&&action)||(k==='enter'&&action==='rule')){
   e.preventDefault();
   const parent=current===editor?editor:current.parentNode,index=current===editor?0:Array.prototype.indexOf.call(parent.childNodes,current);
   const range=document.createRange();if(current===editor)range.selectNodeContents(editor);else range.selectNode(current);
   const sel=getSelection();sel.removeAllRanges();sel.addRange(range);selectionSave();
   const html={h2:'<h2><br></h2>',h3:'<h3><br></h3>',ul:'<ul><li><br></li></ul>',ol:'<ol><li><br></li></ol>',blockquote:'<blockquote><p><br></p></blockquote>',task:'<ul><li><span class="task-check">☐</span> <br></li></ul>',rule:'<hr><p><br></p>'}[action];
   // One Chromium editing transaction: Undo restores the typed prefix as well.
   insertHtml(html);
   let target=parent.childNodes[index+(action==='rule'?1:0)];
   if(target?.nodeType===Node.ELEMENT_NODE)target=target.querySelector('li,p')||target;
   if(target){const caret=document.createRange();caret.selectNodeContents(target);caret.collapse(true);if(action==='task'&&target.firstChild)caret.setStartAfter(target.firstChild);sel.removeAllRanges();sel.addRange(caret);selectionSave();}
   return;
  }
 }
 async function paste(e){
  e.preventDefault();selectionSave();const editor=e.currentTarget,clip=e.clipboardData,text=clip.getData('text/plain'),html=clip.getData('text/html'),keep=editor.dataset.keepPaste==='true';delete editor.dataset.keepPaste;
  if(Number(editor.dataset.plainPaste)>Date.now()){delete editor.dataset.plainPaste;insertHtml(esc(text).replace(/\r?\n/g,'<br>'));return;}
  const images=Array.from(clip.items).filter(i=>i.kind==='file'&&i.type.startsWith('image/'));
  if(images.length){for(const item of images)await insertImage(item.getAsFile());return;}
  if(/^(https?:\/\/|mailto:)\S+$/i.test(text.trim())){
   if(!getSelection().isCollapsed)format('createLink',text.trim());else insertHtml('<a href="'+esc(text.trim())+'">'+esc(text.trim())+'</a>');return;
  }
  if(html){
   const doc=document.createElement('template');doc.innerHTML=keep?sanitize(html):cleanPaste(html);
   for(const image of Array.from(doc.content.querySelectorAll('img'))){
    const src=image.getAttribute('src')||'';
    if(src.startsWith('data:')){
     const m=src.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=]+)$/i);
     if(!m||m[2].length>28000000){image.remove();toast('Imagem ignorada: formato ou tamanho inválido.',true);continue;}
     const url=await api('saveImage',{mime:m[1],data:m[2]});image.setAttribute('src',url);
    }
   }
   if(editor===$('#editor'))insertHtml(doc.innerHTML);
  }else insertHtml(plainText(text));
  lockLabels(editor);
 }
 function wireEditor(editor,note){
  controller?.abort();controller=new AbortController();const signal=controller.signal;
  document.execCommand('styleWithCSS',false,true);lockLabels(editor);
  editor.onpaste=e=>{const pending=paste(e);run(()=>pending);};editor.oninput=()=>{lockLabels(editor);markDirty();slashMenu();};
  editor.addEventListener('beforeinput',()=>clearNoteHighlights(editor),{signal});
  editor.addEventListener('focus',()=>{
   clearNoteHighlights(editor);const sel=getSelection();
   if(!editor.contains(sel.anchorNode)){const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);sel.removeAllRanges();sel.addRange(range);}
  },{signal});
  editor.addEventListener('keydown',keydown,{signal});
  $('#note-title').onkeydown=e=>{if(['Enter','ArrowDown'].includes(e.key)){e.preventDefault();editor.focus();}};
  for(const b of $$('.editor-toolbar button'))b.onmousedown=e=>e.preventDefault();
  for(const b of $$('.editor-toolbar [data-command]'))b.onclick=()=>format(b.dataset.command);
  $('#text-style').onmousedown=selectionSave;$('#text-style').onchange=e=>format('formatBlock',e.target.value);
  $('#text-color').onclick=()=>run(()=>palette('text'));$('#highlight-color').onclick=()=>run(()=>palette('highlight'));
  $('#insert-block').onmousedown=selectionSave;$('#insert-block').onchange=e=>{applyAction(e.target.value);e.target.value='';};
  $('#insert-task').onclick=insertTask;$('#insert-link').onclick=()=>run(linkEditor);$('#editor-more').onclick=()=>run(more);
  editor.insertAdjacentHTML('beforebegin','<div id="note-findbar" class="note-findbar" hidden><input id="note-find" type="search" aria-label="Buscar nesta anotação" placeholder="Buscar na nota">'+button('note-find-prev','Ocorrência anterior','↑')+button('note-find-next','Próxima ocorrência','↓')+'<span id="note-find-count" role="status"></span>'+button('note-find-close','Fechar busca','×')+'</div><div id="selection-toolbar" class="selection-toolbar" role="toolbar" aria-label="Formatação da seleção" hidden>'+['bold','italic','underline'].map((x,i)=>button('',x,['B','I','U'][i],'data-float="'+x+'"')).join('')+button('float-highlight','Marca-texto','Marca')+button('float-link','Link','Link')+button('float-clear','Limpar formatação','Tx')+'</div><div id="slash-menu" class="slash-menu" role="listbox" aria-label="Inserir bloco" hidden></div>');
  for(const b of $$('#selection-toolbar button'))b.onmousedown=e=>e.preventDefault();
  for(const b of $$('[data-float]'))b.onclick=()=>format(b.dataset.float);
  $('#float-highlight').onclick=()=>run(()=>palette('highlight'));$('#float-link').onclick=()=>run(linkEditor);$('#float-clear').onclick=()=>format('removeFormat');
  const tagField=$('#note-tags').closest('label');tagField.hidden=true;tagField.id='note-tags-field';
  $('#attachments').hidden=!$('#attachments').children.length;
  const find=direction=>{
   clearNoteHighlights(editor);const value=$('#note-find').value.trim();if(value)highlightEditor([value],false);
   const matches=Array.from(editor.querySelectorAll('.found-text'));let index=Number($('#note-find-count').dataset.index??-1);
   index=matches.length?(index+direction+matches.length)%matches.length:-1;$('#note-find-count').dataset.index=index;
   $('#note-find-count').textContent=matches.length?(index+1)+' de '+matches.length:(value?'Nenhuma ocorrência':'');
   matches[index]?.scrollIntoView({block:'center'});
  };
  $('#note-find-next').onclick=()=>find(1);$('#note-find-prev').onclick=()=>find(-1);
  $('#note-find-close').onclick=()=>{$('#note-findbar').hidden=true;clearNoteHighlights(editor);editor.focus();};
  $('#note-find').oninput=()=>{$('#note-find-count').dataset.index=-1;find(1);};
  $('#note-find').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();find(e.shiftKey?-1:1);}if(e.key==='Escape')$('#note-find-close').click();};
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'&&state.view==='editor'){e.preventDefault();$('#note-findbar').hidden=false;$('#note-find').focus();}if(e.key==='Escape'){if(!$('#dialog').open){editor.contentEditable='true';$('.editor-toolbar').hidden=false;$('#note-findbar').hidden=true;$('#slash-menu').hidden=true;clearNoteHighlights(editor);}$('#workspace').classList.remove('focus-writing');if($('#note-focus-exit'))$('#note-focus-exit').remove();}},{signal});
  document.addEventListener('selectionchange',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(updateToolbarState);},{signal});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#slash-menu,#editor'))$('#slash-menu').hidden=true;},{signal});
  $('#main').addEventListener('scroll',()=>{$('#selection-toolbar').hidden=true;$('#slash-menu').hidden=true;},{signal});
  window.addEventListener('blur',()=>{if(state.dirty)run(flush);},{signal});
  $('.editor-toolbar').onkeydown=e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key)||e.target.tagName==='SELECT')return;e.preventDefault();const controls=Array.from(e.currentTarget.querySelectorAll('button,select'));controls[(controls.indexOf(e.target)+(e.key==='ArrowRight'?1:-1)+controls.length)%controls.length]?.focus();};
  editor.addEventListener('contextmenu',e=>{if(e.target.tagName==='IMG'){e.preventDefault();run(()=>imageEditor(e.target));}},{signal});
  editor.addEventListener('click',e=>{const check=e.target.closest('.task-check');if(check&&editor.isContentEditable)toggleTask(check);const link=e.target.closest('a');if(link&&(e.ctrlKey||!editor.isContentEditable))run(()=>api('openReference',link.href));},{signal});
 }
 async function noteAction(action){
  const editor=$('#editor');
  if(action==='find'){$('#note-findbar').hidden=false;$('#note-find').focus();}
  if(action==='focus'){
   $('#workspace').classList.add('focus-writing');if(!$('#note-focus-exit'))$('.editor-heading').insertAdjacentHTML('beforeend',button('note-focus-exit','Sair do Modo Foco (Esc)','Sair do foco'));
   $('#note-focus-exit').onclick=()=>{$('#workspace').classList.remove('focus-writing');$('#note-focus-exit').remove();editor.focus();};
  }
  if(action==='reading'){const read=editor.isContentEditable;editor.contentEditable=String(!read);$('.editor-toolbar').hidden=read;$('#selection-toolbar').hidden=true;editor.focus();}
  if(action==='outline'){const headers=Array.from(editor.querySelectorAll('h1,h2,h3,h4'));const r=await openDialog('Sumário','<label class="field">Título<select name="heading">'+headers.map((h,i)=>'<option value="'+i+'">'+esc(h.textContent)+'</option>').join('')+'</select></label>');if(r.id==='ok')headers[Number(r.values.heading)]?.scrollIntoView({block:'center'});}
  if(action==='tags'){$('#note-tags-field').hidden=false;$('#note-tags').focus();}
  if(action==='versions')$('#versions').click();
  if(action==='export')$('#export-note').click();
  if(action==='attach')$('#attach-file').click();
  if(action==='template')await noteFromTemplate();
 }
 function dispose(){controller?.abort();cancelAnimationFrame(frame);}
 return {dispose,buildToolbar,wireEditor,updateToolbarState,slashMenu,floatingBar,sanitize,cleanPaste,plainText,markdownAction,noteAction,callout,paste};
})();
