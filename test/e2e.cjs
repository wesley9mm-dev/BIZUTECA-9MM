'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {_electron:electron} = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const dates = require('../src/core/dates');
const {decodePackage} = require('../src/core/storage');

const root = path.resolve(__dirname,'..');
const data = fs.mkdtempSync(path.join(os.tmpdir(),'bizuteca-e2e-'));
const output = path.join(root,'test-results');
fs.mkdirSync(output,{recursive:true});
const logo = fs.readFileSync(path.join(root,'src/assets/bizuteca.png'));
const future = dates.key(new Date(new Date().getFullYear()+1,1,20));
let application, page;
const pageErrors = [];

async function launch() {
  const packaged = process.env.BIZUTECA_E2E_EXECUTABLE;
  application = await electron.launch({
    executablePath:packaged || require('electron'),
    args:packaged ? [] : [root],
    env:{...process.env,BIZUTECA_TEST_DATA:data},
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
  await page.locator('#main h1').waitFor();
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
    await launch();
    await step('Abertura e biblioteca vazia',async()=>{
      assert.equal((await call('listFolders')).length,0);
      assert.equal((await call('init')).version,'1.1.0');
      await page.locator('#next-event').getByText('Nenhum compromisso futuro.').waitFor();
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
      await page.locator('#folder-note').click();
      await page.locator('#note-title').fill('Revisão de emendas');
      await page.locator('#editor').fill('Estudo sobre revisão constitucional.');
      noteId=(await call('listNotes'))[0].id;
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
      assert.ok(await application.evaluate(({clipboard})=>!clipboard.readImage().isEmpty()));
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
      assert.equal(merge.duplicates,1);assert.equal(merge.eventsDuplicates,1);
      const savedDirectory=(await call('init')).directory;
      await call('createNote',{title:'Somente na biblioteca anterior'});
      await application.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});
      const restored=await call('importLibrary','replace');
      assert.equal(restored.previousDirectory,savedDirectory);
      assert.notEqual(restored.directory,savedDirectory);
      assert.ok(fs.existsSync(path.join(savedDirectory,'biblioteca.db')));
      assert.equal((await call('listEvents'))[0].title,'Prova revisada');
      assert.equal((await call('listNotes')).length,1);
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
  } catch(error) {
    console.error(error);
    if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'falha.png')}).catch(()=>{});
    process.exitCode=1;
  } finally {
    if(application)await application.close();
  }
})();
