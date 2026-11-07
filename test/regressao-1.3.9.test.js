'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {Library}=require('../src/core/library');
const storage=require('../src/core/storage');
const backups=require('../src/core/backups');
const {htmlToText}=require('../src/core/text');
function library(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'biz-reg-'));
 const lib=new Library(path.join(dir,'biblioteca.db'));
 storage.extendSchema(lib);
 t.after(()=>{lib.close();fs.rmSync(dir,{recursive:true,force:true});});
 return {dir,lib};
}
test('BUG-01 rejeita extensões executáveis em anexos',t=>{
 const {dir,lib}=library(t);
 const raw=storage.encodePackage(lib,dir);
 const magic=Buffer.from('BIZUTECA9MM1\n');
 const doc=JSON.parse(zlib.inflateSync(raw.subarray(magic.length)));
 doc.images.push({name:'evil.bat',data:'YQ=='});
 assert.throws(()=>storage.decodePackage(Buffer.concat([magic,zlib.deflateSync(JSON.stringify(doc))])),/evil\.bat/);
 for(const name of ['x.exe','y.lnk','z.js','../x.png','dir\\x.png','a.png.exe'])assert.equal(storage.safeName(name),false);
 for(const name of ['foto.PNG','nota.txt','prova.pdf'])assert.equal(storage.safeName(name),true);
});
test('BUG-02 preserva o backup mais recente mesmo com nome legado',t=>{
 const {dir}=library(t);
 const old='auto-2026-11-06-15-00-00-000-aaaaaaaa.b9mm';
 const latest='auto-2026-11-06-00-31-00-000-bbbbbbbb.b9mm';
 for(const [name,hour] of [[old,12],[latest,21]]){
  const file=path.join(dir,name),mtime=new Date(2026,10,6,hour);
  fs.writeFileSync(file,'teste');
  fs.utimesSync(file,mtime,mtime);
 }
 backups.retainAutomatic(dir);
 assert.deepEqual(fs.readdirSync(dir).filter(name=>name.endsWith('.b9mm')),[latest]);
});
test('BUG-03 exporta nota mesmo sem a imagem física',t=>{
 const {dir,lib}=library(t);
 lib.createNote({title:'Com imagem',contentHtml:'<img src="tv-attachment://aaaaaaaa-1111-2222.png">'});
 const pack=storage.decodePackage(storage.encodePackage(lib,dir));
 assert.ok(pack.database.length);
 assert.ok(fs.existsSync(backups.writeBackup(lib,dir,{automatic:true})));
});
test('BUG-04 separa células da tabela ao indexar texto',()=>{
 assert.equal(htmlToText('<tr><td>Planejamento</td><td>Organização</td></tr>'),'Planejamento Organização');
});
test('BUG-06 exclui o vínculo do anexo ao purgar a nota',t=>{
 const {lib}=library(t);
 const id=lib.createNote({title:'Antiga'});
 lib.db.prepare('INSERT INTO biz_files(note_id,name,file,mime) VALUES(?,?,?,?)').run(id,'prova.pdf','prova.pdf','application/pdf');
 lib.purgeNote(id);
 assert.equal(lib.db.prepare('SELECT COUNT(*) AS total FROM biz_files').get().total,0);
});
test('BUG-13 duplica os vínculos dos anexos',t=>{
 const {lib}=library(t);
 const id=lib.createNote({title:'Antiga'});
 lib.db.prepare('INSERT INTO biz_files(note_id,name,file,mime) VALUES(?,?,?,?)').run(id,'prova.pdf','prova.pdf','application/pdf');
 const copy=lib.duplicateNote(id);
 assert.equal(lib.db.prepare('SELECT COUNT(*) AS total FROM biz_files WHERE note_id=?').get(copy).total,1);
});

test('BUG-08 preserva formatação e remove conteúdo executável',()=>{
 const {sanitizeExportHtml}=require('../src/core/export');
 const html=sanitizeExportHtml('<p style="color:#c00;position:fixed">Texto <mark>marcado</mark></p><div class="bizu desconhecida">Dica</div><font color="#00f">azul</font><img src="x" onerror="alert(1)"><a href="javascript:alert(1)">link</a><svg><script>alert(1)</script></svg>');
 assert.match(html,/style="color:#c00"/);
 assert.match(html,/<mark>marcado<\/mark>/);
 assert.match(html,/class="bizu"/);
 assert.match(html,/color="#00f"/);
 assert.doesNotMatch(html,/position|onerror|javascript:|alert\(1\)|<svg/);
});
test('BUG-09 converte entidades uma vez e descarta scripts e estilos',t=>{
 const {dir,lib}=library(t);
 assert.equal(htmlToText('<p>&aacute; &eacute; &#xE9; &ccedil;&atilde;o &amp;lt;</p>'),'á é é ção &lt;');
 const file=path.join(dir,'material.html');
 fs.writeFileSync(file,'<html><head><title>Oculto</title><style>p{color:red}</style></head><body><p>Texto</p><script>alert(1)</script><img src="x" onerror="alert(2)"></body></html>');
 require('../src/core/text-import').importTextFiles(lib,[file]);
 const note=lib.getNote(lib.listNotes()[0].id);
 assert.equal(note.contentText,'Texto');
 assert.doesNotMatch(note.contentHtml,/onerror|alert|Oculto|<script/);
});
test('BUG-10 importa texto do Windows sem perder acentos',t=>{
 const {dir,lib}=library(t),file=path.join(dir,'regência.txt');
 fs.writeFileSync(file,Buffer.from('Regência verbal','latin1'));
 assert.equal(require('../src/core/text-import').importTextFiles(lib,[file]),1);
 assert.equal(lib.getNote(lib.listNotes()[0].id).contentText,'Regência verbal');
});

