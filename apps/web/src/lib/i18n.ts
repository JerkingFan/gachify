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
    "settings.language": "Language",
    "settings.shortcuts": "Keyboard shortcuts",
    "player.queue": "Queue",
    "library.liked": "Liked songs",
    "library.sort.recent": "Recently added",
    "library.sort.title": "A–Z",
    "library.sort.duration": "Duration",
    "settings.queueSync": "Sync queue across devices",
    "settings.queueSyncHint": "Restore queue and position when you log in on another device.",
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
    "settings.language": "Язык",
    "settings.shortcuts": "Горячие клавиши",
    "player.queue": "Очередь",
    "library.liked": "Лайки",
    "library.sort.recent": "Недавние",
    "library.sort.title": "А–Я",
    "library.sort.duration": "Длительность",
    "settings.queueSync": "Синхронизация очереди",
    "settings.queueSyncHint": "Восстанавливать очередь и позицию при входе на другом устройстве.",
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
