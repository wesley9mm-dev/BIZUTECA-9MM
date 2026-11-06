(function(root){'use strict';
const groups=['Masculinos','Femininos','Infantis','Geek e tecnologia','Kawaii e anime','Outros estilos'];
const raw=[
 ['obsidian','OBSIDIANA',0,'Luxo sombrio · divisórias douradas e superfícies de obsidiana','#0B0B0D','#19191e','#C9A45C','#f4eee2','luxury','Georgia','2px','lines'],
 ['titanium','TITANIUM',0,'Tecnologia industrial · painéis robustos e marcações técnicas','#171B20','#262e37','#249BFF','#f2f7ff','technical','Segoe UI','3px','grid'],
 ['carbon','CARBON RACING',0,'Automobilismo · fibra de carbono e detalhes de corrida','#111111','#202020','#E32636','#F5F5F5','racing','Segoe UI','1px','diagonal'],
 ['tactical','TACTICAL OPS',0,'Verde 9MM · caderno tático e painéis operacionais','#07150d','#0c1c12','#55f746','#edf6ec','tactical','Segoe UI','7px','grid'],
 ['nordic','NORDIC STEEL',0,'Viking moderno · aço, geometria e divisórias nórdicas','#17232D','#243745','#B7C4CC','#f0f5f7','nordic','Georgia','2px','diamonds'],
 ['burgundy','ROYAL BURGUNDY',0,'Biblioteca clássica · couro, bronze e títulos serifados','#251A18','#382925','#D6AB73','#f7e9d5','classic','Georgia','5px','leather'],
 ['rose','ROSE QUARTZ',1,'Rosa elegante · papelaria rosé e cantos delicados','#FFF8FA','#fffdfd','#9c4c65','#38232c','soft','Georgia','15px','petals'],
 ['lavender','LAVENDER DREAM',1,'Sonho lilás · nuvens abstratas e superfícies macias','#eee8fa','#faf7ff','#654B82','#33233e','cloud','Segoe UI','20px','clouds'],
 ['pearl','PEARL CHIC',1,'Pérola minimalista · champanhe e acabamento refinado','#F8F5F0','#fffefa','#71645D','#302b28','pearl','Georgia','4px','lines'],
 ['crimson','CRIMSON QUEEN',1,'Rainha carmim · molduras douradas e contraste dramático','#1D1118','#341924','#E6B76E','#f9eaf0','royal','Georgia','9px','diamonds'],
 ['moon','MOON GARDEN',1,'Jardim lunar · céu noturno e detalhes botânicos','#181d37','#242747','#D6A7B4','#eef0fc','garden','Georgia','16px','stars'],
 ['aurora','AURORA BLOOM',1,'Aurora floral · coral, sálvia e superfícies claras','#fff2e9','#fffaf6','#9b493e','#3e302e','floral','Georgia','18px','petals'],
 ['dino','DINO LAND',2,'Dinossauros · pegadas, vegetação e formas arredondadas','#f0f7dd','#fcfff3','#357139','#21371f','playful','Trebuchet MS','22px','footprints'],
 ['ocean','OCEAN BUDDIES',2,'Fundo do mar · bolhas e curvas aquáticas','#e8f8fc','#f7feff','#087aa4','#153d4b','aquatic','Trebuchet MS','25px','bubbles'],
 ['astronaut','LITTLE ASTRONAUT',2,'Exploradores do espaço · órbitas e estrelas','#1b1d50','#292A70','#FFE37A','#f2f0ff','space','Trebuchet MS','18px','stars'],
 ['candy','CANDY POP',2,'Mundo dos doces · confeitos e botões macios','#fff0f7','#fffbfd','#a13c71','#4c2740','candy','Trebuchet MS','26px','confetti'],
 ['forest','FOREST FRIENDS',2,'Amigos da floresta · creme, folhas e cartões orgânicos','#f5eddc','#fff9ed','#426d37','#30452d','forest','Trebuchet MS','19px','leaves'],
 ['blocks','TOY BLOCKS',2,'Blocos de montar · molduras modulares e relevo','#f3f5fa','#ffffff','#235cad','#23334d','blocks','Trebuchet MS','5px','blocks'],
 ['cyber','CYBER NEON',3,'Cyberpunk · recortes angulares, ciano e magenta','#080914','#13152a','#00E5FF','#f2f4ff','cyber','Segoe UI','0px','grid'],
 ['hacker','HACKER TERMINAL',3,'Terminal retrô · fonte monoespaçada e linhas de console','#050805','#0d1b11','#39FF72','#c7f4ce','terminal','Consolas','0px','scan'],
 ['pixel','PIXEL QUEST',3,'RPG retrô · molduras duplas e inventário pixelado','#252044','#35305b','#F6CF62','#f6f1ff','pixel','Consolas','0px','pixels'],
 ['mecha','MECHA CORE',3,'Robôs e armaduras · placas técnicas e faixas vermelhas','#101d33','#172A49','#BBCAD8','#edf5ff','mecha','Segoe UI','2px','diagonal'],
 ['arcane','ARCANE CODEX',3,'Magia e RPG · molduras de códice e dourado místico','#21172f','#352550','#D8BC81','#f3ebfb','arcane','Georgia','10px','diamonds'],
 ['galactic','GALACTIC COMMAND',3,'Ficção científica · mapa estelar e painéis de nave','#0b132b','#111C39','#4BD9E7','#E8F6FF','galactic','Segoe UI','9px','stars'],
 ['mochi','MOCHI DREAM',4,'Kawaii pastel · nuvens, adesivos e cartões macios','#FFF4E8','#fffafd','#9c4e79','#453043','mochi','Trebuchet MS','24px','clouds'],
 ['neko','NEKO CAFÉ',4,'Gatinhos anime · cafeteria, patinhas e tons caramelo','#f8eee4','#fffbf7','#745342','#453227','cafe','Trebuchet MS','17px','footprints'],
 ['chibi','CHIBI STAR',4,'Anime chibi · selos de estrelas e papelaria alegre','#eef7ff','#fffcff','#7650a5','#35324b','chibi','Trebuchet MS','23px','stars'],
 ['lolita','LOLITA TEA PARTY',4,'Moda japonesa · renda, laços e molduras de salão de chá','#FFF3E7','#fffaf4','#814A62','#4c2d3e','lace','Georgia','14px','lace'],
 ['bunny','BUNNY CLOUD',4,'Coelhinhos e nuvens · branco, azul e formas suaves','#f4faff','#FFFDFB','#6b587f','#3b3546','bunny','Trebuchet MS','28px','clouds'],
 ['strawberry','STRAWBERRY MILK',4,'Moranguinho · papelaria de frutas e detalhes de folha','#FFF4EF','#fffafb','#a33e5c','#4f2935','berry','Trebuchet MS','18px','confetti'],
 ['paper','MINIMAL PAPER',5,'Papel e escrita · caderno claro com linhas opcionais','#FAF8F2','#fffefb','#385C85','#252f3c','paper','Segoe UI','3px','ruled'],
 ['academia','DARK ACADEMIA',5,'Biblioteca antiga · madeira, papel e títulos acadêmicos','#241e18','#38271F','#E8D8BC','#f5ecdb','academic','Georgia','4px','leather'],
 ['vapor','VAPORWAVE',5,'Nostalgia digital · grades retrô e bordas rosa e ciano','#271b3d','#3d2855','#6DD6DE','#f6eafd','vapor','Consolas','5px','grid'],
 ['medieval','MEDIEVAL CODEX',5,'Manuscrito medieval · pergaminho e moldura ornamentada','#e0cca2','#f3e6c7','#8D3131','#493320','medieval','Georgia','2px','parchment'],
 ['brasil','BRASIL TROPICAL',5,'Identidade brasileira · folhagens e faixas geométricas','#eef7ec','#ffffff','#176d43','#21392d','tropical','Segoe UI','12px','leaves'],
 ['zen','ZEN NATURE',5,'Natureza e concentração · superfícies naturais e linhas orgânicas','#EAE2D2','#f7f4eb','#344C40','#293e33','zen','Segoe UI','15px','bamboo']
];
function rgb(h){return h.match(/\w\w/g).map(v=>parseInt(v,16));}
function luminance(h){return rgb(h).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function mix(a,b,t){return '#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('');}
const themes=raw.map(([id,name,g,description,bg,surface,accent,text,style,heading,round,pattern])=>({id,name,category:groups[g],description,bg,surface,accent,text,style,heading,round,pattern,sidebar:mix(bg,'#000000',.1),editor:surface,muted:mix(text,surface,.22),border:mix(accent,surface,.58),secondary:mix(accent,text,.45),ink:contrast(accent,'#08120c')>contrast(accent,'#ffffff')?'#08120c':'#ffffff',font:'Segoe UI',fontSize:14,shadow:g===2||g===4?'medium':'soft',decoration:.15,iconStyle:g===2||g===4?'badge':'line',buttonStyle:['blocks','pixel','technical'].includes(style)?'raised':'flat',background:''}));
function validate(theme){if(!theme||typeof theme!=='object'||typeof theme.name!=='string'||!theme.name.trim())throw Error('Tema sem nome.');const base=themes.find(t=>t.id===theme.base)||themes[3];const t={...base,...theme};for(const key of ['bg','surface','accent','text','sidebar','editor','muted','border','secondary','ink']){if(!/^#[0-9a-f]{6}$/i.test(t[key]))throw Error('Cor inválida: '+key);}if(contrast(t.text,t.editor)<4.5)throw Error('O texto precisa de mais contraste com o fundo do editor (mínimo 4,5:1).');if(contrast(t.text,t.bg)<4.5)throw Error('O texto precisa de mais contraste com o fundo da interface.');t.font=['Segoe UI','Georgia','Consolas','Trebuchet MS','Arial','Verdana'].includes(t.font)?t.font:'Segoe UI';t.heading=['Segoe UI','Georgia','Consolas','Trebuchet MS','Arial','Verdana'].includes(t.heading)?t.heading:'Segoe UI';t.fontSize=Math.max(12,Math.min(20,Number(t.fontSize)||14));t.round=Math.max(0,Math.min(28,parseInt(t.round)||0))+'px';t.decoration=Math.max(0,Math.min(.35,Number(t.decoration)||0));t.shadow=['none','soft','medium'].includes(t.shadow)?t.shadow:'soft';t.style=themes.some(v=>v.style===t.style)?t.style:base.style;t.pattern=themes.some(v=>v.pattern===t.pattern)?t.pattern:base.pattern;t.buttonStyle=t.buttonStyle==='raised'?'raised':'flat';t.iconStyle=t.iconStyle==='badge'?'badge':'line';if(t.background&&!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(t.background))throw Error('Imagem de fundo inválida.');t.name=t.name.trim().slice(0,70);t.visualUniverse=theme.custom===true&&theme.visualUniverse===true&&Boolean(t.background);t.artPosition=['left','center','right'].includes(t.artPosition)?t.artPosition:'right';t.category=t.visualUniverse?'Universos Visuais':theme.custom?'Meus temas':t.category;return t;}
const api={themes,groups,contrast,validate,mix};if(typeof module!=='undefined')module.exports=api;else root.BizThemes=api;
})(typeof window!=='undefined'?window:globalThis);
