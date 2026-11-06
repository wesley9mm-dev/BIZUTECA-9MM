'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {_electron:electron} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const dates = require('../src/core/dates');
const {decodePackage,assertDirectory} = require('../src/core/storage');
const {lessonCount} = require('../src/core/bizulanguage');
const {Library} = require('../src/core/library');
const runtime = require('../src/core/runtime');

const root = path.resolve(__dirname,'..');
const data = fs.mkdtempSync(path.join(os.tmpdir(),'bizuteca-e2e-'));
const output = path.join(root,'test-results');
fs.mkdirSync(output,{recursive:true});
const logo = fs.readFileSync(path.join(root,'src/assets/bizuteca.png'));
const future = dates.key(new Date(new Date().getFullYear()+1,1,20));
let application, page;
const pageErrors = [];

async function launch(libraryBase=data) {
  const packaged = process.env.BIZUTECA_E2E_EXECUTABLE;
  application = await electron.launch({
    executablePath:packaged || require('electron'),
    args:packaged ? [] : [root],
    env:{...process.env,BIZUTECA_TEST_DATA:libraryBase},
    timeout:30000
  });
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    page=application.windows().find(candidate=>candidate.url().endsWith('/index.html'));
    if(page)break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(page,'Janela principal não carregou');
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')console.error('Renderer:',message.text());});
  await page.locator('#main > :first-child').waitFor();
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Salvo'));
}
const call = (op,...args) => page.evaluate(({op,args})=>window.biz.call(op,...args),{op,args});
const button = name => page.getByRole('button',{name,exact:true});
async function saved() {
  await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Salvo'));
}
async function step(name,run) {
  await run();
  console.log('PASS '+name);
}

