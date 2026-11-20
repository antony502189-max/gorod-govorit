const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,...(process.env.GG_BROWSER_EXECUTABLE?{executablePath:process.env.GG_BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1050}}),page=await context.newPage();
const base=process.env.GG_TEST_URL||'http://127.0.0.1:4176/gorod-govorit/';
fs.mkdirSync('qa',{recursive:true});
const errors=[],requests=[],checks=[];
context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
context.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});
page.on('dialog',d=>d.accept());
const saved=()=>page.locator('#workspaceStatus [role=status]').filter({hasText:'Все изменения сохранены'}).waitFor({state:'attached'});
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
try{
 await check('Static subpath, fonts and photos',async()=>{await page.goto(base);await page.getByRole('heading',{name:'Нижний Новгород',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.fonts.check('16px Inter')));await page.locator('.hero-photo').evaluate(e=>e.decode());assert.ok(await page.locator('.hero-photo').evaluate(e=>e.naturalWidth>0));await page.screenshot({path:'qa/home-desktop.png',fullPage:true});});
 await check('Search, empty state, place card and route',async()=>{await page.locator('#cityQuery').fill('zzzz');await page.getByText(/Ничего не нашлось/).waitFor();await page.locator('#cityQuery').fill('кремль');await page.locator('#searchResults [data-place=kremlin]').click();await page.getByRole('dialog').waitFor();await page.locator('#placeRoute').click();await page.locator('#saveRoute').waitFor();assert.match(await page.locator('.route-layout>div').last().innerText(),/Кремль и городские панорамы/);await page.locator('[data-time="30"]').click();await page.locator('#saveRoute').waitFor();assert.equal(await page.locator('#routePicker option').count(),1);await page.locator('#saveRoute').click();await page.getByRole('button',{name:'Маршрут сохранён',exact:true}).waitFor();});
 await check('Source answer and refusal',async()=>{await page.goto(base+'#guides');await page.locator('[data-chat=gorky]').click();await page.locator('#question').fill('Какое ваше настоящее имя?');await page.locator('#askForm').press('Enter');await page.locator('#messages').getByText(/Пешкова/).waitFor();await page.getByRole('button',{name:'Источники',exact:true}).click();const sources=page.getByRole('dialog',{name:'Источники',exact:true});assert.match(await sources.getByRole('link',{name:/Музей Горького и Шаляпина/}).getAttribute('href'),/^https:/);await page.keyboard.press('Escape');await sources.waitFor({state:'hidden'});await saved();await page.locator('#question').fill('Какая температура на Венере?');await page.locator('#askForm').press('Enter');await page.locator('#messages').getByText(/нет достаточно/).waitFor();await saved();await page.screenshot({path:'qa/chat-desktop.png',fullPage:true});});
 await check('Voice turns share text history and the microphone stops on mode change',async()=>{
  const voiceContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  try {
   const tab=await voiceContext.newPage();
   await tab.addInitScript(()=>{
    const speech={cancellations:0,played:[]};
    window.testSpeech=speech;
    window.SpeechRecognition=class {
     start(){speech.active=this;queueMicrotask(()=>this.onstart());}
     stop(){this.onend();}
     abort(){speech.cancellations++;this.onend();}
     result(text, isFinal){this.onresult({results:[Object.assign([{transcript:text}],{isFinal})]});}
     reply(text){this.result(text, true);this.onend();}
    };
    Object.defineProperty(window,'speechSynthesis',{value:{
     getVoices:()=>[],cancel(){},
     speak(utterance){
      speech.played.push(utterance.text);
      utterance.onstart();
     },
    }});
   });
   await tab.goto(base+'#chat');
   await tab.locator('[data-mode-to=voice]').click();
   const voice=tab.locator('.conversation[data-mode=voice]');
   await voice.waitFor();
   assert.ok(!await tab.locator('#messages').isVisible());
   assert.ok(!await tab.locator('#mobileNav').isVisible());
   const stage=await tab.locator('.conversation-avatar').boundingBox();
   assert.ok(stage.width>=389&&stage.height>400);
   await tab.locator('#micButton').click();
   await tab.getByText('Слушаю вас…',{exact:true}).waitFor();
   await tab.evaluate(()=>window.testSpeech.active.reply('Какое ваше настоящее имя?'));
   await tab.locator('#voiceCaption').getByText(/Пешкова/).waitFor();
   await tab.getByText('Персонаж говорит',{exact:true}).waitFor();
   assert.match(await tab.evaluate(()=>window.testSpeech.played[0]),/Пешкова/);
   await tab.locator('[data-mode-to=text]').click();
   await tab.locator('#messages').getByText('Какое ваше настоящее имя?',{exact:true}).waitFor();
   await tab.locator('#messages').getByText(/Пешкова/).waitFor();
   const portrait=await tab.locator('.conversation-avatar').boundingBox();
   const log=await tab.locator('#messages').boundingBox();
   assert.ok(portrait.width<80&&portrait.y>=log.y+log.height);
   await tab.locator('[data-mode-to=voice]').click();
   await tab.locator('#micButton').click();
   await tab.getByText('Слушаю вас…',{exact:true}).waitFor();
   await tab.keyboard.press('Escape');
   await tab.locator('.conversation[data-mode=text]').waitFor();
   assert.equal(await tab.evaluate(()=>window.testSpeech.cancellations),1);
   await tab.locator('[data-mode-to=voice]').click();
   await tab.locator('#micButton').click();
   await tab.getByText('Слушаю вас…',{exact:true}).waitFor();
   await tab.evaluate(()=>window.testSpeech.active.onerror({error:'not-allowed'}));
   await tab.getByText(/Разрешите доступ к микрофону/).waitFor();
   await tab.getByRole('button',{name:'Задать вопрос',exact:true}).click();
   await tab.getByText('Слушаю вас…',{exact:true}).waitFor();
   await tab.evaluate(()=>window.testSpeech.active.result('Что вы написали?', false));
   await tab.locator('#voiceCaption').getByText('Что вы написали?',{exact:true}).waitFor();
   await tab.getByRole('button',{name:'Завершить вопрос',exact:true}).click();
   await tab.locator('#voiceCaption').getByText(/Произведения Горького/).waitFor();
   await tab.getByText('Персонаж говорит',{exact:true}).waitFor();
   assert.match(await tab.evaluate(()=>window.testSpeech.played.at(-1)),/Макар Чудра/);
   await tab.getByRole('button',{name:'Задать вопрос',exact:true}).click();
   await tab.getByText('Слушаю вас…',{exact:true}).waitFor();
   await tab.evaluate(()=>window.testSpeech.active.onend());
   await tab.getByText(/Не расслышал вопрос/).waitFor();
   assert.equal(await tab.evaluate(()=>window.testSpeech.played.length),2);

  } finally { await voiceContext.close(); }
 });
 await check('Create avatar, upload, draft and knowledge persist',async()=>{await page.goto(base+'#guides');await page.locator('#newGuide').click();await page.locator('[name=name]').fill('Смотритель маяка');await page.locator('[name=role]').fill('Гид по учебной выставке');await page.locator('#avatarUpload').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN5sAAAAASUVORK5CYII=','base64')});await page.getByText('Картинка добавлена в черновик.',{exact:false}).waitFor();assert.equal(await page.locator('[name=name]').inputValue(),'Смотритель маяка');await page.locator('#studio-knowledge').click();await page.locator('#addDoc').click();await page.locator('#docForm [name=title]').fill('Экскурсия на маяк');await page.locator('#docForm [name=text]').fill('Учебная экскурсия на маяк начинается в 16:30 у северного входа.');await page.locator('#docForm [name=source]').fill('Программа выставки');await page.getByRole('button',{name:'Сохранить материал',exact:true}).click();await page.locator('#docForm').waitFor({state:'detached'});await saved();await page.reload();await page.locator('[name=name]').waitFor();assert.equal(await page.locator('[name=name]').inputValue(),'Смотритель маяка');await page.locator('#previewChat').click();await page.locator('#question').fill('Экскурсия на маяк');await page.locator('#askForm').press('Enter');await page.locator('#messages').getByText(/16:30/).waitFor();await saved();});
 await check('Offline answers and saving without API',async()=>{await page.goto(base+'#guides');await page.locator('[data-edit=hotel]').click();await context.setOffline(true);await page.locator('#studio-knowledge').click();await page.locator('[data-doc=h-breakfast]').click();await page.locator('#docForm [name=text]').fill('В учебной гостинице завтрак с 08:30 до 11:00.');await page.getByRole('button',{name:'Сохранить материал',exact:true}).click();await page.locator('#docForm').waitFor({state:'detached'});await page.locator('#previewChat').click();await page.locator('#question').fill('Во сколько завтрак?');await page.locator('#askForm').press('Enter');await page.locator('#messages').getByText(/08:30/).waitFor();await saved();await context.setOffline(false);assert.deepEqual(requests,[]);});
 await check('Two tabs keep conflicting drafts',async()=>{await page.goto(base+'#studio');const q=await context.newPage();q.on('dialog',d=>d.accept());await q.goto(base+'#studio');await q.locator('[name=name]').fill('Черновик второй вкладки');await page.locator('[name=name]').fill('Версия первой вкладки');await page.getByRole('button',{name:'Сохранить персонажа',exact:true}).click();await saved();await q.getByRole('button',{name:'Сохранить персонажа',exact:true}).click();await q.locator('#workspaceStatus').getByText(/В другом окне/).waitFor();assert.equal(await q.locator('[name=name]').inputValue(),'Черновик второй вкладки');await q.locator('#loadRemote').click();await q.locator('#workspaceStatus').getByText('Все изменения сохранены').waitFor();assert.equal(await q.locator('[name=name]').inputValue(),'Версия первой вкладки');await q.close();});
 await check('Export, import and validation',async()=>{const d=page.waitForEvent('download');await page.locator('#backupProject').click();await(await d).saveAs('qa/test-export.json');const fresh=await browser.newContext(),q=await fresh.newPage();q.on('dialog',d=>d.accept());await q.goto(base+'#about');await q.locator('#importProject').setInputFiles('qa/test-export.json');await q.getByText('Проект восстановлен',{exact:true}).waitFor();await q.goto(base+'#guides');assert.equal(await q.locator('.guide-card').count(),4);await q.goto(base+'#about');await q.locator('#importProject').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"guides":[null]}')});await q.locator('#toast').getByText(/Импорт:/).waitFor();await fresh.close();});
 await check('Visitor screen follows selected guide',async()=>{const q=await context.newPage();await q.goto(base+'#screen');await q.locator('#screenAnswer').waitFor();await page.goto(base+'#guides');await page.locator('[data-edit=gorky]').click();await q.getByRole('heading',{name:'Максим Горький',exact:true}).waitFor();await q.locator('#screenFormat').click();assert.equal(await q.locator('.round-format').count(),1);await q.close();});
 await check('Keyboard dialog focus and return',async()=>{await page.locator('#studio-knowledge').click();await page.locator('#addDoc').click();await page.locator('#closeModal').focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Сохранить материал');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'addDoc');});
 const clean=await browser.newContext(),m=await clean.newPage();
 await check('320 and 390px: all eight screens fit',async()=>{for(const width of [320,390]){await m.setViewportSize({width,height:844});for(const route of ['home','guides','studio','chat','routes','screen','about','analytics']){await m.goto(base+'#'+route);await m.locator('main').waitFor();if(route==='routes')await m.locator('#saveRoute').waitFor();else await m.locator('main h1:visible, main h2:visible').first().waitFor();await m.evaluate(()=>document.fonts.ready);assert.ok(await m.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' overflow '+width);if(['home','chat','routes','studio'].includes(route))await m.screenshot({path:`qa/${route}-${width}.png`,fullPage:true});}}});
 await check('Mobile bottom navigation and modal',async()=>{await m.goto(base);await m.locator('[data-place=kremlin]').first().click();await m.locator('#closeModal').click();await m.locator('#mobileNav [href="#routes"]').click();await m.locator('#saveRoute').waitFor();await m.locator('#mobileNav [href="#about"]').click();await m.locator('.more-links [href="#studio"]').click();await m.locator('#guideForm').waitFor();});
 await clean.close();assert.deepEqual(errors,[]);checks.push('No JavaScript errors');
} catch(e){await page.screenshot({path:'qa/failure.png',fullPage:true});throw e;}finally{fs.writeFileSync('qa/results.json',JSON.stringify({date:new Date().toISOString(),base,checks,errors,apiRequests:requests},null,2));await browser.close();}
