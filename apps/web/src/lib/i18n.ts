export type Locale = "en" | "ru";

const STORAGE_KEY = "gachify:locale";

const messages: Record<Locale, Record<string, string>> = {
  en: {
    "nav.home": "Home",
    "nav.search": "Search",
    "nav.library": "Your Library",
    "nav.discover": "Discover",
    "nav.charts": "Top this week",
    "nav.party": "Listening party",
    "nav.following": "Following",
    "nav.creator": "Creator",
    "nav.upload": "Upload",
    "nav.profile": "My profile",
    "nav.library_short": "Library",
    "nav.charts": "Charts",
    "nav.party": "Party",
    "settings.language": "Language",
    "settings.shortcuts": "Keyboard shortcuts",
    "player.queue": "Queue",
    "library.liked": "Liked songs",
    "library.sort.recent": "Recently added",
    "library.sort.title": "A–Z",
    "library.sort.duration": "Duration",
    "settings.queueSync": "Sync queue across devices",
    "settings.queueSyncHint": "Restore queue and position when you log in on another device.",
    "home.quick.heading": "Explore",
    "home.quick.charts.title": "Top this week",
    "home.quick.charts.desc": "Weekly chart — top 50 remixes",
    "home.quick.party.title": "Listening party",
    "home.quick.party.desc": "Jam together in sync",
    "home.quick.discover.title": "Discover",
    "home.quick.discover.desc": "Filters, moods & karaoke",
    "home.quick.nowPlayingHint": "Tip: tap the track bar at the bottom for waveform, EQ, sleep timer & speed.",
    "player.openExpanded": "Expanded player",
  },
  ru: {
    "nav.home": "Главная",
    "nav.search": "Поиск",
    "nav.library": "Медиатека",
    "nav.discover": "Обзор",
    "nav.charts": "Топ недели",
    "nav.party": "Слушаем вместе",
    "nav.following": "Подписки",
    "nav.creator": "Креатор",
    "nav.upload": "Загрузка",
    "nav.profile": "Профиль",
    "nav.library_short": "Медиатека",
    "nav.charts": "Топ",
    "nav.party": "Jam",
    "settings.language": "Язык",
    "settings.shortcuts": "Горячие клавиши",
    "player.queue": "Очередь",
    "library.liked": "Лайки",
    "library.sort.recent": "Недавние",
    "library.sort.title": "А–Я",
    "library.sort.duration": "Длительность",
    "settings.queueSync": "Синхронизация очереди",
    "settings.queueSyncHint": "Восстанавливать очередь и позицию при входе на другом устройстве.",
    "home.quick.heading": "Разделы",
    "home.quick.charts.title": "Топ недели",
    "home.quick.charts.desc": "Чарт — 50 лучших ремиксов",
    "home.quick.party.title": "Jam-сессия",
    "home.quick.party.desc": "Слушаем вместе в синхроне",
    "home.quick.discover.title": "Обзор",
    "home.quick.discover.desc": "Фильтры, настроения, караоке",
    "home.quick.nowPlayingHint": "Подсказка: нажми на полоску плеера внизу — waveform, EQ, таймер сна и скорость.",
    "player.openExpanded": "Расширенный плеер",
  },
};

export function getLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "ru" || stored === "en") return stored;
  const lang = navigator.language.toLowerCase();
  return lang.startsWith("ru") ? "ru" : "en";
}

export function setLocale(locale: Locale) {
  localStorage.setItem(STORAGE_KEY, locale);
  document.documentElement.lang = locale;
}

export function t(key: string, locale: Locale = getLocale()): string {
  return messages[locale][key] ?? messages.en[key] ?? key;
}

export function initLocale() {
  document.documentElement.lang = getLocale();
}
