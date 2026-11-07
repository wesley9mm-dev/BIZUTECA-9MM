'use strict';
const snowball = require('snowball-stemmers').newStemmer('portuguese');
const ABBR = require('./data/abreviaturas.json');
const strip=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const words=s=>String(s??'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
const STOP=new Set("a o as os um uma uns umas de do da dos das dum duma em no na nos nas num numa por pelo pela pelos pelas para pra com sem sob sobre entre ate desde apos perante durante mediante conforme segundo e ou mas nem que se como ao aos quando onde qual quais quanto quantos cujo cuja cujos cujas isso isto esse essa esses essas este esta estes estas aquele aquela aquilo ele ela eles elas voce voces seu sua seus suas meu minha nosso sao foi foram sera serao era eram ser sendo sido ter tem tinha tendo ha havia nao sim mais menos muito muita ja tambem so apenas ainda todo toda todos todas outro outra mesmo mesma cada qualquer algum alguma alguns algumas nenhum nenhuma tal tais assim entao porem contudo todavia entretanto porque pois logo assinale alternativa alternativas correta correto corretas corretos incorreta incorreto julgue item itens seguir seguinte seguintes acerca considere considerando afirmativa afirmativas afirmacao questao assertiva verdadeira verdadeiro falsa falso certo errado apresentada apresentado analise texto abaixo acima respeito referente relacao proposicao opcao letra exceto o q pq vc frase frases muitas muitos incorretas incorretos afirmacoes assertivas sentenca".split(/\s+/));
const NUMWORDS={"zero":0,"dois":2,"duas":2,"tres":3,"quatro":4,"cinco":5,"seis":6,"sete":7,"oito":8,"nove":9,"dez":10,"onze":11,"doze":12,"treze":13,"catorze":14,"quatorze":14,"quinze":15,"dezesseis":16,"dezessete":17,"dezoito":18,"dezenove":19,"vinte":20,"trinta":30,"quarenta":40,"cinquenta":50,"sessenta":60,"setenta":70,"oitenta":80,"noventa":90,"cem":100,"cento":100,"meio":2,"meios":2,"terco":3,"tercos":3,"quarto":4,"quartos":4,"quinto":5,"quintos":5,"sexto":6,"sextos":6,"setimo":7,"setimos":7,"oitavo":8,"oitavos":8,"nono":9,"nonos":9,"decimo":10,"decimos":10,"um":1,"uma":1};
const CANON={artigo:'art',artigos:'art',arts:'art',art:'art',paragrafo:'par',paragrafos:'par',inciso:'inc',incisos:'inc',alinea:'alin',alineas:'alin'};
const cache=new Map();
function stem(word){
 let w=String(word).toLowerCase(),n=strip(w);
 if(/\d/.test(w)||w.length<3)return n;
 if(NUMWORDS[n]!==undefined)return String(NUMWORDS[n]);
 if(CANON[n])return CANON[n];
 if(n==='leis')return 'lei';
 if(cache.has(n))return cache.get(n);
 // Restore the productive suffix before Snowball when the user omitted accents.
 w=w.replace(/(coes|ções|caes|cães|caos|cãos)$/,'ção').replace(/cao$/,'ção');
 w=w.replace(/(ões|ães|ãos|oes|aes|aos)$/,'ão').replace(/ais$/,'al').replace(/(?:éis|eis)$/,'el').replace(/(?:óis|ois)$/,'ol');
 if(w.length>3&&w.endsWith('s')&&!/(is|us|ês)$/.test(w))w=w.slice(0,-1);
 if(w.endsWith('ção')&&w.length>5)w=w.slice(0,-3);
 let r=strip(snowball.stem(w));
 // Snowball's residual -er step treats infinitives and their plurals differently.
 if(r==='poder')r='pod';
 if(cache.size>20000)cache.clear();
 cache.set(n,r);return r;
}
function numericText(text){
 return String(text).replace(/\b\d{1,3}(?:[. ]\d{3})+\b/g,s=>s.replace(/[. ]/g,''));
}
const stemText=text=>words(numericText(text)).map(stem).join(' ');
module.exports={strip,words,stem,stemText,STOP,NUMWORDS,ABBR,numericText};
