'use strict';
window.BizMusic=(()=>{
  const get=id=>document.getElementById('music-'+id);
  const audio=get('audio'),play=get('play'),next=get('next'),volume=get('volume');
  const autoplay=get('autoplay'),random=get('random'),title=get('track');
  let tracks=[],queue=[],current='',wanted=false,starting=false;

  function update(){
    play.disabled=!tracks.length;
    next.disabled=tracks.length<2;
    play.textContent=wanted?'Pausar':'Play';
  }
  function nextTrack(){
    if(!queue.length){
      queue=tracks.slice();
      for(let i=queue.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [queue[i],queue[j]]=[queue[j],queue[i]];
      }
      if(queue.length>1&&queue.at(-1)===current)queue.unshift(queue.pop());
    }
    return queue.pop();
  }
  function failed(){
    wanted=false;
    starting=false;
    title.textContent='Não foi possível reproduzir '+current;
    update();
  }
  function resume(){audio.play().catch(error=>{if(error.name!=='AbortError'&&wanted)failed();});}
  function start(shouldPlay=true){
    const track=nextTrack();
    if(!track)return;
    audio.pause();
    current=track;
    title.textContent=track.replace(/\.mp3$/i,'');
    wanted=shouldPlay;
    starting=true;
    audio.preload='metadata';
    audio.src='biz-music://local/'+encodeURIComponent(track);
    update();
  }
  function stop(){
    wanted=false;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    starting=false;
    current='';
    queue=[];
  }
  function adjustVolume(){
    audio.volume=Number(volume.value)/100;
    get('volume-value').value=volume.value+'%';
  }
  async function saveOptions(){
    try{await window.biz.call('saveMusicOptions',{volume:Number(volume.value),autoplay:autoplay.checked,randomStart:random.checked});}
    catch{title.textContent='Não foi possível salvar as opções de música.';}
  }
  async function load(){
    const result=await window.biz.call('listMusic');
    stop();
    tracks=result.tracks;
    volume.value=result.options.volume??20;
    autoplay.checked=result.options.autoplay===true;
    random.checked=result.options.randomStart!==false;
    title.textContent=tracks.length?tracks.length+' faixa(s) disponível(is)':'Nenhuma música adicionada';
    adjustVolume();
    update();
    if(autoplay.checked)start();
  }
  audio.addEventListener('loadedmetadata',()=>{
    if(!starting)return;
    starting=false;
    const duration=audio.duration;
    if(random.checked&&Number.isFinite(duration)&&duration>0){
      const tail=Math.min(300,duration*.15);
      audio.currentTime=Math.random()*(duration-tail);
    }
    if(wanted)resume();
  });
  audio.addEventListener('ended',()=>{if(wanted)start();});
  audio.addEventListener('error',()=>{if(current)failed();});
  play.onclick=()=>{
    if(!current||audio.error){start();return;}
    wanted=!wanted;
    if(!wanted)audio.pause();
    else if(!starting)resume();
    update();
  };
  next.onclick=()=>start(wanted);
  volume.oninput=adjustVolume;
  volume.onchange=autoplay.onchange=random.onchange=saveOptions;
  get('add').onclick=async()=>{
    const button=get('add');
    button.disabled=true;
    try{
      const added=await window.biz.call('addMusic');
      if(!added)return;
      tracks=added;
      queue=[];
      if(!current)start(autoplay.checked);
      update();
    }catch{title.textContent='Não foi possível copiar os MP3s para a pasta da biblioteca.';}
    finally{button.disabled=false;}
  };
  return {load};
})();
