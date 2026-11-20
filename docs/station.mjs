import { locale, localizedGuide, setLocale, t } from './i18n.mjs';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from './vendor/vue.esm-browser.prod.mjs';
import { AppIcon, PortraitImage } from './views.mjs';
import { popovQuestions, projectorGuide } from './popov-guide.mjs';
import { sign } from './conversation.mjs?v=text-only';
import { stationConversationRender } from './vue-renders.mjs';

const prefix = 'gorod-station-';
const terminal = new Set(['finished', 'failed', 'cancelled']);
const maxRecording = 10 * 1024 * 1024;
const hasMic = Boolean(isSecureContext && navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const storage = {
  get(key) { try { return sessionStorage.getItem(prefix + key) || ''; } catch { return ''; } },
  set(key, value) {
    try {
      if (value) sessionStorage.setItem(prefix + key, value);
      else sessionStorage.removeItem(prefix + key);
    } catch { /* In-memory session still works. */ }
  },
};
const randomKey = () => Array.from(crypto.getRandomValues(new Uint32Array(4)),
  value => value.toString(16).padStart(8, '0')).join('');

export function enterStationRoute() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has('join')) {
    const code = fragment.get('join');
    if (fragment.has('lang')) setLocale(fragment.get('lang'));
    if (code !== storage.get('admission')) {
      storage.set('admission', code);
      storage.set('token', '');
      storage.set('pending', '');
    }
    history.replaceState(history.state, '', './#popov');
  } else if (!location.hash && location.pathname.endsWith('/popov.html')) {
    history.replaceState(history.state, '', './#popov');
  }
}

function turnStatus(turn) {
  return {
    generating: turn.answer ? t('Готовлю озвучку…') : t('Готовлю ответ…'),
    queued: turn.ahead ? t('В очереди · перед вами {count}', {count:turn.ahead}) : t('Ответ готов, ждём проектор'),
    delivered: t('Ответ передан на проектор'),
    prepared: t('Готовлюсь говорить…'),
    started: t('Попов говорит у проектора'),
    failed: t(turn.error) || t('Ответ не прозвучал. Вопрос можно повторить.'),
    cancelled: t('Озвучка остановлена. Вопрос можно повторить.'),
    finished: '',
  }[turn.state];
}

