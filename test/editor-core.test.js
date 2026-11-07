'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{sanitizeMaterial}=require('../src/core/sanitize');
function setup(t){const dom=new JSDOM('<!doctype html>',{runScripts:'outside-only'});t.after(()=>dom.window.close());dom.window.eval(fs.readFileSync(path.join(__dirname,'../src/core/material-policy.js'),'utf8'));dom.window.eval(fs.readFileSync(path.join(__dirname,'../src/renderer/editor-core.js'),'utf8')+';globalThis.editorTest=BizuEditor;');return dom.window;}
test('clean paste removes Word fonts and colors, keeps list/table/strong and spans',t=>{
 const w=setup(t),e=w.editorTest,html='<div style="font-family:Calibri;font-size:11pt;color:blue;margin-left:20px"><strong>Título</strong></div><ul><li>Item</li></ul><table style="width:600px"><tr><td style="color:red;width:80px" colspan="2"><b>Célula</b></td></tr></table>';
 const clean=e.cleanPaste(html);assert.doesNotMatch(clean,/font-family|font-size|color:|width:|margin-left/);assert.match(clean,/<strong>Título<\/strong>/);assert.match(clean,/<li>Item<\/li>/);assert.match(clean,/colspan="2"/);
 assert.match(e.cleanPaste('<div class="bizu"><span style="color:#ff0000">Bizu</span></div>'),/color/);
});
test('renderer and process share an HTML/CSS/image allowlist',t=>{
 const w=setup(t);
 for(const html of ['<p onclick="evil()" style="color:#123456;font-family:Calibri">Texto<script>evil()</script></p>','<img src="tv-attachment://abc123.png" alt="Foto"><img src="file:///secret">','<a href="javascript:alert(1)">Link</a><span class="task-check extra">☐</span>']){
  const a=w.document.createElement('template'),b=w.document.createElement('template');a.innerHTML=w.editorTest.sanitize(html);b.innerHTML=sanitizeMaterial(html);assert.equal(a.innerHTML,b.innerHTML);
 }
});
test('markdown mapping and clean PDF plain text',t=>{
 const e=setup(t).editorTest;
 for(const [s,result]of [['# ','h2'],['## ','h3'],['- ','ul'],['1. ','ol'],['> ','blockquote'],['[] ','task'],['---','rule']])assert.equal(e.markdownAction(s),result);
 assert.equal(e.plainText('Linha sem pontuação\ncontinua aqui.\nPróximo parágrafo.'),'<p>Linha sem pontuação continua aqui.</p><p>Próximo parágrafo.</p>');
});
test('old note structures and attachment images survive sanitization and export',t=>{
 const w=setup(t),html='<font color="#ff0000">Antiga</font><div class="bizu"><span class="callout-label">BIZU</span><p><b>Texto</b></p></div><div class="pegadinha"><p>Detalhe</p></div><table><tbody><tr><td>Célula</td></tr></tbody></table><ul><li><span class="task-check">☑</span><s>Feita</s></li></ul><img src="tv-attachment://abcdef.png" alt="Imagem">';
 const normalized=w.editorTest.sanitize(html),again=w.editorTest.sanitize(normalized);assert.equal(again,normalized);
 for(const token of ['font','bizu','pegadinha','table','task-check','<s>','tv-attachment://'])assert.ok(sanitizeMaterial(html).includes(token),token);
});
