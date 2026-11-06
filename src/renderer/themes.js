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
const universeArt=[
 ["danca-das-glicinias","Dança das Glicínias","Véus lilases entre cachos de flores","#24162e","#d6a9ee",50,37,"jpeg"],
 ["banquete-de-veludo","Banquete de Veludo","Veludo rubro, uvas e luz de salão","#2a121b","#f5a8a1",55,40,"jpg"],
 ["bordado-de-primavera","Bordado de Primavera","Hanbok rosa, flores e um cão adormecido","#2c2029","#ffd0de",53,37,"png"],
 ["retrato-em-azul-petroleo","Retrato em Azul-Petróleo","Luz azul fria e uma tiara negra","#0e202a","#9cdcec",54,36,"jpg"],
 ["katana-do-trovao","Katana do Trovão","Um espadachim sob a chuva e uma lâmina elétrica","#141b20","#ffdb86",55,35,"jpg"],
 ["circulo-da-valquiria","Círculo da Valquíria","Elmo alado diante de um arco de brasas","#241715","#f2ad7b",53,35,"jpg"],
 ["brasas-do-chapeu-de-palha","Brasas do Chapéu de Palha","Luffy em casaco vermelho entre faíscas","#281619","#ffb179",52,33,"jpg"],
 ["manto-da-chama-silenciosa","Manto da Chama Silenciosa","Manto branco com chamas vermelhas contra o breu","#1d171b","#ffa790",50,43,"jpg"],
 ["rastro-rubro-sobre-as-ruinas","Rastro Rubro sobre as Ruínas","Combate urbano sob aeronaves e um feixe vermelho","#27191d","#ff9993",56,38,"jpg"],
 ["sentinela-da-nevoa-ambar","Sentinela da Névoa Âmbar","Operador mascarado entre nuvens douradas","#282018","#edc185",56,39,"jpg"],
 ["esquadrilha-de-ouro","Esquadrilha de Ouro","Três caças sobre um soldado e uma explosão","#2c2110","#ffcf63",62,39,"jpg"],
 ["prata-em-contraluz","Prata em Contraluz","Retrato de franja negra e tecido prateado","#1c1b23","#d6cddd",44,34,"jpg"],
 ["dragao-bordado-em-luz","Dragão Bordado em Luz","Vestido escuro com bordado dourado e energia violeta","#2b192b","#f8b5dc",54,32,"jpg"],
 ["o-rugido-de-liberio","O Rugido de Liberio","Um titã irrompe sobre a cidade em chamas","#101d31","#a5ccff",52,30,"jpg"],
 ["dragao-do-eclipse","Dragão do Eclipse","Asas em ruínas diante de um eclipse violeta","#141b2d","#b4c1ff",51,34,"jpg"],
 ["malenia-ouro-e-cinzas","Malenia, Ouro e Cinzas","Armadura dourada e capa escarlate na penumbra","#27180f","#f4bf88",52,31,"jpg"],
 ["outono-aos-pes-do-fuji","Outono aos Pés do Fuji","Bordo vermelho, lago e pagode sob o sol rubro","#281b21","#ffa3a2",68,43,"jpg"],
 ["procurado-pela-marinha","Procurado pela Marinha","Luffy cercado por cartazes de recompensa","#2b161b","#ff9f9d",54,34,"jpg"],
 ["jinwoo-monarca-das-sombras","Jinwoo, Monarca das Sombras","Adaga e silhuetas cercadas de energia violeta","#180d2a","#ccaeff",49,36,"jpg"],
 ["mariposas-de-ametista","Mariposas de Ametista","Asas luminosas junto a uma coroa de flores","#251835","#e4a8ff",67,40,"jpg"],
 ["grimorio-das-constelacoes","Grimório das Constelações","Um livro aberto ilumina a noite estrelada","#211736","#f9b6e6",50,52,"jpg"],
 ["silhueta-em-couro-negro","Silhueta em Couro Negro","Retrato de estúdio com cabelo ao vento","#1c1b20","#ded0da",51,29,"jpg"],
 ["raposa-de-neon","Raposa de Neon","Olhos azuis, cabelo prateado e halo magenta","#1c1330","#c3afff",48,44,"jpg"],
 ["goku-e-bills-no-horizonte-azul","Goku e Bills no Horizonte Azul","A aura de Goku diante de Bills e da Terra","#0c1934","#8bd4ff",50,58,"jpg"],
 ["paetes-a-meia-luz","Paetês à Meia-Luz","Retrato em preto e branco com brilho discreto","#1d1c20","#d9d4df",42,30,"jpg"],
 ["carmim-em-luz-de-cobre","Carmim em Luz de Cobre","Batom vermelho e contraluz acobreada","#2e1e23","#ffb69b",59,35,"jpg"],
 ["petalas-sob-luz-violeta","Pétalas sob Luz Violeta","Retrato com tule rosa e iluminação lilás","#271733","#e9b5fc",49,32,"jpg"],
 ["mascara-da-raposa-carmesim","Máscara da Raposa Carmesim","Máscara branca de kitsune com traços vermelhos","#24202a","#ffaaa8",51,40,"jpg"],
 ["negativo-em-azul-e-cobre","Negativo em Azul e Cobre","Câmera analógica em um retrato de luz dividida","#132129","#9ed9e9",49,46,"jpg"],
 ["xadrez-cereja-em-aco","Xadrez Cereja em Aço","Tecido vermelho refletido em metal escovado","#292024","#ffadb7",51,32,"jpg"],
 ["oculos-de-neon-rosa","Óculos de Neon Rosa","Silhueta escura cercada por luz rosa e ciano","#1b1331","#f6aaff",49,40,"jpg"],
 ["frequencia-pirata","Frequência Pirata","Boombox e luzes de rua em um cenário cyberpunk","#251834","#eea7e6",54,30,"jpg"],
 ["o-senhor-das-correntes","O Senhor das Correntes","Armadura de ouro, correntes e crânios sobre brasas","#2c1d15","#ecc186",70,30,"jpg"],
 ["fogo-cruzado-em-night-city","Fogo Cruzado em Night City","Dois combatentes entre arranha-céus e fumaça","#15262d","#a0e4da",55,33,"jpg"],
 ["o-cerco-da-catedral-rubra","O Cerco da Catedral Rubra","Armadura carmim diante de torres góticas em chamas","#291b18","#efb589",66,36,"jpg"],
 ["presas-sob-o-letreiro","Presas sob o Letreiro","Retrato noturno com presas e letreiros luminosos","#181d25","#ffaaa7",56,43,"jpg"],
 ["camara-de-luz-ciano","Câmara de Luz Ciano","Retrato entre painéis metálicos com reflexos rosa","#11252c","#a3e4e7",41,38,"jpg"],
 ["lentes-de-onix","Lentes de Ônix","Óculos negros, corrente prateada e luz de estúdio","#201d28","#e3d1ef",50,40,"jpg"]
];
const universes=universeArt.map(([key,name,description,bg,accent,x,y,ext])=>{
 const id='universe-'+key;
 const text='#f5f1f8';
 const surface=mix(bg,'#000000',.24);
 const base=themes[3];
 return {...base,id,name,description,bg,surface,accent,text,category:'Universos Visuais',
   sidebar:mix(bg,'#000000',.36),editor:surface,muted:mix(text,surface,.22),
   border:mix(accent,surface,.65),secondary:mix(accent,text,.38),ink:'#08120c',
   decoration:0,visualUniverse:true,bundledArt:id,artFocus:x+'% '+y+'%',asset:'./universos/'+id+'.'+ext};
});
const bundledById=new Map(universes.map(theme=>[theme.id,theme]));
function backgroundSource(theme){return theme.background||bundledById.get(theme.bundledArt)?.asset||'';}
function validate(theme){if(!theme||typeof theme!=='object'||typeof theme.name!=='string'||!theme.name.trim())throw Error('Tema sem nome.');const base=bundledById.get(theme.base)||themes.find(t=>t.id===theme.base)||themes[3];const t={...base,...theme};for(const key of ['bg','surface','accent','text','sidebar','editor','muted','border','secondary','ink']){if(!/^#[0-9a-f]{6}$/i.test(t[key]))throw Error('Cor inválida: '+key);}if(contrast(t.text,t.editor)<4.5)throw Error('O texto precisa de mais contraste com o fundo do editor (mínimo 4,5:1).');if(contrast(t.text,t.bg)<4.5)throw Error('O texto precisa de mais contraste com o fundo da interface.');t.font=['Segoe UI','Georgia','Consolas','Trebuchet MS','Arial','Verdana'].includes(t.font)?t.font:'Segoe UI';t.heading=['Segoe UI','Georgia','Consolas','Trebuchet MS','Arial','Verdana'].includes(t.heading)?t.heading:'Segoe UI';t.fontSize=Math.max(12,Math.min(20,Number(t.fontSize)||14));t.round=Math.max(0,Math.min(28,parseInt(t.round)||0))+'px';t.decoration=Math.max(0,Math.min(.35,Number(t.decoration)||0));t.shadow=['none','soft','medium'].includes(t.shadow)?t.shadow:'soft';t.style=themes.some(v=>v.style===t.style)?t.style:base.style;t.pattern=themes.some(v=>v.pattern===t.pattern)?t.pattern:base.pattern;t.buttonStyle=t.buttonStyle==='raised'?'raised':'flat';t.iconStyle=t.iconStyle==='badge'?'badge':'line';if(t.background&&!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(t.background))throw Error('Imagem de fundo inválida.');t.name=t.name.trim().slice(0,70);const bundled=bundledById.get(theme.bundledArt);
 t.bundledArt=bundled?.id||'';
 t.visualUniverse=theme.visualUniverse===true&&Boolean(bundled||(theme.custom===true&&t.background));
 t.artFocus=!t.background&&bundled?bundled.artFocus:'';t.artPosition=['left','center','right'].includes(t.artPosition)?t.artPosition:'right';t.category=t.visualUniverse?'Universos Visuais':theme.custom?'Meus temas':t.category;return t;}
const api={themes,universes,groups,contrast,validate,mix,backgroundSource};if(typeof module!=='undefined')module.exports=api;else root.BizThemes=api;
})(typeof window!=='undefined'?window:globalThis);