test('BUG-05 concilia pasta favorita, etiquetas, versões e vínculos sem duplicar',t=>{
 const {lib:target}=library(t),{lib:incoming}=library(t);
 const f=incoming.createFolder({name:'Matéria'}),tf=target.createFolder({name:'Matéria'});
 incoming.setFolderFavorite(f,true);
 const a=incoming.createNote({folderId:f,title:'A',contentHtml:'A atual'});
 const b=incoming.createNote({folderId:f,title:'B',contentHtml:'B atual',tags:['nova']});
 const tb=target.createNote({folderId:tf,title:'B',contentHtml:'B atual',tags:['antiga']});
 incoming.linkNotes(a,b);
 const add=incoming.db.prepare('INSERT INTO note_versions(note_id,title,content_html,saved_at) VALUES(?,?,?,?)');
 add.run(a,'A','v1','2026-11-01T10:00:00.000Z');
 add.run(a,'A','v2','2026-11-02T10:00:00.000Z');
 storage.mergeLibraries(target,incoming);
 const ta=target.listNotes().find(n=>n.title==='A').id;
 assert.equal(target.listFolders()[0].favorite,true);
 assert.deepEqual(target.noteTags(tb).sort(),['antiga','nova']);
 assert.deepEqual(target.listVersions(ta).map(v=>target.getVersion(v.id).contentHtml),['v2','v1']);
 assert.equal(target.listRelatedNotes(ta)[0].id,tb);
 assert.equal(storage.mergeLibraries(target,incoming).inserted,0);
 assert.equal(target.listVersions(ta).length,2);
 assert.equal(target.listRelatedNotes(ta).length,1);
});

const renderer=fs.readFileSync(path.join(__dirname,'../src/renderer/app.js'),'utf8');
function rendererFunction(name,context){
 const source=renderer.split('\n').find(line=>line.startsWith('function '+name+'(')||line.startsWith('async function '+name+'('));
 return new Function(...Object.keys(context),source+';return '+name)(...Object.values(context));
}
test('BUG-14 realça acentos e mantém HTML escapado',()=>{
 const snippet=rendererFunction('snippetHtml',{esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;')});
 assert.equal(snippet('A regência exige preposição < exemplo',['regencia','preposicao']),'A <mark>regência</mark> exige <mark>preposição</mark> &lt; exemplo');
});
test('BUG-17 prioriza HTML ao colar uma seleção que também contém imagem',async()=>{
 const inserted=[];
 const onPaste=rendererFunction('onPaste',{selectionSave(){},insertHtml:html=>inserted.push(html),insertImage:()=>inserted.push('imagem'),run:fn=>fn()});
 await onPaste({preventDefault(){},currentTarget:{dataset:{}},clipboardData:{
   items:[{type:'image/png',getAsFile:()=>({})}],getData:type=>type==='text/html'?'<p>Texto</p>':'Texto'
 }});
 assert.deepEqual(inserted,['<p>Texto</p>']);
});
test('BUG-18 aplica uma única propriedade CSS de título válida',()=>{
 assert.match(renderer,/setProperty\('--heading',/);
 assert.doesNotMatch(renderer,/--heading,t\.heading/);
});
test('BUG-19 permite procurar palavras curtas na busca interna',()=>{
 const editor={},NodeFilter={SHOW_TEXT:4};
 let called=0;
 const document={createTreeWalker:(root,kind)=>{
   assert.equal(root,editor);
   assert.equal(kind,NodeFilter.SHOW_TEXT);
   called++;
   return {nextNode:()=>false};
 }};
 const highlight=rendererFunction('highlightEditor',{$:()=>editor,normalize:s=>s,document,NodeFilter});
 highlight(['de'],false);
 assert.equal(called,1);
 highlight(['de']);
 assert.equal(called,1);
});
test('BUG-07 encaminha a navegação para as anotações arquivadas',async()=>{
 const calls=[];
 const navigate=rendererFunction('navigate',{flush(){},$(){},applyTheme(){},themeById(){},state:{},showArchived:()=>calls.push('arquivadas'),home:()=>calls.push('início')});
 await navigate('archived');
 assert.deepEqual(calls,['arquivadas']);
});
test('BUG-11 copia músicas pessoais e avisa sobre nomes iguais com conteúdo diferente',async t=>{
 const {dir:origin}=library(t),{dir:target}=library(t),{dir:other}=library(t);
 const music=require('../src/core/music');
 const source=path.join(origin,'Faixa.mp3'),same=path.join(other,'Faixa.mp3');
 fs.writeFileSync(source,'original');
 fs.writeFileSync(same,'diferente');
 await music.add(origin,[source]);
 await music.copyLibrary(origin,target);
 const conflicts=[];
 await music.add(target,[source,same],name=>conflicts.push(name));
 assert.deepEqual(music.list(target),['Faixa.mp3']);
 assert.deepEqual(conflicts,['Faixa.mp3']);
 assert.equal(fs.readFileSync(path.join(target,'musicas','Faixa.mp3'),'utf8'),'original');
});
