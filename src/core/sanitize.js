'use strict';
const sanitizeHtml=require('sanitize-html');
const color=/^(?:#[0-9a-f]{3,8}|[a-z]{1,25}|rgba?\([\d.% ,]+\)|hsla?\([\d.% ,]+\))$/i;
const width=/^(?:[0-9]{1,4})(?:px|%)?$/;
const image=/^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[a-z0-9+/=]+$/i;
function sanitizeMaterial(html){
  return sanitizeHtml(String(html??''),{
    allowedTags:['p','br','b','strong','i','em','u','s','ul','ol','li','h1','h2','h3','h4','blockquote','pre','code','div','span','a','table','thead','tbody','tr','th','td','mark','hr','font','img'],
    allowedAttributes:{'*':['style','class'],a:['href'],img:['src','alt','width'],td:['colspan','rowspan'],th:['colspan','rowspan'],font:['color']},
    allowedClasses:{'*':['bizu','pegadinha','callout-label','task-check']},
    allowedStyles:{'*':{color:[color],'background-color':[color],'text-align':[/^(left|right|center|justify)$/],'font-weight':[/^(normal|bold|[1-9]00)$/],'font-style':[/^(normal|italic|oblique)$/],'text-decoration':[/^(none|underline|line-through)$/],width:[width]}},
    allowedSchemes:['http','https','mailto'],
    allowedSchemesByTag:{img:['data']},
    allowProtocolRelative:false,
    nonTextTags:['script','style','textarea','option','head','title','svg','math','iframe','object','embed','form','xmp'],
    transformTags:{
      a:(tag,attrs)=>({tagName:tag,attribs:/^(?:https?:|mailto:)/i.test(attrs.href??'')?attrs:{}}),
      img:(tag,attrs)=>({tagName:tag,attribs:image.test(attrs.src??'')?{src:attrs.src,alt:attrs.alt??'',...(width.test(attrs.width??'')?{width:attrs.width}:{})}:{}}),
      font:(tag,attrs)=>({tagName:tag,attribs:color.test(attrs.color??'')?attrs:{}})
    },
    exclusiveFilter:frame=>frame.tag==='img'&&!frame.attribs.src
  });
}
module.exports={sanitizeMaterial};
