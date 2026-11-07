'use strict';
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const output=execFileSync(process.execPath,['--no-warnings',path.join(__dirname,'repro-v1.3.9.cjs')],{cwd:path.join(__dirname,'..'),env:{...process.env,TZ:'America/Sao_Paulo'},encoding:'utf8'});
process.stdout.write(output);
const lines=new Map();
for(const line of output.trim().split(/\r?\n/)){
 const match=line.match(/^(B\d+[a-z]?)(?:-.*?)? (.*)$/);
 if(!match)continue;
 const json=match[2].match(/(?:\{|\[|"|\b(?:true|false|\d+)\b).*$/);
 if(json){
  try{lines.set(match[1],JSON.parse(json[0]));continue;}catch{}
 }
 const start=match[2].indexOf('[');
 if(start>=0)lines.set(match[1],JSON.parse(match[2].slice(start)));
}
const b1=lines.get('B1');
assert.ok(b1.restaram.includes(b1.criados[1]),'B1');
assert.equal(lines.get('B2a'),'Planejamento Organização');
assert.equal(lines.get('B2b'),'Regra á é é ção');
assert.equal(lines.get('B2c'),'Texto');
assert.equal(lines.get('B2d'),1);
assert.deepEqual(lines.get('B3'),{encodePackage:'ok',writeBackupAutomatico:'ok'});
assert.deepEqual(lines.get('B4a').map(row=>row.html),['<p>v2</p>','<p>v1</p>']);
assert.equal(lines.get('B4b'),true);
assert.equal(lines.get('B4c').A,1);
assert.deepEqual(lines.get('B4d').destino,['etiqueta-nova']);
assert.deepEqual(lines.get('B5').anexosHerdadosPelaNovaNota,[]);
assert.equal(lines.get('B5').linhasOrfasAposPurge,0);
assert.deepEqual(lines.get('B6'),{anexosDaCopia:1,favoritaCopia:false});
assert.deepEqual(lines.get('B8').arquivadas,['Arquivada']);
assert.equal(lines.get('B9').safeNameBat,false);
assert.equal(lines.get('B9').safeNameExe,false);
assert.match(lines.get('B9').pacoteComBat,/^rejeitado:/);
assert.match(lines.get('B10'),/<mark>regência<\/mark>.*<mark>preposição<\/mark>/);
assert.match(lines.get('B11'),/style="color:#c00".*<mark>.*class="bizu".*color="#00f"/);
assert.equal(lines.get('B12'),1);
console.log('PASS Reprodução integral da base 1.3.9');
