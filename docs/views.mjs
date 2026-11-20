import { guidePortraitRender, appHeaderRender, appNavigationRender, guideCardRender, guideCatalogueRender, mapPageRender, aboutPageRender, visitorScreenRender, statisticsPageRender } from './vue-renders.mjs';
import { createStaticVNode, defineComponent, h, onBeforeUnmount, onMounted, ref } from './vendor/vue.esm-browser.prod.mjs';
import { icon } from './icons.mjs?v=river-design';
import { languages, t } from './i18n.mjs';
import { mountProjectionMap, openCoordinates, projectionSites } from './projection-map.mjs';

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
  props: ['showLanguages', 'language'],
  emits: ['language'],
  setup() { return { languages, t }; },
  render: appHeaderRender,
  template: `
    <a href="#home" class="brand" :aria-label="t('Город говорит, главная')">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M5 36 17 30V15l7-10 7 10v15l12 6-19 7z" fill="currentColor" />
        <path d="M22 17v12m5-12v12M5 37l19-5 19 5" stroke="#cce3ff" stroke-width="2" />
      </svg>
      <span>{{ t('Город говорит') }}<small class="brand-light">{{ t('Нижний Новгород') }}</small></span>
    </a>
    <select v-if="showLanguages" class="language-picker" :aria-label="t('Язык приложения')" :value="language"
      @change="$emit('language', $event.target.value)">
      <option v-for="item in languages" :key="item.id" :value="item.id" :lang="item.tag">{{ item.name }}</option>
    </select>
  `,
};

const sections = [
  { route: 'home', label: 'Главная', icon: 'home' },
  { route: 'scan', label: 'Сканировать QR-код', icon: 'qr' },
  { route: 'map', label: 'Карта', icon: 'map' },
];

