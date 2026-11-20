import { guidePortraitRender, appHeaderRender, appNavigationRender, guideCardRender, guideCatalogueRender, mapPageRender, aboutPageRender, visitorScreenRender, statisticsPageRender } from './vue-renders.mjs';
import { createStaticVNode, defineComponent, h } from './vendor/vue.esm-browser.prod.mjs';
import { icon } from './icons.mjs?v=river-design';

const illustrations = { writer: 'gorky', guide: 'nika', fox: 'boris' };
const archivePortraitPath = id => './assets/guide-portraits/' + id + '.webp';

export const AppIcon = defineComponent({
  props: { name: String, markup: String },
  setup(props) {
    return () => createStaticVNode(props.markup || icon(props.name), 1);
  },
});

export const PortraitImage = defineComponent({
  props: { guide: { type: Object, required: true }, useArchive: Boolean },
  setup(props) {
    return () => {
      const guide = props.guide;
      const illustration = Object.hasOwn(illustrations, guide.art) ? illustrations[guide.art] : 'nika';
      const archive = props.useArchive || (!guide.image && guide.id === 'gorky');
      const source = archive ? archivePortraitPath(guide.id) : guide.image || './assets/illustrations/' + illustration + '.webp';
      return h('img', {
        class: archive ? 'archival-portrait' : guide.image ? 'uploaded-portrait' : 'illustrated-portrait',
        src: source,
        alt: guide.name,
        decoding: 'async',
      });
    };
  },
});

export const GuidePortrait = {
  props: ['guide', 'extra'],
  components: { PortraitImage },
  render: guidePortraitRender,
  template: `<div :class="['portrait', extra]" :style="{ '--portrait': guide.color }">
    <PortraitImage :guide="guide" />
  </div>`,
};

export const AppHeader = {
  render: appHeaderRender,
  template: `
    <a href="#home" class="brand" aria-label="Город говорит, главная">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M5 36 17 30V15l7-10 7 10v15l12 6-19 7z" fill="currentColor" />
        <path d="M22 17v12m5-12v12M5 37l19-5 19 5" stroke="#cce3ff" stroke-width="2" />
      </svg>
      <span>Город говорит<small class="brand-light">Нижний Новгород</small></span>
    </a>
  `,
};

const sections = [
  { route: 'home', label: 'Главная', icon: 'home' },
  { route: 'map', label: 'Карта', icon: 'map' },
  { route: 'about', label: 'Ещё', icon: 'more' },
];

export const AppNavigation = {
  props: ['page'],
  components: { AppIcon },
  setup() { return { sections }; },
  render: appNavigationRender,
  template: `
    <a v-for="section in sections" :key="section.route"
       :href="'#' + section.route" :data-nav="section.route"
       :class="{active: section.route === page || (page === 'chat' && section.route === 'home')}"
       :aria-current="section.route === page ? 'page' : (page === 'chat' && section.route === 'home' ? 'location' : null)">
      <AppIcon :name="section.icon" /><span>{{ section.label }}</span>
    </a>
  `,
};

export function highlightNavigation(nav, page) {
  const section = page === 'chat' ? 'home' : page;
  const index = sections.findIndex(item => item.route === section);
  nav.toggleAttribute('data-current', index >= 0);
  if (index >= 0) nav.style.setProperty('--nav-index', index);
}

const GuideCard = {
  props: ['entry'],
  emits: ['choose'],
  components: { AppIcon },
  setup() { return { archivePortraitPath }; },
  render: guideCardRender,
  template: `
    <article :data-guide="entry.id" :class="['guide-card', entry.spotlight ? 'guide-spotlight' : 'guide-compact']">
      <div class="guide-profile">
        <span v-if="entry.spotlight && entry.category" class="guide-tag">{{ entry.category }}</span>
        <div class="guide-title">
          <h2>{{ entry.name }}</h2>
          <span v-if="!entry.spotlight && entry.category" class="guide-tag">{{ entry.category }}</span>
        </div>
      </div>
      <div aria-hidden="true" class="guide-portrait" :data-portrait-for="entry.id">
        <img class="guide-archive-portrait" :src="archivePortraitPath(entry.id)" alt="" decoding="async">
      </div>
      <div v-if="entry.spotlight" class="guide-profile-actions" aria-hidden="true"><span class="guide-talk">Поговорить</span></div>
      <component :is="entry.direct ? 'a' : 'button'" class="guide-card-open"
          :href="entry.direct ? '#' + entry.id : null" :type="entry.direct ? null : 'button'"
          :data-chat="entry.direct ? null : entry.id" :aria-label="'Поговорить: ' + entry.name"
          @click="entry.direct || $emit('choose', entry.id)">
        <span class="guide-open-icon" aria-hidden="true"><AppIcon name="arrow" /></span>
      </component>
    </article>
  `,
};

