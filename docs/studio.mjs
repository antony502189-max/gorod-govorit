import { icon } from './icons.mjs?v=river-design';
import { sources } from './data.mjs?v=river-design';

const appearances = [
  ['writer', 'Писатель'],
  ['guide', 'Проводник'],
  ['fox', 'Лис'],
  ['custom', 'Свой герой'],
];
const voices = [
  ['calm', 'Спокойный рассказчик'],
  ['friendly', 'Дружелюбный проводник'],
];

function options(choices, selected) {
  return choices.map(([value, label]) =>
    `<option value="${value}"${selected === value ? ' selected' : ''}>${label}</option>`
  ).join('');
}

function profile(guide, portrait, escape) {
  return `<form id="guideForm" class="studio-profile">
    <section class="studio-media" aria-labelledby="studioPortraitTitle">
      ${portrait(guide, 'studio-portrait')}
      <div class="studio-photo-tools">
        <h2 id="studioPortraitTitle">Портрет</h2>
        <label class="studio-button studio-upload">
          ${icon('plus')} <span>${guide.image ? 'Заменить фото' : 'Загрузить фото'}</span>
          <input type="file" id="avatarUpload" accept="image/png,image/jpeg,image/webp" aria-describedby="studioPhotoHint">
        </label>
        <p class="studio-note" id="studioPhotoHint">PNG, JPEG или WebP · до 1 МБ</p>
        ${guide.image ? '<button type="button" class="studio-text-button" id="resetImage">Вернуть стандартный образ</button>' : ''}
      </div>
    </section>

    <div class="studio-edit">
      <section class="studio-fields" aria-labelledby="studioProfileTitle">
        <h2 id="studioProfileTitle">Профиль</h2>
        <div class="studio-pair">
          <label class="studio-field">
            <span>Имя персонажа</span>
            <input name="name" required maxlength="60" value="${escape(guide.name)}">
          </label>
          <label class="studio-field">
            <span>Роль</span>
            <input name="role" required maxlength="100" value="${escape(guide.role)}">
          </label>
        </div>
        <label class="studio-field">
          <span>Приветствие</span>
          <textarea name="greeting" rows="3" required maxlength="500">${escape(guide.greeting)}</textarea>
        </label>
      </section>

      <details class="studio-details">
        <summary>${icon('studio')}<span>Голос и оформление</span>${icon('caret')}</summary>
        <div class="studio-details-content">
          <div class="studio-pair">
            <label class="studio-field">
              <span>Характер голоса</span>
              <select name="voice" aria-describedby="studioVoiceHint">${options(voices, guide.voice)}</select>
              <small id="studioVoiceHint">Используется русский голос браузера</small>
            </label>
            <label class="studio-field">
              <span>Базовый образ</span>
              <select name="art">${options(appearances, guide.art)}</select>
            </label>
          </div>
          <div class="studio-pair studio-colors">
            <label class="studio-field">
              <span>Категория</span>
              <input name="tag" maxlength="60" value="${escape(guide.tag)}">
            </label>
            <label class="studio-field">
              <span>Цвет фона</span>
              <input type="color" name="color" value="${escape(guide.color)}">
            </label>
          </div>
        </div>
      </details>

      <details class="studio-details studio-manage">
        <summary>${icon('more')}<span>Управление персонажем</span>${icon('caret')}</summary>
        <div class="studio-details-content studio-actions">
          <button type="button" class="studio-button" id="exportGuide">Экспорт JSON</button>
          <button type="button" class="studio-button" id="duplicateGuide">Дублировать</button>
          <button type="button" class="studio-button studio-danger" id="deleteGuide">Удалить персонажа</button>
        </div>
      </details>

      <div class="studio-save">
        <div id="guideError" class="error" role="alert"></div>
        <button type="submit" class="studio-button studio-primary">Сохранить персонажа${icon('check')}</button>
      </div>
    </div>
  </form>`;
}

function material(doc, escape) {
  const text = doc.text.trim().replace(/\s+/g, ' ');
  const excerpt = text.length > 130 ? text.slice(0, 130).replace(/\s+\S*$/, '') + '…' : text;
  return `<li class="studio-material">
    <div class="studio-material-content">
      <h3>${escape(doc.title)}</h3>
      <p class="studio-material-excerpt">${escape(excerpt)}</p>
      <p class="studio-note">${escape(sources[doc.source]?.title || doc.source)}${doc.checkedAt ? ` · проверено ${escape(doc.checkedAt)}` : ''}</p>
    </div>
    <button type="button" class="studio-button studio-material-edit" data-doc="${escape(doc.id)}" aria-label="Изменить ${escape(doc.title)}">Изменить</button>
  </li>`;
}

