'use strict';
const byId = id => document.getElementById(id);
const field = byId('question');
let token = sessionStorage.getItem('popov-session') || '';
let pending = JSON.parse(sessionStorage.getItem('popov-pending') || 'null');
let sending = false;
let timer;
let version = 0;
let snapshot;
const terminal = new Set(['finished', 'cancelled', 'failed']);
let audioBlob, stream, recorder, recordTimer, clipURL;
let voiceMode = false;
let faceClock = null;
let animation;
const poseImages = new Map();
function drawFace() {
  const face = byId('voiceStage').querySelector('img');
  const elapsed = faceClock ? (performance.now() - faceClock.origin) / 1000 : 0;
  let pose = 'rest';
  for (const [start, shape] of faceClock?.poses || []) {
    if (start > elapsed) break;
    pose = shape;
  }
  const source = poseImages.get(pose);
  if (source?.complete && source.naturalWidth && face.src !== source.src) face.src = source.src;
  if (faceClock && voiceMode) animation = requestAnimationFrame(drawFace);
}
function faceTime(last) {
  cancelAnimationFrame(animation);
  faceClock = last?.state === 'started' ? {poses:last.poses, origin:performance.now()-last.elapsed*1000} : null;
  if (voiceMode) drawFace();
}

let isStatic = location.hostname.endsWith('.github.io');
const availableMic = window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder;

