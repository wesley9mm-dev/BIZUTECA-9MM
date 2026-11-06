'use strict';

const routeHistory = [];
let routeIndex = -1;
let replayingRoute = false;
let folderIndex = new Map();
const folderPaths = new Map();
let calendarDay = null;
let searchRoute = {query:'',folderId:null};

function indexFolders() {
  folderIndex = new Map(state.folders.map(folder => [folder.id,folder]));
  folderPaths.clear();
}
function folderChain(id) {
  const result = [], seen = new Set();
  while (id != null && !seen.has(id) && result.length < 100) {
    const folder = folderIndex.get(id);
    if (!folder) break;
    seen.add(id); result.unshift(folder); id=folder.parentId;
  }
  return result;
}
function cachedFolderPath(id) {
  if (!folderPaths.has(id)) folderPaths.set(id,folderChain(id).map(folder=>folder.name).join(' / '));
  return folderPaths.get(id);
}
function breadcrumbs(id) {
  const chain = folderChain(id);
  return '<nav class="breadcrumb" aria-label="Caminho da pasta"><button data-crumb-home>Biblioteca</button>' +
    chain.map(folder=>'<span aria-hidden="true">/</span><button data-crumb="'+folder.id+'" title="'+esc(folder.name)+'">'+esc(folder.name)+'</button>').join('') +
    (chain.length?'':'<span> / Sem pasta</span>')+'</nav>';
}
function rememberView(view) {
  if (view !== 'search') state.searchSeq++;
  if (!replayingRoute) {
    const previous = routeHistory[routeIndex];
    const route = {view, id:view==='editor'?state.note?.id:view==='folder'?state.folderId:null,
      day:view==='calendar'?calendarDay:null, search:view==='search'?{...searchRoute}:null, scroll:0};
    if (!previous || previous.view!==route.view || previous.id!==route.id ||
        previous.day!==route.day || JSON.stringify(previous.search)!==JSON.stringify(route.search)) {
      if (previous) previous.scroll=$('#main').scrollTop;
      routeHistory.splice(routeIndex+1);
      routeHistory.push(route);
      if (routeHistory.length>100) routeHistory.shift();
      routeIndex=routeHistory.length-1;
    }
  }
  updateNavigationButtons();
}
function updateNavigationButtons() {
  $('#nav-back').disabled=routeIndex<=0 || replayingRoute;
  $('#nav-next').disabled=routeIndex>=routeHistory.length-1 || replayingRoute;
}
async function replayRoute(direction) {
  if (replayingRoute) return;
  let index=routeIndex+direction;
  while (index>=0 && index<routeHistory.length) {
    const route=routeHistory[index];
    if ((route.view!=='folder'||folderIndex.has(route.id)) &&
        (route.view!=='editor'||state.notes.some(note=>note.id===route.id))) break;
    index+=direction;
  }
  if (index<0 || index>=routeHistory.length) return;
  await flush();
  if (replayingRoute) return;
  routeHistory[routeIndex].scroll=$('#main').scrollTop;
  const route=routeHistory[index];
  replayingRoute=true; updateNavigationButtons();
  try {
    if (route.view==='folder') await showFolder(route.id);
    else if (route.view==='editor') await openNote(route.id);
    else if (route.view==='calendar') await calendar(route.day);
    else if (route.view==='search') await globalSearch(route.search.query,route.search.folderId);
    else await navigate(route.view);
    $('#main').scrollTop=route.scroll;
    routeIndex=index;
  } finally { replayingRoute=false; updateNavigationButtons(); }
}
function folderPicker(name,selected,exclude=[]) {
  return '<div class="field folder-picker" data-folder-picker data-excluded="'+exclude.join(',')+'">'+
    '<label>Pesquisar pasta<input type="search" data-folder-filter placeholder="Digite o nome ou o caminho"></label>'+
    '<input type="hidden" name="'+name+'" value="'+(selected??'')+'">'+
    '<p class="help">Destino <strong data-folder-chosen>'+esc(cachedFolderPath(selected)||'Nível principal')+'</strong></p>'+
    '<div class="folder-picker-results" data-folder-results aria-label="Destinos disponíveis"></div></div>';
}
function wireFolderPickers(dialog) {
  for (const picker of dialog.querySelectorAll('[data-folder-picker]')) {
    const filter=picker.querySelector('[data-folder-filter]');
    const results=picker.querySelector('[data-folder-results]');
    const value=picker.querySelector('input[type=hidden]');
    const chosen=picker.querySelector('[data-folder-chosen]');
    const excluded=new Set(picker.dataset.excluded.split(',').filter(Boolean).map(Number));
    const candidates=state.folders.filter(folder=>!folderChain(folder.id).some(parent=>excluded.has(parent.id)))
      .map(folder=>({id:folder.id,path:cachedFolderPath(folder.id),name:normalize(folder.name),root:folder.parentId==null}));
    function draw() {
      const query=normalize(filter.value.trim());
      const terms=query.split(/\s+/).filter(Boolean);
      const found=candidates.filter(folder=>query?terms.every(term=>normalize(folder.path).includes(term)):folder.root);
      if (query) found.sort((a,b)=>Number(b.name===query)-Number(a.name===query)||
        Number(b.name.includes(query))-Number(a.name.includes(query))||a.path.length-b.path.length);
      const options=[{id:'',path:'Nível principal'},...found.slice(0,80)];
      results.innerHTML=options.map(folder=>'<button type="button" data-pick-id="'+folder.id+'" aria-pressed="'+
        (String(folder.id)===value.value)+'">'+esc(folder.path)+'</button>').join('')+
        (found.length>80?'<p class="help">Refine a pesquisa para ver outros resultados.</p>':'');
    }
    filter.addEventListener('input',draw);
    filter.addEventListener('keydown',event=>{
      if (event.key==='ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus(); }
    });
    results.addEventListener('click',event=>{
      const button=event.target.closest('[data-pick-id]');
      if (!button) return;
      value.value=button.dataset.pickId;
      chosen.textContent=button.textContent;
      for (const item of results.querySelectorAll('button')) item.setAttribute('aria-pressed',String(item===button));
    });
    results.addEventListener('keydown',event=>{
      if (!['ArrowDown','ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      const list=Array.from(results.querySelectorAll('button'));
      const index=list.indexOf(event.target)+(event.key==='ArrowDown'?1:-1);
      if (index<0) filter.focus(); else list[index]?.focus();
    });
    draw();
  }
}
function setSidebarWidth(value=state.prefs.sideWidth) {
  const consultation=$('#workspace').classList.contains('hide-consult')?0:Math.min(330,innerWidth*.27);
  const width=Math.max(220,Math.min(650,innerWidth-consultation-370,Number(value)||300));
  document.documentElement.style.setProperty('--side-width',width+'px');
  return width;
}
async function nextEventCard() {
  const card=$('#next-event');
  if (!card) return;
  const events=await api('listEvents');
  if (!card.isConnected) return;
  const now=new Date(), next=BizDates.nextEvent(events,now);
  const days=next?BizDates.daysBetween(BizDates.key(now),next.day):0;
  const distance=days===0?'Hoje':days===1?'Amanhã':'Faltam '+days+' dias';
  card.innerHTML='<div class="eyebrow">PRÓXIMO EVENTO</div>'+
    (next?'<button class="event-preview" id="open-next-event"><strong>'+esc(next.title)+'</strong><span>'+
      esc(BizDates.parse(next.day).toLocaleDateString('pt-BR',{dateStyle:'long'}))+
      (next.time?' às '+next.time:'')+' · '+distance+'</span></button>':
      '<p class="help">Nenhum compromisso futuro.</p><button class="outline small" id="open-next-event">Abrir calendário</button>');
  card.querySelector('button').onclick=()=>run(()=>calendar(next?.day));
}
async function calendar(day=BizDates.key(new Date())) {
  await leaveEditor();
  state.folderId=null;
  calendarDay=BizDates.parse(day)?day:BizDates.key(new Date());
  setView('calendar');
  const events=await api('listEvents');
  if (state.view!=='calendar'||calendarDay!==day && BizDates.parse(day)) return;
  const selected=BizDates.parse(calendarDay),year=selected.getFullYear(),month=selected.getMonth();
  const first=new Date(year,month,1,12), end=new Date(year,month+1,0,12).getDate();
  const today=BizDates.key(new Date()), datesWithEvents=new Set(events.map(event=>event.day));
  const cells=Array(first.getDay()).fill('<span></span>');
  for(let i=1;i<=end;i++){
    const value=BizDates.key(new Date(year,month,i,12));
    cells.push('<button type="button" data-day="'+value+'" class="calendar-day'+(value===today?' today':'')+
      (datesWithEvents.has(value)?' has-events':'')+'" aria-pressed="'+(value===calendarDay)+'" aria-label="'+value+
      (datesWithEvents.has(value)?', com eventos':'')+'">'+i+'</button>');
  }
  const daily=events.filter(event=>event.day===calendarDay);
  $('#main').innerHTML=intro('DATAS IMPORTANTES','Calendário','Registre as datas que você quer lembrar.')+
    '<div class="calendar-layout"><section class="calendar-box"><div class="calendar-header"><button id="month-back" aria-label="Mês anterior">‹</button><strong>'+
    esc(first.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}))+'</strong><button id="month-next" aria-label="Próximo mês">›</button></div>'+
    '<div class="calendar-grid">'+['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d=>'<span class="calendar-weekday">'+d+'</span>').join('')+
    cells.join('')+'</div></section><section class="calendar-events"><h2>'+esc(selected.toLocaleDateString('pt-BR',{dateStyle:'long'}))+
    '</h2><button class="primary" id="add-event">Novo evento</button>'+
    (daily.length?daily.map(event=>'<article class="event-row"><div><strong>'+esc(event.title)+'</strong><small>'+
      (event.time||'Dia inteiro')+'</small><p>'+esc(event.note)+'</p></div><button class="outline small" data-edit-event="'+event.id+'">Editar</button></article>').join(''):
      '<p class="help">Nenhum evento neste dia.</p>')+'</section></div>';
  const step=offset=>BizDates.key(new Date(year,month+offset,1,12));
  $('#month-back').onclick=()=>run(()=>calendar(step(-1)));
  $('#month-next').onclick=()=>run(()=>calendar(step(1)));
  $('#add-event').onclick=()=>run(()=>editEvent(null));
  for(const button of $$('[data-day]'))button.onclick=()=>run(()=>calendar(button.dataset.day));
  for(const button of $$('[data-edit-event]'))button.onclick=()=>run(()=>editEvent(daily.find(event=>event.id===Number(button.dataset.editEvent))));
}
async function editEvent(event) {
  const body='<label class="field">Título<input name="title" autofocus required maxlength="220" value="'+esc(event?.title||'')+'"></label>'+
    '<div class="form-grid"><label class="field">Data<input name="day" type="date" required value="'+esc(event?.day||calendarDay)+'"></label>'+
    '<label class="field">Horário opcional<input name="time" type="time" value="'+esc(event?.time||'')+'"></label></div>'+
    '<label class="field">Observação opcional<textarea name="note" rows="4" maxlength="8000">'+esc(event?.note||'')+'</textarea></label>';
  const actions=[{id:'cancel',text:'Cancelar'},{id:'save',text:'Salvar',primary:true}];
  if(event)actions.splice(0,0,{id:'delete',text:'Excluir',danger:true});
  const result=await openDialog(event?'Editar evento':'Novo evento',body,actions);
  if(result.id==='save'){await api('saveEvent',{...result.values,id:event?.id});await calendar(result.values.day);}
  if(result.id==='delete'&&await confirmAction('Excluir evento?','O compromisso será removido do calendário.')){
    await api('deleteEvent',event.id);await calendar(calendarDay);
  }
}
function wireUpgrades() {
  $('#nav-back').onclick=()=>run(()=>replayRoute(-1));
  $('#nav-next').onclick=()=>run(()=>replayRoute(1));
  $('#nav-library').onclick=()=>run(()=>navigate('home'));
  $('#main').addEventListener('click',event=>{
    const item=event.target.closest('[data-crumb],[data-crumb-home]');
    if (item) run(()=>item.hasAttribute('data-crumb-home')?navigate('home'):showFolder(Number(item.dataset.crumb)));
  });
  document.addEventListener('keydown',event=>{
    if(event.altKey&&!event.ctrlKey&&['ArrowLeft','ArrowRight'].includes(event.key)&&!$('#dialog').open){
      event.preventDefault();run(()=>replayRoute(event.key==='ArrowLeft'?-1:1));
    }
  });
  window.addEventListener('resize',()=>setSidebarWidth());
  $('#resize-library').ondblclick=()=>{state.prefs.sideWidth=300;setSidebarWidth();soonPrefs();};
  setInterval(()=>{if(state.view==='home')run(nextEventCard);},30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.view==='home')run(nextEventCard);});
}
