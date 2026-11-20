import {bindConversation,conversationPage} from './conversation.mjs?v=mode-icons';
import {cityPhotos} from './city-photos.mjs';
import {plainReply,renderReplyMarkdown} from './reply-markdown.mjs';
import {movePortrait,rememberPortrait,reveal,stopPortraitMotion} from './motion.mjs';
import {materialEditor,studioPage} from './studio.mjs';
import {mapFrame} from './route-map.mjs';
import {request as api} from './storage.mjs?v=source-style';
import {icon} from './icons.mjs?v=river-design';
import {initialState,sources,routes} from './data.mjs?v=river-design';
import {validateState} from './engine.mjs?v=source-style';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=initialState(),revision=0,ready=false,busy=false,filter=180,selectedRoute='waterfront',saveQueue=Promise.resolve();
const scope=new URL('.',import.meta.url).pathname;
const draftKey='gg-pages-drafts:'+scope;
const channel='BroadcastChannel'in window?new BroadcastChannel('gg-pages:'+scope):null;
const main=$('#main'),workspaceStatus=$('#workspaceStatus');
let dirty=false,conflict=false,saveError='',pendingSaves=0,viewId=0,askController=null,remotePending=false,screenRound=false;
let studioTab='profile',conversation=null;
const conversations=new Map();
const feedbackEvents=new WeakMap();
let mapZoom=1, mapLabels=true, activeStop=-1;
let savedPlaces=[];
try{const saved=JSON.parse(localStorage.getItem('gg-saved-places:'+scope)||'[]');if(Array.isArray(saved))savedPlaces=saved;}catch{}
let drafts={},routeData=null,routeError='',routeLoading=false,modalReturn=null;
try{drafts=JSON.parse(sessionStorage.getItem(draftKey)||'{}');}catch{}
function keepDrafts(){try{sessionStorage.setItem(draftKey,JSON.stringify(drafts));}catch{toast('Черновик слишком велик для восстановления после закрытия. Скачайте копию.');}}
function editGuide(){return drafts[state.selected]||guide();}
function captureDraft(){const form=$('#guideForm');if(!form)return;const g=drafts[state.selected]||structuredClone(guide());for(const [k,v]of new FormData(form))if(typeof v==='string')g[k]=v;if(JSON.stringify(g)===JSON.stringify(guide()))delete drafts[g.id];else drafts[g.id]=g;keepDrafts();status();}
function commitDrafts(){for(const [id,g]of Object.entries(drafts)){const i=state.guides.findIndex(x=>x.id===id);if(i>=0)state.guides[i]=structuredClone(g);}drafts={};keepDrafts();}
function exportProject(){captureDraft();const copy=structuredClone(state);copy.guides=copy.guides.map(g=>structuredClone(drafts[g.id]||g));download('gorod-govorit-project.json',JSON.stringify({format:'gorod-govorit',version:1,state:copy},null,2));}
function status(){const box=$('#workspaceStatus');if(!box)return;const changed=dirty||Object.keys(drafts).length;box.hidden=!(changed||pendingSaves||saveError||conflict||remotePending||['studio','about','analytics'].includes(location.hash.slice(1))); 
 box.innerHTML=`<span role="status">${esc(conflict?'В другом окне есть новая версия. Ваши изменения сохранены в черновике.':saveError|| (pendingSaves?'Сохраняем…':changed?'Есть несохранённые изменения':remotePending?'Доступно обновление из другого окна':'Все изменения сохранены'))}</span>${changed||saveError?'<button id="retrySave" class="button small">Сохранить изменения</button>':''}${conflict||remotePending?'<button id="loadRemote" class="button secondary small">Загрузить сохранённую версию</button>':''}<button id="backupProject" class="text-link">Скачать проект</button>`;
 $('#backupProject').onclick=exportProject;
 if(document.body.dataset.page==='chat')updateViewport();
 $('#retrySave')?.addEventListener('click',async()=>{captureDraft();commitDrafts();try{await save();render();}catch(e){toast(e.message);}});
 $('#loadRemote')?.addEventListener('click',async()=>{if((changed||conflict)&&!confirm('Текущий черновик будет заменён. Сначала скачайте проект, если хотите сохранить свои правки. Загрузить сохранённую версию?'))return;try{await saveQueue.catch(()=>{});await sync();drafts={};keepDrafts();dirty=false;conflict=false;saveError='';remotePending=false;render();status();}catch(e){toast(e.message);}});
}

