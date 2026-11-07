'use strict';
const sanitizeHtml=require('sanitize-html'),policy=require('./material-policy');
function sanitizeMaterial(html){
 return sanitizeHtml(String(html??''),{
  allowedTags:policy.tags,
  allowedAttributes:{'*':['class','style'],a:['href'],img:['src','alt','width','height'],td:['colspan','rowspan'],th:['colspan','rowspan'],font:['color']},
  allowedClasses:{'*':policy.classes},
  allowedStyles:{'*':Object.fromEntries(Object.entries(policy.styles).map(([k,v])=>[k,[v]]))},
  allowedSchemes:['http','https','mailto'],allowedSchemesByTag:{img:['data','tv-attachment']},
  allowProtocolRelative:false,nonTextTags:policy.dangerous,
  transformTags:{'*':(tag,attrs)=>{
   const safe={};for(const [key,value]of Object.entries(attrs))if(policy.attr(tag,key,value))safe[key]=value;
   return {tagName:tag,attribs:safe};
  }},
  exclusiveFilter:frame=>frame.tag==='img'&&!policy.image.test(frame.attribs.src??'')
 });
}
module.exports={sanitizeMaterial};
