'use strict';
const {retrieve,groupsOf,rangesFor}=require('./retrieval');
const {stem}=require('./lang-pt');
function analyze(lib,text){const r=retrieve(lib,text,{limit:1,statement:true});return {groups:r.groups, dropped:r.missing,stemSet:new Set(r.groups.map(g=>g.st)),totalWeight:r.groups.reduce((s,g)=>s+g.weight,0)};}
function consult(lib,q={}){
 const text=String(q.text??'').slice(0,12000);
 const statement=q.mode==='statement'||q.mode!=='theme'&&groupsOf(lib,text).length>3;
 if(q.record)lib.recordConsult(statement?'statement':'theme',text);
 const found=retrieve(lib,text,{...q,statement,limit:q.limit??15});
 const feedback=lib.feedbackRows(found.rows.map(r=>r.id));
 const terms=new Set(found.groups.map(g=>g.st));
 for(const r of found.rows){
  let adjustment=0;r.feedback=0;
  for(const f of feedback.filter(f=>f.noteId===r.id)){
   const prior=new Set(f.terms.split(' ')),intersection=[...terms].filter(t=>prior.has(t)).length;
   const overlap=intersection/(prior.size+terms.size-intersection||1);
   if(overlap>=0.4)adjustment+=f.value*overlap;if(overlap===1)r.feedback=f.value;
  }
  r.score*=Math.max(0.15,1+0.35*Math.max(-2,Math.min(2,adjustment)));
 }
 found.rows.sort((a,b)=>b.score-a.score||a.id-b.id);
 const results=found.rows.map(r=>{
  const n=lib.getNote(r.id);
  let passages=n.contentText.split(/\n+/).filter(Boolean).flatMap((line)=>line.match(/[\s\S]{1,700}(?:\s|$)/g)||[line]).map((s,index)=>({text:s,index,ranges:rangesFor(s,r.matched)})).filter(p=>p.ranges.length).sort((a,b)=>b.ranges.length-a.ranges.length).slice(0,3);
  return {id:n.id,title:n.title,path:n.path,discipline:n.path.split(' / ')[0]||'',tags:n.tags,favorite:n.favorite,updatedAt:n.updatedAt,score:Math.round(r.score*100)/100,matchedTerms:[...new Set([...r.matched.map(g=>g.label),...rangesFor(n.contentText,r.matched).slice(0,40).map(([a,b])=>n.contentText.slice(a,b))])],totalTerms:found.groups.length,coverage:Math.round(r.coverage*100)/100,partial:r.n<found.groups.length,reasons:['conteúdo'],passages,feedback:r.feedback};
 });
 return {mode:found.mode,query:text,keyTerms:found.groups.map(g=>({term:g.label,weight:g.weight,corrected:g.corrected||null})),ignored:found.missing,results,sufficient:!!results.length,message:results.length?'':'Nada no seu material sobre isso'};
}
module.exports={consult,analyze,stemOf:stem};