function toast(text, feedback = false){
 const notice = $('#toast');
 notice.classList.toggle('chat-feedback-toast', feedback);
 if (feedback) notice.innerHTML = `<span class="toast-check" aria-hidden="true">${icon('check')}</span><span>${esc(text)}</span>`;
 else notice.textContent = text;
 notice.classList.add('show');
 clearTimeout(toast.timer);
 toast.timer = setTimeout(() => notice.classList.remove('show'), feedback ? 2500 : 4000);
}
async function sync(){const j=await api('/api/state');state=j.state;revision=j.revision;ready=true;}
function save({quiet=false}={}){
 const snapshot=structuredClone(state);dirty=true;pendingSaves++;
 if(!quiet)status();
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{
  if(conflict)throw Object.assign(Error('Сначала разрешите конфликт: скачайте черновик и загрузите сохранённую версию.'),{status:409});
  validateState(snapshot);
  const j=await api('/api/state',{method:'PUT',body:{state:snapshot,revision}});revision=j.revision;
  dirty=JSON.stringify(state)!==JSON.stringify(snapshot);saveError='';channel?.postMessage({type:'updated',revision});return j;
 }).catch(e=>{dirty=true;conflict ||= e.status===409;saveError=e.status===409?'Конфликт версий. Ваш черновик не потерян.':'Не удалось сохранить. Изменения остались здесь; повторите сохранение.';throw e;}).finally(()=>{pendingSaves--;if(!quiet||!pendingSaves||saveError)status();});return saveQueue;
}
function event(type,value=''){state.events.push({type,value:String(value).slice(0,100),guide:state.selected,at:new Date().toISOString()});state.events=state.events.slice(-200);}
function guide(){return state.guides.find(g=>g.id===state.selected)||state.guides[0];}
function art(g){if(g.image)return `<img src="${esc(g.image)}" alt="${esc(g.name)}">`;const common='viewBox="0 0 240 240" role="img" aria-label="Иллюстрация персонажа '+esc(g.name)+'"';
if(g.art==='writer')return `<svg ${common}><path d="M24 240q5-64 69-74h56q64 10 68 74" fill="#274b50"/><path d="m93 165 28 31 28-31-7 75H99z" fill="#e9e3d5"/><path d="m94 172 26 23-33 30-14-47m74-6-27 23 34 30 15-47" fill="#183c43"/><path d="M103 151h35v28q-17 24-35 0" fill="#c5a98c"/><ellipse cx="121" cy="104" rx="48" ry="58" fill="#d9bda0"/><path d="M75 106q-13-70 42-78 56-2 54 63l-18-27-23-12-32 15-15 40z" fill="#605d52"/><path d="M78 90q-19 54 9 71l-3-45m74-27q20 44-5 71l2-46" fill="#68665b"/><path d="M90 96q9-8 19-2m24 0q10-7 19 1" fill="none" stroke="#5e584d" stroke-width="4" stroke-linecap="round"/><circle cx="103" cy="104" r="3" fill="#29434b"/><circle cx="140" cy="104" r="3" fill="#29434b"/><path d="m122 107-5 17 10 2" fill="none" stroke="#b8987f" stroke-width="3"/><path d="M120 131q-18-8-32 8l-2 12 28-7 6-6 7 6 28 6-3-12q-15-15-32-7" fill="#736b5b"/><path d="M109 155q13 8 24-1" stroke="#a08470" stroke-width="2" fill="none"/></svg>`;
if(g.art==='fox')return `<svg ${common}><path d="M32 240q0-68 69-78h45q61 19 65 78" fill="#14747b"/><path d="m66 82-9-64 49 35m35 0 49-35-7 64" fill="#c77e3e"/><path d="m69 63-4-30 26 24m66 1 24-23-6 30" fill="#f5d9b5"/><path d="M61 80q58-61 120 0 20 51-20 87l-41 27-42-27q-40-39-17-87" fill="#d9954b"/><path d="m63 110 52 22 5 57-45-29zm114 0-52 22-5 57 46-29z" fill="#fff1dc"/><ellipse cx="94" cy="104" rx="5" ry="7" fill="#193d48"/><ellipse cx="148" cy="104" rx="5" ry="7" fill="#193d48"/><path d="m108 141 12 16 13-16q-12-7-25 0" fill="#193d48"/><path d="M108 167q12 10 25-1" fill="none" stroke="#684c39" stroke-width="3"/><path d="m99 186 22 20 23-20 15 54H86" fill="#fff5de"/><path d="m119 207 15 19-15 14-14-14z" fill="#d9954b"/></svg>`;
return `<svg ${common}><path d="M53 116q-14-86 51-92 74-12 81 58l-1 76H55" fill="#294c52"/><path d="M24 240q10-67 77-73h40q65 14 77 73" fill="#16828a"/><path d="m101 164 20 36 21-36 12 76H88z" fill="#fff7e7"/><path d="M105 146h33v33q-16 19-33-1" fill="#c99177"/><ellipse cx="121" cy="104" rx="43" ry="55" fill="#e2b79b"/><path d="M75 99q-10-69 52-68 41 5 40 63l-12-26q-39 4-52-14-4 21-28 45" fill="#294c52"/><path d="M91 97q8-6 17-1m27 0q9-6 17 1" fill="none" stroke="#72564c" stroke-width="3" stroke-linecap="round"/><circle cx="102" cy="106" r="3" fill="#193d48"/><circle cx="141" cy="106" r="3" fill="#193d48"/><path d="m122 108-5 17 8 1" stroke="#c8957c" stroke-width="2" fill="none"/><path d="M107 138q15 15 30-1" fill="#fff7e9"/><path d="M30 225h53v15H30z" fill="#f0d39b"/><path d="m75 180 22 13-15 47H61" fill="#0b616c"/></svg>`;}
function portrait(g,extra=''){return `<div class="portrait ${extra}" style="--portrait:${esc(g.color)}">${art(g)}</div>`;}
function materialCount(n){return n+' '+(n%10===1&&n%100!==11?'материал':n%10>=2&&n%10<=4&&!(n%100>=12&&n%100<=14)?'материала':'материалов');}
function guideCard(g,index){
 const spotlight=g.id==='gorky';
 const category=g.tag?.trim();
 const tag=category?`<span class="guide-tag">${esc(category)}</span>`:'';
 return `<article class="guide-card${spotlight?' guide-spotlight':''}" style="--guide-order:${Math.min(index,3)}">
   <div class="guide-profile">
     ${spotlight?tag:''}
     <div class="guide-title">
       <h2>${esc(g.name)}</h2>
       ${spotlight?'':tag}
     </div>
     <p>${esc(g.role)}</p>
   </div>
   <div aria-hidden="true" class="guide-portrait" data-portrait-for="${esc(g.id)}" style="--portrait:${esc(g.color)}">${art(g)}</div>
   <div class="guide-profile-actions">
     <button type="button" class="guide-talk" data-chat="${esc(g.id)}" aria-label="Поговорить: ${esc(g.name)}">Поговорить ${icon('arrow')}</button>
     <button type="button" class="guide-edit" data-edit="${esc(g.id)}" aria-label="Настроить: ${esc(g.name)}" title="Настроить персонажа">${icon('studio')}</button>
   </div>
 </article>`;
}

const places=[
 {id:'kremlin',name:'Нижегородский кремль',kind:'История · крепость',photo:'zachatie.jpg',route:'kremlin',guide:'nika',question:'Что посмотреть в кремле?'},
 {id:'stairs',name:'Чкаловская лестница',kind:'Панорамы · набережная',photo:'chkalov.jpg',route:'kremlin',guide:'nika',question:'Что посмотреть в кремле?'},
 {id:'river',name:'Нижне-Волжская набережная',kind:'Прогулки · у воды',photo:'lower-volga.jpg',route:'river',guide:'gorky',question:'Где находится портал?'},
 {id:'church',name:'Рождественская улица',kind:'Архитектура · старый город',photo:'church.jpg',route:'literature',guide:'gorky',question:'Где находится портал?'}
];
function bookmark(p){
 const saved=savedPlaces.includes(p.id);
 return `<button class="place-bookmark" data-place-save="${p.id}" type="button" aria-label="Сохранить: ${p.name}" aria-pressed="${saved}">${icon(saved?'check':'save')}</button>`;
}
function placeCard(p){
 return `<article class="place-tile"><button class="place-card" data-place="${p.id}"><img src="./assets/${p.photo}" alt="" loading="${['kremlin','stairs'].includes(p.id)?'eager':'lazy'}"><span class="place-info"><strong>${p.name}</strong><small>${p.kind}</small></span></button>${bookmark(p)}</article>`;
}
function home(){
 return `<section class="search-section" aria-label="Поиск по городу">
 <form id="discoverySearch" class="city-search" role="search">${icon('search')}<input id="cityQuery" aria-label="Найти место, гида или маршрут" placeholder="Куда отправимся?" autocomplete="off" maxlength="100" enterkeyhint="search"><button class="search-submit" type="button" aria-label="Показать список мест" aria-expanded="false" aria-controls="searchResults">${icon('studio')}</button></form><div id="searchResults" hidden></div>
 </section>
 <section class="city-hero" aria-labelledby="cityTitle"><img class="hero-photo" src="./assets/volga-kremlin.webp" alt="" fetchpriority="high">
 <div class="hero-caption"><h1 id="cityTitle">Нижний<br>Новгород</h1><p>Город на слиянии рек</p></div>
 <a class="button route-cta" href="#routes" id="featuredRoute">${icon('route')} Создать маршрут ${icon('arrow')}</a></section>
 <nav class="quick-actions" aria-label="Что делать в городе">
 <a href="#routes">${icon('walk')}<span>Прогулки</span></a><button data-place="kremlin">${icon('museum')}<span>Культура</span></button>
 <a href="https://yandex.ru/maps/?text=кафе%20Нижний%20Новгород" target="_blank" rel="noopener">${icon('fork')}<span>Поесть</span></a><a href="#map">${icon('pin')}<span>Рядом</span></a></nav>
 <section class="places-section"><div class="section-top"><h2>Популярные места</h2></div><div class="places-grid">${places.map(placeCard).join('')}</div></section>
 <section class="guides-section"><div class="section-top"><h2>Местные истории</h2><a class="text-link" href="#guides">Все гиды ${icon('arrow')}</a></div><div class="grid">${state.guides.slice(0,3).map(guideCard).join('')}${projectionCard()}</div></section>
 <a class="studio-invite" href="#studio"><span class="invite-icon">${icon('plus')}</span><span><strong>Создать своего гида</strong><small>Ваш образ и ваши знания</small></span>${icon('arrow')}</a>`;
}

