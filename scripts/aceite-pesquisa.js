'use strict';
const {execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const rows=JSON.parse(execFileSync(process.execPath,['scripts/bench-pesquisa.js','--json'],{encoding:'utf8'}));
for(const motor of ['search','consult']){
 const pos=rows.filter(r=>r.exp.length),top=pos.filter(r=>r[motor].rank===1).length,fail=pos.filter(r=>r[motor].rank===0).length;
 const recall=pos.reduce((s,r)=>s+r[motor].rec,0)/pos.length;
 console.log(motor,JSON.stringify({top,fail,recall}));
 assert.ok(top>=55,motor+' primeiro lugar '+top);assert.equal(fail,0,motor+' falhas');assert.ok(recall>=0.94,motor+' recall '+recall);
 for(const row of rows.filter(r=>!r.exp.length&&r.type!=='enunciado'))assert.equal(row[motor].n,0,row.q);
 const negative=rows.find(r=>!r.exp.length&&r.type==='enunciado');assert.ok(negative[motor].n<=3,motor+' enunciado ausente');
}
const {Library}=require('../src/core/library'),{search}=require('../src/core/search'),{consult}=require('../src/core/assistant');
const {performance}=require('node:perf_hooks'),lib=new Library();
lib._tx(()=>{for(let i=0;i<3000;i++)lib.createNote({title:'Material '+i,contentHtml:i%5===0?'<p>Licitação e revogação dos atos administrativos. O prazo para vetar é de quinze dias úteis.</p>':'<p>Matéria de revisão '+i+' administração e planejamento.</p>'});});
function measure(name,budget,fn){const samples=[];for(let i=0;i<5;i++){const start=performance.now();fn();samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);console.log(name,samples[2].toFixed(2)+'ms');assert.ok(samples[2]<=budget,name+' excedeu '+budget+'ms');}
measure('search palavra',30,()=>search(lib,'licitar'));
measure('search enunciado',400,()=>search(lib,'O prazo para o Presidente vetar projeto de lei é de'));
measure('consult enunciado',150,()=>consult(lib,{mode:'statement',text:'O prazo para o Presidente vetar projeto de lei é de'}));
const start=performance.now();lib.reindexAll();console.log('reindexAll',performance.now()-start);assert.ok(performance.now()-start<10000);lib.close();