async function api(path, body) {
  const response = await fetch('/api/' + path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', signal: AbortSignal.timeout(6000),
    headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {error:'Площадка недоступна'};
  if (!response.ok) throw Object.assign(new Error(data.error), {status: response.status});
  return data;
}

function forget() {
  token = ''; pending = null; snapshot = undefined;
  sessionStorage.removeItem('popov-session');
  sessionStorage.removeItem('popov-pending');
  byId('history').replaceChildren(); delete byId('history').dataset.version; faceTime(null);
  field.value = '';
}

function render(data) {
  snapshot = data;
  const logged = Boolean(token);
  const active = data.turns?.some(t => !terminal.has(t.state));
  const ended = logged && !active && data.remaining === 0;
  byId('welcome').hidden = logged;
  byId('start').disabled = sending || !data.online;
  byId('availability').textContent = data.online ? 'Проектор на связи' : 'Показ приостановлен';
  byId('compose').hidden = !logged || ended || active;
  byId('again').hidden = !ended;
  byId('remaining').textContent = ended ? '' : 'Можно задать ещё ' + data.remaining + ' из 3';
  byId('submit').disabled = sending || !data.online;
  if (!logged) return;
  if (pending && data.turns.some(t => t.key === pending.key)) {
    pending = null;
    sessionStorage.removeItem('popov-pending');
    field.value = '';
  }
  const rows = data.turns.map(t => {
    const li = document.createElement('li');
    const question = document.createElement('strong');
    const state = document.createElement('small');
    question.textContent = t.question;
    state.textContent = {queued: 'В очереди. Перед вами ' + (t.ahead ?? 0), prepared: 'Попов готовит ответ',
      started: 'Сейчас Попов отвечает вам', finished: 'Ответ прозвучал',
      cancelled: 'Показ остановлен', failed: 'Воспроизведение не состоялось'}[t.state] || 'Вопрос принят';
    li.append(question, state);
    if (t.answer) {
      const p = document.createElement('p'); p.textContent = t.answer; li.append(p);
      if (t.answer.includes('реле')) {
        const source = document.createElement('button'); source.textContent = 'Источники';
        source.onclick = () => byId('sources').showModal(); li.append(source);
      }
    }
    return li;
  });
  const visible = JSON.stringify(data.turns.map(t => [t.key,t.state,t.ahead,t.answer]));
  if (byId('history').dataset.version !== visible) {
    byId('history').replaceChildren(...rows);
    byId('history').dataset.version = visible;
    if (!voiceMode) byId('history').lastElementChild?.scrollIntoView({block:'nearest'});
  }
  const last = data.turns.at(-1);
  faceTime(last);
  byId('voiceStatus').textContent = last?.state === 'started' ? 'Попов говорит' :
    active ? (last?.state === 'queued' ? 'В очереди. Перед вами ' + (last.ahead || 0) : 'Попов готовит ответ') :
    ended ? 'Разговор завершён' : 'Задайте вопрос';
  if (recorder?.state !== 'recording' && !audioBlob) byId('voiceCaption').textContent = last?.answer || (active ? 'Попов готовит ответ' : 'Задайте вопрос Попову');
  byId('app').dataset.phase = last?.state || 'ready';
  if (ended) byId('availability').textContent = 'Разговор завершён';
}

async function update(path, body) {
  const current = ++version;
  clearTimeout(timer);
  try {
    const data = await api(path, body);
    if (current !== version) return;
    if (data.token) {token = data.token; sessionStorage.setItem('popov-session', token);}
    if (!body && pending && !field.value) field.value = pending.text;
    if (body) byId('notice').textContent = '';
    render(data);
  } catch (err) {
    if (current !== version) return;
    if (err.status === 404 && path === 'site') {offlineSite(); return;}
    if (err.status === 401) {forget(); render({online:false});}
    byId('notice').textContent = err.status ? err.message : 'Нет связи с площадкой. Проверьте подключение.';
    if (!err.status) byId('availability').textContent = 'Связь прервана';
  } finally {
    if (current === version) {
      sending = false;
      if (snapshot) { byId('submit').disabled = !snapshot.online; byId('start').disabled = !snapshot.online; }
      if (!isStatic) timer = setTimeout(() => update(token ? 'session' : 'site'), token ? 850 : 2500);
    }
  }
}

byId('start').onclick = () => {
  if (sending) return; sending = true; byId('start').disabled = true; update('start', {});
};
byId('again').onclick = () => {forget(); update('site');};
byId('compose').onsubmit = e => {
  e.preventDefault();
  const text = field.value.trim();
  if (!text || sending) {if (!text) field.focus(); return;}
  if (pending?.text !== text) {
    pending = {text, key: Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('')};
    sessionStorage.setItem('popov-pending', JSON.stringify(pending));
  }
  sending = true; byId('submit').disabled = true;
  update('question', pending);
};
document.querySelector('.suggestions').onclick = e => {
  if (e.target.tagName === 'BUTTON') {field.value = e.target.textContent; field.focus();}
};

function offlineSite() {
  isStatic = true;
  byId('welcome').hidden = true;
  byId('away').hidden = false;
  byId('availability').textContent = 'Демонстрация';
}
function clearClip() {
  audioBlob = null;
  byId('listen').removeAttribute('src'); byId('listen').load();
  if (clipURL) URL.revokeObjectURL(clipURL);
  clipURL = null; byId('review').hidden = true; byId('upload').value = '';
}
function setClip(blob) {
  clearClip();
  if (!blob?.size || blob.size > 10 * 1024 * 1024) {
    byId('notice').textContent = 'Выберите запись до 10 МБ и не длиннее 20 секунд.'; return;
  }
  audioBlob = blob; clipURL = URL.createObjectURL(blob);
  byId('listen').src = clipURL; byId('review').hidden = false;
}
function stopRecord() {
  clearTimeout(recordTimer);
  if (recorder?.state === 'recording') recorder.stop();
  stream?.getTracks().forEach(track => track.stop());
}
function selectMode(mode) {
  voiceMode = mode === 'voice';
  if (voiceMode && !poseImages.size) {
    for (const pose of ['rest','open','round','wide','soft','teeth','hush','reduced']) {
      const img = new Image(); img.src = pose === 'rest' ? './assets/popov.webp' : './assets/popov-' + pose + '.webp';
      poseImages.set(pose,img);
    }
  }
  faceTime(snapshot?.turns?.at(-1));
  if (!voiceMode) stopRecord();
  byId('app').dataset.mode = mode;
  byId('voiceTab').setAttribute('aria-pressed', String(voiceMode));
  byId('chatTab').setAttribute('aria-pressed', String(!voiceMode));
  byId('voiceStage').hidden = !voiceMode || isStatic;
  byId('recordPanel').hidden = !voiceMode;
  byId('record').hidden = !availableMic;
}
byId('chatTab').onclick = () => selectMode('text');
byId('voiceTab').onclick = () => selectMode('voice');
byId('closeSources').onclick = () => byId('sources').close();
byId('discard').onclick = clearClip;
byId('upload').onchange = e => {if (e.target.files.length) setClip(e.target.files[0]);};
byId('record').onclick = async () => {
  if (recorder?.state === 'recording') {stopRecord(); return;}
  const btn = byId('record'); btn.disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio:true});
    if (!voiceMode) {stopRecord(); return;}
    const mime = ['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t));
    recorder = new MediaRecorder(stream, mime ? {mimeType:mime} : {});
    const chunks = [];
    recorder.ondataavailable = e => {if (e.data.size) chunks.push(e.data);};
    recorder.onstop = () => {
      setClip(new Blob(chunks, {type:recorder.mimeType}));
      btn.textContent = 'Записать ещё раз';
      byId('voiceCaption').textContent = 'Проверьте запись перед отправкой';
      stream.getTracks().forEach(t => t.stop());
    };
    recorder.start(); btn.textContent = 'Остановить запись';
    byId('voiceCaption').textContent = 'Слушаю ваш вопрос…';
    recordTimer = setTimeout(stopRecord, 19500);
  } catch {stopRecord();byId('notice').textContent = 'Микрофон недоступен. Можно выбрать запись или написать вопрос.';}
  finally {btn.disabled = false;}
};
byId('decode').onclick = async () => {
  if (!audioBlob) return;
  const btn = byId('decode'); btn.disabled = true;
  const form = new FormData(); form.append('recording', audioBlob, 'question');
  byId('notice').textContent = 'Распознаём вопрос…';
  try {
    const response = await fetch('/api/transcribe', {method:'POST', headers:{Authorization:'Bearer ' + token}, body:form,signal:AbortSignal.timeout(25000)});
    const data = await response.json(); if (!response.ok) throw Error(data.error);
    field.value = data.text; clearClip();
    byId('notice').textContent = 'Проверьте текст и отправьте вопрос.'; field.focus();
  } catch(err) {byId('notice').textContent = err.message || 'Не удалось распознать запись.';}
  finally {btn.disabled = false;}
};
byId('connect').onsubmit = e => {
  e.preventDefault(); const raw=byId('address').value.trim();
  try {
    const url=new URL(raw.includes('://') ? raw : 'http://' + raw);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw Error();
    location.assign(new URL('/popov.html',url));
  } catch {byId('notice').textContent='Проверьте адрес из пульта.';}
};
window.addEventListener('pagehide', () => {stopRecord();clearTimeout(timer);});
if (isStatic) offlineSite(); else update(token ? 'session' : 'site');