function selectFeaturedRoute(){
 filter=180;
 routeData=null;
 routeError='';
 selectedRoute='waterfront';
 resetMap();
}
function bindDiscovery(){
 document.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>openPlace(b.dataset.place));
 $('#featuredRoute')?.addEventListener('click',selectFeaturedRoute);
 $('#discoverySearch')?.addEventListener('submit',e=>{e.preventDefault();searchCity();$('#searchResults button')?.focus();});
 $('.search-submit')?.addEventListener('click',()=>{
  const results=$('#searchResults');
  if(results.hidden)searchCity();
  else hideSearch();
 });
 document.querySelectorAll('[data-place-save]').forEach(button=>button.onclick=()=>togglePlaceBookmark(button));
 $('#cityQuery')?.addEventListener('input',searchCity);
 $('.search-section')?.addEventListener('keydown',e=>{
  if(e.key==='Escape'){hideSearch();$('#cityQuery').focus();}
 });
 $('.search-section')?.addEventListener('focusout',e=>{
  if(e.relatedTarget&&!e.currentTarget.contains(e.relatedTarget))hideSearch();
 });
}
function hideSearch(){
 $('#searchResults').hidden=true;
 $('.search-submit').setAttribute('aria-expanded','false');
}
function togglePlaceBookmark(button){
 const id=button.dataset.placeSave;
 const saved=savedPlaces.includes(id);
 savedPlaces=saved?savedPlaces.filter(place=>place!==id):[...savedPlaces,id];
 try{localStorage.setItem('gg-saved-places:'+scope,JSON.stringify(savedPlaces));}
 catch{toast('Избранное доступно до закрытия этой страницы');}
 button.setAttribute('aria-pressed',String(!saved));
 button.innerHTML=icon(saved?'save':'check');
}
function searchCity(){
 const q=$('#cityQuery').value.trim().toLocaleLowerCase('ru');const box=$('#searchResults');box.hidden=false;$('.search-submit').setAttribute('aria-expanded','true');
 const found=[...places.filter(p=>(p.name+' '+p.kind).toLowerCase().includes(q)).map(p=>`<button data-place="${p.id}">${icon('pin')}<span>${p.name}<small>Место в городе</small></span>${icon('arrow')}</button>`),...state.guides.filter(g=>q&&(g.name+' '+g.role+' '+g.tag).toLowerCase().includes(q)).map(g=>`<button data-search-guide="${esc(g.id)}">${icon('chat')}<span>${esc(g.name)}<small>${esc(g.role)}</small></span>${icon('arrow')}</button>`),...routes.filter(r=>q&&(r.name+' '+r.stops.join(' ')).toLowerCase().includes(q)).map(r=>`<button data-search-route="${r.id}">${icon('route')}<span>${r.name}<small>${r.minutes} минут · ${r.distance}</small></span>${icon('arrow')}</button>`)];
 box.innerHTML=`<div class="search-result-heading" role="status">${found.length?'Найдено: '+found.length:'Ничего не нашлось. Попробуйте «кремль», «Волга» или имя гида.'}</div>${found.join('')}`;
 box.querySelectorAll('[data-place]').forEach(b=>b.onclick=()=>openPlace(b.dataset.place));
 box.querySelectorAll('[data-search-guide]').forEach(b=>b.onclick=()=>choose(b.dataset.searchGuide));
 box.querySelectorAll('[data-search-route]').forEach(b=>b.onclick=()=>{filter=180;routeData=null;resetMap();selectedRoute=b.dataset.searchRoute;location.hash='routes';});
}
function openPlace(id){
 const p=places.find(x=>x.id===id);if(!p)return;modalReturn=document.activeElement;document.body.classList.add('modal-open');main.inert=true;$('.topbar').inert=true;$('#mobileNav').inert=true;
 const r=routes.find(x=>x.id===p.route);
 $('#modal').innerHTML=`<div class="modal-backdrop"><section class="modal-card place-modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="iconbutton" id="closeModal" aria-label="Закрыть">${icon('close')}</button><img src="./assets/${p.photo}" alt="${p.name}"><div class="place-modal-copy"><span class="eyebrow muted">${p.kind}</span><h2 id="modalTitle">${p.name}</h2><p>Добавьте это место в знакомство с Нижним. Оно входит в прогулку «${r.name}».</p><span class="duration">${icon('clock')} ${r.minutes} минут</span><div class="card-actions"><button class="button" id="placeRoute">Открыть маршрут ${icon('arrow')}</button><button class="button secondary" id="placeGuide">Выбрать гида</button></div><small>Время прогулки ориентировочное. Условия посещения уточняйте перед поездкой.</small></div></section></div>`;
 $('#closeModal').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.className==='modal-backdrop')closeModal();};
 $('#placeRoute').onclick=()=>{filter=180;routeData=null;resetMap();selectedRoute=p.route;closeModal();location.hash='routes';};
 $('#placeGuide').onclick=()=>{closeModal();location.hash='guides';};$('#closeModal').focus();
}
function projectionCard() {
 return `<a href="./popov.html" class="projector-guide"><img src="./assets/popov.webp" alt=""><span><strong>Александр Попов</strong><small>Радиоприёмник · разговор у проектора</small></span>${icon('arrow')}</a>`;
}
function guidesPage(){
 const featured=state.guides.find(g=>g.id==='gorky');
 const guides=featured?[featured,...state.guides.filter(g=>g!==featured)]:state.guides;
 return `<section class="guide-library" aria-labelledby="guidesTitle">
   <div class="library-heading">
     <div>
       <h1 id="guidesTitle">Мои гиды</h1>
       <p>С кем поговорим?</p>
     </div>
     <button type="button" class="library-create" id="newGuide" aria-label="Создать персонажа">${icon('plus')}<span>Создать<span class="library-create-noun"> персонажа</span></span></button>
   </div>
   <div class="guide-collection">${guides.map(guideCard).join('')}${projectionCard()}</div>
 </section>`;
}
function studio(){
 return studioPage({guide:editGuide(),guides:state.guides,tab:studioTab,portrait,escape:esc});
}
function resetMap(){
 mapZoom=1;
 activeStop=-1;
}
function stopPhoto(route,index){
 return route.photos?.[index] || ['zachatie.jpg','church.jpg','chkalov.jpg','lower-volga.jpg'][index];
}
function mapArtwork(route){
 const frame=mapFrame(route,mapZoom);
 return `<svg viewBox="${frame.viewBox}" preserveAspectRatio="none" aria-hidden="true">
 <image href="./assets/route-map.webp" width="1000" height="644" preserveAspectRatio="none" />
 ${frame.line?`<polyline class="route-outline" points="${frame.line}" /><polyline class="route-line" points="${frame.line}" />`:''}
 </svg>
 <span class="map-river" style="left:${frame.river.left}%;top:${frame.river.top}%">Волга</span>
 ${frame.pins.map(({left,top},i)=>`<button type="button" class="map-pin" data-map-stop="${i}" aria-label="${esc(route.stops[i])}" aria-pressed="${i===activeStop}" style="left:${left}%;top:${top}%">
 <span class="pin-dot"></span><span class="pin-label"><img src="./assets/${stopPhoto(route,i)}" alt=""><span>${esc(route.stops[i])}</span></span></button>`).join('')}`;
}
function routeMap(route){
 return `<section class="route-map" aria-label="Карта прогулки" data-labels="${mapLabels}">
 <div class="route-map-art">${mapArtwork(route)}</div>
 <div class="map-controls">
 <button class="iconbutton" data-map-action="labels" aria-label="Подписи на карте" aria-pressed="${mapLabels}">${icon('layers')}</button>
 <div class="map-zoom"><button class="iconbutton" data-map-action="in" aria-label="Приблизить карту">${icon('plus')}</button><button class="iconbutton" data-map-action="out" aria-label="Отдалить карту">${icon('minus')}</button></div>
 <button class="iconbutton" data-map-action="reset" aria-label="Показать маршрут целиком">${icon('recenter')}</button>
 </div>
 <a class="map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>
 </section>`;
}
function routePage(){
 if(!routeData)return `<section class="panel"><p role="status">${esc(routeError||'Загружаем маршруты…')}</p>${routeError?'<button class="button" id="retryRoutes">Повторить загрузку</button>':''}</section>`;
 const route=routeData.find(item=>item.id===selectedRoute)||routeData[0];
 if(!route)return '<section class="panel"><h2>Маршрутов пока нет</h2></section>';
 selectedRoute=route.id;
 return `<div class="route-layout" data-shown-route="${esc(route.id)}">
 ${routeMap(route)}
 <div class="route-detail"><section class="route-summary" aria-labelledby="routeName">
 <div class="route-summary-title"><img src="./assets/${stopPhoto(route,0)}" alt="">
 <div><h2 id="routeName">${esc(route.name)}</h2><div class="route-meta"><span>${icon('walk')} ${esc(route.distance)}</span><span>${icon('pin')} ${route.stops.length} остановки</span></div></div>
 <span class="duration">${icon('clock')} ${route.minutes===120?'2 часа':route.minutes+' мин'}</span></div>
 <ol class="stops">${route.stops.map((stop,i)=>`<li><button type="button" data-timeline-stop="${i}" aria-label="${esc(stop)}" aria-pressed="${i===activeStop}"><b>${i+1}</b><span>${esc(route.labels?.[i]||stop)}</span></button></li>`).join('')}</ol>
 <div id="selectedStop" role="status" hidden></div>
 <a class="button route-open" target="_blank" rel="noopener" href="https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${route.coords[0].join('%2C')}%3B${route.coords.at(-1).join('%2C')}">Начало и конец на карте ${icon('arrow')}</a>
 </section></div></div>
 <section class="route-options" id="routeOptions" aria-labelledby="routeOptionsTitle">
 <h2 id="routeOptionsTitle">Другие прогулки</h2>
 <div class="time-options" aria-label="Длительность прогулки">${[30,45,60,180].map(n=>`<button class="chip ${filter===n?'active':''}" aria-pressed="${filter===n}" data-time="${n}">${n===180?'Все':'До '+n+' мин'}</button>`).join('')}</div>
 <label class="field" for="routePicker"><span>Выбрать прогулку</span><select id="routePicker">${routeData.map(item=>`<option value="${item.id}" ${item.id===route.id?'selected':''}>${esc(item.name)} · ${item.minutes} мин</option>`).join('')}</select></label>
 <p class="note">${esc(route.level)}. ${esc(route.description)}${route.path?'':' На карте показаны остановки.'}</p>
 <button class="text-link" id="downloadRoute">${icon('save')} Скачать план прогулки</button>
 </section>`;
}
function bindMap(){
 const map=$('.route-map');
 const route=routes.find(item=>item.id===selectedRoute);
 if(!map||!route)return;
 function showStop(index){
  activeStop=index;
  for(const button of main.querySelectorAll('[data-map-stop],[data-timeline-stop]')){
   button.setAttribute('aria-pressed',String(Number(button.dataset.mapStop??button.dataset.timelineStop)===index));
  }
  const status=$('#selectedStop');
  status.hidden=false;
  status.textContent=route.stops[index];
 }
 main.querySelectorAll('[data-timeline-stop]').forEach(button=>button.onclick=()=>showStop(Number(button.dataset.timelineStop)));
 map.addEventListener('click',e=>{
  const pin=e.target.closest('[data-map-stop]');
  if(pin){showStop(Number(pin.dataset.mapStop));return;}
  const button=e.target.closest('[data-map-action]');
  switch(button?.dataset.mapAction){
   case 'labels':
    mapLabels=!mapLabels;
    map.dataset.labels=String(mapLabels);
    button.setAttribute('aria-pressed',String(mapLabels));
    return;
   case 'in': mapZoom=Math.min(1.9,mapZoom+0.3);break;
   case 'out': mapZoom=Math.max(0.7,mapZoom-0.3);break;
   case 'reset': mapZoom=1;break;
   default: return;
  }
  $('.route-map-art').innerHTML=mapArtwork(route);
 });
}
function conversationHistory(id){
 if(!conversations.has(id))conversations.set(id,[]);
 return conversations.get(id);
}
function chatPage(){
 const g=guide();
 return conversationPage({guide:g,messages:conversationHistory(g.id),questions:suggestions(g),art,escape:esc,renderMessage:messageHtml});
}