(async()=>{
  try {
    // MPEG-1 Layer III frames with silent payload, used to exercise local playback.
    const musicFolder=path.join(data,'musicas');
    fs.mkdirSync(musicFolder,{recursive:true});
    const frame=Buffer.alloc(417);
    frame.set([0xff,0xfb,0x90,0x64]);
    const silence=Buffer.concat(Array.from({length:1600},()=>frame));
    fs.writeFileSync(path.join(musicFolder,'Primeira faixa.mp3'),silence);
    fs.writeFileSync(path.join(musicFolder,'Segunda faixa.mp3'),silence);
    await launch();
    await step('Reprodutor abre em silêncio e permite tocar, pausar e ajustar o volume',async()=>{
      await page.locator('#music-player summary').click();
      await page.locator('#music-play:not([disabled])').waitFor();
      assert.equal(await page.locator('#music-autoplay').isChecked(),false);
      assert.equal(await page.locator('#music-audio').evaluate(audio=>audio.paused&&!audio.getAttribute('src')),true);
      await page.locator('#music-play').click();
      await page.waitForFunction(()=>{
        const audio=document.querySelector('#music-audio');
        return !audio.paused&&audio.currentTime>0;
      });
      assert.equal((await call('listMusic')).tracks.length,2);
      await page.locator('#music-play').click();
      assert.equal(await page.locator('#music-audio').evaluate(audio=>audio.paused),true);
      await page.locator('#music-volume').fill('35');
      await page.locator('#music-volume').dispatchEvent('change');
      await page.waitForFunction(async()=>(await window.biz.call('listMusic')).options.volume===35);
      assert.equal(await page.locator('#music-audio').evaluate(audio=>audio.volume),0.35);
      await page.locator('#music-play').click();
      await page.waitForFunction(()=>!document.querySelector('#music-audio').paused);
      await page.locator('#music-autoplay').check();
      await page.waitForFunction(async()=>(await window.biz.call('listMusic')).options.autoplay===true);
      await page.locator('#music-autoplay').uncheck();
      await page.waitForFunction(async()=>(await window.biz.call('listMusic')).options.autoplay===false);
      await page.locator('#music-play').click();
      await page.locator('#music-player summary').click();
    });

    await step('Universos Visuais carregam a arte local e aplicam o fundo',async()=>{
      await page.locator('[data-view="themes"]').click();
      await button('Universos Visuais').click();
      assert.equal(await page.locator('.universe-card-art img').count(),38);
      const missing=await page.locator('.universe-card-art img').evaluateAll(async images=>{
        const failures=[];
        for(const thumbnail of images){
          const image=new Image();
          image.src=thumbnail.src;
          try{await image.decode();}catch{failures.push(thumbnail.src);}
        }
        return failures;
      });
      assert.deepEqual(missing,[]);
      await page.locator('[data-theme-apply="universe-goku-e-bills-no-horizonte-azul"]').click();
      await page.waitForFunction(()=>document.body.dataset.universe==='true'
        &&getComputedStyle(document.body).backgroundImage.includes('universe-goku-e-bills-no-horizonte-azul'));
      assert.equal((await call('init')).settings.theme,'universe-goku-e-bills-no-horizonte-azul');
      await button('Universos Visuais').click();
      await page.locator('[data-theme-preview="universe-goku-e-bills-no-horizonte-azul"]').click();
      await page.locator('#universe-wallpaper').fill('35');
      await page.locator('#universe-interface').fill('80');
      assert.deepEqual(await page.evaluate(()=>{
        const style=document.documentElement.style;
        return [style.getPropertyValue('--wallpaper-veil'),style.getPropertyValue('--interface-fill'),document.body.dataset.translucent];
      }),['65%','80%','true']);
      await page.locator('#cancel-preview').click();
      assert.equal(await page.evaluate(()=>document.body.dataset.translucent),'false');
      await page.locator('[data-theme-preview="universe-goku-e-bills-no-horizonte-azul"]').click();
      await page.locator('#universe-wallpaper').fill('35');
      await page.locator('#universe-interface').fill('80');
      await page.locator('#accept-preview').click();
      await page.waitForFunction(async()=>{
        const data=await window.biz.call('init');
        return data.settings.universeAppearance?.['universe-goku-e-bills-no-horizonte-azul']?.interface===80;
      });
      assert.deepEqual((await call('init')).settings.universeAppearance['universe-goku-e-bills-no-horizonte-azul'],
        {wallpaper:35,interface:80});
      await button('Restaurar padrão 9MM').click();
      await page.waitForFunction(()=>document.body.dataset.universe==='false');
    });
    await step('Abertura com a coleção BizuLanguage',async()=>{
      const folders=await call('listFolders');
      assert.deepEqual(folders.filter(folder=>folder.parentId===null).map(folder=>folder.name).sort(),
        ['Espanhol','Francês','Inglês','Italiano']);
      const notes=await call('listNotes');
      assert.equal(notes.length,lessonCount);
      const english=folders.find(folder=>folder.name==='Inglês');
      const beginner=folders.find(folder=>folder.parentId===english.id&&folder.name==='Iniciante');
      await page.locator('[data-folder-id="'+english.id+'"]').click();
      await page.locator('[data-folder-id="'+beginner.id+'"]').click();
      const first=notes.find(note=>note.folderId===beginner.id&&note.title.startsWith('00.'));
      await page.locator('[data-note-id="'+first.id+'"]').click();
      await page.locator('#editor').getByText('BizuLanguage',{exact:true}).waitFor();
      assert.equal(await page.locator('#tree .tree-row[tabindex="0"]').count(),1);
      await page.locator('[data-note-id="'+first.id+'"]').press('F2');
      await page.getByRole('dialog',{name:'Opções da anotação'}).waitFor();
      await page.keyboard.press('Escape');
      await page.locator('#note-focus').click();
      await page.locator('#workspace.focus-writing').waitFor();
      await page.locator('#note-focus').click();
      await page.locator('#workspace.focus-writing').waitFor({state:'detached'});
      await page.locator('#note-find').fill('BizuLanguage');
      await page.locator('#note-find').press('Enter');
      assert.match(await page.locator('#note-find-count').textContent(),/^1 de /);
      await page.locator('#home').click();
      assert.equal((await call('init')).version,require('../package.json').version);
      await page.locator('#next-event').getByText('Nenhum compromisso futuro.').waitFor();
      await page.locator('#home-folders').waitFor();
      assert.equal(await page.locator('#home-folders [data-open-folder]').count(),4);
      assert.equal(await page.locator('#main [data-open-note]').count(),0);
      await page.locator('#home-folders [data-open-folder="'+english.id+'"]').click();
      await page.getByRole('heading',{name:'Inglês',exact:true}).waitFor();
      assert.equal(await page.locator('#main [data-open-folder]').count(),4);
      await page.locator('#home').click();
      await page.locator('#home-folders').waitFor();
      await page.screenshot({path:path.join(output,'home.png')});
    });
    let noteId,folderId;
    await step('Seletor pesquisável, caminhos clicáveis e histórico',async()=>{
      const parent=await call('createFolder',{name:'Direito Constitucional'});
      await page.locator('#home').click();
      await page.waitForSelector('[data-folder-id="'+parent+'"]');
      await page.locator('#new-folder').click();
      await page.locator('#dialog input[name=name]').fill('Emendas constitucionais');
      await page.locator('[data-folder-filter]').fill('constitucional');
      await page.locator('[data-pick-id="'+parent+'"]').click();
      await button('Confirmar').click();
      await page.getByRole('heading',{name:'Emendas constitucionais'}).waitFor();
      const folder=(await call('listFolders')).find(f=>f.name==='Emendas constitucionais');
      assert.equal(folder.parentId,parent);folderId=folder.id;
      await page.locator('#home').click();
      await page.locator('#home-folders').waitFor();
      assert.equal(await page.locator('#home-folders [data-open-folder]').count(),5);
      assert.equal(await page.locator('#home-folders [data-open-folder="'+folderId+'"]').count(),0);
      await page.locator('#home-folders [data-open-folder="'+parent+'"]').click();
      await page.locator('#main [data-open-folder="'+folderId+'"]').click();
      await page.getByRole('heading',{name:'Emendas constitucionais',exact:true}).waitFor();
      await page.locator('#folder-note').click();
      await page.locator('#note-title').fill('Revisão de emendas');
      await page.locator('#editor').fill('Estudo sobre revisão constitucional.');
      noteId=(await call('listNotes')).find(note=>note.folderId===folderId).id;
      await page.locator('[data-crumb="'+parent+'"]').click();
      await page.getByRole('heading',{name:'Direito Constitucional'}).waitFor();
      await button('Voltar').click();
      await page.locator('#editor').waitFor();
      assert.match((await call('getNote',noteId)).contentText,/revisão constitucional/);
      await page.keyboard.press('Alt+ArrowRight');
      await page.getByRole('heading',{name:'Direito Constitucional'}).waitFor();
      await page.keyboard.press('Alt+ArrowLeft');
      await page.locator('#editor').waitFor();
    });
    await step('Formatação, tabela, imagem, clipboard e exportação da imagem',async()=>{
      await page.locator('#editor').focus();
      await page.keyboard.press('Control+a');
      await page.locator('[data-command=bold]').click();
      await page.locator('#editor').press('End');
      await page.locator('#insert-table').click();
      await button('Confirmar').click();
      await page.locator('#editor td').first().click();
      await page.locator('.editor-more summary').click();
      await button('Adicionar linha').click();
      assert.equal(await page.locator('#editor tr').count(),4);
      const src=await call('saveImage',{data:logo.toString('base64'),mime:'image/png'});
      await page.locator('#editor').evaluate((editor,src)=>{
        const image=document.createElement('img');
        image.src=src;image.alt='Imagem de teste';
        editor.append(image);editor.dispatchEvent(new InputEvent('input',{bubbles:true}));
      },src);
      const image=page.getByRole('img',{name:'Imagem de teste'});
      await image.click({button:'right'});
      await button('Copiar imagem').click();
      await page.getByText('Imagem copiada.',{exact:true}).waitFor();
      assert.ok(await application.evaluate(async ({clipboard,ClipboardItem})=>{
        if (!ClipboardItem) return !clipboard.readImage().isEmpty();
        for (const item of await clipboard.read()) {
          if (item.types.includes('image/png') && (await item.getType('image/png')).size > 0) return true;
        }
        return false;
      }));
      const exported=path.join(data,'imagem-exportada.png');
      await application.evaluate(({dialog},name)=>{
        dialog.showSaveDialog=async()=>({canceled:false,filePath:name});
      },exported);
      await image.click({button:'right'});
      await button('Salvar imagem como…').click();
      await page.getByText('Imagem salva.',{exact:true}).waitFor();
      assert.deepEqual(fs.readFileSync(exported),logo);
      await saved();
      const note=await call('getNote',noteId);
      assert.match(note.contentHtml,/<(?:b|strong)(?:\s|>)/);
      assert.match(note.contentHtml,/<table>/);
      assert.match(note.contentHtml,/tv-attachment:\/\//);
      await page.screenshot({path:path.join(output,'editor.png')});
    });
    await step('Calendário, próximo compromisso e atualização',async()=>{
      await page.locator('[data-view=calendar]').click();
      await button('Novo evento').click();
      await page.locator('[name=title]').fill('Prova de teste');
      await page.locator('[name=day]').fill(future);
      await page.locator('[name=time]').fill('09:00');
      await page.locator('[name=note]').fill('Levar documento.');
      await button('Salvar').click();
      await page.locator('.event-row').getByText('Prova de teste',{exact:true}).waitFor();
      await page.locator('#home').click();
      await page.locator('#next-event').getByText('Prova de teste',{exact:true}).waitFor();
      await page.locator('#open-next-event').click();
      assert.equal(await page.locator('[data-day="'+future+'"]').getAttribute('aria-pressed'),'true');
      await button('Editar').click();
      await page.locator('[name=title]').fill('Prova revisada');
      await button('Salvar').click();
      await page.locator('.event-row').getByText('Prova revisada',{exact:true}).waitFor();
      await page.screenshot({path:path.join(output,'calendario.png')});
    });
    await step('Pacotes .b9mm e .bizuteca e restauração em pasta separada',async()=>{
      const file=path.join(data,'biblioteca-teste.b9mm');
      await application.evaluate(({dialog},name)=>{
        dialog.showSaveDialog=async()=>({canceled:false,filePath:name});
      },file);
      assert.equal(await call('exportLibrary'),file);
      assert.equal(decodePackage(fs.readFileSync(file)).images.length,1);
      const oldExtension=path.join(data,'biblioteca-antiga.bizuteca');
      fs.copyFileSync(file,oldExtension);
      await application.evaluate(({dialog},name)=>{
        dialog.showOpenDialog=async()=>({canceled:false,filePaths:[name]});
      },oldExtension);
      const merge=await call('importLibrary','merge');
      assert.equal(merge.duplicates,lessonCount+1);assert.equal(merge.eventsDuplicates,1);
      const savedDirectory=(await call('init')).directory;
      await call('createNote',{title:'Somente na biblioteca anterior'});
      await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
      const restored=await call('importLibrary','replace');
      assert.equal(restored.previousDirectory,savedDirectory);
      assert.notEqual(restored.directory,savedDirectory);
      assert.ok(fs.existsSync(path.join(savedDirectory,'biblioteca.db')));
      assert.equal((await call('listEvents'))[0].title,'Prova revisada');
      assert.equal((await call('listNotes')).length,lessonCount+1);
      assert.equal((await call('getNote',noteId)).folderId,folderId);
    });
    await step('Janela compacta e busca offline',async()=>{
      await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.isVisible()).setSize(1024,720));
      await page.locator('#global-search').fill('revisão');
      await page.locator('[data-search-note]').first().waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,'busca-compacta.png')});
      assert.deepEqual(pageErrors,[]);
    });
    await page.locator('#home').click();
    await page.locator('#next-event').getByText('Prova revisada',{exact:true}).waitFor();
    console.log('PASS Evento restaurado aparece na Home');
    await application.close();
    application=null;
    page=null;
    await launch();
    await page.locator('#home').click();
    await page.locator('#next-event').getByText('Prova revisada',{exact:true}).waitFor();
    assert.equal((await call('listEvents')).length,1);
    assert.equal((await call('listNotes')).length,lessonCount+1);
    console.log('PASS Evento e nota persistem após fechar e reabrir');
    const existing=(await call('init')).directory;
    await application.close();
    application=null;
    page=null;
    const blocked=fs.mkdtempSync(path.join(os.tmpdir(),'bizuteca-e2e-bloqueado-'));
    fs.writeFileSync(runtime.supportDirectory(blocked),'bloqueia a gravação no local portátil');
    const pointer=runtime.configurationPath(blocked,blocked,assertDirectory);
    fs.writeFileSync(pointer,JSON.stringify({absolute:existing}));
    await launch(blocked);
    assert.equal((await call('init')).directory,existing);
    assert.equal((await call('listNotes')).length,lessonCount+1);
    assert.equal((await call('listEvents')).length,1);
    console.log('PASS Pasta escolhida reaproveitada sem pedir localização ao abrir');
    await application.close();
    application=null;
    page=null;
    const previous=fs.mkdtempSync(path.join(os.tmpdir(),'bizuteca-e2e-antigo-'));
    const previousLibrary=new Library(path.join(previous,'biblioteca.db'));
    const personal=previousLibrary.createNote({title:'Anotação antiga',contentHtml:'<p>Meu texto</p>'});
    previousLibrary.close();
    await launch(previous);
    assert.equal((await call('listNotes')).length,1);
    await page.locator('#home').click();
    await page.locator('#home-folders').waitFor();
    assert.equal(await page.locator('#home-folders [data-open-folder]').count(),0);
    await page.getByRole('heading',{name:'Anotações sem pasta',exact:true}).waitFor();
    await page.locator('#main [data-open-note="'+personal+'"]').waitFor();
    await page.locator('[data-view=settings]').click();
    await page.locator('#apply-bizulanguage').click();
    await button('Confirmar').click();
    await page.getByText(lessonCount+' aulas BizuLanguage adicionadas.',{exact:true}).waitFor();
    assert.equal((await call('listNotes')).length,lessonCount+1);
    assert.equal((await call('getNote',personal)).contentText,'Meu texto');
    assert.equal(await call('applyBizuLanguage'),0);
    console.log('PASS Coleção opcional acrescentada uma vez à biblioteca existente');
    await step('Importar TXT cria as anotações dentro da subpasta aberta',async()=>{
      const parent=await call('createFolder',{name:'Português'});
      const child=await call('createFolder',{name:'Sintaxe',parentId:parent});
      const files=['Regência','Concordância'].map(name=>path.join(previous,name+'.txt'));
      for(const file of files)fs.writeFileSync(file,'Texto para revisão.');
      await application.evaluate(({dialog},paths)=>{
        dialog.showOpenDialog=async(_window,options)=>{
          if(options.filters[0].extensions.join()!=='txt')throw Error('Filtro TXT não aplicado.');
          return {canceled:false,filePaths:paths};
        };
        dialog.showMessageBox=async(_window,options)=>{
          if(!options.detail.includes('Sintaxe'))throw Error('Destino incorreto.');
          return {response:1};
        };
      },files);
      await page.locator('#home').click();
      await page.locator('#home-folders [data-open-folder="'+parent+'"]').click();
      await page.locator('#main [data-open-folder="'+child+'"]').click();
      await page.locator('#folder-import-txt').click();
      await page.getByText('2 anotação(ões) importada(s).',{exact:true}).waitFor();
      const notes=(await call('listNotes')).filter(note=>note.folderId===child);
      assert.deepEqual(notes.map(note=>note.title).sort(),['Concordância','Regência']);
    });
  } catch(error) {
    console.error(error);
    if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'falha.png')}).catch(()=>{});
    process.exitCode=1;
  } finally {
    if(application)await application.close();
  }
})();
