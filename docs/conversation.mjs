import { icon } from './icons.mjs?v=river-design';
import { avatarModels } from './avatar-models.mjs';
import { movePortrait, rememberPortrait, reveal, stopPortraitMotion } from './motion.mjs';
import { plainReply } from './reply-markdown.mjs';

const signs = {
  send: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4V5Zm4 4a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-3 0h6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  play: '<path d="m9 5 11 7-11 7V5Z"/>',
  sources: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  helpful: '<path d="M7 21H4a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h3m0 10h10a2 2 0 0 0 2-1.65l1.23-7A2 2 0 0 0 18.26 10H14V6a3 3 0 0 0-3-3l-4 8v10Z"/>',
  unhelpful: '<path d="M7 3H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3m0-10h10a2 2 0 0 1 2 1.65l1.23 7A2 2 0 0 1 18.26 14H14v4a3 3 0 0 1-3 3l-4-8V3Z"/>',
};

function sign(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${signs[name]}</svg>`;
}

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motionEase = 'cubic-bezier(.16, 1, .3, 1)';

function playMotion(element, frames, options) {
  if (reduceMotion.matches || document.hidden || !element?.animate) return null;
  return element.animate(frames, { easing: motionEase, ...options });
}

function sendMotion(bubble, arrow) {
  playMotion(arrow, [
    { transform: 'translateY(0)', opacity: 1 },
    { transform: 'translateY(-9px)', opacity: 0, offset: .48 },
    { transform: 'translateY(5px)', opacity: 0, offset: .49 },
    { transform: 'translateY(0)', opacity: 1 },
  ], { duration: 210, easing: 'ease-out' });
  return playMotion(bubble, [
    { transform: 'translate(7px, 15px) scale(.88, .76)', opacity: .38 },
    { transform: 'none', opacity: 1 },
  ], { duration: 210 });
}

function answerMotion(answer) {
  const text = answer.querySelector('.message-text');
  if (!text || reduceMotion.matches || document.hidden) return;
  const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
  const lines = Math.round(text.offsetHeight / lineHeight);
  const duration = Math.min(1550, 800 + lines * 110);

  // Reveal the laid-out text with a soft edge, without changing line breaks.
  const mask = {
    maskImage: 'linear-gradient(black calc(50% - .75em), transparent calc(50% + .75em))',
    maskSize: '100% calc(200% + 2em)',
    maskRepeat: 'no-repeat',
  };
  const reveal = playMotion(text, [
    { ...mask, maskPosition: '0 100%' },
    { ...mask, maskPosition: '0 0%' },
  ], { duration, easing: 'cubic-bezier(.19, .42, .42, 1)' });
  if (!reveal) return;

  for (const detail of Array.from(answer.children).slice(1)) {
    playMotion(detail, [
      { opacity: 0, visibility: 'hidden' },
      { opacity: 1, visibility: 'visible' },
    ], { delay: duration - 120, duration: 240, fill: 'backwards' });
  }
}

function waitingMessage() {
  const waiting = document.createElement('div');
  waiting.className = 'conversation-waiting';
  waiting.setAttribute('role', 'status');
  waiting.innerHTML = '<span class="conversation-thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>Ищу ответ</span>';
  return waiting;
}

export function conversationPage({ guide, messages, questions, art, escape, renderMessage }) {
  const look = ['writer', 'guide', 'fox'].includes(guide.art) ? guide.art : 'custom';
  return `<section class="conversation" data-mode="text" data-phase="ready" data-look="${look}" aria-label="Диалог с персонажем">
    <header class="conversation-header">
      <a href="#guides" class="conversation-back round-control" aria-label="К списку гидов" title="К списку гидов">${icon('caret')}</a>
      <button type="button" class="conversation-close round-control" aria-label="Вернуться к чату" title="Вернуться к чату" hidden>${icon('caret')}</button>
      <div class="conversation-identity">
        <h1>${escape(guide.name)}</h1>
        <p>${escape(guide.role)}${guide.id === 'gorky' ? ' · Цифровой образ' : ''}</p>
      </div>
      <div class="conversation-modes" role="group" aria-label="Режим общения">
        <button type="button" data-mode-to="text" aria-pressed="true" aria-label="Чат" title="Чат">Чат</button>
        <button type="button" data-mode-to="voice" aria-pressed="false" aria-label="Голос" title="Голос">Голос</button>
      </div>
    </header>
    <div class="conversation-log" id="messages" role="log" aria-label="История сообщений" tabindex="0">
      <div class="conversation-turns">
        <div class="message conversation-greeting"><span class="message-author">${escape(guide.name)}</span>${escape(guide.greeting)}</div>
        ${messages.map(renderMessage).join('')}
      </div>
    </div>
    <div class="conversation-topics"${questions.length ? '' : ' hidden'}>
      <div class="conversation-topic-list" role="group" aria-label="Темы для разговора">${questions.map(q => `<button type="button" data-question="${escape(q)}">${escape(q)}</button>`).join('')}</div>
    </div>
    <div class="conversation-avatar" aria-hidden="true">
      <div class="avatar-frame">
        <div class="avatar-image">${art(guide)}</div>
      </div>
      <span class="avatar-speaking"><i></i><i></i><i></i></span>
    </div>
    <div class="conversation-composer">
      <form class="conversation-form" id="askForm">
        <input id="question" aria-label="Ваш вопрос" placeholder="Напишите вопрос…" maxlength="500" required autocomplete="off" enterkeyhint="send">
        <button type="submit" class="round-control conversation-send" id="sendQuestion" aria-label="Отправить вопрос" title="Отправить вопрос" disabled>${sign('send')}</button>
      </form>
      <button class="round-control conversation-audio" type="button" id="voiceToggle" aria-label="Озвучивать ответы" title="Озвучивать ответы" aria-pressed="false">${sign('mute')}</button>
      <p id="askError" class="conversation-error" role="alert" hidden></p>
    </div>
    <div class="conversation-voice" hidden>
      <div class="voice-caption" id="voiceCaption" tabindex="0" aria-label="Реплика диалога" hidden></div>
      <div class="voice-actions">
        <button class="voice-talk" type="button" id="micButton">${sign('mic')}<span>Задать вопрос</span></button>
        <button class="round-control voice-replay" type="button" id="replayVoice" aria-label="Прослушать реплику" title="Прослушать реплику">${sign('play')}</button>
      </div>
      <p class="voice-status" id="voiceStatus" role="status">Микрофон выключен</p>
    </div>
  </section>`;
}

const voiceStates = {
  ready: 'Микрофон выключен',
  opening: 'Включаем микрофон…',
  listening: 'Слушаю вас…',
  decoding: 'Распознаю вопрос…',
  thinking: 'Ищу ответ…',
  preparing: 'Готовлю озвучку…',
  speaking: 'Персонаж говорит',
};

const recognitionErrors = {
  'not-allowed': 'Разрешите доступ к микрофону в настройках сайта или продолжите в чате.',
  'service-not-allowed': 'Браузер не разрешил распознавание речи. Продолжите в чате.',
  'audio-capture': 'Микрофон не найден. Подключите его или напишите вопрос в чате.',
  'no-speech': 'Не расслышал вопрос. Нажмите на микрофон и попробуйте ещё раз.',
  network: 'Распознавание не подключилось. Попробуйте ещё раз или напишите в чат.',
  'language-not-supported': 'Браузер не распознаёт русскую речь. Продолжите в чате.',
};

const ratings = new WeakMap();

export function bindConversation(root, { guide, messages, renderMessage, ask, feedback, notify, replySources, openReplySources }) {
  const listeners = new AbortController();
  const { signal } = listeners;
  const $ = selector => root.querySelector(selector);
  const transcript = $('#messages');
  const turns = $('.conversation-turns');
  const form = $('#askForm');
  const questionInput = $('#question');
  const send = $('#sendQuestion');
  const caption = $('#voiceCaption');
  const voiceStatus = $('#voiceStatus');
  const mic = $('#micButton');
  const replay = $('#replayVoice');
  const audio = $('#voiceToggle');
  const error = $('#askError');
  const avatarFrame = $('.avatar-frame');
  const topicButtons = [...root.querySelectorAll('[data-question]')];
  const modeButtons = [...root.querySelectorAll('[data-mode-to]')];
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  const supportsMic = window.isSecureContext && Boolean(Recognition);
  const supportsSpeech = Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
  const micUnavailable = window.isSecureContext
    ? 'Браузер не поддерживает голосовой ввод. Продолжите в чате.'
    : 'Для микрофона откройте сайт по HTTPS или на localhost.';
  let mode = 'text';
  let phase = 'ready';
  let speaking = null;
  let recognition = null;
  let sending = false;
  let autoRead = false;
  let notice = '';
  let model = null;
  let latestAnswer = messages.findLast(message => !message.user) ?? null;

  const on = (target, name, fn) => target.addEventListener(name, fn, { signal });

  function scrollToLatest() {
    transcript.scrollTop = transcript.scrollHeight;
  }

  function showError(text) {
    error.textContent = text;
    error.hidden = !text;
  }

  function setCaption(text) {
    caption.textContent = text;
    caption.scrollTop = 0;
    caption.hidden = !text;
  }

  function updateControls() {
    for (const button of turns.querySelectorAll('[data-read-reply]')) {
      button.disabled = !supportsSpeech || sending;
      const reading = speaking?.button === button;
      const label = reading ? 'Остановить озвучку' : 'Озвучить ответ';
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
        button.title = label;
        button.innerHTML = sign(reading ? 'stop' : 'speaker');
      }
    }
    root.dataset.phase = phase;
    send.disabled = sending || !questionInput.value.trim();
    for (const button of topicButtons) button.disabled = sending;
    mic.disabled = !supportsMic || sending || phase === 'decoding';
    const capturing = phase === 'opening' || phase === 'listening';
    const micLabel = phase === 'opening' ? 'Отменить' : phase === 'listening' ? 'Завершить вопрос' : 'Задать вопрос';
    if (mic.dataset.label !== micLabel) {
      mic.dataset.label = micLabel;
      mic.innerHTML = `${sign(capturing ? 'stop' : 'mic')}<span>${micLabel}</span>`;
    }
    replay.disabled = !supportsSpeech || Boolean(recognition) || sending;
    const replayLabel = speaking ? 'Остановить озвучку' : 'Прослушать реплику';
    if (replay.getAttribute('aria-label') !== replayLabel) {
      replay.setAttribute('aria-label', replayLabel);
      replay.title = replayLabel;
      replay.innerHTML = sign(speaking ? 'stop' : 'play');
    }
    const status = notice || (phase === 'ready' && !supportsMic ? micUnavailable : voiceStates[phase]);
    if (voiceStatus.textContent !== status) voiceStatus.textContent = status;
    voiceStatus.dataset.notice = String(Boolean(notice) || !supportsMic);
  }

  function setPhase(next, message = '') {
    phase = next;
    notice = message;
    updateControls();
  }

  function stopSpeech() {
    if (!speaking) return;
    clearTimeout(speaking.startTimer);
    speaking = null;
    window.speechSynthesis.cancel();
    model?.setSpeaking(false);
    setPhase(sending ? 'thinking' : 'ready');
  }

  function say(text, button = null) {
    if (!text || signal.aborted) return;
    stopSpeech();
    if (!supportsSpeech) {
      const message = 'Озвучка недоступна в этом браузере. Ответ можно прочитать.';
      if (mode === 'voice') setPhase('ready', message);
      else showError(message);
      return;
    }
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    const russianVoice = synth.getVoices().find(voice => /^ru(?:[-_]|$)/i.test(voice.lang));
    if (russianVoice) utterance.voice = russianVoice;
    utterance.lang = 'ru-RU';
    utterance.rate = guide.voice === 'calm' ? .92 : 1.02;
    const playback = { utterance, button, startTimer: null };
    speaking = playback;
    setPhase('preparing');
    const finish = () => {
      if (speaking !== playback) return false;
      clearTimeout(playback.startTimer);
      speaking = null;
      model?.setSpeaking(false);
      setPhase(sending ? 'thinking' : 'ready');
      return true;
    };
    const failed = () => {
      if (!finish()) return;
      const message = 'Не удалось озвучить ответ. Проверьте, доступен ли русский голос.';
      if (mode === 'voice') setPhase('ready', message);
      else showError(message);
    };
    utterance.onstart = () => {
      if (speaking !== playback) return;
      clearTimeout(playback.startTimer);
      model?.setSpeaking(true);
      setPhase('speaking');
    };
    utterance.onboundary = () => {
      if (speaking === playback) model?.accent();
    };
    utterance.onend = finish;
    utterance.onerror = failed;
    playback.startTimer = setTimeout(() => {
      if (speaking !== playback) return;
      failed();
      synth.cancel();
    }, 6500);
    try {
      synth.speak(utterance);
    } catch {
      failed();
    }
  }

  function cancelMic() {
    const session = recognition;
    if (!session) return;
    recognition = null;
    clearTimeout(session.timer);
    try { session.recognizer.abort(); } catch { /* Already stopped. */ }
    setPhase(sending ? 'thinking' : 'ready');
  }

  function addReplyActions(message, reply) {
    const actions = document.createElement('div');
    actions.className = 'reply-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Действия с ответом');

    function action(glyph, label) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.innerHTML = sign(glyph);
      actions.append(button);
      return button;
    }

    const copy = action('copy', 'Скопировать ответ');
    on(copy, 'click', async () => {
      try {
        await navigator.clipboard.writeText(plainReply(reply.text));
        if (!signal.aborted) notify('Ответ скопирован', true);
      } catch {
        if (!signal.aborted) notify('Не удалось скопировать ответ');
      }
    });

    const up = action('helpful', 'Хороший ответ');
    const down = action('unhelpful', 'Плохой ответ');
    function paintRating() {
      up.setAttribute('aria-pressed', String(ratings.get(reply) === 'helpful'));
      down.setAttribute('aria-pressed', String(ratings.get(reply) === 'unhelpful'));
    }
    let savingRating = false;
    async function rate(value) {
      const previous = ratings.get(reply);
      if (savingRating || previous === value) return;
      savingRating = true;
      ratings.set(reply, value);
      paintRating();
      try {
        await feedback(reply, value);
      } catch {
        ratings.set(reply, previous);
        paintRating();
      } finally {
        savingRating = false;
      }
    }
    paintRating();
    on(up, 'click', () => void rate('helpful'));
    on(down, 'click', () => void rate('unhelpful'));

    const read = action('speaker', 'Озвучить ответ');
    read.dataset.readReply = '';
    read.disabled = !supportsSpeech;
    on(read, 'click', () => {
      if (speaking?.button === read) stopSpeech();
      else say(plainReply(reply.text), read);
    });
    const sources = replySources(reply);
    if (sources.length) {
      const button = action('sources', 'Источники');
      button.className = 'reply-sources-button';
      button.setAttribute('aria-haspopup', 'dialog');
      button.insertAdjacentHTML('beforeend', '<span>Источники</span>');
      on(button, 'click', () => openReplySources(sources));
    }
    message.append(actions);
  }

  async function sendQuestion(value, spoken = false) {
    const question = value.trim();
    if (!question || question.length > 500 || sending) return;
    stopSpeech();
    sending = true;
    showError('');
    if (!spoken) questionInput.value = '';
    const user = { user: true, text: question };
    turns.insertAdjacentHTML('beforeend', renderMessage(user));
    const bubble = turns.lastElementChild;
    const outgoing = mode === 'text' ? sendMotion(bubble, spoken ? null : send.firstElementChild) : null;
    const waiting = waitingMessage();
    turns.append(waiting);
    if (mode === 'voice') setCaption(question);
    setPhase('thinking');
    scrollToLatest();
    let reply;
    try {
      reply = await ask(question);
      if (signal.aborted) return;
      if (!reply) {
        bubble.remove();
        questionInput.value ||= question;
        return;
      }
      // The request runs immediately, alongside the motion of the sent message.
      if (outgoing && mode === 'text' && !document.hidden) await outgoing.finished.catch(() => {});
      if (signal.aborted) return;
      const followLatest = transcript.scrollHeight - transcript.clientHeight - transcript.scrollTop < 64;
      messages.push(user, reply);
      latestAnswer = reply;
      waiting.insertAdjacentHTML('beforebegin', renderMessage(reply));
      const latestBubble = waiting.previousElementSibling;
      waiting.remove();
      addReplyActions(latestBubble, reply);
      if (mode === 'voice') {
        setCaption(plainReply(reply.text));
        reveal(caption, { duration: 210, distance: 4 });
      } else if (followLatest) {
        if (latestBubble.offsetHeight > transcript.clientHeight - 24) {
          transcript.scrollTop += latestBubble.getBoundingClientRect().top - transcript.getBoundingClientRect().top - 12;
        } else {
          scrollToLatest();
        }
        answerMotion(latestBubble);
      }
    } catch (cause) {
      if (signal.aborted) return;
      bubble.remove();
      questionInput.value ||= question;
      setCaption(question);
      const message = cause.name === 'TimeoutError' ? 'Ответ задерживается. Попробуйте ещё раз.' : cause.message;
      showError(message);
      notice = message;
    } finally {
      if (!signal.aborted) {
        sending = false;
        waiting.remove();
        setPhase('ready', notice);
      }
    }
    if (reply && !signal.aborted && (mode === 'voice' || autoRead)) say(plainReply(reply.text));
  }

  function startMic() {
    if (!supportsMic || sending || recognition) return;
    stopSpeech();
    notice = '';
    setCaption('');
    let recognizer;
    try {
      recognizer = new Recognition();
    } catch {
      setPhase('ready', 'Микрофон не запустился. Попробуйте ещё раз или продолжите в чате.');
      return;
    }
    recognizer.lang = 'ru-RU';
    recognizer.continuous = false;
    recognizer.interimResults = true;
    const session = { recognizer, timer: null, text: '', interim: '', stopped: false, error: '' };
    recognition = session;
    setPhase('opening');
    const settle = () => {
      if (recognition !== session) return;
      recognition = null;
      clearTimeout(session.timer);
      if (session.error) {
        setPhase('ready', session.error);
        return;
      }
      const question = session.text || (session.stopped ? session.interim : '');
      if (!question) {
        setPhase('ready', recognitionErrors['no-speech']);
        return;
      }
      if (question.length > 500) {
        setPhase('ready', 'Слишком длинный вопрос. Попробуйте задать его короче.');
        return;
      }
      void sendQuestion(question, true);
    };
    recognizer.onstart = () => {
      if (recognition === session) setPhase('listening');
    };
    recognizer.onresult = event => {
      if (recognition !== session) return;
      const results = Array.from(event.results);
      session.text = results.filter(result => result.isFinal).map(result => result[0].transcript).join(' ').trim();
      session.interim = results.map(result => result[0].transcript).join(' ').trim();
      setCaption(session.interim);
    };
    recognizer.onerror = event => {
      session.error = recognitionErrors[event.error] || 'Не удалось распознать речь. Попробуйте ещё раз.';
      settle();
    };
    recognizer.onend = settle;
    session.timer = setTimeout(() => {
      if (recognition !== session) return;
      cancelMic();
      setPhase('ready', 'Не удалось завершить запись. Попробуйте ещё раз.');
    }, 25000);
    try {
      recognizer.start();
    } catch {
      session.error = 'Микрофон не запустился. Попробуйте ещё раз или продолжите в чате.';
      settle();
    }
  }

  function changeMode(next) {
    if (next === mode || signal.aborted) return;
    const portrait = avatarFrame.querySelector('.avatar-image > :is(svg, img)');
    const before = rememberPortrait(avatarFrame.classList.contains('has-model') ? null : portrait);
    questionInput.blur();
    cancelMic();
    stopSpeech();
    mode = next;
    const isVoice = mode === 'voice';
    root.dataset.mode = mode;
    document.body.classList.toggle('voice-conversation', isVoice);
    for (const control of modeButtons) control.setAttribute('aria-pressed', String(control.dataset.modeTo === mode));
    $('.conversation-back').hidden = isVoice;
    $('.conversation-close').hidden = !isVoice;
    transcript.hidden = isVoice;
    $('.conversation-topics').hidden = isVoice || !topicButtons.length;
    $('.conversation-composer').hidden = isVoice;
    $('.conversation-voice').hidden = !isVoice;
    if (isVoice) setCaption(latestAnswer ? plainReply(latestAnswer.text) : '');
    else scrollToLatest();
    setPhase(sending ? 'thinking' : 'ready');
    if (!movePortrait(before, portrait)) reveal(avatarFrame, { duration: 220, distance: 0 });
    if (isVoice) reveal($('.conversation-voice'), { duration: 210, distance: 5 });
  }

  for (const button of modeButtons) {
    on(button, 'click', () => changeMode(button.dataset.modeTo));
  }
  on($('.conversation-close'), 'click', () => {
    changeMode('text');
    modeButtons[0].focus({ preventScroll: true });
  });
  on(document, 'keydown', event => {
    if (event.key !== 'Escape' || mode !== 'voice') return;
    changeMode('text');
    modeButtons[0].focus({ preventScroll: true });
  });
  on(form, 'submit', event => {
    event.preventDefault();
    void sendQuestion(questionInput.value);
  });
  on(questionInput, 'input', () => {
    showError('');
    updateControls();
  });
  for (const button of topicButtons) {
    on(button, 'click', () => void sendQuestion(button.dataset.question));
  }
  on(audio, 'click', () => {
    autoRead = !autoRead;
    audio.setAttribute('aria-pressed', String(autoRead));
    audio.innerHTML = sign(autoRead ? 'speaker' : 'mute');
    showError('');
    if (!autoRead) stopSpeech();
    else if (!sending) say(latestAnswer ? plainReply(latestAnswer.text) : guide.greeting);
  });
  if (!supportsSpeech) audio.hidden = true;
  on(replay, 'click', () => {
    if (speaking) stopSpeech();
    else {
      const text = latestAnswer ? plainReply(latestAnswer.text) : guide.greeting;
      setCaption(text);
      say(text);
    }
  });
  on(mic, 'click', () => {
    if (phase === 'opening') {
      cancelMic();
      return;
    }
    if (recognition) {
      recognition.stopped = true;
      setPhase('decoding');
      try {
        recognition.recognizer.stop();
      } catch {
        cancelMic();
        setPhase('ready', 'Запись уже завершилась. Попробуйте ещё раз.');
      }
    } else {
      startMic();
    }
  });
  on(document, 'visibilitychange', () => {
    root.classList.toggle('conversation-in-background', document.hidden);
    if (!document.hidden) return;
    cancelMic();
    stopSpeech();
  });

  const asset = !guide.image && Object.hasOwn(avatarModels, guide.id) ? avatarModels[guide.id] : null;
  if (asset) {
    import('./avatar-model.mjs').then(async ({ mountAvatar }) => {
      if (signal.aborted) return;
      model = await mountAvatar(avatarFrame, asset, signal);
      if (phase === 'speaking') model?.setSpeaking(true);
    }).catch(() => {
      // The guide's regular portrait stays visible if the 3D scene can't load.
    });
  }

  messages.forEach((message, index) => {
    if (!message.user) addReplyActions(turns.children[index + 1], message);
  });
  updateControls();
  scrollToLatest();

  return {
    destroy() {
      listeners.abort();
      stopPortraitMotion();
      cancelMic();
      stopSpeech();
      model?.dispose();
      document.body.classList.remove('voice-conversation');
    },
  };
}