export const AppNavigation = {
  props: ['page'],
  emits: ['scan'],
  components: { AppIcon },
  setup() { return { sections, t }; },
  render: appNavigationRender,
  template: `
    <template v-for="section in sections" :key="section.route">
      <button v-if="section.route === 'scan'" type="button" class="nav-scan" :aria-label="t(section.label)"
        aria-haspopup="dialog" aria-controls="qr-scanner" @click="$emit('scan')">
        <AppIcon :name="section.icon" />
      </button>
      <a v-else :href="'#' + section.route" :data-nav="section.route"
         :class="{active: section.route === page || (page === 'chat' && section.route === 'home')}"
         :aria-current="section.route === page ? 'page' : (page === 'chat' && section.route === 'home' ? 'location' : null)">
        <AppIcon :name="section.icon" /><span>{{ t(section.label) }}</span>
      </a>
    </template>
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
  setup() { return { archivePortraitPath, t }; },
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
      <div v-if="entry.spotlight" class="guide-profile-actions" aria-hidden="true"><span class="guide-talk">{{ t('Поговорить') }}</span></div>
      <component :is="entry.direct ? 'a' : 'button'" class="guide-card-open"
          :href="entry.direct ? '#' + entry.id : null" :type="entry.direct ? null : 'button'"
          :data-chat="entry.direct ? null : entry.id" :aria-label="t('Поговорить: ') + entry.name"
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
  setup() { return { t }; },
  render: guideCatalogueRender,
  template: `
    <section class="guide-library guide-collection" :aria-label="t('Гиды')">
      <GuideCard :entry="entries[0]" @choose="$emit('choose', $event)" />
      <div class="compact-guides">
        <GuideCard v-for="entry in entries.slice(1)" :key="entry.id" :entry="entry" @choose="$emit('choose', $event)" />
      </div>
    </section>
  `,
};

export const MapPage = {
  components: { AppIcon },
  render: mapPageRender,
  setup() {
    const canvas = ref(null);
    const layer = ref('street');
    const selected = ref(null);
    const status = ref('');
    const ready = ref(false);
    const lifecycle = new AbortController();
    let map;
    function select(index) {
      selected.value = projectionSites[index];
      map?.select(index);
    }
    function basemap(kind) {
      layer.value = kind;
      map?.setLayer(kind);
    }
    function overview() {
      selected.value = null;
      map?.select(null);
      map?.fitAll();
    }
    onMounted(async () => {
      try {
        map = await mountProjectionMap(canvas.value, {
          onSelect: select, onTileStatus: text => { status.value = text; }, signal: lifecycle.signal,
        });
        if (lifecycle.signal.aborted) return;
        const current = projectionSites.findIndex(site => site.id === selected.value?.id);
        if (current >= 0) map.select(current);
        map.setLayer(layer.value);
        ready.value = true;
      } catch {
        if (!lifecycle.signal.aborted) status.value = t('Карта недоступна. Точки можно открыть из списка ниже.');
      }
    });
    onBeforeUnmount(() => lifecycle.abort());
    return {canvas, layer, selected, status, ready, select, basemap, overview,
      sites: projectionSites, openCoordinates, t};
  },
  template: `
    <section class="projection-map" aria-labelledby="projection-map-title">
      <header class="projection-map-heading">
        <h1 id="projection-map-title">{{ t('Нижний Новгород') }}</h1>
        <p>{{ t('Предлагаемые точки проекции') }}</p>
      </header>
      <div class="projection-map-frame">
        <div ref="canvas" class="projection-map-canvas" role="region" :aria-label="t('Карта точек проекции')"></div>
        <div class="projection-map-layers" role="group" :aria-label="t('Вид карты')">
          <button type="button" :aria-pressed="layer === 'street'" @click="basemap('street')">{{ t('Схема') }}</button>
          <button type="button" :aria-pressed="layer === 'satellite'" @click="basemap('satellite')">{{ t('Спутник') }}</button>
        </div>
        <button v-if="ready" type="button" class="projection-map-reset" @click="overview"><AppIcon name="recenter" /> {{ t('Все точки') }}</button>
      </div>
      <p v-if="status" class="projection-map-status" role="status">{{ status }}</p>
      <article v-if="selected" class="projection-location" aria-labelledby="projection-location-title">
        <header>
          <img :src="'./assets/guide-portraits/' + selected.id + '.webp'" alt="">
          <div><h2 id="projection-location-title">{{ t(selected.place) }}</h2><p>{{ t(selected.guide) }}</p></div>
          <button type="button" class="iconbutton" :aria-label="t('Закрыть карточку')" @click="overview"><AppIcon name="close" /></button>
        </header>
        <p class="projection-location-address">{{ t(selected.location) }}</p>
        <p>{{ t(selected.story) }}</p>
        <div class="projection-location-actions">
          <a class="button" :href="openCoordinates(selected)" target="_blank" rel="noopener">{{ t('Открыть в Яндекс Картах') }}</a>
        </div>
      </article>
      <ul class="projection-sites" :aria-label="t('Пять точек проекции')">
        <li v-for="(site, index) in sites" :key="site.id">
          <button type="button" :aria-pressed="selected?.id === site.id" @click="select(index)">
            <span class="projection-site-index" aria-hidden="true">{{ index + 1 }}</span>
            <span class="projection-site-label"><strong>{{ t(site.place) }}</strong><small>{{ t(site.guide) }}</small></span>
            <AppIcon name="caret" />
          </button>
        </li>
      </ul>
    </section>
  `,
};

export const AboutPage = {
  components: { AppIcon },
  setup() { return { archivePortraitPath, t }; },
  render: aboutPageRender,
  template: `
    <article class="about about-project" aria-labelledby="aboutTitle">
      <h1 id="aboutTitle">{{ t('О проекте') }}</h1>
      <p class="about-intro">{{ t('«Город говорит» знакомит с историей Нижнего Новгорода через разговор с цифровыми образами людей, связанных с городом.') }}</p>
      <p>{{ t('Спросите Попова о радиоприёмнике, Чкалова — о перелёте через Северный полюс, Минина — об ополчении. Городовой расскажет о старом Нижнем, а Максим Горький — о литературе.') }}</p>
      <p>{{ t('Выберите собеседника на главной и напишите вопрос в чате.') }}</p>
      <a class="button about-start" href="#home">{{ t('Выбрать гида') }} <AppIcon name="arrow" /></a>
    </article>
  `,
};

export const VisitorScreen = {
  props: ['guide', 'round'],
  emits: ['format', 'fullscreen', 'reset', 'stop-voice', 'ask'],
  components: { GuidePortrait },
  setup() { return { t }; },
  render: visitorScreenRender,
  template: `
    <section :class="['screen-layout', round ? 'round-format' : 'monitor-format']">
      <div class="screen-top">
        <div><strong>{{ t('Город говорит') }}</strong><p>Предпросмотр экрана · оборудование не подключено</p></div>
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
        <input id="question" :aria-label="t('Ваш вопрос')" placeholder="Задайте вопрос персонажу" maxlength="500" required>
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
