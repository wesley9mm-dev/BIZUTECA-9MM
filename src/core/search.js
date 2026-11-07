'use strict';
const {retrieve,snippetFor}=require('./retrieval');
let semanticProvider=null;
function search(lib,q,opts={}){
 const found=retrieve(lib,String(q??''),opts);
 return {query:q,mode:found.mode,corrected:[...new Set(found.groups.map(g=>g.corrected).filter(Boolean))],
 results:found.rows.map(r=>{const n=lib.getNote(r.id);return {id:n.id,title:n.title,path:n.path,tags:n.tags,favorite:n.favorite,updatedAt:n.updatedAt,score:r.score,matchedTerms:r.matched.map(g=>g.label),snippet:snippetFor(n.contentText,r.matched),reasons:['conteúdo']};})};
}
function parseQuery(q){return (String(q??'').match(/"[^"]+"|\S+/g)||[]).map(raw=>({raw:raw.replace(/^"|"$/g,''),exact:raw.startsWith('"'),tokens:require('./text').tokens(raw)}));}
module.exports={search,parseQuery,setSemanticProvider:p=>{semanticProvider=p;},_semantic:()=>semanticProvider};