export const GuideCatalogue = {
  props: ['entries'],
  emits: ['choose'],
  components: { GuideCard },
  render: guideCatalogueRender,
  template: `
    <section class="guide-library guide-collection" aria-label="Гиды">
      <GuideCard :entry="entries[0]" @choose="$emit('choose', $event)" />
      <div class="compact-guides">
        <GuideCard v-for="entry in entries.slice(1)" :key="entry.id" :entry="entry" @choose="$emit('choose', $event)" />
      </div>
    </section>
  `,
};

export const MapPage = {
  render: mapPageRender,
  template: '<section class="map-placeholder" aria-label="Карта"></section>',
};

export const AboutPage = {
  components: { AppIcon },
  setup() { return { archivePortraitPath }; },
  render: aboutPageRender,
  template: `
    <article class="about about-project" aria-labelledby="aboutTitle">
      <h1 id="aboutTitle">О проекте</h1>
      <p class="about-intro">«Город говорит» знакомит с историей Нижнего Новгорода через разговор с цифровыми образами людей, связанных с городом.</p>
      <p>Спросите Кузьму Минина, как нижегородцы собрали ополчение, Александра Попова — как работал его радиоприёмник, а Николая Лобачевского — что такое неевклидова геометрия. Максим Горький и Николай Добролюбов расскажут о литературе.</p>
      <p>Выберите собеседника на главной и напишите вопрос в чате.</p>
      <a class="button about-start" href="#home">Выбрать гида <AppIcon name="arrow" /></a>
    </article>
  `,
};

export const VisitorScreen = {
  props: ['guide', 'round'],
  emits: ['format', 'fullscreen', 'reset', 'stop-voice', 'ask'],
  components: { GuidePortrait },
  render: visitorScreenRender,
  template: `
    <section :class="['screen-layout', round ? 'round-format' : 'monitor-format']">
      <div class="screen-top">
        <div><strong>Город говорит</strong><p>Предпросмотр экрана · оборудование не подключено</p></div>
        <a href="#studio" class="button white small">Вернуться в студию</a>
      </div>
      <div class="screen-controls">
        <button class="button white small" id="screenFormat" @click="$emit('format')">{{ round ? 'Формат монитора' : 'Круглый формат' }}</button>
        <button class="button white small" id="fullscreen" @click="$emit('fullscreen')">Во весь экран</button>
        <button class="button white small" id="resetSession" @click="$emit('reset')">Новый посетитель</button>
        <button class="button white small" id="stopVoice" @click="$emit('stop-voice')">Остановить речь</button>
      </div>
      <div id="screenPortrait"><GuidePortrait :guide="guide" /></div>
      <div class="bars" aria-hidden="true"><i v-for="number in 9" :key="number"></i></div>
      <h1>{{ guide.name }}</h1>
      <p class="subtitle">{{ guide.role }} · цифровой образ</p>
      <div class="screen-subtitle" id="screenAnswer" aria-live="polite">{{ guide.greeting }}</div>
      <form class="ask-form" id="askForm" @submit.prevent="$emit('ask', $event)">
        <input id="question" aria-label="Ваш вопрос" placeholder="Задайте вопрос персонажу" maxlength="500" required>
        <button class="button" id="sendQuestion">Спросить</button>
      </form>
      <div id="askError" class="error" role="alert"></div>
      <label style="font-size:13px;color:#c7dedb"><input type="checkbox" id="voiceToggle" style="vertical-align:middle"> Озвучивать ответы</label>
      <p class="note" style="color:#a6c1c6">Круглый предпросмотр иллюстрирует формат LED-дисплея. Синхронизация губ не реализована.</p>
    </section>
  `,
};

export const StatisticsPage = {
  props: ['asks', 'likes'],
  emits: ['export'],
  render: statisticsPageRender,
  template: `
    <div class="page-heading">
      <div>
        <div class="eyebrow muted">Результаты вашей демонстрации</div>
        <h1>Статистика</h1>
        <p>События этой рабочей области. Данные появляются после реальных действий.</p>
      </div>
      <button class="button secondary" id="exportEvents" @click="$emit('export')">Экспорт событий</button>
    </div>
    <div class="metric-grid">
      <div class="metric"><strong>{{ asks }}</strong><span>Заданных вопросов</span></div>
      <div class="metric"><strong>{{ likes }}</strong><span>Полезных ответов</span></div>
    </div>
    <section class="panel">
      <h2>Как проверять гипотезу</h2>
      <p>Пригласите 10 участников. Попросите выбрать гида, задать вопрос и открыть источник ответа. Запишите, кому потребовалась помощь и сколько заняло выполнение.</p>
      <p class="note">Счётчики отражают события, а не число уникальных туристов. Хранятся последние 200 событий; тексты вопросов в статистику не записываются.</p>
      <a href="#home" class="button">Начать проверку</a>
    </section>
  `,
};
