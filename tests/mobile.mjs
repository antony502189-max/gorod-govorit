const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({headless:true,...(process.env.GG_BROWSER_EXECUTABLE?{executablePath:process.env.GG_BROWSER_EXECUTABLE}:{})});
const base=process.env.GG_TEST_URL||'http://127.0.0.1:4176/gorod-govorit/';
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});const p=await context.newPage(),errors=[],checks=[];
p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
fs.mkdirSync('qa/mobile',{recursive:true});
const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name);};
try{
 await check('Small and tall phones: no overflow, readable input, reachable navigation',async()=>{
  for(const [width,height] of [[320,568],[360,740],[390,844],[430,932]]){
   await p.setViewportSize({width,height});
   for(const route of ['home','guides','studio','chat','routes','screen','about','analytics']){
    await p.goto(base+'#'+route);await p.locator('main h1:visible,main h2:visible').first().waitFor();if(route==='routes')await p.locator('#routePicker').waitFor();
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width} ${route}: overflow`);
    assert.ok(await p.locator('input:not([type=file]):not([type=checkbox]):not([type=color]),textarea,select').evaluateAll(es=>es.filter(e=>e.offsetWidth).every(e=>parseFloat(getComputedStyle(e).fontSize)>=16)),`${route}: input font triggers iOS zoom`);
    if(route!=='screen'){const r=await p.locator('#mobileNav').boundingBox();assert.ok(r.y+r.height<=height+1);}
    if(['home','chat','routes','studio'].includes(route))await p.screenshot({path:`qa/mobile/${route}-${width}.png`,fullPage:false});
   }
  }
 });
 await check('Studio: draft survives all three tabs, advanced controls and guide switch',async()=>{
  await p.setViewportSize({width:390,height:844});await p.goto(base+'#studio');await p.locator('[name=name]').fill('Мобильный гид');await p.locator('#studio-knowledge').click();await p.locator('#addDoc').waitFor();await p.locator('#studio-preview').click();assert.match(await p.locator('.studio-preview h3').innerText(),/Мобильный гид/);await p.locator('#studio-profile').click();assert.equal(await p.locator('[name=name]').inputValue(),'Мобильный гид');await p.getByText('Голос и оформление',{exact:true}).click();await p.locator('[name=voice]').selectOption('friendly');await p.locator('#guidePicker').selectOption('nika');await p.waitForFunction(()=>document.querySelector('[name=name]').value==='Ника');await p.locator('#guidePicker').selectOption('gorky');await p.waitForFunction(()=>document.querySelector('[name=name]').value==='Мобильный гид');assert.equal(await p.locator('[name=name]').inputValue(),'Мобильный гид');await p.getByRole('button',{name:'Сохранить персонажа',exact:true}).click();await p.locator('#workspaceStatus').getByText('Все изменения сохранены').waitFor();await p.reload();await p.locator('[name=name]').waitFor();assert.equal(await p.locator('[name=name]').inputValue(),'Мобильный гид');
 });
 await check('Mobile material sheet: scroll lock, save reachable, source retained',async()=>{
  await p.locator('#studio-knowledge').click();await p.locator('#addDoc').click();assert.equal(await p.evaluate(()=>getComputedStyle(document.body).overflow),'hidden');await p.locator('#docForm [name=title]').fill('Ночная прогулка');await p.locator('#docForm [name=text]').fill('Ночная прогулка начинается в 21:00 у маяка.');await p.locator('#docForm [name=source]').fill('Учебное расписание');await p.locator('#docForm [name=tags]').fill('ночная прогулка маяк');await p.getByRole('button',{name:'Сохранить материал',exact:true}).click();await p.locator('#docForm').waitFor({state:'detached'});await p.locator('[data-doc]').filter({hasText:'Изменить'}).last().waitFor();assert.ok(!await p.locator('body').evaluate(e=>e.classList.contains('modal-open')));await p.screenshot({path:'qa/mobile/knowledge-390.png'});
 });
 await check('Chat: composer fits a short visual viewport and sends without scrolling page',async()=>{
  await p.locator('#previewChat').click();await p.setViewportSize({width:390,height:430});await p.locator('#question').fill('Ночная прогулка');const b=await p.locator('#question').boundingBox(),nav=await p.locator('#mobileNav').boundingBox();assert.ok(b.y>=0&&b.y+b.height<=nav.y);await p.locator('#sendQuestion').click();await p.locator('#messages').getByText(/21:00/).waitFor();assert.equal(await p.evaluate(()=>document.documentElement.scrollTop),0);await p.screenshot({path:'qa/mobile/chat-short.png'});
 });
 await check('VisualViewport keyboard event hides navigation and keeps send control above keyboard',async()=>{
  await p.setViewportSize({width:390,height:844});await p.locator('#question').focus();
  await p.evaluate(()=>{Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>420});window.visualViewport.dispatchEvent(new Event('resize'));});
  assert.ok(await p.locator('body').evaluate(e=>e.classList.contains('keyboard-open')));assert.ok(!await p.locator('#mobileNav').isVisible());const b=await p.locator('#sendQuestion').boundingBox();assert.ok(b.y+b.height<=420);await p.screenshot({path:'qa/mobile/chat-keyboard-layout.png'});
  await p.evaluate(()=>{delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'));});
 });
 await check('Routes: selector, time filter, header save button and downloadable plan',async()=>{
  await p.goto(base+'#routes');await p.locator('#routePicker').selectOption('kremlin');await p.getByRole('heading',{name:'Кремль и городские панорамы',exact:true}).waitFor();await p.locator('#saveRoute').click();await p.locator('#saveRoute[aria-pressed=true]').waitFor();await p.locator('[data-time="30"]').click();await p.locator('#routePicker').waitFor();assert.equal(await p.locator('#routePicker option').count(),1);const r=await p.locator('#saveRoute').boundingBox();assert.ok(r.y>=0&&r.y+r.height<100);const d=p.waitForEvent('download');await p.locator('#downloadRoute').click();assert.equal((await d).suggestedFilename(),'marshrut.txt');
 });
 await check('Reference screens: featured walk, labels, zoom, stops and bookmarks',async()=>{
  await p.setViewportSize({width:390,height:844});
  await p.goto(base+'#home');
  const placeSave=p.locator('[data-place-save=kremlin]');
  await placeSave.click();
  await p.reload();
  assert.equal(await placeSave.getAttribute('aria-pressed'),'true');
  await p.locator('#featuredRoute').click();
  await p.getByRole('heading',{name:'Прогулка по кремлю и набережной'}).waitFor();
  assert.equal(await p.locator('[data-timeline-stop]').count(),4);
  const canvas=p.locator('.route-map-art > svg');
  const original=await canvas.getAttribute('viewBox');
  await p.locator('[data-map-action=in]').click();
  assert.notEqual(await canvas.getAttribute('viewBox'),original);
  await p.locator('[data-map-action=reset]').click();
  assert.equal(await canvas.getAttribute('viewBox'),original);
  await p.locator('[data-map-action=labels]').click();
  assert.equal(await p.locator('.route-map').getAttribute('data-labels'),'false');
  await p.locator('[data-timeline-stop="0"]').click();
  assert.equal(await p.locator('#selectedStop').innerText(),'Нижегородский кремль');
  assert.equal(await p.locator('[data-map-stop="0"]').getAttribute('aria-pressed'),'true');
  await p.locator('#saveRoute').click();
  await p.locator('#saveRoute[aria-pressed=true]').waitFor();
  await p.reload();
  assert.equal(await p.locator('#saveRoute').getAttribute('aria-pressed'),'true');
 });
 await check('Touch targets and reduced motion',async()=>{await p.goto(base+'#home');const small=await p.locator('button:visible,.quick-actions a,#mobileNav a').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height<44).map(e=>e.textContent));assert.deepEqual(small,[]);await p.emulateMedia({reducedMotion:'reduce'});await p.goto(base+'#screen');assert.equal(await p.locator('.bars i').first().evaluate(e=>getComputedStyle(e).animationName),'none');});
 assert.deepEqual(errors,[]);
}finally{fs.writeFileSync('qa/mobile/results.json',JSON.stringify({checks,errors},null,2));await browser.close();}