function suggestions(g){return g.id==='gorky'?['Ваше настоящее имя?','Что вы написали?','Покажите фото кремля','Диалоги на Кожевенной']:g.id==='nika'?['Что посмотреть в кремле?','Покажи фото Чкаловской лестницы','Можно на велосипеде?','Сколько стоят билеты?']:g.id==='hotel'?['Во сколько завтрак?','Когда заселение?']:g.docs.slice(0,3).map(d=>d.title);}
function replyPhotoHtml(id) {
 const photo = cityPhotos.find(item => item.id === id);
 if (!photo) return '';
 const url = './assets/' + photo.file;
 return `<figure class="reply-photo">
   <button type="button" class="reply-photo-open" aria-label="Увеличить фото: ${esc(photo.title)}"><img src="${esc(url)}" alt="${esc(photo.alt)}" width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async"></button>
   <figcaption><span>${esc(photo.title)}</span><small><a href="${esc(photo.original)}" target="_blank" rel="noopener noreferrer">${esc(photo.author)}</a></small></figcaption>
 </figure>`;
}
const photoViewer = document.createElement('dialog');
photoViewer.className = 'reply-photo-viewer';
photoViewer.setAttribute('aria-label', 'Просмотр фотографии');
photoViewer.innerHTML = `<button type="button" aria-label="Закрыть фото" autofocus>${icon('close')}</button><img alt="">`;
document.body.append(photoViewer);
photoViewer.querySelector('button').onclick = () => photoViewer.close();
photoViewer.addEventListener('click', event => {
 if (event.target === photoViewer) photoViewer.close();
});
main.addEventListener('click', event => {
 const thumbnail = event.target.closest('.reply-photo-open')?.querySelector('img');
 if (!thumbnail || photoViewer.open) return;
 const image = photoViewer.querySelector('img');
 image.src = thumbnail.currentSrc || thumbnail.src;
 image.alt = thumbnail.alt;
 photoViewer.showModal();
});
window.addEventListener('hashchange', () => photoViewer.close());