export const StationConversation = {
  components: { AppIcon, PortraitImage },
  render: stationConversationRender,
  setup() {
    const admission = storage.get('admission');
    const client = storage.get('client') || randomKey();
    storage.set('client', client);
    let pending;
    try { pending = JSON.parse(storage.get('pending') || 'null'); }
    catch { storage.set('pending', ''); }
    const ui = reactive({
      token: storage.get('token'), online: null, turns: [], remaining: 3,
      question: pending?.text || storage.get('draft'), working: '', error: '', offline: false,
      audioOpen: false, recording: false, clip: '',
    });
    const transcript = ref(null), input = ref(null), upload = ref(null);
    const clock = ref(Date.now());
    let serverOffset = 0;
    let expiry = (Number(admission.split('.')[0]) + 1) * 120000;
    const active = computed(() => ui.turns.some(turn => !terminal.has(turn.state)));
    const valid = computed(() => /^\d+\.[a-f\d]{64}$/.test(admission) && clock.value < expiry);
    const available = computed(() => ui.token && ui.online && valid.value && ui.remaining > 0 && !active.value);
    const access = computed(() => {
      if (!admission) return t('Отсканируйте QR-код на экране Попова, чтобы начать разговор.');
      if (!valid.value) return t('Время доступа истекло. Отсканируйте новый QR-код на экране Попова.');
      if (ui.token && !ui.remaining && !active.value) return t('Три вопроса использованы. Для нового разговора отсканируйте следующий QR-код.');
      if (!ui.token) return t('Ответ прозвучит у проектора. За один разговор можно задать три вопроса.');
      return t('Осталось вопросов: {count} из 3', {count:ui.remaining});
    });
    const connection = computed(() => {
      if (ui.offline) return t('Связь с площадкой прервана');
      if (ui.online === null) return t('Проверяем связь…');
      return ui.online ? t('Проектор на связи') : t('Проектор не на связи');
    });

    const life = new AbortController();
    let timer, ticker, poll, clip, microphone, recorder, recordingTimer;
    async function api(path, body, signal = life.signal) {
      const multipart = body instanceof FormData;
      const headers = ui.token ? { Authorization: 'Bearer ' + ui.token } : {};
      if (body && !multipart) headers['Content-Type'] = 'application/json';
      const response = await fetch('./api/' + path, {
        method: body ? 'POST' : 'GET', headers, cache: 'no-store',
        signal: AbortSignal.any([signal, AbortSignal.timeout(multipart ? 55000 : 8000)]),
        body: multipart ? body : body && JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(typeof data.error === 'string' ? data.error : t('Проверьте запрос.')), {
          status: response.status,
        });
      }
      return data;
    }

    function accept(data) {
      if (Number.isFinite(data.server_time)) serverOffset = data.server_time * 1000 - Date.now();
      if (Number.isFinite(data.expires_at)) expiry = data.expires_at * 1000;
      clock.value = Date.now() + serverOffset;
      ui.online = data.online;
      ui.offline = false;
      if (data.token) storage.set('token', ui.token = data.token);
      if (!data.turns) return;
      ui.remaining = data.remaining;
      ui.turns = data.turns;
      if (pending && data.turns.some(turn => turn.key === pending.key)) {
        if (ui.question.trim() === pending.text) draft('');
        pending = null;
        storage.set('pending', '');
      }
    }

    function schedule(delay) {
      clearTimeout(timer);
      if (!life.signal.aborted) timer = setTimeout(refresh, delay);
    }
    async function refresh() {
      if (ui.working || poll || life.signal.aborted) return;
      const request = new AbortController();
      poll = request;
      try {
        const data = await api(ui.token ? 'session' : 'site', undefined, AbortSignal.any([request.signal, life.signal]));
        if (!request.signal.aborted && !life.signal.aborted) accept(data);
      } catch (err) {
        if (request.signal.aborted || life.signal.aborted) return;
        if (err.status === 401) {
          storage.set('token', ui.token = '');
          ui.error = t(err.message);
        } else {
          ui.online = false;
          ui.offline = true;
        }
      } finally {
        if (poll === request) {
          poll = null;
          schedule(active.value || pending ? 700 : 2400);
        }
      }
    }

    async function perform(phase, action) {
      if (ui.working || life.signal.aborted) return;
      clearTimeout(timer);
      poll?.abort();
      poll = null;
      ui.working = phase;
      ui.error = '';
      try { await action(); }
      catch (err) {
        if (!life.signal.aborted) ui.error = err.status ? t(err.message)
          : t('Связь с площадкой прервана. Попробуйте ещё раз.');
      } finally {
        if (!life.signal.aborted) {
          ui.working = '';
          schedule(0);
        }
      }
    }

    function draft(text) {
      ui.question = text;
      storage.set('draft', text);
    }
    async function pick(question) {
      draft(question);
      await nextTick();
      input.value?.focus();
    }
    function join() {
      if (!valid.value || !ui.online) return;
      return perform(t('Подключаемся…'), async () => {
        accept(await api('start', {admission, client_id: client, language: locale()}));
      });
    }
    function submit() {
      const text = ui.question.trim();
      if (!text || !available.value || ui.working || ui.recording) return;
      if (pending?.text !== text) {
        pending = {text, key: randomKey()};
        storage.set('pending', JSON.stringify(pending));
      }
      return perform(t('Отправляем вопрос…'), async () => {
        accept(await api('question', {...pending, language:locale()}));
      });
    }
    function retry(turn) {
      if (!available.value) return;
      draft(turn.question);
      void submit();
    }

    function clearClip() {
      clip = null;
      if (ui.clip) URL.revokeObjectURL(ui.clip);
      ui.clip = '';
      if (upload.value) upload.value.value = '';
    }
    function setClip(blob, fileName) {
      clearClip();
      if (!blob?.size || blob.size > maxRecording) {
        ui.error = t('Выберите аудиозапись размером до 10 МБ.');
        return;
      }
      clip = {blob, fileName};
      ui.clip = URL.createObjectURL(blob);
      ui.error = '';
    }
    function stopRecording() {
      clearTimeout(recordingTimer);
      if (recorder?.state === 'recording') recorder.stop();
      microphone?.getTracks().forEach(track => track.stop());
    }
    function toggleAudio() {
      ui.audioOpen = !ui.audioOpen;
      if (!ui.audioOpen) {
        stopRecording();
        clearClip();
      }
    }
    async function record() {
      if (ui.recording) { stopRecording(); return; }
      if (!available.value || ui.working || !hasMic) return;
      ui.working = t('Запрашиваем микрофон…');
      ui.error = '';
      try {
        microphone = await navigator.mediaDevices.getUserMedia({audio: true});
        if (life.signal.aborted || !ui.audioOpen || !available.value) { stopRecording(); return; }
        const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
          .find(type => MediaRecorder.isTypeSupported(type));
        const capture = new MediaRecorder(microphone, mime ? {mimeType: mime} : {});
        recorder = capture;
        const chunks = [];
        capture.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        capture.onstop = () => {
          ui.recording = false;
          capture.stream.getTracks().forEach(track => track.stop());
          if (ui.audioOpen && !life.signal.aborted) {
            const ext = capture.mimeType.includes('mp4') ? 'm4a' : capture.mimeType.includes('ogg') ? 'ogg' : 'webm';
            setClip(new Blob(chunks, {type: capture.mimeType}), 'question.' + ext);
          }
        };
        capture.start();
        ui.recording = true;
        recordingTimer = setTimeout(stopRecording, 19500);
      } catch {
        stopRecording();
        ui.error = t('Микрофон недоступен. Можно загрузить запись или написать вопрос.');
      } finally {
        ui.working = '';
        schedule(0);
      }
    }
    function uploadClip(event) {
      const file = event.target.files?.[0];
      if (file) setClip(file, file.name);
    }
    function decode() {
      if (!clip || !available.value) return;
      return perform(t('Распознаём запись…'), async () => {
        const form = new FormData();
        form.append('recording', clip.blob, clip.fileName);
        form.append('language', locale());
        const data = await api('transcribe', form);
        clearClip();
        ui.audioOpen = false;
        await pick(data.text);
      });
    }

    watch(() => ui.turns.map(turn => [turn.key, turn.answer, turn.state, turn.ahead, turn.error]).flat().join(';'), () => {
      const log = transcript.value;
      if (!log || log.scrollHeight - log.clientHeight - log.scrollTop > 72) return;
      nextTick(() => { if (log.isConnected) log.scrollTop = log.scrollHeight; });
    });
    onMounted(() => {
      void refresh();
      ticker = setInterval(() => { clock.value = Date.now() + serverOffset; }, 1000);
      window.addEventListener('pagehide', stopRecording, {signal: life.signal});
    });
    onBeforeUnmount(() => {
      life.abort();
      poll?.abort();
      clearTimeout(timer);
      clearInterval(ticker);
      stopRecording();
      clearClip();
    });
    return {ui, sign, t, transcript, input, upload, active, available, valid, access, connection, hasMic,
      guide: localizedGuide(projectorGuide), questions: popovQuestions.map(question => t(question)), turnStatus, draft, pick, join, submit, retry,
      toggleAudio, record, uploadClip, decode, clearClip};
  },
  template: `<section class="conversation station-conversation" data-mode="text" data-guide="popov"
    :data-phase="active ? 'thinking' : 'ready'" :data-joined="!!ui.token" :aria-label="t('Разговор с Поповым у проектора')">
    <header class="conversation-header">
      <a href="#home" class="conversation-back round-control" :aria-label="t('К списку гидов')"><AppIcon name="caret" /></a>
      <div class="conversation-identity"><h1>{{ guide.name }}</h1><p role="status">{{ connection }}</p></div>
    </header>
    <div ref="transcript" class="conversation-log" id="messages" role="log" :aria-label="t('История сообщений')" tabindex="0">
      <div class="conversation-turns">
        <div class="message conversation-greeting"><div class="message-text reply-markdown">{{ guide.greeting }}</div></div>
        <template v-for="turn in ui.turns" :key="turn.key">
          <div class="message user"><span class="message-text">{{ turn.question }}</span></div>
          <div v-if="turn.answer" class="message station-reply"><div class="message-text reply-markdown">{{ turn.answer }}</div></div>
          <div v-if="turnStatus(turn)" class="conversation-waiting" :data-state="turn.state">
            <span v-if="turn.state === 'generating'" class="conversation-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span>{{ turnStatus(turn) }}</span>
            <button v-if="available && (turn.state === 'failed' || turn.state === 'cancelled')" type="button" class="text-link" @click="retry(turn)">{{ t('Повторить') }}</button>
          </div>
        </template>
      </div>
    </div>
    <div v-if="available" class="conversation-topics">
      <div class="conversation-topic-list" role="group" :aria-label="t('Темы для разговора')">
        <button v-for="question in questions" :key="question" type="button" @click="pick(question)">{{ question }}</button>
      </div>
    </div>
    <div v-if="ui.token" class="conversation-avatar" aria-hidden="true">
      <div class="avatar-frame"><div class="avatar-image"><PortraitImage :guide="guide" use-archive /></div></div>
    </div>
    <div class="conversation-composer">
      <p class="station-access">{{ access }}</p>
      <button v-if="!ui.token && valid" type="button" class="button primary station-join"
        :disabled="!ui.online || !!ui.working" @click="join">{{ t('Начать разговор') }}</button>
      <template v-if="ui.token">
        <form class="conversation-form" id="askForm" @submit.prevent="submit">
          <input ref="input" id="question" :value="ui.question" @input="draft($event.target.value)" :aria-label="t('Ваш вопрос')"
            :placeholder="t('Напишите вопрос…')" maxlength="500" required autocomplete="off" enterkeyhint="send">
          <button type="button" class="round-control station-record-toggle" :aria-label="t('Аудиовопрос')"
            :aria-expanded="ui.audioOpen" :disabled="!available && !ui.audioOpen" @click="toggleAudio"><AppIcon :markup="sign('mic')" /></button>
          <button type="submit" id="sendQuestion" class="round-control conversation-send" :aria-label="t('Отправить вопрос')"
            :disabled="!available || !ui.question.trim() || !!ui.working || ui.recording"><AppIcon :markup="sign('send')" /></button>
        </form>
        <section v-if="ui.audioOpen" class="station-audio" :aria-label="t('Аудиовопрос')">
          <div class="station-audio-actions">
            <button v-if="hasMic" class="button" type="button" :disabled="(!available || !!ui.working) && !ui.recording"
              @click="record">{{ t(ui.recording ? 'Остановить запись' : 'Записать до 20 секунд') }}</button>
            <button class="button" type="button" :disabled="!available || !!ui.working || ui.recording" @click="upload.click()">{{ t('Загрузить запись') }}</button>
            <input ref="upload" hidden type="file" accept="audio/*,video/mp4,video/webm" @change="uploadClip">
          </div>
          <p v-if="!hasMic" class="station-access">{{ t('Для записи микрофона нужен HTTPS. Здесь можно загрузить запись.') }}</p>
          <template v-if="ui.clip">
            <audio controls :src="ui.clip" :aria-label="t('Прослушать запись')"></audio>
            <div class="station-audio-actions">
              <button type="button" class="button primary" :disabled="!available || !!ui.working" @click="decode">{{ t('Распознать запись') }}</button>
              <button type="button" class="button" @click="clearClip">{{ t('Удалить') }}</button>
            </div>
          </template>
        </section>
      </template>
      <p v-if="ui.error" class="conversation-error" role="alert">{{ ui.error }}</p>
      <p v-if="ui.working" class="station-access" role="status">{{ ui.working }}</p>
    </div>
  </section>`,
};
