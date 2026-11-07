'use strict';
const {norm,levenshtein}=require('./text');
const {words,strip,stem,stemText,STOP,ABBR,numericText}=require('./lang-pt');
const phrase=s=>'"'+words(s).map(strip).join(' ')+'"';
const EX='{title body tags path} : ', ST='stems : ';
function groupsOf(lib,text){
 const pairs=[...new Map([...ABBR,...lib.listAbbreviations().map(x=>[x.sigla,norm(x.extenso)])])].sort((a,b)=>b[1].length-a[1].length);
 const chunks=String(text).match(/"[^"]+"|[^"]+/g)||[];
 const out=[];let pos=0;
 for(const chunk of chunks){
  if(chunk.startsWith('"')){const raw=chunk.slice(1,-1);if(words(raw).length)out.push({label:raw,st:stemText(raw),alts:[EX+phrase(raw)],exact:true,pos:pos++});continue;}
  const raw=words(numericText(chunk)),ws=raw.map(strip);
  for(let i=0;i<ws.length;){
   let hit=null;
   for(const [sig,full] of pairs){
    const ft=words(full).map(strip);
    if(ws[i]===sig||ft.every((t,k)=>ws[i+k]===t)){
     hit={label:ws[i]===sig?sig:full,st:stemText(full),alts:[EX+phrase(sig),EX+phrase(full),ST+phrase(stemText(full))],pos:pos++,len:ws[i]===sig?1:ft.length};break;
    }
   }
   if(hit){out.push(hit);i+=hit.len;continue;}
   const w=ws[i],s=stem(raw[i]);
   if(!STOP.has(w)&&!(w.length<2&&!/\d/.test(w))){
    const alts=[EX+phrase(w),ST+phrase(s)];
    if(/^\d{4,}$/.test(w))alts.push(EX+phrase(w.replace(/\B(?=(\d{3})+(?!\d))/g,' ')));
    let len=1,label=w;
    for(let n=Math.min(4,ws.length-i);n>0;n--){
     const str=ws.slice(i,i+n).join(' '),syns=lib.synonymsOf(str);
     if(syns.length){label=str;len=n;alts.push(EX+phrase(str));for(const syn of syns)alts.push(EX+phrase(syn),ST+phrase(stemText(syn)));break;}
    }
    out.push({label,st:s,raw:raw[i],alts,pos:pos++});i+=len;
   }else{i++;pos++;}
  }
 }
 if(!out.length&&words(text).length)out.push({label:text,st:stemText(text),alts:[EX+phrase(text)],exact:true,pos:0});
 return out.filter((g,i,a)=>a.findIndex(x=>x.label===g.label)===i);
}
function retrieve(lib,text,opts={}){
 let groups=groupsOf(lib,text);
 const statement=opts.statement??groups.length>3;
 const allGroups=groups;
 const N=Math.max(1,lib.noteCount()),db=lib.db;
 const folder=opts.folderId==null?null:new Set(lib.descendantFolderIds(opts.folderId));
 const where=['notes_fts MATCH ?','n.deleted_at IS NULL'];
 if(!opts.includeArchived)where.push('n.archived=0');
 const extra=[];
 if(opts.since){where.push('n.updated_at>=?');extra.push(new Date(opts.since).toISOString());}
 if(opts.tag){where.push('EXISTS(SELECT 1 FROM note_tags nt JOIN tags t ON t.id=nt.tag_id WHERE nt.note_id=n.id AND t.key=?)');extra.push(norm(String(opts.tag).replace(/^#/,'')));}
 const stmt=db.prepare('SELECT n.id,n.folder_id AS folderId,bm25(notes_fts,10,1,4,2,0.5) AS rank FROM notes_fts JOIN notes n ON n.id=notes_fts.rowid WHERE '+where.join(' AND '));
 const cache=new Map();
 const hits=expr=>{
  if(cache.has(expr))return cache.get(expr);
  const rows=stmt.all(expr,...extra).filter(r=>!folder||folder.has(r.folderId));
  cache.set(expr,rows);return rows;
 };
 const missing=[];
 for(const g of groups){
  if(opts.incremental&&g===groups.at(-1)&&!g.exact)g.alts.push(EX+phrase(g.label)+'*');
  g.expr='('+g.alts.join(' OR ')+')';
  g.hits=hits(g.expr);
  if(!g.hits.length&&!opts.incremental&&!g.exact&&g.raw?.length>=5&&!/\d/.test(g.raw)){
   const max=g.raw.length>=8?2:1;
   const candidates=lib.vocabulary().map(v=>({...v,dist:levenshtein(g.st,stem(v.term),max)}))
    .filter(v=>v.dist<=max).sort((a,b)=>levenshtein(norm(g.raw),a.term,3)-levenshtein(norm(g.raw),b.term,3)||a.dist-b.dist||b.doc-a.doc).slice(0,3);
   if(candidates.length){
    // Keep only the closest spelling family; unrelated secondary corrections add noise.
    const best=candidates[0],rad=stem(best.term);
    g.corrected=best.term;g.alts.push(ST+phrase(rad),EX+phrase(best.term));
    g.expr='('+g.alts.join(' OR ')+')';g.hits=hits(g.expr);g.st=rad;
   }
  }
  g.ids=new Set(g.hits.map(r=>r.id));g.df=g.ids.size;
  g.weight=Math.log(1+N/Math.max(1,g.df));
  g.title=new Set(hits('{title} : ('+g.alts.filter(x=>x.startsWith(EX)).map(x=>x.slice(EX.length)).join(' OR ')+')').map(r=>r.id));
  if(!g.df)missing.push(g.label);
 }
 // Unknown words in alternatives must not reduce coverage.
 const altStart=String(text).search(/(?:^|\s)[A-Ea-e][).]\s/);
 if(altStart>=0){
  const lead=new Set(groupsOf(lib,String(text).slice(0,altStart)).map(g=>g.label));
  groups=groups.filter(g=>lead.has(g.label)||g.df);
  for(const g of groups)if(!lead.has(g.label))g.weight*=0.5;
 }
 if(statement&&N>=50)groups=groups.filter(g=>g.df/N<=0.6);
 if(groups.length>14)groups=groups.slice().sort((a,b)=>b.weight-a.weight).slice(0,14).sort((a,b)=>a.pos-b.pos);
 const known=groups.filter(g=>g.df);
 if(!known.length)return {rows:[],groups,missing,mode:'none'};
 const total=groups.reduce((s,g)=>s+g.weight,0);
 // For a long statement use matching material as context; missing rare topics still
 // guard against results consisting exclusively of generic vocabulary.
 const knownTotal=known.reduce((s,g)=>s+g.weight,0);
 const weights=groups.map(g=>g.weight).sort((a,b)=>a-b),median=weights[Math.floor(weights.length/2)];
 const scores=new Map();
 for(const g of known)for(const r of g.hits){
  const e=scores.get(r.id)||{id:r.id,score:0,tie:0,cov:0,n:0,matched:[],high:false};
  const title=g.title.has(r.id);
  e.score+=g.weight*(1+(title?0.6:0))*(statement&&g.raw?.length>=5&&/(ar|er|ir)$/.test(g.raw)?1.5:1);
  e.tie-=r.rank*g.weight;e.cov+=g.weight;e.n++;e.matched.push(g);
  if(g.weight>=median)e.high=true;
  scores.set(r.id,e);
 }
 for(let i=0;i+1<known.length;i++){
  const a=known[i],b=known[i+1];if(!a.st||!b.st||b.pos-a.pos>2)continue;
  for(const r of hits(ST+phrase(a.st+' '+b.st))){const e=scores.get(r.id);if(e)e.score+=0.5*(a.weight+b.weight);}
 }
 let rows=[...scores.values()];
 const T=known.length;
 let mode='all';
 const complete=rows.filter(r=>r.n===T);
 if(groups.some(g=>g.exact&&!g.df))rows=[];
 else if(T<=3&&complete.length)rows=complete;
 else if(!statement){
  // Relax the lowest-IDF requirement one at a time; never discard quoted groups.
  let remaining=known.slice().sort((a,b)=>a.weight-b.weight);
  let found=[];
  while(remaining.length>1&&!found.length){
   const removable=remaining.findIndex(g=>!g.exact);
   if(removable<0)break;
   remaining.splice(removable,1);found=rows.filter(r=>remaining.every(g=>g.ids.has(r.id)));
  }
  rows=found.length?found:(groups.length<=3?rows.filter(r=>r.cov/knownTotal>=0.34):[]);
  mode='any';
 }else{
  const top=Math.max(...rows.map(r=>r.score));
  rows=rows.filter(r=>r.cov/knownTotal>=0.30&&r.score>=top*0.45&&(N<10||r.high||!missing.length));
  // A statement with mostly unknown vocabulary must not retrieve only common words.
  if(N>=10&&missing.length>known.length)rows=rows.filter(r=>r.cov/total>=0.3&&r.high);
  mode='statement';
 }
 rows=rows.filter(r=>groups.filter(g=>g.exact).every(g=>g.ids.has(r.id)));
 for(const r of rows)r.coverage=r.cov/(statement?Math.max(total,knownTotal):knownTotal);
 rows.sort((a,b)=>b.score-a.score||b.tie-a.tie||a.id-b.id);
 return {rows:rows.slice(0,Math.max(1,Math.min(200,Number(opts.limit)||30))),groups,missing,mode:rows.length?mode:'none'};
}
function rangesFor(text,groups){
 const wanted=new Set(groups.flatMap(g=>[...words(g.st),...words(g.label).map(stem)]));
 const ranges=[];
 for(const m of String(text).matchAll(/[\p{L}\p{N}]+/gu))if(wanted.has(stem(m[0])))ranges.push([m.index,m.index+m[0].length]);
 return ranges;
}
function snippetFor(text,groups){
 const ranges=rangesFor(text,groups),first=ranges[0]?.[0]||0;
 const start=Math.max(0,first-60),end=Math.min(text.length,start+240);
 let out=start?'…':'',pos=start;
 for(const [a,b]of ranges){if(a<start||b>end)continue;out+=text.slice(pos,a)+'[['+text.slice(a,b)+']]';pos=b;}
 return out+text.slice(pos,end)+(end<text.length?'…':'');
}
module.exports={retrieve,groupsOf,rangesFor,snippetFor};