function replySources(reply) {
 const photo = cityPhotos.find(item => item.id === reply.photoId);
 const items = [...(reply.sources ?? []), reply.source];
 if (photo) items.push({title: 'Фото: ' + photo.title, url: photo.original});
 const seen = new Set();
 return items.filter(Boolean).flatMap(item => {
  const known = Object.hasOwn(sources, item.id) ? sources[item.id] : item;
  let url = null;
  try {
   const parsed = new URL(known.url);
   if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed;
  } catch { /* Internal materials can have no link. */ }
  const key = url?.href || known.title;
  if (!key || seen.has(key)) return [];
  seen.add(key);
  return [{title: known.title, url, checkedAt: item.checkedAt}];
 });
}

const sourcesViewer = document.createElement('dialog');
sourcesViewer.className = 'reply-sources-viewer';
sourcesViewer.setAttribute('aria-labelledby', 'replySourcesTitle');
sourcesViewer.innerHTML = `<header><h2 id="replySourcesTitle">Источники</h2><button type="button" aria-label="Закрыть источники" autofocus>${icon('close')}</button></header><ul></ul>`;
document.body.append(sourcesViewer);
sourcesViewer.querySelector('button').onclick = () => sourcesViewer.close();
sourcesViewer.addEventListener('click', event => {
 if (event.target === sourcesViewer) sourcesViewer.close();
});
window.addEventListener('hashchange', () => sourcesViewer.close());

function openReplySources(items) {
 if (sourcesViewer.open) return;
 sourcesViewer.querySelector('ul').innerHTML = items.map(({title, url, checkedAt}) => {
  const label = esc(title);
  const meta = [url?.hostname.replace(/^www\./, ''), checkedAt && 'Проверено: ' + checkedAt].filter(Boolean).join(' · ');
  const content = `<span>${label}${meta ? `<small>${esc(meta)}</small>` : ''}</span>`;
  return `<li>${url ? `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${content}${icon('arrow')}</a>` : content}</li>`;
 }).join('');
 sourcesViewer.showModal();
}

