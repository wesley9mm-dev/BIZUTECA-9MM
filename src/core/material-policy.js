'use strict';
(function(root){
const policy={
 tags:'p br div span b strong i em u s strike ul ol li h1 h2 h3 h4 blockquote pre code a table thead tbody tr th td img hr mark font'.split(' '),
 classes:['bizu','pegadinha','callout-label','task-check'],
 dangerous:'script style iframe object embed svg math form input button link meta textarea option head title xmp'.split(' '),
 styles:{
  color:/^(?:#[0-9a-f]{3,8}|[a-z]{1,25}|rgba?\([\d.% ,]+\)|hsla?\([\d.% ,]+\))$/i,
  'background-color':/^(?:#[0-9a-f]{3,8}|[a-z]{1,25}|rgba?\([\d.% ,]+\)|hsla?\([\d.% ,]+\))$/i,
  'text-align':/^(left|right|center|justify)$/,
  'font-weight':/^(normal|bold|[1-9]00)$/,'font-style':/^(normal|italic|oblique)$/,
  'text-decoration':/^(none|underline|line-through)$/,
  'font-size':/^\d{1,3}(?:\.\d+)?(?:px|pt|em|rem|%)$/,
  'font-family':/^[a-zA-Z0-9 ,'"-]{1,100}$/,
  'white-space':/^(normal|pre|pre-wrap|pre-line)$/,
  width:/^(?:[0-9]{1,4})(?:px|%)?$/,height:/^(?:auto|[0-9]{1,4}(?:px|%)?)$/,
  'vertical-align':/^(baseline|top|middle|bottom|sub|super)$/,
  'margin-left':/^\d{1,3}(?:px|em|%)$/
 },
 image:/^(?:tv-attachment:\/\/[a-f0-9-]+\.(?:png|jpe?g|gif|webp|bmp)\/?|data:image\/(?:png|jpeg|gif|webp|bmp);base64,[a-z0-9+/=]+)$/i,
 link:/^(?:https?:|mailto:)/i,
 attr(tag,key,value){
  if(key==='class'||key==='style')return true;
  if(tag==='a'&&key==='href')return this.link.test(value);
  if(tag==='img'&&key==='src')return this.image.test(value);
  if(tag==='img'&&key==='alt')return true;
  if(tag==='img'&&['width','height'].includes(key))return /^\d{1,4}$/.test(value);
  if(tag==='font'&&key==='color')return this.styles.color.test(value);
  return ['td','th'].includes(tag)&&['colspan','rowspan'].includes(key)&&/^[1-9]\d?$/.test(value);
 }
};
if(typeof module==='object'&&module.exports)module.exports=policy;else root.BizuMaterialPolicy=policy;
})(typeof globalThis!=='undefined'?globalThis:this);