function knowledge(guide, escape) {
  return `<section class="studio-knowledge" aria-labelledby="studioKnowledgeTitle">
    <header class="studio-knowledge-header">
      <h2 id="studioKnowledgeTitle">База знаний</h2>
      <button type="button" class="studio-button studio-primary" id="addDoc" aria-label="Добавить материал">${icon('plus')}<span>Материал</span></button>
    </header>
    ${guide.docs.length ? `<ul class="studio-materials">${guide.docs.map(doc => material(doc, escape)).join('')}</ul>` : `
      <div class="studio-empty">
        <strong>Пока нет материалов</strong>
        <p>Добавьте первый факт с источником, чтобы гид мог на него опираться.</p>
      </div>
    `}
  </section>`;
}

function preview(guide, portrait, escape) {
  return `<section class="studio-preview" aria-label="Предпросмотр персонажа">
    <div class="studio-preview-stage" style="--studio-preview-color:${escape(guide.color)}">${portrait(guide, 'studio-portrait')}</div>
    <div class="studio-preview-content">
      <div class="studio-preview-identity">
        <h3>${escape(guide.name)}</h3>
        <p>${escape(guide.role)}</p>
      </div>
      <blockquote class="studio-preview-greeting">${escape(guide.greeting)}</blockquote>
      <div class="studio-actions">
        <button type="button" class="studio-button studio-primary" id="previewChatFromCard">Проверить диалог${icon('chat')}</button>
        <button type="button" class="studio-button" id="screenStudio">Экран посетителя${icon('screen')}</button>
      </div>
    </div>
  </section>`;
}

export function studioPage({ guide, guides, tab, portrait, escape }) {
  const tabs = [['profile', 'Образ'], ['knowledge', 'Знания'], ['preview', 'Просмотр']];
  const content = tab === 'profile' ? profile(guide, portrait, escape)
    : tab === 'knowledge' ? knowledge(guide, escape) : preview(guide, portrait, escape);
  return `<section class="guide-studio" aria-labelledby="studioTitle">
    <header class="studio-heading">
      <h1 id="studioTitle">Студия гида</h1>
      <button type="button" class="studio-button studio-create" id="newGuide" aria-label="Новый персонаж" title="Новый персонаж">${icon('plus')}<span>Новый гид</span></button>
    </header>
    <div class="studio-toolbar">
      <div class="studio-picker">
        <label for="guidePicker">Персонаж</label>
        <select id="guidePicker">${guides.map(item =>
          `<option value="${escape(item.id)}"${item.id === guide.id ? ' selected' : ''}>${escape(item.id === guide.id ? guide.name : item.name)}</option>`
        ).join('')}</select>
        <button type="button" class="studio-button studio-open-chat" id="previewChat" aria-label="Проверить диалог" title="Проверить диалог">${icon('chat')}</button>
      </div>
      <div id="studioStatusSlot"></div>
    </div>
    <div class="studio-tabs" role="tablist" aria-label="Настройка персонажа">${tabs.map(([id, label]) =>
      `<button type="button" id="studio-${id}" role="tab" aria-selected="${tab === id}" aria-controls="studioPanel" tabindex="${tab === id ? 0 : -1}" data-studio-tab="${id}">${label}${id === 'knowledge' ? ` <span>${guide.docs.length}</span>` : ''}</button>`
    ).join('')}</div>
    <div id="studioPanel" role="tabpanel" aria-labelledby="studio-${tab}">${content}</div>
  </section>`;
}

export function materialEditor(doc, editing, escape) {
  const knownSource = sources[doc.source];
  return `<div class="modal-backdrop">
    <section class="modal-card studio-material-editor" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <header class="studio-modal-heading">
        <h2 id="modalTitle">${editing ? 'Редактировать материал' : 'Добавить материал'}</h2>
        <button type="button" class="studio-button" id="closeModal" aria-label="Закрыть">${icon('close')}</button>
      </header>
      <form id="docForm">
        <label class="studio-field">
          <span>Название</span>
          <input name="title" required maxlength="150" value="${escape(doc.title)}">
        </label>
        <label class="studio-field">
          <span>Проверенный текст</span>
          <textarea name="text" rows="5" required maxlength="6000">${escape(doc.text)}</textarea>
        </label>
        <div class="studio-pair">
          <label class="studio-field">
            <span>Название источника</span>
            <input name="source" required maxlength="300" value="${escape(knownSource?.title || doc.source)}">
          </label>
          <label class="studio-field">
            <span>Дата проверки</span>
            <input name="checkedAt" type="date" value="${escape(doc.checkedAt)}">
          </label>
        </div>
        <label class="studio-field">
          <span>Ссылка на источник</span>
          <input name="url" type="url" placeholder="https://…" maxlength="2000" value="${escape(doc.url || knownSource?.url)}">
        </label>
        <label class="studio-field">
          <span>Ключевые слова</span>
          <input name="tags" maxlength="500" placeholder="Например: выставка, кремль" value="${escape(doc.tags)}">
        </label>
        <div class="error" id="docError" role="alert"></div>
        <div class="studio-actions studio-material-save">
          <button class="studio-button studio-primary" type="submit">Сохранить материал</button>
          ${editing ? '<button type="button" class="studio-button studio-danger" id="deleteDoc">Удалить</button>' : ''}
        </div>
      </form>
    </section>
  </div>`;
}