function messageHtml(message, showCitation = false) {
 if (message.user) return `<div class="message user"><span class="message-text">${esc(message.text)}</span></div>`;
 const source = showCitation === true ? message.source : null;
 const details = source && (Object.hasOwn(sources, source.id) ? sources[source.id] : source);
 const date = source?.checkedAt ? `<small class="source-date">Проверено: ${esc(source.checkedAt)}</small>` : '';
 const label = details ? 'Источник: ' + esc(details.title) : '';
 const citation = details?.url
  ? `<a class="message-source" href="${esc(details.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
  : label ? `<span class="message-source">${label}</span>` : '';
 return `<div class="message"><div class="message-text reply-markdown">${renderReplyMarkdown(message.text)}</div>${replyPhotoHtml(message.photoId)}${date}${citation}</div>`;
}
function screenPage(){const g=guide();return `<section class="screen-layout ${screenRound?'round-format':'monitor-format'}"><div class="screen-top"><div><strong>Город говорит</strong><p>Предпросмотр экрана · оборудование не подключено</p></div><a href="#studio" class="button white small">Вернуться в студию</a></div><div class="screen-controls"><button class="button white small" id="screenFormat">${screenRound?'Формат монитора':'Круглый формат'}</button><button class="button white small" id="fullscreen">Во весь экран</button><button class="button white small" id="resetSession">Новый посетитель</button><button class="button white small" id="stopVoice">Остановить речь</button></div><div id="screenPortrait">${portrait(g)}</div><div class="bars" aria-hidden="true">${'<i></i>'.repeat(9)}</div><h1>${esc(g.name)}</h1><p class="subtitle">${esc(g.role)} · цифровой образ</p><div class="screen-subtitle" id="screenAnswer" aria-live="polite">${esc(g.greeting)}</div><form class="ask-form" id="askForm"><input id="question" aria-label="Ваш вопрос" placeholder="Задайте вопрос персонажу" maxlength="500" required><button class="button" id="sendQuestion">Спросить</button></form><div id="askError" class="error" role="alert"></div><label style="font-size:13px;color:#c7dedb"><input type="checkbox" id="voiceToggle" style="vertical-align:middle"> Озвучивать ответы</label><p class="note" style="color:#a6c1c6">Круглый предпросмотр иллюстрирует формат LED-дисплея. Синхронизация губ не реализована.</p></section>`;}
function analytics(){const asks=state.events.filter(e=>e.type==='ask').length,opens=state.events.filter(e=>e.type==='route').length,likes=state.events.filter(e=>e.type==='feedback'&&e.value==='helpful').length;return `<div class="page-heading"><div><div class="eyebrow muted">Результаты вашей демонстрации</div><h1>Статистика</h1><p>События этой рабочей области. Данные появляются после реальных действий.</p></div><button class="button secondary" id="exportEvents">Экспорт событий</button></div><div class="metric-grid"><div class="metric"><strong>${asks}</strong><span>Заданных вопросов</span></div><div class="metric"><strong>${opens}</strong><span>Открытий маршрутов</span></div><div class="metric"><strong>${likes}</strong><span>Полезных ответов</span></div></div><section class="panel"><h2>Как проверять гипотезу</h2><p>Пригласите 10 участников. Попросите выбрать гида, задать вопрос и открыть маршрут. Запишите, кому потребовалась помощь и сколько заняло выполнение.</p><p class="note">Счётчики отражают события, а не число уникальных туристов. Хранятся последние 200 событий; тексты вопросов в статистику не записываются.</p><a href="#guides" class="button">Начать проверку</a></section>`;}
function about(){return `<article class="about"><div class="page-heading"><div><h1>О проекте</h1><p>Город говорит — конструктор цифровых гидов для туристических площадок.</p></div></div><nav class="more-links" aria-label="Инструменты проекта"><a class="button secondary" href="#guides">Цифровые гиды ${icon('arrow')}</a><a class="button secondary" href="#studio">Студия гида ${icon('arrow')}</a></nav><h2>Что работает сейчас</h2><p>Выбор и создание персонажа, загрузка картинки, редактирование знаний, сохранение в браузере, диалог с поиском BM25, источники, маршруты, озвучка браузером и экран посетителя.</p><h2>Как формируется ответ</h2><p>Браузер обрабатывает вопрос, ранжирует материалы по BM25 и возвращает подходящий текст. Это работающий алгоритм информационного поиска, а не генеративная языковая модель. При недостаточном совпадении система сообщает, что сведений нет. Перефразирование и сложные вопросы могут требовать уточнения.</p><h2>Что ещё нужно проверить</h2><p>Работа с реальным LED-вентилятором, синхронизация губ, точная навигация, доступность маршрутов и спрос со стороны туристов. Маршруты здесь — демонстрационные эскизы; время и расстояния ориентировочные.</p><h2>Источники</h2><ul>${Object.values(sources).map(s=>`<li>${s.url?`<a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a>`:esc(s.title)} — ${esc(s.type)}</li>`).join('')}</ul><p class="note">Факты изложены кратко своими словами. Тексты гостиницы «Волга» вымышлены. Добавляя собственные материалы и изображения, используйте контент, которым вправе распоряжаться.</p><p class="note">Фотография кремля: Vityavo, Wikimedia Commons, CC0. <a target="_blank" rel="noopener" href="https://commons.wikimedia.org/wiki/File:Nizhny_Novgorod_Kremlin_(view_from_Volga).jpg">Страница фотографии</a>. Иллюстрации персонажей — условные векторные образы.</p><p class="note">Фото Зачатьевской башни и Нижне-Волжской набережной — Алексей Трефилов, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. Фото Рождественской церкви — AlexTref871, CC BY-SA 4.0. Фото Чкаловской лестницы — WildPea, CC0. Кадрирование выполняется только при показе. <a href="./assets/CREDITS.txt">Ссылки на оригиналы и лицензии</a>.</p><h2>Данные и доступ</h2><p>Эта версия работает на GitHub Pages. Персонажи, картинки, знания и статистика сохраняются в IndexedDB только в этом браузере. Они не отправляются на сервер. Две вкладки одного браузера видят общий проект; на другом устройстве будет отдельная рабочая область. Для переноса скачайте проект и импортируйте JSON. Очистка данных сайта удаляет локальную копию.</p><section class="panel"><h2>Перенос и восстановление проекта</h2><p>Копия содержит персонажей, знания и события. Импорт создаёт содержимое в текущей рабочей области.</p><label class="field"><span>Импорт проекта или персонажа</span><input type="file" id="importProject" accept="application/json,.json"></label></section><a class="button secondary" href="#analytics">Посмотреть статистику</a></article>`;}
function navigateTo(target){
 if(location.hash==='#'+target)render();
 else location.hash=target;
}
async function choose(id,target='chat'){
 captureDraft();studioTab='profile';state.selected=id;
 try{await save();navigateTo(target);}catch(e){toast(e.message);}
}
function render(){
 if(!ready)return;
 const previous=document.body.dataset.page;
 const page=location.hash.slice(1)||'home';
 const navigating=page!==previous;
 const studioPanel=$('#studioPanel')?.getAttribute('aria-labelledby');
 const renderedRoute=$('.route-layout')?.dataset.shownRoute;
 stopPortraitMotion();
 const portraitBefore=previous==='guides'&&page==='chat'
  ?rememberPortrait($(`[data-portrait-for="${CSS.escape(state.selected)}"] > :is(svg, img)`))
  :null;
 conversation?.destroy();conversation=null;
 viewId++;askController?.abort();busy=false;
 document.body.dataset.page=page;
 if(main.contains(workspaceStatus))main.before(workspaceStatus);
 main.innerHTML=({home,guides:guidesPage,studio,map:routePage,routes:routePage,chat:chatPage,screen:screenPage,analytics,about}[page]||home)();
 $('#studioStatusSlot')?.replaceWith(workspaceStatus);
 if(navigating)window.scrollTo(0,0);
 const nav=$('#mobileNav');
 const mobileSection=page==='chat'?'guides':page;
 const navIndex=[...nav.querySelectorAll('[data-nav]')].findIndex(a=>a.dataset.nav===mobileSection);
 nav.toggleAttribute('data-current',navIndex>=0);
 if(navIndex>=0)nav.style.setProperty('--nav-index',navIndex);
 document.querySelectorAll('[data-nav]').forEach(a=>{
  const section=nav.contains(a)?mobileSection:page;
  const active=a.dataset.nav===section;
  a.classList.toggle('active',active);
  if(active)a.setAttribute('aria-current',section===page?'page':'location');
  else a.removeAttribute('aria-current');
 });
 renderHeader(page);bindDiscovery();bind();bindMap();status();updateViewport();
 if(page==='chat'){
  const g=guide();
  conversation=bindConversation($('.conversation'),{
   guide:g,messages:conversationHistory(g.id),renderMessage:messageHtml,ask:requestAnswer,
   notify:toast,replySources,openReplySources,
   feedback:async(reply,value)=>{
    let record=feedbackEvents.get(reply);
    const previous=state.events.includes(record)?record.value:undefined;
    if(previous!==undefined) record.value=value;
    else {
     event('feedback',value);
     record=state.events.at(-1);
     feedbackEvents.set(reply,record);
    }
    try{
     await save({quiet:true});
     if(document.body.dataset.page==='chat')toast('Спасибо за оценку',true);
    }catch(e){
     if(previous===undefined){state.events=state.events.filter(item=>item!==record);feedbackEvents.delete(reply);}
     else record.value=previous;
     toast(e.message);
     throw e;
    }
   },
  });
 }
 if(navigating){
  const section=page==='guides'?$('.library-heading'):main;
  reveal(section,{distance:page==='guides'?6:0});
  movePortrait(portraitBefore,$('.conversation-avatar .avatar-image > :is(svg, img)'));
 }else if(page==='studio'&&studioPanel!==$('#studioPanel')?.getAttribute('aria-labelledby')){
  reveal($('#studioPanel'),{duration:180,distance:4});
 }else if(['routes','map'].includes(page)&&renderedRoute!==$('.route-layout')?.dataset.shownRoute){
  reveal($('.route-layout'),{duration:200,distance:3});
 }
 if(['routes','map'].includes(page)&&!routeData&&!routeLoading&&!routeError)loadRoutes();
}
async function loadRoutes(){routeLoading=true;routeError='';const n=filter;try{const j=await api('/api/routes?minutes='+n);if(n===filter)routeData=j.routes;}catch(e){if(n===filter)routeError=e.message;}finally{routeLoading=false;if(['#routes','#map'].includes(location.hash))render();}}
function download(name,text,type='application/json'){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function bind(){
 $('#guidePicker')?.addEventListener('change',e=>choose(e.target.value,'studio'));
 document.querySelectorAll('[data-studio-tab]').forEach(b=>{
  b.onclick=()=>{captureDraft();studioTab=b.dataset.studioTab;render();$('#studio-'+studioTab)?.focus();};
  b.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const ids=['profile','knowledge','preview'];const i=ids.indexOf(studioTab);const next=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;captureDraft();studioTab=ids[next];render();$('#studio-'+studioTab).focus();};
 });
 $('#previewChatFromCard')?.addEventListener('click',()=>location.hash='chat');
 $('#routePicker')?.addEventListener('change',e=>{selectedRoute=e.target.value;resetMap();event('route',selectedRoute);save().catch(e=>toast(e.message));render();});

 $('#guideForm')?.addEventListener('input',captureDraft);$('#guideForm')?.addEventListener('change',captureDraft);
 $('#resetImage')?.addEventListener('click',()=>{captureDraft();drafts[state.selected] ||= structuredClone(guide());delete drafts[state.selected].image;keepDrafts();render();toast('Стандартный образ восстановлен в черновике');});
 $('#duplicateGuide')?.addEventListener('click',()=>newGuide(true));
 $('#deleteGuide')?.addEventListener('click',async()=>{if(state.guides.length===1)return toast('Нужен хотя бы один персонаж');if(!confirm('Удалить персонажа и все его материалы? Резервную копию можно скачать кнопкой «Скачать проект».'))return;delete drafts[state.selected];state.guides=state.guides.filter(g=>g.id!==state.selected);state.selected=state.guides[0].id;keepDrafts();try{await save();render();}catch(e){render();toast(e.message);}});
 $('#importProject')?.addEventListener('change',importProject);$('#retryRoutes')?.addEventListener('click',()=>{routeError='';loadRoutes();});
 $('#screenFormat')?.addEventListener('click',()=>{screenRound=!screenRound;render();});
 $('#fullscreen')?.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.screen-layout').requestFullscreen();}catch{toast('Полноэкранный режим недоступен');}});
 $('#stopVoice')?.addEventListener('click',()=>{window.speechSynthesis?.cancel();document.body.classList.remove('speaking');});
 $('#resetSession')?.addEventListener('click',()=>{window.speechSynthesis?.cancel();render();});
 document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>choose(b.dataset.chat));document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>choose(b.dataset.edit,'studio'));document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>choose(b.dataset.select,'studio'));$('#newGuide')?.addEventListener('click',newGuide);$('#previewChat')?.addEventListener('click',()=>location.hash='chat');$('#screenStudio')?.addEventListener('click',openScreen);$('#guideForm')?.addEventListener('submit',saveGuide);$('#avatarUpload')?.addEventListener('change',uploadImage);$('#addDoc')?.addEventListener('click',()=>docModal());document.querySelectorAll('[data-doc]').forEach(b=>b.onclick=()=>docModal(b.dataset.doc));$('#exportGuide')?.addEventListener('click',()=>download('digital-guide.json',JSON.stringify(guide(),null,2)));document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{filter=Number(b.dataset.time);routeData=null;routeError='';resetMap();render();});document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{selectedRoute=b.dataset.route;event('route',selectedRoute);save().catch(e=>toast(e.message));render();});$('#saveRoute')?.addEventListener('click',async()=>{if(!state.savedRoutes.includes(selectedRoute)){const id=selectedRoute;state.savedRoutes.push(id);event('route',id);try{await save();if(selectedRoute===id&&$('#saveRoute')){const button=$('#saveRoute');button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','Маршрут сохранён');button.innerHTML=icon('check');}toast('Маршрут сохранён');}catch(e){toast(e.message);}}else toast('Маршрут уже в сохранённых');});$('#downloadRoute')?.addEventListener('click',()=>{const r=routeData.find(x=>x.id===selectedRoute);download('marshrut.txt',[r.name,r.minutes+' минут · '+r.distance,'',...r.stops.map((s,i)=>(i+1)+'. '+s),'',r.description].join('\n'),'text/plain;charset=utf-8');});if(location.hash==='#screen')$('#askForm')?.addEventListener('submit',askOnScreen);$('#exportEvents')?.addEventListener('click',()=>download('events.json',JSON.stringify(state.events,null,2)));}
async function saveGuide(e){e.preventDefault();captureDraft();commitDrafts();const b=e.submitter;b.disabled=true;try{await save();render();toast('Персонаж сохранён');}catch(err){if($('#guideError'))$('#guideError').textContent=err.message;b.disabled=false;}}
async function uploadImage(e){const file=e.target.files[0];if(!file)return;if(file.size>1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('Выберите PNG, JPEG или WebP до 1 МБ');e.target.value='';return;}captureDraft();const id=state.selected;
 const reader=new FileReader();reader.onload=async()=>{try{const img=new Image();img.src=reader.result;await img.decode();drafts[id] ||= structuredClone(state.guides.find(g=>g.id===id));drafts[id].image=reader.result;keepDrafts();if(state.selected===id&&location.hash==='#studio')render();status();toast('Картинка добавлена в черновик. Сохраните персонажа.');}catch{toast('Не удалось прочитать изображение');}};reader.readAsDataURL(file);}
async function newGuide(duplicate=false){captureDraft();studioTab='profile';if(state.guides.length>=12)return toast('В прототипе доступно до 12 персонажей');const g=duplicate===true?structuredClone(editGuide()):{name:'Новый гид',role:'Помощник моей площадки',tag:'Свой персонаж',color:'#dce9e3',art:'custom',greeting:'Здравствуйте! Чем могу помочь?',voice:'friendly',docs:[]};g.id='custom-'+makeId();if(duplicate===true)g.name=(g.name+' — копия').slice(0,60);state.guides.push(g);state.selected=g.id;try{await save();navigateTo('studio');toast('Персонаж создан. Добавьте знания и своё изображение.');}catch(e){navigateTo('studio');toast(e.message);}}
async function importProject(e){const file=e.target.files[0];if(!file)return;try{if(file.size>3000000)throw Error('Файл слишком велик: максимум 3 МБ');const data=JSON.parse(await file.text());let next;
 if(data.format==='gorod-govorit'&&data.version===1)next=data.state;
 else if(data.guides)next=data;
 else if(data.id&&data.docs){next=structuredClone(state);const g=structuredClone(data);g.id='custom-'+makeId();next.guides.push(g);next.selected=g.id;}
 else throw Error('Это не резервная копия проекта или персонажа');
 validateState(next);if(!confirm('Импорт заменит текущий проект данными файла (персонаж добавится отдельно). Скачайте текущий проект перед заменой. Продолжить?'))return;
 state=structuredClone(next);drafts={};keepDrafts();await save();render();toast('Проект восстановлен');
 }catch(err){toast('Импорт: '+err.message);}finally{e.target.value='';}}
function closeModal(){$('#modal').innerHTML='';document.body.classList.remove('modal-open');main.inert=false;$('.topbar').inert=false;$('#mobileNav').inert=false;modalReturn?.focus();if(remotePending)status();}
function docModal(id){captureDraft();modalReturn=document.activeElement;document.body.classList.add('modal-open');main.inert=true;$('.topbar').inert=true;$('#mobileNav').inert=true;const ownerId=state.selected;const d=editGuide().docs.find(x=>x.id===id)||{id:'doc-'+makeId(),title:'',text:'',source:'Материалы площадки',url:'',tags:'',checkedAt:new Date().toISOString().slice(0,10)};$('#modal').innerHTML=materialEditor(d,Boolean(id),esc);$('#closeModal').onclick=closeModal;$('#modal').onclick=e=>{if(e.target.className==='modal-backdrop')closeModal();};$('#docForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const doc={id:d.id,...Object.fromEntries([...f].map(([k,v])=>[k,String(v).trim()]))};if(doc.url&&!doc.url.startsWith('https://')){$('#docError').textContent='Ссылка должна начинаться с https://';return;}if(!doc.checkedAt)delete doc.checkedAt;commitDrafts();const owner=state.guides.find(g=>g.id===ownerId);const ix=owner.docs.findIndex(x=>x.id===d.id);if(ix>=0)owner.docs[ix]=doc;else owner.docs.push(doc);e.submitter.disabled=true;try{await save();closeModal();render();toast('База знаний обновлена');}catch(err){$('#docError').textContent=err.message;e.submitter.disabled=false;}};$('#deleteDoc')?.addEventListener('click',async()=>{commitDrafts();const owner=state.guides.find(g=>g.id===ownerId);owner.docs=owner.docs.filter(x=>x.id!==id);try{await save();closeModal();render();toast('Материал удалён');}catch(e){toast(e.message);}});$('#docForm input').focus();}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if(e.key==='Tab'&&$('#modal .modal-card')){const els=[...$('#modal').querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')].filter(x=>!x.disabled);if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0].focus();}}});
async function requestAnswer(question){
 if(busy)return null;
 const originView=viewId,guideId=state.selected;
 const controller=new AbortController();
 askController=controller;
 busy=true;
 const current=()=>originView===viewId&&guideId===state.selected&&!controller.signal.aborted;
 try{
  await saveQueue;
  if(dirty||conflict)throw Error('Сначала сохраните изменения проекта.');
  const response=await api('/api/ask',{method:'POST',body:{guideId,question},signal:controller.signal});
  if(!current())return null;
  event('ask',response.matched?'matched':'unknown');
  void save().catch(()=>{});
  return response;
 }finally{
  if(current())busy=false;
  if(remotePending&&!dirty&&!Object.keys(drafts).length)void receiveUpdate();
 }
}
async function askOnScreen(e){
 e.preventDefault();
 if(busy)return;
 const input=$('#question'),send=$('#sendQuestion'),error=$('#askError'),answer=$('#screenAnswer');
 const question=input.value.trim();
 if(!question||question.length>500)return;
 error.textContent='';send.disabled=true;send.textContent='Ищем ответ…';input.value='';
 try{
  const response=await requestAnswer(question);
  if(!response||!input.isConnected)return;
  answer.innerHTML=messageHtml(response,true);
  if($('#voiceToggle')?.checked)speak(plainReply(response.text));
 }catch(cause){
  if(!input.isConnected)return;
  error.textContent=cause.message;input.value=question;
 }finally{
  if(input.isConnected){send.disabled=false;send.textContent='Спросить';}
 }
}
function speak(text){if(!('speechSynthesis'in window))return toast('Озвучка недоступна в этом браузере');speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ru-RU';const v=speechSynthesis.getVoices().find(v=>v.lang.startsWith('ru'));if(v)u.voice=v;u.rate=guide().voice==='calm'?.9:1.02;u.onstart=()=>{document.body.classList.add('speaking');document.querySelectorAll('.portrait').forEach(p=>p.classList.add('talking'));};u.onend=u.onerror=()=>{document.body.classList.remove('speaking');document.querySelectorAll('.portrait').forEach(p=>p.classList.remove('talking'));};speechSynthesis.speak(u);}
function openScreen(){window.open(location.pathname+'#screen','gorod-visitor');}
const brandMark=$('.brand svg').outerHTML;
function renderHeader(page){
 const header=$('.topbar');
 if(page==='routes'||page==='map'){
  const saved=state.savedRoutes.includes(selectedRoute);
  header.innerHTML=`<a class="header-icon" href="#home" aria-label="На главную">${icon('caret')}</a>
  <h1>${page==='map'?'Карта':'Мой маршрут'}</h1>
  <button class="header-icon" id="saveRoute" aria-label="${saved?'Маршрут сохранён':'Сохранить маршрут'}" aria-pressed="${saved}" ${routeData?'':'disabled'}>${icon(saved?'check':'save')}</button>
  <button class="header-icon" id="routeMenu" aria-label="Выбрать прогулку" ${routeData?'':'disabled'}>${icon('more')}</button>`;
  $('#routeMenu').onclick=()=>{$('#routeOptions').scrollIntoView({block:'start'});$('#routePicker').focus({preventScroll:true});};
  return;
 }
 header.innerHTML=`<a href="#home" class="brand">${brandMark}<span>${page==='home'?'Мой<br>Нижний Новгород':'Город говорит<small class="brand-light">Нижний Новгород</small>'}</span></a>
 <button type="button" class="header-icon" id="screenTop" aria-label="Экран посетителя">${icon('screen')}</button>`;
 $('#screenTop').onclick=openScreen;
}
$('#mobileNav').innerHTML=[['home','Главная','home'],['map','Карта','map'],['routes','Маршруты','route'],['guides','Гиды','book'],['about','Ещё','more']].map(([page,label,i])=>`<a href="#${page}" data-nav="${page}">${icon(i)}<span>${label}</span></a>`).join('');

window.addEventListener('hashchange',()=>{captureDraft();if(location.hash==='#studio')studioTab='profile';closeModal();document.body.classList.remove('speaking');window.speechSynthesis?.cancel();render();});
async function receiveUpdate(){remotePending=true;if(busy||pendingSaves||dirty||Object.keys(drafts).length||$('#docForm')){status();return;}const view=viewId;try{const j=await api('/api/state');if(busy||pendingSaves||dirty||Object.keys(drafts).length||$('#docForm')||view!==viewId)return;if(j.revision>revision){state=j.state;revision=j.revision;window.speechSynthesis?.cancel();document.body.classList.remove('speaking');render();}remotePending=false;status();}catch{}}
channel&&(channel.onmessage=receiveUpdate);
window.addEventListener('beforeunload',e=>{if(dirty||Object.keys(drafts).length){e.preventDefault();e.returnValue='';}});

main.innerHTML='<section class="panel"><span class="loader"></span> Загружаем вашу рабочую область…</section>';
sync().then(render).catch(err=>{main.innerHTML=`<section class="empty"><h2>Не удалось подключиться</h2><p class="note">${esc(err.message)}</p><button class="button" id="retry">Попробовать снова</button></section>`;$('#retry').onclick=()=>location.reload();});

function updateViewport(){
 const vv=window.visualViewport,editable=document.activeElement?.matches('input:not([type=checkbox]):not([type=color]),textarea,select');
 document.documentElement.style.setProperty('--status-height',(main.contains(workspaceStatus)?0:workspaceStatus.offsetHeight)+'px');
 document.documentElement.style.setProperty('--viewport-height',(vv?.height||window.innerHeight)+'px');
 document.body.classList.toggle('keyboard-open',Boolean(editable&&vv&&window.innerHeight-vv.height>120));
}
window.visualViewport?.addEventListener('resize',updateViewport);
window.addEventListener('resize',updateViewport);
document.addEventListener('focusin',updateViewport);document.addEventListener('focusout',()=>requestAnimationFrame(updateViewport));

function makeId(){return Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(16).padStart(2,"0")).join("");}
